// 목업 전용 더미 데이터. 실제 Pi JSONL / Orca CLI 와 무관합니다.
// Nimbus — 가상의 B2B SaaS. web · api · worker · infra · shared · docs 6개 저장소.
window.MOCK = {
  workspace: "graph-pi",
  product: "Nimbus",
  workspacesRoot: "C:\\Users\\DAESUNG\\orca\\workspaces",
  repos: ["web", "api", "worker", "infra", "shared", "docs"],
  bases: ["main", "develop"],
  models: [
    "anthropic/claude-sonnet-4.5",
    "openai/gpt-5",
    "google/gemini-2.5-pro",
    "opencode-go/deepseek-v4.1-flash"
  ],
  presets: [
    { id: "feature", name: "Feature", desc: "명세를 확인한 뒤 레포별 워크트리와 세션을 만들고, 목업 선택과 API 중계까지 진행합니다.", required: true, placeholder: "예: 로그인·회원가입과 채팅 로직을 백엔드에 구현하고, 프론트는 목업 시안을 만든 뒤 선택한 안을 적용해.", flow: ["명세 질문", "워크트리·세션", "목업 선택", "API 중계"] },
    { id: "loop", name: "Loop", desc: "검토 축을 레포별 Loop로 나누고, 각 Loop가 끝날 때 허브가 통합해 다음 주기를 시작합니다.", required: true, placeholder: "예: 이 쇼핑 서비스의 보안·속도·확장성·유지보수성을 검토해.", flow: ["검토 축 분해", "Loop 6개", "종료 시 통합", "다음 주기"] },
    { id: "manual", name: "Manual", desc: "허브가 Feature/Loop 구조를 참고해 요청에 맞는 워크트리·세션·Loop 구조를 스스로 정합니다.", required: false, placeholder: "예: 이 그룹에서 진행할 작업을 설명해. (선택)", flow: ["허브가 구조 결정", "필요한 질문", "자율 관리"] }
  ],
  loopStates: ["idle", "running", "waiting", "paused", "done", "stopped"],
  goalStates: ["active", "auditing", "complete", "paused", "aborted"],
  auditVerdicts: ["approved", "rejected", "impossible", "error"],

  goals: [
    { id: "goal-onb-hub", group: "g-feature", sessionId: "s-onb-hub", parentGoalId: null, parentListItemId: null, objective: "온보딩 4레포를 하나의 흐름으로 통합", acceptance: ["4개 레포 구현이 모두 승인됨", "통합 기록과 API 계약이 남음", "원래 목표가 하위 결과에 매핑됨"], status: "complete", revision: 3, loopId: null, latestAuditId: "aud-onb-group", pauseReason: null, auditAttemptCount: 0, completedAt: "16:20", completedRevision: 3 },
    { id: "goal-onb-web", group: "g-feature", sessionId: "s-onb-web", parentGoalId: "goal-onb-hub", parentListItemId: "li-onb-1", objective: "온보딩 위저드 UI와 선택한 목업 반영", acceptance: ["위저드 3단계가 저장됨", "선택한 목업 B안이 적용됨", "QA 결과가 통합됨"], status: "complete", revision: 3, loopId: null, latestAuditId: "aud-onb-web", pauseReason: null, auditAttemptCount: 2, completedAt: "09:48", completedRevision: 3 },
    { id: "goal-onb-qa", group: "g-feature", sessionId: "s-onb-qa", parentGoalId: "goal-onb-web", parentListItemId: null, objective: "온보딩 E2E 회귀 검증", acceptance: ["핵심 시나리오 통과", "회귀 결과가 기록됨"], status: "complete", revision: 1, loopId: null, latestAuditId: "aud-onb-qa", pauseReason: null, auditAttemptCount: 1, completedAt: "09:47", completedRevision: 1 },
    { id: "goal-onb-api", group: "g-feature", sessionId: "s-onb-api", parentGoalId: "goal-onb-hub", parentListItemId: "li-onb-1", objective: "온보딩 단계 저장 API와 재개", acceptance: ["company_id + step_id 업서트", "완료 이벤트 발행"], status: "complete", revision: 2, loopId: null, latestAuditId: "aud-onb-api", pauseReason: null, auditAttemptCount: 1, completedAt: "16:12", completedRevision: 2 },
    { id: "goal-perf-hub", group: "g-loop", sessionId: "s-perf-hub", parentGoalId: null, parentListItemId: null, objective: "API p95 250ms 달성과 통합", acceptance: ["3개 Loop 결과가 통합됨", "p95가 250ms 이하", "감사 승인"], status: "active", revision: 1, loopId: null, latestAuditId: null, pauseReason: null, auditAttemptCount: 0, completedAt: null, completedRevision: null },
    { id: "goal-perf-query", group: "g-loop", sessionId: "s-perf-query", parentGoalId: "goal-perf-hub", parentListItemId: "li-perf-1", objective: "느린 쿼리 상위 3개 제거로 p95 개선", acceptance: ["p95 < 250ms", "EXPLAIN 근거가 남음"], status: "active", revision: 1, loopId: "loop-perf-query", latestAuditId: null, pauseReason: null, auditAttemptCount: 0, completedAt: null, completedRevision: null },
    { id: "goal-perf-cache", group: "g-loop", sessionId: "s-perf-cache", parentGoalId: "goal-perf-hub", parentListItemId: "li-perf-1", objective: "캐시 히트율 75% 이상", acceptance: ["히트율 75% 이상", "TTL·키 변경 근거"], status: "auditing", revision: 2, loopId: "loop-perf-cache", latestAuditId: "aud-perf-cache", pauseReason: "audit_error", auditAttemptCount: 1, completedAt: null, completedRevision: null },
    { id: "goal-perf-index", group: "g-loop", sessionId: "s-perf-index", parentGoalId: "goal-perf-hub", parentListItemId: "li-perf-1", objective: "인덱스 후보 검토와 적용", acceptance: ["복합 인덱스 2개 추가", "EXPLAIN 결과 첨부"], status: "complete", revision: 2, loopId: "loop-perf-index", latestAuditId: "aud-perf-index", pauseReason: null, auditAttemptCount: 2, completedAt: "11:44", completedRevision: 2 },
    { id: "goal-sec-audit", group: "g-manual", sessionId: "s-sec-audit", parentGoalId: null, parentListItemId: "li-sec-1", objective: "OWASP 상위 10개 점검과 재현 테스트", acceptance: ["각 항목의 결과", "재현 테스트 또는 근거"], status: "paused", revision: 1, loopId: "loop-sec-audit", latestAuditId: null, pauseReason: "question", auditAttemptCount: 0, completedAt: null, completedRevision: null },
    { id: "goal-fix-hub", group: "g-fix", sessionId: "s-fix-hub", parentGoalId: null, parentListItemId: null, objective: "릴리스 안정화와 차단 항목 해소", acceptance: ["성능·보안 결과가 통합됨", "차단 항목이 재시도로 해소됨", "회귀 확인"], status: "active", revision: 1, loopId: null, latestAuditId: null, pauseReason: null, auditAttemptCount: 0, completedAt: null, completedRevision: null },
    { id: "goal-fix-sec", group: "g-fix", sessionId: "s-fix-sec", parentGoalId: null, parentListItemId: "li-fix-1", objective: "세션 고정 취약점 수정", acceptance: ["재현 테스트가 실패함", "쿠키 재사용 차단"], status: "aborted", revision: 2, loopId: null, latestAuditId: "aud-fix-sec", pauseReason: null, auditAttemptCount: 2, completedAt: null, completedRevision: null },
    { id: "goal-fix-perf", group: "g-fix", sessionId: "s-fix-perf", parentGoalId: null, parentListItemId: "li-fix-2", objective: "N+1 쿼리 제거", acceptance: ["쿼리 수 10 이하", "회귀 테스트 통과"], status: "paused", revision: 1, loopId: "loop-fix-perf", latestAuditId: null, pauseReason: "loop_bounds", auditAttemptCount: 0, completedAt: null, completedRevision: null },
    { id: "goal-bill-web", group: "g-billing", sessionId: "s-bill-web", parentGoalId: null, parentListItemId: "li-bill-1", objective: "플랜 선택 화면과 연간 할인", acceptance: ["월간·연간 토글", "가격 표시 일치"], status: "active", revision: 1, loopId: null, latestAuditId: "aud-bill-web", pauseReason: "audit_error", auditAttemptCount: 1, completedAt: null, completedRevision: null }
  ],

  listItems: [
    { id: "li-onb-1", group: "g-feature", parentGoalId: "goal-onb-hub", title: "온보딩 4레포 통합", state: "complete", queueOrder: 1, childGoalIds: ["goal-onb-web", "goal-onb-api"], supersededGoalIds: [], completedAt: "16:20", completedRevision: 3, integrationNote: "shared 스키마 기준" },
    { id: "li-web-1", group: "g-feature", sessionId: "s-onb-web", goalId: "goal-onb-web", title: "목업 B안 적용", state: "complete", queueOrder: 1 },
    { id: "li-api-1", group: "g-feature", sessionId: "s-onb-api", goalId: "goal-onb-api", title: "단계 저장 API", state: "complete", queueOrder: 1, completedAt: "16:12", completedRevision: 2 },
    { id: "li-perf-1", group: "g-loop", parentGoalId: "goal-perf-hub", title: "성능 Loop 3개", state: "active", queueOrder: 1, childGoalIds: ["goal-perf-query", "goal-perf-cache", "goal-perf-index"], supersededGoalIds: [], completedAt: null, completedRevision: null, integrationNote: "p95 250ms 기준" },
    { id: "li-perf-2", group: "g-loop", parentGoalId: "goal-perf-hub", title: "통합 결과 검증", state: "queued", queueOrder: 2, childGoalIds: [], supersededGoalIds: [], completedAt: null, completedRevision: null, integrationNote: "모든 Loop 승인 후" },
    { id: "li-query-1", group: "g-loop", sessionId: "s-perf-query", goalId: "goal-perf-query", title: "느린 쿼리 제거", state: "active", queueOrder: 1 },
    { id: "li-sec-1", group: "g-manual", sessionId: "s-sec-audit", goalId: "goal-sec-audit", title: "OWASP 점검", state: "active", queueOrder: 1 },
    { id: "li-fix-1", group: "g-fix", sessionId: "s-fix-sec", goalId: "goal-fix-sec", title: "세션 고정 수정", state: "blocked", queueOrder: 1, integrationNote: "불가능 verdict — 재시도 필요" },
    { id: "li-fix-2", group: "g-fix", sessionId: "s-fix-perf", goalId: "goal-fix-perf", title: "N+1 제거", state: "active", queueOrder: 2 },
    { id: "li-bill-1", group: "g-billing", sessionId: "s-bill-web", goalId: "goal-bill-web", title: "플랜 선택 화면", state: "active", queueOrder: 1 },
    { id: "li-fix-hub-1", group: "g-fix", parentGoalId: "goal-fix-hub", title: "N+1 제거 통합", state: "active", queueOrder: 1, childGoalIds: ["goal-fix-perf"], supersededGoalIds: [], completedAt: null, completedRevision: null, integrationNote: "성능 수정 승인 대기" },
    { id: "li-fix-hub-2", group: "g-fix", parentGoalId: "goal-fix-hub", title: "세션 고정 수정", state: "blocked", queueOrder: 2, childGoalIds: ["goal-fix-sec"], supersededGoalIds: [], completedAt: null, completedRevision: null, integrationNote: "불가능 verdict — 재시도 필요" },
    { id: "li-fix-hub-3", group: "g-fix", parentGoalId: "goal-fix-hub", title: "릴리스 회귀 확인", state: "queued", queueOrder: 3, childGoalIds: [], supersededGoalIds: [], completedAt: null, completedRevision: null, integrationNote: "차단 해소 후 배정" }
  ],

  loops: [
    { id: "loop-perf-query", goalId: "goal-perf-query", target: "p95 < 250ms", measureCmd: "npm run measure:p95", direction: "min", currentValue: 287, bestValue: 287, iteration: 2, maxIterations: 5, timeLimitSeconds: 3600, tokenLimit: 120000, tokensUsed: 84000, status: "running", pauseKind: null, stopReason: null, history: [{ iteration: 1, value: 412, at: "11:18" }, { iteration: 2, value: 287, at: "11:52" }] },
    { id: "loop-perf-cache", goalId: "goal-perf-cache", target: "캐시 히트율 ≥ 75%", measureCmd: "npm run measure:cache", direction: "max", currentValue: 78, bestValue: 78, iteration: 3, maxIterations: 4, timeLimitSeconds: 3600, tokenLimit: 120000, tokensUsed: 93000, status: "paused", pauseKind: "audit", stopReason: "metric_target", history: [{ iteration: 1, value: 61, at: "11:10" }, { iteration: 2, value: 71, at: "11:32" }, { iteration: 3, value: 78, at: "11:54" }] },
    { id: "loop-perf-index", goalId: "goal-perf-index", target: "복합 인덱스 2개 적용", measureCmd: "npm run explain:index", direction: "max", currentValue: 2, bestValue: 2, iteration: 3, maxIterations: 3, timeLimitSeconds: 3600, tokenLimit: 120000, tokensUsed: 61000, status: "done", pauseKind: null, stopReason: "audit_approved", history: [{ iteration: 1, value: 0, at: "11:08" }, { iteration: 2, value: 1, at: "11:24" }, { iteration: 3, value: 2, at: "11:38" }] },
    { id: "loop-sec-audit", goalId: "goal-sec-audit", target: null, measureCmd: null, direction: null, currentValue: null, bestValue: null, iteration: 1, maxIterations: 6, timeLimitSeconds: 7200, tokenLimit: 200000, tokensUsed: 16800, status: "running", pauseKind: null, stopReason: null, history: [{ iteration: 1, value: null, at: "13:33" }] },
    { id: "loop-fix-perf", goalId: "goal-fix-perf", target: "쿼리 수 ≤ 10", measureCmd: "npm run count:queries", direction: "min", currentValue: 12, bestValue: 12, iteration: 3, maxIterations: 3, timeLimitSeconds: 1800, tokenLimit: 60000, tokensUsed: 58000, status: "stopped", pauseKind: "bounds", stopReason: "max_iterations", history: [{ iteration: 1, value: 41, at: "15:12" }, { iteration: 2, value: 21, at: "15:28" }, { iteration: 3, value: 12, at: "15:44" }] }
  ],

  audits: [
    { id: "aud-onb-group", goalId: "goal-onb-hub", scope: "group", state: "skipped", skipReason: "대상 하위 Goal의 Audit이 모두 승인되어 통합 감사를 생략했습니다.", skippedBy: "audit-agent", skippedAt: "16:20", createdAt: "16:20", report: "하위 승인 2/2 — 통합 감사 불필요" },
    { id: "aud-onb-api", goalId: "goal-onb-api", scope: "session", verdict: "approved", criteriaResults: [{ criterion: "company_id + step_id 업서트", result: "pass", evidence: "onboarding upsert 통합 테스트 6 passed" }, { criterion: "완료 이벤트 발행", result: "pass", evidence: "step.completed 이벤트 로그" }], evidenceSummary: "2개 조건 모두 통과", report: "승인 — 세션 작업 범위 통과", model: "openai/gpt-5", commitHash: "b41d7e2", worktreeState: "clean", revision: 2, createdAt: "16:12" },
    { id: "aud-onb-qa", goalId: "goal-onb-qa", scope: "session", verdict: "approved", criteriaResults: [{ criterion: "핵심 시나리오 통과", result: "pass", evidence: "e2e 7 passed" }, { criterion: "회귀 결과가 기록됨", result: "pass", evidence: "qa-regression.txt" }], evidenceSummary: "2개 조건 모두 통과", report: "승인 — 세션 작업 범위 통과", model: "openai/gpt-5", commitHash: "7a9c2d1", worktreeState: "clean", revision: 1, createdAt: "09:47" },
    { id: "aud-onb-web-r1", goalId: "goal-onb-web", scope: "parent", verdict: "rejected", criteriaResults: [{ criterion: "위저드 3단계가 저장됨", result: "pass", evidence: "playwright 9 passed" }, { criterion: "선택한 목업 B안이 적용됨", result: "fail", evidence: "2단계 레이아웃이 A안" }], evidenceSummary: "B안 선택 후 2단계 미반영", report: "2단계 레이아웃 수정 필요", model: "openai/gpt-5", commitHash: "9c1e004", worktreeState: "clean", revision: 2, createdAt: "09:40" },
    { id: "aud-onb-web", goalId: "goal-onb-web", scope: "parent", verdict: "approved", criteriaResults: [{ criterion: "위저드 3단계가 저장됨", result: "pass", evidence: "playwright 9 passed" }, { criterion: "선택한 목업 B안이 적용됨", result: "pass", evidence: "2단계 B안 스크린샷 일치" }, { criterion: "QA 결과가 통합됨", result: "pass", evidence: "qa regression 7 passed" }], evidenceSummary: "자기 작업 2개 + 자식 QA 통합 통과", report: "승인 — 자식 QA 1/1 포함", model: "openai/gpt-5", commitHash: "d20c9a1", worktreeState: "clean", revision: 3, createdAt: "09:48" },
    { id: "aud-perf-cache", goalId: "goal-perf-cache", scope: "session", verdict: "rejected", criteriaResults: [{ criterion: "히트율 75% 이상", result: "pass", evidence: "78% (measure:cache)" }, { criterion: "TTL·키 변경 근거", result: "fail", evidence: "catalog TTL 변경 기록 없음" }], evidenceSummary: "수치 달성, 근거 누락", report: "TTL 변경 근거를 남기고 재감사", model: "openai/gpt-5", commitHash: "c81b77e", worktreeState: "clean", revision: 2, createdAt: "11:56" },
    { id: "aud-perf-index", goalId: "goal-perf-index", scope: "session", verdict: "approved", criteriaResults: [{ criterion: "복합 인덱스 2개 추가", result: "pass", evidence: "migration 0042" }, { criterion: "EXPLAIN 결과 첨부", result: "pass", evidence: "explain-index.txt" }], evidenceSummary: "2개 조건 모두 통과", report: "승인 — 다음 List 항목 대기", model: "openai/gpt-5", commitHash: "4ab90fd", worktreeState: "clean", revision: 2, createdAt: "11:44" },
    { id: "aud-fix-sec", goalId: "goal-fix-sec", scope: "session", verdict: "impossible", criteriaResults: [{ criterion: "재현 테스트가 실패함", result: "unknown", evidence: "격리 픽스처에서 재현 불가" }, { criterion: "쿠키 재사용 차단", result: "pass", evidence: "cookie reuse blocked" }], evidenceSummary: "재현 환경을 만들 수 없음", report: "불가능 — 재배정 또는 범위 수정 필요", model: "openai/gpt-5", commitHash: "aa0192c", worktreeState: "clean", revision: 2, createdAt: "15:42" },
    { id: "aud-bill-web", goalId: "goal-bill-web", scope: "session", verdict: "error", criteriaResults: [{ criterion: "월간·연간 토글", result: "unknown", evidence: "감사 중 워크트리 변경" }], evidenceSummary: "감사 중 커밋 해시가 바뀜", report: "error — 재감사 필요", model: "openai/gpt-5", commitHash: "mismatch", worktreeState: "dirty", revision: 1, createdAt: "10:53" }
  ],


  todos: [
    { id: "todo-g1", scope: "group", groupId: "g-feature", title: "공통 단계 스키마 확정", status: "done", createdBy: "s-onb-hub", updatedAt: "09:20" },
    { id: "todo-g2", scope: "group", groupId: "g-feature", title: "API 계약 중계", status: "done", createdBy: "s-onb-hub", updatedAt: "09:46" },
    { id: "todo-g3", scope: "group", groupId: "g-feature", title: "출시 전 E2E", status: "done", createdBy: "s-onb-hub", updatedAt: "09:58" },
    { id: "todo-g4", scope: "group", groupId: "g-loop", title: "p95 250ms 기준 확정", status: "done", createdBy: "s-perf-hub", updatedAt: "11:04" },
    { id: "todo-g5", scope: "group", groupId: "g-loop", title: "Loop 결과 통합", status: "doing", createdBy: "s-perf-hub", updatedAt: "11:58" },
    { id: "todo-s1", scope: "session", groupId: "g-feature", sessionId: "s-onb-web", title: "B안 2단계 레이아웃", status: "done", createdBy: "s-onb-web", updatedAt: "09:42" },
    { id: "todo-s2", scope: "session", groupId: "g-feature", sessionId: "s-onb-web", title: "모바일 목업 확인", status: "done", createdBy: "s-onb-web", updatedAt: "09:51" },
    { id: "todo-s3", scope: "session", groupId: "g-manual", sessionId: "s-sec-audit", title: "A01 재현 테스트", status: "doing", createdBy: "s-sec-audit", updatedAt: "13:33" },
    { id: "todo-s4", scope: "session", groupId: "g-loop", sessionId: "s-perf-query", title: "3회차 EXPLAIN", status: "todo", createdBy: "s-perf-query", updatedAt: "11:52" }
  ],

  questions: [
    { id: "q-sec", group: "g-manual", sessionId: "s-sec-audit", status: "pending", createdAt: "13:48", answer: null, answeredAt: null, questions: [{ header: "자격 증명", question: "스테이징 DB 자격 증명을 사용할까요?", multiSelect: false, options: [{ label: "스테이징 사용 (권장)", description: "실제 스키마와 권한을 검사합니다." }, { label: "로컬 픽스처", description: "자격 증명 없이 격리된 픽스처로 검사합니다." }, { label: "건너뛰기", description: "A01을 미검사로 남깁니다." }] }] },
    { id: "q-onb", group: "g-feature", sessionId: "s-onb-api", status: "answered", createdAt: "09:46", answer: "멱등 3회 (권장)", answeredAt: "09:47", questions: [{ header: "API 계약", question: "단계 저장 API의 재시도 정책은 무엇으로 할까요?", multiSelect: false, options: [{ label: "멱등 3회 (권장)", description: "company_id + step_id로 중복을 무시합니다." }, { label: "재시도 없음", description: "클라이언트가 직접 재시도합니다." }] }] },
    { id: "q-perf", group: "g-loop", sessionId: "s-perf-query", status: "pending", createdAt: "11:53", answer: null, answeredAt: null, questions: [{ header: "Loop 종료", question: "p95 목표를 250ms로 유지할까요?", multiSelect: false, options: [{ label: "250ms 유지 (권장)", description: "현재 측정값과 기준을 유지합니다." }, { label: "300ms로 완화", description: "범위를 넓혀 다음 회차를 진행합니다." }] }] },
    { id: "q-fix", group: "g-fix", sessionId: "s-fix-sec", status: "answered", createdAt: "15:10", answer: "격리 픽스처 사용", answeredAt: "15:12", questions: [{ header: "재현 환경", question: "세션 고정을 어디에서 재현할까요?", multiSelect: false, options: [{ label: "격리 픽스처", description: "운영 데이터 없이 재현합니다." }, { label: "스테이징", description: "실제 쿠키 흐름을 확인합니다." }] }] }
  ],

  agentMessages: [
    { id: "am-1", group: "g-feature", from: "s-onb-web", to: "s-onb-hub", body: "목업 B안을 적용하려면 로그인 API 계약이 필요합니다.", status: "delivered", at: "09:44" },
    { id: "am-2", group: "g-feature", from: "s-onb-hub", to: "s-onb-web", body: "API 계약: POST /auth/login { email, password } → { token } · 오류 401/429.", status: "delivered", at: "09:45" },
    { id: "am-3", group: "g-loop", from: "s-perf-query", to: "s-perf-hub", body: "p95 287ms로 목표 250ms 미달입니다. 캐시 결과와 합칠까요?", status: "pending", at: "11:52" },
    { id: "am-4", group: "g-manual", from: "s-sec-audit", to: "s-sec-hub", body: "자격 증명 확인이 필요해 질문을 남겼습니다. 답변 전까지 Loop를 일시정지합니다.", status: "delivered", at: "13:48" },
    { id: "am-5", group: "g-feature", from: "s-onb-api", to: "s-onb-hub", body: "API 계약 확정 전에는 프론트 연동을 시작하지 않습니다.", status: "delivered", at: "09:47" },
    { id: "am-6", group: "g-loop", from: "s-perf-hub", to: "s-perf-query", body: "캐시 결과를 합쳐 다음 회차를 진행하세요.", status: "failed", error: "받는 세션을 재개하지 못했습니다. 메시지를 보관했습니다.", at: "11:58" }
  ],

  hubActions: [
    { id: "ha-1", group: "g-loop", action: "워크트리 생성", target: "wt-perf-cache", at: "11:02", confirmation: false },
    { id: "ha-2", group: "g-loop", action: "세션 이름 변경", target: "s-perf-cache", at: "11:36", confirmation: false },
    { id: "ha-3", group: "g-fix", action: "워크트리 삭제", target: "wt-fix-perf", at: "15:18", confirmation: false },
    { id: "ha-4", group: "g-feature", action: "하위 세션 생성", target: "s-onb-qa", at: "09:40", confirmation: false }
  ],

  refProjects: [
    { handle: "backend", label: "Backend", group: "g-feature", repo: "api", worktree: "wt-onb-api", branches: ["feature/onboarding", "feature/account"], files: ["src/onboarding/store.ts", "src/routes/onboarding.ts", "tests/onboarding.spec.ts"] },
    { handle: "frontend", label: "Frontend", group: "g-feature", repo: "web", worktree: "wt-onb-web", branches: ["feature/onboarding", "feature/account"], files: ["src/onboarding/wizard.tsx", "src/onboarding/steps.ts"] },
    { handle: "billing", label: "Billing", group: "g-billing", repo: "api", worktree: "wt-bill-api", branches: ["feature/billing", "fix/webhook"], files: ["src/billing/webhook.ts", "src/billing/retry.ts"] }
  ],

  groups: [
    { id: "g-feature", name: "고객 온보딩", note: "web · api · shared · worker", hubSessionId: "s-onb-hub", parentRepo: "C:\\Users\\DAESUNG\\orca\\workspaces\\gogaek-onboding" },
    { id: "g-billing", name: "구독 결제", note: "web · api · worker", hubSessionId: "s-bill-hub", parentRepo: "C:\\Users\\DAESUNG\\orca\\workspaces\\gudok-gyeolje" },
    { id: "g-loop", name: "API 성능 루프", note: "query · cache · index", hubSessionId: "s-perf-hub", parentRepo: "C:\\Users\\DAESUNG\\orca\\workspaces\\api-seongneung-rupeu" },
    { id: "g-manual", name: "보안 점검", note: "api · web · audit", hubSessionId: "s-sec-hub", parentRepo: "C:\\Users\\DAESUNG\\orca\\workspaces\\boan-jeomgeom" },
    { id: "g-infra", name: "인프라 마이그레이션", note: "core · k8s · db · obs", hubSessionId: "s-infra-hub", parentRepo: "C:\\Users\\DAESUNG\\orca\\workspaces\\inpeura-maigeureisyeon" },
    { id: "g-fix", name: "릴리스 안정화", note: "develop · security · performance", hubSessionId: "s-fix-hub", parentRepo: "C:\\Users\\DAESUNG\\orca\\workspaces\\rilliseu-anjeonghwa" }
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
    { id: "s-onb-hub", title: "온보딩 4레포 통합 관리", wt: null, group: "g-feature", model: "anthropic/claude-sonnet-4.5", state: "done", started: "09:02", last: "09:58", tokens: 18400, parent: null },
    { id: "s-onb-web", title: "온보딩 위저드 UI", wt: "wt-onb-web", group: "g-feature", model: "anthropic/claude-sonnet-4.5", state: "done", started: "09:10", last: "09:55", tokens: 32100, parent: "s-onb-hub" },
    { id: "s-onb-api", title: "온보딩 API · 단계 저장", wt: "wt-onb-api", group: "g-feature", model: "anthropic/claude-sonnet-4.5", state: "done", started: "09:12", last: "09:57", tokens: 28700, parent: "s-onb-hub" },
    { id: "s-onb-shared", title: "온보딩 공통 스키마", wt: "wt-onb-shared", group: "g-feature", model: "openai/gpt-5", state: "done", started: "09:15", last: "09:48", tokens: 9600, parent: "s-onb-hub" },
    { id: "s-onb-worker", title: "온보딩 메일 워커", wt: "wt-onb-worker", group: "g-feature", model: "openai/gpt-5", state: "done", started: "09:30", last: "09:44", tokens: 5200, parent: "s-onb-api" },
    { id: "s-onb-review", title: "Code Review", wt: "wt-onb-web", group: "g-feature", model: "openai/gpt-5", state: "done", started: "09:34", last: "09:52", tokens: 6800, parent: "s-onb-web" },
    { id: "s-onb-qa", title: "온보딩 E2E 시나리오", wt: "wt-onb-web", group: "g-feature", model: "google/gemini-2.5-pro", state: "done", started: "09:40", last: "09:52", tokens: 7400, parent: "s-onb-review" },
    { id: "s-onb-audit", title: "Goal Audit", wt: "wt-onb-web", group: "g-feature", model: "openai/gpt-5", state: "done", started: "09:53", last: "09:57", tokens: 4200, parent: "s-onb-web", audit: true },
    { id: "s-onb-docs", title: "온보딩 가이드", wt: "wt-onb-shared", group: "g-feature", model: "google/gemini-2.5-pro", state: "done", started: "09:50", last: "09:58", tokens: 2600, parent: "s-onb-shared" },

    { id: "s-bill-hub", title: "구독 결제 3레포 통합", wt: null, group: "g-billing", model: "anthropic/claude-sonnet-4.5", state: "running", started: "10:02", last: "10:58", tokens: 15600, parent: null },
    { id: "s-bill-web", title: "결제 화면 · 플랜 선택", wt: "wt-bill-web", group: "g-billing", model: "anthropic/claude-sonnet-4.5", state: "running", started: "10:10", last: "10:56", tokens: 27400, parent: "s-bill-hub" },
    { id: "s-bill-api", title: "웹훅 검증 · 재시도", wt: "wt-bill-api", group: "g-billing", model: "openai/gpt-5", state: "done", started: "10:12", last: "10:50", tokens: 19800, parent: "s-bill-hub" },
    { id: "s-bill-worker", title: "인보이스 워커", wt: "wt-bill-worker", group: "g-billing", model: "openai/gpt-5", state: "idle", started: "10:20", last: "10:40", tokens: 6100, parent: "s-bill-hub" },
    { id: "s-bill-qa", title: "결제 실패 케이스", wt: "wt-bill-web", group: "g-billing", model: "google/gemini-2.5-pro", state: "done", started: "10:35", last: "10:47", tokens: 8300, parent: "s-bill-web" },

    { id: "s-perf-hub", title: "API 성능 루프 관리", wt: null, group: "g-loop", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "11:00", last: "11:58", tokens: 0, parent: null },
    { id: "s-perf-root", title: "성능 루프 감시", wt: "wt-perf-api", group: "g-loop", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "11:02", last: "11:40", tokens: 4200, parent: null },
    { id: "s-perf-query", title: "느린 쿼리 제거", wt: "wt-perf-query", group: "g-loop", model: "anthropic/claude-sonnet-4.5", state: "running", started: "11:05", last: "11:52", tokens: 22100, parent: "s-perf-hub", loop: true },
    { id: "s-perf-cache", title: "캐시 히트율 개선", wt: "wt-perf-cache", group: "g-loop", model: "openai/gpt-5", state: "running", started: "11:08", last: "11:54", tokens: 18300, parent: "s-perf-hub", loop: true },
    { id: "s-perf-index", title: "인덱스 후보 검토", wt: "wt-perf-index", group: "g-loop", model: "openai/gpt-5", state: "done", started: "11:10", last: "11:38", tokens: 12700, parent: "s-perf-hub", loop: true },

    { id: "s-sec-hub", title: "보안 점검 관리", wt: null, group: "g-manual", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "13:00", last: "13:55", tokens: 0, parent: null },
    { id: "s-sec-root", title: "보안 점검 총괄", wt: "wt-sec-api", group: "g-manual", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "13:02", last: "13:30", tokens: 3800, parent: null },
    { id: "s-sec-web", title: "웹 보안 헤더 점검", wt: "wt-sec-web", group: "g-manual", model: "anthropic/claude-sonnet-4.5", state: "running", started: "13:05", last: "13:48", tokens: 14200, parent: null },
    { id: "s-sec-audit", title: "OWASP 점검 루프", wt: "wt-sec-audit", group: "g-manual", model: "openai/gpt-5", state: "running", started: "13:10", last: "13:50", tokens: 16800, parent: null, loop: true },
    { id: "s-sec-secrets", title: "시크릿 스캔", wt: "wt-sec-secrets", group: "g-manual", model: "google/gemini-2.5-pro", state: "idle", started: "13:20", last: "13:36", tokens: 5400, parent: "s-sec-audit" },

    { id: "s-infra-hub", title: "인프라 마이그레이션 통합", wt: null, group: "g-infra", model: "anthropic/claude-sonnet-4.5", state: "running", started: "14:02", last: "14:58", tokens: 20400, parent: null },
    { id: "s-infra-k8s", title: "K8s 매니페스트 이전", wt: "wt-infra-k8s", group: "g-infra", model: "anthropic/claude-sonnet-4.5", state: "running", started: "14:10", last: "14:55", tokens: 23600, parent: "s-infra-hub" },
    { id: "s-infra-db", title: "DB 마이그레이션 검증", wt: "wt-infra-db", group: "g-infra", model: "openai/gpt-5", state: "done", started: "14:12", last: "14:48", tokens: 17900, parent: "s-infra-hub" },
    { id: "s-infra-obs", title: "관측 파이프라인", wt: "wt-infra-obs", group: "g-infra", model: "google/gemini-2.5-pro", state: "idle", started: "14:20", last: "14:44", tokens: 7100, parent: "s-infra-hub" },
    { id: "s-infra-qa", title: "마이그레이션 리허설", wt: "wt-infra-k8s", group: "g-infra", model: "openai/gpt-5", state: "done", started: "14:35", last: "14:52", tokens: 9800, parent: "s-infra-k8s" },

    { id: "s-fix-hub", title: "릴리스 안정화 관리", wt: null, group: "g-fix", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "15:00", last: "15:50", tokens: 0, parent: null },
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
      { role: "assistant", at: "09:38", text: "목업 A(간결형), B(단계형), C(카드형) 3안을 만들었습니다. B안이 현재 API와 가장 잘 맞습니다." },
      { role: "user", at: "09:39", text: "B안으로 진행해." },
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
    "s-onb-review": [
      { role: "user", at: "09:34", text: "위저드 변경분을 코드 리뷰해줘. 회귀 위험이 큰 부분부터." },
      { role: "assistant", at: "09:52", text: "리뷰 완료 — 단계 저장 경계와 재시도 처리 2건을 지적했고, QA 회귀를 자식 세션으로 넘겼습니다." }
    ],
    "s-onb-qa": [
      { role: "user", at: "09:40", text: "신규 회사가 온보딩을 끝까지 마치는 E2E를 만들어줘." },
      { role: "assistant", at: "09:52", text: "빈 회사 → 3단계 → 완료 메일까지 1개 시나리오를 추가했습니다. worker는 목으로 대체했습니다." }
    ],
    "s-onb-audit": [
      { role: "user", at: "09:53", text: "이 작업의 Goal Audit을 실행해줘." },
      { role: "assistant", at: "09:57", text: "감사 승인 — 완료 조건 3개와 자식 QA 결과를 확인했습니다." }
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

    "s-perf-hub": [
      { role: "user", at: "11:00", text: "이 그룹의 성능 루프 3개를 관리해. p95 목표는 250ms로 잡아." }
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

    "s-sec-hub": [
      { role: "user", at: "13:00", text: "릴리스 전 보안 점검을 관리해. audit 루프 결과를 모아서 보고해." }
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

    "s-fix-hub": [
      { role: "user", at: "15:00", text: "릴리스 안정화 이슈를 develop 기준으로 관리해." }
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
    { id: "run_nimbus_onboarding", group: "g-feature", goal: "온보딩 플로우 구축", status: "running", started: "09:02", tasks: 5 },
    { id: "run_nimbus_billing", group: "g-billing", goal: "구독 결제 안정화", status: "running", started: "10:02", tasks: 4 },
    { id: "run_nimbus_perf", group: "g-loop", goal: "API 성능 루프", status: "running", started: "11:02", tasks: 4 },
    { id: "run_nimbus_infra", group: "g-infra", goal: "인프라 마이그레이션", status: "done", started: "14:02", tasks: 4 },
    { id: "run_nimbus_release", group: "g-fix", goal: "릴리스 안정화", status: "running", started: "15:02", tasks: 2 }
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
    "g-feature": { worktreeIds: ["wt-onb-web", "wt-onb-api", "wt-onb-shared", "wt-onb-worker"], runningSessions: 3, dirtyWorktrees: 2, sessionCount: 9 },
    "g-billing": { worktreeIds: ["wt-bill-web", "wt-bill-api", "wt-bill-worker"], runningSessions: 2, dirtyWorktrees: 1, sessionCount: 5 },
    "g-loop": { worktreeIds: ["wt-perf-api", "wt-perf-query", "wt-perf-cache", "wt-perf-index"], runningSessions: 2, dirtyWorktrees: 2, sessionCount: 4 },
    "g-manual": { worktreeIds: ["wt-sec-api", "wt-sec-web", "wt-sec-audit", "wt-sec-secrets"], runningSessions: 2, dirtyWorktrees: 1, sessionCount: 4 },
    "g-infra": { worktreeIds: ["wt-infra-core", "wt-infra-k8s", "wt-infra-db", "wt-infra-obs"], runningSessions: 2, dirtyWorktrees: 2, sessionCount: 5 },
    "g-fix": { worktreeIds: ["wt-develop", "wt-fix-sec", "wt-fix-perf"], runningSessions: 2, dirtyWorktrees: 2, sessionCount: 5 }
  }
};

// 그룹 최상위 폴더·워크트리 폴더 이름: 한글 → 로마자 슬러그
window.MOCK.slug = (function () {
  var INI = ["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
  var MED = ["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
  var FIN = ["","k","k","k","n","n","n","t","l","k","m","p","l","l","p","l","m","p","p","t","t","ng","t","t","k","t","p","t"];
  var OPEN = ["","g","kk","ks","n","nj","nh","d","r","lg","lm","lb","ls","lt","lp","lh","m","b","bs","s","ss","ng","j","ch","k","t","p","h"];
  return function slug(name) {
    var ch = String(name || "").split(""), out = "", prevFin = 0;
    for (var i = 0; i < ch.length; i++) {
      var c = ch[i].charCodeAt(0);
      if (c >= 0xac00 && c <= 0xd7a3) {
        var n = c - 0xac00, nx = ch[i + 1] ? ch[i + 1].charCodeAt(0) : 0;
        var nini = nx >= 0xac00 && nx <= 0xd7a3 ? Math.floor((nx - 0xac00) / 588) : -1;
        var ini = Math.floor(n / 588), fin = n % 28;
        // 표준 로마자: 받침 ㄹ 뒤의 ㄹ은 l, 받침 ㅇ은 항상 ng
        out += (ini === 5 && prevFin === 8 ? "l" : INI[ini]) + MED[Math.floor((n % 588) / 28)];
        if (fin) out += nini === 11 ? OPEN[fin] : FIN[fin];
        prevFin = fin;
      } else if (/[a-z0-9]/i.test(ch[i])) { out += ch[i].toLowerCase(); prevFin = 0; }
      else { out += "-"; prevFin = 0; }
    }
    return out.replace(/-+/g, "-").replace(/^-|-$/g, "");
  };
})();

// 시드 워크트리 폴더 = 그룹 부모 저장소 아래
window.MOCK.worktrees.forEach(function (w) {
  var g = window.MOCK.groups.filter(function (x) { return x.id === w.group; })[0];
  if (g && !w.path) w.path = g.parentRepo + "\\" + w.name;
});
