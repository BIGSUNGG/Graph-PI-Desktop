---
type: meta
status: active
updated: 2026-11-20
tags: []
---

# glossary

용어 정의를 한 곳에 모은다. 이 저장소의 문서를 읽을 때 나오는 표현을 여기서 확인한다.

## 문서 체계 용어

| 용어 | 정의 | 관련 문서 |
| --- | --- | --- |
| ADR | Architecture Decision Record. 되돌리기 어려운 결정과 대안, 결과를 남기는 문서. | [[20-decisions/index]] |
| MOC | Map of Contents. 폴더별 `index.md` 처럼 하위 문서 목록을 링크로 모은 노트. | [[INDEX]] |
| frontmatter | 노트 최상단 `---` 사이의 메타데이터 블록. `type` `status` `updated` `tags` 4키를 쓴다. | [[conventions]] |
| worklog | 날짜별 작업 기록. 변경 파일, 검증 결과, 남은 문제를 남긴다. | [[50-worklog/index]] |
| spec | 기능의 동작·입출력·오류 정책을 확정한 명세. | [[30-specs/index]] |
| wikilink | `[[노트명]]` 형태의 Obsidian 내부 링크. | [[conventions]] |
| vault | Obsidian 이 문서 묶음으로 인식하는 폴더. 이 저장소에서는 `docs/` 가 vault 다. | [[INDEX]] |

## 프로젝트 용어

| 용어 | 정의 | 관련 문서 |
| --- | --- | --- |
| ADE | Agent Development Environment. 프로세스로 돌아가는 에이전트 세션을 한 화면에서 관찰·제어하는 개발 환경 앱. 이 저장소에서는 Pi 전용 데스크톱 앱을 가리킨다. | [[SPEC-graph-pi-ade]] |
| Pi 세션 | Pi 에이전트가 한 번의 대화 흐름을 기록한 JSONL 파일. `~/.pi/agent/sessions/` 아래에 프로젝트 슬러그 폴더로 나뉘어 저장된다. | [[orca-cli-and-pi-sessions]] |
| 워크스페이스 | Orca가 관리하는 작업 공간 단위. 이 프로젝트에서는 목록·그래프·히스토리를 묶는 기준 단위다. | [[SPEC-graph-pi-ade]] |
| 워크트리 | 저장소에서 분기해 별도 폴더로 체크아웃한 Git worktree. Orca가 생성·삭제를 관리한다. | [[orca-cli-and-pi-sessions]] |
| 레포지토리 | 워크트리 생성·불러오기에서 고르는 저장소 단위(web·api·worker·infra·shared·docs). 한 그룹이 여러 레포지토리의 워크트리를 함께 담는다. | [[SPEC-graph-pi-ade]] |
| 오케스트레이션 Run | Orca가 여러 에이전트 작업을 묶는 단위. Task·Worker·Gate를 가진다. | [[SPEC-graph-pi-ade]] |
| 그룹 | 여러 레포의 워크트리를 한 작업 단위로 묶은 것(예: `feature/login` = Server·Client·Contract). 앱이 직접 정의·저장하며 Orca 에는 없는 개념이다. | [[SPEC-graph-pi-ade]] |
| 부모 저장소 | 그룹의 최상위 폴더. 기본값은 `C:\Users\DAESUNG\orca\workspaces\<그룹 이름 슬러그>` 이고, 그룹에 추가한 하위 워크트리는 이 폴더 아래에 생긴다. 허브 세션은 이 폴더에서 시작한다. | [[SPEC-graph-pi-ade]] |
| 허브 | 그룹 전체를 관리하는 세션. 워크트리가 아니며 그룹 소유(`hubSessionId`)이고, 실행 위치는 부모 저장소 폴더다. 그룹당 하나이며 허브를 제거하면 그룹 관리용 허브 세션을 새로 만든다. | [[SPEC-graph-pi-ade]] |
| 하위 세션 | 허브가 그룹 안의 워크트리에 만든 세션. 허브와 에이전트 메시지·에이전트 질문으로 협업한다. | [[SPEC-hub-orchestration]] |
| 프리셋 | 그룹 생성 시 허브의 초기 작업 구조를 정하는 선택. Feature·Loop·Manual 세 가지이며 그룹 데이터에 저장하지 않는다. | [[SPEC-hub-orchestration]] |
| Pi 하네스 패키지 | Goal·List·Loop·Audit·TODO·에이전트 대화·에이전트 질문 도구를 Pi 세션에 제공하는 이 저장소의 워크스페이스 패키지. | [[SPEC-hub-orchestration]] |
| Goal | 완료 조건을 가진 결과 단위. 작업 세션마다 활성 Goal 하나와 대기 Goal 큐를 가지며, 허브는 최상위 Goal 하나와 List를 가진다. `active`·`auditing`·`complete`·`paused`·`aborted` 상태를 쓴다. | [[SPEC-hub-orchestration]] |
| List | 세션별 Goal 큐. 세션 List 항목은 Goal이고, 허브 List 항목은 Goal이 아니라 허브 Goal이 소유하는 오케스트레이션 작업 묶음이다. | [[SPEC-hub-orchestration]] |
| Loop(감독) | 한 Goal을 측정값 또는 Audit 기준으로 반복하는 실행 단위. 회차는 1회 반복. 감사 대기는 `paused`, 상한·중지는 `stopped`다. | [[SPEC-hub-orchestration]] |
| Audit | Goal 완료 주장 시 별도 Audit 세션이 완료 조건과 증거를 읽기 전용으로 검사하는 절차. 소스 수정은 금지하고 테스트·측정 명령은 실행할 수 있다. | [[SPEC-hub-orchestration]] |
| Audit 세션 | 감사를 수행하는 임시 세션. 대상 워크트리를 읽기 전용으로 열고, verdict 후 카드가 사라지며 이력에 남는다. | [[SPEC-hub-orchestration]] |
| 완료 조건 | Goal이 완료됐다고 판정하는 데 필요한 조건. 하나 이상이어야 하며, Audit이 조건별 증거와 통과/실패를 기록한다. | [[SPEC-hub-orchestration]] |
| 감사 롤업 | 허브 Audit이 하위 Goal의 verdict와 완료 조건 결과를 모아 자신의 Goal을 판정하는 것. | [[SPEC-hub-orchestration]] |
| 유효 하위 Goal | 허브 항목의 `childGoalIds` 중 재시도로 대체되지 않은 Goal. `supersededByGoalId`가 있는 Goal은 빠진다. | [[SPEC-hub-orchestration]] |
| 보완 항목 | 허브 Goal Audit이 거부됐을 때 추가하는 오케스트레이션 항목. | [[SPEC-hub-orchestration]] |
| 아카이브 | 완료·중단된 Goal과 Audit 이력을 그룹 단위로 보관한 조회. 세션을 삭제해도 유지된다. | [[SPEC-hub-orchestration]] |
| 그룹 TODO | 그룹 전체에 걸친 작업 목록. 그룹의 모든 세션이 읽고, 허브와 하위 세션이 추가·수정·완료한다. | [[SPEC-hub-orchestration]] |
| 세션 TODO | 한 세션의 작업 목록. 그 세션과 허브만 읽고 추가·수정·완료한다. | [[SPEC-hub-orchestration]] |
| 에이전트 메시지 | 허브와 하위 세션 사이에서 주고받는 메시지. 보낸 세션과 받은 세션의 채팅 모두에 남는다. | [[SPEC-hub-orchestration]] |
| 에이전트 질문 | 세션이 사용자에게 보내는 질문. 답변 전까지 그 세션이 `질문 대기` 상태로 기다린다. | [[SPEC-hub-orchestration]] |
| @참조 | 채팅에서 프로젝트·브랜치·워크트리·파일·폴더를 가리키는 태그. | [[SPEC-hub-orchestration]] |
| 질문 대기 | 에이전트 질문에 답을 기다리는 동안 앱이 표시하는 세션 대기 플래그. Pi 세션의 저장 상태가 아니며 보드 카드와 사이드바 세션 행에서 강조한다. | [[SPEC-hub-orchestration]] |
| 슬러그 | 한글 이름을 폴더 이름으로 쓸 수 있게 로마자로 옮긴 문자열. `고객 온보딩` → `gogaek-onboding`. | [[SPEC-graph-pi-ade]] |
| 외부 세션 | Pi 세션 파일은 있으나 그 경로가 Orca 워크트리에 속하지 않는 세션. 목록에 `외부` 라벨로 남고 제어는 되지 않는다. | [[SPEC-graph-pi-ade]] |

프로젝트 코드가 추가되면 채운다. 확인된 정의만 쓰고 추측으로 채우지 않는다.

상위: [[INDEX]]
