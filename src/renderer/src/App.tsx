/**
 * 앱 셸. 목업 골격(mock/index.html:599-697)과 같은 순서: 타이틀바 → 사이드바 → 메인 → 보드/인스펙터.
 * 채팅·오케스트레이션·히스토리·인스펙터 본문은 다른 작업자가 채운다(각 view 파일).
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { ViewId } from '../../shared/contract/index.ts';
import { AppProvider } from './state/app-store.tsx';
import { useApp, useDispatch } from './state/hooks.ts';
import { AppBanner, TopBar } from './shell/TopBar.tsx';
import { Sidebar } from './shell/Sidebar.tsx';
import { GraphCanvas } from './board/GraphCanvas.tsx';
import { DialogHost, openDialog } from './dialogs/DialogHost.tsx';
import { ChatView } from './views/ChatView.tsx';
import { HistoryView } from './views/HistoryView.tsx';
import { InspectorView } from './views/InspectorView.tsx';
import { OrchestrationView } from './views/OrchestrationView.tsx';

const VIEW_META: Record<ViewId, { title: string; sub: string }> = {
  board: { title: '상태 보드', sub: '그룹 안 레포·워크트리와 관리 세션, 머지·루프 관계' },
  chat: { title: '대화', sub: '세션 메시지 열람과 프롬프트 전송' },
  orchestration: { title: '오케스트레이션', sub: 'run · task · worker 조회 (읽기 전용)' },
  history: { title: '히스토리', sub: '로컬 세션 본문 검색 · 인덱싱 진행' },
};

export default function App(): ReactElement {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell(): ReactElement {
  const { settings } = useApp();
  const meta = VIEW_META[settings.view];
  // 다이얼로그는 DialogHost 하나만 열고 닫는다. 사이드바·툴바는 이벤트만 던진다.
  const onCreateGroup = (): void => openDialog('group');

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <Sidebar onCreateGroup={onCreateGroup} />
        <main className="main">
          <AppBanner />
          <header className="topbar">
            <div>
              <h1>{meta.title}</h1>
              <p className="sub">{meta.sub}</p>
            </div>
            <div className="actions" />
          </header>
          <div className="views">
            {settings.view === 'board' ? (
              <section className="view" id="view-board" aria-label="상태 보드">
                <BoardView />
              </section>
            ) : null}
            {settings.view === 'chat' ? (
              <section className="view" id="view-chat" aria-label="대화">
                <ChatView />
              </section>
            ) : null}
            {settings.view === 'orchestration' ? (
              <section className="view" id="view-orch" aria-label="오케스트레이션">
                <OrchestrationView />
              </section>
            ) : null}
            {settings.view === 'history' ? (
              <section className="view" id="view-history" aria-label="히스토리">
                <HistoryView />
              </section>
            ) : null}
          </div>
        </main>
      </div>
      <DialogHost />
    </div>
  );
}

/** 목업은 보드 아래가 아니라 오른쪽에 인스펙터를 두지만, 이 앱은 높이 조절 하단 패널이다. */
function BoardView(): ReactElement {
  const { settings } = useApp();
  const actions = useDispatch();
  // 드래그 중에는 로컬 값으로만 그리고, 손을 떼는 순간에만 설정(디스크)에 커밋한다.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number } | null>(null);
  const height = dragHeight ?? settings.inspectorHeight;

  useEffect(() => {
    if (dragHeight === null) return;
    const onMove = (event: PointerEvent): void => {
      const base = start.current;
      if (base === null) return;
      const next = base.h + (base.y - event.clientY);
      setDragHeight(Math.min(560, Math.max(140, next)));
    };
    const onUp = (): void => {
      start.current = null;
      setDragHeight((current) => {
        if (current !== null) actions.setInspectorHeight(current);
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragHeight, actions]);

  return (
    <>
      <div className="slot-legend">
        <b>배지</b>
        <span>
          <i className="slot good" /> Goal
        </span>
        <span>
          <i className="slot active" /> List
        </span>
        <span>
          <i className="slot wait" /> Loop
        </span>
        <span>
          <i className="slot bad" /> Audit
        </span>
        <span className="pri">강조: 감사 문제 &gt; 차단·정지 &gt; 질문 &gt; 진행 &gt; 완료</span>
      </div>
      <div className="board" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div className="graph-wrap">
          <GraphCanvas />
        </div>
        <div
          className="insp-resize"
          role="separator"
          aria-label="인스펙터 높이 조절"
          title="끌어서 높이 조절"
          onPointerDown={(event) => {
            start.current = { y: event.clientY, h: height };
            setDragHeight(height);
          }}
        />
        <aside className="inspector" style={{ height, maxHeight: 'none' }}>
          <InspectorView height={height} />
        </aside>
      </div>
    </>
  );
}
