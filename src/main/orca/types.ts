/**
 * Orca CLI 응답 원형과 정규화. 외부 JSON 은 `unknown` 으로 받고, 모르는 값은 빈 배열·기본값으로 접으며 throw 하지 않는다.
 * 근거: `docs/90-reference/orca-cli-and-pi-sessions.md` §이 프로젝트가 쓰는 명령(실측 필드).
 */
import type {
  OrcaGate,
  OrcaOrchestration,
  OrcaProject,
  OrcaRun,
  OrcaTask,
  OrcaTerminalState,
  OrcaWorker,
  OrcaWorktree
} from '../../shared/contract/orca.ts'

/** `orca project list` result 원형. 실측 필드는 `id`, `name`, `kind`, `addedAt`. */
export type OrcaProjectListRaw = { projects?: unknown }

/** `orca worktree list` result 원형. 실측 필드는 `id`, `branch`, `baseRef`, `repoId`, `path`. */
export type OrcaWorktreeListRaw = { worktrees?: unknown }

/** `orca orchestration run-list` result 원형. */
export type OrcaRunListRaw = { runs?: unknown }

/** `orca orchestration run-show --id <id>` result 원형(단일 run 이 최상위이거나 `run` 아래에 온다). */
export type OrcaRunShowRaw = { run?: unknown }

/** `orca orchestration task-list --run <id> --brief` result 원형(실측: `{tasks:[{id,status,title}],runId}`). */
export type OrcaTaskListRaw = { tasks?: unknown; runId?: unknown }

/** `orca orchestration worker-list` result 원형(실측: `dispatchId`, `taskId`, `terminalState`, `attention` …). */
export type OrcaWorkerListRaw = { workers?: unknown }

/** `orca orchestration gate-list --run <id>` result 원형(미실측). */
export type OrcaGateListRaw = { gates?: unknown }

/** 오케스트레이션 4종을 합친 원형. */
export type OrcaOrchestrationRaw = {
  runs?: unknown
  tasks?: unknown
  workers?: unknown
  gates?: unknown
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 후보 키를 순서대로 보고 처음 나온 비어 있지 않은 문자열(또는 유한 숫자)을 쓴다. */
export function pickString(rec: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = rec[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed !== '') return trimmed
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }
  return null
}

export function pickBool(rec: Record<string, unknown>, keys: readonly string[]): boolean | null {
  for (const key of keys) {
    const value = rec[key]
    if (typeof value === 'boolean') return value
  }
  return null
}

export function pickStringArray(rec: Record<string, unknown>, keys: readonly string[]): string[] {
  for (const key of keys) {
    const value = rec[key]
    if (Array.isArray(value)) {
      const out: string[] = []
      for (const item of value) {
        if (typeof item === 'string' && item.trim() !== '') out.push(item.trim())
      }
      return out
    }
  }
  return []
}

/** result 가 배열 자체이거나 `{ <key>: [...] }` 인 두 봉투를 모두 받는다. */
export function pickArray(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw
  if (isRecord(raw)) {
    const value = raw[key]
    if (Array.isArray(value)) return value
  }
  return []
}

/** `branch` 는 `refs/heads/` 접두를 뗀 짧은 이름으로 맞춘다(계약 주석). */
export function shortBranch(raw: string | null): string {
  if (raw === null) return ''
  const prefix = 'refs/heads/'
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw
}

function nameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '')
  return parts[parts.length - 1] ?? ''
}

function pickProject(raw: unknown): OrcaProject | null {
  if (!isRecord(raw)) return null
  const id = pickString(raw, ['id', 'projectId', 'repoId'])
  if (id === null) return null
  const path = pickString(raw, ['path', 'repoPath', 'root']) ?? ''
  // CLI 는 `name` 만 주므로 표시명은 displayName → name → 경로 마지막 조각 순으로 접는다.
  const displayName = pickString(raw, ['displayName', 'name', 'title']) ?? nameFromPath(path)
  // 워크트리 생성의 `--repo` 는 project.id 가 아니라 sourceRepoIds 의 repo id 를 받는다(실측).
  const repoIds = Array.isArray(raw['sourceRepoIds'])
    ? raw['sourceRepoIds'].filter((value): value is string => typeof value === 'string')
    : undefined
  return { id, displayName, path, repoIds }
}

export function pickProjects(raw: unknown): OrcaProject[] {
  const out: OrcaProject[] = []
  for (const item of pickArray(raw, 'projects')) {
    const project = pickProject(item)
    if (project !== null) out.push(project)
  }
  return out
}

export function pickWorktree(raw: unknown): OrcaWorktree | null {
  if (!isRecord(raw)) return null
  const id = pickString(raw, ['id', 'worktreeId'])
  if (id === null) return null
  const path = pickString(raw, ['path', 'worktreePath', 'root']) ?? ''
  const branch = shortBranch(pickString(raw, ['branch', 'branchName', 'ref']))
  const displayName = pickString(raw, ['displayName', 'name', 'title']) ?? nameFromPath(path)
  const repoId = pickString(raw, ['repoId', 'projectId', 'repo']) ?? ''
  // 부모 관계 필드는 실측되지 않아 있으면 쓰고 없으면 null 로 둔다.
  const parentWorktreeId = pickString(raw, ['parentWorktreeId', 'parentId', 'parent'])
  const projectId = pickString(raw, ['projectId', 'project'])
  const isMainWorktree = raw['isMainWorktree'] === true
  return { id, displayName, branch, path, repoId, parentWorktreeId, projectId: projectId ?? undefined, isMainWorktree }
}

export function pickWorktrees(raw: unknown): OrcaWorktree[] {
  const out: OrcaWorktree[] = []
  for (const item of pickArray(raw, 'worktrees')) {
    const worktree = pickWorktree(item)
    if (worktree !== null) out.push(worktree)
  }
  return out
}

export function pickTerminalState(raw: string | null): OrcaTerminalState {
  switch (raw) {
    case 'running':
    case 'busy':
    case 'working':
      return 'running'
    case 'tui-idle':
    case 'idle':
    case 'waiting':
      return 'tui-idle'
    case 'exited':
    case 'done':
    case 'closed':
    case 'dead':
      return 'exited'
    default:
      // 상태 문자열이 바뀌어도 화면이 죽지 않도록 살아 있는 쪽으로 접는다.
      return 'running'
  }
}

export function pickRun(raw: unknown): OrcaRun | null {
  if (!isRecord(raw)) return null
  const id = pickString(raw, ['id', 'runId'])
  if (id === null) return null
  // UI 라벨은 `목적` 이고 저장 필드는 goal 이다(계약 주석).
  const goal = pickString(raw, ['goal', 'purpose', 'title', 'name']) ?? ''
  const status = pickString(raw, ['status', 'state']) ?? 'unknown'
  const startedAt = pickString(raw, ['startedAt', 'createdAt', 'at'])
  return { id, goal, status, startedAt }
}

export function pickRuns(raw: unknown): OrcaRun[] {
  const out: OrcaRun[] = []
  for (const item of pickArray(raw, 'runs')) {
    const run = pickRun(item)
    if (run !== null) out.push(run)
  }
  return out
}

function pickTaskState(raw: string | null): OrcaTask['state'] {
  switch (raw) {
    case 'running':
    case 'in_progress':
    case 'in-progress':
    case 'active':
      return 'running'
    case 'done':
    case 'completed':
    case 'complete':
      return 'done'
    case 'blocked':
    case 'failed':
    case 'error':
      return 'blocked'
    default:
      return 'queued'
  }
}

function pickTask(raw: unknown): OrcaTask | null {
  if (!isRecord(raw)) return null
  const id = pickString(raw, ['id', 'taskId'])
  if (id === null) return null
  const runId = pickString(raw, ['runId', 'run']) ?? ''
  const title = pickString(raw, ['title', 'name', 'summary']) ?? ''
  const state = pickTaskState(pickString(raw, ['status', 'state']))
  const dependsOn = pickStringArray(raw, ['dependsOn', 'dependencies', 'blockedBy'])
  return { id, runId, title, state, dependsOn }
}

export function pickTasks(raw: unknown): OrcaTask[] {
  const out: OrcaTask[] = []
  for (const item of pickArray(raw, 'tasks')) {
    const task = pickTask(item)
    if (task !== null) out.push(task)
  }
  return out
}

function pickWorkerState(raw: string | null): OrcaWorker['state'] {
  switch (raw) {
    case 'working':
    case 'running':
    case 'busy':
      return 'working'
    case 'done':
    case 'completed':
    case 'finished':
      return 'done'
    default:
      return 'waiting'
  }
}

function pickWorker(raw: unknown): OrcaWorker | null {
  if (!isRecord(raw)) return null
  // worker 의 1차 키는 실측상 `dispatchId` 다.
  const id = pickString(raw, ['dispatchId', 'id', 'workerId'])
  if (id === null) return null
  const taskId = pickString(raw, ['taskId', 'task']) ?? ''
  const runId = pickString(raw, ['runId', 'run']) ?? ''
  const state = pickWorkerState(pickString(raw, ['state', 'liveness']))
  const terminalRaw = pickString(raw, ['terminalState'])
  // terminalState 가 없으면 종료된 워커만 exited 로 접고 나머지는 살아 있는 것으로 본다.
  const terminalState =
    terminalRaw === null ? (state === 'done' ? 'exited' : 'running') : pickTerminalState(terminalRaw)
  const attention = pickBool(raw, ['attention', 'needsAttention']) ?? false
  const host = pickString(raw, ['host', 'workspace', 'machine']) ?? ''
  return { id, runId, taskId, state, terminalState, attention, host }
}

export function pickWorkers(raw: unknown): OrcaWorker[] {
  const out: OrcaWorker[] = []
  for (const item of pickArray(raw, 'workers')) {
    const worker = pickWorker(item)
    if (worker !== null) out.push(worker)
  }
  return out
}

function pickGate(raw: unknown): OrcaGate | null {
  if (!isRecord(raw)) return null
  const id = pickString(raw, ['id', 'gateId'])
  if (id === null) return null
  const runId = pickString(raw, ['runId', 'run']) ?? ''
  const name = pickString(raw, ['name', 'title', 'kind']) ?? ''
  const status = pickString(raw, ['state', 'status', 'verdict'])
  const state: OrcaGate['state'] = status === 'passed' || status === 'approved' || status === 'ok' ? 'passed' : 'pending'
  return { id, runId, name, state }
}

export function pickGates(raw: unknown): OrcaGate[] {
  const out: OrcaGate[] = []
  for (const item of pickArray(raw, 'gates')) {
    const gate = pickGate(item)
    if (gate !== null) out.push(gate)
  }
  return out
}

/** 항상 새 배열을 돌려준다(공유 상수를 참조하면 한쪽 변경이 다른 쪽에 새기 때문). */
export function emptyOrchestration(): OrcaOrchestration {
  return { runs: [], tasks: [], workers: [], gates: [] }
}

export function pickOrchestration(raw: {
  runs?: unknown
  tasks?: unknown
  workers?: unknown
  gates?: unknown
}): OrcaOrchestration {
  return {
    runs: pickRuns(raw.runs),
    tasks: pickTasks(raw.tasks),
    workers: pickWorkers(raw.workers),
    gates: pickGates(raw.gates)
  }
}
