import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  AuditRecord,
  GoalRecord,
  HarnessSnapshot,
  ListItemRecord,
  LoopRecord,
  PiSession,
  QuestionRecord,
  TokenUsage,
  WorktreeView,
} from '../../../shared/contract/index.ts'

/**
 * 인스펙터·보드 집계(외부 세션 판정·그룹 집계·4슬롯 판정) 회귀 테스트.
 *
 * 주의: `selectors.ts:24` 는 `../inspector/ListTab.tsx` 에서 `listDisplayState` 를 **런타임** import 한다.
 * `node --test` 의 타입 스트리핑은 JSX 를 변환하지 않으므로 이 모듈 그래프는 로드되지 않는다.
 * 정적 import 로 두면 이 파일이 모듈 로드 단계에서 죽어 다른 계약까지 함께 red 가 되므로,
 * 로드 가능 여부를 먼저 확인하고 불가능하면 사유를 남겨 skip 한다(조용히 통과시키지 않는다).
 */
type SelectorsModule = typeof import('./selectors.ts')

async function loadSelectors(): Promise<{ module: SelectorsModule | null; error: string }> {
  try {
    return { module: await import('./selectors.ts'), error: '' }
  } catch (error) {
    return { module: null, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
  }
}

const loaded = await loadSelectors()
const needsModule = loaded.module === null
  ? { skip: `selectors.ts 로드 실패 — ${loaded.error}` }
  : {}

function selectors(): SelectorsModule {
  const module = loaded.module
  assert.ok(module !== null, `selectors.ts 를 로드하지 못했다: ${loaded.error}`)
  return module
}

/* ── fixture ─────────────────────────────────────────────────── */

const AT = '2026-11-24T12:00:00.000Z'

function envelope(id: string, seq: number) {
  return { id, groupId: 'g1', seq, at: AT, schemaVersion: 1, writer: 's1' }
}

function usage(input: number, output: number): TokenUsage {
  return { input, output, cacheRead: 0, cacheWrite: 0 }
}

function session(id: string, overrides: Partial<PiSession> = {}): PiSession {
  return {
    id,
    groupId: 'g1',
    title: id,
    worktreeId: null,
    model: null,
    state: 'done',
    startedAt: AT,
    lastActivityAt: AT,
    usage: usage(0, 0),
    parentSessionId: null,
    isAudit: false,
    isHub: false,
    filePath: null,
    pendingLaunch: false,
    ...overrides,
  }
}

function worktree(id: string, path: string | null): WorktreeView {
  return {
    id,
    groupId: 'g1',
    repo: 'repo',
    name: id,
    branch: 'main',
    parentWorktreeId: null,
    dirty: false,
    orcaMissing: false,
    path,
  }
}

function goal(id: string, overrides: Partial<GoalRecord> = {}): GoalRecord {
  return {
    ...envelope(id, 1),
    type: 'goal',
    sessionId: 's1',
    parentListItemId: null,
    parentGoalId: null,
    supersededByGoalId: null,
    objective: id,
    acceptanceCriteria: [],
    status: 'active',
    pauseReason: null,
    auditAttemptCount: 0,
    revision: 1,
    loopId: null,
    latestAuditId: null,
    createdAt: AT,
    updatedAt: AT,
    completedAt: null,
    completedRevision: null,
    archivedAt: null,
    ...overrides,
  }
}

function listItem(id: string, overrides: Partial<ListItemRecord> = {}): ListItemRecord {
  return {
    ...envelope(id, 2),
    type: 'list_item',
    sessionId: 's1',
    goalId: null,
    parentGoalId: null,
    title: id,
    state: 'active',
    queueOrder: 1,
    childGoalIds: [],
    supersededGoalIds: [],
    childGoalsFrozen: false,
    childGoalsFrozenAt: null,
    integrationNote: null,
    createdAt: AT,
    activatedAt: AT,
    completedAt: null,
    completedRevision: null,
    ...overrides,
  }
}

function loop(id: string, overrides: Partial<LoopRecord> = {}): LoopRecord {
  return {
    ...envelope(id, 3),
    type: 'loop',
    goalId: 'g1',
    sessionId: 's1',
    target: 'score',
    measureCmd: 'npm run bench',
    direction: 'min',
    currentValue: 1,
    bestValue: 1,
    iteration: 2,
    maxIterations: 5,
    timeLimitSeconds: null,
    tokenLimit: null,
    tokensUsed: 0,
    status: 'running',
    pauseKind: null,
    stopReason: null,
    measureExitCode: 0,
    measureStderr: null,
    measuredAt: AT,
    history: [],
    startedAt: AT,
    updatedAt: AT,
    ...overrides,
  }
}

function audit(id: string, overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    ...envelope(id, 4),
    type: 'audit',
    goalId: 'g1',
    scope: 'session',
    auditSessionId: null,
    state: 'finished',
    skipReason: null,
    skippedBy: null,
    skippedAt: null,
    verdict: null,
    commitHash: null,
    worktreeState: null,
    criteriaResults: [],
    evidenceSummary: null,
    report: null,
    model: null,
    revision: 1,
    createdAt: AT,
    finishedAt: AT,
    durationMs: 1,
    ...overrides,
  }
}

function question(id: string, overrides: Partial<QuestionRecord> = {}): QuestionRecord {
  return {
    ...envelope(id, 5),
    type: 'question',
    sessionId: 's1',
    sequence: 1,
    questions: [],
    status: 'pending',
    answer: null,
    createdAt: AT,
    deliveredAt: null,
    answeredAt: null,
    answerAppliedAt: null,
    ...overrides,
  }
}

function harness(overrides: Partial<HarnessSnapshot> = {}): HarnessSnapshot {
  return {
    availability: 'ok',
    groupId: 'g1',
    schemaVersion: 1,
    goals: [],
    listItems: [],
    loops: [],
    audits: [],
    todos: [],
    questions: [],
    messages: [],
    commands: [],
    warnings: [],
    ...overrides,
  }
}

/** `kind:level:label` 로 접어 슬롯 4개를 한 번에 비교한다(순서도 함께 고정된다). */
function slotLabels(slots: readonly { kind: string; level: string; label: string }[]): string[] {
  return slots.map((slot) => `${slot.kind}:${slot.level}:${slot.label}`)
}

/* ── 외부 세션 판정(수용기준 11) ─────────────────────────────────── */

test('isExternalSession: 워크트리 경로와 같거나 그 하위인 cwd 는 내부로 본다', needsModule, () => {
  const { isExternalSession } = selectors()
  const worktrees = [worktree('wt-a', 'C:/groups/alpha/wt-a')]

  assert.equal(isExternalSession({ worktreeId: 'C:/groups/alpha/wt-a', isHub: false }, worktrees), false)
  // 구분자·대소문자·끝 구분자가 달라도 같은 경로다.
  assert.equal(
    isExternalSession({ worktreeId: 'c:\\Groups\\Alpha\\WT-A\\', isHub: false }, worktrees),
    false,
  )
  // 계약: 하위 폴더 cwd 도 그 워크트리 안이다.
  assert.equal(
    isExternalSession({ worktreeId: 'C:/groups/alpha/wt-a/packages/app', isHub: false }, worktrees),
    false,
  )
})

test('isExternalSession: 그룹 폴더 안이지만 워크트리 밖인 cwd 는 외부이고, 허브·미확인 cwd 는 외부로 단정하지 않는다', needsModule, () => {
  const { isExternalSession } = selectors()
  const worktrees = [worktree('wt-a', 'C:/groups/alpha/wt-a')]

  assert.equal(isExternalSession({ worktreeId: 'C:/groups/alpha', isHub: false }, worktrees), true)
  assert.equal(isExternalSession({ worktreeId: 'C:/elsewhere/repo', isHub: false }, worktrees), true)
  // 허브는 그룹 폴더에서 돌기 때문에 항상 내부다.
  assert.equal(isExternalSession({ worktreeId: 'C:/groups/alpha', isHub: true }, worktrees), false)
  // cwd 를 모르거나 워크트리 경로 목록을 모르면 판정하지 않는다.
  assert.equal(isExternalSession({ worktreeId: null, isHub: false }, worktrees), false)
  assert.equal(isExternalSession({ worktreeId: 'C:/elsewhere/repo', isHub: false }, []), false)
})

/* ── 그룹 집계(수용기준 33) ──────────────────────────────────────── */

test('groupAggregate: 세션 수·토큰 합계·문제 세션 수를 실제 레코드로 센다', needsModule, () => {
  const { groupAggregate } = selectors()
  // 허브에는 하위 Goal 이 없고, s1 의 Goal 은 중단 상태라 문제 세션 1건이다.
  const snapshot = harness({ goals: [goal('g1', { sessionId: 's1', status: 'aborted' })] })
  const sessions = [
    session('hub', { isHub: true, usage: usage(100, 50) }),
    session('s1', { usage: usage(200, 25) }),
  ]

  const aggregate = groupAggregate(snapshot, sessions)
  assert.equal(aggregate.sessionCount, 2)
  assert.equal(aggregate.tokens, 375)
  assert.equal(aggregate.problemCount, 1)
  // 허브 세션에는 기록이 없으므로 그룹 4슬롯은 모두 '없음' 이다.
  assert.deepEqual(slotLabels(aggregate.slots), [
    'goal:ok:없음',
    'list:ok:없음',
    'loop:ok:없음',
    'audit:ok:없음',
  ])
})

test('groupAggregate: 빈 입력은 0 이고 하네스가 없어도 세션 수·토큰은 센다', needsModule, () => {
  const { groupAggregate } = selectors()

  const empty = groupAggregate(null, [])
  assert.equal(empty.sessionCount, 0)
  assert.equal(empty.problemCount, 0)
  assert.equal(empty.tokens, 0)
  assert.deepEqual(slotLabels(empty.slots), [
    'goal:ok:없음',
    'list:ok:없음',
    'loop:ok:없음',
    'audit:ok:없음',
  ])

  const noHarness = groupAggregate(null, [session('a', { usage: usage(1000, 200) })])
  assert.equal(noHarness.sessionCount, 1)
  assert.equal(noHarness.tokens, 1200)
  assert.equal(noHarness.problemCount, 0)
})

/* ── 4슬롯 배지 판정(수용기준 13) ───────────────────────────────── */

test('sessionSlots: 대기 중 질문이 있으면 Goal 슬롯이 질문 대기(wait)로 강조된다', needsModule, () => {
  const { attentionRank, sessionSlots } = selectors()
  const waiting = harness({
    goals: [goal('g1', { status: 'active' })],
    questions: [question('q1')],
  })
  const waitingSlots = sessionSlots(waiting, 's1')
  assert.deepEqual(slotLabels(waitingSlots).slice(0, 1), ['goal:wait:질문 대기'])
  // 배지는 level !== 'ok' 일 때 강조된다.
  assert.ok(attentionRank(waitingSlots) > 0)

  const quiet = harness({ goals: [goal('g1', { status: 'active' })] })
  assert.deepEqual(slotLabels(sessionSlots(quiet, 's1')).slice(0, 1), ['goal:ok:진행'])
  assert.equal(attentionRank(sessionSlots(quiet, 's1')), 0)
})

test('sessionSlots: Goal·List·Loop·Audit 네 슬롯이 각자의 레코드에서 켜진다', needsModule, () => {
  const { sessionSlots } = selectors()
  const snapshot = harness({
    goals: [goal('g1', { status: 'complete' })],
    listItems: [listItem('i1')],
    loops: [loop('l1', { status: 'stopped', stopReason: 'max_iterations' })],
    audits: [audit('a1', { verdict: 'rejected' })],
  })

  assert.deepEqual(slotLabels(sessionSlots(snapshot, 's1')), [
    'goal:ok:완료',
    'list:ok:진행 1개',
    'loop:issue:상한 초과',
    'audit:issue:거부',
  ])
})
