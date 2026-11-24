---
type: index
status: active
updated: 2026-11-24
tags: []
---

# 20-decisions

되돌리기 어려운 결정과 그 대안을 ADR 로 남긴다.

## 문서 목록

| 문서 | 상태 | 한 줄 요약 |
| --- | --- | --- |
| [[20-decisions/ADR-0001-standalone-ade-over-orca-plugin]] | active | ADE를 플러그인이 아닌 별도 데스크톱 앱으로 만든다 |
| [[20-decisions/ADR-0002-pi-session-jsonl-data-source]] | active | 대화는 Pi JSONL, 제어는 Orca CLI를 함께 쓴다 |
| [[20-decisions/ADR-0003-electron-and-sqlite-index]] | active | Electron + React + TS, 검색 인덱스는 SQLite FTS5 |
| [[20-decisions/ADR-0004-orca-removal-then-pi-runtime-fork]] | active | MVP는 SPEC-graph-pi-ade 범위, 이후 Orca 전면 제거, 그 다음 업스트림 Pi 런타임 포크(어댑터 도입 확정, 포크는 업데이트를 계속 받는 형태) |
| [[20-decisions/ADR-0005-mvp-scope-both-specs-and-remote-access]] | active | MVP 범위를 두 SPEC 전체(목업 47장면)로 넓히고, 원격 접속은 MVP에서 구현하지 않고 구조만 열어둔다. ADR-0004의 MVP 범위 문장만 대체 |
| [[20-decisions/ADR-0006-electron-vite-single-app-with-contract]] | active | electron-vite 단일 앱. 데이터 접근은 main 어댑터, 렌더러는 preload 계약만. 원격은 계약 뒤 transport 교체 |
| [[20-decisions/ADR-0007-electron-mock-parity-app]] | accepted | Electron 단일 앱(루트) + `packages/harness`. 계약·데이터 디렉터리 공유, 에이전트 쓰기는 CLI 하나 |
| [[20-decisions/ADR-0008-mock-first-design]] | active | 디자인 기준은 `mock/index.html` 단일 소스. SPEC 과 충돌하면 목업을 따르고, 목업에 없는 UI 만 Orca 디자인 언어로 설계 |

## 작성 규칙

- `_templates/adr.md` 로 시작하고 파일명은 `ADR-0001-<slug>.md`. 번호는 4자리, 순서대로 발급한다.
- ADR 은 삭제하거나 본문을 고치지 않는다. 결정이 뒤집히면 `status: superseded` 로 표시하고 대체 ADR 링크를 남긴 뒤 새 번호로 새 ADR 을 쓴다.
- 대안을 최소 1개 이상 표로 남긴다. 근거 없이 "결정했다"만 쓰지 않는다.

상위: [[INDEX]]
| [[ADR-0009-hub-command-channel]] | 허브의 보드 조작(삭제·이름 변경)을 하네스 command 레코드로 전달하고 앱이 실행 |
