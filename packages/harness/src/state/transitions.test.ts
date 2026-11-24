/**
 * GLLA 전이 회귀 테스트. 실행: `node --test packages/harness/src/state/transitions.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  GoalRecord,
  GoalStatus,
  HarnessRecord,
  HarnessSnapshot,
  ListItemRecord,
  LoopDirection,
  LoopRecord,
} from '../../../../src/shared/contract/harness.ts';
import {
  EMPTY_HARNESS_SNAPSHOT,
  HARNESS_SCHEMA_VERSION,
} from '../../../../src/shared/contract/harness.ts';
import type { TransitionResult } from './goal.ts';
import {
  archiveGoal,
  cancelGoal,
  completeGoal,
  goalAggregate,
  pauseGoal,
  resumeGoal,
  startGoal,
} from './goal.ts';
import {
  addListItem,
  completeListItem,
  freezeListChildGoals,
  listDisplayState,
  startListItem,
} from './list.ts';
import {
  isImprovement,
  plateauReached,
  recordMeasurement,
  startLoop,
  stopLoop,
} from './loop.ts';
import { finishAudit, gatesPassed, startAudit } from './audit.ts';
import * as barrel from '../index.ts';

const AT = '2026-11-24T00:00:00.000Z';
const FINISHED_AT = '2026-11-24T00:01:00.000Z';

function unwrap<R extends HarnessRecord>(result: TransitionResult<R>): R {
  // assert.equal 은 타입을 좁혀 실패 분기를 unreachable 로 만든다. 분기를 직접 확인한다.
  if (result.ok) return result.record;
  return assert.fail(result.error);
}

function expectError<R extends HarnessRecord>(result: TransitionResult<R>): string {
  if (result.ok) return assert.fail('실패를 기대했지만 성공했습니다');
  return result.error;
}

function goal(id: string, overrides: Partial<GoalRecord> = {}): GoalRecord {
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
    acceptanceCriteria: [],
    status: 'active',
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
    ...overrides,
  };
}

function listItem(id: string, overrides: Partial<ListItemRecord> = {}): ListItemRecord {
  return {
    type: 'list_item',
    id,
    groupId: 'g1',
    seq: 1,
    at: AT,
    schemaVersion: HARNESS_SCHEMA_VERSION,
    writer: 's1',
    sessionId: 's1',
    goalId: null,
    parentGoalId: null,
    title: '항목',
    state: 'queued',
    queueOrder: 0,
    childGoalIds: [],
    supersededGoalIds: [],
    childGoalsFrozen: false,
    childGoalsFrozenAt: null,
    integrationNote: null,
    createdAt: AT,
    activatedAt: null,
    completedAt: null,
    completedRevision: null,
    ...overrides,
  };
}

function loop(id: string, direction: LoopDirection = 'max'): LoopRecord {
  return {
    type: 'loop',
    id,
    groupId: 'g1',
    seq: 1,
    at: AT,
    schemaVersion: HARNESS_SCHEMA_VERSION,
    writer: 's1',
    goalId: 'goal_1',
    sessionId: 's1',
    target: '점수',
    measureCmd: 'npm run measure',
    direction,
    currentValue: null,
    bestValue: null,
    iteration: 0,
    maxIterations: 10,
    timeLimitSeconds: null,
    tokenLimit: null,
    tokensUsed: 0,
    status: 'running',
    pauseKind: null,
    stopReason: null,
    measureExitCode: null,
    measureStderr: null,
    measuredAt: null,
    history: [],
    startedAt: AT,
    updatedAt: AT,
  };
}

function snapshotOf(goals: GoalRecord[]): HarnessSnapshot {
  return { ...EMPTY_HARNESS_SNAPSHOT, goals };
}

test('startGoal 은 빈 목표를 거부한다', () => {
  const error = expectError(
    startGoal({ objective: '   ', id: 'goal_1', groupId: 'g1', seq: 1, writer: 's1', at: AT }),
  );
  assert.match(error, /목표/iu);
});

test('startGoal 은 active Goal 을 만들고 검증 계약을 완료 조건으로 옮긴다', () => {
  const record = unwrap(
    startGoal({
      objective: ' 그룹 오케스트레이션 ',
      verificationContract: '모든 하위 Goal 승인',
      id: 'goal_1',
      groupId: 'g1',
      seq: 3,
      writer: 's1',
      at: AT,
    }),
  );

  assert.equal(record.type, 'goal');
  assert.equal(record.status, 'active');
  assert.equal(record.objective, '그룹 오케스트레이션');
  assert.equal(record.acceptanceCriteria.length, 1);
  assert.equal(record.acceptanceCriteria[0]?.desc, '모든 하위 Goal 승인');
  assert.equal(record.acceptanceCriteria[0]?.passed, false);
  assert.equal(record.revision, 1);
  assert.equal(record.createdAt, AT);
  assert.equal(record.seq, 3);
  assert.equal(record.writer, 's1');
});

test('completeGoal 은 active 에서만 동작하고 completedAt·completedRevision 을 남긴다', () => {
  const paused = goal('goal_1', { status: 'paused', pauseReason: 'user' });
  assert.match(expectError(completeGoal(paused, { summary: '끝' })), /진행 중인 Goal/u);

  const active = goal('goal_2', { revision: 2 });
  const done = unwrap(completeGoal(active, { summary: '끝' }));
  assert.equal(done.status, 'complete');
  assert.equal(typeof done.completedAt, 'string');
  assert.equal(done.completedRevision, 2);
  assert.equal(done.revision, 2);
});

test('pauseGoal 과 resumeGoal 은 왕복하고 사유를 지운다', () => {
  const active = goal('goal_1');
  const paused = unwrap(pauseGoal(active, { reason: 'question', note: '질문 대기' }));
  assert.equal(paused.status, 'paused');
  assert.equal(paused.pauseReason, 'question');

  const resumed = unwrap(resumeGoal(paused));
  assert.equal(resumed.status, 'active');
  assert.equal(resumed.pauseReason, null);

  assert.match(expectError(resumeGoal(resumed)), /일시정지된 Goal/u);
  assert.match(expectError(pauseGoal(paused, { reason: 'user' })), /진행 중인 Goal/u);
});

test('cancelGoal 은 완료된 Goal 을 거부하고 진행 중 Goal 을 aborted 로 둔다', () => {
  const complete = goal('goal_1', { status: 'complete', completedAt: AT });
  assert.match(expectError(cancelGoal(complete)), /완료된 Goal/u);

  const canceled = unwrap(cancelGoal(goal('goal_2', { status: 'paused', pauseReason: 'user' })));
  assert.equal(canceled.status, 'aborted');
  assert.equal(canceled.pauseReason, null);
  assert.match(expectError(cancelGoal(canceled)), /이미 중단된 Goal/u);
});

test('goalAggregate 는 상태별로 세고 감사 중을 진행으로 센다', () => {
  const statuses: GoalStatus[] = ['active', 'auditing', 'paused', 'complete', 'aborted'];
  const goals = statuses.map((status, index) => goal(`goal_${index}`, { status }));

  assert.deepEqual(goalAggregate(snapshotOf(goals)), {
    total: 5,
    done: 1,
    active: 2,
    paused: 1,
    canceled: 1,
  });
  assert.deepEqual(goalAggregate(EMPTY_HARNESS_SNAPSHOT), {
    total: 0,
    done: 0,
    active: 0,
    paused: 0,
    canceled: 0,
  });
});

test('archiveGoal 은 archivedAt 만 채우고 원본을 바꾸지 않는다', () => {
  const source = goal('goal_1');
  const archived = archiveGoal(source, AT);

  assert.equal(archived.archivedAt, AT);
  assert.equal(archived.status, source.status);
  assert.equal(source.archivedAt, null);
  assert.notEqual(archived, source);
});

test('addListItem → startListItem → completeListItem 순서로 진행된다', () => {
  const added = unwrap(
    addListItem({
      title: ' 결제 플로우 ',
      order: 4,
      id: 'item_1',
      groupId: 'g1',
      seq: 1,
      writer: 's1',
      sessionId: 's1',
      at: AT,
    }),
  );
  assert.equal(added.state, 'queued');
  assert.equal(added.title, '결제 플로우');
  assert.equal(added.queueOrder, 4);
  assert.equal(added.childGoalsFrozen, false);
  assert.equal(added.childGoalsFrozenAt, null);

  assert.match(expectError(completeListItem(added)), /진행 중인 항목/u);
  assert.match(expectError(addListItem({ title: ' ', id: 'item_9', groupId: 'g1', seq: 2, writer: 's1' })), /제목/u);

  const started = unwrap(startListItem(added));
  assert.equal(started.state, 'active');
  assert.equal(typeof started.activatedAt, 'string');

  const completed = unwrap(completeListItem(started));
  assert.equal(typeof completed.completedAt, 'string');
  assert.equal(completed.state, 'active');
  assert.match(expectError(completeListItem(completed)), /이미 완료된 항목/u);
  assert.match(expectError(startListItem(completed)), /이미 완료된 항목/u);
});

test('freezeListChildGoals 는 모든 항목을 같은 시각으로 고정한다', () => {
  const items = [listItem('item_1'), listItem('item_2', { state: 'active' })];
  const frozen = freezeListChildGoals(items, AT);

  assert.equal(frozen.length, 2);
  for (const item of frozen) {
    assert.equal(item.childGoalsFrozen, true);
    assert.equal(item.childGoalsFrozenAt, AT);
  }
  assert.equal(items[0]?.childGoalsFrozen, false);
  assert.equal(items[1]?.childGoalsFrozenAt, null);
});

test('listDisplayState 는 대기·진행·차단·완료를 파생한다', () => {
  const runningGoal = goal('goal_active', { status: 'active' });
  const abortedGoal = goal('goal_aborted', { status: 'aborted' });
  const completeGoalRecord = goal('goal_complete', { status: 'complete', completedAt: AT });

  const items = [
    listItem('item_queued'),
    listItem('item_active', { state: 'active' }),
    listItem('item_no_child', { state: 'active', childGoalsFrozen: true, childGoalsFrozenAt: AT }),
    listItem('item_running_child', {
      state: 'active',
      childGoalsFrozen: true,
      childGoalsFrozenAt: AT,
      childGoalIds: ['goal_active'],
    }),
    listItem('item_aborted_child', {
      state: 'active',
      childGoalsFrozen: true,
      childGoalsFrozenAt: AT,
      childGoalIds: ['goal_aborted'],
    }),
    listItem('item_superseded_child', {
      state: 'active',
      childGoalsFrozen: true,
      childGoalsFrozenAt: AT,
      childGoalIds: ['goal_superseded'],
      supersededGoalIds: ['goal_superseded'],
    }),
    listItem('item_completed', { state: 'active', completedAt: AT }),
    listItem('item_complete_child', {
      state: 'active',
      childGoalsFrozen: true,
      childGoalsFrozenAt: AT,
      childGoalIds: ['goal_complete'],
    }),
  ];

  assert.deepEqual(
    listDisplayState(items, [runningGoal, abortedGoal, completeGoalRecord]),
    [
      'queued',
      'active',
      'blocked',
      'active',
      'blocked',
      'blocked',
      'complete',
      // 완료 표시는 허브가 completedAt 을 남길 때 파생된다(ListTab 과 같은 규칙).
      'active',
    ],
  );
});

test('recordMeasurement 는 회차를 올리고 측정값·exitCode·이력을 남긴다', () => {
  const started = unwrap(
    startLoop({
      target: ' 테스트 시간 ',
      measureCommand: ' npm run measure ',
      direction: 'max',
      goalId: 'goal_1',
      id: 'loop_1',
      groupId: 'g1',
      seq: 1,
      writer: 's1',
      at: AT,
    }),
  );
  assert.equal(started.status, 'running');
  assert.equal(started.iteration, 0);
  assert.equal(started.measureCmd, 'npm run measure');
  assert.equal(started.maxIterations, 50);

  const first = unwrap(
    recordMeasurement(started, { value: 10, exitCode: 0, stderr: '경고', at: FINISHED_AT }),
  );
  assert.equal(first.iteration, 1);
  assert.equal(first.currentValue, 10);
  assert.equal(first.bestValue, 10);
  assert.equal(first.measureExitCode, 0);
  assert.equal(first.measureStderr, '경고');
  assert.equal(first.measuredAt, FINISHED_AT);
  assert.equal(first.history.length, 1);
  assert.equal(first.history[0]?.improved, true);

  const worse = unwrap(recordMeasurement(first, { value: 7, exitCode: 0, at: FINISHED_AT }));
  assert.equal(worse.iteration, 2);
  assert.equal(worse.bestValue, 10);
  assert.equal(worse.measureStderr, null);
  assert.equal(worse.history[1]?.improved, false);

  const better = unwrap(recordMeasurement(worse, { value: 12, exitCode: 1, at: FINISHED_AT }));
  assert.equal(better.iteration, 3);
  assert.equal(better.bestValue, 12);
  assert.equal(better.measureExitCode, 1);
});

test('recordMeasurement 는 NaN·Infinity 측정값을 거부한다', () => {
  const target = loop('loop_1');

  assert.match(
    expectError(recordMeasurement(target, { value: Number.NaN, exitCode: 0, at: AT })),
    /측정값/u,
  );
  assert.match(
    expectError(recordMeasurement(target, { value: Number.POSITIVE_INFINITY, exitCode: 0, at: AT })),
    /측정값/u,
  );
});

test('startLoop 은 빈 목표·명령을 거부하고 stopLoop 은 종료 이유를 남긴다', () => {
  const base = { direction: 'min', goalId: 'goal_1', groupId: 'g1', seq: 1, writer: 's1' } as const;

  assert.match(
    expectError(startLoop({ ...base, id: 'loop_1', target: ' ', measureCommand: 'npm test' })),
    /측정 목표/u,
  );
  assert.match(
    expectError(startLoop({ ...base, id: 'loop_2', target: 'p95', measureCommand: '  ' })),
    /측정 명령/u,
  );
  assert.match(
    expectError(startLoop({ ...base, id: 'loop_3', goalId: '', target: 'p95', measureCommand: 'npm test' })),
    /대상 Goal/u,
  );

  const running = loop('loop_4', 'min');
  const stopped = unwrap(stopLoop(running, { reason: 'plateau' }));
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.stopReason, 'plateau');
  assert.match(expectError(stopLoop(stopped, { reason: 'user' })), /이미 끝난 Loop/u);
});

test('isImprovement 는 min·max 양방향으로 판정한다', () => {
  assert.equal(isImprovement(10, 5, 'min'), true);
  assert.equal(isImprovement(5, 10, 'min'), false);
  assert.equal(isImprovement(5, 5, 'min'), false);
  assert.equal(isImprovement(null, 3, 'min'), true);

  assert.equal(isImprovement(5, 10, 'max'), true);
  assert.equal(isImprovement(10, 5, 'max'), false);
  assert.equal(isImprovement(10, 10, 'max'), false);
  assert.equal(isImprovement(null, 0, 'max'), true);
});

test('plateauReached 는 window 미만의 비개선이면 false 다', () => {
  assert.equal(plateauReached([10, 10], 'max', 2), false);
  assert.equal(plateauReached([10, 10, 10], 'max', 2), true);
  assert.equal(plateauReached([10, 9, 11, 12], 'max', 2), false);
  assert.equal(plateauReached([3, 3], 'min', 1), true);
  assert.equal(plateauReached([3, 2, 1], 'min', 2), false);
  assert.equal(plateauReached([], 'max', 1), false);
  assert.equal(plateauReached([10, 10], 'max', 0), false);
});

test('finishAudit 은 running 에서만 동작하고 소요 시간을 계산한다', () => {
  const running = unwrap(
    startAudit({
      scope: 'session',
      sessionId: 'audit_s1',
      goalId: 'goal_1',
      id: 'audit_1',
      groupId: 'g1',
      seq: 1,
      writer: 'audit-agent',
      at: AT,
    }),
  );
  assert.equal(running.state, 'running');
  assert.equal(running.auditSessionId, 'audit_s1');
  assert.equal(running.verdict, null);

  const finished = unwrap(
    finishAudit(running, {
      verdict: 'approved',
      summary: ' 테스트 로그와 diff 확인 ',
      gates: ['passed'],
      at: FINISHED_AT,
    }),
  );
  assert.equal(finished.state, 'finished');
  assert.equal(finished.verdict, 'approved');
  assert.equal(finished.evidenceSummary, '테스트 로그와 diff 확인');
  assert.equal(finished.finishedAt, FINISHED_AT);
  assert.equal(finished.durationMs, 60_000);

  assert.match(expectError(finishAudit(finished, { verdict: 'rejected', summary: '재검', gates: [], at: FINISHED_AT })), /진행 중인 Audit/u);
  assert.match(expectError(finishAudit(running, { verdict: 'approved', summary: ' ', gates: [], at: FINISHED_AT })), /증거 요약/u);
  assert.match(expectError(startAudit({ scope: 'group', goalId: '', id: 'audit_2', groupId: 'g1', seq: 2, writer: 's1' })), /대상 Goal/u);
});

test('gatesPassed 는 fail·pending 이 하나라도 있으면 false 다', () => {
  assert.equal(gatesPassed(['passed', 'passed']), true);
  assert.equal(gatesPassed(['passed', 'pending']), false);
  assert.equal(gatesPassed(['passed', 'none']), false);
  assert.equal(gatesPassed([]), true);
});

test('패키지 배럴이 state 전이를 다시 내보낸다', () => {
  assert.equal(typeof barrel.startGoal, 'function');
  assert.equal(typeof barrel.completeGoal, 'function');
  assert.equal(typeof barrel.addListItem, 'function');
  assert.equal(typeof barrel.listDisplayState, 'function');
  assert.equal(typeof barrel.startLoop, 'function');
  assert.equal(typeof barrel.plateauReached, 'function');
  assert.equal(typeof barrel.startAudit, 'function');
  assert.equal(typeof barrel.gatesPassed, 'function');
});
