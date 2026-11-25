/**
 * List 런타임(수용기준 38-44, SPEC-hub-orchestration §10.2).
 *
 * Goal 이 승인되어 완료되면 그 Goal 이 속한 List 항목을 완료로 닫고, 대기 중인 다음 항목을
 * 배정 가능할 때만 활성화한다. 배정할 수 없으면 이유를 남긴다 — 화면은 이 레코드만 읽는다.
 */
import type { GoalRecord, ListItemRecord } from '../../../../src/shared/contract/index.ts';
import { nextAssignableItem, shouldAutoStop } from './list-policy.ts';

export type ListAdvance = {
  /** 덧붙일 항목 레코드(완료 1건 + 활성 1건). */
  records: ListItemRecord[];
  next: ListItemRecord | null;
  /** 다음 항목이 있는데 배정할 수 없을 때의 사유. */
  blocked: { itemId: string; reason: string } | null;
};

/**
 * `at` 은 테스트에서 고정한다. Goal 은 이미 완료 상태여야 의미가 있으며, 그 외에는 아무것도 하지 않는다.
 */
export function advanceAfterGoal(input: {
  items: readonly ListItemRecord[];
  goals: readonly GoalRecord[];
  goal: GoalRecord;
  at: string;
}): ListAdvance {
  const empty: ListAdvance = { records: [], next: null, blocked: null };
  if (input.goal.status !== 'complete') return empty;

  const item = input.items.find(
    (candidate) => candidate.id === input.goal.parentListItemId || candidate.goalId === input.goal.id,
  );
  if (item === undefined) return empty;

  const closed: ListItemRecord = {
    ...item,
    seq: item.seq + 1,
    at: input.at,
    // 저장 상태는 queued·active 뿐이다 — 완료는 completedAt 으로 파생한다(list-policy 머리말과 같다).
    completedAt: input.at,
    completedRevision: input.goal.completedRevision ?? input.goal.revision,
  };

  const remaining = input.items.filter((candidate) => candidate.id !== item.id);
  const candidate = nextAssignableItem(remaining);

  if (candidate === null) {
    return { records: [closed], next: null, blocked: null };
  }

  // 활성화 중단 사유는 완료 게이트가 아니라 자동 진행 정지 규칙에서 온다(§10.2, §42).
  const stop = shouldAutoStop(input.goals);
  if (stop.stop) {
    return {
      records: [closed],
      next: null,
      blocked: { itemId: candidate.id, reason: stop.reason },
    };
  }

  const activated: ListItemRecord = {
    ...candidate,
    seq: Math.max(candidate.seq, closed.seq) + 1,
    at: input.at,
    state: 'active',
    activatedAt: input.at,
  };
  return { records: [closed, activated], next: activated, blocked: null };
}
