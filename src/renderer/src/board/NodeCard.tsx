/**
 * 보드 카드 3종. 목업 SVG 골격(mock/index.html:1424-1480)을 JSX 로 옮겼다.
 * 클릭 선택은 GraphCanvas 가 위임으로 처리한다(목업의 closest 방식과 같다).
 *
 * 수용기준 13: 카드마다 Goal·List·Loop·Audit 슬롯 점 4개를 항상 그리고, 문제가 있으면
 * `data-attention="true"` 와 문제 슬롯 테두리로 강조한다(차단 > 질문대기 > 거부 > 진행).
 * 수용기준 22: pending 질문이 있으면 카드에 `?` 를 붙이고 `data-question="true"` 를 준다.
 * 색은 목업 SVG 와 같은 값(mock.css 토큰 --red/--amber/--green)만 쓴다.
 */
import type { ReactElement } from 'react';
import type { HarnessSnapshot, PiSession, SessionState } from '../../../shared/contract/index.ts';
import type {
  BoardGroupNode,
  BoardHubNode,
  BoardNode,
  BoardSessionNode,
  BoardWorktreeNode,
  SlotKind,
} from './layout.ts';
import { BOARD_METRICS, clipText, clockOf, shortModel, tokenK } from './layout.ts';
import {
  SLOT_COLORS,
  sessionSlotKinds,
  useApp,
  useVisibleWorktrees,
} from '../state/hooks.ts';
import {
  attentionRank,
  isExternalSession,
  pendingQuestionsOf,
  sessionSlots,
  topAttention,
  type SlotState,
} from '../state/selectors.ts';
import { SLOT_LEVEL_COLOR } from '../state/slot-badges.tsx';

/** 상태별 원 채움/테두리(mock/index.html:1437-1438). */
const STATE_FILL = {
  failed: '#ff656826',
  running: '#d4a30026',
  idle: '#73737326',
  done: '#10b98126',
} satisfies Record<SessionState, string>;

const STATE_STROKE = {
  failed: '#ff6568',
  running: '#d4a300',
  idle: '#a3a3a3',
  done: '#51a2ff',
} satisfies Record<SessionState, string>;

const SLOT_NAMES = ['goal', 'list', 'loop', 'audit'] as const;

type CardAttention = {
  slots: SlotKind[] | null;
  states: SlotState[];
  attention: boolean;
  top: SlotState | null;
  waiting: boolean;
};

function readAttention(session: PiSession, harness: HarnessSnapshot | null): CardAttention {
  const states = sessionSlots(harness, session.id);
  return {
    slots: sessionSlotKinds(session, harness),
    states,
    attention: attentionRank(states) > 0,
    top: topAttention(states),
    waiting: pendingQuestionsOf(harness, session.id).length > 0,
  };
}

/** 슬롯 점 4개(왼쪽에서 오른쪽으로 goal·list·loop·audit, 목업과 같이 오른쪽 정렬). */
function SlotDots(props: {
  attention: CardAttention;
  rightX: number;
  cy: number;
  spacing: number;
  radius: number;
}): ReactElement | null {
  const { slots, states } = props.attention;
  if (slots === null) return null;
  return (
    <>
      {slots.map((kind, index) => {
        const state = states[index];
        const level = state === undefined ? 'ok' : state.level;
        return (
          <circle
            key={SLOT_NAMES[index] ?? 'goal'}
            data-slot={SLOT_NAMES[index] ?? 'goal'}
            data-level={level}
            data-attention={level === 'ok' ? 'false' : 'true'}
            cx={props.rightX - index * props.spacing}
            cy={props.cy}
            r={props.radius}
            fill={SLOT_COLORS[kind]}
          />
        );
      })}
    </>
  );
}

/** 가장 심각한 문제 슬롯을 묶는 테두리 + 질문 대기 표시. */
function AttentionRing(props: {
  attention: CardAttention;
  rightX: number;
  cy: number;
  spacing: number;
  radius: number;
}): ReactElement | null {
  const top = props.attention.top;
  const left = props.rightX - 3 * props.spacing - props.radius - 2;
  const width = 3 * props.spacing + props.radius * 2 + 4;
  return (
    <>
      {props.attention.attention && top !== null ? (
        <rect
          data-attention-ring={top.kind}
          x={left}
          y={props.cy - props.radius - 3}
          width={width}
          height={props.radius * 2 + 6}
          rx={4.5}
          fill="none"
          stroke={SLOT_LEVEL_COLOR[top.level]}
          strokeWidth={0.9}
          opacity={0.9}
        />
      ) : null}
      {props.attention.waiting ? (
        <text x={left - 6} y={props.cy + 3} fill="#d4a300" fontSize={9} fontWeight={700}>
          ?
        </text>
      ) : null}
    </>
  );
}

function attentionTitle(session: PiSession, attention: CardAttention): string {
  const top = attention.top;
  return top === null ? session.title : `${session.title} · ${top.kind} ${top.label}`;
}

export function NodeCard(props: { node: BoardNode }): ReactElement {
  const node = props.node;
  if (node.kind === 'group') return <GroupBox node={node} />;
  if (node.kind === 'hub') return <HubCard node={node} />;
  if (node.kind === 'worktree') return <WorktreeCard node={node} />;
  return <SessionCard node={node} />;
}

/**
 * 그룹 경계 박스. 목업 렌더(mock/_evidence/mock-board.png)의 점선 박스 + 그룹 제목 줄을 옮겼다.
 * 점선·글자 색은 클래스(`.board-group-*`)가 정하고 값은 mock.css 끝에만 추가했다.
 * 클릭 대상이 아니므로 `.node` 를 붙이지 않는다(보드 위임 선택과 섞이지 않게).
 */
function GroupBox(props: { node: BoardGroupNode }): ReactElement {
  const node = props.node;
  return (
    <g className="board-group" data-group-box="true">
      <title>
        {node.title} · 세션 {node.sessionCount} · 워크트리 {node.worktreeCount}
      </title>
      <rect
        className="board-group-box"
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={12}
      />
      <text className="board-group-title" x={node.x + 13} y={node.y + 20}>
        {node.title}
      </text>
      <text
        className="board-group-meta"
        x={node.x + node.width - 13}
        y={node.y + 20}
        textAnchor="end"
      >
        {node.sessionCount} 세션 · 워크트리 {node.worktreeCount}
      </text>
    </g>
  );
}

function HubCard(props: { node: BoardHubNode }): ReactElement {
  const node = props.node;
  const { harness } = useApp();
  const attention = readAttention(node.session, harness);
  const dotX = node.x + node.width - 14;

  return (
    <g
      className="node"
      data-session={node.session.id}
      data-attention={attention.attention ? 'true' : 'false'}
      data-question={attention.waiting ? 'true' : 'false'}
    >
      <title>{attentionTitle(node.session, attention)}</title>
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={10}
        fill="#171717"
        stroke="#ffffff1f"
      />
      <circle cx={node.x + 18} cy={node.y + 19} r={4} fill="#d4a300" />
      <text x={node.x + 30} y={node.y + 23} fill="#f0f0f0" fontSize={12} fontWeight={600}>
        {node.session.title}
      </text>
      <text
        x={node.x + node.width - 14}
        y={node.y + 23}
        fill="#737373"
        fontSize={9.5}
        textAnchor="end"
      >
        {node.repoCount} 레포 관리
      </text>
      <SlotDots attention={attention} rightX={dotX} cy={node.y + 37} spacing={8} radius={2.3} />
      <AttentionRing attention={attention} rightX={dotX} cy={node.y + 37} spacing={8} radius={2.3} />
      <text x={node.x + 18} y={node.y + 41} fill="#737373" fontSize={9.5}>
        {shortModel(node.session.model)}
        {' · '}
        {clockOf(node.session.startedAt)}
        {' · '}
        {tokenK(node.session.usage)}
      </text>
    </g>
  );
}

function WorktreeCard(props: { node: BoardWorktreeNode }): ReactElement {
  const node = props.node;
  const { selection } = useApp();
  const selected = selection.kind === 'worktree' && selection.worktreeId === node.worktree.id;
  const worktree = node.worktree;
  return (
    <g className="wt-col" data-wt={worktree.id}>
      <rect
        className={selected ? 'wt-card is-sel' : 'wt-card'}
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={10}
        fill="#171717"
        stroke="#ffffff12"
      />
      {worktree.dirty ? (
        <circle
          className="dirty-dot"
          cx={node.x + node.width - 9}
          cy={node.y + 12}
          r={2.5}
          fill="#d4a300"
        />
      ) : null}
      <text x={node.x + 12} y={node.y + 17} fill="#737373" fontSize={10}>
        {worktree.repo}
      </text>
      <text x={node.x + 12} y={node.y + 33} fill="#f0f0f0" fontSize={12} fontWeight={600}>
        {worktree.branch}
      </text>
      <text
        x={node.x + node.width - 12}
        y={node.y + 33}
        fill="#737373"
        fontSize={9.5}
        textAnchor="end"
      >
        {node.sessionCount} 세션{worktree.dirty ? ' · 미커밋' : ''}
      </text>
      {node.sessionCount === 0 ? (
        <text
          x={node.x + node.width / 2}
          y={node.y + BOARD_METRICS.head + 16}
          fill="#737373"
          fontSize={10.5}
          textAnchor="middle"
        >
          세션 없음
        </text>
      ) : null}
    </g>
  );
}

function SessionCard(props: { node: BoardSessionNode }): ReactElement {
  const node = props.node;
  const session = node.session;
  const { harness, selection } = useApp();
  const worktrees = useVisibleWorktrees();
  /** 수용기준 11: Orca 가 관리하지 않는 경로의 세션은 `외부` 라벨을 달고 그대로 보여준다. */
  const external = isExternalSession(session, worktrees);
  const selected = selection.kind === 'session' && selection.sessionId === session.id;
  const stroke = STATE_STROKE[session.state];
  const attention = readAttention(session, harness);
  const dotX = node.columnX + node.columnWidth - 9;
  const meta = session.pendingLaunch
    ? `${shortModel(session.model)} · 시작 중`
    : `${shortModel(session.model)} · ${clockOf(session.startedAt)} · ${tokenK(session.usage)}`;

  return (
    <g
      className={selected ? 'node is-sel' : 'node'}
      data-session={session.id}
      data-attention={attention.attention ? 'true' : 'false'}
      data-question={attention.waiting ? 'true' : 'false'}
      data-external={external ? 'true' : 'false'}
    >
      <title>{attentionTitle(session, attention)}</title>
      {/* 목업 렌더처럼 각 세션 줄을 밝은 테두리 카드로 감싼다(mock.css 끝 `.board-session-card`). */}
      <rect
        className="board-session-card"
        x={node.columnX + 6}
        y={node.y - 9}
        width={node.columnWidth - 12}
        height={34}
        rx={7}
      />
      {session.state === 'running' ? (
        <circle
          className="node-ring"
          cx={node.x}
          cy={node.y}
          r={5}
          fill="none"
          stroke={stroke}
          strokeWidth={1.3}
        />
      ) : null}
      <circle
        cx={node.x}
        cy={node.y}
        r={5}
        fill={STATE_FILL[session.state]}
        stroke={stroke}
        strokeWidth={1.4}
      />
      <text x={node.x + 12} y={node.y + 4} fill="#f0f0f0" fontSize={11}>
        {clipText(session.title, session.isAudit ? 13 : 19)}
      </text>
      <text x={node.x + 12} y={node.y + 17} fill="#737373" fontSize={9}>
        {meta}
      </text>
      {external ? (
        <text className="badge external" x={node.x + 12} y={node.y + 29} fill="#a3a3a3" fontSize={8.5}>
          외부
        </text>
      ) : null}
      <SlotDots attention={attention} rightX={dotX} cy={node.y + 17} spacing={7} radius={2.1} />
      <AttentionRing attention={attention} rightX={dotX} cy={node.y + 17} spacing={7} radius={2.1} />
    </g>
  );
}
