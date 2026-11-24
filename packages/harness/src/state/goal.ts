/**
 * Goal 전이(§10.1). 실패를 throw 하지 않고 결과 객체로 돌려준다 — 도구 호출부가 문구를 그대로 쓴다.
 */
import type {
  GoalRecord,
  GoalStatus,
  HarnessRecord,
  HarnessSnapshot,
  PauseReason,
} from '../../../../src/shared/contract/harness.ts';
import type { EnvelopeInput } from '../envelope.ts';
import type { RecordPayload } from '../records.ts';
import { goalRecord } from '../records.ts';

/** 전이 결과. 실패해도 예외를 던지지 않아 에이전트 도구가 오류 문구를 그대로 전달한다. */
export type TransitionResult<R extends HarnessRecord> =
  | { ok: true; record: R }
  | { ok: false; error: string };

export type GoalResult = TransitionResult<GoalRecord>;

/** 새 Goal 입력. 봉투 값(id·groupId·seq·writer)은 저장소에서 받아 호출부가 넘긴다. */
export type StartGoalInput = {
  objective: string;
  verificationContract?: string;
} & EnvelopeInput;

const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: '진행',
  auditing: '감사 중',
  complete: '완료',
  paused: '일시정지',
  aborted: '중단',
};

/** 오류 문구에 현재 상태를 한국어로 보여준다(사용자가 무엇이 막았는지 바로 안다). */
function goalStatusLabel(status: GoalStatus): string {
  return GOAL_STATUS_LABELS[status];
}

export function startGoal(input: StartGoalInput): GoalResult {
  const objective = input.objective.trim();
  // 목표 문장이 없으면 완료 여부를 판정할 대상이 없어 Goal 을 만들지 않는다.
  if (objective.length === 0) {
    return { ok: false, error: 'Goal 목표가 비어 있습니다.' };
  }

  const at = input.at ?? new Date().toISOString();
  const contract = input.verificationContract?.trim() ?? '';
  const payload: RecordPayload<GoalRecord> = {
    sessionId: input.writer,
    parentListItemId: null,
    parentGoalId: null,
    supersededByGoalId: null,
    objective,
    // 계약에 검증 계약 전용 필드가 없어 완료 조건 한 건으로 옮겨 적는다.
    acceptanceCriteria:
      contract.length === 0 ? [] : [{ id: 'c1', desc: contract, passed: false, evidence: null }],
    status: 'active',
    pauseReason: null,
    auditAttemptCount: 0,
    revision: 1,
    loopId: null,
    latestAuditId: null,
    createdAt: at,
    updatedAt: at,
    completedAt: null,
    completedRevision: null,
    archivedAt: null,
  };

  return {
    ok: true,
    record: goalRecord(payload, {
      id: input.id,
      groupId: input.groupId,
      seq: input.seq,
      writer: input.writer,
      at,
    }),
  };
}

/** 완료 전이는 감사 승인이 선행한다(§10.1) — 이 함수는 승인된 Goal 의 상태만 옮긴다. */
export function completeGoal(goal: GoalRecord, input: { summary: string }): GoalResult {
  if (goal.status !== 'active') {
    return {
      ok: false,
      error: `진행 중인 Goal 만 완료할 수 있습니다(현재 ${goalStatusLabel(goal.status)}).`,
    };
  }

  const at = new Date().toISOString();
  // 계약 GoalRecord 에 완료 요약 필드가 없어 summary 는 저장하지 않는다.
  void input.summary;

  return {
    ok: true,
    record: {
      ...goal,
      status: 'complete',
      pauseReason: null,
      completedAt: at,
      completedRevision: goal.revision,
      updatedAt: at,
    },
  };
}

export function pauseGoal(
  goal: GoalRecord,
  input: { reason: PauseReason; note?: string },
): GoalResult {
  if (goal.status !== 'active') {
    return {
      ok: false,
      error: `진행 중인 Goal 만 일시정지할 수 있습니다(현재 ${goalStatusLabel(goal.status)}).`,
    };
  }

  // 계약에 사유 메모 필드가 없어 note 는 저장하지 않는다.
  void input.note;

  return {
    ok: true,
    record: {
      ...goal,
      status: 'paused',
      pauseReason: input.reason,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function resumeGoal(goal: GoalRecord): GoalResult {
  if (goal.status !== 'paused') {
    return {
      ok: false,
      error: `일시정지된 Goal 만 재개할 수 있습니다(현재 ${goalStatusLabel(goal.status)}).`,
    };
  }

  return {
    ok: true,
    record: { ...goal, status: 'active', pauseReason: null, updatedAt: new Date().toISOString() },
  };
}

export function cancelGoal(goal: GoalRecord): GoalResult {
  // 완료·중단은 종료 상태라 앱 아카이브 기록을 덮어쓰지 않는다(§10.1).
  if (goal.status === 'complete') {
    return { ok: false, error: '완료된 Goal 은 중단할 수 없습니다.' };
  }
  if (goal.status === 'aborted') {
    return { ok: false, error: '이미 중단된 Goal 입니다.' };
  }

  return {
    ok: true,
    record: {
      ...goal,
      status: 'aborted',
      pauseReason: null,
      updatedAt: new Date().toISOString(),
    },
  };
}

/** 아카이브는 별도 엔티티가 아니라 `archivedAt` 표시다(§아카이브) — 전이 검사를 하지 않는다. */
export function archiveGoal(goal: GoalRecord, at: string): GoalRecord {
  return { ...goal, archivedAt: at };
}

export type GoalAggregate = {
  total: number;
  done: number;
  active: number;
  paused: number;
  canceled: number;
};

/** 그룹 인스펙터 집계. 감사 중(`auditing`)은 계약에 별도 칸이 없어 진행으로 센다. */
export function goalAggregate(snapshot: HarnessSnapshot): GoalAggregate {
  const aggregate: GoalAggregate = { total: 0, done: 0, active: 0, paused: 0, canceled: 0 };

  for (const goal of snapshot.goals) {
    aggregate.total += 1;
    if (goal.status === 'complete') {
      aggregate.done += 1;
    } else if (goal.status === 'paused') {
      aggregate.paused += 1;
    } else if (goal.status === 'aborted') {
      aggregate.canceled += 1;
    } else {
      aggregate.active += 1;
    }
  }

  return aggregate;
}
