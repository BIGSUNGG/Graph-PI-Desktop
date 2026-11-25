/**
 * 인스펙터 인라인 대화(수용기준 9). 보드에서 세션을 고른 뒤 화면을 옮기지 않고
 * 그 세션 터미널로 프롬프트를 보낸다. 전송 경로는 채팅 화면과 같은 `pi:send` 다.
 *
 * 외부 세션(그룹 워크트리 밖 cwd)은 보낼 수 없다 — 채팅 화면과 같은 규칙을 따른다.
 */
import { useState, type ReactElement } from 'react';
import type { PiSession, WorktreeView } from '../../../shared/contract/index.ts';
import { isExternalSession } from '../state/selectors.ts';
import { readApi } from './MessageStream.tsx';

export type InlineChatProps = {
  session: PiSession;
  /** 그룹 워크트리 목록(외부 세션 판정에 쓴다). */
  worktrees: readonly WorktreeView[];
};

export function InlineChat(props: InlineChatProps): ReactElement {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const external = isExternalSession(props.session, props.worktrees);

  const send = async (): Promise<void> => {
    const body = text.trim();
    const client = readApi();
    if (body === '' || client === null || external) return;

    setBusy(true);
    setError(null);
    const result = await client.invoke('pi:send', { sessionId: props.session.id, text: body });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setText('');
  };

  return (
    <div className="insp-chat" data-session={props.session.id}>
      <textarea
        className="insp-chat-input"
        rows={2}
        value={text}
        placeholder={external ? '외부 세션에는 보낼 수 없습니다.' : '이 세션에 바로 보내기'}
        disabled={external || busy}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Enter 전송, Shift+Enter 줄바꿈 — 채팅 화면과 같다.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <button
        className="btn primary small"
        type="button"
        disabled={external || busy || text.trim() === ''}
        onClick={() => void send()}
      >
        {busy ? '보내는 중…' : '보내기'}
      </button>
      {error === null ? null : (
        <div className="warn" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
