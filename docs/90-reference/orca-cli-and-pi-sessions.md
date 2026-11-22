---
type: reference
status: active
updated: 2026-11-17
tags: [orca, pi, cli]
---

# Orca CLI와 Pi 세션 자료

한 줄 요약: Orca 1.4.259 CLI의 JSON 계약과 Pi 세션 파일(포맷 v3) 구조를 2026-11-17에 직접 실행·표본 확인한 기록이다.

관련 문서: [[ADR-0001-standalone-ade-over-orca-plugin]], [[ADR-0002-pi-session-jsonl-data-source]], [[SPEC-graph-pi-ade]]

## 확인 대상과 방법

| 항목 | 값 | 확인 방법 |
| --- | --- | --- |
| Orca 설치 버전 | 1.4.259 | `orca agent-context --json` |
| CLI 스키마 | `schemaVersion: 1`, `commandCount: 334` | 위와 같음 |
| Pi 세션 포맷 | `version: 3` (세션 헤더 필드) | 세션 JSONL 헤더 확인 |
| 조사일 | 2026-11-17 | - |

## CLI 공통 계약

- 모든 명령이 `--json` 을 받는다.
- 성공: `{"ok":true,"result":{...}}`
- 실패: `{"ok":false,"error":{"code":"...","message":"...","data":{...}}}` — 예: `run_required` (오케스트레이션 Run 미바인딩)
- 프로세스 종료 코드와 `ok` 를 함께 확인해야 한다. 실패 시에도 종료 코드가 0인 경우가 있어 `ok` 를 신뢰한다.

## 이 프로젝트가 쓰는 명령

| 목적 | 명령 | 실측 결과 |
| --- | --- | --- |
| 프로젝트 목록 | `orca project list --json` | `projects[]` (`id`, `name`, `kind`, `addedAt`) |
| 저장소 등록 | `orca repo add --path <path> [--kind git\|folder]` | 등록 성공 |
| 저장소 숨김 | `orca repo hide` / `orca repo unhide` | 사용 가능 |
| 워크트리 목록 | `orca worktree list --json` | `worktrees[]` (`id`, `branch`, `baseRef`, `repoId`, `path`) |
| 워크트리 생성 | `orca worktree create --name <n> --repo <sel> [--agent <id>] [--prompt] [--model] [--base-branch] [--parent-worktree]` | 사용 가능 (실행은 미검증) |
| 워크트리 삭제 | `orca worktree rm --worktree <sel> [--force] [--delete-branch]` | 사용 가능 (실행은 미검증) |
| 워크트리 메타 | `orca worktree set`, `worktree show`, `worktree activate` | 사용 가능 |
| 에이전트 실행 | `orca agent launch --agent <id> [--worktree] [--prompt] [--model] [--effort] [--surface chat\|terminal] [--focus]` | 사용 가능. `pi` 지정 실검증 완료(2026-11-22, 터미널 세션 생성) |
| 터미널 생성 | `orca terminal create [--worktree] [--command] [--shell] [--title]` | 사용 가능 |
| 터미널 읽기 | `orca terminal read [--terminal] [--cursor] [--limit] [--screen]` | 사용 가능 |
| 터미널 입력 | `orca terminal send [--terminal] [--text] [--enter] [--interrupt] [--wait-submit <s>]` | 사용 가능 |
| 터미널 대기 | `orca terminal wait --for exit\|tui-idle [--timeout-ms]` | 사용 가능 |
| 오케스트레이션 Run | `orca orchestration run-list --json`, `run-show --id <id>` | run 4건 반환 |
| 오케스트레이션 작업 | `orca orchestration task-list --run <id> --brief --json` | `{tasks:[{id,status,title}],runId}` |
| 오케스트레이션 워커 | `orca orchestration worker-list --json` | `workers[]` (`dispatchId`, `taskId`, `state`, `outcome`, `liveness`, `terminal`, `terminalState`, `workspace`, `attention`) |
| 워커 출력 | `orca orchestration worker-read --dispatch <id> [--source auto\|transcript\|terminal]` | 사용 가능 |

### 주의점 (실측)

- `task-list` 와 `gate-list` 는 Run 바인딩이 없으면 `run_required` 오류를 낸다. `--run <run_id>` 를 명시해야 한다.
- `agent launch --help` 는 `--agent` 허용 값을 나열하지 않는다. 예시는 `codex`, `claude` 뿐이다. 2026-11-22에 `orca agent launch --agent pi --worktree path:C:/Projects/Graph-PI-Desktop --json` 을 실행해 `ok:true`, `outcome.kind:"terminal"`, `receipt.reason:"user_default"` 를 확인했고 세션 JSONL이 생겼다. 따라서 `pi` 는 유효한 에이전트 id이고 기본 설정에서 터미널 표면으로 뜼다. 채팅 표면 가능 여부는 확인하지 않았다.
- `--surface chat` 은 에이전트가 채팅을 지원하지 않으면 터미널로 대체된다. 대체 여부는 `outcome.kind`, `receipt.detail` 로 알려준다.
- Orca CLI는 이벤트 푸시를 제공하지 않는다. 상태 변화는 폴링으로만 관찰된다.

## Pi 세션 파일

- 경로: `C:\Users\DAESUNG\.pi\agent\sessions\<프로젝트-slug>\<ISO시각>_<sessionId>.jsonl`
- slug 예: `--C--Projects-ck-darkness--` (cwd 경로를 변형한 폴더명)
- 조사일 기준 로컬 파일 수: 2,272개
- 형식: 줄 단위 JSON. 첫 줄은 세션 헤더이며 이후 레코드가 이어진다.

### 세션 헤더

```json
{"type":"session","version":3,"id":"01a1df2f-...","timestamp":"2026-11-15T12:30:09.354Z","cwd":"C:\\Projects\\ck-darkness"}
```

- `parentSession` 필드가 있으면 부모 세션 파일 경로를 담는다(포크·분기 세션에서 확인).
- `id` 는 파일명 접미사와 같다. Orca도 파일명에서 세션 ID를 뽑아 쓴다(`src/main/ai-vault/parsing/session-scanner-accumulator` 의 `sessionIdFromFileName`).

### 레코드 타입 (표본 1,313줄)

| type | 건수 | 내용 |
| --- | --- | --- |
| `session` | 1 | 헤더 |
| `model_change` | 1 | `provider`, `modelId` |
| `thinking_level_change` | 1 | `thinkingLevel` |
| `message` | 1,291 | `message.role` = `system` 1 / `user` 3 / `assistant` 622 / `toolResult` 665 |
| `custom_message` | 14 | 확장이 넣은 메시지 |
| `custom` | 3 | 확장 상태(예: `plannotator`) |
| `compaction` | 2 | 압축 이벤트 |

- `toolResult` 가 남으므로 도구 호출과 결과를 파싱만으로 복원할 수 있다.
- 공개 계약 문서는 없다. 새 `type` 이 추가될 수 있으므로 모르는 타입은 무시하는 처리가 필요하다.

## Orca 플러그인 호스트 API 제약 (경로 선택의 근거)

- 설치 버전 1.4.259는 호스트 API major 1을 노출하며 minor 1.9까지 제공한다.
- 대화 내용을 읽는 메서드가 없다. `agent.listSessions` 는 제목·에이전트·워크스페이스·브랜치·시각·메시지 수·토큰 수만 주고 "대화 내용과 파일 경로는 주지 않는다"고 명시한다.
- 플러그인 패널은 샌드박스 프레임이라 네트워크가 닫혀 있고, `terminal.sendText` 는 워커(별도 Node 프로세스)에서만 호출할 수 있다.
- 플러그인 기여 항목 중 `agentHarnesses`, `skills`, `mcpServers`, `taskSources`, `connections`, `sidebarCards` 는 예약 상태로 비어 있어야 한다.

## 관련 문서

- [[20-decisions/index]]
- [[30-specs/index]]
