/**
 * 3초 폴링기. Orca CLI 는 이벤트 푸시가 없어 상태 변화를 폴링으로만 볼 수 있다(문서 §주의점).
 * 실패는 throw 하지 않고 직전 성공 값을 stale 로 표시해 유지한다(#3 "마지막 성공 값 유지").
 */
import type { OrcaSnapshot } from '../../shared/contract/orca.ts'

export type OrcaPoller = {
  start(): void
  stop(): void
  get(): OrcaSnapshot
  refreshNow(): Promise<OrcaSnapshot>
  onChange(cb: (snapshot: OrcaSnapshot) => void): () => void
}

const DEFAULT_INTERVAL_MS = 3_000
const MIN_INTERVAL_MS = 250

function blankSnapshot(): OrcaSnapshot {
  return {
    reachable: false,
    stale: false,
    fetchedAt: '',
    projects: [],
    worktrees: [],
    orchestration: { runs: [], tasks: [], workers: [], gates: [] }
  }
}

function hasOrchestration(snapshot: OrcaSnapshot): boolean {
  const orchestration = snapshot.orchestration
  return (
    orchestration.runs.length > 0 ||
    orchestration.tasks.length > 0 ||
    orchestration.workers.length > 0 ||
    orchestration.gates.length > 0
  )
}

export function createOrcaPoller(opts: { intervalMs?: number; fetch: () => Promise<OrcaSnapshot> }): OrcaPoller {
  // 0 이하 간격이 들어오면 폴링이 폭주하므로 하한을 둔다.
  const intervalMs = Math.max(MIN_INTERVAL_MS, opts.intervalMs ?? DEFAULT_INTERVAL_MS)
  let current: OrcaSnapshot = blankSnapshot()
  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight: Promise<OrcaSnapshot> | null = null
  const listeners = new Set<(snapshot: OrcaSnapshot) => void>()

  const publish = (next: OrcaSnapshot): OrcaSnapshot => {
    current = next
    for (const listener of listeners) {
      try {
        listener(next)
      } catch {
        // 구독자 예외가 폴링 루프를 멈추면 안 된다.
      }
    }
    return next
  }

  /** 실패 시 성공한 필드만 새 값으로, 나머지는 직전 성공 값으로 유지한다. */
  const mergeOnFailure = (prior: OrcaSnapshot, fresh: OrcaSnapshot | null): OrcaSnapshot => {
    return {
      reachable: false,
      stale: true,
      fetchedAt: fresh === null || fresh.fetchedAt === '' ? prior.fetchedAt : fresh.fetchedAt,
      projects: fresh === null || fresh.projects.length === 0 ? prior.projects : fresh.projects,
      worktrees: fresh === null || fresh.worktrees.length === 0 ? prior.worktrees : fresh.worktrees,
      orchestration: fresh === null || !hasOrchestration(fresh) ? prior.orchestration : fresh.orchestration
    }
  }

  const runOnce = async (): Promise<OrcaSnapshot> => {
    let fresh: OrcaSnapshot
    try {
      fresh = await opts.fetch()
    } catch {
      return publish(mergeOnFailure(current, null))
    }
    if (fresh.reachable) return publish({ ...fresh, stale: false })
    return publish(mergeOnFailure(current, fresh))
  }

  const refreshNow = (): Promise<OrcaSnapshot> => {
    // 진행 중이면 중복 호출하지 않고 같은 약속을 돌려준다(3초 타이머와 수동 새로고침이 겹칠 수 있다).
    if (inFlight !== null) return inFlight
    const task = runOnce().finally(() => {
      inFlight = null
    })
    inFlight = task
    return task
  }

  return {
    start(): void {
      if (timer !== null) return
      void refreshNow()
      timer = setInterval(() => {
        void refreshNow()
      }, intervalMs)
    },
    stop(): void {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    },
    get(): OrcaSnapshot {
      return current
    },
    refreshNow,
    onChange(cb: (snapshot: OrcaSnapshot) => void): () => void {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    }
  }
}
