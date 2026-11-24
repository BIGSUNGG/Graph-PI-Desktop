/**
 * 허브 List 전이(§10.2). 표시 상태는 저장하지 않고 파생한다 — 저장 상태는 `queued`·`active` 뿐이다.
 */
import type {
  GoalRecord,
  ListDisplayState,
  ListItemRecord,
} from '../../../../src/shared/contract/harness.ts';
import type { EnvelopeInput } from '../envelope.ts';
import type { RecordPayload } from '../records.ts';
import { listItemRecord } from '../records.ts';
import type { TransitionResult } from './goal.ts';

export type ListItemResult = TransitionResult<ListItemRecord>;

/** 새 항목 입력. 허브 항목은 `parentGoalId`, 세션 큐 항목은 `sessionId` 로 소유를 표시한다(§10.2). */
export type AddListItemInput = {
  title: string;
  note?: string;
  order?: number;
} & EnvelopeInput & {
  sessionId?: string;
  goalId?: string | null;
  parentGoalId?: string | null;
};

export function addListItem(input: AddListItemInput): ListItemResult {
  const title = input.title.trim();
  // 제목 없는 항목은 보드·인스펙터에서 무엇을 배정할지 읽을 수 없다.
  if (title.length === 0) {
    return { ok: false, error: 'List 항목 제목이 비어 있습니다.' };
  }

  const at = input.at ?? new Date().toISOString();
  // 계약 ListItemRecord 에 note 필드가 없어 저장하지 않는다.
  void input.note;

  const payload: RecordPayload<ListItemRecord> = {
    sessionId: input.sessionId ?? input.writer,
    goalId: input.goalId ?? null,
    parentGoalId: input.parentGoalId ?? null,
    title,
    state: 'queued',
    queueOrder: input.order ?? 0,
    childGoalIds: [],
    supersededGoalIds: [],
    childGoalsFrozen: false,
    childGoalsFrozenAt: null,
    integrationNote: null,
    createdAt: at,
    activatedAt: null,
    completedAt: null,
    completedRevision: null,
  };

  return {
    ok: true,
    record: listItemRecord(payload, {
      id: input.id,
      groupId: input.groupId,
      seq: input.seq,
      writer: input.writer,
      at,
    }),
  };
}

export function startListItem(item: ListItemRecord): ListItemResult {
  if (item.completedAt !== null) {
    return { ok: false, error: '이미 완료된 항목입니다.' };
  }
  if (item.state !== 'queued') {
    return { ok: false, error: '대기 중인 항목만 시작할 수 있습니다.' };
  }

  return {
    ok: true,
    record: { ...item, state: 'active', activatedAt: new Date().toISOString() },
  };
}

/** 계약 ListItemState 에 완료 값이 없어 완료는 `completedAt` 으로 남기고 표시는 파생한다(§10.2). */
export function completeListItem(item: ListItemRecord): ListItemResult {
  if (item.completedAt !== null) {
    return { ok: false, error: '이미 완료된 항목입니다.' };
  }
  if (item.state !== 'active') {
    return { ok: false, error: '진행 중인 항목만 완료할 수 있습니다.' };
  }

  return { ok: true, record: { ...item, completedAt: new Date().toISOString() } };
}

/** 배정이 끝난 시점의 하위 Goal 집합으로 완료를 판정하려고 모든 항목을 고정한다(§10.2). */
export function freezeListChildGoals(items: ListItemRecord[], at: string): ListItemRecord[] {
  return items.map((item) => ({ ...item, childGoalsFrozen: true, childGoalsFrozenAt: at }));
}

/** 대체(`supersededGoalIds`)되었거나 없는 하위 Goal 은 유효 집합에서 뺀다(§10.2). */
function validChildGoals(
  item: ListItemRecord,
  byId: ReadonlyMap<string, GoalRecord>,
): GoalRecord[] {
  const superseded = new Set(item.supersededGoalIds);
  const children: GoalRecord[] = [];

  for (const id of item.childGoalIds) {
    if (superseded.has(id)) continue;
    const goal = byId.get(id);
    if (goal !== undefined) children.push(goal);
  }

  return children;
}

function displayStateOf(
  item: ListItemRecord,
  byId: ReadonlyMap<string, GoalRecord>,
): ListDisplayState {
  if (item.completedAt !== null) return 'complete';

  // 고정 뒤에만 배정 결과로 차단·완료를 판정한다(고정 전에는 저장 상태 그대로).
  if (item.childGoalsFrozen) {
    const children = validChildGoals(item, byId);
    if (children.length === 0) return 'blocked';
    if (children.some((goal) => goal.status === 'aborted')) return 'blocked';
  }

  return item.state;
}

/** 파생 표시 상태. 앱의 `src/renderer/src/inspector/ListTab.tsx` 규칙과 같은 값을 내야 한다. */
export function listDisplayState(
  items: ListItemRecord[],
  goals: GoalRecord[],
): ListDisplayState[] {
  const byId = new Map<string, GoalRecord>();
  for (const goal of goals) byId.set(goal.id, goal);

  return items.map((item) => displayStateOf(item, byId));
}
