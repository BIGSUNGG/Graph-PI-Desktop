// 그룹 프리셋 기획 목업 전용 더미 데이터. mock-data.js 와 별개 파일이며 실제 Pi JSONL / Orca CLI 와 무관합니다.
window.GROUPS_MOCK = {
  workspace: "graph-pi",
  repo: "graph-pi",

  presets: [
    { id: "feature", name: "Feature", desc: "부모가 기능을 관리하고 자식이 구현" },
    { id: "loop", name: "Loop", desc: "부모가 감시하고 자식이 반복 실행" },
    { id: "manual", name: "Manual", desc: "구조를 직접 구성" }
  ],

  models: [
    "anthropic/claude-sonnet-4.5",
    "openai/gpt-5",
    "anthropic/claude-haiku-4.5"
  ],

  bases: ["main", "develop"],

  loopStates: ["idle", "running", "waiting", "paused", "done", "stopped"],

  // 프리셋은 생성 마법사에서만 쓰고 그룹에는 저장하지 않는다(생성 후 Manual과 동일).
  groups: [
    { id: "g-feature", name: "로그인 기능", hubSessionId: "s-hub", note: "부모가 기능을 관리하고 자식이 구현" },
    { id: "g-loop", name: "성능 루프", hubSessionId: null, note: "부모가 감시하고 자식이 반복 실행" },
    { id: "g-manual", name: "실험", hubSessionId: null, note: "구조를 직접 구성" }
  ],

  worktrees: [
    { id: "wt-login-server", group: "g-feature", repo: "graph-pi", name: "login-server", branch: "feature/login", parent: null, dirty: true, orcaMissing: false },
    { id: "wt-login-client", group: "g-feature", repo: "graph-pi", name: "login-client", branch: "feature/login", parent: "wt-login-server", dirty: false, orcaMissing: false },
    { id: "wt-login-contract", group: "g-feature", repo: "graph-pi", name: "login-contract", branch: "feature/login", parent: "wt-login-server", dirty: true, orcaMissing: false },

    { id: "wt-perf-parent", group: "g-loop", repo: "graph-pi", name: "perf-parent", branch: "perf/baseline", parent: null, dirty: false, orcaMissing: false },
    { id: "wt-perf-sec", group: "g-loop", repo: "graph-pi", name: "perf-sec", branch: "perf/security", parent: "wt-perf-parent", dirty: false, orcaMissing: false,
      loop: { prompt: "보안 스캔을 돌리고 실패 항목을 하나씩 고쳐줘. 매 회차 결과를 3줄로 요약해.", maxRounds: 5, round: 2, status: "waiting", lastEvent: "15:43 · 응답 대기 12분", enableOnAdd: true } },
    { id: "wt-perf-perf", group: "g-loop", repo: "graph-pi", name: "perf-perf", branch: "perf/query", parent: "wt-perf-parent", dirty: true, orcaMissing: false,
      loop: { prompt: "느린 쿼리를 찾아 인덱스를 추가하고 같은 측정을 다시 돌려줘.", maxRounds: 5, round: 3, status: "paused", lastEvent: "15:39 · 30분 무응답 → 1회 재시도 후 일시정지", enableOnAdd: true } },

    { id: "wt-exp-a", group: "g-manual", repo: "graph-pi", name: "exp-a", branch: "exp/a", parent: null, dirty: true, orcaMissing: false,
      loop: { prompt: "캐시 히트율 90% 까지 반복 실험하고 매 회차 수치를 남겨줘.", maxRounds: 3, round: 1, status: "running", lastEvent: "15:45 · 수동으로 켠 루프 1회차", enableOnAdd: false, manual: true } },
    { id: "wt-exp-b", group: "g-manual", repo: "graph-pi", name: "exp-b", branch: "exp/b", parent: null, dirty: false, orcaMissing: true },
    { id: "wt-exp-a1", group: "g-manual", repo: "graph-pi", name: "exp-a1", branch: "exp/a1", parent: "wt-exp-a", dirty: false, orcaMissing: false }
  ],

  sessions: [
    { id: "s-hub", title: "로그인 3레포 통합 관리", wt: "wt-login-server", model: "anthropic/claude-sonnet-4.5", state: "running", started: "14:02", last: "14:58", tokens: 12800, parent: null, group: "g-feature" },
    { id: "s-login-client", title: "로그인 폼 · 토큰 저장", wt: "wt-login-client", model: "anthropic/claude-sonnet-4.5", state: "running", started: "14:12", last: "14:57", tokens: 33100, parent: "s-hub", group: "g-feature" },
    { id: "s-login-contract", title: "로그인 스펙 합의", wt: "wt-login-contract", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "14:15", last: "14:54", tokens: 12400, parent: "s-hub", group: "g-feature" },

    { id: "s-perf-parent", title: "성능 루프 감시", wt: "wt-perf-parent", model: "anthropic/claude-sonnet-4.5", state: "running", started: "15:01", last: "15:44", tokens: 8600, parent: null, group: "g-loop" },
    { id: "s-perf-sec", title: "보안 스캔 반복", wt: "wt-perf-sec", model: "openai/gpt-5", state: "running", started: "15:05", last: "15:43", tokens: 19800, parent: "s-perf-parent", group: "g-loop" },
    { id: "s-perf-perf", title: "쿼리 최적화 반복", wt: "wt-perf-perf", model: "anthropic/claude-sonnet-4.5", state: "idle", started: "15:08", last: "15:39", tokens: 15300, parent: "s-perf-parent", group: "g-loop" },

    { id: "s-exp-a", title: "캐시 히트율 실험", wt: "wt-exp-a", model: "anthropic/claude-sonnet-4.5", state: "running", started: "15:16", last: "15:45", tokens: 7200, parent: null, group: "g-manual" },
    { id: "s-exp-b", title: "아이디어 검증", wt: "wt-exp-b", model: "openai/gpt-5", state: "idle", started: "15:20", last: "15:22", tokens: 900, parent: null, group: "g-manual" },
    { id: "s-exp-a1", title: "실험 A1 하위", wt: "wt-exp-a1", model: "anthropic/claude-sonnet-4.5", state: "done", started: "15:18", last: "15:34", tokens: 4100, parent: "s-exp-a", group: "g-manual" }
  ],

  // Orca 에는 있지만 Graph-pi 보드에는 없는 워크트리 (화면③ "기존 불러오기")
  orcaOnly: [
    { id: "orca-1", name: "orca-docs", repo: "graph-pi", branch: "docs/preset-guide", recent: "12분 전" },
    { id: "orca-2", name: "orca-cli-spike", repo: "graph-pi", branch: "spike/cli", recent: "1시간 전" },
    { id: "orca-3", name: "orca-web", repo: "orca-main", branch: "fix/theme", recent: "어제" },
    { id: "orca-4", name: "perf-parent", repo: "graph-pi", branch: "perf/baseline", recent: "3분 전", blockedBy: "성능 루프", note: "다른 그룹(성능 루프)에 이미 있음" },
    { id: "orca-5", name: "login-client", repo: "graph-pi", branch: "feature/login", recent: "22분 전", blockedBy: "로그인 기능", note: "다른 그룹(로그인 기능)에 이미 있음" }
  ],

  // 화면⑤ 삭제 확인 다이얼로그용 집계 (groups/worktrees/sessions 데이터와 일치해야 함)
  deletePreview: {
    "g-feature": { worktreeIds: ["wt-login-server", "wt-login-client", "wt-login-contract"], runningSessions: 2, dirtyWorktrees: 2, sessionCount: 3 },
    "g-loop": { worktreeIds: ["wt-perf-parent", "wt-perf-sec", "wt-perf-perf"], runningSessions: 2, dirtyWorktrees: 1, sessionCount: 3 },
    "g-manual": { worktreeIds: ["wt-exp-a", "wt-exp-b", "wt-exp-a1"], runningSessions: 1, dirtyWorktrees: 1, sessionCount: 3 }
  }
};
