/**
 * List 항목의 파생 표시 상태. 저장 상태는 `queued`/`active` 뿐이고 차단·완료는 하위 Goal 에서 파생한다
 * (SPEC-hub-orchestration §10.2). 순수 함수라 JSX 모듈과 분리해 둔다 — 렌더러 셀렉터 테스트가
 * `node --test` 에서 그대로 로드되게 하기 위함이다.
 */
import type { GoalRecord, ListDisplayState, ListItemRecord } from '../../../shared/contract/index.ts';

/** 대체(`supersededGoalIds`)되지 않은 유효 하위 Goal 만 남긴다(§10.2). */
export function validChildGoals(
  item: ListItemRecord,
  goals: readonly GoalRecord[],
): GoalRecord[] {
  const superseded = new Set(item.supersededGoalIds);
  const children: GoalRecord[] = [];
  for (const id of item.childGoalIds) {
    if (superseded.has(id)) continue;
    const goal = goals.find((entry) => entry.id === id) ?? null;
    if (goal !== null) children.push(goal);
  }
  return children;
}

/** 항목 표시 상태(파생, 저장하지 않음). */
export function listDisplayState(
  item: ListItemRecord,
  goals: readonly GoalRecord[],
): ListDisplayState {
  if (item.completedAt !== null) return 'complete';
  if (item.childGoalsFrozen) {
    const children = validChildGoals(item, goals);
    if (children.length === 0) return 'blocked';
    if (children.some((goal) => goal.status === 'aborted')) return 'blocked';
  }
  return item.state;
}
