/**
 * 질문 답변 후 세션 재개(수용기준 26). 앱(ipc)과 실측 스크립트가 같은 경로를 쓰도록 여기에 모은다.
 *
 * 계약: 답변이 기록된 뒤 그 세션이 계속 진행하도록 짧은 프롬프트를 보낸다.
 * 살아 있는 터미널이 있으면 거기로 보내고, 없으면 같은 cwd 로 다시 띄운다.
 */
import type { PiSession } from '../../../src/shared/contract/index.ts';

export const RESUME_PROMPT = '질문에 답변이 기록되었습니다. 기록된 답을 기준으로 계속 진행하세요.';

export type ResumeOrca = {
  sendPrompt(terminalId: string, text: string): Promise<{ ok: boolean; error?: string }>;
};

export type ResumeInput = {
  session: Pick<PiSession, 'worktreeId' | 'model'>;
  /** 그 세션의 살아 있는 터미널 id. 없으면 null. */
  terminalId: string | null;
};

export async function resumeSession(
  orca: ResumeOrca,
  input: ResumeInput,
): Promise<{ ok: boolean; error?: string }> {
  if (input.terminalId === null) {
    return { ok: false, error: '재개할 터미널이 없습니다.' };
  }
  const sent = await orca.sendPrompt(input.terminalId, RESUME_PROMPT);
  return sent.ok ? { ok: true } : { ok: false, error: sent.error ?? '재개 프롬프트 전송 실패' };
}
