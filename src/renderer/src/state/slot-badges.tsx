/**
 * Goal·List·Loop·Audit 4슬롯 배지(HTML). 사이드바·인스펙터가 같은 마크업을 쓴다.
 * 구조는 목업 `slotsHTML`(mock/index.html:938-942)의 `.slot-badges`/`.slot` 그대로다.
 *
 * 강조는 `data-attention="true"` 와 mock.css 토큰 색(--red/--amber)만 쓴다.
 * mock.css 에 "문제 슬롯" 강조 클래스가 없어 테두리만 인라인으로 준다.
 */
import type { ReactElement } from 'react';
import type { SlotKind as SlotTone } from '../board/layout.ts';
import { SLOT_KIND_LABELS, type SlotLevel, type SlotState } from './selectors.ts';

/** SVG(보드 카드)는 CSS 변수를 못 쓰므로 mock.css 토큰 값을 그대로 쓴다(mock.css:10). */
export const SLOT_LEVEL_COLOR: Record<SlotLevel, string> = {
  ok: '#10b981',
  wait: '#d4a300',
  issue: '#ff6568',
  block: '#ff6568',
};

/** HTML 강조용 CSS 변수 이름. */
const LEVEL_VAR: Record<SlotLevel, string> = {
  ok: 'var(--green)',
  wait: 'var(--amber)',
  issue: 'var(--red)',
  block: 'var(--red)',
};

/** 상태 색(goal/list/loop/audit 순서)은 `sessionSlotKinds` 값을 그대로 받아 쓴다. */
function toneClass(kind: SlotTone | undefined): string {
  if (kind === undefined || kind === 'none') return 'slot';
  return `slot ${kind}`;
}

/** 레벨만 있을 때의 대체 색. `ok` 는 기록 없음/진행을 구분할 수 없어 기본(회색)으로 둔다. */
function levelClass(level: SlotLevel): string {
  if (level === 'wait') return 'slot wait';
  if (level === 'issue' || level === 'block') return 'slot bad';
  return 'slot';
}

export function SlotBadges(props: {
  slots: readonly SlotState[];
  /** `sessionSlotKinds` 결과. 없으면 레벨에서 색을 유추한다. */
  kinds?: readonly SlotTone[] | null;
}): ReactElement {
  const kinds = props.kinds ?? null;
  return (
    <span className="slot-badges" data-slots={props.slots.length} title="Goal · List · Loop · Audit">
      {props.slots.map((slot, index) => {
        const attention = slot.level !== 'ok';
        const kind = kinds === null ? undefined : kinds[index];
        const label = `${SLOT_KIND_LABELS[slot.kind]} · ${slot.label}`;
        return (
          <i
            key={slot.kind}
            className={kind === undefined ? levelClass(slot.level) : toneClass(kind)}
            data-slot={slot.kind}
            data-level={slot.level}
            data-attention={attention ? 'true' : 'false'}
            data-label={slot.label}
            title={label}
            aria-label={label}
            style={
              attention
                ? { outline: `1px solid ${LEVEL_VAR[slot.level]}`, outlineOffset: '1px' }
                : undefined
            }
          />
        );
      })}
    </span>
  );
}
