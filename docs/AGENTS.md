---
type: meta
status: active
updated: 2026-11-17
tags: []
---

# docs 작성 규칙

`docs/` 는 Obsidian vault 이자 AI 문서 저장소다. 저장소 전체 작업 절차는 루트 AGENTS.md 를 따르고, 이 문서는 docs 내부 작성 규칙만 다룬다.

## 새 노트

`_templates/` 의 해당 템플릿(adr·spec·worklog·module·guide)을 복사해 시작한다.

## frontmatter

`type` `status` `updated` `tags` 4키가 필수다. 내용을 고치면 `updated` 를 당일 날짜로 바꾼다. 스키마는 [[conventions]] 를 따른다.

## 링크

- 내부 링크는 `[[노트명]]` 또는 `[[노트명|표시문구]]`, 외부 URL 만 마크다운 링크로 쓴다.
- 상대경로 링크(`./`, `../`)를 쓰지 않는다. 깨진 링크를 남기지 않는다.
- 폴더 index 노트는 파일명이 모두 `index.md` 이므로 `[[폴더/index|표시문구]]` 형태로 쓴다.

## 파일명 규칙

| 유형 | 경로 패턴 |
| --- | --- |
| ADR | `docs/20-decisions/ADR-0001-<slug>.md` |
| spec | `docs/30-specs/SPEC-<slug>.md` |
| worklog | `docs/50-worklog/YYYY-MM/YYYY-MM-DD.md` |
| architecture | `docs/10-architecture/<area>.md` |
| guide | `docs/40-guides/<slug>.md` |
| reference | `docs/90-reference/<slug>.md` |

slug 는 ASCII kebab-case 소문자.

## 갱신·수명주기

- 문서를 추가·갱신하면 해당 폴더 `index.md` 에 링크 + 한 줄 요약을 넣는다.
- `status`: draft(작성 중) / active(현재 유효) / done(완료된 작업 기록) / superseded(대체됨).
- `superseded` 는 대체 문서 링크가 필수다.
- ADR 은 삭제·본문 수정 없이 `superseded` 로 표시하고 새 ADR 번호를 발급한다.
- 30줄 넘는 문서는 frontmatter 를 제외한 본문 첫 5줄 안에 "한 줄 요약"을 둔다. 관련 문서 링크는 문서 끝이나 첫 절에 둔다.

규칙의 단일 기준은 [[conventions]] 다. 충돌하면 [[conventions]] 를 따르고 이 문서를 고친다.
