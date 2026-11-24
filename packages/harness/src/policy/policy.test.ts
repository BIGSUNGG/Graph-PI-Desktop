/**
 * 정책 회귀 테스트(§10.1~§10.4). 실행: `node --test packages/harness/src/policy/policy.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  AuditGate,
  AuditRecord,
  GoalRecord,
  HarnessSnapshot,
  ListItemRecord,
  LoopRecord,
} from '../../../../src/shared/contract/harness.ts';
import {
  EMPTY_HARNESS_SNAPSHOT,
  HARNESS_SCHEMA_VERSION,
} from '../../../../src/shared/contract/harness.ts';
import type { PolicyCode, PolicyVerdict } from './goal-policy.ts';
import {
  bumpGoalRevision,
  canCompleteGoal,
  goalBlockedReason,
  isGoalSuperseded,
} from './goal-policy.ts';
import { freezeChildGoals, itemGate, nextAssignableItem, shouldAutoStop } from './list-policy.ts';
import { loopBoundReached, loopOutcome, onAuditApprovedAfterLoop, onLoopOutcome } from './loop-policy.ts';
import {
  applyAuditVerdict,
  auditMayStart,
  auditVerdict,
  auditWriteRefused,
  childGoalSettled,
  latestAuditFor,
  pinCommit,
  requiresGroupAudit,
  requiresSessionAudit,
} from './audit-policy.ts';
import * as barrel from './index.ts';
import * as packageBarrel from '../index.ts';

const AT = '2026-11-24T00:00:00.000Z';

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
    acceptanceCriteria: [{ id: 'c1', desc: '빌드 통과', passed: false, evidence: null }],
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

function listItemFixture(id: string, overrides: Partial<ListItemRecord> = {}): ListItemRecord {
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

function loopFixture(id: string, overrides: Partial<LoopRecord> = {}): LoopRecord {
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
    target: '테스트 시간',
    measureCmd: 'npm test',
    direction: 'min',
    currentValue: null,
    bestValue: null,
    iteration: 0,
    maxIterations: 50,
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
    startedAt: new Date().toISOString(),
    updatedAt: AT,
    ...overrides,
  };
}

function snapshotFixture(part: Partial<HarnessSnapshot>): HarnessSnapshot {
  return { ...EMPTY_HARNESS_SNAPSHOT, groupId: 'g1', ...part };
}

function failReason(verdict: PolicyVerdict): string {
  if (verdict.ok) return assert.fail('실패를 기대했지만 승인되었습니다');
  return verdict.reason;
}

function okAuditId(verdict: PolicyVerdict): string | null {
  return verdict.ok ? verdict.auditId : null;
}

function failCode(verdict: PolicyVerdict): PolicyCode {
  if (verdict.ok) return assert.fail('실패를 기대했지만 승인되었습니다');
  return verdict.code;
}

// (a) 승인 없이 완료 거부
test('승인된 Audit 이 없으면 완료를 거부한다', () => {
  const verdict = canCompleteGoal(goalFixture('goal_1'), []);
  assert.equal(verdict.ok, false);
  assert.equal(failCode(verdict), 'audit-required');
  assert.match(failReason(verdict), /Audit/);
  assert.equal(okAuditId(verdict), null);
});

// (b) 승인 있으면 허용
test('승인된 Audit 이 있으면 완료를 허용하고 auditId 를 돌려준다', () => {
  const audit = auditFixture('audit_1', 2, { goalId: 'goal_1', revision: 1 });
  const verdict = canCompleteGoal(goalFixture('goal_1'), [audit]);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.ok ? verdict.auditId : null, 'audit_1');
});

test('다른 revision 의 승인은 완료 근거가 되지 못한다', () => {
  const audit = auditFixture('audit_1', 2, { goalId: 'goal_1', revision: 1 });
  const bumped = bumpGoalRevision(goalFixture('goal_1'), '');
  const verdict = canCompleteGoal(bumped, [audit]);
  assert.equal(verdict.ok, false);
  assert.equal(failCode(verdict), 'audit-required');
});

test('거부·오류 verdict 는 승인으로 세지 않는다', () => {
  const audits = [
    auditFixture('audit_1', 2, { verdict: 'rejected' }),
    auditFixture('audit_2', 3, { verdict: 'error', state: 'running', finishedAt: null }),
  ];
  const verdict = canCompleteGoal(goalFixture('goal_1'), audits);
  assert.equal(verdict.ok, false);
});

test('완료 조건이 없으면 완료를 거부한다', () => {
  const audit = auditFixture('audit_1', 2);
  const verdict = canCompleteGoal(
    goalFixture('goal_1', { acceptanceCriteria: [] }),
    [audit],
  );
  assert.equal(verdict.ok, false);
  assert.equal(failCode(verdict), 'criteria-required');
});

test('중단·대체된 Goal 은 완료를 주장할 수 없다', () => {
  const audit = auditFixture('audit_1', 2);
  assert.equal(failCode(canCompleteGoal(goalFixture('goal_1', { status: 'aborted' }), [audit])), 'aborted');
  assert.equal(
    failCode(
      canCompleteGoal(goalFixture('goal_1', { supersededByGoalId: 'goal_2' }), [audit]),
    ),
    'superseded',
  );
});

// (c) revision bump 가 completedRevision 을 무효화
test('revision bump 는 revision 을 올리고 completedRevision 을 무효화한다', () => {
  const completed = goalFixture('goal_1', {
    status: 'complete',
    completedAt: AT,
    completedRevision: 1,
    auditAttemptCount: 2,
  });
  const bumped = bumpGoalRevision(completed, '완료 조건 추가');

  assert.equal(bumped.revision, 2);
  assert.equal(bumped.completedRevision, null);
  assert.equal(bumped.auditAttemptCount, 0);
  // 완료 자체는 되돌리지 않는다(§40).
  assert.equal(bumped.completedAt, AT);
  assert.equal(bumped.status, 'complete');
});

test('revision bump 는 조건 통과·증거를 초기화하되 사유가 없으면 조건을 그대로 둔다', () => {
  const goal = goalFixture('goal_1', {
    acceptanceCriteria: [{ id: 'c1', desc: '빌드 통과', passed: true, evidence: 'ci#1' }],
  });

  const same = bumpGoalRevision(goal, '  ');
  assert.deepEqual(same.acceptanceCriteria, goal.acceptanceCriteria);

  const changed = bumpGoalRevision(goal, '빌드와 테스트 통과');
  assert.equal(changed.acceptanceCriteria[0]?.passed, false);
  assert.equal(changed.acceptanceCriteria[0]?.evidence, null);
});

test('supersededByGoalId 가 살아 있는 Goal 을 가리킬 때만 대체로 본다', () => {
  const goals = [goalFixture('goal_2', { seq: 2 })];
  assert.equal(isGoalSuperseded(goalFixture('goal_1', { supersededByGoalId: 'goal_2' }), goals), true);
  assert.equal(isGoalSuperseded(goalFixture('goal_1', { supersededByGoalId: 'goal_x' }), goals), false);
  assert.equal(isGoalSuperseded(goalFixture('goal_1'), goals), false);
});

test('차단 사유는 중단·불가능·일시정지·미승인을 구분한다', () => {
  const aborted = goalBlockedReason(
    goalFixture('goal_1', { status: 'aborted' }),
    [],
    snapshotFixture({}),
  );
  assert.match(aborted ?? '', /중단/);

  const impossible = goalBlockedReason(goalFixture('goal_1'), [], snapshotFixture({
    audits: [auditFixture('audit_9', 9, { verdict: 'impossible' })],
  }));
  assert.match(impossible ?? '', /불가능/);

  const paused = goalBlockedReason(
    goalFixture('goal_1', { status: 'paused', pauseReason: 'loop_bounds' }),
    [],
    snapshotFixture({}),
  );
  assert.match(paused ?? '', /Loop 상한/);

  const unapproved = goalBlockedReason(goalFixture('goal_1'), [], snapshotFixture({}));
  assert.match(unapproved ?? '', /Audit/);
});

test('차단 사유는 자식 미정리와 승인 완료를 구분한다', () => {
  const parent = goalFixture('goal_1', { seq: 1 });
  const child = goalFixture('goal_2', { seq: 2, parentGoalId: 'goal_1', status: 'active' });

  const unfinished = goalBlockedReason(
    parent,
    [child],
    snapshotFixture({ goals: [parent, child] }),
  );
  assert.match(unfinished ?? '', /완료되지 않았습니다/);

  const completedChild = goalFixture('goal_2', {
    seq: 2,
    parentGoalId: 'goal_1',
    status: 'complete',
    completedRevision: 1,
    completedAt: AT,
  });
  const noAudit = goalBlockedReason(
    parent,
    [completedChild],
    snapshotFixture({ goals: [parent, completedChild] }),
  );
  assert.match(noAudit ?? '', /승인이 없습니다/);

  const approved = goalBlockedReason(
    parent,
    [completedChild],
    snapshotFixture({
      goals: [parent, completedChild],
      audits: [
        auditFixture('audit_1', 2, { goalId: 'goal_1' }),
        auditFixture('audit_2', 3, { goalId: 'goal_2' }),
      ],
    }),
  );
  assert.equal(approved, null);
});

test('완료된 Goal 은 자식 변화로 차단으로 되돌리지 않는다', () => {
  const parent = goalFixture('goal_1', { status: 'complete', completedAt: AT, completedRevision: 1 });
  const child = goalFixture('goal_2', { seq: 2, parentGoalId: 'goal_1', status: 'aborted' });

  assert.equal(goalBlockedReason(parent, [child], snapshotFixture({ goals: [parent, child] })), null);
});

test('freezeChildGoals 는 배정 집합을 고정하고 두 번째 배정을 무시한다', () => {
  const item = listItemFixture('item_1');
  const frozen = freezeChildGoals(item, ['goal_1', 'goal_1', 'goal_2'], AT);

  assert.equal(frozen.childGoalsFrozen, true);
  assert.equal(frozen.childGoalsFrozenAt, AT);
  assert.deepEqual(frozen.childGoalIds, ['goal_1', 'goal_2']);

  const again = freezeChildGoals(frozen, ['goal_3'], '2026-11-25T00:00:00.000Z');
  assert.deepEqual(again.childGoalIds, ['goal_1', 'goal_2']);
  assert.equal(again.childGoalsFrozenAt, AT);
});

test('nextAssignableItem 은 완료·고정 항목을 건너뛰고 첫 대기 항목을 고른다', () => {
  const done = listItemFixture('item_1', { queueOrder: 0, completedAt: AT, state: 'active' });
  const frozen = listItemFixture('item_2', { queueOrder: 1, childGoalsFrozen: true });
  const pending = listItemFixture('item_3', { queueOrder: 2, seq: 3 });
  const later = listItemFixture('item_4', { queueOrder: 3, seq: 4 });

  assert.equal(nextAssignableItem([later, pending, frozen, done])?.id, 'item_3');
  assert.equal(nextAssignableItem([done, frozen]), null);
});

// (d) 하위 Goal 0개면 blocked
test('하위 Goal 이 없으면 항목은 완료될 수 없고 차단이다', () => {
  const gate = itemGate(listItemFixture('item_1', { childGoalIds: [] }), []);
  assert.equal(gate.status, 'blocked');
  assert.equal(gate.reason, '하위 Goal 없음');
});

test('유효 하위 Goal 이 모두 승인되면 완료, 하나라도 중단이면 차단이다', () => {
  const goals = [
    goalFixture('goal_1', { status: 'complete', completedRevision: 1 }),
    goalFixture('goal_2', { seq: 2, status: 'complete', completedRevision: 1 }),
  ];
  const item = listItemFixture('item_1', { childGoalIds: ['goal_1', 'goal_2'], childGoalsFrozen: true });

  assert.equal(itemGate(item, goals).status, 'complete');

  const abortedGoals = [
    goals[0] ?? goalFixture('goal_1'),
    goalFixture('goal_2', { seq: 2, status: 'aborted' }),
  ];
  const abortedGate = itemGate(item, abortedGoals);
  assert.equal(abortedGate.status, 'blocked');
  assert.match(abortedGate.reason, /중단/);

  const workingGoals = [goals[0] ?? goalFixture('goal_1'), goalFixture('goal_2', { seq: 2 })];
  const item2 = listItemFixture('item_2', {
    childGoalIds: ['goal_1', 'goal_2'],
    childGoalsFrozen: true,
  });
  assert.equal(itemGate(item2, workingGoals).status, 'blocked');
});

test('대체된 하위 Goal 은 유효 집합에서 빠져 차단이 풀린다', () => {
  const goals = [
    goalFixture('goal_1', { status: 'aborted', supersededByGoalId: 'goal_2' }),
    goalFixture('goal_2', { seq: 2, status: 'complete', completedRevision: 1 }),
  ];
  const item = listItemFixture('item_1', {
    childGoalIds: ['goal_1', 'goal_2'],
    supersededGoalIds: ['goal_1'],
    childGoalsFrozen: true,
  });

  assert.equal(itemGate(item, goals).status, 'complete');
});

// (e) aborted 면 자동 진행 중지
test('중단된 하위 Goal 이 있으면 자동 진행을 멈춘다', () => {
  const aborted = goalFixture('goal_1', { status: 'aborted' });
  const active = goalFixture('goal_2', { seq: 2 });

  assert.equal(shouldAutoStop([aborted, active]).stop, true);
  assert.equal(shouldAutoStop([active]).stop, false);
});

test('대체된 중단 Goal 은 자동 진행을 멈추지 않는다', () => {
  const replaced = goalFixture('goal_1', { status: 'aborted', supersededByGoalId: 'goal_2' });
  const retry = goalFixture('goal_2', { seq: 2 });

  const result = shouldAutoStop([replaced, retry]);
  assert.equal(result.stop, false);
  assert.match(result.reason, /진행/);
});

// (g) loop 상한 3종
test('loop 상한은 회차·시간·토큰을 각각 판정한다', () => {
  const max = loopBoundReached(loopFixture('loop_1', { iteration: 5, maxIterations: 5 }));
  assert.deepEqual(max, { reached: true, code: 'max' });

  const time = loopBoundReached(
    loopFixture('loop_1', {
      iteration: 1,
      maxIterations: 100,
      startedAt: '2020-01-01T00:00:00.000Z',
      timeLimitSeconds: 60,
    }),
  );
  assert.deepEqual(time, { reached: true, code: 'time' });

  const tokens = loopBoundReached(
    loopFixture('loop_1', { iteration: 1, maxIterations: 100, tokensUsed: 10, tokenLimit: 10 }),
  );
  assert.deepEqual(tokens, { reached: true, code: 'tokens' });

  assert.deepEqual(loopBoundReached(loopFixture('loop_1', { iteration: 1 })), {
    reached: false,
    code: null,
  });
});

test('loopOutcome 은 목표 도달·상한·사용자 정지·진행을 구분한다', () => {
  const plateau = loopOutcome(loopFixture('loop_1', { direction: 'max' }), [1, 3, 3, 3, 3]);
  assert.equal(plateau.outcome, 'goal');

  const bounds = loopOutcome(loopFixture('loop_1', { iteration: 4, maxIterations: 4 }), [1, 2]);
  assert.equal(bounds.outcome, 'bounds');
  assert.match(bounds.reason, /상한/);

  const stopped = loopOutcome(loopFixture('loop_1', { status: 'stopped', stopReason: 'user' }), []);
  assert.equal(stopped.outcome, 'stopped');
  assert.match(stopped.reason, /사용자 중지/);

  const running = loopOutcome(loopFixture('loop_1'), [1, 2, 3]);
  assert.equal(running.outcome, 'running');
});

test('onLoopOutcome 은 목표 도달이면 감사 대기, 상한이면 중지로 표시한다', () => {
  const goal = onLoopOutcome(loopFixture('loop_1'), 'goal', goalFixture('goal_1'), AT);
  assert.equal(goal.loop.status, 'paused');
  assert.equal(goal.loop.pauseKind, 'audit');
  assert.equal(goal.loop.stopReason, 'metric_target');
  assert.equal(goal.goalStatus, 'paused');
  assert.notEqual(goal.pauseReason, null);

  const bounds = onLoopOutcome(
    loopFixture('loop_1', { iteration: 3, maxIterations: 3 }),
    'bounds',
    goalFixture('goal_1'),
    AT,
  );
  assert.equal(bounds.loop.status, 'stopped');
  assert.equal(bounds.loop.stopReason, 'max_iterations');
  assert.equal(bounds.goalStatus, 'paused');
  assert.equal(bounds.pauseReason, 'loop_bounds');
});

// (52) Audit 거부는 active 복귀 + 실패 조건 표시
test('Audit 거부는 Goal 을 active 로 되돌리고 실패 조건을 미통과로 표시한다', () => {
  const goal = goalFixture('goal_1', {
    status: 'auditing',
    auditAttemptCount: 1,
    acceptanceCriteria: [
      { id: 'c1', desc: '빌드 통과', passed: true, evidence: 'ci#1' },
      { id: 'c2', desc: '테스트 통과', passed: true, evidence: 'test#1' },
    ],
  });

  const rejected = applyAuditVerdict(goal, 'rejected', AT, {
    auditId: 'audit_2',
    failedCriteria: ['테스트 통과'],
  });

  // 상한이 남은 Loop 를 계속 돌릴 수 있게 active 로 돌아간다.
  assert.equal(rejected.status, 'active');
  assert.equal(rejected.pauseReason, null);
  assert.equal(rejected.auditAttemptCount, 2);
  assert.equal(rejected.latestAuditId, 'audit_2');
  // 실패로 짙인 조건은 통과·증거가 지워져 다음 작업 대상으로 보인다.
  assert.equal(rejected.acceptanceCriteria[1]?.passed, false);
  assert.equal(rejected.acceptanceCriteria[1]?.evidence, null);
  // 실패하지 않은 조건은 그대로 둔다.
  assert.equal(rejected.acceptanceCriteria[0]?.passed, true);
  assert.equal(rejected.updatedAt, AT);
  // 순수 함수라 입력 레코드는 바뀌지 않는다.
  assert.equal(goal.status, 'auditing');
});

// (53) 불가능 = aborted, 감사 오류 = paused
test('Audit 불가능은 aborted, 감사 오류는 paused(audit_error) 로 표시한다', () => {
  const impossible = applyAuditVerdict(
    goalFixture('goal_1', { status: 'auditing', completedRevision: 1 }),
    'impossible',
    AT,
    { auditId: 'audit_3' },
  );
  assert.equal(impossible.status, 'aborted');
  assert.equal(impossible.pauseReason, null);
  assert.equal(impossible.completedRevision, null);

  const errored = applyAuditVerdict(goalFixture('goal_1', { status: 'auditing' }), 'error', AT, {
    auditId: 'audit_4',
  });
  assert.equal(errored.status, 'paused');
  assert.equal(errored.pauseReason, 'audit_error');
});

test('Audit 승인은 Goal 을 active 로 유지하고 완료 근거만 고정한다', () => {
  const goal = goalFixture('goal_1', { status: 'paused', pauseReason: 'standby', revision: 3 });
  const approved = applyAuditVerdict(goal, 'approved', AT, { auditId: 'audit_5' });

  assert.equal(approved.status, 'active');
  assert.equal(approved.pauseReason, null);
  assert.equal(approved.latestAuditId, 'audit_5');
  // 승인은 완료 전이가 아니다 — 완료 시각·revision 은 그대로다(§57).
  assert.equal(approved.completedAt, null);
  assert.equal(approved.completedRevision, null);
  assert.equal(approved.revision, 3);
});

test('완료·중단된 Goal 은 늦은 verdict 로 되돌리지 않는다', () => {
  const complete = goalFixture('goal_1', { status: 'complete', completedAt: AT, completedRevision: 1 });
  const aborted = goalFixture('goal_1', { status: 'aborted' });

  assert.equal(applyAuditVerdict(complete, 'rejected', AT, { auditId: 'audit_6' }), complete);
  assert.equal(applyAuditVerdict(aborted, 'approved', AT, { auditId: 'audit_7' }), aborted);
});

// (55) 새 작업·증거 없이 같은 revision 완료 재주장 거부
test('같은 revision 에서 새 감사·증거 없이 다시 완료를 주장하면 거부한다', () => {
  const goal = goalFixture('goal_1', {
    completedAt: AT,
    completedRevision: 1,
    latestAuditId: 'audit_1',
  });
  const audit = auditFixture('audit_1', 2, { goalId: 'goal_1', revision: 1, finishedAt: AT });

  const verdict = canCompleteGoal(goal, [audit]);

  assert.equal(verdict.ok, false);
  assert.equal(failCode(verdict), 'no-new-evidence');
  assert.match(failReason(verdict), /증거/);
  // 반복 주장은 승인 auditId 를 돌려주지 않는다.
  assert.equal(okAuditId(verdict), null);
});

test('새 증거나 새 감사가 있으면 같은 revision 이라도 다시 완료를 주장할 수 있다', () => {
  const audit = auditFixture('audit_1', 2, { goalId: 'goal_1', revision: 1, finishedAt: AT });
  const withEvidence = goalFixture('goal_1', {
    completedAt: AT,
    completedRevision: 1,
    latestAuditId: 'audit_1',
    acceptanceCriteria: [{ id: 'c1', desc: '빌드 통과', passed: true, evidence: 'ci#9' }],
  });

  assert.equal(canCompleteGoal(withEvidence, [audit]).ok, true);

  // 완료 뒤에 맞은 새 Audit 도 새 근거다.
  const newAudit = auditFixture('audit_9', 4, {
    goalId: 'goal_1',
    revision: 1,
    finishedAt: '2026-11-24T01:00:00.000Z',
  });
  const plain = goalFixture('goal_1', { completedAt: AT, completedRevision: 1, latestAuditId: 'audit_1' });
  assert.equal(canCompleteGoal(plain, [newAudit]).ok, true);
});

// (57) Loop 상한·목표 도달 전이
test('목표 도달이면 Loop 는 감사 대기로 멈추고 Goal 은 paused 로 전이한다', () => {
  const goal = goalFixture('goal_1');
  const next = onLoopOutcome(loopFixture('loop_1'), 'goal', goal, AT);

  assert.equal(next.loop.status, 'paused');
  assert.equal(next.loop.pauseKind, 'audit');
  assert.equal(next.loop.stopReason, 'metric_target');
  assert.equal(next.goal.status, 'paused');
  // 계약 PauseReason 에 audit 값이 없어 감사 대기는 standby 로 적는다.
  assert.equal(next.goal.pauseReason, 'standby');
  assert.equal(next.pauseReason, 'standby');
  assert.equal(next.goal.updatedAt, AT);
  // 순수 함수라 입력 Goal 은 그대로다.
  assert.equal(goal.status, 'active');
});

test('상한 도달이면 Loop 는 stopped, Goal 은 paused(loop_bounds) 로 전이한다', () => {
  const next = onLoopOutcome(
    loopFixture('loop_1', { iteration: 3, maxIterations: 3 }),
    'bounds',
    goalFixture('goal_1'),
    AT,
  );

  assert.equal(next.loop.status, 'stopped');
  assert.equal(next.loop.pauseKind, 'bounds');
  assert.equal(next.loop.stopReason, 'max_iterations');
  assert.equal(next.goal.status, 'paused');
  assert.equal(next.goal.pauseReason, 'loop_bounds');
});

test('완료된 Goal 은 Loop 상한으로 다시 멈추지 않는다', () => {
  const complete = goalFixture('goal_1', { status: 'complete', completedAt: AT, completedRevision: 1 });
  const next = onLoopOutcome(loopFixture('loop_1'), 'bounds', complete, AT);

  assert.equal(next.loop.status, 'stopped');
  assert.equal(next.goal, complete);
  assert.equal(next.goalStatus, 'complete');
});

test('감사 승인 후에는 Loop 가 done, Goal 이 complete 로 전이한다', () => {
  const pausedLoop = loopFixture('loop_1', {
    status: 'paused',
    pauseKind: 'audit',
    stopReason: 'metric_target',
  });
  const pausedGoal = goalFixture('goal_1', { status: 'paused', pauseReason: 'standby' });

  const after = onAuditApprovedAfterLoop(pausedLoop, pausedGoal, AT);

  assert.equal(after.loop.status, 'done');
  assert.equal(after.loop.pauseKind, null);
  assert.equal(after.loop.stopReason, 'audit_approved');
  assert.equal(after.goal.status, 'complete');
  assert.equal(after.goal.pauseReason, null);
  assert.equal(after.goal.completedRevision, 1);
  assert.equal(after.goal.completedAt, AT);
});

test('중단된 Goal 은 감사 승인으로 되돌리지 않고 Loop 만 끝낸다', () => {
  const aborted = goalFixture('goal_1', { status: 'aborted' });
  const after = onAuditApprovedAfterLoop(loopFixture('loop_1'), aborted, AT);

  assert.equal(after.loop.status, 'done');
  assert.equal(after.goal, aborted);
});

test('세션 Audit 은 자식이 없을 때, 그룹 Audit 은 그룹 Goal 의 하위 Goal 이 있을 때만 필요하다', () => {
  const groupGoal = goalFixture('goal_1');
  const child = goalFixture('goal_2', { seq: 2, parentGoalId: 'goal_1' });

  assert.equal(requiresSessionAudit(groupGoal, []), true);
  assert.equal(requiresSessionAudit(groupGoal, [child]), false);

  // (f) 그룹 Goal 이 만든 세션의 하위 Goal 이 없으면 그룹 Audit 을 만들지 않는다.
  assert.equal(requiresGroupAudit([groupGoal], []), false);
  assert.equal(requiresGroupAudit([groupGoal], [goalFixture('goal_9', { parentGoalId: 'goal_x' })]), false);
  assert.equal(requiresGroupAudit([groupGoal], [child]), true);
  assert.equal(requiresGroupAudit([], [child]), false);
});

test('auditMayStart 는 직계 자식이 정산되기 전이면 거부한다', () => {
  const child = goalFixture('goal_2', { seq: 2, parentGoalId: 'goal_1', status: 'active' });
  const goals = [goalFixture('goal_1'), child];

  assert.equal(auditMayStart({ children: [], goals }).ok, true);

  const blocked = auditMayStart({ children: [child], goals });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /자식/);

  const settledChild = goalFixture('goal_2', {
    seq: 2,
    parentGoalId: 'goal_1',
    status: 'complete',
    completedRevision: 1,
    completedAt: AT,
  });
  assert.equal(auditMayStart({ children: [settledChild], goals }).ok, true);
});

test('자식 정산 판정은 최신 Audit 승인·생략만 인정한다', () => {
  const child = goalFixture('goal_2', { status: 'complete', completedRevision: 1, completedAt: AT });
  assert.equal(childGoalSettled(child, []), false);
  assert.equal(childGoalSettled(child, [auditFixture('audit_2', 3, { goalId: 'goal_2' })]), true);
  assert.equal(
    childGoalSettled(child, [auditFixture('audit_2', 3, { goalId: 'goal_2', verdict: 'rejected' })]),
    false,
  );
  assert.equal(
    childGoalSettled(child, [
      auditFixture('audit_2', 3, { goalId: 'goal_2', state: 'skipped', verdict: null }),
    ]),
    true,
  );
  assert.equal(latestAuditFor('goal_2', [
    auditFixture('audit_2', 3, { goalId: 'goal_2', verdict: 'rejected' }),
    auditFixture('audit_3', 4, { goalId: 'goal_2' }),
  ])?.id, 'audit_3');
});

test('Audit 은 읽기 전용이며 커밋 해시를 고정한다', () => {
  assert.equal(auditWriteRefused({ readOnly: true }), true);
  assert.equal(auditWriteRefused({ readOnly: false }), false);
  assert.deepEqual(pinCommit('3', 'abc123'), { revision: '3', commit: 'abc123' });
});

// (h) auditVerdict fail→rejected
test('gate 하나라도 통과하지 못하면 rejected 다', () => {
  const passed: AuditGate[] = ['passed', 'passed'];
  assert.equal(auditVerdict(passed), 'approved');
  assert.equal(auditVerdict([]), 'approved');
  assert.equal(auditVerdict(['passed', 'pending']), 'rejected');
  assert.equal(auditVerdict(['none']), 'rejected');
});

test('정책 함수가 배럴로 노출된다', () => {
  assert.equal(typeof barrel.canCompleteGoal, 'function');
  assert.equal(typeof barrel.itemGate, 'function');
  assert.equal(typeof barrel.loopBoundReached, 'function');
  assert.equal(typeof barrel.auditVerdict, 'function');
  assert.equal(typeof barrel.applyAuditVerdict, 'function');
  assert.equal(typeof barrel.onLoopOutcome, 'function');
  assert.equal(typeof barrel.onAuditApprovedAfterLoop, 'function');
  assert.equal(typeof packageBarrel.bumpGoalRevision, 'function');
  assert.equal(typeof packageBarrel.shouldAutoStop, 'function');
});
