/**
 * 인스펙터·보드·사이드바가 함께 쓰는 하네스 집계. 전부 순수 함수다(입력만 보고 새 값을 만든다).
 *
 * 문제 우선순위(수용기준 13): 차단 > 질문대기 > 거부 > 진행. 레벨 4종으로 표현한다.
 * - `block`: 차단(허브 List 차단·Goal 중단·의존성 대기)
 * - `wait`: 질문 대기
 * - `issue`: 거부·불가능·오류·상한 초과·미승인·일시정지
 * - `ok`: 진행·감사 중·완료·기록 없음
 *
 * 색은 여기서 정하지 않는다. 강조 색은 mock.css 토큰(`--red`/`--amber`/`--green`)만 쓴다.
 */
import type {
  AuditRecord,
  GoalRecord,
  HarnessSnapshot,
  ListItemRecord,
  LoopDirection,
  LoopRecord,
  LoopStatus,
  LoopStopReason,
  PiSession,
  QuestionRecord,
  TodoRecord,
  WorktreeView,
} from '../../../shared/contract/index.ts';
import type { AuditGateSummary, GateRow } from '../inspector/AuditTab.tsx';
// 목록 차단 판정은 List 탭과 같은 규칙을 써야 한다(규칙을 두 곳에 두지 않는다).
import { listDisplayState } from './list-state.ts';

export type SlotKind = 'goal' | 'list' | 'loop' | 'audit';

export type SlotLevel = 'ok' | 'wait' | 'issue' | 'block';

/** 배지 하나. `label` 은 배지 title·카드 강조에 그대로 쓰는 짧은 한국어다. */
export type SlotState = {
  kind: SlotKind;
  level: SlotLevel;
  label: string;
};

/** 그룹 인스펙터 상단 집계(수용기준 33). */
export type GroupAggregate = {
  sessionCount: number;
  problemCount: number;
  tokens: number;
  slots: SlotState[];
};

/** Goal 탭의 하위 Goal 요약(목업 `goalTabHTML` 의 `agg` 줄). */
export type ChildGoalSummary = {
  childGoals: number;
  approved: number;
  aborted: number;
  blockedItems: number;
};

/** Loop 탭 표 한 행(수용기준 56). */
export type LoopRow = {
  id: string;
  target: string;
  status: LoopStatus;
  statusLabel: string;
  current: string;
  best: string;
  direction: string;
  /** `2/5` 형태. */
  iteration: string;
  maxIterations: string;
  timeLimit: string;
  tokenLimit: string;
  tokensUsed: string;
  /** 종료 이유(정지·감사 대기·진행 중). */
  stopReason: string;
  /** 이 Loop 가 무엇으로 끝나는지. 측정 명령이 없으면 Audit 승인이 유일한 종료 조건이다. */
  endCondition: string;
  auditOnly: boolean;
  /** 상한이 남아 계속 돌 수 있는지(수용기준 52 의 "계속 진행 중" 섹션). */
  continues: boolean;
  measureCmd: string;
  measured: string;
  history: string;
  /** 측정 실행 실패 요약(없으면 null). */
  failure: string | null;
};

const LEVEL_RANK: Record<SlotLevel, number> = { ok: 0, issue: 1, wait: 2, block: 3 };

export const SLOT_KINDS: readonly SlotKind[] = ['goal', 'list', 'loop', 'audit'];

export const SLOT_KIND_LABELS: Record<SlotKind, string> = {
  goal: 'Goal',
  list: 'List',
  loop: 'Loop',
  audit: 'Audit',
};

export const LOOP_STATUS_LABELS: Record<LoopStatus, string> = {
  idle: '대기',
  running: '실행 중',
  waiting: '응답 대기',
  paused: '일시정지',
  done: '완료',
  stopped: '중단',
};

export const LOOP_STOP_LABELS: Record<LoopStopReason, string> = {
  metric_target: '측정 목표 달성',
  max_iterations: '최대 회차',
  time_limit: '시간 상한',
  token_limit: '토큰 상한',
  plateau: '정체',
  user: '사용자 중지',
  audit_approved: '감사 승인',
};

const DIRECTION_LABELS: Record<LoopDirection, string> = {
  min: '낮을수록 좋음',
  max: '높을수록 좋음',
};

/** 기록이 하나도 없는 슬롯 4종. 배지는 항상 그린다(수용기준 13). */
export function emptySlots(): SlotState[] {
  return SLOT_KINDS.map<SlotState>((kind) => ({ kind, level: 'ok', label: '없음' }));
}

function rankOf(level: SlotLevel): number {
  return LEVEL_RANK[level];
}

/** 슬롯 중 가장 심각한 문제 순위. 0 이면 문제 없음. */
export function attentionRank(slots: readonly SlotState[]): number {
  let rank = 0;
  for (const slot of slots) {
    const value = rankOf(slot.level);
    if (value > rank) rank = value;
  }
  return rank;
}

/** 가장 심각한 슬롯(카드 강조 문구용). 문제가 없으면 null. */
export function topAttention(slots: readonly SlotState[]): SlotState | null {
  let top: SlotState | null = null;
  for (const slot of slots) {
    if (slot.level === 'ok') continue;
    if (top === null || rankOf(slot.level) > rankOf(top.level)) top = slot;
  }
  return top;
}

export function latestGoalOf(goals: readonly GoalRecord[]): GoalRecord | null {
  const open = goals.find((goal) => goal.status === 'active' || goal.status === 'auditing');
  if (open !== undefined) return open;
  let latest: GoalRecord | null = null;
  for (const goal of goals) {
    if (latest === null || goal.updatedAt > latest.updatedAt) latest = goal;
  }
  return latest;
}

export function latestAuditOf(audits: readonly AuditRecord[]): AuditRecord | null {
  let latest: AuditRecord | null = null;
  for (const audit of audits) {
    if (latest === null || audit.createdAt > latest.createdAt) latest = audit;
  }
  return latest;
}

/** 세션의 pending 질문. `sessionId` 가 null 이면 그룹 전체(허브 인스펙터·집계용). */
export function pendingQuestionsOf(
  harness: HarnessSnapshot | null,
  sessionId: string | null,
): QuestionRecord[] {
  if (harness === null || harness.availability !== 'ok') return [];
  return harness.questions
    .filter(
      (question) =>
        question.status === 'pending' && (sessionId === null || question.sessionId === sessionId),
    )
    .sort((left, right) => left.sequence - right.sequence);
}

/** 그 Goal 의 감사 이력(최신순). */
export function auditsForGoal(harness: HarnessSnapshot | null, goalId: string): AuditRecord[] {
  if (harness === null || harness.availability !== 'ok') return [];
  return harness.audits
    .filter((audit) => audit.goalId === goalId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * 세션 인스펙터 Audit 탭의 감사 목록(최신순).
 * 자식 Goal 이 없으면 세션 Audit, 있으면 상위 세션 Audit 을 보여준다(수용기준 46·47).
 */
export function auditsForSession(
  harness: HarnessSnapshot | null,
  sessionId: string,
): AuditRecord[] {
  if (harness === null || harness.availability !== 'ok') return [];
  const goal = latestGoalOf(harness.goals.filter((entry) => entry.sessionId === sessionId));
  if (goal === null) return [];
  const hasChildren = childGoalsOf(harness, goal.id).length > 0;
  const scope = hasChildren ? 'parent' : 'session';
  return harness.audits
    .filter((audit) => audit.scope === scope && audit.goalId === goal.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/** 허브 인스펙터 Audit 탭: 그룹 Audit 레코드(최신순). */
export function auditsForGroup(
  harness: HarnessSnapshot | null,
  hubGoalId: string | null,
): AuditRecord[] {
  if (harness === null || harness.availability !== 'ok' || hubGoalId === null) return [];
  return harness.audits
    .filter((audit) => audit.scope === 'group' && audit.goalId === hubGoalId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * 직계 하위 Goal. 계약상 `parentGoalId` 로 바로 찾고, 없으면 허브 List 항목(`parentListItemId`)으로 보완한다.
 * (fixture 가 항목 ID 만 채우는 경우에도 수용기준 43 의 gate 가 비지 않게 한다.)
 */
export function childGoalsOf(harness: HarnessSnapshot | null, goalId: string | null): GoalRecord[] {
  if (harness === null || harness.availability !== 'ok' || goalId === null) return [];
  const direct = harness.goals.filter((goal) => goal.parentGoalId === goalId);
  if (direct.length > 0) return direct;
  const itemIds = new Set(
    harness.listItems
      .filter((item) => item.parentGoalId === goalId || item.goalId === goalId)
      .map((item) => item.id),
  );
  return harness.goals.filter(
    (goal) => goal.parentListItemId !== null && itemIds.has(goal.parentListItemId),
  );
}

/**
 * 감사 gate(하위 Goal 별 verdict). 허브는 그룹 Audit, 자식 있는 세션은 상위 세션 Audit 에 쓴다.
 * 자식 Goal 이 없으면 `total: 0` 요약을 돌려준다(`renderGate` 가 안내 문구를 그린다).
 * Goal 자체가 없으면 null(세션 Audit 에는 gate 가 없다).
 */
export function auditGate(
  harness: HarnessSnapshot | null,
  goalId: string | null,
  sessions: readonly PiSession[],
): AuditGateSummary | null {
  if (harness === null || harness.availability !== 'ok' || goalId === null) return null;
  const children = childGoalsOf(harness, goalId);
  const rows: GateRow[] = children.map((goal) => {
    const latest = latestAuditOf(harness.audits.filter((audit) => audit.goalId === goal.id));
    const settled =
      latest !== null && (latest.verdict === 'approved' || latest.state === 'skipped');
    const session = sessions.find((entry) => entry.id === goal.sessionId) ?? null;
    return {
      key: goal.id,
      label: session === null ? goal.sessionId : session.title,
      status: goal.status,
      verdict: latest === null ? null : latest.verdict,
      skipped: latest !== null && latest.state === 'skipped',
      ok: goal.status === 'complete' && settled,
    };
  });
  return {
    ok: rows.filter((row) => row.ok).length,
    total: rows.length,
    ready: rows.length > 0 && rows.every((row) => row.ok),
    rows,
  };
}

/** 하위 Goal 집계(Goal 탭 `agg` 줄·허브 요약). */
export function childGoalSummary(
  harness: HarnessSnapshot | null,
  goalId: string | null,
): ChildGoalSummary | null {
  if (harness === null || harness.availability !== 'ok' || goalId === null) return null;
  const children = childGoalsOf(harness, goalId);
  const blockedItems = harness.listItems.filter(
    (item) => listDisplayState(item, harness.goals) === 'blocked',
  ).length;
  return {
    childGoals: children.length,
    approved: children.filter((goal) => goal.status === 'complete').length,
    aborted: children.filter((goal) => goal.status === 'aborted').length,
    blockedItems,
  };
}

/**
 * TODO 스코프(수용기준 36).
 * 그룹 TODO 는 `sessionId` 필터 없이 항상 보이고, 세션 TODO 는 그 세션과 허브(그룹 전 세션)에서 보인다.
 */
export function todosFor(
  harness: HarnessSnapshot | null,
  scope: { sessionId: string | null; groupWide: boolean },
): TodoRecord[] {
  if (harness === null || harness.availability !== 'ok') return [];
  return harness.todos.filter((todo) => {
    if (todo.scope === 'group') return true;
    if (scope.groupWide) return true;
    return scope.sessionId !== null && todo.sessionId === scope.sessionId;
  });
}

function goalSlot(goal: GoalRecord | null, pendingQuestion: boolean): SlotState {
  if (pendingQuestion) return { kind: 'goal', level: 'wait', label: '질문 대기' };
  if (goal === null) return { kind: 'goal', level: 'ok', label: '없음' };
  switch (goal.status) {
    case 'complete':
      return { kind: 'goal', level: 'ok', label: '완료' };
    case 'active':
      return { kind: 'goal', level: 'ok', label: '진행' };
    case 'auditing':
      return { kind: 'goal', level: 'ok', label: '감사 중' };
    case 'aborted':
      return { kind: 'goal', level: 'block', label: '중단' };
    case 'paused':
      if (goal.pauseReason === 'question') {
        return { kind: 'goal', level: 'wait', label: '질문 대기' };
      }
      if (goal.pauseReason === 'blocked' || goal.pauseReason === 'dependency') {
        return { kind: 'goal', level: 'block', label: '차단' };
      }
      if (goal.pauseReason === 'loop_bounds') {
        return { kind: 'goal', level: 'issue', label: '상한 초과' };
      }
      if (goal.pauseReason === 'audit_error') {
        return { kind: 'goal', level: 'issue', label: '감사 오류' };
      }
      return { kind: 'goal', level: 'issue', label: '일시정지' };
  }
}

function listSlot(items: readonly ListItemRecord[], goals: readonly GoalRecord[]): SlotState {
  if (items.length === 0) return { kind: 'list', level: 'ok', label: '없음' };
  const states = items.map((item) => listDisplayState(item, goals));
  const blocked = states.filter((state) => state === 'blocked').length;
  if (blocked > 0) return { kind: 'list', level: 'block', label: `차단 ${blocked}개` };
  const active = states.filter((state) => state === 'active').length;
  if (active > 0) return { kind: 'list', level: 'ok', label: `진행 ${active}개` };
  const queued = states.filter((state) => state === 'queued').length;
  if (queued > 0) return { kind: 'list', level: 'ok', label: `대기 ${queued}개` };
  return { kind: 'list', level: 'ok', label: '완료' };
}

/** 종료 이유가 상한 때문인지(수용기준 13 의 상한 초과 표시). */
function boundsStopped(loop: LoopRecord): boolean {
  return (
    loop.stopReason === 'max_iterations' ||
    loop.stopReason === 'time_limit' ||
    loop.stopReason === 'token_limit'
  );
}

function loopSlot(loops: readonly LoopRecord[]): SlotState {
  if (loops.length === 0) return { kind: 'loop', level: 'ok', label: '없음' };
  const stopped = loops.find((loop) => loop.status === 'stopped');
  if (stopped !== undefined) {
    return {
      kind: 'loop',
      level: 'issue',
      label: boundsStopped(stopped) ? '상한 초과' : '정지',
    };
  }
  if (loops.some((loop) => loop.status === 'paused')) {
    return { kind: 'loop', level: 'issue', label: '일시정지' };
  }
  const running = loops.find((loop) => loop.status === 'running' || loop.status === 'waiting');
  if (running !== undefined) {
    return {
      kind: 'loop',
      level: 'ok',
      label: `${String(running.iteration)}/${String(running.maxIterations)} 회차`,
    };
  }
  if (loops.every((loop) => loop.status === 'done')) {
    return { kind: 'loop', level: 'ok', label: '완료' };
  }
  return { kind: 'loop', level: 'ok', label: '대기' };
}

function auditSlot(audits: readonly AuditRecord[], goal: GoalRecord | null): SlotState {
  const latest = latestAuditOf(audits);
  if (latest === null) {
    return goal !== null && goal.status === 'auditing'
      ? { kind: 'audit', level: 'issue', label: '미승인' }
      : { kind: 'audit', level: 'ok', label: '없음' };
  }
  if (latest.verdict === 'rejected') return { kind: 'audit', level: 'issue', label: '거부' };
  if (latest.verdict === 'impossible') return { kind: 'audit', level: 'issue', label: '불가능' };
  if (latest.verdict === 'error') return { kind: 'audit', level: 'issue', label: '감사 오류' };
  if (latest.state === 'skipped') return { kind: 'audit', level: 'ok', label: '생략' };
  if (latest.verdict === 'approved') return { kind: 'audit', level: 'ok', label: '승인' };
  return { kind: 'audit', level: 'issue', label: '미승인' };
}

/** 세션 4슬롯. 하네스가 없어도 '없음' 배지 4개를 돌려준다(항상 보인다). */
export function sessionSlots(harness: HarnessSnapshot | null, sessionId: string): SlotState[] {
  if (harness === null || harness.availability !== 'ok') return emptySlots();
  const goals = harness.goals.filter((goal) => goal.sessionId === sessionId);
  const goal = latestGoalOf(goals);
  const goalIds = goals.map((entry) => entry.id);
  const items = harness.listItems.filter(
    (item) =>
      item.sessionId === sessionId || (item.goalId !== null && goalIds.includes(item.goalId)),
  );
  const loops = harness.loops.filter(
    (loop) => loop.sessionId === sessionId || goalIds.includes(loop.goalId),
  );
  const audits = harness.audits.filter((audit) => goalIds.includes(audit.goalId));
  const pending = pendingQuestionsOf(harness, sessionId).length > 0;
  return [
    goalSlot(goal, pending),
    listSlot(items, harness.goals),
    loopSlot(loops),
    auditSlot(audits, goal),
  ];
}

/**
 * 그룹(허브) 4슬롯 + 하위 세션 집계.
 * `sessions` 는 그 그룹의 세션 목록이다(허브 세션 판별과 합산 토큰에 쓴다).
 */
export function groupAggregate(
  harness: HarnessSnapshot | null,
  sessions: readonly PiSession[],
): GroupAggregate {
  const tokens = sessions.reduce(
    (sum, session) => sum + session.usage.input + session.usage.output,
    0,
  );
  const hub = sessions.find((session) => session.isHub) ?? null;
  if (harness === null || harness.availability !== 'ok') {
    return { sessionCount: sessions.length, problemCount: 0, tokens, slots: emptySlots() };
  }

  const groupGoal = latestGoalOf(
    harness.goals.filter(
      (goal) => hub !== null && goal.sessionId === hub.id && goal.parentListItemId === null,
    ),
  );
  // 허브 List 항목은 허브 Goal(`parentGoalId`) 이 소유한다. 계약·하네스 따라 허브 세션 소유 항목도 포함한다.
  const hubItems = harness.listItems.filter(
    (item) =>
      (groupGoal !== null && item.parentGoalId === groupGoal.id) ||
      (hub !== null && item.sessionId === hub.id),
  );
  const groupLoops = harness.loops;
  const groupAudits =
    groupGoal === null
      ? []
      : harness.audits.filter(
          (audit) => audit.scope === 'group' && audit.goalId === groupGoal.id,
        );

  const slots: SlotState[] = [
    goalSlot(groupGoal, hub !== null && pendingQuestionsOf(harness, hub.id).length > 0),
    listSlot(hubItems, harness.goals),
    loopSlot(groupLoops),
    auditSlot(groupAudits, groupGoal),
  ];

  let problemCount = 0;
  for (const session of sessions) {
    if (attentionRank(sessionSlots(harness, session.id)) > 0) problemCount += 1;
  }
  return { sessionCount: sessions.length, problemCount, tokens, slots };
}

function valueText(value: number | null): string {
  return value === null ? '—' : String(value);
}

function clockText(iso: string | null): string {
  if (iso === null) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function stderrSummary(stderr: string | null): string {
  if (stderr === null) return '';
  const line = stderr.trim().split('\n')[0] ?? '';
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/** Loop 가 상한을 아직 쓰지 않았는지. 시간 상한은 상태로만 판정한다(측정 시각 의존 금지). */
function hasBudget(loop: LoopRecord): boolean {
  if (loop.status === 'stopped' || loop.status === 'done') return false;
  if (loop.stopReason === 'time_limit') return false;
  if (loop.iteration >= loop.maxIterations) return false;
  if (loop.tokenLimit !== null && loop.tokensUsed >= loop.tokenLimit) return false;
  return true;
}

function stopReasonText(loop: LoopRecord): string {
  if (loop.stopReason !== null) return LOOP_STOP_LABELS[loop.stopReason];
  if (loop.status === 'paused' && loop.pauseKind === 'audit') return '감사 대기';
  if (loop.status === 'paused' && loop.pauseKind === 'error') return '감사 오류 · 재감사 대기';
  if (loop.status === 'paused' && loop.pauseKind === 'bounds') return '상한 도달 · 범위 조정 대기';
  if (loop.status === 'paused') return '일시정지';
  if (loop.status === 'running' || loop.status === 'waiting') return '진행 중';
  if (loop.status === 'done') return '감사 승인';
  return '대기';
}

function toLoopRow(loop: LoopRecord): LoopRow {
  const auditOnly = loop.measureCmd === '';
  const failed = loop.measureExitCode !== null && loop.measureExitCode !== 0;
  const stderr = stderrSummary(loop.measureStderr);
  return {
    id: loop.id,
    target: loop.target === '' ? '측정값 없음' : loop.target,
    status: loop.status,
    statusLabel: LOOP_STATUS_LABELS[loop.status],
    current: valueText(loop.currentValue),
    best: valueText(loop.bestValue),
    direction: DIRECTION_LABELS[loop.direction],
    iteration: `${String(loop.iteration)}/${String(loop.maxIterations)}`,
    maxIterations: `${String(loop.maxIterations)}회`,
    timeLimit: loop.timeLimitSeconds === null ? '—' : `${String(loop.timeLimitSeconds)}초`,
    tokenLimit: loop.tokenLimit === null ? '—' : `${String(Math.round(loop.tokenLimit / 1000))}k`,
    tokensUsed: `${String(Math.round(loop.tokensUsed / 1000))}k`,
    stopReason: stopReasonText(loop),
    endCondition: auditOnly ? 'Audit 승인이 종료 조건' : '측정 목표 달성 시 감사 대기',
    auditOnly,
    continues: hasBudget(loop),
    measureCmd: loop.measureCmd === '' ? 'measureCmd 없음' : loop.measureCmd,
    measured: clockText(loop.measuredAt),
    history: loop.history
      .map((entry) => `#${String(entry.iteration)} ${valueText(entry.value)} · ${clockText(entry.at)}`)
      .join('  '),
    failure: failed
      ? `측정 실패 · exit ${String(loop.measureExitCode)}${stderr === '' ? ' · stderr 없음' : ` · ${stderr}`}`
      : null,
  };
}

/** Loop 탭 표 행. `scoped` 를 주면 그 목록만, 없으면 그룹 전체를 만든다. */
export function loopRows(
  harness: HarnessSnapshot | null,
  scoped?: readonly LoopRecord[],
): LoopRow[] {
  const source =
    scoped ?? (harness === null || harness.availability !== 'ok' ? [] : harness.loops);
  return source.map(toLoopRow);
}

/* ------------------------------------------------------------------ *
 * 외부 세션 판정(수용기준 11)
 * ------------------------------------------------------------------ */

/**
 * 그룹이 관리하는 워크트리 경로. 그룹 JSON 의 `GroupRecord.worktreePaths` 와 같은 모양
 * (`워크트리 id → 절대 경로`)이다. 호출부는 `groupWorktreePaths` 로 그룹 뷰 값과 Orca 스냅샷 값을
 * 합쳐 넘긴다.
 */
export type WorktreePathScope = {
  worktreePaths?: Record<string, string> | null;
};

/**
 * 경로 비교 키. 구분자(`\`↔`/`)·중복 구분자·끝 구분자·대소문자를 무시한다.
 * Windows(`C:\a\b`)와 macOS/Linux(`/a/b`) 표기가 섞여도 같은 경로로 본다.
 */
function pathKey(path: string): string {
  const slashed = path.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const trimmed = slashed.length > 1 ? slashed.replace(/\/+$/, '') : slashed;
  return trimmed.toLowerCase();
}

/** 렌더러 Orca 스냅샷의 워크트리 목록 → `worktreePaths` 모양(경로가 없는 워크트리는 뺀다). */
export function worktreePathMap(worktrees: readonly WorktreeView[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const worktree of worktrees) {
    if (worktree.path !== null && worktree.path !== '') map[worktree.id] = worktree.path;
  }
  return map;
}

/**
 * Orca 가 관리하지 않는 경로의 세션인지(수용기준 11).
 *
 * `PiSession.worktreeId` 는 세션 JSONL 헤더의 cwd 다. 그룹 워크트리 경로 목록에 없는 cwd 에서
 * 만들어진 세션은 Orca 밖에서 시작된 외부 세션이다.
 * - 그룹 허브 세션(`isHub`)은 그룹 폴더에서 돌기 때문에 항상 내부다(false).
 * - cwd 를 모르면(`null`/빈 문자열) 판정하지 않는다(false).
 * - 경로 목록을 하나도 모르면 판정하지 않는다(false). 모르는 세션을 외부로 단정해 제어를 잠그지 않는다.
 */
export function isExternalSession(
  session: Pick<PiSession, 'worktreeId' | 'isHub'>,
  worktrees: readonly WorktreeView[],
): boolean {
  if (session.isHub) return false;
  const cwd = session.worktreeId;
  if (cwd === null || cwd.trim() === '') return false;
  const paths: Record<string, string> = worktreePathMap(worktrees);
  const known = Object.entries(paths);
  if (known.length === 0) return false;
  const target = pathKey(cwd);
  for (const [id, path] of known) {
    // 워크트리 id 가 그대로 들어온 경우도 내부로 본다(계약은 cwd 지만 fixture 방어).
    if (pathKey(id) === target) return false;
    const base = pathKey(path);
    // 워크트리 하위 폴더에서 시작한 세션도 그 워크트리 안이다.
    if (base === target || target.startsWith(`${base}/`)) return false;
  }
  return true;
}
