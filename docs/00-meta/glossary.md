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
| 슬러그 | 한글 이름을 폴더 이름으로 쓸 수 있게 로마자로 옮긴 문자열. `고객 온보딩` → `gogaek-onboding`. | [[SPEC-graph-pi-ade]] |
| 외부 세션 | Pi 세션 파일은 있으나 그 경로가 Orca 워크트리에 속하지 않는 세션. 목록에 `외부` 라벨로 남고 제어는 되지 않는다. | [[SPEC-graph-pi-ade]] |

프로젝트 코드가 추가되면 채운다. 확인된 정의만 쓰고 추측으로 채우지 않는다.

상위: [[INDEX]]
