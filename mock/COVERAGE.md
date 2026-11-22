# 기획 반영 커버리지

두 SPEC의 사용자 가시 요구사항을 51개 장면으로 대응시킨 표다. 각 행의 증거는 `node mock/verify-planning.mjs`가 생성하는 `mock/_evidence/planning-*.png`다. 스크립트는 행 수·파일 존재와 아래 상호작용을 실제로 연다: 4탭, 4슬롯, TODO 읽기 전용, 질문 답변·재로드, 에이전트 전달 실패, @ 참조·생성 확인·프롬프트 전달, 프리셋 3종·필수 오류, 세션 Audit 승인/거부/오류/불가능, 그룹 Audit gate·생략·대상 없음, 아카이브, 하네스 비활성, Run `목적`. 실제 패키지 실행·Audit 런타임은 목업 상태와 문구로 대신하며, 내부 저장 형식·감사 알고리즘은 범위 밖이다.

| # | SPEC | 요구사항 | 목업에서 확인 | 증거 |
| --- | --- | --- | --- | --- |
| 1 | `docs/30-specs/SPEC-hub-orchestration.md` §1 | Feature·Loop·Manual 세 프리셋을 고른다 | 그룹 생성 다이얼로그의 `.preset` 3개 | `planning-group-create.png` |
| 2 | 같은 문서 §1 | Feature·Loop는 첫 프롬프트가 필수, Manual은 선택 | Feature에서 빈 프롬프트 제출 시 `.err-txt` | `planning-group-required.png` |
| 3 | 같은 문서 §1 | 생성 시 허브 세션 1개, 워크트리 0개 | 생성 후 보드에 허브 카드만 있는 빈 그룹 | `planning-group-created.png` |
| 4 | 같은 문서 §2 | 백엔드·프론트 워크트리와 세션을 만든다 | `wt-onb-api`·`wt-onb-web`과 자식 세션 | `planning-feature-worktrees.png` |
| 5 | 같은 문서 §2 | 프론트는 목업 여러 시안을 만들고 사용자 선택을 받는다 | `s-onb-web` 채팅의 목업 선택 질문 | `planning-feature-mockup.png` |
| 6 | 같은 문서 §2 | 프론트가 API를 알아야 하면 허브가 계약을 중계한다 | `s-onb-web`의 에이전트 대화 `API 계약` | `planning-feature-api.png` |
| 7 | 같은 문서 §3 | Loop 프리셋은 레포×검토 축 워크트리를 만든다 | `g-loop`의 perf-query/cache/index | `planning-loop-worktrees.png` |
| 8 | 같은 문서 §3 | 각 Loop 종료 시 허브가 통합하고 다음 주기를 시작한다 | 허브 Goal의 `3개 Loop 결과가 통합됨` | `planning-loop-integration.png` |
| 9 | 같은 문서 §4 | Manual은 허브가 구조를 자율 구성한다 | Manual 프리셋 설명·첫 프롬프트 선택 | `planning-manual.png` |
| 10 | `docs/30-specs/SPEC-hub-orchestration.md:211` / `:500-501` | 허브는 워크트리·세션을 관리하되 Goal/List/Loop/Audit 탭은 읽기 전용 | 감독 탭에 시작/중지 버튼 없음, `읽기 전용` 라벨. 채팅 입력·그룹 생성은 유지 | `planning-readonly.png` |
| 11 | 같은 문서 §6 | 그룹 TODO와 세션 TODO를 함께 보여준다 | TODO 패널의 `그룹`·`세션` 행 | `planning-todo.png` |
| 12 | 같은 문서 §6 | TODO 상태는 할 일·진행 중·완료 | `.todo-row.todo/doing/done` | `planning-todo-status.png` |
| 13 | 같은 문서 §7 | 허브와 하위 세션의 에이전트 대화를 채팅에 남긴다 | `.agent-msg`와 `에이전트 · ... → ...` 라벨 | `planning-agent-chat.png` |
| 14 | 같은 문서 §7 | 비활성 수신 세션은 자동 재개, 실패는 보관하고 발신 세션에 알린다 | `pending`의 `전달 대기`, `failed`의 `전달 실패`와 오류 문구 | `planning-agent-pending.png`, `planning-agent-failed.png` |
| 15 | 같은 문서 §8 | 에이전트 질문은 인스펙터 카드로 표시한다 | `.sup-question`과 선택지 | `planning-question.png` |
| 16 | 같은 문서 §8 | 같은 질문이 채팅에도 인라인으로 보인다 | `.chat-question` | `planning-question-inline.png` |
| 17 | 같은 문서 §8 | 질문 대기 세션을 보드·사이드바에서 강조한다 | 보드의 amber 링과 사이드바의 `?` | `planning-board-question.png`, `planning-sidebar-question.png` |
| 18 | 같은 문서 §9.1 | `@` 입력 시 프로젝트 후보를 보여준다 | `#ref-menu`의 Backend/Frontend/Billing | `planning-ref-menu.png` |
| 19 | 같은 문서 §9.1 | 워크트리가 없는 브랜치는 생성 확인을 거친다 | `워크트리 생성` 다이얼로그 | `planning-ref-create.png` |
| 20 | 같은 문서 §9.2 | 브랜치·워크트리 참조를 직접 입력할 수 있다 | `@backend/feature/account` 해석 | `planning-ref-branch.png` |
| 21 | 같은 문서 §9.2 | 파일·폴더 참조를 붙이고 프롬프트에 전달한다 | 파일 후보 선택 후 전송된 메시지에 참조가 남음 | `planning-ref-file.png`, `planning-ref-prompt.png` |
| 22 | 같은 문서 §9.3 | 해석하지 못한 참조는 전송을 막는다 | 미해석 @ 전송 시 toast | `planning-ref-blocked.png` |
| 23 | 같은 문서 §10.1 | Goal은 활성 1개+대기 큐, 완료 조건·revision을 가진다 | Goal 탭의 `revision`·완료 조건 체크 | `planning-session-goal.png` |
| 24 | 같은 문서 §10.1 | 세션 Audit은 그 세션 작업만 승인·거부·불가능·오류로 판정한다 | 세션 Audit 탭의 `승인`·`거부`·`이전 감사` 이력 | `planning-session-audit-complete.png`, `planning-audit-rejected.png` |
| 25 | 같은 문서 §10.4 | Audit은 읽기 전용으로 조건별 증거와 verdict를 남긴다 | `.audit-criteria`의 pass/fail/unknown과 error/impossible | `planning-audit-evidence.png`, `planning-audit-error.png`, `planning-audit-impossible.png` |
| 26 | 같은 문서 §10.2 | List는 승인 후 다음 항목으로 넘어가고 aborted는 멈춘다 | 허브 List의 `active`·`queued`·`blocked` | `planning-list-queue.png` |
| 27 | 같은 문서 §10.2 | 허브 항목은 여러 하위 Goal로 fan-out되고 롤업된다 | `li-perf-1`의 `childGoalIds` 3개 | `planning-hub-fanout.png` |
| 28 | 같은 문서 §10.3 | Loop는 metric·회차·상한을 갖고 감사 대기/상한 정지로 끝난다 | `paused(audit)`·`stopped(bounds)` Loop 카드 | `planning-loop-states.png`, `planning-loop-bounds.png` |
| 29 | 같은 문서 §10.5 | 인스펙터는 Goal·List·Loop·Audit 4탭이다 | `.sup-tab[data-tab]` 4개 | `planning-hub-goal.png` |
| 30 | 같은 문서 §10.5 | 보드·사이드바는 4슬롯 배지와 문제 우선순위 강조를 보여준다 | `[data-slot]` 4개×세션, 배지 범례의 강조 순서 | `planning-slot-priority.png`, `planning-board-badges.png` |
| 31 | 같은 문서 §10.5 | 그룹 인스펙터는 허브 4탭+하위 집계다 | `감독 · 허브`와 하위 Goal 집계 | `planning-hub-aggregate.png` |
| 32 | 같은 문서 §10.5 | 완료·실패 기록은 아카이브에서 본다 | 완료 항목과 차단 항목의 `아카이브 보기` | `planning-archive.png`, `planning-archive-failed.png` |
| 33 | 같은 문서 §10.5 | 기존 Run의 `goal`은 화면에서 `목적`으로 표기한다 | `run-meta`·`run-select`의 `목적:` | `planning-run-purpose.png` |
| 34 | `docs/30-specs/SPEC-graph-pi-ade.md` §2 | 보드에서 그룹·워크트리·세션 상태를 본다 | 보드 SVG 카드 | `planning-overview.png` |
| 35 | 같은 문서 §3 | 채팅에서 세션 대화와 도구 호출을 본다 | 채팅 로그·Thinking·도구 | `planning-chat.png` |
| 36 | 같은 문서 §4 | 오케스트레이션에서 Run·Task·Worker·Gate를 본다 | 오케스트레이션 뷰 | `planning-orch.png` |
| 37 | 같은 문서 §5 | 히스토리에서 과거 세션·검색을 본다 | 히스토리 뷰 | `planning-history.png` |
| 38 | 같은 문서 §6 | 사이드바에서 워크트리와 하위 세션 계보를 항상 펼쳐 보여준다 | `.wt-item`·`.sess-guide`·`.wt-sess-row` | `planning-sidebar.png` |
| 39 | 같은 문서 §6 | 워크트리 추가 팝업은 레포·브랜치·부모·모델·프롬프트를 받는다 | `#dlg-wtrepo`·`#dlg-wtbase`·`#dlg-wtprompt` | `planning-worktree-add.png` |
| 40 | 같은 문서 §10.1·§11 | 하네스 패키지가 없으면 안내하고 감독 기능을 비활성화한다 | `Pi 하네스 패키지 없음` 배너와 비활성 감독 카드 | `planning-harness-missing.png` |
| 41 | 같은 문서 §5 | 허브의 이름 변경·삭제는 사용자 확인 없이 실행되고 앱에 남는다 | `허브 활동 · 사용자 확인 없음` 목록 | `planning-hub-autonomy.png` |
| 42 | 같은 문서 §8 | 답하지 않은 질문과 강조는 앱을 다시 열어도 유지된다 | 새로고침 후에도 남은 질문 카드 | `planning-question-persist.png` |
| 43 | 같은 문서 §10.4 | 그룹 Audit은 그룹 Goal이 만든 세션의 하위 Goal Audit이 모두 승인된 뒤에만 시작한다 | 허브 Audit 탭의 `시작 가능 · 2/2 세션 승인` gate | `planning-group-audit-gate.png` |
| 44 | 같은 문서 §10.4 | 그룹 생성 세션의 Audit이 하나라도 미승인이면 그룹 Audit은 대기한다 | `대기 · 1/3 세션 승인` gate | `planning-group-audit-wait.png` |
| 45 | 같은 문서 §10.4 | 감사 에이전트가 통합 감사를 생략할 수 있고, 생략하면 그룹 Goal은 완료된다 | `통합 감사 생략` 카드와 사유·`audit-agent` | `planning-group-audit-skip.png` |
| 46 | 같은 문서 §10.4 | 그룹 Goal이 만든 세션에 진행된 Goal이 없으면 그룹 Audit을 실행하지 않는다 | 그룹 Audit 탭의 안내 문구, gate 없음 | `planning-group-audit-none.png` |
| 47 | 같은 문서 §10.4 | 자식 Goal이 있는 세션은 자식 Audit이 모두 승인된 뒤 상위 세션 Audit을 시작하고, 자기 작업과 자식 결과를 통합 검사한다 | 상위 세션 Audit 탭의 gate 1/1·자식 QA 통합·승인 | `planning-parent-audit.png` |
| 48 | `docs/30-specs/SPEC-graph-pi-ade.md` §2.3·§6 | 사이드바가 세션을 부모→자식 트리로 펼치고 다른 워크트리 자식은 부모 링크로 표시한다 | `.sess-guide`·`.sess-parent-mark`·`Audit` 배지 | `planning-session-lineage.png` |
| 49 | 같은 문서 §2.4 | 보드가 부모→자식 세션 연결선을 그리고 허브에서 직계 자식까지 잇는다 | `path.sess-edge` | `planning-overview.png` |
| 50 | 같은 문서 §3.1 | 채팅 좌측 목록도 같은 세션 계보를 트리로 보여준다 | `#chat-list`의 `.sess-guide`·`.chat-name` | `planning-chat-lineage.png` |
| 51 | 같은 문서 §2.5 | 인스펙터가 상위 계보와 전체 하위 세션을 보여준다 | `.insp-lineage`·`.lin-wt`·`.lin-audit` | `planning-session-lineage-inspector.png` |

## 검증

```bash
node mock/_check.js
node mock/verify-planning.mjs
```

`verify-planning.mjs`는 위 표의 행 수(51개 이상)와 `mock/_evidence/planning-*.png`의 존재·크기를 확인하고, 4탭·4슬롯·TODO 읽기 전용·질문 답변/재로드·에이전트 실패·@ 참조·프리셋 필수 검증·Audit verdict·아카이브·하네스 비활성·Run 목적을 실제로 연다. 스크린샷은 저장소에서 ignore되므로 검증할 때마다 다시 만든다.
