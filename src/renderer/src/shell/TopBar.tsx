/**
 * 타이틀바(드래그 영역)와 배너. 목업 골격은 mock/index.html:600-604,631-632.
 * 드래그는 CSS(`.titlebar`)와 무관하게 동작하도록 인라인으로도 건다.
 */
import type { CSSProperties, ReactElement } from 'react';
import type { AppStatus } from '../../../shared/contract/index.ts';
import { useApp, useDispatch, useSelectedGroup } from '../state/hooks.ts';
import { ViewSwitch } from './ViewSwitch.tsx';

// SAFETY: -webkit-app-region 은 표준 CSS 속성이 아니라 CSSProperties 에 없다. 값은 문자열 리터럴 하나뿐이다.
const DRAG_REGION = { WebkitAppRegion: 'drag' } as unknown as CSSProperties;

export function TopBar(): ReactElement {
  const { status } = useApp();
  const group = useSelectedGroup();
  const orca = status === null ? 'unknown' : status.orca;

  return (
    <header className="titlebar" style={DRAG_REGION}>
      <div className="tb-left">
        <span className="mark" />
        <span className="tb-name">Graph PI</span>
        <span className="tb-tag">{group === null ? '그룹 없음' : group.name}</span>
      </div>
      <div className="tb-mid" style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        <ViewSwitch />
      </div>
      <div className="tb-right">
        <span className={pillClass(orca)} title={status === null ? undefined : status.orcaBin}>
          <span className="d" />
          {orcaLabel(orca)}
        </span>
      </div>
    </header>
  );
}

/** 목업은 배너를 `.main` 안에 둔다(mock/index.html:631-632). 그래서 타이틀바와 분리해 내보낸다. */
export function AppBanner(): ReactElement | null {
  const { banner } = useApp();
  const actions = useDispatch();
  if (banner === null) return null;
  return (
    <div className="banner">
      <span className="dot" />
      <span>{banner.message}</span>
      {banner.actionLabel === null ? null : (
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            actions.refreshOrca();
          }}
        >
          {banner.actionLabel}
        </button>
      )}
      <button
        className="btn ghost"
        type="button"
        aria-label="배너 닫기"
        onClick={() => {
          actions.dismissBanner();
        }}
      >
        ×
      </button>
    </div>
  );
}

/** 목업은 오프라인에 `.err` 를 붙이지만 그 클래스는 CSS 에 없다 — 실제 규칙이 있는 `.failed` 를 쓴다. */
function pillClass(orca: AppStatus['orca']): string {
  if (orca === 'ok') return 'pill';
  if (orca === 'offline') return 'pill failed';
  return 'pill idle';
}

function orcaLabel(orca: AppStatus['orca']): string {
  if (orca === 'ok') return 'Orca 연결됨';
  if (orca === 'offline') return 'Orca 연결 없음';
  return 'Orca 확인 중';
}
