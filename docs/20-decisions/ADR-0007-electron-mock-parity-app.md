---
type: decision
status: accepted
updated: 2026-11-24
tags: [adr, app-structure, contract, harness]
---

# ADR-0007 Electron 단일 앱 + 목업 충실 재구현 + 하네스 CLI

- 한 줄 요약: MVP 는 Electron 단일 앱(루트)과 `packages/harness` 로 나누고, 두 진영이 같은 계약(`src/shared/contract/`)과 같은 데이터 디렉터리를 공유한다. Pi 에이전트는 하네스 상태를 CLI 로만 바꾼다.

## 맥락

[[SPEC-graph-pi-ade]] 와 [[SPEC-hub-orchestration]] 를 실제 프로그램으로 완성해야 한다. 제약은 셋이다.

1. UI/UX 는 `mock/index.html` 과 거의 동일해야 한다(CSS·구조·문구 포함).
2. 허브 세션(LLM)이 Goal/List/Loop/Audit/TODO 상태를 실제로 바꿀 수 있어야 한다.
3. Pi 세션이 주는 정보는 Pi 가 쓰는 JSONL 뿐이다([[ADR-0002-pi-session-jsonl-data-source]]).

## 결정

### 1) 앱은 루트, 하네스는 워크스페이스 패키지

- Electron 앱은 루트에 둔다(`src/main`, `src/preload`, `src/renderer`, `electron.vite.config.ts`). [[ADR-0006-electron-vite-single-app-with-contract]] 의 경로를 그대로 따른다.
- 하네스는 `packages/harness` 로 분리한다. 이유는 **Pi 세션이 앱 프로세스 없이도 상태를 읽고 쓸 수 있어야** 하기 때문이다. 앱 안에만 있으면 CLI 를 만들 수 없다.
- 루트 `package.json` 은 npm workspaces 이고 하네스는 `@graph-pi/harness` 로 노출한다.

### 2) 계약은 `src/shared/contract/` 한 곳, 값도 함께 export

- 렌더러·메인·하네스·테스트가 모두 여기만 import 한다. 계약을 복제하면 필드가 갈라진다(과거 삭제된 프로토타입이 이 문제로 재사용 불가였다).
- `index.ts` 는 `export *` 로 타입과 **값**(`PRESETS`, `MODELS`, `PRESET_KINDS`, `DEFAULT_SETTINGS`, `EMPTY_*`)을 함께 내보낸다. `export type *` 로 두면 런타임 값이 사라져 렌더러가 컴파일되지 않는다(실제로 한 번 깨졌다).

### 3) 데이터는 `~/.graph-pi/data/` 하나

| 파일 | 내용 | 쓰는 주체 |
| --- | --- | --- |
| `groups.json` | 그룹·워크트리 연결·터미널 매핑 | 앱 |
| `app-settings.json` | 마지막 그룹·뷰·인스펙터 상태 | 앱 |
| `index.sqlite` | 세션/메시지 FTS5 검색 인덱스(파생물, 재생성 가능) | 앱 |
| `groups/<groupId>/state.jsonl` | Goal·List·Loop·Audit·TODO·Question·Message 레코드 | 하네스 CLI(에이전트), 앱은 읽기 |

`app.getPath('userData')` 를 쓰지 않은 이유: Electron 없이 도는 하네스 CLI 가 같은 파일을 찾아야 한다. `GRAPH_PI_DATA_DIR` 로 덮어쓸 수 있게 해 테스트·E2E 가 임시 디렉터리를 쓴다.

### 4) 에이전트의 쓰기 경로는 CLI 하나

`node packages/harness/src/cli.ts <command>` 가 레코드를 직접 만들어 append 한다. 앱은 그 파일을 재생(replay)해 화면을 그린다. Pi 도구(플러그인) 표면은 MVP 범위 밖으로 두고, bash 로 CLI 를 호출하는 경로를 인정한다.

## 대안과 버린 이유

- **단일 패키지에 하네스를 넣기**: Pi 가 앱 없이 상태를 갈 수 없어 허브 시나리오가 목업 흉내로 끝난다.
- **SQLite 를 상태 저장소로 쓰기**: 에이전트가 sqlite3 CLI 없이 쓰기 어렵고, append-only 로그가 재생·감사에 유리하다. SQLite 는 검색 인덱스로만 쓴다.
- **Pi 도구 플러그인을 먼저 만들기**: Pi 플러그인 API 표면이 이번 범위에서 검증되지 않았다. CLI 는 검증 비용이 낮고 디버깅이 쉽다.
- **목업을 React 로 재작성하며 디자인 개선**: "목업과 동일"이 요구사항이다. 개선은 목업에 없는 부분(인스펙터 높이 조절 등)에만 적용한다.

## 결과

- 좋은 점: 앱·하네스·테스트가 한 계약을 공유하고, 상태가 텍스트 로그라 사후 검증이 쉽다. 목업 CSS 를 그대로 쓸 수 있다.
- 비용: 계약 파일이 커지면 세 진영이 같은 PR 에서 움직여야 한다. 계약 변경은 항상 이 ADR 범위의 결정으로 다룬다.

## 관련 문서

- [[ADR-0002-pi-session-jsonl-data-source]]
- [[ADR-0006-electron-vite-single-app-with-contract]]
- [[mvp-app-and-harness]]
- [[build-and-verify]]
