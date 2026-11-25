---
type: guide
status: active
updated: 2026-11-25
tags: [guide, harness, scenario, acceptance]
---

# 허브 시나리오를 실제 모델로 확인하기

- 한 줄 요약: 판정표의 `[시나리오]` 행은 앱을 띄우지 않고 `scripts/scenario-*.mjs` 로 같은 경로를 재현해 관찰한다.

## 왜 이 방법인가

`[시나리오]` 행은 "허브(LLM)가 프리셋 지시를 따르는가"를 묻는다([[SPEC-mvp-acceptance]] 판정 규칙 2).
코드 존재로는 판정할 수 없고, 앱 UI 로 확인하려면 매번 손으로 클릭해야 한다.
그래서 앱이 허브에게 보내는 **같은 프롬프트**(`src/main/preset.ts` 의 `hubInitialPrompt`)를 그대로 만들어 실제 Pi 세션에 넣고,
결과를 하네스 레코드와 Orca 워크트리 수로 판정한다.

## 절차

1. 시나리오 실행
   ```bash
   node scripts/scenario-hub.mjs     # Feature 프리셋: 질문 → 워크트리 → 목업 질문 → say 중계
   node scripts/scenario-loop.mjs    # Loop 프리셋: 6 loop·워크트리·하위 Goal
   ```
2. 스크립트가 만드는 임시 데이터 폴더를 확인한다. 출력 첫 줄 `scenario data=…` 가 경로다.
3. 관찰 결과를 [[SPEC-mvp-acceptance]] 표와 원본 SPEC 같은 항목에 근거와 함께 체크한다.
4. 실패하면 **프리셋 지시를 보강**하고 다시 관찰한다(판정 규칙 2). 지시는 `src/main/preset.ts` 의 `PRESET_STEPS` 에 있다.

## 구현 시 반드시 지킬 것

- Pi 는 `pi.cmd` 대신 `node …/@earendil-works/pi-coding-agent/dist/bundle/cli.js` 로 직접 실행한다. `cmd.exe /c` 는 인용이 깨지고 도구가 빠진다.
  ```js
  execFileSync(process.execPath, [PI_ENTRY, '-p', '--model', 'opencode-go/deepseek-v4.1-flash', '--tools', 'bash', prompt], { cwd, env })
  ```
- 세션 이어가기는 `-c` 다. 2단계·3단계 지시는 `-c` 로 같은 세션에 넣는다.
- 질문 답변은 앱과 동일하게 **같은 id 의 `question` 레코드를 `status:"answered"` + `answer` 로 `seq` 를 올려 덧붙인다.**
- 워크트리 개수는 경로 접두 비교가 아니라 `orca worktree list --json` 의 **실행 전후 id 차집합**으로 센다(허브 워크트리는 `orca/workspaces/…` 에 생긴다).
- 메시지 레코드 필드는 `fromSessionId`/`toSessionId` 다. `from`/`to` 로 읽으면 성공을 실패로 오판한다.
- Loop 시나리오는 워크트리마다 실제 Pi 세션을 띄우므로 30분 이상 걸린다. `nohup` 으로 띄우고 로그 파일을 폴링한다.

## 함정

- 오래 걸리는 실행을 한 번의 셸 호출 안에서 `sleep` 으로 기다리면 호출이 중단된다. 백그라운드로 띄우고 파일을 읽는다.
- `taskkill /F /IM node.exe` 는 Pi·Electron 까지 죽인다. PID 로 죽인다.
- python heredoc 으로 JS 를 쓰면 `\n`·`\\s` 가 조용히 깨진다. 스크립트는 `write` 도구로 쓰고 `node --check` 로 확인한다.
- 관찰 1회로 특정 행이 통과했다고 해서 다음 실행도 통과한다는 보장은 없다. 판정은 **관찰한 실행**을 근거로 남기고, 실패하면 지시를 보강한다.
