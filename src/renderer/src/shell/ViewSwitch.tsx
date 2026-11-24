/**
 * 좌측 레일 내비게이션. 목업 `nav.nav` + 4× `button.nav-item` + 개수 배지(mock/index.html:608-613).
 *
 * - 탭 라벨은 e2e 계약대로 `보드`/`대화`/`오케스트레이션`/`히스토리` 를 유지한다
 *   (e2e/app.spec.ts:24-26, e2e/flows.spec.ts:11-16). 목업 문구(`상태 보드`/`채팅`) 대신 고정 라벨을 쓴다.
 * - 배지는 실제 데이터 개수다(가짜 값 금지). 0 이면 `0` 을 그대로 표시한다.
 *   보드 = 그룹 세션 수 · 대화 = 진행 중(running) 세션 수 · 오케스트레이션 = Orca run 수 · 히스토리 = 인덱싱된 세션 수.
 */
import type { ReactElement } from 'react';
import type { ViewId } from '../../../shared/contract/index.ts';
import { useApp, useDispatch, useSelectedGroup, useSessions } from '../state/hooks.ts';

type NavItem = {
  id: ViewId;
  label: string;
  /** 배지 옆 title 설명(값의 출처를 화면에서도 알 수 있게). */
  countLabel: string;
  icon: ReactElement;
};

/** 목업 아이콘 path(mock/index.html:609-612). */
const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'board',
    label: '보드',
    countLabel: '세션',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
        <rect x={3} y={3} width={7} height={7} rx={1.5} />
        <rect x={14} y={3} width={7} height={7} rx={1.5} />
        <rect x={3} y={14} width={7} height={7} rx={1.5} />
        <rect x={14} y={14} width={7} height={7} rx={1.5} />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: '대화',
    countLabel: '진행 중 세션',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
        <path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.6-5A8 8 0 1 1 21 12z" />
      </svg>
    ),
  },
  {
    id: 'orchestration',
    label: '오케스트레이션',
    countLabel: 'run',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
        <circle cx={6} cy={6} r={2.5} />
        <circle cx={6} cy={18} r={2.5} />
        <circle cx={18} cy={12} r={2.5} />
        <path d="M8.5 6H13a2.5 2.5 0 0 1 2.5 2.5v1M8.5 18H13a2.5 2.5 0 0 0 2.5-2.5v-1" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: '히스토리',
    countLabel: '인덱싱된 세션',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
        <circle cx={12} cy={12} r={8.5} />
        <path d="M12 7.5V12l3 2" />
      </svg>
    ),
  },
];

export function ViewSwitch(): ReactElement {
  const { settings, index, orca } = useApp();
  const actions = useDispatch();
  const group = useSelectedGroup();
  const sessions = useSessions(group === null ? null : group.id);

  // 실데이터에서만 계산한다. 그룹·Orca·인덱스가 없으면 0 이다(목업처럼 0 을 표시).
  const counts: Record<ViewId, number> = {
    board: sessions.length,
    chat: sessions.filter((session) => session.state === 'running').length,
    orchestration: orca.orchestration.runs.length,
    history: index.totalSessions,
  };

  return (
    <nav className="nav" id="nav" role="tablist" aria-label="화면 전환">
      {NAV_ITEMS.map((item) => {
        const active = settings.view === item.id;
        const count = counts[item.id];
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={item.label}
            className={active ? 'nav-item is-active' : 'nav-item'}
            data-view={item.id}
            title={`${item.label} · ${item.countLabel} ${String(count)}`}
            onClick={() => {
              actions.setView(item.id);
            }}
          >
            {item.icon}
            {item.label}
            <b>{count}</b>
          </button>
        );
      })}
    </nav>
  );
}
