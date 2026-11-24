/**
 * 대화 화면. 좌측 세션 목록 + 우측 메시지/컴포저. 목업 `renderChat`(mock/index.html:1936-2040) 구조.
 * 메시지·전송·질문 응답은 chat/* 컴포넌트가 맡고, 여기서는 선택과 재조회 트리거만 관리한다.
 */
import { useEffect, useState, type ReactElement } from 'react';
import type { SessionState } from '../../../shared/contract/index.ts';
import { clockOf, shortModel } from '../board/layout.ts';
import { Composer } from '../chat/Composer.tsx';
import { MessageStream } from '../chat/MessageStream.tsx';
import { QuestionCards } from '../chat/QuestionCards.tsx';
import { SessionList } from '../chat/SessionList.tsx';
import { useApp, useDispatch, useSelectedGroup, useSessions } from '../state/hooks.ts';

export function ChatView(): ReactElement {
  const { selection } = useApp();
  const actions = useDispatch();
  const group = useSelectedGroup();
  const sessions = useSessions(group?.id ?? null);
  const [reloadKey, setReloadKey] = useState(0);

  const groupId = group?.id ?? null;
  useEffect(() => {
    if (groupId !== null) actions.loadSessions(groupId);
  }, [groupId, actions]);

  const selectedId =
    selection.kind === 'session'
      ? selection.sessionId
      : (sessions.find((session) => !session.isAudit)?.id ?? sessions[0]?.id ?? null);
  // 사이드바·인스펙터와 같은 스코프를 쓴다(수용기준 22 의 "그 세션 채팅 인라인").
  // 그룹 스코프에서는 허브 세션의 질문을 보여준다.
  const inlineSessionId = selectedId ?? sessions.find((session) => session.isHub)?.id ?? null;
  // 목업 `.chat-head`(mock/index.html:647) — 선택한 세션의 제목·상태·모델/시각/토큰.
  const current = sessions.find((session) => session.id === selectedId) ?? null;

  return (
    <div className="chat">
      {/* 목업 구조: .chat-side(세션 목록 패널) + .chat-main(mock/index.html:643-656). */}
      <div className="chat-side">
        <div className="side-head">세션</div>
        <div className="chat-list" aria-label="세션 목록">
          {sessions.length === 0 ? (
            <div className="hint">세션이 없습니다. 사이드바에서 새 세션을 시작하세요.</div>
          ) : (
            <SessionList sessions={sessions} selectedId={selectedId} />
          )}
        </div>
      </div>
      <div className="chat-main">
        <div className="chat-head">
          <span className="who">{current === null ? '세션 없음' : current.title}</span>
          {current === null ? null : (
            <span className={`pill ${current.state}`}>
              <span className="d" />
              {STATE_LABEL[current.state]}
            </span>
          )}
          <span className="meta">
            {current === null
              ? ''
              : `${shortModel(current.model)} · ${clockOf(current.startedAt)}–${clockOf(current.lastActivityAt)} · ${String(current.usage.input + current.usage.output)} tok`}
          </span>
        </div>
        <MessageStream
          sessionId={inlineSessionId}
          reloadKey={reloadKey}
          footer={<QuestionCards sessionId={inlineSessionId} />}
        />
        <Composer
          sessionId={selectedId}
          groupId={groupId}
          onSent={() => {
            setReloadKey((key) => key + 1);
          }}
        />
      </div>
    </div>
  );
}

/** 목업 `STATE_LABEL`(mock/index.html:748-750 의 pill 텍스트). */
const STATE_LABEL: Record<SessionState, string> = {
  running: '실행 중',
  done: '완료',
  idle: '대기',
  failed: '실패',
};
