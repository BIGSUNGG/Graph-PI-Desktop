/**
 * Goal 완료·개정·차단 판정 정책(§10.1). 전이는 `state/goal.ts` 가 하고 여기서는 근거만 따진다.
 * 실패를 throw 하지 않고 판정 객체로 돌려준다 — 도구 호출부가 문구를 그대로 쓴다.
 */
import type {
  AcceptanceCriterion,
  AuditRecord,
  GoalRecord,
  HarnessSnapshot,
  PauseReason,
} from '../../../../src/shared/contract/harness.ts';
import { childGoalSettled } from './audit-policy.ts';

/** 완료를 막은 이유 코드. 도구 호출부가 문구 분기에 쓴다. */
export type PolicyCode =
  | 'audit-required'
  | 'criteria-required'
  | 'aborted'
  | 'superseded'
  | 'no-new-evidence';

/** 완료 판정. 승인 근거가 있어야 `auditId` 를 돌려주고, 없으면 사유를 돌려준다. */
export type PolicyVerdict =
  | { ok: true; code: null; reason: null; auditId: string }
  | { ok: false; code: PolicyCode; reason: string; auditId: null };

const PAUSE_REASON_LABELS: Record<PauseReason, string> = {
  user: '사용자 중지',
  agent: '에이전트 중지',
  audit_error: '감사 오류',
  question: '질문 대기',
  loop_bounds: 'Loop 상한',
  dependency: '의존성',
  standby: '대기',
  blocked: '차단',
};

/** 같은 Goal 의 승인 기록 중 현재 revision 것을 고른다(여러 건이면 가장 나중 seq). */
function approvedAuditFor(goal: GoalRecord, audits: readonly AuditRecord[]): AuditRecord | null {
  let approved: AuditRecord | null = null;

  for (const audit of audits) {
    if (audit.goalId !== goal.id) continue;
    if (audit.state !== 'finished') continue;
    if (audit.verdict !== 'approved') continue;
    // 이전 revision 의 승인은 현재 완료 조건을 검증한 것이 아니라 근거가 되지 못한다(§10.1).
    if (audit.revision !== goal.revision) continue;
    if (approved === null || audit.seq >= approved.seq) approved = audit;
  }

  return approved;
}

/**
 * 완료 이후에 나온 판정인지 — 완료 시 고정한 audit id 와 다르거나, 완료 시각보다 나중에 끝났으면 새 근거다(§55).
 * 계약에 완료 시점 조건 스냅샷 필드가 없어 audit id·시각으로 비교한다.
 */
function auditIsNewerThanCompletion(goal: GoalRecord, audit: AuditRecord): boolean {
  if (goal.latestAuditId !== null && goal.latestAuditId !== audit.id) return true;
  if (goal.completedAt === null || audit.finishedAt === null) return false;

  const completed = Date.parse(goal.completedAt);
  const finished = Date.parse(audit.finishedAt);
  if (!Number.isFinite(completed) || !Number.isFinite(finished)) return false;

  return finished > completed;
}

/**
 * 완료 시점 승인 Audit 이 본 조건과 지금 조건이 다른지 — 즉 새 증거가 생겼는지 본다(§55).
 * Audit 이 조건별 결과를 남기지 않았으면 비교 기준이 없어, 조건에 새 통과·증거가 붙었을 때만 새 증거로 인정한다
 * (근거를 알 수 없는 거부로 작업을 막지 않는다).
 */
function hasFreshEvidence(
  audit: AuditRecord,
  criteria: readonly AcceptanceCriterion[],
): boolean {
  if (audit.criteriaResults.length === 0) {
    return criteria.some((criterion) => criterion.passed || criterion.evidence !== null);
  }

  return criteria.some((criterion) => {
    const result =
      audit.criteriaResults.find((candidate) => candidate.criterion === criterion.id) ??
      audit.criteriaResults.find((candidate) => candidate.criterion === criterion.desc);
    // Audit 이 보지 않은 조건이 새로 생겼으면 그 자체가 새 증거다.
    if (result === undefined) return true;

    const auditPassed = result.result === 'pass';
    return criterion.passed !== auditPassed || (criterion.evidence ?? '') !== result.evidence;
  });
}

/** 완료 가능 판정 — 승인된 Audit 만이 `complete` 근거다(§10.1, §38). */
export function canCompleteGoal(goal: GoalRecord, audits: readonly AuditRecord[]): PolicyVerdict {
  if (goal.status === 'aborted') {
    return {
      ok: false,
      code: 'aborted',
      reason: '중단된 Goal 은 완료할 수 없습니다. 재시도는 새 Goal 로 대체해야 합니다.',
      auditId: null,
    };
  }
  if (goal.supersededByGoalId !== null) {
    return {
      ok: false,
      code: 'superseded',
      reason: '다른 Goal 로 대체된 Goal 은 완료를 주장할 수 없습니다.',
      auditId: null,
    };
  }
  // 완료 조건이 없으면 무엇을 검증했는지 남길 수 없다(§10.1, §37).
  if (goal.acceptanceCriteria.length === 0) {
    return {
      ok: false,
      code: 'criteria-required',
      reason: 'Goal 을 완료하려면 완료 조건이 하나 이상 필요합니다.',
      auditId: null,
    };
  }

  const audit = approvedAuditFor(goal, audits);
  if (audit === null) {
    return {
      ok: false,
      code: 'audit-required',
      reason: `revision ${goal.revision} 을 승인한 Audit 기록이 없습니다. Audit 승인 후에 완료할 수 있습니다.`,
      auditId: null,
    };
  }

  // 이미 완료된 revision 을 새 감사·증거 없이 다시 완료로 주장할 수 없다(§55).
  const repeatedClaim =
    goal.completedRevision !== null &&
    goal.completedRevision === goal.revision &&
    !auditIsNewerThanCompletion(goal, audit) &&
    !hasFreshEvidence(audit, goal.acceptanceCriteria);
  if (repeatedClaim) {
    return {
      ok: false,
      code: 'no-new-evidence',
      reason: `revision ${goal.revision} 은 승인된 Audit(${audit.id})으로 이미 완료된 상태입니다. Loop 측정·작업·증거를 갱신하지 않고는 다시 완료를 주장할 수 없습니다.`,
      auditId: null,
    };
  }

  return { ok: true, code: null, reason: null, auditId: audit.id };
}

/**
 * revision 을 올려 이전 승인을 무효로 만든다(§10.1, §40).
 * 완료는 되돌리지 않는다 — 완료 후 조건이 바뀌면 새 작업을 새 항목으로 만든다.
 */
export function bumpGoalRevision(goal: GoalRecord, change: string): GoalRecord {
  const note = change.trim();

  return {
    ...goal,
    revision: goal.revision + 1,
    // 계약에 개정 사유 필드가 없어, 조건이 바뀐 경우 통과·증거 초기화로 반영한다.
    acceptanceCriteria:
      note.length === 0
        ? goal.acceptanceCriteria
        : goal.acceptanceCriteria.map((criterion) => ({
            ...criterion,
            passed: false,
            evidence: null,
          })),
    // 이전 revision 의 승인은 무효라 완료 revision 고정도 지운다(completedAt 은 유지).
    completedRevision: null,
    // 시도 횟수는 현재 revision 기준이라 새 revision 에서 0 부터 센다.
    auditAttemptCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

/** 재시도로 대체됐는지 — 가리키는 Goal 이 살아 있을 때만 유효 집합에서 빠진다(§10.2). */
export function isGoalSuperseded(goal: GoalRecord, goals: readonly GoalRecord[]): boolean {
  if (goal.supersededByGoalId === null) return false;
  return goals.some((candidate) => candidate.id === goal.supersededByGoalId);
}

/**
 * 차단 사유. 불가능 판정·일시정지·자식 미정리·미승인을 한 문구로 돌려준다(§10.4, §41).
 * 차단이 아니면 null 이라 호출부는 null 검사만 하면 된다.
 */
export function goalBlockedReason(
  goal: GoalRecord,
  children: readonly GoalRecord[],
  snapshot: HarnessSnapshot,
): string | null {
  if (goal.status === 'aborted') {
    return '중단된 Goal 입니다. 재시도는 새 Goal 로 대체해야 합니다.';
  }

  // 불가능 판정은 상위 그룹까지 막는다(§10.4) — 이후 작업으로 상태가 풀리지 않는다.
  const impossible = snapshot.audits.some(
    (audit) =>
      audit.goalId === goal.id && audit.revision === goal.revision && audit.verdict === 'impossible',
  );
  if (impossible) return 'Audit 이 불가능으로 판정한 Goal 입니다.';

  if (goal.status === 'paused') {
    const label = goal.pauseReason === null ? '사유 없음' : PAUSE_REASON_LABELS[goal.pauseReason];
    return `일시정지된 Goal 입니다(사유: ${label}).`;
  }
  if (goal.status === 'auditing') return 'Audit 이 아직 끝나지 않았습니다.';
  // 완료된 Goal 은 이후 자식·조건 변화로 차단으로 되돌리지 않는다(§40).
  if (goal.status === 'complete') return null;

  // 대체된 자식은 유효 집합이 아니라 차단 근거로 쓰지 않는다(§10.2).
  const valid = children.filter((child) => !isGoalSuperseded(child, snapshot.goals));
  const unfinished = valid.filter((child) => child.status !== 'complete');
  if (unfinished.length > 0) return `직계 하위 Goal ${unfinished.length}개가 완료되지 않았습니다.`;

  const unsettled = valid.filter((child) => !childGoalSettled(child, snapshot.audits));
  if (unsettled.length > 0) return `직계 하위 Goal ${unsettled.length}개의 Audit 승인이 없습니다.`;

  const verdict = canCompleteGoal(goal, snapshot.audits);
  return verdict.ok ? null : verdict.reason;
}
