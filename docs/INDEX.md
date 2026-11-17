---
type: index
status: active
updated: 2026-11-17
tags: []
---

# INDEX

이 저장소 문서의 AI 진입점이다. 어떤 작업이든 여기서 시작해 관련 폴더로 이동한다.

## 읽기 순서

`INDEX.md` → 해당 폴더의 `index.md` → 대상 문서.

## 라우팅 표

| 무엇을 찾을 때 | 읽을 위치 | 비고 |
| --- | --- | --- |
| 프로젝트 용어·정의 | [[glossary]] | 00-meta |
| 문서 작성 규칙 | [[conventions]] | 00-meta |
| 시스템 구조·모듈 책임 | [[10-architecture/index]] | docs/10-architecture |
| 결정 이유·대안 | [[20-decisions/index]] | docs/20-decisions |
| 기능 동작·오류 정책 | [[30-specs/index]] | docs/30-specs |
| 설치·실행·반복 절차 | [[40-guides/index]] | docs/40-guides |
| 최근 작업 이력·검증 결과 | [[50-worklog/index]] | docs/50-worklog |
| 외부 API·자료 | [[90-reference/index]] | docs/90-reference |

## 폴더 지도

| 폴더 | 역할 |
| --- | --- |
| `00-meta/` | 문서 체계 자체의 규칙·용어. 제품 내용은 쓰지 않는다. |
| `10-architecture/` | 시스템 구조, 모듈 책임, 의존 관계. |
| `20-decisions/` | ADR. 되돌리기 어려운 결정과 대안 비교. |
| `30-specs/` | 기능 명세, 입출력, 오류 정책. |
| `40-guides/` | 설치·실행·반복 절차. |
| `50-worklog/` | 날짜별 작업 기록과 검증 결과. |
| `90-reference/` | 외부 API·라이브러리 사용 근거와 자료. |
| `_templates/` | 노트 템플릿 5종. 복사해서 쓰며 문서 목록에는 넣지 않는다. |

## 문서 상태

| status | 의미 |
| --- | --- |
| draft | 작성 중 |
| active | 현재 유효 |
| done | 완료된 작업 기록 |
| superseded | 대체됨 (대체 문서 링크 필수) |

## 새 문서 추가 시

1. `_templates/` 에서 맞는 템플릿을 복사한다.
2. [[conventions]] 의 파일명 규칙에 맞춰 저장한다.
3. 해당 폴더 `index.md` 에 링크 + 한 줄 요약을 추가한다.
4. 새 영역(폴더)이 생기면 이 INDEX 의 라우팅 표와 폴더 지도도 갱신한다.
