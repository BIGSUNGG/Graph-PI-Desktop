---
type: adr
status: active
updated: 2026-11-22
tags: [stack, electron, architecture]
---

# ADR-0006 단일 Electron 앱을 electron-vite로 만들고 메인 프로세스 계약 뒤에서만 데이터에 접근한다

- 한 줄 요약: main/preload/renderer를 electron-vite 하나로 빌드하고, Orca CLI·Pi 세션 파일·SQLite 접근은 main의 어댑터에만 두며, 렌더러는 preload로 노출한 타입 계약만 쓴다. 원격 접속은 나중에 이 계약 뒤 transport만 IPC에서 HTTP/WS로 바꿔 붙인다.
- 상태: active
- 날짜: 2026-11-22

## 맥락

[[ADR-0003-electron-and-sqlite-index]] 가 스택을 Electron + React + TypeScript + SQLite FTS5로 정했고, [[ADR-0005-mvp-scope-both-specs-and-remote-access]] 가 원격 접속을 MVP에서 구현하지 않되 구조만 열어두기로 했다. 그래서 데이터·명령 경계를 어디에 두느냐가 남은 결정이었다.

같은 날 확인한 환경은 Node 26.13.0, npm 11.20.0이고, npm 레지스트리 최신 버전은 electron 45.4.1, vite 8.3.8, electron-vite 6.0.0, react 19.3.1, better-sqlite3 13.2.0, typescript 7.0.2다. electron-vite 6.0.0의 peer는 `vite ^6 || ^7 || ^8`, engines는 `node ^20.19 || >=22.12`라 현재 환경에서 조건은 맞는다. 다만 이 조합의 실제 빌드는 아직 실행하지 않았다.

## 결정

1. **단일 Electron 앱을 electron-vite로 빌드한다.** main·preload·renderer 세 타깃을 한 툴체인이 처리하고 개발 중 HMR을 쓴다.
2. **데이터 접근은 main 프로세스의 어댑터에만 둔다.** Orca CLI 호출, Pi 세션 JSONL 파싱, SQLite FTS5 인덱스는 `src/main/` 안의 어댑터가 소유한다.
3. **렌더러는 preload가 노출한 타입 계약으로만 main과 대화한다.** `contextIsolation`을 켜고 `nodeIntegration`을 끈다. 렌더러에서 `fs`·`child_process`·Orca CLI 직접 호출·직접 HTTP 요청을 하지 않는다.
4. **원격 접속은 계약 뒤 transport 교체로 붙인다.** 지금은 IPC가 유일한 transport이고, 원격을 넣을 때 계약을 유지한 채 HTTP/WS transport를 추가한다. 화면 코드는 바뀌지 않는다.

## 대안

아래 대안은 작성 에이전트가 구성했고, 사용자는 2026-11-22에 A를 선택했다.

| 대안 | 장점 | 단점 | 판정 |
| --- | --- | --- | --- |
| **A. electron-vite 단일 앱** | 설정이 적고 HMR이 바로 되며, 계약을 preload 한 곳에 모으면 원격은 transport 교체로 끝난다 | 렌더러가 Electron에 묶이므로 원격용 transport를 따로 구현해야 한다 | 선택 |
| B. Vite + 수동 Electron 배선 | 의존이 하나 줄어든다 | main·preload 번들, 개발 서버 연결을 직접 관리해야 하고 설정 오류를 손수 디버깅한다 | 제외(이득이 작다) |
| C. 앱 + 로컬 서버 분리 | 원격이 즉시 가능하고 서버를 Electron 없이 테스트한다 | MVP부터 프로세스 수명·포트·인증 표면이 늘고, 데스크톱 단일 사용자 시나리오에 과하다 | 제외(원격은 MVP 이후) |

## 결과

- MVP에는 프로세스가 하나다. 앱을 켜면 Orca CLI 어댑터와 세션 감시가 함께 뜬다.
- 원격을 넣을 때 바뀌는 것은 transport와 서버 수명주기이고, 화면·계약·어댑터는 그대로 쓴다.
- 단점: 렌더러 개발자는 Electron IPC 규약을 알아야 하고, 계약을 우회한 직접 접근이 코드 리뷰에서 걸러져야 한다.
- 미확인 위험 두 가지. ① SQLite를 `better-sqlite3`(네이티브 재빌드 필요)로 쓸지 Electron 내장 Node의 `node:sqlite`로 쓸지는 FTS5 지원 여부를 실제 스캐폴드에서 확인해야 한다. ② electron-vite 6과 Electron 45 조합의 실제 빌드·패키징은 아직 검증하지 않았다.

## 후속 작업

- 스캐폴드 범위를 정하고 실제 빌드를 확인한다. 범위는 사용자 승인을 받고 시작한다.
- SQLite 방식을 확정한다(`better-sqlite3` 또는 `node:sqlite`, FTS5 확인 결과로 결정).
- 계약 타입 초안을 만든다. 보드·채팅·오케스트레이션·히스토리 각 화면이 요구하는 읽기·명령을 데이터 단위로 적는다.
- [[SPEC-mvp-acceptance]] 의 확인 필요 2건(세션 상세 위치, 세션 등장 시점)을 구현 전에 정한다.

## 관련 문서

- [[ADR-0003-electron-and-sqlite-index]]
- [[ADR-0005-mvp-scope-both-specs-and-remote-access]]
- [[SPEC-mvp-acceptance]]
- [[30-specs/SPEC-graph-pi-ade]]
