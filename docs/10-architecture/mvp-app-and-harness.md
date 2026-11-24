---
type: architecture
status: active
updated: 2026-11-24
tags: [architecture, electron, harness]
---

# mvp-app-and-harness — 모듈 경계와 데이터 흐름

- 한 줄 요약: 렌더러는 계약 타입만 알고 IPC 로만 바깥과 이야기한다. 메인은 Orca·Pi·하네스 세 어댑터를 묶고, 하네스 상태는 JSONL 로그, 검색은 SQLite 파생 인덱스다.

결정 근거는 [[20-decisions/ADR-0007-electron-mock-parity-app]], 데이터 소스는 [[20-decisions/ADR-0002-pi-session-jsonl-data-source]].

## 레이어

| 레이어 | 위치 | 책임 | 금지 |
| --- | --- | --- | --- |
| 계약 | `src/shared/contract/` | 모든 타입·상수(PRESETS/MODELS/DEFAULT_SETTINGS) | Electron·React import |
| 메인 어댑터 | `src/main/orca/`, `src/main/pi/`, `src/main/harness/`, `src/main/db/` | 외부 세계(CLI·파일·SQLite)를 계약 타입으로 정규화 | 렌더러 코드 참조 |
| 메인 조립 | `src/main/index.ts`, `src/main/ipc.ts`, `src/main/state/` | 서비스 생성·수명, IPC 22채널, 앱 설정/그룹 저장 | 화면 그리기 |
| 프리로드 | `src/preload/index.ts` | `window.api.invoke/subscribe` 만 노출 | 도메인 로직 |
| 렌더러 | `src/renderer/src/` | 목업과 같은 DOM 구조·CSS 로 그리기, 로컬 UI 상태 | `ipcRenderer` 직접 접근, 파일 접근 |
| 하네스 패키지 | `packages/harness/src/` | 레코드 봉투·빌더·재생·JSONL 저장·에이전트 CLI | Electron import |

의존 방향은 한쪽이다: 렌더러 → 계약 ← 메인 → 외부. 하네스도 계약만 import 한다.

## 데이터 흐름

```
Orca CLI ──(3초 폴링, --json 봉투만 신뢰)──> src/main/orca/poller ─┐
Pi 세션 JSONL ──(2초 워처, 헤더+message 레코드)──> src/main/pi ────┼─> ipc.ts ──(invoke/evt:push)──> app-store ──> views
groups/<id>/state.jsonl ──(append-only 재생)──> harness/bridge ────┤
index.sqlite(FTS5) ──(세션/메시지 인덱스)──> src/main/db ──────────┘
```

- 모든 외부 호출은 실패를 **결과 객체**로 돌려준다(throw 금지). IPC 경계에서 예외가 화면을 깨지 않게 하기 위해서다.
- 세션 상태(`running`/`done`/`idle`)는 저장값이 아니라 파생값이다: 마지막 활동이 120초 이내면 running.
- 허브 항목 표시 상태도 파생이다: `childGoalsFrozen` 이전은 대기, 이후 하위 Goal 이 done 이면 완료, 아니면 차단.

## 상태 저장

| 대상 | 위치 | 형식 | 쓰기 주체 |
| --- | --- | --- | --- |
| 그룹·워크트리·터미널 매핑 | `<dataDir>/groups.json` | JSON(tmp+rename) | 앱 |
| 앱 설정 | `<dataDir>/app-settings.json` | JSON | 앱 |
| 하네스 상태 | `<dataDir>/groups/<groupId>/state.jsonl` | append-only JSONL, `seq` 증가, 같은 `id` 는 마지막 승 | 하네스 CLI(에이전트) |
| 검색 인덱스 | `<dataDir>/index.sqlite` | FTS5(파생물) | 앱(재생성 가능) |

`dataDir` 기본값은 `~/.graph-pi/data`, `GRAPH_PI_DATA_DIR` 로 덮어쓴다. E2E 는 임시 디렉터리를 준다.

## 렌더러 구조

목업의 DOM 골격을 유지한다: 타이틀바 → 사이드바 → 메인(뷰) + 인스펙터. 뷰는 4개(`board`/`chat`/`orchestration`/`history`)이고 `.view` 섹션 id 는 `view-board`, `view-chat`, `view-orch`, `view-history` 로 고정한다(E2E 가 이 id 로 확인한다).

| 파일 | 책임 |
| --- | --- |
| `state/app-store.tsx` | IPC 구독·초기 로드·선택/설정 반영. 유일한 전역 상태 |
| `board/layout.ts` | 좌표·슬롯·마커 계산(목업 `renderBoard` 수식 이식) |
| `board/{GraphCanvas,NodeCard,EdgeLayer,MarkerLayer}.tsx` | 그래프 렌더 |
| `views/InspectorView.tsx` | 4탭(Goal/List/Loop/Audit) + 그룹/세션 스코프 |
| `views/ChatView.tsx` + `chat/*` | 세션 목록·메시지·컴포저·질문 카드·`@` 참조 |
| `dialogs/DialogHost.tsx` | `#dialog` 백드롭 하나로 3종 다이얼로그 관리(로컬 상태) |

## 관련 문서

- [[20-decisions/ADR-0007-electron-mock-parity-app]]
- [[20-decisions/ADR-0003-electron-and-sqlite-index]]
- [[30-specs/SPEC-mvp-acceptance]]
- [build-and-verify](../40-guides/build-and-verify.md)
