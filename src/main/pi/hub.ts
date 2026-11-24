/**
 * 허브 세션 재생성 판정(수용기준 15).
 *
 * 허브 세션 파일이 사라지면 그룹은 다시 관리 세션을 가져야 한다. 판정만 순수 함수로 두고
 * 실행(세션 시작·기록)은 IPC 핸들러가 맡는다. 그래야 테스트가 프로세스 없이 규칙을 검증할 수 있다.
 */
import type { PiSession } from '../../shared/contract/pi.ts';

/** 같은 그룹에서 재시도를 반복하지 않도록 두는 최소 간격. */
export const HUB_RETRY_MS = 60_000;

export type HubPlanInput = {
  /** 그룹 폴더 경로. 비어 있으면 허브 재생성 대상이 아니다. */
  hubCwd: string;
  /** 그룹 파일에 저장된 허브 세션 id. */
  hubSessionId: string | null;
  /** 이미 띄운 허브 PTY 터미널 id. */
  hubTerminalId: string | null;
  sessions: readonly PiSession[];
  now: number;
  /** 마지막 재생성 시도 시각(ISO). 없으면 null. */
  lastAttemptAt: string | null;
};

export type HubPlan =
  /** 살아 있는 세션을 허브로 채택한다(재생성 불필요). */
  | { action: 'adopt'; sessionId: string }
  /** 허브가 없으니 새로 띄운다. */
  | { action: 'launch' }
  /** 아무것도 하지 않는다(이미 있음·재시도 대기·대상 아님). */
  | { action: 'none'; reason: 'no-cwd' | 'alive' | 'retry-wait' };

/**
 * 정규화 경로 비교(대소문자·구분자·끝 구분자 무시).
 * Windows 는 `C:\a` 와 `c:/a/` 를 같은 경로로 봐야 한다.
 */
export function samePath(left: string, right: string): boolean {
  const norm = (value: string): string => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const a = norm(left);
  return a !== '' && a === norm(right);
}

/**
 * 허브 상태 판정.
 *
 * - `hubSessionId` 가 살아 있으면 그대로 둔다(그룹 파일이 단일 기준).
 * - 허브 세션이 없고 `hubCwd` 를 cwd 로 하는 세션이 있으면 그 세션을 허브로 채택한다.
 *   (사용자가 그룹 폴더에서 직접 시작한 세션도 관리 세션 자격이 있다.)
 * - 둘 다 없고 마지막 시도가 `HUB_RETRY_MS` 보다 오래됐으면 재생성을 요청한다.
 */
export function planHub(input: HubPlanInput): HubPlan {
  const { hubCwd, hubSessionId, sessions, now, lastAttemptAt } = input;
  if (hubCwd.trim() === '') return { action: 'none', reason: 'no-cwd' };

  const alive = hubSessionId === null ? undefined : sessions.find((session) => session.id === hubSessionId);
  if (alive !== undefined) return { action: 'none', reason: 'alive' };

  const candidate = sessions
    .filter((session) => session.worktreeId !== null && samePath(session.worktreeId, hubCwd))
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0];
  if (candidate !== undefined) return { action: 'adopt', sessionId: candidate.id };

  if (lastAttemptAt !== null && Number.isFinite(Date.parse(lastAttemptAt))) {
    if (now - Date.parse(lastAttemptAt) < HUB_RETRY_MS) return { action: 'none', reason: 'retry-wait' };
  }
  return { action: 'launch' };
}
