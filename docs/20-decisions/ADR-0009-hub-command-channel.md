---
type: decision
status: active
updated: 2026-11-24
tags: [adr, harness, board]
---

# ADR-0009 허브의 보드 조작은 하네스 command 레코드로 전달한다

## 배경

수용기준 18 은 "허브가 요청한 워크트리·세션 삭제와 이름 변경이 사용자 확인 없이 실행되고 보드에 반영된다"이다. 허브는 Pi 세션이라 IPC 를 부를 수 없고, 앱은 렌더러에서 Orca 를 직접 다루지 않는다([[ADR-0007-electron-mock-parity-app]]). 그렇다고 앱이 하네스 파일을 직접 고치게 하면 "앱은 읽기 전용" 경계가 깨진다.

## 결정

허브는 하네스 CLI 로 `command` 레코드를 남기고, 앱이 스냅샷을 읽을 때 대기 중인 요청을 실행한 뒤 **같은 id 로 결과를 append** 한다.

- 레코드: `AgentCommandRecord`(`action`: `remove-worktree`·`rename-worktree`·`remove-session`·`rename-session`, `target`, `value`, `status`, `result`).
- 판정: `src/main/harness/commands.ts` 의 `planCommand` — 없는 워크트리·빈 이름은 거부하고, 세션 삭제는 PTY 를 찾지 못하면 실패로 남긴다.
- 실행: 워크트리 삭제는 Orca `worktree rm`, 세션 삭제는 `terminal close`, 이름 변경은 그룹 파일의 별칭 맵(`worktreeNames`/`sessionNames`)에 저장하고 보드가 덮어 그린다.
- 확인 대화상자는 두지 않는다(수용기준이 "사용자 확인 없이"를 요구한다).

## 대안

- **앱이 하네스 파일을 직접 수정**: 쓰기 주체가 둘이 되어 append 순서·seq 충돌이 생긴다. 앱 읽기 전용 경계도 깨진다.
- **IPC 로 허브에 명령을 밀어 넣기**: 허브는 에이전트라 명령을 해석할 보장이 없다. 감사 가능한 기록도 남지 않는다.
- **Orca 의 rename 명령 사용**: CLI 스키마(`orca agent-context --json`)에 없다. 없는 플래그를 추측해 넣지 않는다.

## 결과

- 요청과 결과가 모두 `state.jsonl` 에 남아 사후 확인이 가능하다.
- 이름 변경은 Orca 쪽 이름이 아니라 그룹 파일 별칭이라, Orca 밖에서 바뀐 이름과 충돌할 수 있다. 충돌 시 그룹 별칭이 이긴다(사용자가 앱에서 정한 이름을 우선).
- 실행 실패는 조용히 사라지지 않고 `status: 'failed'` + `result` 로 남는다.
