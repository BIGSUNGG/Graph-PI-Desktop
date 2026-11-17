---
type: index
status: active
updated: 2026-11-17
tags: []
---

# 20-decisions

되돌리기 어려운 결정과 그 대안을 ADR 로 남긴다.

## 문서 목록

| 문서 | 상태 | 한 줄 요약 |
| --- | --- | --- |
| [[20-decisions/ADR-0001-standalone-ade-over-orca-plugin]] | active | ADE를 플러그인이 아닌 별도 데스크톱 앱으로 만든다 |
| [[20-decisions/ADR-0002-pi-session-jsonl-data-source]] | active | 대화는 Pi JSONL, 제어는 Orca CLI를 함께 쓴다 |

## 작성 규칙

- `_templates/adr.md` 로 시작하고 파일명은 `ADR-0001-<slug>.md`. 번호는 4자리, 순서대로 발급한다.
- ADR 은 삭제하거나 본문을 고치지 않는다. 결정이 뒤집히면 `status: superseded` 로 표시하고 대체 ADR 링크를 남긴 뒤 새 번호로 새 ADR 을 쓴다.
- 대안을 최소 1개 이상 표로 남긴다. 근거 없이 "결정했다"만 쓰지 않는다.

상위: [[INDEX]]
