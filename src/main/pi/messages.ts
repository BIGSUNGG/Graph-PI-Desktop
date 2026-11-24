/**
 * 에이전트 메시지 전달 판정(수용기준 24·25).
 *
 * 보낸 세션이 하네스 `say` 로 남긴 메시지는 앱이 받는 세션에 전달한다. 판정만 순수 함수로 두고
 * 실행(프롬프트 주입·세션 재개·상태 기록)은 IPC 핸들러가 맡는다 — hub.ts 와 같은 이유다.
 * 프로세스 없이 규칙을 테스트할 수 있어야 한다.
 */
import type { AgentMessageRecord } from '../../shared/contract/harness.ts';
import type { PiSession } from '../../shared/contract/pi.ts';

/** 전달 계획. 실행은 호출부(IPC)가 한다. */
export type DeliveryPlan =
  /** 받는 세션이 살아 있다 — 이미 붙은 PTY 터미널로 본문을 보낸다. */
  | { action: 'deliver'; terminalId: string }
  /** 받는 세션이 비활성이다 — 같은 cwd 에서 Pi 를 다시 띄우고 본문을 첫 프롬프트로 준다. */
  | { action: 'resume'; cwd: string; model: string | null }
  /** 지금은 보낼 수 없다 — 사유를 남기고 메시지는 보관한다. */
  | { action: 'fail'; reason: string };

export type DeliveryInput = {
  /** 대기(pending) 상태의 메시지. */
  message: AgentMessageRecord;
  /** 이 그룹에서 방금 읽은 세션 목록. */
  sessions: readonly PiSession[];
  /** 받는 세션 cwd 에 묶인 PTY 터미널. 모르면 null. */
  terminalId: string | null;
  /** 판정 시각. 재시도·만료 같은 시간 규칙이 붙을 자리다(현재 분기는 시각에 의존하지 않는다). */
  now: number;
};

/**
 * 받는 세션의 상태로 전달 방법을 고른다.
 *
 * - 실행 중 + 터미널 있음 → 그 터미널로 전달한다(재개 불필요).
 * - 실행 중 + 터미널 모름 → 보낼 곳이 없으므로 실패로 남긴다.
 * - idle·done·failed → 같은 cwd 에서 세션을 다시 띄우고 본문을 첫 프롬프트로 준다(자동 재개).
 *   cwd 를 모르면 재개할 수 없으므로 실패로 남긴다.
 * - 세션이 목록에 없음 → PTY 만 살아 있으면 그 터미널로 보내고, 아니면 찾을 수 없다고 실패한다.
 *   세션 파일은 첫 턴 뒤에 생기므로(A2) 실행 직후에는 PTY 만 있고 세션이 목록에 없을 수 있다.
 *   그때 실패로 남기면 전달 기회를 잃는다.
 */
export function planDelivery(input: DeliveryInput): DeliveryPlan {
  const recipient = input.sessions.find((session) => session.id === input.message.toSessionId) ?? null;

  if (recipient === null) {
    if (input.terminalId !== null) return { action: 'deliver', terminalId: input.terminalId };
    return { action: 'fail', reason: '수신 세션을 찾을 수 없습니다' };
  }

  if (recipient.state === 'running') {
    if (input.terminalId !== null) return { action: 'deliver', terminalId: input.terminalId };
    return { action: 'fail', reason: '실행 중인 수신 세션의 터미널을 찾을 수 없습니다' };
  }

  // idle·done·failed 는 모두 "지금 입력을 받을 수 없는" 상태다 — 같은 cwd 로 재개한다.
  const cwd = recipient.worktreeId ?? '';
  if (cwd === '') return { action: 'fail', reason: '수신 세션의 작업 경로를 알 수 없습니다' };
  return { action: 'resume', cwd, model: recipient.model };
}
