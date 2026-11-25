/**
 * 감사(Audit) gate 회귀 테스트(§10.4, §47, §48, §51~§53, §57).
 * 고정하는 계약:
 * - 감사 대상 선택(requiresSessionAudit·requiresGroupAudit)과 시작 가능 판정(auditMayStart)
 * - 자식 정산 판정(childGoalSettled)과 읽기 전용·커밋 고정(auditWriteRefused·pinCommit)
 * - verdict 전이(applyAuditVerdict)와 완료 근거(canCompleteGoal)
 * - 거부 시 보완 항목 생성(complementItemFor·needsComplement) — acceptance 611행
 * - 허브 List 항목 차단·배정(itemGate·freezeChildGoals·nextAssignableItem)
 * 실행: `node --test packages/harness/src/policy/audit-gate.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  AuditRecord,
  GoalRecord,
  HarnessSnapshot,
  ListItemRecord,
} from '../../../../src/shared/contract/harness.ts';
import {
  EMPTY_HARNESS_SNAPSHOT,
  HARNESS_SCHEMA_VERSION,
} from '../../../../src/shared/contract/harness.ts';
import type { PolicyCode, PolicyVerdict } from './goal-policy.ts';
import { bumpGoalRevision, canCompleteGoal, goalBlockedReason } from './goal-policy.ts';
import { freezeChildGoals, itemGate, nextAssignableItem } from './list-policy.ts';
import {
  applyAuditVerdict,
  auditMayStart,
  auditWriteRefused,
  childGoalSettled,
  complementItemFor,
  needsComplement,
  pinCommit,
  requiresGroupAudit,
  requiresSessionAudit,
} from './audit-policy.ts';

const AT = '2026-11-24T00:00:00.000Z';
const LATER = '2026-11-24T01:00:00.000Z';

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

function snapshotFixture(part: Partial<HarnessSnapshot>): HarnessSnapshot {
  return { ...EMPTY_HARNESS_SNAPSHOT, groupId: 'g1', ...part };
}

/** 완료 주장이 통과했을 때만 auditId 를 꺼낸다 — 실패 분기에서 타입이 never 로 좁혀지지 않게 한다. */
function requireAuditId(verdict: PolicyVerdict): string {
  if (verdict.ok) return verdict.auditId;
  return assert.fail(verdict.reason);
}

function failCode(verdict: PolicyVerdict): PolicyCode {
  if (verdict.ok) return assert.fail('실패를 기대했지만 승인되었습니다');
  return verdict.code;
}

function failReason(verdict: PolicyVerdict): string {
  if (verdict.ok) return assert.fail('실패를 기대했지만 승인되었습니다');
  return verdict.reason;
}

// (1) 자식 미정산 → 감사 시작 거부
test('자식 Goal 이 미정산이면 그룹 감사 대상이지만 시작은 거부된다', () => {
  const parent = goalFixture('goal_1', { objective: '그룹 목표' });
  const activeChild = goalFixture('goal_2', { seq: 2, parentGoalId: 'goal_1', status: 'active' });
  // 완료 뒤 개정으로 완료 revision 고정이 풀려 다시 미정산이 된 자식.
  const bumpedChild = goalFixture('goal_3', {
    seq: 3,
    parentGoalId: 'goal_1',
    status: 'complete',
    completedAt: AT,
    revision: 2,
    completedRevision: null,
  });
  const children = [activeChild, bumpedChild];

  // 자식이 있으면 세션 감사가 아니라 그룹(통합) 감사 대상이다(§10.4, §49).
  assert.equal(requiresSessionAudit(parent, children), false);
  assert.equal(requiresGroupAudit([parent], children), true);
  assert.equal(childGoalSettled(activeChild, []), false);
  assert.equal(childGoalSettled(bumpedChild, []), false);

  const gate = auditMayStart({ children, goals: [parent, ...children] });
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /자식/u);
  // 미정산 자식 수(2개)를 그대로 알려야 화면이 대상을 찾을 수 있다.
  assert.match(gate.reason, /2개/u);
});

// (2) 자식 모두 정산 → 감사 시작 허용
test('자식이 모두 정산되면 감사 시작이 허용된다', () => {
  const parent = goalFixture('goal_1', { objective: '그룹 목표' });
  const approvedChild = goalFixture('goal_2', {
    seq: 2,
    parentGoalId: 'goal_1',
    status: 'complete',
    completedAt: AT,
    completedRevision: 1,
  });
  const skippedChild = goalFixture('goal_3', {
    seq: 3,
    parentGoalId: 'goal_1',
    status: 'complete',
    completedAt: AT,
    completedRevision: 1,
  });
  const children = [approvedChild, skippedChild];
  const audits = [
    auditFixture('audit_2', 4, { goalId: 'goal_2', revision: 1 }),
    auditFixture('audit_3', 5, {
      goalId: 'goal_3',
      state: 'skipped',
      verdict: null,
      skipReason: '문서만 바뀌어 검증할 동작이 없음',
      skippedBy: 's1',
      skippedAt: AT,
    }),
  ];

  assert.equal(requiresSessionAudit(parent, children), false);
  assert.equal(requiresGroupAudit([parent], children), true);
  // 승인과 생략은 정산으로 인정하고, 감사가 아예 없으면 정산이 아니다(§47).
  assert.equal(childGoalSettled(approvedChild, audits), true);
  assert.equal(childGoalSettled(skippedChild, audits), true);
  assert.equal(childGoalSettled(approvedChild, []), false);

  const gate = auditMayStart({ children, goals: [parent, ...children] });
  assert.equal(gate.ok, true);
  assert.match(gate.reason, /정산/u);
});

// (3) 자식 없는 Goal = 세션 감사
test('자식이 없는 Goal 은 세션 감사 대상이고 그룹 감사 대상이 아니다', () => {
  const sessionGoal = goalFixture('goal_1');

  assert.equal(requiresSessionAudit(sessionGoal, []), true);
  assert.equal(requiresGroupAudit([sessionGoal], []), false);
  // 그룹 Goal 이 만든 세션의 하위 Goal 이 아니면 그룹 감사 근거가 아니다(§49).
  assert.equal(
    requiresGroupAudit([sessionGoal], [goalFixture('goal_9', { seq: 9, parentGoalId: 'goal_x' })]),
    false,
  );
  assert.equal(
    requiresGroupAudit([], [goalFixture('goal_2', { seq: 2, parentGoalId: 'goal_1' })]),
    false,
  );

  const gate = auditMayStart({ children: [], goals: [sessionGoal] });
  assert.equal(gate.ok, true);
});

// (4) 정산 판정은 최신 Audit 승인·생략만 인정
test('자식 정산 판정은 최신 Audit 의 승인·생략만 인정한다', () => {
  const child = goalFixture('goal_2', {
    status: 'complete',
    completedAt: AT,
    completedRevision: 1,
  });

  assert.equal(childGoalSettled(child, []), false);
  assert.equal(
    childGoalSettled(child, [auditFixture('audit_1', 2, { goalId: 'goal_2', revision: 1 })]),
    true,
  );

  // 승인 뒤에 온 거부가 최신이면 다시 미정산이다(§47).
  assert.equal(
    childGoalSettled(child, [
      auditFixture('audit_1', 2, { goalId: 'goal_2', revision: 1 }),
      auditFixture('audit_2', 3, { goalId: 'goal_2', revision: 1, verdict: 'rejected' }),
    ]),
    false,
  );
  // 감사 오류도 승인 근거를 대체한다.
  assert.equal(
    childGoalSettled(child, [
      auditFixture('audit_1', 2, { goalId: 'goal_2', revision: 1 }),
      auditFixture('audit_2', 3, { goalId: 'goal_2', revision: 1, verdict: 'error' }),
    ]),
    false,
  );
  // 완료 revision 이 아닌 승인은 그 revision 을 검증한 것이 아니다.
  assert.equal(
    childGoalSettled(child, [auditFixture('audit_1', 2, { goalId: 'goal_2', revision: 2 })]),
    false,
  );
});

// (5) auditing = 읽기 전용, 작업 차단
test('auditing Goal 은 감사 세션 쓰기를 거부하고 작업도 차단 사유로 막는다', () => {
  assert.equal(auditWriteRefused({ readOnly: true }), true);
  assert.equal(auditWriteRefused({ readOnly: false }), false);

  const auditing = goalFixture('goal_1', { status: 'auditing' });
  const blocked = goalBlockedReason(auditing, [], snapshotFixture({ goals: [auditing] }));
  assert.equal(blocked, 'Audit 이 아직 끝나지 않았습니다.');
});

// (6) 감사 시작 커밋 고정
test('감사 시작 시 고정한 revision·커밋은 이후 커밋을 따라가지 않는다', () => {
  const pinned = pinCommit('4', 'aaa111');
  assert.deepEqual(pinned, { revision: '4', commit: 'aaa111' });

  // 고정은 값 스냅샷이다 — 감사 중 워크트리가 나아가도 고정값은 유지된다(§51).
  const afterWork = pinCommit('4', 'bbb222');
  assert.notEqual(pinned, afterWork);
  assert.equal(pinned.commit, 'aaa111');
  assert.equal(afterWork.commit, 'bbb222');
  assert.notEqual(pinned.commit, afterWork.commit);
});

// (6-b) 고정 이후 변경된 작업은 고정된 승인을 무효로 만든다
test('고정 이후 revision 이 바뀐 Goal 에는 이전 커밋의 승인을 쓸 수 없다', () => {
  const pinned = pinCommit('1', 'aaa111');
  const goal = goalFixture('goal_1');
  const audit = auditFixture('audit_1', 2, {
    goalId: 'goal_1',
    revision: Number(pinned.revision),
    commitHash: pinned.commit,
  });

  assert.equal(requireAuditId(canCompleteGoal(goal, [audit])), 'audit_1');

  // 감사 뒤 작업이 바뀌어 revision 이 올라가면 고정된 커밋의 승인은 근거가 아니다(§10.1, §40).
  const changed = bumpGoalRevision(goal, '감사 후 파일 수정');
  const verdict = canCompleteGoal(changed, [audit]);
  assert.equal(failCode(verdict), 'audit-required');
  assert.match(failReason(verdict), /revision 2/u);
});

// (7) verdict 4종 = 서로 다른 전이
test('verdict 4종은 서로 다른 Goal 상태 전이를 낸다', () => {
  const base = goalFixture('goal_1', {
    status: 'auditing',
    revision: 2,
    auditAttemptCount: 1,
    acceptanceCriteria: [
      { id: 'c1', desc: '빌드 통과', passed: true, evidence: 'ci#1' },
      { id: 'c2', desc: '테스트 통과', passed: true, evidence: 'test#1' },
    ],
  });

  const approved = applyAuditVerdict(base, 'approved', AT, { auditId: 'audit_1' });
  const rejected = applyAuditVerdict(base, 'rejected', AT, {
    auditId: 'audit_2',
    failedCriteria: ['c2'],
  });
  const impossible = applyAuditVerdict(base, 'impossible', AT, { auditId: 'audit_3' });
  const errored = applyAuditVerdict(base, 'error', AT, { auditId: 'audit_4' });

  assert.equal(approved.status, 'active');
  assert.equal(approved.pauseReason, null);
  // 승인은 완료 전이가 아니라 완료 근거만 제공한다 — 조건·완료 시각은 그대로다(§57).
  assert.deepEqual(approved.acceptanceCriteria, base.acceptanceCriteria);
  assert.equal(approved.completedRevision, null);

  assert.equal(rejected.status, 'active');
  assert.equal(rejected.pauseReason, null);
  // 거부는 실패로 짚은 조건만 미통과로 되돌린다(§52).
  assert.equal(rejected.acceptanceCriteria[1]?.passed, false);
  assert.equal(rejected.acceptanceCriteria[1]?.evidence, null);
  assert.equal(rejected.acceptanceCriteria[0]?.passed, true);

  assert.equal(impossible.status, 'aborted');
  assert.equal(impossible.pauseReason, null);
  assert.equal(errored.status, 'paused');
  assert.equal(errored.pauseReason, 'audit_error');

  // 상태·사유·조건 결과 어느 축에서도 네 전이가 겹치지 않는다.
  const signature = (goal: GoalRecord): string =>
    [
      goal.status,
      goal.pauseReason ?? 'none',
      goal.acceptanceCriteria.map((criterion) => (criterion.passed ? '1' : '0')).join(''),
    ].join('|');

  assert.equal(new Set([approved, rejected, impossible, errored].map(signature)).size, 4);
  // 네 전이 모두 감사 시도 횟수를 올리고 판정 Audit 을 고정한다.
  assert.deepEqual(
    [approved, rejected, impossible, errored].map((goal) => goal.auditAttemptCount),
    [2, 2, 2, 2],
  );
  assert.deepEqual(
    [approved, rejected, impossible, errored].map((goal) => goal.latestAuditId),
    ['audit_1', 'audit_2', 'audit_3', 'audit_4'],
  );
  // 순수 함수라 입력 레코드는 바뀌지 않는다.
  assert.equal(base.status, 'auditing');
  assert.equal(base.auditAttemptCount, 1);

  // 완료·중단은 종료 상태라 늦게 도착한 verdict 로 되돌리지 않는다(§40).
  const complete = goalFixture('goal_1', {
    status: 'complete',
    completedAt: AT,
    completedRevision: 1,
  });
  const aborted = goalFixture('goal_1', { status: 'aborted' });

  assert.equal(applyAuditVerdict(complete, 'rejected', AT, { auditId: 'audit_9' }), complete);
  assert.equal(applyAuditVerdict(aborted, 'approved', AT, { auditId: 'audit_9' }), aborted);
  // 적용하지 않은 경우에는 시도 횟수도 늘리지 않는다.
  assert.equal(complete.auditAttemptCount, 0);
  assert.equal(aborted.auditAttemptCount, 0);
});

// (6) 승인 전 complete 거부 / 승인 후 통과
test('승인된 Audit 이 없으면 complete 주장을 거부한다', () => {
  const verdict = canCompleteGoal(goalFixture('goal_1', { status: 'auditing' }), [
    auditFixture('audit_1', 2, {
      goalId: 'goal_1',
      state: 'running',
      verdict: null,
      finishedAt: null,
      durationMs: null,
    }),
  ]);

  assert.equal(failCode(verdict), 'audit-required');
  assert.match(failReason(verdict), /revision 1/u);
});

test('승인된 Audit 이 있으면 complete 가 통과하고 그 auditId 를 돌려준다', () => {
  const goal = goalFixture('goal_1', { status: 'auditing', revision: 3 });
  const audit = auditFixture('audit_7', 8, { goalId: 'goal_1', revision: 3 });

  assert.equal(requireAuditId(canCompleteGoal(goal, [audit])), 'audit_7');
});

// (7) 항목 gate — 유효 하위 Goal 완료 여부
test('항목 gate 는 유효 하위 Goal 이 모두 완료돼야 완료로 바뀐다', () => {
  const item = listItemFixture('item_1', {
    childGoalIds: ['goal_1', 'goal_2'],
    childGoalsFrozen: true,
    childGoalsFrozenAt: AT,
  });
  const doneGoal = goalFixture('goal_1', {
    status: 'complete',
    completedAt: AT,
    completedRevision: 1,
  });
  const workingGoal = goalFixture('goal_2', { seq: 2 });

  // 선행 하위 Goal 이 남아 있으면 항목은 차단이다(§10.2, §39).
  const blocked = itemGate(item, [doneGoal, workingGoal]);
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.reason, /1개/u);

  const passed = itemGate(item, [
    doneGoal,
    goalFixture('goal_2', { seq: 2, status: 'complete', completedAt: AT, completedRevision: 1 }),
  ]);
  assert.equal(passed.status, 'complete');
  assert.match(passed.reason, /모두 승인/u);
});

test('선행 항목이 남아 있으면 다음 항목을 배정하지 않는다', () => {
  const first = listItemFixture('item_1', { queueOrder: 0, seq: 1, state: 'queued' });
  const second = listItemFixture('item_2', { queueOrder: 1, seq: 2 });

  // 선행 항목이 아직 대기 중이면 그 항목이 먼저다.
  assert.equal(nextAssignableItem([second, first])?.id, 'item_1');

  // 선행 항목이 끝나야 다음 항목이 배정 대상이 된다(§10.2).
  assert.equal(
    nextAssignableItem([{ ...first, state: 'active', completedAt: AT }, second])?.id,
    'item_2',
  );

  // 선행 항목이 하위 Goal 배정으로 얼어도 다음 항목으로 넘어간다.
  assert.equal(
    nextAssignableItem([{ ...first, childGoalsFrozen: true, childGoalsFrozenAt: AT }, second])?.id,
    'item_2',
  );
});

// (8) 하위 Goal 0개 + 얼림 = 차단
test('하위 Goal 없이 얼린 항목은 차단으로 표시된다', () => {
  const frozen = freezeChildGoals(listItemFixture('item_1'), [], AT);
  assert.equal(frozen.childGoalsFrozen, true);
  assert.equal(frozen.childGoalsFrozenAt, AT);
  assert.deepEqual(frozen.childGoalIds, []);

  const gate = itemGate(frozen, []);
  assert.equal(gate.status, 'blocked');
  assert.equal(gate.reason, '하위 Goal 없음');

  // 얼린 뒤에는 새 배정을 받지 않아 차단이 풀리지 않는다(§10.2).
  const again = freezeChildGoals(frozen, ['goal_1'], LATER);
  assert.deepEqual(again.childGoalIds, []);
  assert.equal(itemGate(again, [goalFixture('goal_1')]).reason, '하위 Goal 없음');

  // 배정된 하위 Goal 이 모두 대체돼 유효 집합이 비어도 완료가 아니라 차단이다.
  const replaced = listItemFixture('item_2', {
    childGoalIds: ['goal_9'],
    supersededGoalIds: ['goal_9'],
    childGoalsFrozen: true,
    childGoalsFrozenAt: AT,
  });
  const replacedGate = itemGate(replaced, [
    goalFixture('goal_9', { status: 'aborted', supersededByGoalId: 'goal_10' }),
  ]);
  assert.equal(replacedGate.status, 'blocked');
  assert.equal(replacedGate.reason, '하위 Goal 없음');
});

// (9) 보완 항목 — 거부된 허브 항목을 새 대기 항목으로 만든다
test('Audit 거부 시 보완 항목은 새 대기 항목으로 만들어진다', () => {
  const source = listItemFixture('item_1', {
    goalId: 'goal_1',
    parentGoalId: 'goal_hub',
    title: '결제 플로우 구현',
    state: 'active',
    queueOrder: 3,
    childGoalIds: ['goal_1'],
    childGoalsFrozen: true,
    childGoalsFrozenAt: AT,
    activatedAt: AT,
  });

  const complement = complementItemFor(source, '테스트 근거 없음', LATER, { id: 'item_2' });

  assert.notEqual(complement, source);
  assert.equal(complement.id, 'item_2');
  assert.equal(complement.type, 'list_item');
  assert.equal(complement.groupId, source.groupId);
  assert.equal(complement.title, '보완: 결제 플로우 구현');
  assert.equal(complement.state, 'queued');
  // 큐 순서는 정수이고 원 항목 바로 다음이다(소수 순서 금지).
  assert.equal(complement.queueOrder, source.queueOrder + 1);
  assert.ok(Number.isInteger(complement.queueOrder));
  // 부모 허브 항목 연결은 유지하고, 끝난 Goal 연결은 물려받지 않는다.
  assert.equal(complement.parentGoalId, 'goal_hub');
  assert.equal(complement.goalId, null);
  assert.equal(complement.integrationNote, '테스트 근거 없음');
  // 새 항목이므로 하위 Goal 배정·진행 기록은 비어 있다.
  assert.deepEqual(complement.childGoalIds, []);
  assert.deepEqual(complement.supersededGoalIds, []);
  assert.equal(complement.childGoalsFrozen, false);
  assert.equal(complement.childGoalsFrozenAt, null);
  assert.equal(complement.activatedAt, null);
  assert.equal(complement.completedAt, null);
  assert.equal(complement.completedRevision, null);
  assert.equal(complement.at, LATER);
  assert.equal(complement.createdAt, LATER);
  // 원본은 바뀌지 않는다 — 순수 함수라 저장은 호출부가 한다.
  assert.equal(source.title, '결제 플로우 구현');
  assert.equal(source.state, 'active');
  assert.equal(source.queueOrder, 3);
  assert.deepEqual(source.childGoalIds, ['goal_1']);
});

// (9-b) 보완 항목 순서 — 호출부가 밀어낸 정수 순서를 쓰고 비정수는 받지 않는다
test('보완 항목 순서는 호출부가 정하고 비정수는 원 항목 다음으로 되돌린다', () => {
  const source = listItemFixture('item_1', { queueOrder: 2 });

  // 뒤 항목을 밀어야 하면 호출부가 밀린 정수 순서를 넘긴다.
  const shifted = complementItemFor(source, '보완 필요', AT, { id: 'item_2', queueOrder: 5 });
  assert.equal(shifted.queueOrder, 5);

  // 계약의 queueOrder 는 정수다 — 소수(2.5)는 원 항목 바로 다음으로 되돌린다.
  const fractional = complementItemFor(source, '보완 필요', AT, { id: 'item_3', queueOrder: 2.5 });
  assert.equal(fractional.queueOrder, 3);
  assert.ok(Number.isInteger(fractional.queueOrder));

  // 같은 사유라도 호출부가 다른 id 를 주면 별개 항목이다.
  const another = complementItemFor(source, '보완 필요', AT, { id: 'item_4' });
  assert.notEqual(another.id, fractional.id);
  assert.notEqual(another, fractional);
});

// (9-c) 보완 필요 판정 — 거부 verdict 만 참이다
test('needsComplement 는 거부 verdict 에서만 참이다', () => {
  assert.equal(needsComplement(auditFixture('audit_1', 1, { verdict: 'rejected' })), true);
  assert.equal(needsComplement(auditFixture('audit_2', 2, { verdict: 'approved' })), false);
  assert.equal(needsComplement(auditFixture('audit_3', 3, { verdict: 'impossible' })), false);
  assert.equal(needsComplement(auditFixture('audit_4', 4, { verdict: 'error' })), false);
  // 아직 verdict 가 없는(진행 중·생략) Audit 은 보완 대상이 아니다.
  assert.equal(
    needsComplement(auditFixture('audit_5', 5, { verdict: null, state: 'running' })),
    false,
  );
});
