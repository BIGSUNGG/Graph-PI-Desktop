---
type: meta
status: active
updated: 2026-11-17
tags: []
---

# conventions

문서 작성 규칙의 단일 기준. 다른 문서는 이 문서를 링크로 참조하고 같은 규칙을 다시 서술하지 않는다.

## frontmatter 스키마

| 키 | 필수 | 허용값 | 의미 |
| --- | --- | --- | --- |
| `type` | 필수 | `index`, `meta`, `architecture`, `adr`, `spec`, `guide`, `worklog`, `reference` | 노트 유형. 폴더 역할과 일치시킨다. |
| `status` | 필수 | `draft`, `active`, `done`, `superseded` | 현재 상태. |
| `updated` | 필수 | `YYYY-MM-DD` | 마지막 수정일. 수정할 때마다 갱신한다. |
| `tags` | 필수 | 문자열 배열 (예: `[]`, `[template]`) | Obsidian 태그. |

## 파일명·경로 규칙

| 유형 | 경로 패턴 | 예시 |
| --- | --- | --- |
| ADR | `docs/20-decisions/ADR-0001-<slug>.md` | `docs/20-decisions/ADR-0001-docs-vault-layout.md` |
| spec | `docs/30-specs/SPEC-<slug>.md` | `docs/30-specs/SPEC-launch-flow.md` |
| worklog | `docs/50-worklog/YYYY-MM/YYYY-MM-DD.md` | `docs/50-worklog/2026-11/2026-11-17.md` |
| architecture | `docs/10-architecture/<area>.md` | `docs/10-architecture/document-repo.md` |
| guide | `docs/40-guides/<slug>.md` | `docs/40-guides/local-setup.md` |
| reference | `docs/90-reference/<slug>.md` | `docs/90-reference/obsidian-basics.md` |

- slug 는 ASCII kebab-case 소문자. 폴더명과 파일명에 한글을 쓰지 않는다.
- ADR 은 4자리 번호를 순서대로 발급한다(`ADR-0001`, `ADR-0002`, ...).
- worklog 는 하루에 한 파일. 같은 날 재작업하면 새 파일을 만들지 않고 갱신한다.
- 위 표의 예시 경로는 형식 설명용이며 실제 파일이 아니다.

## 링크 규칙

- 내부 링크는 wikilink: `[[노트명]]` 또는 `[[노트명|표시문구]]`.
- 폴더 index 노트는 파일명이 모두 `index.md` 이므로 `[[폴더/index|표시문구]]` 로 경로를 붙인다.
- 노트 안의 특정 절을 가리킬 때는 `[[노트명#절 제목]]` 을 쓴다.
- 외부 URL 만 마크다운 링크 `[표시문구](https://...)` 를 쓴다.
- 상대경로 링크(`./`, `../`)와 깨진 링크를 남기지 않는다. 링크를 추가하면 대상 파일 존재를 확인한다.

## 문서 생애주기

1. 새 노트는 템플릿 복사로 시작하며 `status: draft`.
2. 내용이 확정되어 현재 유효하면 `active`.
3. 작업 기록처럼 역할이 끝난 문서는 `done`.
4. ADR 은 예외 흐름을 따른다: 결정이 뒤집히면 본문을 고치지 않고 `superseded` 로 바꾸고, 대체 ADR 링크를 남긴 뒤 새 번호로 새 ADR 을 쓴다.

## 작업 후 갱신 규칙

| 트리거 | 갱신 대상 |
| --- | --- |
| 되돌리기 어려운 설계 결정, 대안 비교 | `docs/20-decisions/` (ADR) |
| 모듈·데이터 흐름·의존 구조 변경 | `docs/10-architecture/` |
| 사용자에게 보이는 동작·입력·오류 정책 변경 | `docs/30-specs/` |
| 반복 실행할 절차·셋업·명령 추가 | `docs/40-guides/` |
| 외부 API·라이브러리 사용 근거 | `docs/90-reference/` |
| 새 용어·정의 | `docs/00-meta/glossary.md` |

worklog(`docs/50-worklog/`)는 트리거와 무관하게 항상 남긴다.

## 중복 금지

한 사실은 한 문서에만 쓴다. 다른 문서에서 필요하면 내용을 복사하지 말고 링크한다. 규칙이 바뀌면 원본만 고친다.

## 템플릿

| 템플릿 | 사용 시점 |
| --- | --- |
| `_templates/adr.md` | 되돌리기 어려운 결정을 기록할 때 |
| `_templates/spec.md` | 기능 동작과 오류 정책을 확정할 때 |
| `_templates/worklog.md` | 작업 단위마다 결과와 검증을 남길 때 |
| `_templates/module.md` | 모듈 책임과 공개 API 를 정리할 때 |
| `_templates/guide.md` | 반복 실행할 절차를 정리할 때 |

상위: [[INDEX]]
