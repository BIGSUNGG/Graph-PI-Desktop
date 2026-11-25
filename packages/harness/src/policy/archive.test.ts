/**
 * 아카이브 회귀 테스트(SPEC-hub-orchestration §아카이브, acceptance 613행).
 * 고정하는 계약:
 * - 완료·중단 Goal 은 아카이브 목록에 담기고 진행 중 Goal 은 빠진다
 * - Goal 별 Audit verdict 목록은 다른 Goal 을 섞지 않고 seq 오름차순으로 안정적이다
 * - `archiveGoal` 은 `archivedAt` 만 채우고, 두 번 호출해도 처음 시각을 유지한다(멱등)
 * 실행: `node --test packages/harness/src/policy/archive.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AuditRecord, GoalRecord } from '../../../../src/shared/contract/harness.ts';
import { HARNESS_SCHEMA_VERSION } from '../../../../src/shared/contract/harness.ts';
import { archiveEntries, archiveGoal, isArchived } from './archive.ts';

const AT = '2026-11-25T00:00:00.000Z';
const LATER = '2026-11-25T02:00:00.000Z';

function goalFixture(id: string, overrides: Partial<GoalRecord> = {}): GoalRecord {
  return {
    type: 'goal',
    id,
    groupId: 'g1',
    seq: 1,
    at: AT,
    schemaVersion: HARNESS_SCHEMA_VERSION,
    writer: 's1',
    sessionId: 's1',
    parentListItemId: null,
    parentGoalId: null,
    supersededByGoalId: null,
    objective: '허브 목표',
    acceptanceCriteria: [{ id: 'c1', desc: '빌드 통과', passed: true, evidence: 'ci#1' }],
    status: 'active',
    pauseReason: null,
    auditAttemptCount: 1,
    revision: 1,
    loopId: null,
    latestAuditId: null,
    createdAt: AT,
    updatedAt: AT,
    completedAt: null,
    completedRevision: null,
    archivedAt: null,
    ...overrides,
  };
}

function auditFixture(id: string, seq: number, overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    type: 'audit',
    id,
    groupId: 'g1',
    seq,
    at: AT,
    schemaVersion: HARNESS_SCHEMA_VERSION,
    writer: 'audit-agent',
    goalId: 'goal_1',
    scope: 'session',
    auditSessionId: null,
    state: 'finished',
    skipReason: null,
    skippedBy: null,
    skippedAt: null,
    verdict: 'approved',
    commitHash: 'abc123',
    worktreeState: null,
    criteriaResults: [],
    evidenceSummary: '테스트 통과',
    report: null,
    model: 'test-model',
    revision: 1,
    createdAt: AT,
    finishedAt: AT,
    durationMs: 0,
    ...overrides,
  };
}

test('아카이브 목록은 완료·중단 Goal 만 담고 진행 중 Goal 은 뺀다', () => {
  const complete = goalFixture('goal_1', {
    status: 'complete',
    completedAt: AT,
    completedRevision: 1,
  });
  const aborted = goalFixture('goal_2', { seq: 2, status: 'aborted' });
  const active = goalFixture('goal_3', { seq: 3 });
  const auditing = goalFixture('goal_4', { seq: 4, status: 'auditing' });
  const paused = goalFixture('goal_5', { seq: 5, status: 'paused', pauseReason: 'user' });

  const entries = archiveEntries([complete, aborted, active, auditing, paused], []);

  assert.deepEqual(entries, [
    { goalId: 'goal_1', status: 'complete', completedAt: AT, auditVerdicts: [] },
    // 중단은 완료 시각이 없다 — 계약 필드를 그대로 옮긴다.
    { goalId: 'goal_2', status: 'aborted', completedAt: null, auditVerdicts: [] },
  ]);
});

test('Goal 별 Audit verdict 는 다른 Goal 을 섞지 않고 seq 오름차순으로 안정적이다', () => {
  const complete = goalFixture('goal_1', {
    status: 'complete',
    completedAt: AT,
    completedRevision: 1,
  });
  const aborted = goalFixture('goal_2', { seq: 2, status: 'aborted' });

  const audits = [
    // 입력 순서를 일부러 뒤섞는다 — 결과는 재생 순서(seq)를 따라야 한다.
    auditFixture('audit_9', 9, { goalId: 'goal_1', verdict: null, state: 'running', finishedAt: null }),
    auditFixture('audit_5', 5, { goalId: 'goal_1', verdict: 'approved' }),
    auditFixture('audit_2', 2, { goalId: 'goal_1', verdict: 'rejected' }),
    auditFixture('audit_7', 7, { goalId: 'goal_2', verdict: 'impossible' }),
  ];

  const entries = archiveEntries([complete, aborted], audits);
  assert.deepEqual(entries.map((entry) => entry.auditVerdicts), [
    ['rejected', 'approved', null],
    ['impossible'],
  ]);

  // 입력 순서가 달라도 같은 Goal 의 verdict 목록은 그대로다.
  const shuffled = [...audits].reverse();
  assert.deepEqual(
    archiveEntries([complete, aborted], shuffled).map((entry) => entry.auditVerdicts),
    [['rejected', 'approved', null], ['impossible']],
  );
  // 순수 함수라 입력 배열은 바뀌지 않는다 — 정렬은 복사본에서만 한다.
  assert.deepEqual(audits.map((audit) => audit.id), ['audit_9', 'audit_5', 'audit_2', 'audit_7']);
});

test('archiveGoal 은 archivedAt 만 채우고 두 번 호출해도 처음 시각을 유지한다', () => {
  const source = goalFixture('goal_1', { status: 'complete', completedAt: AT, completedRevision: 1 });

  assert.equal(isArchived(source), false);
  const archived = archiveGoal(source, AT);
  assert.equal(archived.archivedAt, AT);
  assert.equal(archived.status, source.status);
  assert.equal(archived.completedAt, source.completedAt);
  assert.notEqual(archived, source);
  assert.equal(source.archivedAt, null);
  assert.equal(isArchived(archived), true);

  // 멱등: 이미 아카이브된 Goal 은 다시 옮기지 않는다.
  const again = archiveGoal(archived, LATER);
  assert.equal(again.archivedAt, AT);
  assert.equal(again, archived);
});
