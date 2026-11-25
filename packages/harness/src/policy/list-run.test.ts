/**
 * List 런타임 테스트(수용기준 38-44): Goal 완료가 항목을 닫고 다음 항목을 배정하거나 사유를 남긴다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GoalRecord, ListItemRecord } from '../../../../src/shared/contract/index.ts';
import { advanceAfterGoal } from './list-run.ts';

const AT = '2026-11-25T00:00:00.000Z';

function item(patch: Partial<ListItemRecord> & { id: string; queueOrder: number }): ListItemRecord {
  return {
    type: 'list_item',
    groupId: 'g',
    seq: patch.queueOrder,
    at: AT,
    schemaVersion: 1,
    writer: 'hub',
    sessionId: 'hub',
    goalId: null,
    parentGoalId: null,
    title: `항목 ${patch.id}`,
    state: 'queued',
    childGoalIds: [],
    supersededGoalIds: [],
    childGoalsFrozen: false,
    childGoalsFrozenAt: null,
    integrationNote: null,
    createdAt: AT,
    activatedAt: null,
    completedAt: null,
    completedRevision: null,
    ...patch,
  };
}

function goal(patch: Partial<GoalRecord>): GoalRecord {
  return {
    type: 'goal',
    id: 'goal_1',
    groupId: 'g',
    seq: 1,
    at: AT,
    schemaVersion: 1,
    writer: 'hub',
    sessionId: 'hub',
    parentListItemId: null,
    parentGoalId: null,
    supersededByGoalId: null,
    objective: '목표',
    acceptanceCriteria: [],
    status: 'complete',
    pauseReason: null,
    auditAttemptCount: 1,
    revision: 1,
    loopId: null,
    latestAuditId: 'audit_1',
    createdAt: AT,
    updatedAt: AT,
    completedAt: AT,
    completedRevision: 1,
    archivedAt: null,
    ...patch,
  };
}

test('완료된 Goal 의 항목을 닫고 다음 항목을 활성화한다', () => {
  const first = item({ id: 'item_1', queueOrder: 1, state: 'active', goalId: 'goal_1', childGoalIds: ['goal_1'] });
  const second = item({ id: 'item_2', queueOrder: 2, childGoalIds: ['goal_2'] });
  const done = goal({ parentListItemId: 'item_1' });

  const advance = advanceAfterGoal({
    items: [first, second],
    goals: [done, goal({ id: 'goal_2', status: 'active', parentListItemId: 'item_2', completedAt: null })],
    goal: done,
    at: '2026-11-25T02:00:00.000Z',
  });

  assert.equal(advance.records.length, 2);
  const closed = advance.records[0];
  assert.ok(closed !== undefined);
  assert.equal(closed.id, 'item_1');
  assert.equal(closed.completedAt, '2026-11-25T02:00:00.000Z');
  assert.equal(closed.completedRevision, 1);
  const activated = advance.next;
  assert.ok(activated !== null);
  assert.equal(activated.id, 'item_2');
  assert.equal(activated.state, 'active');
  assert.equal(activated.activatedAt, '2026-11-25T02:00:00.000Z');
  assert.equal(advance.blocked, null);
});

test('중단된 하위 Goal 이 있으면 다음 항목을 활성화하지 않고 사유를 남긴다', () => {
  const first = item({ id: 'item_1', queueOrder: 1, state: 'active', goalId: 'goal_1', childGoalIds: ['goal_1'] });
  const second = item({ id: 'item_2', queueOrder: 2 });
  const done = goal({ parentListItemId: 'item_1' });
  const aborted = goal({ id: 'goal_aborted', status: 'aborted', parentListItemId: 'item_1', completedAt: null });

  const advance = advanceAfterGoal({ items: [first, second], goals: [done, aborted], goal: done, at: AT });

  assert.equal(advance.next, null);
  assert.ok(advance.blocked !== null);
  assert.equal(advance.blocked.itemId, 'item_2');
  assert.match(advance.blocked.reason, /중단/);
});

test('마지막 항목이면 활성화도 차단도 없다', () => {
  const only = item({ id: 'item_1', queueOrder: 1, state: 'active', goalId: 'goal_1', childGoalIds: ['goal_1'] });
  const done = goal({ parentListItemId: 'item_1' });

  const advance = advanceAfterGoal({ items: [only], goals: [done], goal: done, at: AT });

  assert.equal(advance.records.length, 1);
  assert.equal(advance.next, null);
  assert.equal(advance.blocked, null);
});

test('완료되지 않은 Goal·List 밖 Goal 은 아무것도 바꾸지 않는다', () => {
  const only = item({ id: 'item_1', queueOrder: 1, state: 'active', goalId: 'goal_1', childGoalIds: ['goal_1'] });
  const active = goal({ parentListItemId: 'item_1', status: 'active', completedAt: null });

  assert.deepEqual(advanceAfterGoal({ items: [only], goals: [active], goal: active, at: AT }), {
    records: [],
    next: null,
    blocked: null,
  });
  const standalone = goal({ id: 'goal_9', parentListItemId: null });
  assert.deepEqual(advanceAfterGoal({ items: [only], goals: [standalone], goal: standalone, at: AT }), {
    records: [],
    next: null,
    blocked: null,
  });
});
