/**
 * Audit 시작·기록 정책(§10.4). gate 는 저장하지 않는 파생값이라 여기서 계산만 한다.
 * 감사 세션은 읽기 전용이고 verdict 는 승인·거부·불가능·오류 네 가지뿐이다.
 */
import type {
  AcceptanceCriterion,
  AuditGate,
  AuditRecord,
  AuditVerdict,
  GoalRecord,
  ListItemRecord,
} from '../../../../src/shared/contract/harness.ts';

/** 같은 Goal 의 Audit 이력에서 가장 최근(seq 최대) 기록을 고른다 — 판정은 최신 것만 유효하다. */
export function latestAuditFor(goalId: string, audits: readonly AuditRecord[]): AuditRecord | null {
  let latest: AuditRecord | null = null;

  for (const audit of audits) {
    if (audit.goalId !== goalId) continue;
    if (latest === null || audit.seq >= latest.seq) latest = audit;
  }

  return latest;
}

/**
 * 자식 Goal 이 정산됐는지 — `complete` 이고 최신 Audit 이 승인 또는 생략이어야 한다(§10.4, §47).
 * 감사 오류·거부가 최신이면 부모는 아직 통합 감사를 시작할 수 없다.
 */
export function childGoalSettled(child: GoalRecord, audits: readonly AuditRecord[]): boolean {
  if (child.status !== 'complete') return false;

  const audit = latestAuditFor(child.id, audits);
  if (audit === null) return false;
  if (audit.state === 'skipped') return true;

  const approvedRevision = child.completedRevision ?? child.revision;
  return audit.verdict === 'approved' && audit.revision === approvedRevision;
}

/** 자식 Goal 이 없으면 세션 Audit 이다(§10.4). */
export function requiresSessionAudit(goal: GoalRecord, children: readonly GoalRecord[]): boolean {
  void goal;
  return children.length === 0;
}

/**
 * 그룹 Audit 대상은 그룹 Goal 이 만든 세션의 하위 Goal 로 한정한다(§10.4, §49).
 * 그런 하위 Goal 이 하나도 없으면 그룹 Audit 을 만들지 않는다.
 */
export function requiresGroupAudit(
  groupGoals: readonly GoalRecord[],
  childGoals: readonly GoalRecord[],
): boolean {
  // 그룹 Goal 자체가 없으면 그룹 Audit 의 소유자도 없다.
  if (groupGoals.length === 0) return false;

  const groupIds = new Set(groupGoals.map((goal) => goal.id));
  return childGoals.some(
    (child) => child.parentGoalId !== null && groupIds.has(child.parentGoalId),
  );
}

/**
 * 감사 시작 가능 판정 — 직계 자식이 모두 정산돼야 한다(§10.4, §47, §48).
 * 계약 시그니처에 audits 가 없어 자식의 완료 revision 고정값으로 승인·생략을 근사한다.
 */
export function auditMayStart(owner: {
  children: readonly GoalRecord[];
  goals: readonly GoalRecord[];
}): { ok: boolean; reason: string } {
  void owner.goals;

  const unsettled = owner.children.filter(
    (child) => child.status !== 'complete' || child.completedRevision !== child.revision,
  );

  if (unsettled.length > 0) {
    return {
      ok: false,
      reason: `직계 자식 Goal ${unsettled.length}개가 아직 승인·생략되지 않아 감사를 시작할 수 없습니다.`,
    };
  }

  return { ok: true, reason: '직계 자식이 모두 정산되어 감사를 시작할 수 있습니다.' };
}

/** 감사 세션은 읽기 전용이라 쓰기 시도는 error 종료다(§10.4, §50). */
export function auditWriteRefused(gate: { readOnly: boolean }): boolean {
  return gate.readOnly;
}

/** 감사 시작 시 커밋 해시를 고정한다 — 감사 중 워크트리 변경 판정의 기준값이다(§10.4, §51). */
export function pinCommit(revision: string, commit: string): { revision: string; commit: string } {
  return { revision, commit };
}

/**
 * gate 로 verdict 를 정한다 — 하나라도 통과하지 못하면 승인하지 않는다(§10.4, §50).
 * 계약 `AuditGate` 에 fail 값이 없어 passed 가 아닌 gate(pending·none)를 미통과로 본다.
 */
export function auditVerdict(gates: readonly AuditGate[]): 'approved' | 'rejected' {
  return gates.every((gate) => gate === 'passed') ? 'approved' : 'rejected';
}

/** verdict 를 Goal 로 옮길 때 함께 넘기는 근거. 계약에 없는 값은 만들지 않는다. */
export type AuditVerdictDetail = {
  /** 판정을 남긴 Audit id. Goal 의 `latestAuditId` 로 고정해 실패 조건을 화면에서 찾게 한다. */
  auditId?: string | null;
  /** Audit 이 실패로 짚은 조건 id 또는 설명. 계약 `AcceptanceCriterion` 만으로 표현한다(§52). */
  failedCriteria?: readonly string[];
};

/** 실패로 짚인 조건을 미통과로 되돌린다 — 계약에 실패 사유 필드가 없어 증거를 비우는 것으로 표시한다. */
function markFailedCriteria(
  criteria: readonly AcceptanceCriterion[],
  failed: readonly string[],
): AcceptanceCriterion[] {
  const failedIds = new Set(failed);

  return criteria.map((criterion) =>
    failedIds.has(criterion.id) || failedIds.has(criterion.desc)
      ? { ...criterion, passed: false, evidence: null }
      : { ...criterion },
  );
}

/**
 * Audit verdict 를 Goal 상태로 옮긴다(§52, §53, §57). 순수 함수라 저장은 호출부가 한다.
 * 계약 `PauseReason` 에 `audit`·`error` 값이 없어 감사 대기는 `standby`, 감사 오류는 `audit_error` 로 적는다.
 * 적용하지 않는 경우(완료·중단된 Goal)에는 받은 레코드를 그대로 돌려준다 — 호출부는 참조 비교로 저장을 건너뛴다.
 */
export function applyAuditVerdict(
  goal: GoalRecord,
  verdict: AuditVerdict,
  at: string,
  detail: AuditVerdictDetail = {},
): GoalRecord {
  // 완료·중단은 종료 상태라 늦게 도착한 verdict 로 되돌리지 않는다(§40).
  if (goal.status === 'complete' || goal.status === 'aborted') return goal;

  const base: GoalRecord = {
    ...goal,
    latestAuditId: detail.auditId ?? goal.latestAuditId,
    auditAttemptCount: goal.auditAttemptCount + 1,
    updatedAt: at,
  };

  switch (verdict) {
    case 'approved':
      // 승인은 완료 근거만 제공한다 — 완료 전이는 `goal complete` 가 따로 판정한다(§57).
      return { ...base, status: 'active', pauseReason: null };
    case 'rejected':
      // 거부되면 상한이 남은 Loop 를 계속 돌릴 수 있도록 active 로 돌아간다(§52).
      return {
        ...base,
        status: 'active',
        pauseReason: null,
        // 실패 조건은 미통과로 되돌려 다음 작업 대상을 드러낸다(§52).
        acceptanceCriteria: markFailedCriteria(
          goal.acceptanceCriteria,
          detail.failedCriteria ?? [],
        ),
        // 거부로 승인 근거가 사라졌으니 완료 revision 고정도 푼다.
        completedRevision: null,
      };
    case 'impossible':
      // 불가능은 이후 작업으로 풀리지 않는다 — 중단으로 끝낸다(§53, §10.4).
      return { ...base, status: 'aborted', pauseReason: null, completedRevision: null };
    case 'error':
      // 감사 자체가 실패한 경우는 재시도 여지가 있어 중단 대신 오류 사유로 멈춘다(§53).
      return { ...base, status: 'paused', pauseReason: 'audit_error' };
  }
}

/**
 * 보완 항목 생성 입력. `id` 는 호출부가 그룹 안에서 고유하게 만들고,
 * `queueOrder` 는 대기열 정수 순서다.
 */
export type ComplementItemInput = {
  /** 새 List 항목 id. */
  id: string;
  /**
   * 대기열 정수 순서. 생략하면 원 항목 바로 다음(`item.queueOrder + 1`)이다.
   * 뒤 항목을 밀어야 하면 호출부가 밀린 값을 넘긴다.
   */
  queueOrder?: number;
};

/**
 * Audit 거부 시 보완 항목을 만든다(§10.4, acceptance 611행).
 * 원 항목은 건드리지 않고 대기(`queued`) 상태의 새 레코드를 돌려준다 — 저장은 호출부가 한다.
 * `queueOrder` 는 정수만 쓴다(소수 순서는 정렬·표시를 흔든다).
 */
export function complementItemFor(
  item: ListItemRecord,
  reason: string,
  at: string,
  input: ComplementItemInput,
): ListItemRecord {
  const requested = input.queueOrder ?? item.queueOrder + 1;
  // 계약의 queueOrder 는 정수다 — 비정수·소수가 들어오면 원 항목 다음 값으로 되돌린다.
  const queueOrder = Number.isInteger(requested) ? requested : item.queueOrder + 1;

  return {
    ...item,
    id: input.id,
    at,
    // 보완 항목은 새 작업 단위다 — 거부된 Goal 연결(goalId)을 물려받지 않는다.
    goalId: null,
    parentGoalId: item.parentGoalId,
    title: `보완: ${item.title}`,
    state: 'queued',
    queueOrder,
    // 새 항목이므로 하위 Goal 배정·진행 기록은 비운다.
    childGoalIds: [],
    supersededGoalIds: [],
    childGoalsFrozen: false,
    childGoalsFrozenAt: null,
    integrationNote: reason,
    createdAt: at,
    activatedAt: null,
    completedAt: null,
    completedRevision: null,
  };
}

/** Audit 거부일 때만 보완 항목이 필요하다 — 승인·불가능·오류는 보완 대상이 아니다(§10.4). */
export function needsComplement(audit: { verdict: AuditVerdict | null }): boolean {
  return audit.verdict === 'rejected';
}
