/**
 * 대화 화면 좌측 세션 목록. 목업 `renderChat` 의 `#chat-list`(mock/index.html:1936-1960) 를 옮겼다.
 * 좌측 칸이 212px 라서(mock/index.html:342) 제목 줄 아래에 모델·마지막 활동·토큰 합계를 한 줄 더 둔다.
 */
import type { ReactElement } from 'react';
import type { PiSession } from '../../../shared/contract/index.ts';
import { clockOf, shortModel, tokenK } from '../board/layout.ts';
import { useDispatch, useVisibleWorktrees } from '../state/hooks.ts';
import { isExternalSession, lineageDepth } from '../state/selectors.ts';

export function SessionList(props: { sessions: PiSession[]; selectedId: string | null }): ReactElement {
  const actions = useDispatch();
  // 계보를 평면 목록에 깊이로 드러낸다(수용기준 7).
  const depth = lineageDepth(props.sessions);
  const worktrees = useVisibleWorktrees();
  /** 수용기준 11: Orca 가 관리하지 않는 경로의 세션은 목록에서도 `외부` 라벨을 단다. */
  return (
    <>
      {props.sessions.map((session) => {
        const active = props.selectedId !== null && props.selectedId === session.id;
        return (
          <div key={session.id}>
            <button
              type="button"
              className={`chat-item ${session.state}${active ? ' is-active' : ''}`}
              title={session.title}
              data-depth={String(depth.get(session.id) ?? 0)}
              style={{ paddingLeft: 10 + 12 * (depth.get(session.id) ?? 0) }}
              onClick={() => {
                actions.select({ kind: 'session', sessionId: session.id });
              }}
            >
              <span className="d" />
              <span className="chat-name">{session.title}</span>
              {isExternalSession(session, worktrees) ? (
                <span className="badge external muted">외부</span>
              ) : null}
              {session.isAudit ? <span className="audit-badge">AUDIT</span> : null}
            </button>
            <div className="hint">
              {shortModel(session.model)} ·{' '}
              {session.pendingLaunch ? '시작 중' : clockOf(session.lastActivityAt)} · {tokenK(session.usage)} tok
            </div>
          </div>
        );
      })}
    </>
  );
}
