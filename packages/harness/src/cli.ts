/**
 * 하네스 CLI — Pi 세션이 bash 로 호출해 그룹 상태(Goal/List/Loop/Audit/TODO/질문/메시지)를 append 한다.
 * 앱은 같은 파일을 읽기만 하므로 두 프로세스가 동시에 열어도 안전하다(append-only).
 *
 *   node packages/harness/src/cli.ts goal --group g1 --writer s1 --objective "..." [--status active]
 *   node packages/harness/src/cli.ts goal complete --group g1 --id goal_1 [--summary "..."]
 *   node packages/harness/src/cli.ts goal --group g1 --id goal_1 --revision-bump "완료 조건 변경"
 *   node packages/harness/src/cli.ts list --group g1 --writer s1 --title "..." [--state queued]
 *   node packages/harness/src/cli.ts list freeze --group g1 [--goal-id goal_1 --goal-id goal_2]
 *   node packages/harness/src/cli.ts loop --group g1 --writer s1 --goal g1-goal --target "..." --measure "npm test" [--value 3]
 *   node packages/harness/src/cli.ts loop measure --group g1 --loop loop_1 --value 3 [--exit-code 0]
 *   node packages/harness/src/cli.ts todo --group g1 --writer s1 --text "..." [--status done]
 *   node packages/harness/src/cli.ts audit --group g1 --writer audit-agent --goal g1-goal --verdict approved --summary "..."
 *   node packages/harness/src/cli.ts audit start --group g1 --writer audit-agent --goal g1-goal
 *   node packages/harness/src/cli.ts audit finish --group g1 --goal g1-goal --gate passed --summary "..."
 *   node packages/harness/src/cli.ts ask --group g1 --writer s1 --question "..." --option a --option b
 *   node packages/harness/src/cli.ts say --group g1 --from s1 --to s1 --text "..."
 *   node packages/harness/src/cli.ts show --group g1
 */
import type {
  AgentCommandAction,
  AgentCommandRecord,
  AgentMessageRecord,
  AuditGate,
  AuditRecord,
  AuditVerdict,
  GoalRecord,
  HarnessEnvelope,
  HarnessRecord,
  ListItemRecord,
  LoopRecord,
  LoopStopReason,
  QuestionRecord,
  TodoRecord,
} from '../../../src/shared/contract/harness.ts';
import { makeEnvelope } from './envelope.ts';
import { dataDir } from './paths.ts';
import { createHarnessStore } from './store.ts';
import type { HarnessStore } from './store.ts';
import { completeGoal } from './state/goal.ts';
import type { LoopResult } from './state/loop.ts';
import { recordMeasurement, stopLoop } from './state/loop.ts';
import { finishAudit } from './state/audit.ts';
import { auditMayStart, auditVerdict, applyAuditVerdict, pinCommit, requiresGroupAudit } from './policy/audit-policy.ts';
import { bumpGoalRevision, canCompleteGoal } from './policy/goal-policy.ts';
import { freezeChildGoals } from './policy/list-policy.ts';
import { advanceAfterGoal } from './policy/list-run.ts';
import { loopBoundReached, loopOutcome, onLoopOutcome } from './policy/loop-policy.ts';

type Args = { command: string; flags: Map<string, string[]>; positionals: string[] };

type Ctx = { args: Args; store: HarnessStore; groupId: string; writer: string };

const COMMAND_ACTIONS: readonly AgentCommandAction[] = [
  'remove-worktree',
  'rename-worktree',
  'remove-session',
  'rename-session',
];

/** 허브가 요청하는 보드 조작 이름을 계약 값으로 좁힌다(오타를 조용히 저장하지 않는다). */
function commandAction(value: string): AgentCommandAction {
  const found = COMMAND_ACTIONS.find((action) => action === value);
  if (found === undefined) throw new Error(`알 수 없는 action: ${value} (가능: ${COMMAND_ACTIONS.join(', ')})`);
  return found;
}

const COMMANDS = ['goal', 'list', 'loop', 'todo', 'audit', 'ask', 'say', 'command', 'show'] as const;

const AUDIT_GATES: readonly AuditGate[] = ['passed', 'pending', 'none'];

function parseArgs(argv: string[]): Args {
  const [command = '', ...rest] = argv;
  const flags = new Map<string, string[]>();
  const positionals: string[] = [];
  let key: string | null = null;
  for (const token of rest) {
    if (token.startsWith('--')) {
      key = token.slice(2);
      if (!flags.has(key)) flags.set(key, []);
      continue;
    }
    // 플래그 값이 아닌 첫 토큰만 서브명령이다(예: `goal complete`).
    if (key === null) {
      positionals.push(token);
      continue;
    }
    flags.get(key)?.push(token);
  }
  return { command, flags, positionals };
}

function one(args: Args, name: string): string | null {
  const values = args.flags.get(name);
  return values === undefined || values.length === 0 ? null : (values[0] ?? null);
}

function required(args: Args, name: string): string {
  const value = one(args, name);
  if (value === null || value === '') throw new Error(`--${name} 값이 필요합니다`);
  return value;
}

function num(args: Args, name: string, fallback: number): number {
  const value = one(args, name);
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} 는 숫자여야 합니다`);
  return parsed;
}

function optionalNum(args: Args, name: string): number | null {
  const value = one(args, name);
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} 는 숫자여야 합니다`);
  return parsed;
}

/** `--gate` 는 반복 지정한다. 계약 밖 값은 조용히 버리지 않고 오류로 알린다(verdict 근거가 사라진다). */
function gateFlags(args: Args): AuditGate[] {
  const raw = args.flags.get('gate') ?? [];
  return raw.map((value) => {
    const gate = AUDIT_GATES.find((candidate) => candidate === value);
    if (gate === undefined) throw new Error(`--gate 는 ${AUDIT_GATES.join('|')} 중 하나여야 합니다`);
    return gate;
  });
}

function verdictFlag(args: Args): AuditVerdict {
  return (one(args, 'verdict') ?? 'approved') as AuditVerdict;
}

/** 감사 기록의 시작·종료 차이. `audit start` 는 running 으로만 남기고 verdict 는 finish 에서 쓴다(§10.4). */
function auditStamp(args: Args): {
  state: AuditRecord['state'];
  verdict: AuditVerdict | null;
  commitHash: string | null;
  revision: number;
} {
  const revision = num(args, 'revision', 1);
  const pinned = pinCommit(String(revision), one(args, 'commit') ?? '');
  const gates = gateFlags(args);
  const starting = args.positionals[0] === 'start';

  return {
    state: starting ? 'running' : 'finished',
    verdict: starting ? null : gates.length > 0 ? auditVerdict(gates) : verdictFlag(args),
    // 감사 시작 시 커밋 해시를 고정한다(§10.4) — 감사 중 변경 판정의 기준값이다.
    commitHash: pinned.commit === '' ? null : pinned.commit,
    revision,
  };
}

function build(args: Args, envelope: { groupId: string; seq: number; writer: string; id: string }): HarnessRecord {
  const now = new Date().toISOString();
  const env = <T extends HarnessRecord['type']>(type: T): HarnessEnvelope & { type: T } =>
    makeEnvelope({ ...envelope, type, at: now });
  const sessionId = one(args, 'session') ?? envelope.writer;

  switch (args.command) {
    case 'goal': {
      const record: GoalRecord = {
        ...env('goal'),
        sessionId,
        parentListItemId: one(args, 'parent-list-item'),
        parentGoalId: one(args, 'parent-goal'),
        supersededByGoalId: null,
        objective: required(args, 'objective'),
        acceptanceCriteria: (args.flags.get('check') ?? []).map((desc, index) => ({
          id: `c${index + 1}`,
          desc,
          passed: false,
          evidence: null,
        })),
        status: (one(args, 'status') ?? 'active') as GoalRecord['status'],
        pauseReason: (one(args, 'pause-reason') ?? null) as GoalRecord['pauseReason'],
        auditAttemptCount: 0,
        revision: 1,
        loopId: one(args, 'loop'),
        latestAuditId: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        completedRevision: null,
        archivedAt: null,
      };
      return record;
    }
    case 'list': {
      const record: ListItemRecord = {
        ...env('list_item'),
        sessionId,
        goalId: one(args, 'goal'),
        parentGoalId: one(args, 'parent-goal'),
        title: required(args, 'title'),
        state: (one(args, 'state') ?? 'queued') as ListItemRecord['state'],
        queueOrder: num(args, 'order', envelope.seq),
        childGoalIds: args.flags.get('child-goal') ?? [],
        supersededGoalIds: [],
        childGoalsFrozen: args.flags.has('frozen'),
        childGoalsFrozenAt: args.flags.has('frozen') ? now : null,
        integrationNote: one(args, 'note'),
        createdAt: now,
        activatedAt: null,
        completedAt: null,
        completedRevision: null,
      };
      return record;
    }
    case 'loop': {
      const value = optionalNum(args, 'value');
      const record: LoopRecord = {
        ...env('loop'),
        goalId: required(args, 'goal'),
        sessionId,
        target: required(args, 'target'),
        measureCmd: required(args, 'measure'),
        direction: one(args, 'direction') === 'max' ? 'max' : 'min',
        currentValue: value,
        bestValue: value,
        iteration: num(args, 'iteration', 0),
        maxIterations: num(args, 'max', 50),
        timeLimitSeconds: optionalNum(args, 'time-limit'),
        tokenLimit: optionalNum(args, 'token-limit'),
        tokensUsed: num(args, 'tokens-used', 0),
        status: (one(args, 'status') ?? 'idle') as LoopRecord['status'],
        pauseKind: null,
        stopReason: null,
        measureExitCode: optionalNum(args, 'exit-code'),
        measureStderr: one(args, 'stderr'),
        measuredAt: value === null ? null : now,
        history: [],
        startedAt: now,
        updatedAt: now,
      };
      return record;
    }
    case 'todo': {
      const record: TodoRecord = {
        ...env('todo'),
        scope: one(args, 'scope') === 'group' ? 'group' : 'session',
        sessionId,
        title: required(args, 'text'),
        status: (one(args, 'status') ?? 'todo') as TodoRecord['status'],
        createdBySessionId: sessionId,
        createdAt: now,
        updatedAt: now,
      };
      return record;
    }
    case 'audit': {
      const stamp = auditStamp(args);
      const record: AuditRecord = {
        ...env('audit'),
        goalId: required(args, 'goal'),
        scope: (one(args, 'scope') ?? 'session') as AuditRecord['scope'],
        auditSessionId: one(args, 'audit-session'),
        state: stamp.state,
        skipReason: null,
        skippedBy: null,
        skippedAt: null,
        verdict: stamp.verdict,
        commitHash: stamp.commitHash,
        worktreeState: null,
        criteriaResults: [],
        evidenceSummary: one(args, 'summary'),
        report: one(args, 'report'),
        model: one(args, 'model'),
        revision: stamp.revision,
        createdAt: now,
        finishedAt: stamp.state === 'running' ? null : now,
        durationMs: null,
      };
      return record;
    }
    case 'ask': {
      const record: QuestionRecord = {
        ...env('question'),
        sessionId,
        sequence: num(args, 'sequence', envelope.seq),
        questions: [
          {
            header: one(args, 'header') ?? '질문',
            question: required(args, 'question'),
            multiSelect: args.flags.has('multi'),
            options: (args.flags.get('option') ?? []).map((label) => ({ label, description: '' })),
          },
        ],
        status: 'pending',
        answer: null,
        createdAt: now,
        deliveredAt: null,
        answeredAt: null,
        answerAppliedAt: null,
      };
      return record;
    }
    case 'command': {
      const record: AgentCommandRecord = {
        ...env('command'),
        fromSessionId: sessionId,
        action: commandAction(required(args, 'action')),
        target: required(args, 'target'),
        value: one(args, 'value') ?? null,
        status: 'pending',
        result: null,
        createdAt: now,
        executedAt: null,
      };
      return record;
    }
    case 'say': {
      const record: AgentMessageRecord = {
        ...env('message'),
        fromSessionId: one(args, 'from') ?? sessionId,
        toSessionId: one(args, 'to') ?? sessionId,
        body: required(args, 'text'),
        status: 'pending',
        createdAt: now,
        deliveredAt: null,
        failureReason: null,
        resumeAttempted: false,
      };
      return record;
    }
    default:
      throw new Error(`처리할 수 없는 명령: ${args.command}`);
  }
}

/** 거부는 stderr 한 줄 + exitCode 1 로 알린다 — Pi 세션이 문구를 그대로 사용자에게 보여준다. */
function fail(message: string): number {
  process.stderr.write(`${message}\n`);
  return 1;
}

/** 같은 id 를 다시 append 하면 마지막 레코드가 이긴다(applyRecords) — 전이는 seq 만 올려 덧붙인다. */
async function appendNext(
  store: HarnessStore,
  groupId: string,
  record: HarnessRecord,
): Promise<number> {
  const seq = await store.nextSeqFor(groupId);
  await store.append(groupId, { ...record, seq });
  return seq;
}

/** 기존 명령 경로 — 레코드 하나를 그대로 append 한다. */
async function appendBuilt(ctx: Ctx): Promise<number> {
  const seq = await ctx.store.nextSeqFor(ctx.groupId);
  const record = build(ctx.args, {
    groupId: ctx.groupId,
    seq,
    writer: ctx.writer,
    id: one(ctx.args, 'id') ?? `${ctx.args.command}-${Date.now().toString(36)}`,
  });
  await ctx.store.append(ctx.groupId, record);
  process.stdout.write(`ok ${record.type} ${record.id} seq=${record.seq}\n`);
  return 0;
}

function goalIdFlag(args: Args): string | null {
  return one(args, 'goal-id') ?? one(args, 'id');
}

/** revision 을 밝히지 않으면 대상 Goal 의 현재 revision 으로 맞춘다 — 어긋난 승인은 완료 근거가 못 된다. */
function pinRevisionFlag(args: Args, revision: number): void {
  const given = args.flags.get('revision') ?? [];
  if (given.length > 0) return;
  args.flags.set('revision', [String(revision)]);
}

/** `goal complete` — 승인된 Audit 이 없으면 거부한다(§10.1, §38). */
async function goalComplete(ctx: Ctx): Promise<number> {
  const id = goalIdFlag(ctx.args);
  if (id === null) return fail('--id 또는 --goal-id 값이 필요합니다');

  const snapshot = await ctx.store.snapshot(ctx.groupId);
  const goal = snapshot.goals.find((candidate) => candidate.id === id);
  if (goal === undefined) return fail(`Goal 을 찾을 수 없습니다: ${id}`);

  const verdict = canCompleteGoal(goal, snapshot.audits);
  if (!verdict.ok) return fail(verdict.reason);

  // 계약 latestAuditId 는 화면의 최신 Audit 표시용이라 승인 근거를 여기서 고정한다.
  const completed = completeGoal(
    { ...goal, latestAuditId: verdict.auditId },
    { summary: one(ctx.args, 'summary') ?? '' },
  );
  if (!completed.ok) return fail(completed.error);

  const seq = await appendNext(ctx.store, ctx.groupId, completed.record);
  process.stdout.write(
    `ok goal ${completed.record.id} seq=${seq} status=${completed.record.status} audit=${verdict.auditId}\n`,
  );

  // List 항목이 있는 Goal 이면 항목을 닫고 다음 항목을 자동 배정한다(수용기준 38-44).
  const at = new Date().toISOString();
  const advance = advanceAfterGoal({
    items: snapshot.listItems,
    goals: snapshot.goals.map((candidate) =>
      candidate.id === completed.record.id ? completed.record : candidate,
    ),
    goal: completed.record,
    at,
  });
  for (const record of advance.records) {
    const listSeq = await appendNext(ctx.store, ctx.groupId, record);
    process.stdout.write(
      `ok list ${record.id} seq=${listSeq} state=${record.state} closed=${record.completedAt === null ? 'no' : 'yes'}\n`,
    );
  }
  if (advance.blocked !== null) {
    process.stdout.write(`blocked list ${advance.blocked.itemId} reason=${advance.blocked.reason}\n`);
  }
  return 0;
}

/** `goal --revision-bump` — 조건 개정으로 이전 승인을 무효화한다(§10.1, §37). */
async function goalRevisionBump(ctx: Ctx): Promise<number> {
  const id = goalIdFlag(ctx.args);
  if (id === null) return fail('--id 또는 --goal-id 값이 필요합니다');

  const snapshot = await ctx.store.snapshot(ctx.groupId);
  const goal = snapshot.goals.find((candidate) => candidate.id === id);
  if (goal === undefined) return fail(`Goal 을 찾을 수 없습니다: ${id}`);

  const bumped = bumpGoalRevision(goal, one(ctx.args, 'revision-bump') ?? '');
  const seq = await appendNext(ctx.store, ctx.groupId, bumped);
  process.stdout.write(`ok goal ${bumped.id} seq=${seq} revision=${bumped.revision}\n`);
  return 0;
}

/** `list freeze` — 배정이 끝난 항목의 하위 Goal 집합을 고정한다(§10.2, §40). */
async function listFreeze(ctx: Ctx): Promise<number> {
  const snapshot = await ctx.store.snapshot(ctx.groupId);
  const assigned = ctx.args.flags.get('goal-id') ?? [];
  const at = new Date().toISOString();
  let frozen = 0;

  for (const item of snapshot.listItems) {
    // 이미 고정된 항목은 집합이 바뀌면 완료 판정 근거가 달라지므로 건너뛴다.
    if (item.childGoalsFrozen) continue;
    const goalIds = assigned.length > 0 ? assigned : item.childGoalIds;
    const seq = await appendNext(
      ctx.store,
      ctx.groupId,
      freezeChildGoals(item, goalIds, at),
    );
    process.stdout.write(`ok list_item ${item.id} seq=${seq} frozen=${goalIds.length}\n`);
    frozen += 1;
  }

  process.stdout.write(`ok list_item frozen=${frozen}\n`);
  return 0;
}

/** `audit start` gate — 직계 자식 정산과 그룹 Audit 대상을 확인한다(§10.4, §47~§49). */
async function auditStartGate(ctx: Ctx): Promise<{ ok: boolean; reason: string }> {
  const id = one(ctx.args, 'goal');
  if (id === null) return { ok: false, reason: '--goal 값이 필요합니다' };

  const snapshot = await ctx.store.snapshot(ctx.groupId);
  const goal = snapshot.goals.find((candidate) => candidate.id === id);
  if (goal === undefined) return { ok: false, reason: `Goal 을 찾을 수 없습니다: ${id}` };

  const children = snapshot.goals.filter((child) => child.parentGoalId === goal.id);
  if (one(ctx.args, 'scope') === 'group' && !requiresGroupAudit([goal], children)) {
    return { ok: false, reason: '그룹 Goal 이 만든 세션의 하위 Goal 이 없어 그룹 Audit 을 시작하지 않습니다.' };
  }

  pinRevisionFlag(ctx.args, goal.revision);
  return auditMayStart({ children, goals: snapshot.goals });
}

/**
 * `audit finish` — 진행 중 감사 기록에 verdict 를 남긴다. 없으면 한 번에 기록하는 기존 경로로 돌아간다.
 */
async function auditFinish(ctx: Ctx): Promise<number> {
  const id = required(ctx.args, 'goal');
  const snapshot = await ctx.store.snapshot(ctx.groupId);

  let running: AuditRecord | null = null;
  for (const audit of snapshot.audits) {
    if (audit.goalId !== id || audit.state !== 'running') continue;
    if (running === null || audit.seq >= running.seq) running = audit;
  }
  if (running === null) {
    const goal = snapshot.goals.find((candidate) => candidate.id === id);
    if (goal !== undefined) pinRevisionFlag(ctx.args, goal.revision);
    // 기록·Goal 전이 경로를 하나로 유지한다 — 판정이 있으면 Goal 도 함께 옮긴다.
    return await auditDirect(ctx);
  }

  const gates = gateFlags(ctx.args);
  const verdict = gates.length > 0 ? auditVerdict(gates) : verdictFlag(ctx.args);
  const finished = finishAudit(running, {
    verdict,
    summary: required(ctx.args, 'summary'),
    gates,
    at: new Date().toISOString(),
  });
  if (!finished.ok) return fail(finished.error);

  const seq = await appendNext(ctx.store, ctx.groupId, finished.record);
  process.stdout.write(
    `ok audit ${finished.record.id} seq=${seq} state=${finished.record.state} verdict=${verdict}\n`,
  );
  return await applyAuditVerdictToGoal(ctx, finished.record);
}

/**
 * Audit verdict 로 Goal 상태를 옮겨 새 레코드로 덧붙인다(§52, §53).
 * 승인·거부·불가능·오류 외의 기록(진행 중·판정 없음)은 Goal 을 건드리지 않는다.
 */
async function applyAuditVerdictToGoal(ctx: Ctx, audit: AuditRecord): Promise<number> {
  const auditVerdictValue = audit.verdict;
  if (audit.state !== 'finished' || auditVerdictValue === null) return 0;

  const snapshot = await ctx.store.snapshot(ctx.groupId);
  const goal = snapshot.goals.find((candidate) => candidate.id === audit.goalId);
  // 감사 대상 Goal 이 아카이브/외부 정리로 사라졌으면 상태를 옮길 대상이 없다.
  if (goal === undefined) return 0;

  const failedCriteria = audit.criteriaResults
    .filter((result) => result.result === 'fail')
    .map((result) => result.criterion);
  const next = applyAuditVerdict(goal, auditVerdictValue, new Date().toISOString(), {
    auditId: audit.id,
    failedCriteria,
  });
  // 적용할 전이가 없으면(완료·중단된 Goal) 같은 레코드를 다시 쓰지 않는다.
  if (next === goal) return 0;

  const seq = await appendNext(ctx.store, ctx.groupId, next);
  process.stdout.write(
    `ok goal ${next.id} seq=${seq} status=${next.status} pause=${next.pauseReason ?? 'none'} verdict=${auditVerdictValue}\n`,
  );
  return 0;
}

/** `audit` 한 번에 기록 — 판정이 있으면 Goal 전이 레코드까지 덧붙인다(§52, §53, §57). */
async function auditDirect(ctx: Ctx): Promise<number> {
  const seq = await ctx.store.nextSeqFor(ctx.groupId);
  const record = build(ctx.args, {
    groupId: ctx.groupId,
    seq,
    writer: ctx.writer,
    id: one(ctx.args, 'id') ?? `audit-${Date.now().toString(36)}`,
  });
  if (record.type !== 'audit') return fail('audit 명령이 Audit 레코드를 만들지 못했습니다.');

  await ctx.store.append(ctx.groupId, record);
  process.stdout.write(
    `ok audit ${record.id} seq=${record.seq} verdict=${record.verdict ?? 'none'}\n`,
  );
  return await applyAuditVerdictToGoal(ctx, record);
}

function findLoop(
  loops: readonly LoopRecord[],
  loopId: string | null,
  goalId: string | null,
): LoopRecord | null {
  if (loopId !== null) {
    for (const loop of loops) {
      if (loop.id === loopId) return loop;
    }
    return null;
  }

  let latest: LoopRecord | null = null;
  for (const loop of loops) {
    if (goalId !== null && loop.goalId !== goalId) continue;
    if (latest === null || loop.seq >= latest.seq) latest = loop;
  }
  return latest;
}

function boundStopReason(code: 'max' | 'time' | 'tokens' | null): LoopStopReason {
  if (code === 'time') return 'time_limit';
  if (code === 'tokens') return 'token_limit';
  return 'max_iterations';
}

/**
 * `loop measure` — 측정값을 기록하고 상한·목표 도달이면 Loop 와 Goal 을 함께 전이시킨다(§10.3, §57).
 * 이미 감사 대기·중지된 Loop 는 측정값만 기록하고 전이를 반복하지 않는다.
 */
async function loopMeasure(ctx: Ctx): Promise<number> {
  const loopId = one(ctx.args, 'loop-id') ?? one(ctx.args, 'id');
  const goalId = one(ctx.args, 'goal');
  if (loopId === null && goalId === null) return fail('--loop 또는 --goal 값이 필요합니다');
  if (one(ctx.args, 'value') === null) return fail('--value 값이 필요합니다');

  const snapshot = await ctx.store.snapshot(ctx.groupId);
  const loop = findLoop(snapshot.loops, loopId, goalId);
  if (loop === null) return fail('대상 Loop 을 찾을 수 없습니다. --loop 또는 --goal 값을 확인하세요.');

  const measured = recordMeasurement(loop, {
    value: num(ctx.args, 'value', 0),
    exitCode: num(ctx.args, 'exit-code', 0),
    stderr: one(ctx.args, 'stderr') ?? undefined,
    at: new Date().toISOString(),
  });
  if (!measured.ok) return fail(measured.error);

  const bound = loopBoundReached(measured.record);
  const outcome = loopOutcome(measured.record, []).outcome;
  const goal = snapshot.goals.find((candidate) => candidate.id === measured.record.goalId) ?? null;
  const settled =
    measured.record.status === 'stopped' ||
    measured.record.status === 'done' ||
    measured.record.pauseKind === 'audit';

  // 상한·목표 도달은 Loop 와 Goal 을 함께 전이시키고 두 레코드를 덧붙인다(§57).
  if (goal !== null && !settled && (outcome === 'goal' || outcome === 'bounds')) {
    const transition = onLoopOutcome(measured.record, outcome, goal);
    const loopSeq = await appendNext(ctx.store, ctx.groupId, transition.loop);
    process.stdout.write(
      `ok loop ${transition.loop.id} seq=${loopSeq} status=${transition.loop.status} outcome=${outcome}\n`,
    );

    // 완료·중단된 Goal 은 전이시키지 않으므로 바뀐 경우에만 덧붙인다.
    if (transition.goal !== goal) {
      const goalSeq = await appendNext(ctx.store, ctx.groupId, transition.goal);
      process.stdout.write(
        `ok goal ${transition.goal.id} seq=${goalSeq} status=${transition.goal.status} pause=${transition.goal.pauseReason ?? 'none'}\n`,
      );
    }
    return 0;
  }

  const finished: LoopResult = bound.reached
    ? stopLoop(measured.record, { reason: boundStopReason(bound.code) })
    : measured;
  if (!finished.ok) return fail(finished.error);

  const seq = await appendNext(ctx.store, ctx.groupId, finished.record);
  process.stdout.write(
    `ok loop ${finished.record.id} seq=${seq} status=${finished.record.status} bound=${bound.code ?? 'none'}
`,
  );
  return 0;
}

async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.command === '' || args.command === 'help') {
    process.stdout.write(`commands: ${COMMANDS.join(' | ')}\n`);
    return 0;
  }
  if (!(COMMANDS as readonly string[]).includes(args.command)) {
    process.stderr.write(`알 수 없는 명령: ${args.command}\n`);
    return 2;
  }

  const store = createHarnessStore({ dataDir: process.env['GRAPH_PI_DATA_DIR'] ?? dataDir() });
  const groupId = required(args, 'group');
  const sub = args.positionals[0] ?? null;

  if (args.command === 'show') {
    process.stdout.write(`${JSON.stringify(await store.snapshot(groupId), null, 2)}\n`);
    return 0;
  }

  const ctx: Ctx = { args, store, groupId, writer: one(args, 'writer') ?? 'cli' };

  // 완료 조건 없는 Goal 은 감사가 판정할 근거가 없다(SPEC §10.1). 새 Goal 생성에서만 요구한다.
  if (args.command === 'goal' && sub === null && (args.flags.get('check') ?? []).length === 0) {
    return fail('완료 조건이 하나 이상 필요합니다. --check "<검증 항목>" 을 지정하세요');
  }
  if (args.command === 'goal' && sub === 'complete') return await goalComplete(ctx);
  if (args.command === 'goal' && args.flags.has('revision-bump')) return await goalRevisionBump(ctx);
  if (args.command === 'list' && sub === 'freeze') return await listFreeze(ctx);
  if (args.command === 'audit' && sub === 'finish') return await auditFinish(ctx);
  if (args.command === 'audit' && sub === 'start') {
    const gate = await auditStartGate(ctx);
    if (!gate.ok) return fail(gate.reason);
  }
  // verdict 를 바로 받는 한 번짜리 `audit` 기록도 Goal 전이까지 연결한다(§52, §53).
  if (args.command === 'audit' && sub === null) return await auditDirect(ctx);
  if (args.command === 'loop' && sub === 'measure') return await loopMeasure(ctx);

  return await appendBuilt(ctx);
}

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
