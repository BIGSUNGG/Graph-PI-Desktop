/**
 * 앱 셸. 목업 골격(mock/index.html:599-697)과 같은 순서:
 * 레일 상단 헤더(`.titlebar`) → `.workspace`(좌측 레일 + main) → 보드(그래프 + 오른쪽 인스펙터).
 *
 * - 화면 전환은 목업처럼 좌측 레일 내비로 옮겼다(Sidebar 안 `ViewSwitch`).
 * - 인스펙터는 목업처럼 보드 그리드의 오른쪽 고정 폭 열이다(`.board` 2열, mock.css:145).
 *   예전 하단 리사이즈 패널과 `settings.inspectorHeight` 는 더 이상 쓰지 않는다(계약 필드는 유지).
 * 채팅·오케스트레이션·히스토리 본문은 각 view 파일이 맡는다.
 */
import type { ReactElement } from 'react';
import type { ViewId } from '../../shared/contract/index.ts';
import { AppProvider } from './state/app-store.tsx';
import { useApp } from './state/hooks.ts';
import { AppBanner, RailHeader } from './shell/RailHeader.tsx';
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
  const { settings, status } = useApp();
  const meta = VIEW_META[settings.view];
  // Orca 연결이 없으면 세션·워크트리 생성은 막는다(수용기준 2). 로딩 중(status null)에는 막지 않는다.
  const canLaunch = status === null || status.orca === 'ok';
  const launchHint = canLaunch ? undefined : 'Orca CLI 응답이 없어 실행할 수 없습니다';
  // 다이얼로그는 DialogHost 하나만 열고 닫는다. 레일·상단 액션은 이벤트만 던진다.
  const onCreateGroup = (): void => openDialog('group');

  return (
    <div className="app">
      <RailHeader />
      <div className="workspace">
        <Sidebar onCreateGroup={onCreateGroup} />
        <main className="main">
          <AppBanner />
          {/* 목업 `header.topbar`(mock/index.html:633-636): 제목 + 설명 + 오른쪽 액션. */}
          <header className="topbar">
            <div>
              <h1>{meta.title}</h1>
              <p className="sub">{meta.sub}</p>
            </div>
            <div className="actions">
              {settings.view === 'board' ? (
                <>
                  <button
                    className="btn"
                    type="button"
                    disabled={!canLaunch}
                    title={launchHint}
                    onClick={() => {
                      openDialog('worktree');
                    }}
                  >
                    워크트리
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={!canLaunch}
                    title={launchHint}
                    onClick={() => {
                      openDialog('session');
                    }}
                  >
                    새 세션
                  </button>
                </>
              ) : null}
            </div>
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

/** 목업 보드: 배지 범례 → `.board`(그래프 + 오른쪽 인스펙터) 2열(mock/index.html:633-641). */
function BoardView(): ReactElement {
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
      <div className="board">
        <div className="graph-wrap">
          <GraphCanvas />
        </div>
        <InspectorView />
      </div>
    </>
  );
}
