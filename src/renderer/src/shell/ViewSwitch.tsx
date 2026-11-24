/**
 * 화면 전환. 목업은 사이드바 nav(mock/index.html:608-613)에 두었지만
 * 이 앱은 타이틀바 `.tb-mid` 자리에 같은 4개 화면을 놓는다.
 */
import type { CSSProperties, ReactElement } from 'react';
import type { ViewId } from '../../../shared/contract/index.ts';
import { useApp, useDispatch } from '../state/hooks.ts';

const VIEWS: ReadonlyArray<{ id: ViewId; label: string }> = [
  { id: 'board', label: '보드' },
  { id: 'chat', label: '대화' },
  { id: 'orchestration', label: '오케스트레이션' },
  { id: 'history', label: '히스토리' },
];

export function ViewSwitch(): ReactElement {
  const { settings } = useApp();
  const actions = useDispatch();
  return (
    // 타이틀바가 드래그 영역이므로 탭은 no-drag 로 되돌린다(안 그러면 클릭이 먹힌다).
    <div role="tablist" aria-label="화면 전환" style={{ display: 'flex', gap: 4, WebkitAppRegion: 'no-drag' } as CSSProperties}>
      {VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          role="tab"
          aria-selected={settings.view === view.id}
          className={settings.view === view.id ? 'btn primary' : 'btn ghost'}
          onClick={() => {
            actions.setView(view.id);
          }}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}
