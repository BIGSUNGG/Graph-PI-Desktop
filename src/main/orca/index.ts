/**
 * Orca 어댑터 서비스. 폴링·조회·쓰기 호출을 한 표면으로 묶어 IPC 핸들러가 얇게 남게 한다(P1·P11·P12·P14 공용).
 * 폴러 fetch 는 project/worktree/orchestration 3종을 병렬 실행하고, 하나라도 실패하면 reachable:false 로 표시하되 성공한 값은 유지한다(#2·#3).
 */
import { readFile } from 'node:fs/promises'
import type {
  OrcaLaunchReceipt,
  OrcaOrchestration,
  OrcaProject,
  OrcaSnapshot,
  OrcaTerminalOutput,
  OrcaWorktree
} from '../../shared/contract/orca.ts'
import { type OrcaRunResult } from './cli.ts'
import { startPiAgent } from './agents.ts'
import { fetchOrchestration } from './orchestration.ts'
import { createOrcaPoller, type OrcaPoller } from './poller.ts'
import { addProject, listProjects, listWorktrees } from './projects.ts'
import { readTerminal, sendToTerminal, waitTerminal, type TerminalWaitTarget } from './terminals.ts'
import { emptyOrchestration } from './types.ts'
import {
  createWorktree as createWorktreeCmd,
  removeWorktree as removeWorktreeCmd,
  showWorktree as showWorktreeCmd,
  type CreateWorktreeInput
} from './worktrees.ts'

export type OrcaService = {
  start(): void
  stop(): void
  get(): OrcaSnapshot
  refresh(): Promise<OrcaSnapshot>
  onChange(cb: (snapshot: OrcaSnapshot) => void): () => void
  listProjects(): Promise<OrcaRunResult<OrcaProject[]>>
  addProject(path: string): Promise<OrcaRunResult<OrcaProject[]>>
  listWorktrees(): Promise<OrcaRunResult<OrcaWorktree[]>>
  launchPi(req: { cwd: string; prompt: string; model: string | null }): Promise<OrcaRunResult<OrcaLaunchReceipt>>
  sendPrompt(terminalId: string, text: string): Promise<OrcaRunResult<void>>
  readTerminal(terminalId: string): Promise<OrcaRunResult<OrcaTerminalOutput>>
  waitTerminal(terminalId: string, target: TerminalWaitTarget, timeoutMs?: number): Promise<OrcaRunResult<void>>
  createWorktree(req: CreateWorktreeInput): Promise<OrcaRunResult<OrcaWorktree | null>>
  removeWorktree(id: string): Promise<OrcaRunResult<void>>
  showWorktree(id: string): Promise<OrcaRunResult<OrcaWorktree | null>>
  fetchOrchestration(): Promise<OrcaRunResult<OrcaOrchestration>>
}

/**
 * 테스트용 스냅샷 고정. `GP_ORCA_FIXTURE` 가 JSON 파일 경로면 CLI 를 부르지 않고 그 값을 쓴다.
 * E2E 는 실제 Orca GUI 없이도 보드 레인을 그려야 한다(scripts/ 의 기존 fixture 방식과 같다).
 */
async function readFixtureSnapshot(): Promise<OrcaSnapshot | null> {
  const path = process.env['GP_ORCA_FIXTURE']
  if (path === undefined || path.trim() === '') return null
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<OrcaSnapshot>
    return {
      reachable: parsed.reachable ?? true,
      stale: parsed.stale ?? false,
      fetchedAt: parsed.fetchedAt ?? new Date().toISOString(),
      projects: parsed.projects ?? [],
      worktrees: parsed.worktrees ?? [],
      orchestration: parsed.orchestration ?? emptyOrchestration(),
    }
  } catch {
    return null
  }
}

async function fetchSnapshot(): Promise<OrcaSnapshot> {
  const fixture = await readFixtureSnapshot()
  if (fixture !== null) return fixture;
  const [projects, worktrees, orchestration] = await Promise.all([
    listProjects(),
    listWorktrees(),
    fetchOrchestration()
  ])
  return {
    reachable: projects.ok && worktrees.ok && orchestration.ok,
    stale: false,
    fetchedAt: new Date().toISOString(),
    projects: projects.ok ? projects.result : [],
    worktrees: worktrees.ok ? worktrees.result : [],
    orchestration: orchestration.ok ? orchestration.result : emptyOrchestration()
  }
}

export function createOrcaService(opts: { intervalMs?: number }): OrcaService {
  const poller: OrcaPoller = createOrcaPoller({
    intervalMs: opts.intervalMs,
    fetch: () => fetchSnapshot()
  })

  return {
    start: () => {
      poller.start()
    },
    stop: () => {
      poller.stop()
    },
    get: () => poller.get(),
    refresh: () => poller.refreshNow(),
    onChange: (cb) => poller.onChange(cb),
    listProjects,
    addProject,
    listWorktrees,
    launchPi: (req) => startPiAgent(req.cwd, req.prompt, req.model),
    sendPrompt: (terminalId, text) => sendToTerminal(terminalId, text),
    readTerminal: (terminalId) => readTerminal(terminalId),
    waitTerminal: (terminalId, target, timeoutMs) => waitTerminal(terminalId, target, timeoutMs),
    createWorktree: (req) => createWorktreeCmd(req),
    removeWorktree: (id) => removeWorktreeCmd(id),
    showWorktree: (id) => showWorktreeCmd(id),
    fetchOrchestration
  }
}
