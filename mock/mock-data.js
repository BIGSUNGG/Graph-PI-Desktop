// 목업 전용 더미 데이터. 실제 Pi JSONL / Orca CLI 와 무관합니다.
window.MOCK = {
  workspace: "graph-pi-ade",
  repo: "C:/Projects/Graph-PI-Desktop",

  groups: [
    { id: "g-login", name: "feature/login", note: "Server · Client · Contract" },
    { id: "g-fix", name: "fix/*", note: "Server · develop 머지" }
  ],

  worktrees: [
    { id: "wt-login-server", group: "g-login", repo: "Server", name: "Server", branch: "feature/login", parent: null, dirty: 3 },
    { id: "wt-login-client", group: "g-login", repo: "Client", name: "Client", branch: "feature/login", parent: null, dirty: 0 },
    { id: "wt-login-contract", group: "g-login", repo: "Contract", name: "Contract", branch: "feature/login", parent: null, dirty: 1 },
    { id: "wt-fix-sec", group: "g-fix", repo: "Server", name: "Server", branch: "fix/security", parent: "wt-develop", dirty: 2 },
    { id: "wt-fix-perf", group: "g-fix", repo: "Server", name: "Server", branch: "fix/performance", parent: "wt-develop", dirty: 0 },
    { id: "wt-develop", group: "g-fix", repo: "Server", name: "Server", branch: "develop", parent: null, dirty: 0 }
  ],

  sessions: [
    { id: "s-hub", title: "로그인 3레포 통합 관리", wt: "wt-login-server", model: "anthropic/claude-sonnet-4.5", state: "running", started: "14:02", last: "14:58", tokens: 12800, parent: null },
    { id: "s-01", title: "로그인 API · 세션 발급", wt: "wt-login-server", model: "anthropic/claude-sonnet-4.5", state: "running", started: "14:10", last: "14:55", tokens: 48200, parent: "s-hub" },
    { id: "s-02", title: "API 계약 테스트", wt: "wt-login-server", model: "openai/gpt-5", state: "done", started: "14:40", last: "14:52", tokens: 6700, parent: "s-01" },
    { id: "s-03", title: "로그인 폼 · 토큰 저장", wt: "wt-login-client", model: "anthropic/claude-sonnet-4.5", state: "running", started: "14:12", last: "14:57", tokens: 33100, parent: "s-hub" },
    { id: "s-04", title: "폼 검증 규칙", wt: "wt-login-client", model: "openai/gpt-5", state: "done", started: "14:38", last: "14:50", tokens: 8900, parent: "s-03" },
    { id: "s-05", title: "로그인 스펙 합의", wt: "wt-login-contract", model: "anthropic/claude-sonnet-4.5", state: "running", started: "14:15", last: "14:54", tokens: 12400, parent: "s-hub" },
    { id: "s-06", title: "에러 코드 표 정리", wt: "wt-login-contract", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "14:44", last: "14:47", tokens: 3100, parent: "s-05" },
    { id: "s-07", title: "세션 고정 취약점 수정", wt: "wt-fix-sec", model: "anthropic/claude-sonnet-4.5", state: "running", started: "15:02", last: "15:41", tokens: 21600, parent: null, mergeTo: "wt-develop" },
    { id: "s-08", title: "쿼리 N+1 제거", wt: "wt-fix-perf", model: "openai/gpt-5", state: "running", started: "15:10", last: "15:44", tokens: 15200, parent: null, loop: true },
    { id: "s-09", title: "develop 머지 대기", wt: "wt-develop", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "15:30", last: "15:45", tokens: 4820, parent: null }
  ],

  agents: [
    { id: "a-01", title: "spec-review", session: "s-01", state: "done" },
    { id: "a-02", title: "layout-check", session: "s-01", state: "running" },
    { id: "a-03", title: "token-bench", session: "s-03", state: "done" },
    { id: "a-04", title: "schema-check", session: "s-02", state: "done" },
    { id: "a-05", title: "contract-diff", session: "s-05", state: "running" }
  ],

  messages: {
    "s-hub": [
      { role: "user", at: "14:02", text: "Server 로그인 API, Client 폼, Contract 스펙을 한 번에 맞춰줘. 세션은 레포별로 따로 돌려." },
      { role: "assistant", at: "14:04", text: "레포별 워크트리 3개를 만들고 각각 세션을 붙였습니다. 공통 규칙은 이 세션에서만 관리합니다." },
      { role: "tool", at: "14:11", text: "orca worktree create --json × 3\n→ Server, Client, Contract 준비 완료" },
      { role: "assistant", at: "14:58", text: "Server는 API 계약 테스트까지 통과, Client는 토큰 저장 검증 중, Contract는 에러 코드 표 정리 중입니다." }
    ],
    "s-01": [
      { role: "user", at: "14:10", text: "세션 발급 API 부터 만들어줘. 만료는 7일, 리프레시는 30일." },
      { role: "assistant", at: "14:12", text: "발급 엔드포인트와 리프레시 회전을 분리했습니다. 만료 값은 설정에서 읽습니다." },
      { role: "tool", at: "14:41", text: "api contract test\n→ 12 passed, 0 failed" },
      { role: "assistant", at: "14:55", text: "남은 항목은 동시 로그인 제한입니다. 이건 Contract 스펙 확정 후 붙이겠습니다." }
    ],
    "s-03": [
      { role: "user", at: "14:12", text: "토큰 저장은 메모리 우선으로 하고, 새로고침하면 다시 받아오게 해줘." },
      { role: "assistant", at: "14:16", text: "메모리 저장 + 부팅 시 리프레시로 잡았습니다. localStorage 는 쓰지 않습니다." },
      { role: "tool", at: "14:39", text: "token-bench: 저장/복구 1.2ms, 폼 검증 4.8ms" }
    ],
    "s-05": [
      { role: "user", at: "14:15", text: "세 레포가 같이 쓰는 로그인 스펙을 한 파일로 정리해줘." },
      { role: "assistant", at: "14:18", text: "요청/응답 스키마와 에러 코드를 한 문서로 묶었습니다. Server·Client 둘 다 이 파일을 참조합니다." },
      { role: "tool", at: "14:45", text: "contract-diff: 2 breaking changes (login.error.code)" }
    ],
    "s-07": [{ role: "assistant", at: "15:41", text: "세션 고정 취약점은 쿠키 재사용 차단으로 막았습니다. develop 으로 머지 요청했습니다." }],
    "s-08": [{ role: "assistant", at: "15:44", text: "N+1 3건 제거 후 다시 측정 중입니다. 다음 회차에서 같은 쿼리를 재검사합니다." }],
    "s-09": [{ role: "tool", at: "15:45", text: "merge queue: fix/security 대기 1 · fix/performance 미완료" }]
  },

  runs: [
    { id: "run_0ff287b70b8b", goal: "ADE 보드 구현", status: "running", started: "13:02", tasks: 4 },
    { id: "run_91ac4d2e7f10", goal: "docs vault 정리", status: "done", started: "08:30", tasks: 2 }
  ],

  tasks: [
    { id: "t-1", run: "run_0ff287b70b8b", title: "그래프 레이아웃 구현", state: "running", deps: [] },
    { id: "t-2", run: "run_0ff287b70b8b", title: "관계선 3종 렌더", state: "blocked", deps: ["t-1"] },
    { id: "t-3", run: "run_0ff287b70b8b", title: "상세 패널", state: "done", deps: ["t-1"] },
    { id: "t-4", run: "run_0ff287b70b8b", title: "워크트리 카드 관리", state: "queued", deps: [] },
    { id: "t-5", run: "run_91ac4d2e7f10", title: "ADR 작성", state: "done", deps: [] },
    { id: "t-6", run: "run_91ac4d2e7f10", title: "worklog 갱신", state: "done", deps: ["t-5"] }
  ],

  workers: [
    { id: "w-1", run: "run_0ff287b70b8b", task: "t-1", state: "working", terminalState: "tui-idle", attention: false, host: "local" },
    { id: "w-2", run: "run_0ff287b70b8b", task: "t-3", state: "done", terminalState: "exited", attention: false, host: "local" },
    { id: "w-3", run: "run_0ff287b70b8b", task: "t-1", state: "waiting", terminalState: "running", attention: true, host: "local" }
  ],

  workerOutput: {
    "w-1": "[13:28] reading docs/30-specs/SPEC-graph-pi-ade.md\n[13:29] plan: render worktree columns first\n[13:30] editing mock/index.html\n[13:31] done: 3 edge kinds, legend fixed",
    "w-2": "[13:03] inspector panel rendered\n[13:04] session detail fields wired\n[13:05] exit 0",
    "w-3": "[13:26] waiting for gate approval\n[13:26] attention: input required"
  },

  gates: [
    { id: "g-1", run: "run_0ff287b70b8b", name: "layout-review", state: "pending" },
    { id: "g-2", run: "run_0ff287b70b8b", name: "spec-approval", state: "passed" }
  ]
};
