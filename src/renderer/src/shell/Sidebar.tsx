/**
 * 사이드바: 그룹 → 워크트리 → 세션 계보. 목업 `renderSidebar`(mock/index.html:1060-1157) 구조를 따른다.
 * 그룹 목록은 파생값이다(state/hooks.ts 주석 참조). 그룹 생성 다이얼로그는 다른 작업자가 붙인다.
 *
 * 수용기준 13: 세션 행·그룹 행에 Goal·List·Loop·Audit 4슬롯 배지를 항상 그리고,
 *               문제가 있는 슬롯은 `data-attention="true"` 로 강조한다.
 * 수용기준 22: pending 질문이 있는 세션 행은 `session-attn` + `?` + `data-question="true"` 로 강조한다.
 */
import { useState, type ReactElement } from 'react';
import type { PiSession, WorktreeView } from '../../../shared/contract/index.ts';
import type { SessionTreeRow, SlotKind } from '../board/layout.ts';
import { clockOf, sessionRows } from '../board/layout.ts';
import {
  sessionSlotKinds,
  useApp,
  useDispatch,
  useGroups,
  useSelectedGroup,
  useSessions,
  useVisibleWorktrees,
} from '../state/hooks.ts';
import {
  attentionRank,
  groupAggregate,
  isExternalSession,
  pendingQuestionsOf,
  sessionSlots,
  type SlotState,
} from '../state/selectors.ts';
import { SlotBadges } from '../state/slot-badges.tsx';
import { DIALOG_EVENT } from '../dialogs/DialogHost.tsx';
import { ViewSwitch } from './ViewSwitch.tsx';

/** 워크트리 점 색은 소속 세션 상태 집계에서 나온다(mock/index.html:1065-1067). */
function worktreeDot(rows: SessionTreeRow[]): string {
  if (rows.some((row) => row.session.state === 'running')) return 'running';
  if (rows.some((row) => row.session.state === 'failed')) return 'failed';
  return 'done';
}

export function Sidebar(props: { onCreateGroup: () => void }): ReactElement {
  const { harness, orca, selection } = useApp();
  const actions = useDispatch();
  const groups = useGroups();
  const activeGroup = useSelectedGroup();
  const worktrees = useVisibleWorktrees();
  const sessions = useSessions(activeGroup === null ? null : activeGroup.id);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const pending = new Set(pendingQuestionsOf(harness, null).map((question) => question.sessionId));
  const aggregate = groupAggregate(harness, sessions);
  const hub = sessions.find((session) => session.isHub) ?? null;
  /** 수용기준 11: 그룹 워크트리 경로 목록. 외부 세션 행은 `외부` 라벨을 단다. */

  const renderWorktree = (worktree: WorktreeView): ReactElement => {
    const rows = sessionRows(sessions, worktree.path);
    const selected = selection.kind === 'worktree' && selection.worktreeId === worktree.id;
    const dot = worktreeDot(rows);
    return (
      <div className="wt-item" key={worktree.id}>
        <button
          className={selected ? 'wt-row is-sel' : 'wt-row'}
          type="button"
          aria-expanded="true"
          onClick={() => {
            actions.select({ kind: 'worktree', worktreeId: worktree.id });
          }}
        >
          <span className={`d ${dot}`} />
          <span className="wt-name">
            {worktree.repo} · {worktree.branch}
          </span>
          {worktree.dirty ? <span className="wt-dirty">미커밋</span> : null}
          <span className="wt-chev">▾</span>
        </button>
        <button
          className="wt-del"
          type="button"
          title="워크트리 삭제"
          aria-label={`${worktree.repo} · ${worktree.branch} 워크트리 삭제`}
          onClick={() => {
            // 삭제는 반드시 확인 다이얼로그를 거친다(SPEC G2, graph-pi-ade 198).
            window.dispatchEvent(
              new CustomEvent(DIALOG_EVENT, { detail: { kind: 'worktree-delete', worktreeId: worktree.id } }),
            );
          }}
        >
          ×
        </button>
        <div className="wt-sess">
          {rows.length === 0 ? (
            <div className="wt-sess-empty">세션 없음</div>
          ) : (
            rows.map((row) => renderSession(row.session, row.guide, row.cross))
          )}
        </div>
      </div>
    );
  };

  const renderSession = (
    session: PiSession,
    guide: string,
    cross: PiSession | null,
  ): ReactElement => {
    const selected = selection.kind === 'session' && selection.sessionId === session.id;
    const waiting = pending.has(session.id);
    const states: SlotState[] = sessionSlots(harness, session.id);
    const attention = attentionRank(states) > 0;
    const kinds: SlotKind[] | null = sessionSlotKinds(session, harness);
    return (
      <button
        key={session.id}
        className={`wt-sess-row${selected ? ' is-sel' : ''}${attention ? ' session-attn' : ''}`}
        type="button"
        data-session={session.id}
        data-attention={attention ? 'true' : 'false'}
        data-question={waiting ? 'true' : 'false'}
        onClick={() => {
          actions.select({ kind: 'session', sessionId: session.id });
        }}
      >
        {guide === '' ? null : <span className="sess-guide">{guide}</span>}
        <span className={`d ${session.state}`} />
        <span className="wt-sess-name">{session.title}</span>
        {isExternalSession(session, worktrees) ? (
          <span className="badge external muted">외부</span>
        ) : null}
        {session.isAudit ? <span className="audit-badge">AUDIT</span> : null}
        {cross === null ? null : (
          <span className="sess-parent-mark" title={`상위: ${cross.title}`}>
            ↖
          </span>
        )}
        {waiting ? (
          <span
            className="wt-sess-time"
            style={{ color: 'var(--amber)' }}
            title="질문 대기"
            data-question-mark="true"
          >
            ?
          </span>
        ) : null}
        <span className="wt-sess-time">
          {session.pendingLaunch ? '시작 중' : clockOf(session.lastActivityAt)}
        </span>
        <SlotBadges slots={states} kinds={kinds} />
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <button className="nav-search" type="button">
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
        >
          <title>세션 검색</title>
          <circle cx={11} cy={11} r={7} />
          <path d="m20 20-3.5-3.5" />
        </svg>
        검색
        <span className="kbd">
          <i>Ctrl</i>
          <i>K</i>
        </span>
      </button>

      {/* 목업 순서: 검색 → 내비 4개(개수 배지) → 워크스페이스 트리 → 하단(mock/index.html:607-618). */}
      <ViewSwitch />

      <div className="side-sec">
        <div className="side-head">
          워크스페이스<span>{groups.length}</span>
          <button className="side-add" type="button" title="새 그룹" onClick={props.onCreateGroup}>
            +
          </button>
        </div>
        <div>
          {groups.map((group) => {
            const isActive = activeGroup !== null && activeGroup.id === group.id;
            const isClosed = closed[group.id] === true;
            const groupWorktrees = isActive ? worktrees : [];
            const groupAttention = isActive && aggregate.problemCount > 0;
            return (
              <div
                key={group.id}
                className={`grp${isClosed ? ' is-closed' : ''}${isActive ? ' is-active' : ''}`}
                data-group={group.id}
                data-attention={groupAttention ? 'true' : 'false'}
              >
                <button
                  className="grp-head"
                  type="button"
                  onClick={() => {
                    // 세션을 보던 중에 활성 그룹 머리를 누르면 접기가 아니라 그룹(허브) 스코프로 돌아간다(수용기준 33).
                    if (isActive && selection.kind !== 'group') {
                      actions.select({ kind: 'group', groupId: group.id });
                      return;
                    }
                    if (isActive) {
                      setClosed((prev) => ({ ...prev, [group.id]: prev[group.id] !== true }));
                      return;
                    }
                    actions.select({ kind: 'group', groupId: group.id });
                  }}
                >
                  <span className="chev">▾</span>
                  <span className="grp-name">{group.name}</span>
                  <em>{group.note}</em>
                  {isActive && hub !== null ? (
                    <SlotBadges
                      slots={aggregate.slots}
                      kinds={sessionSlotKinds(hub, harness)}
                    />
                  ) : (
                    <SlotBadges slots={[]} />
                  )}
                  <span className="grp-more">⋯</span>
                  <b>{groupWorktrees.length}</b>
                </button>
                <div className="grp-body">
                  {groupWorktrees.length === 0 ? (
                    <div className="wt-sess-empty">
                      {isActive ? '워크트리 없음' : '그룹을 선택하면 워크트리를 읽습니다'}
                    </div>
                  ) : (
                    groupWorktrees.map(renderWorktree)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="side-foot">
        <label className="field">
          워크스페이스
          <select
            value={activeGroup === null ? '' : activeGroup.id}
            onChange={(event) => {
              const next = event.target.value;
              if (next !== '') actions.select({ kind: 'group', groupId: next });
            }}
          >
            {groups.length === 0 ? <option value="">그룹 없음</option> : null}
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            actions.refreshOrca();
          }}
        >
          Orca 새로고침
        </button>
        <p className="hint">
          {orca.reachable ? 'Orca 연결됨' : 'Orca 연결 없음'}
          {orca.stale ? ' · 지난 값' : ''}
          <br />
          세션은 로컬 Pi 세션 파일을 읽어 표시합니다.
        </p>
      </div>
    </aside>
  );
}
