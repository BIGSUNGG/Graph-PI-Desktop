/**
 * 감사 실행 배선 테스트(수용기준 46-53). 실제 세션은 띄우지 않고 launch 만 바꿔 끼운다.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createHarnessStore } from '../../../packages/harness/src/store.ts';
import { EMPTY_HARNESS_SNAPSHOT } from '../../shared/contract/index.ts';
import type {
  AuditRecord,
  GoalRecord,
  HarnessRecord,
  HarnessSnapshot,
} from '../../shared/contract/index.ts';
import { runPendingAudits, type AuditRunDeps } from './audit-run.ts';

const AT = '2026-11-25T00:00:00.000Z';

function auditingGoal(id = 'goal-1'): GoalRecord {
  return {
    type: 'goal',
    id,
    groupId: 'g',
    seq: 1,
    at: AT,
    schemaVersion: 1,
    writer: 'hub',
    sessionId: 'hub-session',
    parentListItemId: null,
    parentGoalId: null,
    supersededByGoalId: null,
    objective: '감사 대상',
    acceptanceCriteria: [{ id: 'c1', desc: '빌드 통과', passed: true, evidence: 'npm run build' }],
    status: 'auditing',
    pauseReason: null,
    auditAttemptCount: 0,
    revision: 1,
    loopId: null,
    latestAuditId: null,
    createdAt: AT,
    updatedAt: AT,
    completedAt: null,
    completedRevision: null,
    archivedAt: null,
  };
}

function snapshotWith(records: readonly HarnessRecord[]): HarnessSnapshot {
  const goals: GoalRecord[] = [];
  const audits: AuditRecord[] = [];
  for (const record of records) {
    if (record.type === 'goal') goals.push(record);
    if (record.type === 'audit') audits.push(record);
  }
  return { ...EMPTY_HARNESS_SNAPSHOT, availability: 'ok', groupId: 'g', goals, audits };
}

function makeDeps(overrides: Partial<AuditRunDeps> = {}): {
  deps: AuditRunDeps;
  appended: HarnessRecord[];
  launches: () => number;
} {
  const appended: HarnessRecord[] = [];
  let launches = 0;
  const deps: AuditRunDeps = {
    headCommit: async () => 'abc123',
    launch: async () => {
      launches += 1;
      return { ok: true, sessionId: 'audit-session-1' };
    },
    append: async (_groupId, record) => {
      appended.push(record);
    },
    now: () => '2026-11-25T01:00:00.000Z',
    ...overrides,
  };
  return { deps, appended, launches: () => launches };
}

test('auditing Goal 이면 감사 세션을 띄우고 running 기록을 남긴다', async () => {
  const harness = makeDeps();
  const started = await runPendingAudits('g', snapshotWith([auditingGoal()]), { repoPath: 'C:/repo', model: 'm' }, harness.deps);

  assert.deepEqual(started, ['goal-1']);
  assert.equal(harness.launches(), 1);
  const record = harness.appended[0];
  assert.ok(record !== undefined && record.type === 'audit');
  assert.equal(record.id, 'audit:goal-1:r1');
  assert.equal(record.state, 'running');
  assert.equal(record.commitHash, 'abc123');
  assert.equal(record.auditSessionId, 'audit-session-1');
  assert.equal(record.seq, 2);
});

test('같은 revision 의 감사 기록이 있으면 다시 띄우지 않는다', async () => {
  const first = makeDeps();
  await runPendingAudits('g', snapshotWith([auditingGoal()]), { repoPath: 'C:/repo', model: null }, first.deps);
  const second = makeDeps();
  const started = await runPendingAudits('g', snapshotWith([auditingGoal(), ...first.appended]), { repoPath: 'C:/repo', model: null }, second.deps);

  assert.deepEqual(started, []);
  assert.equal(second.launches(), 0);
});

test('감사 세션 시작이 실패하면 Goal 을 paused(audit_error) 로 남긴다', async () => {
  const harness = makeDeps({ launch: async () => ({ ok: false, error: 'orca 응답 없음' }) });
  const started = await runPendingAudits('g', snapshotWith([auditingGoal()]), { repoPath: 'C:/repo', model: null }, harness.deps);

  assert.deepEqual(started, []);
  const record = harness.appended[0];
  assert.ok(record !== undefined && record.type === 'goal');
  assert.equal(record.status, 'paused');
  assert.equal(record.pauseReason, 'audit_error');
  assert.equal(record.id, 'goal-1');
});

test('실제 JSONL store 로 재생해도 감사 기록이 한 건으로 접힌다', async () => {
  const store = createHarnessStore({ dataDir: mkdtempSync(join(tmpdir(), 'graph-pi-audit-')) });
  const harness = makeDeps({
    append: async (groupId, record) => {
      await store.append(groupId, record);
    },
  });

  await runPendingAudits('g', snapshotWith([auditingGoal()]), { repoPath: 'C:/repo', model: null }, harness.deps);
  const after = await store.snapshot('g');
  await runPendingAudits('g', after, { repoPath: 'C:/repo', model: null }, harness.deps);
  const final = await store.snapshot('g');

  assert.equal(final.audits.length, 1);
  assert.equal(final.audits[0]?.id, 'audit:goal-1:r1');
  assert.equal(harness.launches(), 1);
});
