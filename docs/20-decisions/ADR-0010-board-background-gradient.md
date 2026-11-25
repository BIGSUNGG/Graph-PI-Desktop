---
type: decision
status: active
updated: 2026-11-26
tags: [adr, ui, board]
---

# ADR-0010 보드 배경은 CSS 그라디언트로 칠하고, 그래프 영역에만 적용한다

## 배경

[[ADR-0008-mock-first-design]] 은 `mock/index.html` 을 디자인 단일 소스로 정하고, 목업에 없는 UI 만 Orca 디자인 언어로 설계하도록 한다. 목업 보드 배경은 단색(`--card`)이다. 사용자가 "가장 비주얼적으로 좋은 방법으로 배경을 적용"하라고 요청했고, 네 가지를 직접 골랐다: 소재는 CSS 그라디언트(이미지 에셋 없음), 범위는 보드 캔버스만, 가독성은 딤 오버레이 + 카드 불투명, 제어는 설정 토글.

## 결정

`.graph-wrap` 에 `has-bg` 클래스를 조건부로 붙이고, 그 안에서만 레이어 그라디언트를 칠한다.

- 토큰/계약: `Settings.background: boolean`, `DEFAULT_SETTINGS.background = true`(`src/shared/contract/app.ts`). `src/main/state/store.ts` 의 `sanitizeSettings` 가 boolean 만 받아들이고 아니면 기본값으로 되돌린다(외부 JSON 경계).
- 배경: `radial-gradient` 2장(좌상단 `--accent` 20%, 우하단 `--purple` 14%) + 세로 `linear-gradient`(딤) + `--bg` 바탕. 딤을 별도 오버레이 DOM 이 아니라 마지막 레이어 알파로 처리해, 스크롤 컨테이너 안에 `position:absolute` 레이어를 넣는 문제를 피한다.
- 카드: `.graph-wrap.has-bg .board-session-card{fill:var(--card)}` — 노드가 반투명이면 그라디언트가 비쳐 대비가 깨진다. 배경을 켠 상태에서만 불투명으로 올린다.
- 범위: 사이드바·인스펙터·채팅·타이틀바는 지금의 불투명 다크를 유지한다. 배경은 `.graph-wrap` 하나뿐이다.
- 토글: 타이틀바 우상단 `button.tb-bg`(`aria-pressed`). `.titlebar button` 은 이미 `-webkit-app-region:no-drag` 라 드래그 영역과 충돌하지 않는다. 값은 기존 `app:settings:set` 부분 갱신으로 저장된다.

## 대안

- **이미지 에셋(PNG/JPG) 배경**: 해상도·배율마다 다시 뽑아야 하고 번들 크기가 늘며, 다크 UI 대비를 이미지 밝기에 맞춰 조정해야 한다. CSS 그라디언트는 해상도 독립이고 롤백이 클래스 하나다.
- **창 전체(body) 배경 + 반투명 패널**: 가장 "이미지 같은" 결과지만 텍스트 대비를 패널마다 다시 검증해야 하고 목업 편차가 커진다. 사이드바·인스펙터 대비가 목업 승인값에서 벗어난다.
- **배경 자체 blur**: 정적 배경에도 GPU 비용이 들고, 이 앱은 이미 소프트웨어 렌더링을 기본으로 쓴다(E2E 렌더러 크래시 대응). 첫 페인트 이득 없이 비용만 늘어 제외.
- **토글 없이 항상 켜기**: 목업 대비 편차가 고정되고, 스크린샷·E2E 기준이 함께 흔들린다. 기본값을 켜되 끌 수 있게 하는 쪽이 회귀 위험이 낮다.

## 결과

- 목업과 다른 화면이 기본값이 된다. 차이는 보드 캔버스 배경 한 겹뿐이고, 토글로 즉시 목업 상태로 돌아간다. 목업 대비표/스크린샷은 배경 켠 상태를 기준으로 갱신했다.
- 설정 파일에 `background` 가 없는 기존 사용자도 기본값 `true` 로 시작한다(`sanitizeSettings` 가 채운다).
- 판정: `e2e/background.spec.ts` — 기본 켜짐, 토글로 `has-bg` on/off, 카드 `fill` 이 `rgb(23, 23, 23)` 로 불투명, 배경 레이어에 `radial-gradient` 존재.
- 나중에 이미지 배경을 넣더라도 계약(`Settings.background`)과 클래스 지점(`.graph-wrap.has-bg`)은 그대로 재사용할 수 있다.
