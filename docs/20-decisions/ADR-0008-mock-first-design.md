---
type: adr
status: active
updated: 2026-11-24
tags: [adr, design, mock, ui]
---

# ADR-0008 디자인 기준은 목업 단일 소스로 두고, 목업에 없는 UI 만 Orca 디자인 언어로 설계한다

- 한 줄 요약: `mock/index.html` 을 디자인 단일 소스로 삼아 SPEC 문구와 충돌하면 목업을 따르고, 목업에 없는 화면만 Orca 디자인 언어(중성 배경·얇은 구분선·낮은 채도·명확한 상태색)로 설계한다.
- 상태: active
- 날짜: 2026-11-24

## 맥락

MVP 의 UI 요구사항은 "목업과 거의 동일"이고([[ADR-0007-electron-mock-parity-app]]), 목업은 `mock/COVERAGE.md` 의 51개 장면과 `mock/verify-planning.mjs` 로 이미 기준선 역할을 한다. 그런데 두 SPEC 은 같은 화면 요소를 서로 다른 이름과 위치로 서술한다. 세션 상세를 "상세"라고만 부르고 위치를 정하지 않는 문장과, 같은 우측 영역을 4탭 인스펙터로 규정하는 문장이 공존한다. 세션 노드가 보드에 언제 나타나는지도 SPEC 에는 없다.

이 상태로 구현하면 화면마다 해석이 갈리고, 왜 그렇게 만들었는지가 코드에만 남는다. 판단 기준을 하나로 고정할 필요가 있었다.

## 결정

1. **디자인 기준은 `mock/index.html` 하나다.** CSS 토큰·클래스·문구·구조를 그대로 옮긴다. 토큰은 `mock/index.html:10-20` 의 Orca 다크 테마 복사본(`--bg:#0a0a0a`, `--card:#171717`, `--line:rgb(255 255 255 / .07)`, `--text:#f0f0f0`, `--muted:#acacac`, `--dim:#737373`, `--green:#10b981`, `--amber:#d4a300`, `--red:#ff6568`, `--purple:#c084fc`)을 쓴다.
2. **목업과 SPEC 문구가 충돌하면 목업을 따른다.** 대신 무엇이 충돌했고 어떻게 처리했는지 worklog 에 남긴다. SPEC 문구는 이 ADR 로 고치지 않는다. 결정과 직접 모순되는 문장만 별도로 정리하고, 바꾼 문장은 worklog 에 인용한다.
3. **목업에 없는 UI 만 Orca 디자인 언어로 설계한다.** 중성 배경(바탕 `#0a0a0a`, 카드/패널 `#171717`), 1px 저채도 구분선(`rgb(255 255 255 / .07)`), 낮은 채도 텍스트(`#f0f0f0`/`#acacac`/`#737373`), 상태색은 green·amber·red·purple 네 개만 쓴다. 새 색·새 간격 체계를 만들지 않는다.

## 결과

목업 CSS 를 그대로 쓰므로 화면 사이 간격·색을 다시 정하지 않는다. 구현은 목업 장면 단위로 나눠 옮겼다.

| 영역 | 구현 파일 | 대응 목업 |
| --- | --- | --- |
| 앱 셸·뷰 전환 | `src/renderer/src/App.tsx`, `src/renderer/src/shell/{TopBar,ViewSwitch}.tsx` | `#view-board`·`#view-chat`·`#view-orch`·`#view-history` |
| 사이드바 | `src/renderer/src/shell/Sidebar.tsx` | `#wt-list`·하단 상태줄 |
| 보드 | `src/renderer/src/board/{GraphCanvas,NodeCard,EdgeLayer,MarkerLayer}.tsx`, `src/renderer/src/board/layout.ts` | `renderBoard()` SVG 카드·연결선·마커 |
| 뷰 4종 | `src/renderer/src/views/{ChatView,HistoryView,InspectorView,OrchestrationView}.tsx` | 각 뷰 섹션 |
| 인스펙터 탭 | `src/renderer/src/inspector/{GoalTab,ListTab,LoopTab,AuditTab,TodoBlock}.tsx` | `goalTabHTML`·`listTabHTML`·`loopTabHTML`·`auditTabHTML`·TODO 패널 |
| 채팅 | `src/renderer/src/chat/{SessionList,MessageStream,Composer,QuestionCards}.tsx` | 채팅 목록·로그·입력창·질문 카드 |
| 다이얼로그 | `src/renderer/src/dialogs/{GroupCreateDialog,SessionDialog,WorktreeDialog,DialogHost}.tsx` | 그룹 생성·새 세션·워크트리 팝업 |
| 4슬롯 배지 | `src/renderer/src/state/slot-badges.tsx` | `slotsHTML()` 의 `data-slot` 4개 |

비용은 목업이 틀린 부분도 따라간다는 점이다. 고치려면 목업을 먼저 고치고 앱을 맞춘다. 순서를 뒤집으면 다음 대조에서 목업과 앱이 다시 갈라진다.

## 대안과 기각 이유

| 대안 | 장점 | 단점 | 선택 여부 |
| --- | --- | --- | --- |
| SPEC 문구 우선 | 문장이 계약이므로 해석이 하나로 정리된다 | 두 SPEC 이 같은 패널을 다르게 서술해 화면이 갈라지고, "목업과 동일" 요구([[ADR-0007-electron-mock-parity-app]])와 51장면 대조가 기준을 잃는다 | 제외 |
| 새 디자인 시스템 신설 | 장기적으로 일관된 컴포넌트 세트를 얻는다 | MVP 기간에 목업 CSS 와 새 토큰을 두 벌 관리해야 하고, 51장면·E2E 기준을 다시 만들어야 한다. 얻는 것보다 드는 비용이 크다 | 제외 |
| 목업 단일 소스 + 목업 밖만 Orca 언어 | 목업 CSS·구조를 그대로 옮겨 재작업이 없고, 장면 대응표로 검증할 수 있다 | 목업에 없는 UI 는 매번 "가장 가까운 기존 클래스"를 골라야 한다 | 선택 |

## 알려진 충돌 2건과 처리

### 1) 세션 상세 위치 = 인스펙터

- **충돌:** [[SPEC-graph-pi-ade]] §2 5~6항은 노드를 선택하면 "상세"에 제목·모델·시작 시각·토큰과 세션 계보가 보이고 그 아래에 채팅이 붙는다고만 하며, 그 상세가 화면 어디인지 정하지 않는다. [[SPEC-hub-orchestration]] §10.5 는 같은 우측 영역을 Goal·List·Loop·Audit 4탭 인스펙터로 규정한다.
- **처리:** 목업의 단일 `aside.inspector`(`mock/index.html:639`)를 따른다. 앱은 인스펙터 한 곳에서 질문 카드·4탭·TODO 를 보여주고, 세션을 선택하면 같은 패널이 그 세션의 상세(제목·모델·토큰)와 계보를 겸한다. 근거는 `src/renderer/src/views/InspectorView.tsx` 다. 이 파일의 헤더 주석이 `mock/index.html:1540-1805` 의 4탭 구조를 근거로 들고, `isHub` 분기로 그룹 스코프(허브 4탭 + `groupAggregate` 집계)와 세션 스코프(그 세션 4탭)를 나눈다. 인스펙터 높이는 `InspectorView({ height })` prop 으로 받는다.

### 2) 세션 노드 등장 시점 = launch receipt 기반 즉시 생성

- **충돌:** 세션 데이터의 원천은 Pi 가 쓰는 JSONL 이고([[ADR-0002-pi-session-jsonl-data-source]], [[SPEC-graph-pi-ade]] 데이터 표의 "세션 메타 | Pi 세션 헤더(JSONL)"), 첫 레코드가 기록되기 전에는 세션 파일이 없다. 그러나 목업은 세션을 시작하면 즉시 보드 노드가 생긴다.
- **처리:** PTY 실행 영수증을 받는 즉시 임시 노드를 만든다. `src/main/pi/index.ts` 의 `noteLaunch()` 가 `PendingLaunch` 를 등록하고("PTY 실행 영수증을 등록해 JSONL 이 생기기 전에도 노드를 그린다"), `sessions()` 가 그 pending 항목을 세션 목록에 붙인다. 같은 경로에 실제 세션이 잡히면 pending 노드를 지운다.
- **한계:** 유예 창은 `PENDING_STATE_WINDOW_MS = 10 * 60_000` 이다. 창을 넘고 같은 경로에 세션 파일도 없으면 노드가 사라진다. 목업과 JSONL 사이의 타협이며, 값을 바꾸면 이 ADR 이 아니라 코드와 테스트를 함께 고친다.

## 되돌리기 비용

목업 기준을 버리면 51장면 대응표(`mock/COVERAGE.md`), E2E, 수용기준 판정이 함께 무효가 된다. 화면을 목업에서 떼어내는 결정은 이 ADR 을 supersede 하고 새 ADR 로 남긴다.

## 관련 문서

- [[ADR-0007-electron-mock-parity-app]]
- [[ADR-0002-pi-session-jsonl-data-source]]
- [[SPEC-hub-orchestration]]
- [[SPEC-graph-pi-ade]]
- [[50-worklog/2026-11/2026-11-24]]
