// 목업 전용 더미 데이터. 실제 Pi JSONL / Orca CLI 와 무관합니다.
// Nimbus — 가상의 B2B SaaS. web · api · worker · infra · shared 5개 저장소.
window.MOCK = {
  workspace: "graph-pi",
  product: "Nimbus",
  repo: "C:/Projects/nimbus",
  bases: ["main", "develop"],
  models: [
    "anthropic/claude-sonnet-4.5",
    "openai/gpt-5",
    "google/gemini-2.5-pro",
    "opencode-go/deepseek-v4.1-flash"
  ],
  presets: [
    { id: "feature", name: "Feature", desc: "부모 세션(허브)이 여러 저장소의 자식 워크트리를 관리합니다." },
    { id: "loop", name: "Loop", desc: "부모 워크트리가 반복 실행되는 자식 워크트리를 감시합니다." },
    { id: "manual", name: "Manual", desc: "부모 관계·허브·Loop를 사용자가 직접 구성합니다." }
  ],
  loopStates: ["idle", "running", "waiting", "paused", "done", "stopped"],

  groups: [
    { id: "g-feature", name: "고객 온보딩", note: "web · api · shared · worker", hubSessionId: "s-onb-hub" },
    { id: "g-billing", name: "구독 결제", note: "web · api · worker", hubSessionId: "s-bill-hub" },
    { id: "g-loop", name: "API 성능 루프", note: "query · cache · index" },
    { id: "g-manual", name: "보안 점검", note: "api · web · audit" },
    { id: "g-infra", name: "인프라 마이그레이션", note: "core · k8s · db · obs", hubSessionId: "s-infra-hub" },
    { id: "g-fix", name: "릴리스 안정화", note: "develop · security · performance" }
  ],

  worktrees: [
    { id: "wt-onb-web", group: "g-feature", repo: "web", name: "onb-web", branch: "feature/onboarding", parent: null, dirty: true, orcaMissing: false },
    { id: "wt-onb-api", group: "g-feature", repo: "api", name: "onb-api", branch: "feature/onboarding", parent: null, dirty: true, orcaMissing: false },
    { id: "wt-onb-shared", group: "g-feature", repo: "shared", name: "onb-shared", branch: "feature/onboarding", parent: null, dirty: false, orcaMissing: false },
    { id: "wt-onb-worker", group: "g-feature", repo: "worker", name: "onb-worker", branch: "feature/onboarding", parent: null, dirty: false, orcaMissing: false },

    { id: "wt-bill-web", group: "g-billing", repo: "web", name: "bill-web", branch: "feature/billing", parent: null, dirty: true, orcaMissing: false },
    { id: "wt-bill-api", group: "g-billing", repo: "api", name: "bill-api", branch: "feature/billing", parent: null, dirty: false, orcaMissing: false },
    { id: "wt-bill-worker", group: "g-billing", repo: "worker", name: "bill-worker", branch: "feature/billing", parent: null, dirty: false, orcaMissing: true },

    { id: "wt-perf-api", group: "g-loop", repo: "api", name: "perf-api", branch: "perf/api-baseline", parent: null, dirty: false, orcaMissing: false },
    { id: "wt-perf-query", group: "g-loop", repo: "api", name: "perf-query", branch: "perf/query", parent: "wt-perf-api", dirty: true, orcaMissing: false,
      loop: { prompt: "느린 쿼리 상위 3개를 찾아 제거하고 p95를 다시 측정해.", maxRounds: 5, round: 2, status: "running", lastEvent: "2회차 측정 완료 · p95 412ms → 287ms" } },
    { id: "wt-perf-cache", group: "g-loop", repo: "api", name: "perf-cache", branch: "perf/cache", parent: "wt-perf-api", dirty: true, orcaMissing: false,
      loop: { prompt: "캐시 미스가 많은 엔드포인트를 찾아 TTL과 키를 조정해.", maxRounds: 4, round: 3, status: "waiting", lastEvent: "3회차 응답 대기 · 마지막 전송 15:42" } },
    { id: "wt-perf-index", group: "g-loop", repo: "api", name: "perf-index", branch: "perf/index", parent: "wt-perf-api", dirty: false, orcaMissing: false,
      loop: { prompt: "인덱스 후보를 검토하고 EXPLAIN 결과를 첨부해.", maxRounds: 3, round: 3, status: "done", lastEvent: "3회차 완료 · 복합 인덱스 2개 추가" } },

    { id: "wt-sec-api", group: "g-manual", repo: "api", name: "sec-api", branch: "chore/security-audit", parent: null, dirty: false, orcaMissing: false },
    { id: "wt-sec-web", group: "g-manual", repo: "web", name: "sec-web", branch: "chore/security-audit", parent: null, dirty: true, orcaMissing: false },
    { id: "wt-sec-audit", group: "g-manual", repo: "api", name: "sec-audit", branch: "chore/security-audit", parent: "wt-sec-api", dirty: false, orcaMissing: false,
      loop: { prompt: "OWASP 상위 10개 항목을 순서대로 점검하고 재현 테스트를 남겨.", maxRounds: 6, round: 1, status: "paused", lastEvent: "1회차 일시정지 · 자격 증명 확인 필요" } },
    { id: "wt-sec-secrets", group: "g-manual", repo: "infra", name: "sec-secrets", branch: "chore/security-audit", parent: "wt-sec-api", dirty: false, orcaMissing: false },

    { id: "wt-infra-core", group: "g-infra", repo: "infra", name: "infra-core", branch: "feature/infra-migration", parent: null, dirty: true, orcaMissing: false },
    { id: "wt-infra-k8s", group: "g-infra", repo: "infra", name: "infra-k8s", branch: "feature/infra-migration", parent: null, dirty: false, orcaMissing: false },
    { id: "wt-infra-db", group: "g-infra", repo: "infra", name: "infra-db", branch: "feature/infra-migration", parent: null, dirty: true, orcaMissing: false },
    { id: "wt-infra-obs", group: "g-infra", repo: "infra", name: "infra-obs", branch: "feature/infra-migration", parent: null, dirty: false, orcaMissing: false },

    { id: "wt-develop", group: "g-fix", repo: "api", name: "develop", branch: "develop", parent: null, dirty: false, orcaMissing: false },
    { id: "wt-fix-sec", group: "g-fix", repo: "api", name: "fix-sec", branch: "fix/security", parent: "wt-develop", dirty: true, orcaMissing: false },
    { id: "wt-fix-perf", group: "g-fix", repo: "api", name: "fix-perf", branch: "fix/performance", parent: "wt-develop", dirty: true, orcaMissing: false }
  ],

  sessions: [
    { id: "s-onb-hub", title: "온보딩 4레포 통합 관리", wt: "wt-onb-api", group: "g-feature", model: "anthropic/claude-sonnet-4.5", state: "running", started: "09:02", last: "09:58", tokens: 18400, parent: null },
    { id: "s-onb-web", title: "온보딩 위저드 UI", wt: "wt-onb-web", group: "g-feature", model: "anthropic/claude-sonnet-4.5", state: "running", started: "09:10", last: "09:55", tokens: 32100, parent: "s-onb-hub" },
    { id: "s-onb-api", title: "온보딩 API · 단계 저장", wt: "wt-onb-api", group: "g-feature", model: "anthropic/claude-sonnet-4.5", state: "running", started: "09:12", last: "09:57", tokens: 28700, parent: "s-onb-hub" },
    { id: "s-onb-shared", title: "온보딩 공통 스키마", wt: "wt-onb-shared", group: "g-feature", model: "openai/gpt-5", state: "done", started: "09:15", last: "09:48", tokens: 9600, parent: "s-onb-hub" },
    { id: "s-onb-worker", title: "온보딩 메일 워커", wt: "wt-onb-worker", group: "g-feature", model: "openai/gpt-5", state: "idle", started: "09:30", last: "09:44", tokens: 5200, parent: "s-onb-api" },
    { id: "s-onb-qa", title: "온보딩 E2E 시나리오", wt: "wt-onb-web", group: "g-feature", model: "google/gemini-2.5-pro", state: "done", started: "09:40", last: "09:52", tokens: 7400, parent: "s-onb-web" },
    { id: "s-onb-docs", title: "온보딩 가이드", wt: "wt-onb-shared", group: "g-feature", model: "google/gemini-2.5-pro", state: "idle", started: "09:50", last: "09:58", tokens: 2600, parent: "s-onb-shared" },

    { id: "s-bill-hub", title: "구독 결제 3레포 통합", wt: "wt-bill-api", group: "g-billing", model: "anthropic/claude-sonnet-4.5", state: "running", started: "10:02", last: "10:58", tokens: 15600, parent: null },
    { id: "s-bill-web", title: "결제 화면 · 플랜 선택", wt: "wt-bill-web", group: "g-billing", model: "anthropic/claude-sonnet-4.5", state: "running", started: "10:10", last: "10:56", tokens: 27400, parent: "s-bill-hub" },
    { id: "s-bill-api", title: "웹훅 검증 · 재시도", wt: "wt-bill-api", group: "g-billing", model: "openai/gpt-5", state: "done", started: "10:12", last: "10:50", tokens: 19800, parent: "s-bill-hub" },
    { id: "s-bill-worker", title: "인보이스 워커", wt: "wt-bill-worker", group: "g-billing", model: "openai/gpt-5", state: "idle", started: "10:20", last: "10:40", tokens: 6100, parent: "s-bill-hub" },
    { id: "s-bill-qa", title: "결제 실패 케이스", wt: "wt-bill-web", group: "g-billing", model: "google/gemini-2.5-pro", state: "done", started: "10:35", last: "10:47", tokens: 8300, parent: "s-bill-web" },

    { id: "s-perf-root", title: "성능 루프 감시", wt: "wt-perf-api", group: "g-loop", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "11:02", last: "11:40", tokens: 4200, parent: null },
    { id: "s-perf-query", title: "느린 쿼리 제거", wt: "wt-perf-query", group: "g-loop", model: "anthropic/claude-sonnet-4.5", state: "running", started: "11:05", last: "11:52", tokens: 22100, parent: null, loop: true },
    { id: "s-perf-cache", title: "캐시 히트율 개선", wt: "wt-perf-cache", group: "g-loop", model: "openai/gpt-5", state: "running", started: "11:08", last: "11:54", tokens: 18300, parent: null, loop: true },
    { id: "s-perf-index", title: "인덱스 후보 검토", wt: "wt-perf-index", group: "g-loop", model: "openai/gpt-5", state: "done", started: "11:10", last: "11:38", tokens: 12700, parent: null, loop: true },

    { id: "s-sec-root", title: "보안 점검 총괄", wt: "wt-sec-api", group: "g-manual", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "13:02", last: "13:30", tokens: 3800, parent: null },
    { id: "s-sec-web", title: "웹 보안 헤더 점검", wt: "wt-sec-web", group: "g-manual", model: "anthropic/claude-sonnet-4.5", state: "running", started: "13:05", last: "13:48", tokens: 14200, parent: null },
    { id: "s-sec-audit", title: "OWASP 점검 루프", wt: "wt-sec-audit", group: "g-manual", model: "openai/gpt-5", state: "running", started: "13:10", last: "13:50", tokens: 16800, parent: null, loop: true },
    { id: "s-sec-secrets", title: "시크릿 스캔", wt: "wt-sec-secrets", group: "g-manual", model: "google/gemini-2.5-pro", state: "idle", started: "13:20", last: "13:36", tokens: 5400, parent: "s-sec-audit" },

    { id: "s-infra-hub", title: "인프라 마이그레이션 통합", wt: "wt-infra-core", group: "g-infra", model: "anthropic/claude-sonnet-4.5", state: "running", started: "14:02", last: "14:58", tokens: 20400, parent: null },
    { id: "s-infra-k8s", title: "K8s 매니페스트 이전", wt: "wt-infra-k8s", group: "g-infra", model: "anthropic/claude-sonnet-4.5", state: "running", started: "14:10", last: "14:55", tokens: 23600, parent: "s-infra-hub" },
    { id: "s-infra-db", title: "DB 마이그레이션 검증", wt: "wt-infra-db", group: "g-infra", model: "openai/gpt-5", state: "done", started: "14:12", last: "14:48", tokens: 17900, parent: "s-infra-hub" },
    { id: "s-infra-obs", title: "관측 파이프라인", wt: "wt-infra-obs", group: "g-infra", model: "google/gemini-2.5-pro", state: "idle", started: "14:20", last: "14:44", tokens: 7100, parent: "s-infra-hub" },
    { id: "s-infra-qa", title: "마이그레이션 리허설", wt: "wt-infra-k8s", group: "g-infra", model: "openai/gpt-5", state: "done", started: "14:35", last: "14:52", tokens: 9800, parent: "s-infra-k8s" },

    { id: "s-fix-root", title: "릴리스 안정화 총괄", wt: "wt-develop", group: "g-fix", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "15:30", last: "15:45", tokens: 4820, parent: null },
    { id: "s-fix-sec", title: "세션 고정 취약점 수정", wt: "wt-fix-sec", group: "g-fix", model: "anthropic/claude-sonnet-4.5", state: "running", started: "15:02", last: "15:41", tokens: 21600, parent: null, mergeTo: "wt-develop" },
    { id: "s-fix-perf", title: "쿼리 N+1 제거", wt: "wt-fix-perf", group: "g-fix", model: "openai/gpt-5", state: "running", started: "15:10", last: "15:44", tokens: 15200, parent: null, loop: true },
    { id: "s-fix-qa", title: "릴리스 회귀 테스트", wt: "wt-fix-sec", group: "g-fix", model: "google/gemini-2.5-pro", state: "done", started: "15:20", last: "15:38", tokens: 6900, parent: "s-fix-sec" },
    { id: "s-fix-docs", title: "릴리스 노트", wt: "wt-develop", group: "g-fix", model: "google/gemini-2.5-pro", state: "done", started: "15:32", last: "15:40", tokens: 3200, parent: "s-fix-root" }
  ],

  messages: {
    "s-onb-hub": [
      { role: "user", at: "09:02", text: "Nimbus 온보딩을 web, api, shared, worker 네 레포에 한 번에 붙여줘. 공통 단계 정의는 이 세션에서 관리해." },
      { role: "assistant", at: "09:04", thinkFor: 3, think: "네 레포가 같은 단계 정의를 봐야 하니 shared를 기준으로 두고, 각 레포는 참조만 하게 한다.", text: "레포별 워크트리 4개와 자식 세션을 만들었습니다. 단계 정의는 shared에 두고 나머지는 참조만 하게 했습니다." },
      { role: "tool", at: "09:11", text: "orca worktree create --json × 4\n→ onb-web, onb-api, onb-shared, onb-worker 준비 완료" },
      { role: "assistant", at: "09:58", text: "web은 위저드 3단계까지, api는 단계 저장까지 통과했습니다. worker는 메일 템플릿 확인 중입니다." }
    ],
    "s-onb-web": [
      { role: "user", at: "09:10", text: "위저드 1단계(회사 정보)부터 만들고, 단계별로 저장 가능하게 해줘." },
      { role: "assistant", at: "09:12", thinkFor: 6, think: "단계 상태를 URL에 두면 새로고침과 공유에서 깨진다. step id를 저장하는 쪽이 안전하다.", text: "단계 상태를 URL이 아니라 shared 스키마의 step id로 관리하도록 잡았습니다. 새로고침해도 이어집니다." },
      { role: "tool", at: "09:41", text: "playwright: onboarding wizard 3 steps\n→ 9 passed, 0 failed" }
    ],
    "s-onb-api": [
      { role: "user", at: "09:12", text: "단계 저장 API를 만들고, 같은 회사가 두 번 시작하면 이어서 하게 해줘." },
      { role: "assistant", at: "09:15", thinkFor: 4, think: "회사와 단계의 유니크 키를 먼저 잡고, 완료 이벤트를 분리한다.", text: "company_id + step_id 유니크 키로 upsert합니다. 완료 시 onboarding.completed 이벤트를 발행합니다." },
      { role: "tool", at: "09:47", text: "api contract test\n→ 14 passed, 0 failed" }
    ],
    "s-onb-shared": [
      { role: "user", at: "09:15", text: "온보딩 단계 정의를 shared 패키지에 넣고 web/api가 같이 쓰게 해줘." },
      { role: "assistant", at: "09:17", text: "step id, 필수 필드, 완료 조건을 한 파일로 묶었습니다. 버전은 1.2.0으로 올렸습니다." },
      { role: "tool", at: "09:48", text: "shared build\n→ d.ts + esm 생성 완료" }
    ],
    "s-onb-worker": [
      { role: "user", at: "09:30", text: "온보딩 완료 메일을 보내는 워커를 붙여줘. 재시도는 3회." },
      { role: "assistant", at: "09:32", text: "큐 컨슈머를 추가했습니다. 실패 시 지수 백오프로 3회 재시도하고 dead letter로 보냅니다." }
    ],
    "s-onb-qa": [
      { role: "user", at: "09:40", text: "신규 회사가 온보딩을 끝까지 마치는 E2E를 만들어줘." },
      { role: "assistant", at: "09:52", text: "빈 회사 → 3단계 → 완료 메일까지 1개 시나리오를 추가했습니다. worker는 목으로 대체했습니다." }
    ],
    "s-onb-docs": [
      { role: "user", at: "09:50", text: "온보딩 운영 가이드를 짧게 정리해줘." },
      { role: "assistant", at: "09:58", text: "단계 정의 변경 방법, 이벤트 스키마, 재시도 정책을 한 페이지로 정리했습니다." }
    ],

    "s-bill-hub": [
      { role: "user", at: "10:02", text: "구독 결제를 web, api, worker에 붙여줘. 웹훅 검증은 api에서만." },
      { role: "assistant", at: "10:04", thinkFor: 7, think: "웹훅 검증은 api 한 곳에 모으고, web과 worker는 각자의 책임만 갖게 나눈다.", text: "결제 웹훅은 api의 단일 엔드포인트로 모으고, web은 플랜 선택만, worker는 인보이스만 담당하게 나눴습니다." },
      { role: "tool", at: "10:11", text: "orca worktree create --json × 3\n→ bill-web, bill-api, bill-worker 준비 완료" },
      { role: "assistant", at: "10:58", text: "웹훅 재시도 큐까지 연결했습니다. worker는 Orca에서 사라져 보드에 없음으로 표시됩니다." }
    ],
    "s-bill-web": [
      { role: "user", at: "10:10", text: "플랜 선택 화면을 만들고, 연간/월간 토글을 넣어줘." },
      { role: "assistant", at: "10:13", text: "플랜 카드 3개와 토글을 붙였습니다. 가격은 api의 /plans 응답을 그대로 씁니다." },
      { role: "tool", at: "10:44", text: "plan-picker: annual discount 20%\n→ 표시/계산 일치" }
    ],
    "s-bill-api": [
      { role: "user", at: "10:12", text: "웹훅 서명 검증과 재시도 큐를 만들어줘. 중복 이벤트는 무시." },
      { role: "assistant", at: "10:15", text: "event_id 기준 멱등 처리와 5회 재시도를 넣었습니다. 서명 실패는 400으로 즉시 반환합니다." },
      { role: "tool", at: "10:50", text: "webhook-replay: 200 events\n→ 중복 3건 무시, 실패 0" }
    ],
    "s-bill-worker": [
      { role: "user", at: "10:20", text: "인보이스 PDF를 만들어 S3에 올리는 워커를 붙여줘." },
      { role: "assistant", at: "10:22", text: "PDF 생성과 업로드를 분리했습니다. 업로드 실패는 큐로 다시 넣습니다." }
    ],
    "s-bill-qa": [
      { role: "user", at: "10:35", text: "결제 실패 케이스(카드 거절, 타임아웃)를 정리해줘." },
      { role: "assistant", at: "10:47", text: "카드 거절은 즉시 안내, 타임아웃은 3회 재시도 후 실패로 정리했습니다." }
    ],

    "s-perf-root": [
      { role: "user", at: "11:02", text: "API p95가 400ms를 넘었어. 자식 워크트리 3개로 쿼리·캐시·인덱스를 나눠서 돌려줘." },
      { role: "assistant", at: "11:04", text: "perf-query, perf-cache, perf-index를 부모 아래에 만들고 각각 Loop 설정을 붙였습니다." }
    ],
    "s-perf-query": [
      { role: "user", at: "11:05", text: "느린 쿼리 상위 3개를 찾아 제거하고 p95를 다시 측정해." },
      { role: "assistant", at: "11:18", thinkFor: 8, think: "상위 3개를 먼저 EXPLAIN으로 확인하고, 인덱스보다 쿼리 제거가 싼 것부터 손본다.", text: "1회차에서 orders 조회 2건을 제거했습니다. p95 412ms → 287ms." },
      { role: "tool", at: "11:52", text: "loop round 2/5\n→ EXPLAIN diff 3건, 다음 회차 대기" }
    ],
    "s-perf-cache": [
      { role: "user", at: "11:08", text: "캐시 미스가 많은 엔드포인트를 찾아 TTL과 키를 조정해." },
      { role: "assistant", at: "11:21", text: "catalog, plans 두 엔드포인트의 키를 정규화했습니다. 히트율 61% → 78%." },
      { role: "tool", at: "11:54", text: "loop round 3/4\n→ 응답 대기 · 마지막 전송 15:42" }
    ],
    "s-perf-index": [
      { role: "user", at: "11:10", text: "인덱스 후보를 검토하고 EXPLAIN 결과를 첨부해." },
      { role: "assistant", at: "11:25", text: "orders(company_id, created_at)와 invoices(status, due_at) 두 후보를 골랐습니다." },
      { role: "tool", at: "11:38", text: "loop round 3/3 done\n→ 복합 인덱스 2개 추가" }
    ],

    "s-sec-root": [
      { role: "user", at: "13:02", text: "릴리스 전에 보안 점검을 수동으로 구성해줘. api와 web을 루트로 두고 audit을 아래에 붙여." },
      { role: "assistant", at: "13:04", text: "sec-api, sec-web을 루트로 만들고 sec-audit, sec-secrets를 api 아래에 붙였습니다." }
    ],
    "s-sec-web": [
      { role: "user", at: "13:05", text: "CSP, HSTS, 쿠키 플래그를 점검해줘." },
      { role: "assistant", at: "13:28", text: "CSP에 unsafe-inline이 남아 있어 nonce 방식으로 바꿀 것을 제안합니다." }
    ],
    "s-sec-audit": [
      { role: "user", at: "13:10", text: "OWASP 상위 10개 항목을 순서대로 점검하고 재현 테스트를 남겨." },
      { role: "assistant", at: "13:33", text: "A01 접근 제어에서 재현 1건을 찾았습니다. 테스트는 격리된 픽스처로 남겼습니다." },
      { role: "tool", at: "13:50", text: "loop round 1/6 paused\n→ 자격 증명 확인 필요" }
    ],
    "s-sec-secrets": [
      { role: "user", at: "13:20", text: "레포 전체에서 시크릿 패턴을 스캔해줘." },
      { role: "assistant", at: "13:36", text: "후보 2건을 찾았지만 둘 다 테스트 픽스처였습니다. 실제 키는 없습니다." }
    ],

    "s-infra-hub": [
      { role: "user", at: "14:02", text: "인프라 마이그레이션을 core, k8s, db, obs 네 워크트리로 나눠서 진행해." },
      { role: "assistant", at: "14:04", text: "core를 허브로 두고 나머지 세 워크트리에 자식 세션을 붙였습니다. 컷오버는 db 리허설 이후로 잡았습니다." },
      { role: "tool", at: "14:11", text: "orca worktree create --json × 4\n→ infra-core, infra-k8s, infra-db, infra-obs 준비 완료" },
      { role: "assistant", at: "14:58", text: "K8s 매니페스트는 80% 이전했습니다. db 리허설은 통과, obs는 대기 중입니다." }
    ],
    "s-infra-k8s": [
      { role: "user", at: "14:10", text: "기존 VM 매니페스트를 K8s로 옮기고, readiness/liveness를 붙여줘." },
      { role: "assistant", at: "14:26", text: "deployment 6개를 옮겼습니다. api는 startupProbe를 추가로 넣었습니다." },
      { role: "tool", at: "14:55", text: "kubectl diff\n→ 6 deployments, 2 services, 1 ingress" }
    ],
    "s-infra-db": [
      { role: "user", at: "14:12", text: "DB 마이그레이션을 리허설하고 롤백 시간을 측정해줘." },
      { role: "assistant", at: "14:31", text: "스테이징 스냅샷에서 12분 40초 걸렸습니다. 롤백은 4분 10초입니다." },
      { role: "tool", at: "14:48", text: "migration-rehearsal\n→ forward 12m40s, rollback 4m10s" }
    ],
    "s-infra-obs": [
      { role: "user", at: "14:20", text: "관측 파이프라인을 OTel 기준으로 정리해줘." },
      { role: "assistant", at: "14:44", text: "트레이스는 api/worker, 로그는 infra로 모으는 구성을 제안했습니다. 아직 적용 전입니다." }
    ],
    "s-infra-qa": [
      { role: "user", at: "14:35", text: "컷오버 리허설 체크리스트를 만들어줘." },
      { role: "assistant", at: "14:52", text: "db → k8s → obs 순서와 각 단계 롤백 조건을 체크리스트로 정리했습니다." }
    ],

    "s-fix-root": [
      { role: "user", at: "15:30", text: "릴리스 전에 보안과 성능 이슈를 develop 기준으로 정리해줘." },
      { role: "assistant", at: "15:32", text: "fix-sec, fix-perf를 develop 아래에 붙였습니다. 둘 다 머지 큐로 보냅니다." }
    ],
    "s-fix-sec": [
      { role: "user", at: "15:02", text: "세션 고정 취약점을 재현하고 수정해줘." },
      { role: "assistant", at: "15:18", thinkFor: 5, think: "로그인 후 세션 id가 그대로면 쿠키 재사용이 가능하다. 회전과 재사용 차단을 같이 넣는다.", text: "로그인 후 세션 id를 회전하지 않는 문제를 재현했습니다. 쿠키 재사용을 차단했습니다." },
      { role: "tool", at: "15:41", text: "merge queue: fix/security → develop\n→ 리뷰 대기" }
    ],
    "s-fix-perf": [
      { role: "user", at: "15:10", text: "N+1 쿼리를 찾아 제거하고 다시 측정해." },
      { role: "assistant", at: "15:26", text: "invoices 목록에서 3건을 제거했습니다. 쿼리 수 41 → 12." },
      { role: "tool", at: "15:44", text: "loop round 2/3\n→ 다음 회차에서 같은 쿼리 재검사" }
    ],
    "s-fix-qa": [
      { role: "user", at: "15:20", text: "릴리스 회귀 테스트를 돌려줘." },
      { role: "assistant", at: "15:38", text: "결제·온보딩·보안 스위트 38개 통과, 실패 0." }
    ],
    "s-fix-docs": [
      { role: "user", at: "15:32", text: "릴리스 노트를 정리해줘." },
      { role: "assistant", at: "15:40", text: "보안 수정 1건, 성능 개선 2건, 인프라 변경은 보류로 정리했습니다." }
    ]
  },

  runs: [
    { id: "run_nimbus_onboarding", goal: "온보딩 플로우 구축", status: "running", started: "09:02", tasks: 5 },
    { id: "run_nimbus_billing", goal: "구독 결제 안정화", status: "running", started: "10:02", tasks: 4 },
    { id: "run_nimbus_perf", goal: "API 성능 루프", status: "running", started: "11:02", tasks: 4 },
    { id: "run_nimbus_infra", goal: "인프라 마이그레이션", status: "done", started: "14:02", tasks: 4 },
    { id: "run_nimbus_release", goal: "릴리스 안정화", status: "running", started: "15:02", tasks: 2 }
  ],

  tasks: [
    { id: "t-onb-1", run: "run_nimbus_onboarding", title: "온보딩 단계 모델 정의", state: "running", deps: [] },
    { id: "t-onb-2", run: "run_nimbus_onboarding", title: "위저드 UI 구현", state: "running", deps: ["t-onb-1"] },
    { id: "t-onb-3", run: "run_nimbus_onboarding", title: "단계 저장 API", state: "done", deps: ["t-onb-1"] },
    { id: "t-onb-4", run: "run_nimbus_onboarding", title: "메일 워커 연결", state: "queued", deps: ["t-onb-3"] },
    { id: "t-onb-5", run: "run_nimbus_onboarding", title: "E2E 시나리오", state: "blocked", deps: ["t-onb-2", "t-onb-4"] },
    { id: "t-bill-1", run: "run_nimbus_billing", title: "웹훅 서명 검증", state: "done", deps: [] },
    { id: "t-bill-2", run: "run_nimbus_billing", title: "재시도 큐", state: "running", deps: ["t-bill-1"] },
    { id: "t-bill-3", run: "run_nimbus_billing", title: "플랜 선택 UI", state: "running", deps: [] },
    { id: "t-bill-4", run: "run_nimbus_billing", title: "실패 케이스 정리", state: "queued", deps: ["t-bill-2"] },
    { id: "t-perf-1", run: "run_nimbus_perf", title: "느린 쿼리 목록", state: "done", deps: [] },
    { id: "t-perf-2", run: "run_nimbus_perf", title: "캐시 TTL 조정", state: "running", deps: ["t-perf-1"] },
    { id: "t-perf-3", run: "run_nimbus_perf", title: "인덱스 후보 검토", state: "running", deps: ["t-perf-1"] },
    { id: "t-perf-4", run: "run_nimbus_perf", title: "p95 재측정", state: "blocked", deps: ["t-perf-2", "t-perf-3"] },
    { id: "t-infra-1", run: "run_nimbus_infra", title: "K8s 매니페스트 이전", state: "done", deps: [] },
    { id: "t-infra-2", run: "run_nimbus_infra", title: "DB 마이그레이션 리허설", state: "done", deps: [] },
    { id: "t-infra-3", run: "run_nimbus_infra", title: "관측 파이프라인", state: "queued", deps: ["t-infra-1"] },
    { id: "t-infra-4", run: "run_nimbus_infra", title: "컷오버 체크리스트", state: "blocked", deps: ["t-infra-1", "t-infra-2"] },
    { id: "t-fix-1", run: "run_nimbus_release", title: "세션 고정 수정", state: "done", deps: [] },
    { id: "t-fix-2", run: "run_nimbus_release", title: "N+1 제거", state: "running", deps: [] }
  ],

  workers: [
    { id: "w-onb-1", run: "run_nimbus_onboarding", task: "t-onb-1", state: "working", terminalState: "tui-idle", attention: false, host: "local" },
    { id: "w-onb-2", run: "run_nimbus_onboarding", task: "t-onb-2", state: "working", terminalState: "tui-idle", attention: true, host: "local" },
    { id: "w-onb-3", run: "run_nimbus_onboarding", task: "t-onb-3", state: "done", terminalState: "exited", attention: false, host: "local" },
    { id: "w-bill-1", run: "run_nimbus_billing", task: "t-bill-1", state: "done", terminalState: "exited", attention: false, host: "local" },
    { id: "w-bill-2", run: "run_nimbus_billing", task: "t-bill-2", state: "working", terminalState: "tui-idle", attention: false, host: "local" },
    { id: "w-perf-1", run: "run_nimbus_perf", task: "t-perf-2", state: "working", terminalState: "tui-idle", attention: false, host: "local" },
    { id: "w-perf-2", run: "run_nimbus_perf", task: "t-perf-3", state: "working", terminalState: "tui-idle", attention: true, host: "local" },
    { id: "w-infra-1", run: "run_nimbus_infra", task: "t-infra-1", state: "done", terminalState: "exited", attention: false, host: "local" },
    { id: "w-infra-2", run: "run_nimbus_infra", task: "t-infra-2", state: "done", terminalState: "exited", attention: false, host: "local" },
    { id: "w-fix-1", run: "run_nimbus_release", task: "t-fix-1", state: "done", terminalState: "exited", attention: false, host: "local" },
    { id: "w-fix-2", run: "run_nimbus_release", task: "t-fix-2", state: "working", terminalState: "tui-idle", attention: false, host: "local" },
    { id: "w-infra-3", run: "run_nimbus_infra", task: "t-infra-3", state: "waiting", terminalState: "running", attention: false, host: "local" }
  ],

  workerOutput: {
    "w-onb-1": "[09:28] reading shared/onboarding/steps.ts\n[09:29] plan: step id + required fields\n[09:31] editing api/src/onboarding/store.ts\n[09:33] done: upsert by company_id + step_id",
    "w-onb-2": "[09:34] reading web/src/onboarding/wizard.tsx\n[09:36] editing step navigation\n[09:38] attention: copy review required\n[09:39] waiting for input",
    "w-onb-3": "[09:20] api contract test\n[09:22] 14 passed, 0 failed\n[09:23] exit 0",
    "w-bill-1": "[10:18] webhook replay 200 events\n[10:20] duplicate 3 ignored\n[10:21] exit 0",
    "w-bill-2": "[10:31] retry queue: 5 attempts\n[10:33] editing api/src/billing/retry.ts\n[10:34] running",
    "w-perf-1": "[11:14] cache hit 61% → 78%\n[11:16] editing api/src/catalog/cache.ts\n[11:17] running",
    "w-perf-2": "[11:20] explain analyze orders\n[11:22] candidate index found\n[11:23] attention: migration window needed",
    "w-infra-1": "[14:26] kubectl diff\n[14:28] 6 deployments, 2 services\n[14:29] exit 0",
    "w-infra-2": "[14:31] migration forward 12m40s\n[14:33] rollback 4m10s\n[14:34] exit 0",
    "w-fix-1": "[15:18] session fixation reproduced\n[15:20] cookie reuse blocked\n[15:21] exit 0",
    "w-fix-2": "[15:26] queries 41 → 12\n[15:28] editing api/src/invoices/list.ts\n[15:29] running",
    "w-infra-3": "[14:40] waiting for cutover window\n[14:41] attention: none"
  },

  gates: [
    { id: "gate-onb-1", run: "run_nimbus_onboarding", name: "onboarding-spec", state: "passed" },
    { id: "gate-onb-2", run: "run_nimbus_onboarding", name: "wizard-e2e", state: "pending" },
    { id: "gate-bill-1", run: "run_nimbus_billing", name: "webhook-replay", state: "passed" },
    { id: "gate-bill-2", run: "run_nimbus_billing", name: "billing-failure-cases", state: "pending" },
    { id: "gate-perf-1", run: "run_nimbus_perf", name: "query-plan-review", state: "pending" },
    { id: "gate-perf-2", run: "run_nimbus_perf", name: "p95-budget", state: "passed" },
    { id: "gate-infra-1", run: "run_nimbus_infra", name: "migration-rehearsal", state: "passed" },
    { id: "gate-infra-2", run: "run_nimbus_infra", name: "cutover-checklist", state: "pending" },
    { id: "gate-fix-1", run: "run_nimbus_release", name: "release-regression", state: "passed" }
  ],

  orcaOnly: [
    { id: "wt-orca-docs", name: "orca-docs", repo: "docs", branch: "docs/orca-cli", recent: "2시간 전", note: "" },
    { id: "wt-orca-cli-spike", name: "orca-cli-spike", repo: "api", branch: "spike/orca-cli", recent: "어제", note: "" },
    { id: "wt-orca-web", name: "orca-web", repo: "web", branch: "feat/orca-web", recent: "3일 전", note: "" },
    { id: "wt-perf-api", name: "perf-api", repo: "api", branch: "perf/api-baseline", recent: "1시간 전", blockedBy: "g-loop", note: "API 성능 루프 그룹 소속" },
    { id: "wt-onb-api", name: "onb-api", repo: "api", branch: "feature/onboarding", recent: "30분 전", blockedBy: "g-feature", note: "고객 온보딩 그룹 소속" }
  ],

  deletePreview: {
    "g-feature": { worktreeIds: ["wt-onb-web", "wt-onb-api", "wt-onb-shared", "wt-onb-worker"], runningSessions: 3, dirtyWorktrees: 2, sessionCount: 7 },
    "g-billing": { worktreeIds: ["wt-bill-web", "wt-bill-api", "wt-bill-worker"], runningSessions: 2, dirtyWorktrees: 1, sessionCount: 5 },
    "g-loop": { worktreeIds: ["wt-perf-api", "wt-perf-query", "wt-perf-cache", "wt-perf-index"], runningSessions: 2, dirtyWorktrees: 2, sessionCount: 4 },
    "g-manual": { worktreeIds: ["wt-sec-api", "wt-sec-web", "wt-sec-audit", "wt-sec-secrets"], runningSessions: 2, dirtyWorktrees: 1, sessionCount: 4 },
    "g-infra": { worktreeIds: ["wt-infra-core", "wt-infra-k8s", "wt-infra-db", "wt-infra-obs"], runningSessions: 2, dirtyWorktrees: 2, sessionCount: 5 },
    "g-fix": { worktreeIds: ["wt-develop", "wt-fix-sec", "wt-fix-perf"], runningSessions: 2, dirtyWorktrees: 2, sessionCount: 5 }
  }
};
