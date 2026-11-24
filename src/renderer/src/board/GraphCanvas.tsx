/**
 * 보드 캔버스. `layoutBoard` 결과를 절대좌표 SVG 로 그리고, 클릭은 위임으로 선택만 바꾼다.
 * 확대는 CSS(`#graph`)와 `.graph-wrap` 의 `overflow:auto` 가 담당한다(목업 viewBox 줌 대체).
 */
import { useMemo, type MouseEvent, type ReactElement } from 'react';
import type { BoardNode } from './layout.ts';
import { BOARD_METRICS, layoutBoard } from './layout.ts';
import { EdgeLayer } from './EdgeLayer.tsx';
import { MarkerLayer } from './MarkerLayer.tsx';
import { NodeCard } from './NodeCard.tsx';
import { useDispatch, useSelectedGroup, useSessions, useVisibleWorktrees } from '../state/hooks.ts';

/** 접힘 상태는 사이드바 로컬 UI 라 보드 레이아웃에는 넘기지 않는다. */
const NO_COLLAPSED: Record<string, boolean> = {};

export function GraphCanvas(): ReactElement {
  const group = useSelectedGroup();
  const worktrees = useVisibleWorktrees();
  const sessions = useSessions(group === null ? null : group.id);
  const dispatch = useDispatch();

  const layout = useMemo(
    () =>
      layoutBoard({
        groups: group === null ? [] : [group],
        worktrees,
        sessions,
        collapsed: NO_COLLAPSED,
      }),
    [group, worktrees, sessions],
  );

  const hasWorktree = layout.nodes.some((node) => node.kind === 'worktree');
  const hintY = layout.nodes.length === 0 ? 48 : BOARD_METRICS.pad + BOARD_METRICS.hubH + 32;

  const handleClick = (event: MouseEvent<SVGSVGElement>): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const sessionEl = target.closest('[data-session]');
    const sessionId = sessionEl === null ? null : sessionEl.getAttribute('data-session');
    if (sessionId !== null) {
      dispatch.select({ kind: 'session', sessionId });
      return;
    }
    const worktreeEl = target.closest('[data-wt]');
    const worktreeId = worktreeEl === null ? null : worktreeEl.getAttribute('data-wt');
    if (worktreeId !== null) dispatch.select({ kind: 'worktree', worktreeId });
  };

  return (
    <svg
      id="graph"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMin meet"
      role="img"
      aria-label="세션 그래프"
      onClick={handleClick}
      style={{
        // 목업은 보드 폭에 맞춰 viewBox 를 축소해 전체를 보여준다(mock `applyView`).
        // CSS `width:100%` 를 살리고, 보드가 짧을 때는 원래 폭을 넘지 않게 막는다.
        width: '100%',
        maxWidth: `${layout.width}px`,
        height: 'auto',
        maxHeight: 'none',
      }}
    >
      {layout.nodes.map((node) => (
        <NodeCard key={keyOf(node)} node={node} />
      ))}
      <EdgeLayer edges={layout.edges} />
      <MarkerLayer markers={layout.markers} />
      {hasWorktree ? null : (
        <text x={24} y={hintY} fill="#737373" fontSize={12}>
          빈 그룹 — 워크트리를 추가하세요.
        </text>
      )}
    </svg>
  );
}

function keyOf(node: BoardNode): string {
  if (node.kind === 'group') return 'group-box';
  if (node.kind === 'hub') return `hub-${node.session.id}`;
  if (node.kind === 'worktree') return `wt-${node.worktree.id}`;
  return `s-${node.session.id}`;
}
