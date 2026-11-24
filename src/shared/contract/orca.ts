/**
 * Orca CLI(`orca … --json`) 응답 타입. CLI 원형을 그대로 옮기고 앱이 쓰는 필드만 남긴다.
 * 근거: docs/90-reference/orca-cli-and-pi-sessions.md, `.crew/handoff/mvp-implementation-map.md`.
 */

export type OrcaEnvelope<T> =
  | { ok: true; result: T }
  | { ok: false; error: string };

/** `orca project list` 의 result.projects[] 원소. */
export type OrcaProject = {
  id: string;
  displayName: string;
  path: string;
  /** `project list` 의 sourceRepoIds. 워크트리 생성의 `--repo` 선택자는 이 값(repo id)이다. */
  repoIds?: string[];
};

/** `orca worktree list/create` 의 result.worktrees[] 원소. branch 는 `refs/heads/` 를 제거한 값. */
export type OrcaWorktree = {
  id: string;
  displayName: string;
  branch: string;
  path: string;
  repoId: string;
  parentWorktreeId: string | null;
  /** `project list` 응답의 project.id 와 매칭할 때 쓴다(실측: worktree list 에 projectId 가 있다). */
  projectId?: string;
  /** 저장소 루트 워크트리 여부. 프로젝트 경로를 여기서 얻는다. */
  isMainWorktree?: boolean;
};

/** `orca agent launch` 영수증. 실제 필드는 CLI 버전에 따라 다르므로 미확인 필드는 optional. */
export type OrcaLaunchReceipt = {
  /** CLI 가 돌려준 터미널 handle. 확인되면 PTY↔세션 매칭의 1차 키로 쓴다. */
  terminalId: string | null;
  worktreeId: string | null;
  agent: string;
  prompt: string;
  launchedAt: string;
  /** 원형 응답 보관(미확인 필드 추적용). */
  raw: Record<string, unknown>;
};

/** `orca terminal read` 가 주는 터미널 상태. */
export type OrcaTerminalState = 'running' | 'tui-idle' | 'exited';

export type OrcaTerminalOutput = {
  terminalId: string;
  state: OrcaTerminalState;
  output: string;
};

export type OrcaRun = {
  id: string;
  /** UI 라벨은 `목적` 이다(`SPEC-mvp-acceptance` 31행). 저장 필드는 goal. */
  goal: string;
  status: string;
  startedAt: string | null;
};

export type OrcaTask = {
  id: string;
  runId: string;
  title: string;
  state: 'running' | 'done' | 'queued' | 'blocked';
  dependsOn: string[];
};

export type OrcaWorker = {
  id: string;
  runId: string;
  taskId: string;
  state: 'working' | 'done' | 'waiting';
  terminalState: OrcaTerminalState;
  attention: boolean;
  host: string;
};

export type OrcaGate = {
  id: string;
  runId: string;
  name: string;
  state: 'passed' | 'pending';
};

/** 오케스트레이션 화면이 한 번에 받는 스냅샷. 조회 전용(쓰기 계약 없음). */
export type OrcaOrchestration = {
  runs: OrcaRun[];
  tasks: OrcaTask[];
  workers: OrcaWorker[];
  gates: OrcaGate[];
};

/** 3초 폴링이 만드는 Orca 스냅샷. 폴링 실패 시 직전 성공 값을 유지하고 stale 을 표시한다. */
export type OrcaSnapshot = {
  reachable: boolean;
  stale: boolean;
  fetchedAt: string;
  projects: OrcaProject[];
  worktrees: OrcaWorktree[];
  orchestration: OrcaOrchestration;
};

export const EMPTY_ORCA_SNAPSHOT: OrcaSnapshot = {
  reachable: false,
  stale: false,
  fetchedAt: '',
  projects: [],
  worktrees: [],
  orchestration: { runs: [], tasks: [], workers: [], gates: [] },
};
