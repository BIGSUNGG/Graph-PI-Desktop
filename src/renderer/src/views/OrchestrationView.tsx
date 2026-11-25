/**
 * 오케스트레이션 화면 — Orca 스냅샷의 run·task·worker·gate 를 **읽기 전용**으로 보여준다.
 * 목업 `renderOrch`(mock/index.html:2111-2155) 구조를 따르되 쓰기 버튼은 두지 않는다.
 * 스냅샷은 store(`state.orca`)가 `orca:snapshot` 호출과 `evt:push` 로 이미 채운 값을 쓴다.
 */
import { useState, type ReactElement } from 'react';
import type { OrcaTask, OrcaWorker } from '../../../shared/contract/index.ts';
import { useApp } from '../state/hooks.ts';

/** task 상태 → `.pill` 변형(목업 :2136). queued 는 상태색 없이 기본 pill 이다. */
const TASK_PILL: Record<OrcaTask['state'], string> = {
  running: 'running',
  done: 'done',
  blocked: 'idle',
  queued: '',
};

/** worker 상태 → `.pill` 변형(목업 :2144). `working` 은 running 색이다. */
function workerPill(state: OrcaWorker['state']): string {
  if (state === 'done') return 'done';
  if (state === 'waiting') return 'idle';
  return 'running';
}

function pillClass(variant: string): string {
  return variant === '' ? 'pill' : `pill ${variant}`;
}

/** 목업은 `HH:MM` 문자열을 그대로 썼다(:715). 계약은 ISO 이므로 화면에서 `MM-DD HH:MM` 으로 자른다. */
function stampOf(iso: string | null): string {
  if (iso === null) return '미확인';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '미확인';
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

export function OrchestrationView(): ReactElement {
  const { orca, status } = useApp();
  const [runId, setRunId] = useState<string | null>(null);
  const { runs, tasks, workers, gates } = orca.orchestration;

  // Orca 오프라인이면 표를 그리지 않는다(목업 :1216-1219 의 `setOrca` 와 같은 문구).
  if (!orca.reachable) {
    return <div className="empty">{status === null ? 'Orca 연결 확인 중…' : 'Orca 연결 없음'}</div>;
  }

  // 선택이 없거나 사라진 run 이면 첫 run 을 쓴다(목업 :2113-2114 와 같은 기본값).
  const run = runs.find((entry) => entry.id === runId) ?? runs[0] ?? null;
  const runTasks = run === null ? [] : tasks.filter((task) => task.runId === run.id);
  const runWorkers = run === null ? [] : workers.filter((worker) => worker.runId === run.id);
  const runGates = run === null ? [] : gates.filter((gate) => gate.runId === run.id);
  const doneCount = runTasks.filter((task) => task.state === 'done').length;
  const percent = runTasks.length === 0 ? 0 : Math.round((doneCount / runTasks.length) * 100);

  return (
    <div className="orch">
      <div className="orch-head">
        <select
          aria-label="실행 선택"
          value={run === null ? '' : run.id}
          onChange={(event) => {
            setRunId(event.target.value === '' ? null : event.target.value);
          }}
        >
          {runs.length === 0 ? <option value="">실행 없음</option> : null}
          {runs.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.id} — 목적: {entry.goal}
            </option>
          ))}
        </select>
        <span className="pill readonly">읽기 전용</span>
        <span className="muted">
          {run === null
            ? '실행 없음'
            : `목적: ${run.goal} · 상태 ${run.status} · 시작 ${stampOf(run.startedAt)} · task ${runTasks.length}개`}
        </span>
        {orca.stale ? <span className="pill idle">지난 값</span> : null}
      </div>

      <div className="orch-grid">
        <section className="panel" aria-label="Task">
          <h3>Task</h3>
          {runTasks.length === 0 ? (
            <p className="empty">{run === null ? '실행 없음' : 'Task 없음'}</p>
          ) : (
            <>
              <div className="progress-row">
                <span>
                  완료 {doneCount}/{runTasks.length}
                </span>
                <div className="track">
                  <i style={{ width: `${percent}%` }} />
                </div>
              </div>
              {runTasks.map((task) => (
                <div key={task.id} className={`task ${task.state}`}>
                  <span className={pillClass(TASK_PILL[task.state])}>
                    <span className="d" />
                    {task.state}
                  </span>
                  <div className="t-main">
                    <div className="t-title">
                      {task.id} · {task.title}
                    </div>
                    <div className="deps">
                      {(task.dependsOn ?? []).length === 0
                        ? 'deps 없음'
                        : `deps ${(task.dependsOn ?? []).join(', ')}`}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </section>

        <section className="panel" aria-label="Worker">
          <h3>Worker</h3>
          {runWorkers.length === 0 ? (
            <p className="empty">{run === null ? '실행 없음' : 'Worker 없음'}</p>
          ) : (
            runWorkers.map((worker) => (
              <div key={worker.id} className="worker">
                <span>
                  {worker.id} · {worker.taskId}
                </span>
                <span className="w-meta">
                  <span className="pill">{worker.host}</span>
                  {worker.attention ? <span className="pill attention">주의</span> : null}
                  <span className="pill">{worker.terminalState}</span>
                  <span className={pillClass(workerPill(worker.state))}>
                    <span className="d" />
                    {worker.state}
                  </span>
                </span>
              </div>
            ))
          )}
        </section>

        <section className="panel" aria-label="Gate">
          <h3>Gate</h3>
          {runGates.length === 0 ? (
            <p className="empty">{run === null ? '실행 없음' : 'Gate 없음'}</p>
          ) : (
            runGates.map((gate) => (
              <div key={gate.id} className="gate">
                {gate.state === 'passed' ? (
                  <svg className="chk" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8.5 6.5 12 13 4.5" />
                  </svg>
                ) : null}
                <span>{gate.name}</span>
                <span className={pillClass(gate.state === 'passed' ? 'done' : 'idle')}>
                  <span className="d" />
                  {gate.state}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
