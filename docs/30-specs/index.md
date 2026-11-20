---
type: index
status: active
updated: 2026-11-20
tags: []
---

# 30-specs

사용자에게 보이는 기능 동작, 입력, 오류 정책을 명세로 확정한다.

## 문서 목록

| 문서 | 상태 | 한 줄 요약 |
| --- | --- | --- |
| [[30-specs/SPEC-graph-pi-ade]] | draft | Pi 전용 ADE의 4개 화면·조작·오류·완료 조건 |
| [[30-specs/SPEC-hub-orchestration]] | draft | 허브 자율 관리·프리셋·Goal/List/Loop/Audit·TODO/대화/질문·채팅 @참조 |

## 작성 규칙

- `_templates/spec.md` 로 시작하고 파일명은 `SPEC-<slug>.md`.
- 포함 범위와 제외 범위를 모두 적는다. 완료 조건은 관찰 가능한 형태로 쓴다.
- 구현 방법은 여기 쓰지 않는다. 구조는 [[10-architecture/index]], 결정 이유는 [[20-decisions/index]] 로 보낸다.

상위: [[INDEX]]
