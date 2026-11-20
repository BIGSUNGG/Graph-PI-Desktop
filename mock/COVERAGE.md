# 기획 반영 커버리지

목업에서 확인할 수 있는 주요 사용자 가시 요구사항을 두 SPEC에 대응시킨 표다. 각 행의 증거는 `node mock/verify-planning.mjs`가 생성하는 `mock/_evidence/planning-*.png`다. 스크립트는 행 수·파일 존재와 대표 상호작용(4탭, 질문 답변, @ 참조, 프리셋 필수 검증, Run 목적)을 검사한다. 행별 DOM 단언은 아니며, 내부 저장 형식·패키지 구현·감사 알고리즘은 목업 범위 밖이므로 이 표에 넣지 않는다.

| # | SPEC | 요구사항 | 목업에서 확인 | 증거 |
| --- | --- | --- | --- | --- |
| 1 | `docs/30-specs/SPEC-hub-orchestration.md` §1 | Feature·Loop·Manual 세 프리셋을 고른다 | 그룹 생성 다이얼로그의 `.preset` 3개 | `planning-group-create.png` |
| 2 | 같은 문서 §1 | Feature·Loop는 첫 프롬프트가 필수, Manual은 선택 | Feature에서 빈 프롬프트 제출 시 `.err-txt` | `planning-group-required.png` |
| 3 | 같은 문서 §1 | 생성 시 허브 세션 1개, 워크트리 0개 | 생성 후 보드에 허브 카드만 있는 빈 그룹 | `planning-group-created.png` |
| 4 | 같은 문서 §2 | Feature는 백엔드 명세를 먼저 질문한다 | `goal-onb-api`의 `q-onb` 질문 카드 | `planning-feature-question.png` |
| 5 | 같은 문서 §2 | 백엔드·프론트 워크트리와 세션을 만든다 | `wt-onb-api`·`wt-onb-web`과 자식 세션 | `planning-feature-worktrees.png` |
| 6 | 같은 문서 §2 | 프론트는 목업 여러 시안을 만들고 사용자 선택을 받는다 | `s-onb-web` 채팅의 목업 선택 질문 | `planning-feature-mockup.png` |
| 7 | 같은 문서 §2 | 프론트가 API를 알아야 하면 허브가 계약을 중계한다 | `s-onb-web`의 에이전트 대화 `API 계약` | `planning-feature-api.png` |
| 8 | 같은 문서 §3 | Loop 프리셋은 레포×검토 축 워크트리를 만든다 | `g-loop`의 perf-query/cache/index | `planning-loop-worktrees.png` |
| 9 | 같은 문서 §3 | 각 Loop 종료 시 허브가 통합하고 다음 주기를 시작한다 | 허브 Goal의 `3개 Loop 결과가 통합됨` | `planning-loop-integration.png` |
| 10 | 같은 문서 §4 | Manual은 허브가 구조를 자율 구성한다 | Manual 프리셋 설명·첫 프롬프트 선택 | `planning-manual.png` |
| 11 | 같은 문서 §5 | 허브는 워크트리·세션을 관리하되 Goal/List/Loop/Audit 탭은 읽기 전용 | 감독 탭에 시작/중지 버튼 없음, `읽기 전용` 라벨. 채팅 입력·그룹 생성은 유지 | `planning-readonly.png` |
| 12 | 같은 문서 §6 | 그룹 TODO와 세션 TODO를 함께 보여준다 | TODO 패널의 `그룹`·`세션` 행 | `planning-todo.png` |
| 13 | 같은 문서 §6 | TODO 상태는 할 일·진행 중·완료 | `.todo-row.todo/doing/done` | `planning-todo-status.png` |
| 14 | 같은 문서 §7 | 허브와 하위 세션의 에이전트 대화를 채팅에 남긴다 | `.agent-msg`와 `에이전트 · ... → ...` 라벨 | `planning-agent-chat.png` |
| 15 | 같은 문서 §7 | 비활성 수신 세션은 자동 재개, 실패는 보관 | `pending` 메시지와 `전달 대기` 표시 | `planning-agent-pending.png` |
| 16 | 같은 문서 §8 | 에이전트 질문은 인스펙터 카드로 표시한다 | `.sup-question`과 선택지 | `planning-question.png` |
| 17 | 같은 문서 §8 | 같은 질문이 채팅에도 인라인으로 보인다 | `.chat-question` | `planning-question-inline.png` |
| 18 | 같은 문서 §8 | 질문 대기 세션을 보드·사이드바에서 강조한다 | `.session-attn`·amber `?` | `planning-sidebar-question.png` |
| 19 | 같은 문서 §9.1 | `@` 입력 시 프로젝트 후보를 보여준다 | `#ref-menu`의 Backend/Frontend/Billing | `planning-ref-menu.png` |
| 20 | 같은 문서 §9.1 | 워크트리가 없는 브랜치는 생성 확인을 거친다 | `워크트리 생성` 다이얼로그 | `planning-ref-create.png` |
| 21 | 같은 문서 §9.2 | 브랜치·워크트리 참조를 직접 입력할 수 있다 | `@backend/feature/account` 해석 | `planning-ref-branch.png` |
| 22 | 같은 문서 §9.2 | 파일·폴더 참조를 붙일 수 있다 | `@backend/src/routes/onboarding.ts` 후보 | `planning-ref-file.png` |
| 23 | 같은 문서 §9.3 | 해석하지 못한 참조는 전송을 막는다 | 미해석 @ 전송 시 toast | `planning-ref-blocked.png` |
| 24 | 같은 문서 §10.1 | Goal은 활성 1개+대기 큐, 완료 조건·revision을 가진다 | Goal 탭의 `revision`·완료 조건 체크 | `planning-session-goal.png` |
| 25 | 같은 문서 §10.1 | 완료 주장은 별도 Audit 세션의 승인을 거친다 | `감사 중`·`승인`·`거부` 상태 | `planning-session-audit.png` |
| 26 | 같은 문서 §10.4 | Audit은 완료 조건별 증거와 verdict를 남긴다 | `.audit-criteria` pass/fail | `planning-audit-evidence.png` |
| 27 | 같은 문서 §10.2 | List는 승인 후 다음 항목으로 넘어가고 aborted는 멈춘다 | 허브 List의 `active`·`queued`·`blocked` | `planning-list-queue.png` |
| 28 | 같은 문서 §10.2 | 허브 항목은 여러 하위 Goal로 fan-out되고 롤업된다 | `li-perf-1`의 `childGoalIds` 3개 | `planning-hub-fanout.png` |
| 29 | 같은 문서 §10.3 | Loop는 metric·회차·상한을 갖고 감사 대기/상한 정지로 끝난다 | `paused(audit)`·`stopped(bounds)` Loop 카드 | `planning-loop-states.png`, `planning-loop-bounds.png` |
| 30 | 같은 문서 §10.5 | 인스펙터는 Goal·List·Loop·Audit 4탭이다 | `.sup-tab[data-tab]` 4개 | `planning-hub-goal.png` |
| 31 | 같은 문서 §10.5 | 보드·사이드바는 4슬롯 배지를 보여준다 | `[data-slot]` 4개×세션 | `planning-board-badges.png` |
| 32 | 같은 문서 §10.5 | 그룹 인스펙터는 허브 4탭+하위 집계다 | `감독 · 허브`와 하위 Goal 집계 | `planning-hub-aggregate.png` |
| 33 | 같은 문서 §10.5 | 완료·실패 기록은 아카이브에서 본다 | `아카이브 보기` 토글 | `planning-archive.png` |
| 34 | 같은 문서 §10.5 | 기존 Run의 `goal`은 화면에서 `목적`으로 표기한다 | `run-meta`·`run-select`의 `목적:` | `planning-run-purpose.png` |
| 35 | `docs/30-specs/SPEC-graph-pi-ade.md` §2 | 보드에서 그룹·워크트리·세션 상태를 본다 | 보드 SVG 카드 | `planning-overview.png` |
| 36 | 같은 문서 §3 | 채팅에서 세션 대화와 도구 호출을 본다 | 채팅 로그·Thinking·도구 | `planning-chat.png` |
| 37 | 같은 문서 §4 | 오케스트레이션에서 Run·Task·Worker·Gate를 본다 | 오케스트레이션 뷰 | `planning-orch.png` |
| 38 | 같은 문서 §5 | 히스토리에서 과거 세션·검색을 본다 | 히스토리 뷰 | `planning-history.png` |
| 39 | 같은 문서 §6 | 사이드바에서 워크트리와 하위 세션을 펼친다 | `.wt-item`·`.wt-sess-row` | `planning-sidebar.png` |
| 40 | 같은 문서 §6 | 워크트리 추가 팝업은 레포·브랜치·부모·모델·프롬프트를 받는다 | `#dlg-wtrepo`·`#dlg-wtbase`·`#dlg-wtprompt` | `planning-worktree-add.png` |

## 검증

```bash
node mock/_check.js
node mock/verify-planning.mjs
```

`verify-planning.mjs`는 위 표의 행 수(40개 이상)와 `mock/_evidence/planning-*.png`의 존재·크기를 확인하고, 4탭·4슬롯·질문 답변·@ 참조·프리셋 필수 검증·Run 목적을 실제로 연다. 스크린샷은 저장소에서 ignore되므로 검증할 때마다 다시 만든다.
