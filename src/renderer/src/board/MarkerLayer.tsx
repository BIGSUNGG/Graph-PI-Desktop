/**
 * 노드 위에 얹는 표시. 감사 세션 배지(mock/index.html:1444)와 교차 상위 표시를 그린다.
 */
import type { ReactElement } from 'react';
import type { BoardMarker } from './layout.ts';

export function MarkerLayer(props: { markers: BoardMarker[] }): ReactElement {
  return (
    <g>
      {props.markers.map((marker) =>
        marker.kind === 'audit' ? (
          <text
            key={marker.id}
            x={marker.x}
            y={marker.y}
            fill="#d8b4fe"
            fontSize={7.5}
            fontWeight={600}
            textAnchor="end"
          >
            {marker.label}
          </text>
        ) : (
          <text key={marker.id} x={marker.x} y={marker.y} fill="#c4b5fd" fontSize={9} textAnchor="end">
            <title>{marker.title}</title>
            {marker.label}
          </text>
        ),
      )}
    </g>
  );
}
