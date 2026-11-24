/**
 * 저장소 재생 규칙 회귀 테스트. 실행: `node --test packages/harness/src/store.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { GoalRecord } from '../../../src/shared/contract/harness.ts';
import { HARNESS_SCHEMA_VERSION } from '../../../src/shared/contract/harness.ts';
import { nextSeq } from './envelope.ts';
import type { RecordPayload } from './records.ts';
import { goalRecord, questionRecord } from './records.ts';
import { createHarnessStore, groupStateFile } from './store.ts';
import * as barrel from './index.ts';

function goalPayload(objective: string): RecordPayload<GoalRecord> {
  return {
    sessionId: 's1',
    parentListItemId: null,
    parentGoalId: null,
    supersededByGoalId: null,
    objective,
    acceptanceCriteria: [{ id: 'c1', desc: '빌드 통과', passed: false, evidence: null }],
    status: 'active',
    pauseReason: null,
    auditAttemptCount: 0,
    revision: 1,
    loopId: null,
    latestAuditId: null,
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
    completedAt: null,
    completedRevision: null,
    archivedAt: null,
  };
}

function goal(id: string, seq: number, objective: string, revision = 1): GoalRecord {
  return goalRecord({ ...goalPayload(objective), revision }, { id, groupId: 'g1', seq, writer: 's1' });
}

test('append 한 레코드를 read 가 append 순서대로 돌려준다', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'harness-store-'));
  try {
    const store = createHarnessStore({ dataDir });
    await store.append('g1', goal('goal_1', 1, '첫 목표'));
    await store.append('g1', goal('goal_2', 2, '둘째 목표'));

    const records = await store.read('g1');
    assert.equal(records.length, 2);
    assert.equal(records[0]?.id, 'goal_1');
    assert.equal(records[1]?.id, 'goal_2');
    assert.deepEqual(
      records.map((record) => record.seq),
      [1, 2],
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('같은 id 를 두 번 append 하면 snapshot 은 마지막 레코드를 쓴다', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'harness-store-'));
  try {
    const store = createHarnessStore({ dataDir });
    await store.append('g1', goal('goal_1', 1, '첫 목표'));
    await store.append('g1', goal('goal_1', 2, '갱신된 목표', 2));

    const snapshot = await store.snapshot('g1');
    assert.equal(snapshot.goals.length, 1);
    assert.equal(snapshot.goals[0]?.objective, '갱신된 목표');
    assert.equal(snapshot.goals[0]?.revision, 2);
    assert.equal(snapshot.groupId, 'g1');
    assert.equal(snapshot.schemaVersion, HARNESS_SCHEMA_VERSION);
    assert.equal(snapshot.availability, 'ok');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('nextSeqFor 는 파일 안 최대 seq + 1 을 준다', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'harness-store-'));
  try {
    const store = createHarnessStore({ dataDir });
    assert.equal(await store.nextSeqFor('g1'), 1);
    assert.equal(nextSeq([]), 1);

    await store.append('g1', goal('goal_1', 1, '첫 목표'));
    await store.append('g1', goal('goal_2', 5, '둘째 목표'));

    assert.equal(await store.nextSeqFor('g1'), 6);
    assert.equal(nextSeq(await store.read('g1')), 6);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('questionRecord 가 계약 필수 필드를 채운다', () => {
  const record = questionRecord(
    {
      sessionId: 's1',
      sequence: 1,
      questions: [
        {
          header: 'API',
          question: '어느 API 로 구현할까요?',
          multiSelect: false,
          options: [
            { label: 'REST', description: '단순한 요청·응답' },
            { label: 'GraphQL', description: '단일 엔드포인트' },
          ],
        },
      ],
      status: 'pending',
      answer: null,
      createdAt: '2026-11-24T00:00:00.000Z',
      deliveredAt: null,
      answeredAt: null,
      answerAppliedAt: null,
    },
    { id: 'q1', groupId: 'g1', seq: 1, writer: 's1' },
  );

  assert.equal(record.type, 'question');
  assert.equal(record.schemaVersion, HARNESS_SCHEMA_VERSION);
  assert.equal(record.groupId, 'g1');
  assert.equal(record.writer, 's1');
  assert.equal(record.questions.length, 1);
  assert.equal(record.questions[0]?.header, 'API');
  assert.equal(record.questions[0]?.options.length, 2);
  assert.equal(record.status, 'pending');
  assert.equal(record.answer, null);
});

test('상태 파일은 <dataDir>/groups/<groupId>/state.jsonl 이다', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'harness-store-'));
  try {
    const store = createHarnessStore({ dataDir });
    await store.append('g1', goal('goal_1', 1, '첫 목표'));
    await access(join(dataDir, 'groups', 'g1', 'state.jsonl'));
    assert.equal(groupStateFile(dataDir, 'g1'), join(dataDir, 'groups', 'g1', 'state.jsonl'));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('깨진 줄은 건너뛰고 경고 개수만 snapshot 에 남긴다', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'harness-store-'));
  try {
    const file = groupStateFile(dataDir, 'g1');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `{깨진 줄\n${JSON.stringify(goal('goal_1', 1, '첫 목표'))}\n`, 'utf8');

    const store = createHarnessStore({ dataDir });
    const snapshot = await store.snapshot('g1');
    assert.equal(snapshot.goals.length, 1);
    assert.equal(snapshot.warnings.length, 1);
    assert.match(snapshot.warnings[0] ?? '', /1개 레코드를 읽지 못했습니다/u);
    assert.equal((await store.read('g1')).length, 1);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('배럴이 envelope·records·store 표면을 다시 내보낸다', () => {
  assert.equal(typeof barrel.makeEnvelope, 'function');
  assert.equal(typeof barrel.nextSeq, 'function');
  assert.equal(typeof barrel.applyRecords, 'function');
  assert.equal(typeof barrel.questionRecord, 'function');
  assert.equal(typeof barrel.createHarnessStore, 'function');
  assert.equal(typeof barrel.groupStateFile, 'function');
});
