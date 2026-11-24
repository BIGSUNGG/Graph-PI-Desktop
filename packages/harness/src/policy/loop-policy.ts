/**
 * Loop 상한·종료 판정 정책(§10.3). 측정 실행은 하네스 몫이고 여기서는 값만 판정한다.
 * 측정값이 없으면 Audit 승인이 유일한 종료 근거라 상한만 적용한다.
 */
import type {
  GoalRecord,
  GoalStatus,
  LoopRecord,
  LoopStopReason,
  PauseReason,
} from '../../../../src/shared/contract/harness.ts';
import { plateauReached } from '../state/loop.ts';

/** 정체 판정 창. 계약에 창 크기 필드가 없어 3회 연속 비개선을 기본값으로 쓴다(§10.3 미정). */
const PLATEAU_WINDOW = 3;

const STOP_REASON_LABELS: Record<LoopStopReason, string> = {
  metric_target: '측정 목표 도달',
  max_iterations: '최대 회차',
  time_limit: '시간 상한',
  token_limit: '토큰 상한',
  plateau: '개선 정지',
  user: '사용자 중지',
  audit_approved: 'Audit 승인',
};

const BOUND_LABELS: Record<'max' | 'time' | 'tokens', string> = {
  max: '최대 회차',
  time: '시간 상한',
  tokens: '토큰 상한',
};

/** 시간 상한은 시작 시각부터 잰다 — 측정 대기 시간도 사용자에게는 소모된 시간이다. */
function elapsedSeconds(loop: LoopRecord): number {
  const started = Date.parse(loop.startedAt);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, (Date.now() - started) / 1000);
}

/** 상한 도달 판정 — 회차 → 시간 → 토큰 순으로 먼저 걸린 것을 알린다(§10.3). */
export function loopBoundReached(loop: LoopRecord): {
  reached: boolean;
  code: 'max' | 'time' | 'tokens' | null;
} {
  if (loop.maxIterations > 0 && loop.iteration >= loop.maxIterations) {
    return { reached: true, code: 'max' };
  }
  if (loop.timeLimitSeconds !== null && elapsedSeconds(loop) >= loop.timeLimitSeconds) {
    return { reached: true, code: 'time' };
  }
  if (loop.tokenLimit !== null && loop.tokensUsed >= loop.tokenLimit) {
    return { reached: true, code: 'tokens' };
  }
  return { reached: false, code: null };
}

/** 이력에서 숫자 측정값만 뽑는다 — 실패 회차는 `value` 가 null 이다. */
function measuredSeries(loop: LoopRecord): number[] {
  const series: number[] = [];
  for (const entry of loop.history) {
    if (entry.value !== null) series.push(entry.value);
  }
  if (series.length === 0 && loop.currentValue !== null) series.push(loop.currentValue);
  return series;
}

/**
 * 종료 이유 판정 — 목표 도달(개선 정지)·상한·사용자 정지·진행(§10.3, §56).
 * 계약에 목표 수치 필드가 없어 수치 도달 대신 개선 정지로 목표 도달을 판정한다.
 */
export function loopOutcome(
  loop: LoopRecord,
  values: readonly number[],
): { outcome: 'goal' | 'bounds' | 'stopped' | 'running'; reason: string } {
  // 감사 대기·Audit 승인은 측정으로 뒤집히지 않는다.
  if (loop.pauseKind === 'audit' || loop.status === 'done') {
    return { outcome: 'goal', reason: '측정 목표에 도달해 Audit 을 기다립니다.' };
  }
  if (loop.status === 'stopped') {
    const label = loop.stopReason === null ? '사유 없음' : STOP_REASON_LABELS[loop.stopReason];
    return { outcome: 'stopped', reason: `이미 중지된 Loop 입니다(사유: ${label}).` };
  }
  if (loop.pauseKind === 'error') {
    return { outcome: 'stopped', reason: '감사 오류로 멈춘 Loop 입니다. 재시도 정책을 확인하세요.' };
  }

  const bound = loopBoundReached(loop);
  if (bound.reached || loop.pauseKind === 'bounds') {
    const label = bound.code === null ? '이전 판정' : BOUND_LABELS[bound.code];
    return { outcome: 'bounds', reason: `Loop 상한에 도달했습니다(${label}).` };
  }

  const series = values.length > 0 ? values : measuredSeries(loop);
  if (plateauReached(series, loop.direction, PLATEAU_WINDOW)) {
    return { outcome: 'goal', reason: '측정값 개선이 멈춰 측정 목표에 도달한 것으로 봅니다.' };
  }

  return { outcome: 'running', reason: 'Loop 가 계속 실행 중입니다.' };
}

/** Loop 판정으로 Goal 을 멈춘다 — 완료·중단된 Goal 은 되돌리지 않는다(§40). */
function pauseGoalForLoop(
  goal: GoalRecord,
  pauseReason: PauseReason,
  at: string,
): GoalRecord {
  if (goal.status === 'complete' || goal.status === 'aborted') return goal;
  return { ...goal, status: 'paused', pauseReason, updatedAt: at };
}

/**
 * 판정에 따른 Loop·Goal 전이(§10.3, §57). 순수 함수라 저장은 호출부가 한다.
 * 목표 도달은 감사 대기(`paused`+`audit`)로 Goal 을 `paused` 로 멈추고,
 * 상한은 Loop 를 `stopped` 로 끝내고 Goal 을 `paused`(`loop_bounds`) 로 멈춘다.
 * 계약 `PauseReason` 에 `audit` 값이 없어 감사 대기는 `standby` 로 적는다(화면은 Loop 의 `pauseKind` 로 구분).
 */
export function onLoopOutcome(
  loop: LoopRecord,
  outcome: 'goal' | 'bounds',
  goal: GoalRecord,
  at: string = new Date().toISOString(),
): {
  loop: LoopRecord;
  goal: GoalRecord;
  goalStatus: GoalStatus;
  pauseReason: PauseReason | null;
} {
  if (outcome === 'goal') {
    const pausedGoal = pauseGoalForLoop(goal, 'standby', at);

    return {
      loop: {
        ...loop,
        status: 'paused',
        pauseKind: 'audit',
        stopReason: 'metric_target',
        updatedAt: at,
      },
      goal: pausedGoal,
      goalStatus: pausedGoal.status,
      pauseReason: pausedGoal.pauseReason,
    };
  }

  const bound = loopBoundReached(loop);
  const reason: LoopStopReason =
    bound.code === 'time' ? 'time_limit' : bound.code === 'tokens' ? 'token_limit' : 'max_iterations';
  const settledGoal = pauseGoalForLoop(goal, 'loop_bounds', at);

  return {
    loop: { ...loop, status: 'stopped', pauseKind: 'bounds', stopReason: reason, updatedAt: at },
    goal: settledGoal,
    goalStatus: settledGoal.status,
    pauseReason: settledGoal.pauseReason,
  };
}

/**
 * 감사 승인 후 Loop·Goal 종료(§57) — 목표에 도달해 감사 대기 중이던 Loop 를 `done` 으로 끝내고,
 * 승인을 완료 근거로 삼아 Goal 을 `complete` 로 옮기며 완료 revision 을 고정한다.
 * 중단·대체된 Goal 은 승인으로 되돌리지 않는다(§40) — 그 경우 Loop 만 끝낸다.
 */
export function onAuditApprovedAfterLoop(
  loop: LoopRecord,
  goal: GoalRecord,
  at: string = new Date().toISOString(),
): { loop: LoopRecord; goal: GoalRecord } {
  const doneLoop: LoopRecord = {
    ...loop,
    status: 'done',
    pauseKind: null,
    stopReason: 'audit_approved',
    updatedAt: at,
  };

  if (goal.status === 'aborted' || goal.supersededByGoalId !== null) {
    return { loop: doneLoop, goal };
  }

  return {
    loop: doneLoop,
    goal: {
      ...goal,
      status: 'complete',
      pauseReason: null,
      completedAt: goal.completedAt ?? at,
      completedRevision: goal.revision,
      updatedAt: at,
    },
  };
}
