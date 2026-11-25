/**
 * 오른쪽 인스펙터 패널. 목업(mock/index.html:1540-1805)의 4탭 구조를 그대로 옮기고,
 * 탭 본문은 inspector/* 컴포넌트에 맡긴다. 이 파일은 "무엇을 어떤 스코프로 보여줄지"만 정한다.
 *
 * 배치: 목업처럼 보드 그리드의 오른쪽 열(`.board` 2열, mock.css:145)이다. 상단에 탭(`.sup-tabs`),
 * 선택이 없으면 목업 문구(`.empty`)만 보여준다.
 *
 * 수용기준 33: 그룹(허브) 선택 = 허브 4탭 + 하위 세션 집계(세션 수·문제 세션 수·합산 토큰).
 *               세션 선택 = 그 세션 4탭만.
 * 수용기준 22: pending 질문은 인스펙터 카드·채팅 인라인·보드 카드·사이드바 네 곳에 동시에 보인다.
 */
import type { ReactElement } from 'react';
import type {
  AuditScope,
  GoalRecord,
  HarnessSnapshot,
  InspectorTab,
  ListItemRecord,
  LoopRecord,
  PiSession,
} from '../../../shared/contract/index.ts';
import { QuestionCards } from '../chat/QuestionCards.tsx';
import { TodoBlock } from '../inspector/TodoBlock.tsx';
import { AuditTab } from '../inspector/AuditTab.tsx';
import { GoalTab } from '../inspector/GoalTab.tsx';
import { ListTab } from '../inspector/ListTab.tsx';
import { LoopTab } from '../inspector/LoopTab.tsx';
import { sessionSlotKinds, useApp, useDispatch, useSelectedGroup, useSessions } from '../state/hooks.ts';
import {
  auditGate,
  auditsForGroup,
  auditsForSession,
  childGoalSummary,
  childGoalsOf,
  groupAggregate,
  latestAuditOf,
  sessionSlots,
} from '../state/selectors.ts';
import { SlotBadges } from '../state/slot-badges.tsx';

const TAB_LABEL: Record<InspectorTab, string> = { goal: 'Goal', list: 'List', loop: 'Loop', audit: 'Audit' };
const TAB_ORDER: readonly InspectorTab[] = ['goal', 'list', 'loop', 'audit'];

export function InspectorView(): ReactElement {
  const { settings, harness, selection } = useApp();
  const actions = useDispatch();
  const group = useSelectedGroup();
  const sessions = useSessions(group?.id ?? null);

  const selectedSessionId = selection.kind === 'session' ? selection.sessionId : null;
  // 세션을 고르면 그 세션 스코프, 아니면 그룹(허브) 스코프.
  const isHub = selectedSessionId === null;
  const hubSession = sessions.find((session) => session.isHub) ?? null;
  // 그룹 스코프에서도 질문·슬롯은 허브 세션 것을 쓴다(목업 `supervisionHTML` 과 같다).
  const scopedSessionId = isHub ? (hubSession === null ? null : hubSession.id) : selectedSessionId;
  const session =
    selectedSessionId === null
      ? null
      : (sessions.find((item) => item.id === selectedSessionId) ?? null);

  const goals = harness?.goals ?? [];
  const goal = pickGoal({ goals, sessionId: selectedSessionId, hubSessionId: scopedSessionId, isHub });
  const latestAudit =
    goal === null || harness === null ? null : latestAuditOf(harness.audits.filter((audit) => audit.goalId === goal.id));
  const items = pickItems({ harness, goal, sessionId: selectedSessionId, hubSessionId: scopedSessionId, isHub });
  const loops = pickLoops({ harness, goal, sessionId: selectedSessionId, isHub });
  const hasChildGoals = childGoalsOf(harness, goal === null ? null : goal.id).length > 0;
  const auditScope: AuditScope = isHub ? 'group' : hasChildGoals ? 'parent' : 'session';
  const audits = isHub
    ? auditsForGroup(harness, goal === null ? null : goal.id)
    : selectedSessionId === null
      ? []
      : auditsForSession(harness, selectedSessionId);
  const gate = isHub || hasChildGoals ? auditGate(harness, goal === null ? null : goal.id, sessions) : null;
  const aggregate = isHub ? groupAggregate(harness, sessions) : null;
  const slots = scopedSessionId === null ? [] : sessionSlots(harness, scopedSessionId);
  const slotKinds = slotKindsFor({ harness, isHub, hubSession, session });
  const parentItem =
    goal === null || goal.parentListItemId === null
      ? null
      : (items.find((item) => item.id === goal.parentListItemId) ??
        (harness?.listItems.find((item) => item.id === goal.parentListItemId) ?? null));
  const auditRejected =
    latestAudit !== null &&
    (latestAudit.verdict === 'rejected' ||
      latestAudit.verdict === 'impossible' ||
      latestAudit.verdict === 'error');

  // 목업 인스펙터는 세션/워크트리 선택이 없으면 안내 문구만 그린다(mock/index.html:1789).
  // 탭은 e2e 계약(e2e/flows.spec.ts:85 `.insp-tabs` 가시성) 때문에 항상 그리고,
  // 선택할 대상이 없을 때만 목업 문구로 비운다.
  const empty = group === null && selectedSessionId === null
  // 하네스 상태 파일이 없거나 버전이 다르면 4탭은 데이터가 아니라 안내만 그린다(수용기준 4).
  const harnessMissing = harness !== null && harness.availability !== 'ok';
  const title = isHub ? (group === null ? '선택 없음' : group.name) : (session?.title ?? '세션');
  const counts: Record<InspectorTab, number> = {
    goal: goal === null ? 0 : 1,
    list: items.length,
    loop: loops.length,
    audit: audits.length,
  };

  return (
    <aside className="inspector" aria-label="인스펙터" data-inspector-scope={isHub ? 'group' : 'session'}>
      <div className="insp-head">
        <h2>{title}</h2>
        <span className="pill">{isHub ? '허브' : '세션'}</span>
        {slots.length === 0 ? null : <SlotBadges slots={slots} kinds={slotKinds} />}
      </div>
      <p className="sub">
        {aggregate === null ? (
          session === null ? (
            <span>{group === null ? '그룹 없음' : '그룹 스코프'}</span>
          ) : (
            <span title={session.filePath ?? undefined}>
              {session.title} · {session.model ?? '모델 미상'} · {formatTokens(session.usage)}
            </span>
          )
        ) : (
          <span data-group-aggregate="true">
            세션 {aggregate.sessionCount} · 문제 {aggregate.problemCount} · 합산{' '}
            {formatTokenTotal(aggregate.tokens)}
          </span>
        )}
      </p>
      <div className="sup-tabs insp-tabs" role="tablist" aria-label="인스펙터 탭">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={settings.inspectorTab === tab}
            className={settings.inspectorTab === tab ? 'sup-tab is-active' : 'sup-tab'}
            aria-disabled={harnessMissing}
            onClick={() => {
              actions.setInspectorTab(tab);
            }}
          >
            {TAB_LABEL[tab]}
            <span className="cnt">{counts[tab]}</span>
          </button>
        ))}
      </div>

      {harnessMissing ? (
        <p className="empty">하네스 상태가 없어 Goal·List·Loop·Audit 을 표시할 수 없습니다.</p>
      ) : empty ? (
        <p className="empty">노드를 선택하면 세션 상세가 보입니다.</p>
      ) : (
        <div className="sup-panel insp-body">
        {scopedSessionId === null ? null : (
          <QuestionCards sessionId={scopedSessionId} variant="panel" />
        )}
        {settings.inspectorTab === 'goal' ? (
          <GoalTab
            harness={harness}
            goal={goal}
            latestAudit={latestAudit}
            isHub={isHub}
            aggregate={childGoalSummary(harness, goal === null ? null : goal.id)}
            gateRows={gate === null ? [] : gate.rows}
            parentItem={parentItem}
            loopSummary={loopSummaryOf(loops)}
          />
        ) : null}
        {settings.inspectorTab === 'list' ? (
          <ListTab
            harness={harness}
            items={items}
            goals={goals}
            isHub={isHub}
            filter={settings.listFilter}
            onFilterChange={(filter) => {
              actions.setListFilter(filter);
            }}
          />
        ) : null}
        {settings.inspectorTab === 'loop' ? (
          <LoopTab harness={harness} loops={loops} auditRejected={auditRejected} />
        ) : null}
        {settings.inspectorTab === 'audit' ? (
          <AuditTab harness={harness} audits={audits} scope={auditScope} gate={gate} />
        ) : null}
        <TodoBlock harness={harness} sessionId={selectedSessionId} groupWide={isHub} />
        </div>
      )}
    </aside>
  );
}

/** 배지 색(5색)은 기존 파생(`sessionSlotKinds`)을 그대로 쓴다 — 사용처를 깨지 않는다. */
function slotKindsFor(input: {
  harness: HarnessSnapshot | null;
  isHub: boolean;
  hubSession: PiSession | null;
  session: PiSession | null;
}): ReturnType<typeof sessionSlotKinds> {
  if (input.isHub) {
    return input.hubSession === null ? null : sessionSlotKinds(input.hubSession, input.harness);
  }
  return input.session === null ? null : sessionSlotKinds(input.session, input.harness);
}

function pickGoal(input: {
  goals: readonly GoalRecord[];
  sessionId: string | null;
  hubSessionId: string | null;
  isHub: boolean;
}): GoalRecord | null {
  const strict = input.isHub
    ? input.goals.filter(
        (goal) =>
          goal.parentListItemId === null &&
          input.hubSessionId !== null &&
          goal.sessionId === input.hubSessionId,
      )
    : input.goals.filter((goal) => goal.sessionId === input.sessionId);
  // 허브 세션의 Goal 을 못 찾으면 부모 없는 Goal 로 넓힌다(기존 동작 유지).
  const scoped =
    strict.length > 0 || !input.isHub
      ? strict
      : input.goals.filter((goal) => goal.parentListItemId === null);
  // 감사 중이거나 사유가 있는 일시정지는 사용자가 먼저 봐야 하므로 활성 Goal 보다 앞에 둔다(수용기준 45).
  const attention = scoped.filter(
    (goal) => goal.status === 'auditing' || (goal.status === 'paused' && goal.pauseReason !== null),
  );
  const active = scoped.filter((goal) => goal.status === 'active');
  const pool = attention.length > 0 ? attention : active.length > 0 ? active : scoped;
  return pool.reduce<GoalRecord | null>(
    (latest, goal) => (latest === null || goal.updatedAt > latest.updatedAt ? goal : latest),
    null,
  );
}

function pickItems(input: {
  harness: HarnessSnapshot | null;
  goal: GoalRecord | null;
  sessionId: string | null;
  hubSessionId: string | null;
  isHub: boolean;
}): readonly ListItemRecord[] {
  const items = input.harness?.listItems ?? [];
  // 허브 List 항목은 허브 Goal(`parentGoalId`) 이 소유한다(§10.2). 허브 세션 소유 항목도 같이 본다.
  if (input.isHub) {
    return items.filter(
      (item) =>
        (input.goal !== null && item.parentGoalId === input.goal.id) ||
        (input.hubSessionId !== null && item.sessionId === input.hubSessionId),
    );
  }
  return items.filter(
    (item) =>
      item.sessionId === input.sessionId ||
      (input.goal !== null && item.parentGoalId === input.goal.id),
  );
}

function pickLoops(input: {
  harness: HarnessSnapshot | null;
  goal: GoalRecord | null;
  sessionId: string | null;
  isHub: boolean;
}): readonly LoopRecord[] {
  const loops = input.harness?.loops ?? [];
  if (input.isHub) return loops.filter((loop) => input.goal === null || loop.goalId === input.goal.id);
  return loops.filter((loop) => loop.sessionId === input.sessionId);
}

function loopSummaryOf(loops: readonly LoopRecord[]): string | null {
  const first = loops[0];
  if (first === undefined) return null;
  const rest = loops.length > 1 ? ` 외 ${String(loops.length - 1)}개` : '';
  return `${String(first.iteration)}/${String(first.maxIterations)} 회차${rest}`;
}

function formatTokenTotal(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k tok` : `${String(tokens)} tok`;
}

function formatTokens(usage: { input: number; output: number; cacheRead: number; cacheWrite: number }): string {
  const total = usage.input + usage.output;
  return total >= 1000 ? `${(total / 1000).toFixed(1)}k tok` : `${String(total)} tok`;
}
