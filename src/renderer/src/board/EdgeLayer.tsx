/**
 * 엣지 5종 SVG. 목업의 path 문자열·marker 정의(mock/index.html:1325-1354,1376-1415)를 그대로 쓴다.
 * 색·점선은 종류별로 여기서 고른다(좌표는 layout.ts 가 계산).
 */
import type { ReactElement } from 'react';
import type { BoardEdge, BoardEdgeKind } from './layout.ts';

/** 세션 계보선은 `.sess-edge` 클래스가 색·굵기를 정한다(mock.css:183-185). */
const SESS_CLASS: Partial<Record<BoardEdgeKind, string>> = {
  'group-worktree': 'sess-edge is-hub',
  'parent-session': 'sess-edge',
  audit: 'sess-edge',
  cross: 'sess-edge is-cross',
};

export function EdgeLayer(props: { edges: BoardEdge[] }): ReactElement {
  return (
    <g>
      <defs>
        <marker
          id="arw"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#51a2ff" />
        </marker>
        <marker
          id="arwl"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={5}
          markerHeight={5}
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#d4a300" />
        </marker>
        <marker
          id="sess-arw"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={5}
          markerHeight={5}
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#a78bfa" fillOpacity={0.7} />
        </marker>
      </defs>
      {props.edges.map((edge) => (
        <EdgePath key={edge.id} edge={edge} />
      ))}
    </g>
  );
}

function EdgePath(props: { edge: BoardEdge }): ReactElement {
  const edge = props.edge;
  if (edge.kind === 'worktree-parent') {
    // 워크트리 계층·merge 버스는 호박색 고정폭 선(mock/index.html:1398-1415).
    return (
      <path
        id={edge.id}
        d={edge.path}
        fill="none"
        stroke="#d4a300"
        strokeWidth={1.6}
        className={edge.active ? 'edge-flow' : 'edge-dash'}
        markerEnd="url(#arwl)"
      />
    );
  }
  const className = SESS_CLASS[edge.kind] ?? 'sess-edge';
  return (
    <path
      id={edge.id}
      d={edge.path}
      className={className}
      markerEnd="url(#sess-arw)"
      style={edge.active && edge.kind !== 'group-worktree' ? { strokeOpacity: 0.92 } : undefined}
    />
  );
}
