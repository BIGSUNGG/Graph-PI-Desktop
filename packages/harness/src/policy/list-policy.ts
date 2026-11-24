/**
 * 허브 List 배정·차단 판정 정책(§10.2). 표시 상태는 저장하지 않고 여기서 파생한다.
 * 저장 상태는 `queued`·`active` 뿐이라 차단·완료는 유효 하위 Goal 에서 계산한다.
 */
import type {
  GoalRecord,
  ListDisplayState,
  ListItemRecord,
} from '../../../../src/shared/contract/harness.ts';
import { isGoalSuperseded } from './goal-policy.ts';

/**
 * 배정이 끝난 시점의 하위 Goal 집합으로 고정한다(§10.2, §40).
 * 고정 뒤의 배정은 무시한다 — 집합이 늘면 완료 판정 근거가 바뀌기 때문이다.
 */
export function freezeChildGoals(
  item: ListItemRecord,
  goalIds: readonly string[],
  at: string,
): ListItemRecord {
  if (item.childGoalsFrozen) return item;

  const ids: string[] = [];
  for (const id of goalIds) {
    if (id.length === 0) continue;
    if (ids.includes(id)) continue;
    ids.push(id);
  }

  return { ...item, childGoalIds: ids, childGoalsFrozen: true, childGoalsFrozenAt: at };
}

/** 다음에 배정할 항목 — 고정·완료되지 않은 첫 대기 항목(§10.2). */
export function nextAssignableItem(items: readonly ListItemRecord[]): ListItemRecord | null {
  const ordered = [...items].sort((a, b) => a.queueOrder - b.queueOrder || a.seq - b.seq);

  for (const item of ordered) {
    if (item.completedAt !== null) continue;
    if (item.childGoalsFrozen) continue;
    if (item.state !== 'queued') continue;
    return item;
  }

  return null;
}

/** 대체(`supersededGoalIds`)·재대체된 Goal 은 유효 집합에서 뺀다(§10.2). */
function validChildGoals(item: ListItemRecord, goals: readonly GoalRecord[]): GoalRecord[] {
  const superseded = new Set(item.supersededGoalIds);
  const byId = new Map<string, GoalRecord>();
  for (const goal of goals) byId.set(goal.id, goal);

  const children: GoalRecord[] = [];
  for (const id of item.childGoalIds) {
    if (superseded.has(id)) continue;
    const goal = byId.get(id);
    if (goal === undefined) continue;
    if (isGoalSuperseded(goal, goals)) continue;
    children.push(goal);
  }

  return children;
}

/**
 * 항목의 표시 상태와 사유(§10.2, §39, §41). 하위 Goal 이 없으면 완료될 수 없어 차단이다.
 * 저장된 `completedAt` 이 있으면 완료 뒤 변경으로 되돌리지 않는다.
 */
export function itemGate(
  item: ListItemRecord,
  goals: readonly GoalRecord[],
): { status: ListDisplayState; reason: string } {
  const children = validChildGoals(item, goals);

  if (children.length === 0) return { status: 'blocked', reason: '하위 Goal 없음' };
  if (item.completedAt !== null) {
    return { status: 'complete', reason: '허브 통합 기록이 남아 완료된 항목입니다.' };
  }

  const aborted = children.filter((goal) => goal.status === 'aborted');
  if (aborted.length > 0) {
    return {
      status: 'blocked',
      reason: `중단된 하위 Goal ${aborted.length}개가 있어 차단되었습니다. 재시도·재배정이 필요합니다.`,
    };
  }

  const unapproved = children.filter((goal) => goal.status !== 'complete');
  if (unapproved.length > 0) {
    return {
      status: 'blocked',
      reason: `유효 하위 Goal ${unapproved.length}개가 승인되지 않아 완료할 수 없습니다.`,
    };
  }

  return { status: 'complete', reason: '유효 하위 Goal 이 모두 승인되었습니다.' };
}

/** 세션 List 자동 진행 정지 — 대체되지 않은 `aborted` 가 있으면 멈춘다(§10.2, §42). */
export function shouldAutoStop(goals: readonly GoalRecord[]): { stop: boolean; reason: string } {
  const aborted = goals.filter(
    (goal) => goal.status === 'aborted' && !isGoalSuperseded(goal, goals),
  );

  if (aborted.length === 0) {
    return { stop: false, reason: '중단된 하위 Goal 이 없어 다음 항목을 진행합니다.' };
  }

  return {
    stop: true,
    reason: `중단된 하위 Goal ${aborted.length}개가 있어 자동 진행을 멈춥니다. 재시도·다음 항목 선택이 필요합니다.`,
  };
}
