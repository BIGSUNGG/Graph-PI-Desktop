/**
 * 감독 List 탭. 목업 `listTabHTML`(mock/index.html:1609-1628).
 * 항목 목록 + `settings.listFilter` 필터 칩. 저장 상태는 `queued`/`active` 뿐이고
 * 차단·완료는 계약 주석(`harness.ts` 의 `ListItemState`)과 SPEC-hub-orchestration §10.2 대로 하위 Goal 에서 파생한다.
 */
import type { ReactElement } from 'react';
import type {
  GoalRecord,
  GoalStatus,
  HarnessSnapshot,
  ListDisplayState,
  ListFilter,
  ListItemRecord,
} from '../../../shared/contract/index.ts';
import { clockOf, clipText } from '../board/layout.ts';

export type ListTabProps = {
  harness: HarnessSnapshot | null;
  /** 이미 스코프(허브 항목 / 세션 큐)로 걸러낸 항목. */
  items: readonly ListItemRecord[];
  /** 하위 Goal 해석용 그룹 전체 Goal. */
  goals: readonly GoalRecord[];
  isHub: boolean;
  filter: ListFilter;
  onFilterChange: (filter: ListFilter) => void;
};

const FILTERS: readonly { id: ListFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'queued', label: '대기' },
  { id: 'active', label: '진행' },
  { id: 'blocked', label: '차단' },
  { id: 'done', label: '완료' },
];

const DISPLAY_LABELS: Record<ListDisplayState, string> = {
  queued: '대기',
  active: '진행',
  blocked: '차단',
  complete: '완료',
};

const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: '진행 중',
  auditing: '감사 중',
  complete: '완료',
  paused: '일시정지',
  aborted: '중단',
};

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

/** 차단 사유. 계약에 `blockedBy` 필드가 없어 유효 하위 Goal 에서 파생한다. */
function blockedReason(item: ListItemRecord, goals: readonly GoalRecord[]): string | null {
  if (listDisplayState(item, goals) !== 'blocked') return null;
  const children = validChildGoals(item, goals);
  if (children.length === 0) return '배정된 하위 Goal 없음';
  const aborted = children.filter((goal) => goal.status === 'aborted').length;
  return `하위 Goal 중단 ${aborted}개`;
}

function matchesFilter(state: ListDisplayState, filter: ListFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'done') return state === 'complete';
  return state === filter;
}

function displayPillClass(state: ListDisplayState): string {
  if (state === 'complete') return 'done';
  if (state === 'blocked') return 'failed';
  if (state === 'active') return 'running';
  return 'idle';
}

export function ListTab(props: ListTabProps): ReactElement {
  const harness = props.harness;

  if (harness === null || harness.availability !== 'ok') {
    return (
      <div className="sup-empty">
        {harness !== null && harness.availability === 'version-mismatch'
          ? '하네스 스키마 버전이 맞지 않습니다. 패키지를 업데이트한 뒤 앱을 다시 열어 주세요.'
          : 'Pi 하네스 패키지가 없습니다. 패키지를 설치한 뒤 앱을 다시 열어 주세요.'}
        <br />
        List 기능이 비활성입니다.
      </div>
    );
  }

  const shown = props.items
    .filter((item) => matchesFilter(listDisplayState(item, props.goals), props.filter))
    .sort((left, right) => left.queueOrder - right.queueOrder);
  // 차단은 저장 상태가 아니라 하위 Goal 에서 파생한다(§10.2). 헤더에 개수를 먼저 보여준다.
  const blockedCount = props.items.filter(
    (item) => listDisplayState(item, props.goals) === 'blocked',
  ).length;

  const head = (
    <>
      <div className="sup-head">
        {props.isHub ? '허브 List · 항목' : '세션 List · Goal 큐'}
        <span className="n">
          {props.items.length}개
          {blockedCount === 0 ? '' : ` · 차단 ${String(blockedCount)}`}
        </span>
      </div>
      <div className="tabs" aria-label="List 필터">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            className={entry.id === props.filter ? 'tab is-active' : 'tab'}
            type="button"
            aria-pressed={entry.id === props.filter}
            onClick={() => {
              props.onFilterChange(entry.id);
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </>
  );

  if (shown.length === 0) {
    return (
      <>
        {head}
        <div className="sup-empty">
          {props.filter === 'all'
            ? '대기 중인 List 항목이 없습니다.'
            : '이 필터에 해당하는 항목이 없습니다.'}
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      {shown.map((item) => {
        const display = listDisplayState(item, props.goals);
        const children = validChildGoals(item, props.goals);
        const reason = blockedReason(item, props.goals);
        return (
          <div
            className={display === 'blocked' ? 'list-row blocked' : 'list-row'}
            key={item.id}
            data-list-item={item.id}
            data-display={display}
            data-attention={display === 'blocked' ? 'true' : 'false'}
          >
            <div className="l-top">
              <span className={`pill ${displayPillClass(display)}`}>
                <span className="d" />
                {DISPLAY_LABELS[display]}
              </span>
              <span className="g-obj">{item.title}</span>
            </div>
            <div className="l-meta">
              #{item.queueOrder} · {item.goalId === null ? '세션 Goal' : '부모 Goal'}
              {item.parentGoalId === null ? '' : ` · 부모 ${item.parentGoalId}`}
              {item.integrationNote === null ? '' : ` · ${item.integrationNote}`}
            </div>
            <div className="l-children">
              {item.childGoalsFrozen ? (
                <span className="l-child">
                  고정됨 · {item.childGoalsFrozenAt === null ? '시각 미상' : clockOf(item.childGoalsFrozenAt)}
                </span>
              ) : null}
              {reason === null ? null : <span className="l-child bad">{reason}</span>}
              {item.supersededGoalIds.length === 0 ? null : (
                <span className="l-child">대체 {item.supersededGoalIds.length}개</span>
              )}
              {children.map((child) => {
                const childClass =
                  child.status === 'complete'
                    ? 'l-child ok'
                    : child.status === 'aborted'
                      ? 'l-child bad'
                      : 'l-child';
                return (
                  <span key={child.id} className={childClass}>
                    {clipText(child.sessionId, 12)} · {GOAL_STATUS_LABELS[child.status]}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
