/**
 * Loop 전이(§10.3). 측정값은 하네스가 실행한 측정 명령의 결과만 쓴다 — 에이전트 자기 보고는 받지 않는다.
 */
import type {
  LoopDirection,
  LoopHistoryEntry,
  LoopRecord,
  LoopStatus,
  LoopStopReason,
} from '../../../../src/shared/contract/harness.ts';
import type { EnvelopeInput } from '../envelope.ts';
import type { RecordPayload } from '../records.ts';
import { loopRecord } from '../records.ts';
import type { TransitionResult } from './goal.ts';

export type LoopResult = TransitionResult<LoopRecord>;

export type StartLoopInput = {
  target: string;
  measureCommand: string;
  direction: LoopDirection;
} & EnvelopeInput & {
  goalId: string;
  sessionId?: string;
  maxIterations?: number;
};

export type MeasurementInput = {
  value: number;
  exitCode: number;
  stderr?: string;
  at: string;
};

const LOOP_STATUS_LABELS: Record<LoopStatus, string> = {
  idle: '대기',
  running: '실행 중',
  waiting: '대기 중',
  paused: '일시정지',
  done: '완료',
  stopped: '중지',
};

/** 오류 문구에 현재 상태를 한국어로 보여준다(사용자가 무엇이 막았는지 바로 안다). */
function loopStatusLabel(status: LoopStatus): string {
  return LOOP_STATUS_LABELS[status];
}

export function startLoop(input: StartLoopInput): LoopResult {
  const target = input.target.trim();
  const command = input.measureCommand.trim();

  if (target.length === 0) {
    return { ok: false, error: 'Loop 측정 목표가 비어 있습니다.' };
  }
  if (command.length === 0) {
    return { ok: false, error: 'Loop 측정 명령이 비어 있습니다.' };
  }
  // Loop 는 Goal 하나에 붙으므로 대상 없는 Loop 는 만들지 않는다(§10.3).
  if (input.goalId.length === 0) {
    return { ok: false, error: 'Loop 대상 Goal 이 필요합니다.' };
  }

  const at = input.at ?? new Date().toISOString();
  const payload: RecordPayload<LoopRecord> = {
    goalId: input.goalId,
    sessionId: input.sessionId ?? input.writer,
    target,
    measureCmd: command,
    direction: input.direction,
    currentValue: null,
    bestValue: null,
    iteration: 0,
    // 최대 회차 기본값은 스펙 미정(§10.3)이라 임의 기본값을 쓰고 호출부가 덮게 둔다.
    maxIterations: input.maxIterations ?? 50,
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
    startedAt: at,
    updatedAt: at,
  };

  return {
    ok: true,
    record: loopRecord(payload, {
      id: input.id,
      groupId: input.groupId,
      seq: input.seq,
      writer: input.writer,
      at,
    }),
  };
}

function bestOf(previous: number | null, next: number, direction: LoopDirection): number {
  if (previous === null) return next;
  return direction === 'min' ? Math.min(previous, next) : Math.max(previous, next);
}

export function recordMeasurement(loop: LoopRecord, input: MeasurementInput): LoopResult {
  // 측정 실행 실패와 측정값 0 을 구분하려면 값이 유한한 숫자여야 한다(계약 measureExitCode 주석).
  if (!Number.isFinite(input.value)) {
    return { ok: false, error: '측정값이 유한한 숫자가 아닙니다.' };
  }

  const iteration = loop.iteration + 1;
  const entry: LoopHistoryEntry = {
    iteration,
    value: input.value,
    at: input.at,
    improved: isImprovement(loop.bestValue, input.value, loop.direction),
  };

  return {
    ok: true,
    record: {
      ...loop,
      iteration,
      currentValue: input.value,
      bestValue: bestOf(loop.bestValue, input.value, loop.direction),
      measureExitCode: input.exitCode,
      measureStderr: input.stderr ?? null,
      measuredAt: input.at,
      history: [...loop.history, entry],
      updatedAt: input.at,
    },
  };
}

export function stopLoop(loop: LoopRecord, input: { reason: LoopStopReason }): LoopResult {
  if (loop.status === 'stopped' || loop.status === 'done') {
    return {
      ok: false,
      error: `이미 끝난 Loop 입니다(현재 ${loopStatusLabel(loop.status)}).`,
    };
  }

  return {
    ok: true,
    record: {
      ...loop,
      status: 'stopped',
      pauseKind: null,
      stopReason: input.reason,
      updatedAt: new Date().toISOString(),
    },
  };
}

/** 첫 측정에는 비교 기준이 없어 개선으로 본다(history 의 improved 표시 기준). */
export function isImprovement(
  previous: number | null,
  next: number,
  direction: LoopDirection,
): boolean {
  if (previous === null) return true;
  return direction === 'min' ? next < previous : next > previous;
}

/** 최고값 대비 `window` 회 연속 비개선이면 정체로 본다(§10.3 정체 판정 기본형). */
export function plateauReached(
  values: readonly number[],
  direction: LoopDirection,
  window: number,
): boolean {
  if (window < 1 || values.length === 0) return false;

  let best: number | null = null;
  let streak = 0;

  for (const value of values) {
    if (isImprovement(best, value, direction)) {
      best = value;
      streak = 0;
      continue;
    }

    streak += 1;
    if (streak >= window) return true;
  }

  return false;
}
