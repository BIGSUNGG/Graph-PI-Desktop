---
type: guide
status: active
updated: 2026-11-24
tags: [guide, build, verification]
---

# build-and-verify — 빌드·검증 명령

- 한 줄 요약: 설치 → 타입체크 → 빌드 → 단위 테스트 → E2E → (선택) Orca 스모크 순서로 확인한다. 실패한 명령을 통과로 쓰지 않는다.

구조는 [[10-architecture/mvp-app-and-harness]].

## 준비

```bash
npm install          # 루트에서 1회. npm workspaces(packages/*) 를 함께 설치한다
```

요구: Node 26 이상, Windows(Orca CLI 경로 가정), Visual Studio 는 필요 없다(Electron 사전 빌드 사용, `node:sqlite` 는 Electron 내장 Node 24.22.3 에서 FTS5 포함 동작 확인).

## 검증 순서

| 명령 | 확인하는 것 | 통과 기준 |
| --- | --- | --- |
| `npm run typecheck` | 메인(node)·렌더러(web)·하네스 3개 프로젝트 | 3개 모두 exit 0 |
| `npm run build` | electron-vite 번들(main/preload/renderer) | exit 0, `out/` 산출 |
| `npm test` | `node --test` 단위 테스트 | fail 0 |
| `npx playwright test` | 실제 Electron 부팅·뷰 전환·다이얼로그 | 전부 통과 |
| `node scripts/smoke-orca.mjs` | 실제 `orca` CLI 계약(`ok`/`result`) | PASS (Orca 앱이 떠 있어야 함) |
| `npm run smoke:integration` | 임시 레포 → 워크트리 → 실제 Pi 세션 → 세션 노드 필드 | PASS (steps failed=0) |
| `npm run smoke:chat` | 실제 PTY 세션 + `sendPrompt` 문장이 세션 파일에 남는지 | PASS (steps failed=0) |
| `npm run scenario:audit-chain` | Goal→Audit→승인/거부→다음 항목 배정 CLI 체인 | PASS (체크 전부 PASS) |
| `GRAPH_PI_ENABLE_GPU=1 npm run dev` | 기본은 소프트웨어 렌더링. GPU 가속은 이 변수로만 켠다(E2E 전체 실행에서 렌더러 크래시 재현) | 선택 |

`npm run dev` 는 개발 실행, `npm start` 는 빌드된 앱 실행이다.

## 단일 명령 요약

```bash
npm run typecheck && npm run build && npm test && npx playwright test
```

## 환경 변수

| 변수 | 쓰임 | 기본값 |
| --- | --- | --- |
| `GRAPH_PI_DATA_DIR` | 앱·하네스 데이터 루트(그룹/설정/상태/인덱스) | `~/.graph-pi/data` |
| `PI_SESSIONS_DIR` | Pi 세션 JSONL 루트(읽기 전용) | `~/.pi/agent/sessions` |
| `GP_ORCA_BIN` | Orca CLI 실행 파일 경로 | Windows 기본 설치 경로 후보 |

E2E 는 `GRAPH_PI_DATA_DIR` 를 임시 디렉터리로 준다. 실제 사용자 데이터를 건드리지 않는다.

## 하네스 CLI 확인

```bash
node packages/harness/src/cli.ts show --group demo
node packages/harness/src/cli.ts todo --group demo --title "확인" --state open
```

첫 명령이 `todo` 로 추가한 항목을 보여주면 저장·재생 경로가 살아 있다.

## 알려진 함정

- **pi-lens 의 `ts:5097` 경고**: 4개 tsconfig 모두 `allowImportingTsExtensions` 가 켜져 있고 `npx tsc` 가 통과해도 편집기 진단이 계속 나온다. LSP 가 레포 설정을 물지 못하는 도구 문제다. 판정은 항상 `npx tsc -p <config> --noEmit` 로 한다.
- **PI-Crew 워커 셸 없음**: 워커는 `execvpe(/bin/bash) failed` 로 bash 를 못 쓴다. 워커에게 "실행해서 확인하라"고 시키지 말고, 파일 작성만 맡기고 검증은 부모가 실행한다.
- **TypeScript 7**: `baseUrl` 이 제거됐다. `paths` 는 설정 파일 기준 상대 경로로 쓴다.
- **Vite 8(rolldown)**: `esbuild.jsx` 옵션이 없다. 자동 JSX 런타임이 기본이다.

## 관련 문서

- [[10-architecture/mvp-app-and-harness]]
- [[20-decisions/ADR-0007-electron-mock-parity-app]]
- [[30-specs/SPEC-mvp-acceptance]]

| `npm run smoke:resume` | 질문 답변 후 재개 실측 — 코드가 아니라 실제 PTY 로 확인한다 | `node scripts/smoke-resume.mjs` |

| `GP_LIVE=1 npx playwright test e2e/live-pty.spec.ts` | 실제 Orca PTY 세션이 앱 보드 노드로 나타나는지 실측(느림, 기본 skip) | `GP_LIVE=1 npx playwright test e2e/live-pty.spec.ts` |

| `npm run scenario:audit-order` | 감사 순서(자식 감사·완료 → 상위 감사) 런타임 관찰 | `node scripts/scenario-audit-order.mjs` |
