/**
 * 오케스트레이션 조회 전용. Run → Task·Worker·Gate 를 모아 스냅샷 한 덩이로 만든다(#31, 읽기 계약만).
 * 근거: `docs/90-reference/orca-cli-and-pi-sessions.md` §이 프로젝트가 쓰는 명령·§주의점(task-list/gate-list 는 `--run` 필수).
 */
import type { OrcaGate, OrcaOrchestration, OrcaRun, OrcaTask, OrcaWorker } from '../../shared/contract/orca.ts'
import { orcaJson, type OrcaRunResult } from './cli.ts'
import { isRecord, pickGates, pickRun, pickRuns, pickTasks, pickWorkers } from './types.ts'

export async function fetchOrchestration(): Promise<OrcaRunResult<OrcaOrchestration>> {
  const runList = await orcaJson<unknown>(['orchestration', 'run-list'])
  if (!runList.ok) return runList

  const runs = pickRuns(runList.result)
  const detailedRuns: OrcaRun[] = []
  const tasks: OrcaTask[] = []
  const gates: OrcaGate[] = []

  for (const run of runs) {
    const [shown, taskList, gateList] = await Promise.all([
      // 문서 실측 형태는 `run-show --id <id>` 다.
      orcaJson<unknown>(['orchestration', 'run-show', '--id', run.id]),
      orcaJson<unknown>(['orchestration', 'task-list', '--run', run.id, '--brief']),
      // gate-list 역시 Run 바인딩이 없으면 run_required 로 실패한다.
      orcaJson<unknown>(['orchestration', 'gate-list', '--run', run.id])
    ])
    if (!shown.ok) return { ok: false, error: `run ${run.id} run-show 실패: ${shown.error}` }
    if (!taskList.ok) return { ok: false, error: `run ${run.id} task-list 실패: ${taskList.error}` }
    if (!gateList.ok) return { ok: false, error: `run ${run.id} gate-list 실패: ${gateList.error}` }

    detailedRuns.push(mergeRun(run, pickRunDetail(shown.result)))
    for (const task of pickTasks(taskList.result)) tasks.push({ ...task, runId: run.id })
    for (const gate of pickGates(gateList.result)) gates.push({ ...gate, runId: run.id })
  }

  // shortcut: worker-list 는 문서 실측 형태가 전역 호출(`worker-list --json`)이라 run 루프 밖에서 한 번만 부른다.
  const workerList = await orcaJson<unknown>(['orchestration', 'worker-list'])
  if (!workerList.ok) return { ok: false, error: `worker-list 실패: ${workerList.error}` }

  const runIdByTask = new Map<string, string>()
  for (const task of tasks) runIdByTask.set(task.id, task.runId)
  const workers: OrcaWorker[] = pickWorkers(workerList.result).map((worker) => ({
    ...worker,
    // worker 자체에 runId 가 없으면 소속 task 로 되짚는다.
    runId: worker.runId === '' ? (runIdByTask.get(worker.taskId) ?? '') : worker.runId
  }))

  return { ok: true, result: { runs: detailedRuns, tasks, workers, gates } }
}

function pickRunDetail(raw: unknown): OrcaRun | null {
  if (isRecord(raw) && isRecord(raw['run'])) return pickRun(raw['run'])
  return pickRun(raw)
}

function mergeRun(base: OrcaRun, detail: OrcaRun | null): OrcaRun {
  if (detail === null) return base
  return {
    id: base.id,
    goal: detail.goal === '' ? base.goal : detail.goal,
    status: detail.status === 'unknown' ? base.status : detail.status,
    startedAt: detail.startedAt ?? base.startedAt
  }
}
