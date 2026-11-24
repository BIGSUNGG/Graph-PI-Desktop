/**
 * store 파생 셀렉터. 그룹 목록은 IPC 채널이 아직 없어(shared/contract/index.ts 에 group:list 부재)
 * 렌더러가 관측한 값(설정·세션 푸시·하네스 스냅샷)에서 파생한다.
 */
import { useContext, useMemo } from 'react';
import type {
  AuditRecord,
  GoalRecord,
  HarnessSnapshot,
  ListItemRecord,
  LoopRecord,
  PiSession,
  WorktreeView,
} from '../../../shared/contract/index.ts';
import type { GroupView, SlotKind } from '../board/layout.ts';
import { AppActionsContext, AppStateContext, type AppActions, type AppState } from './app-store.tsx';

const NO_SESSIONS: PiSession[] = [];
const NO_STATUS_GROUPS: never[] = [];
const NO_WORKTREES: WorktreeView[] = [];

export function useApp(): AppState {
  const state = useContext(AppStateContext);
  if (state === null) throw new Error('AppProvider 안에서만 useApp 을 쓸 수 있다');
  return state;
}

export function useDispatch(): AppActions {
  const actions = useContext(AppActionsContext);
  if (actions === null) throw new Error('AppProvider 안에서만 useDispatch 를 쓸 수 있다');
  return actions;
}

export function useGroups(): GroupView[] {
  const state = useApp();
  const lastGroupId = state.settings.lastGroupId;
  const sessionsByGroup = state.sessionsByGroup;
  const harnessGroupId = state.harness === null ? null : state.harness.groupId;
  const statusGroups = state.status === null ? NO_STATUS_GROUPS : state.status.groups;

  return useMemo(() => {
    const ids: string[] = [];
    const add = (id: string | null): void => {
      if (id === null || id === '' || ids.includes(id)) return;
      ids.push(id);
    };
    for (const group of statusGroups) add(group.id);
    add(lastGroupId);
    add(harnessGroupId);
    for (const id of Object.keys(sessionsByGroup)) add(id);
    return ids.map((id) => toGroupView(id, sessionsByGroup[id] ?? NO_SESSIONS));
  }, [lastGroupId, harnessGroupId, sessionsByGroup, statusGroups]);
}

export function useSelectedGroup(): GroupView | null {
  const groups = useGroups();
  const activeId = useApp().settings.lastGroupId;
  return groups.find((group) => group.id === activeId) ?? groups[0] ?? null;
}

/**
 * 허브가 바꾼 표시 이름(수용기준 18). 그룹 파일이 유일한 저장소라 렌더러는 덮어 그리기만 한다.
 */
export function useGroupAliases(): { worktreeNames: Record<string, string>; sessionNames: Record<string, string> } {
  const state = useApp();
  const group = useSelectedGroup();
  const groups = state.status?.groups ?? NO_STATUS_GROUPS;
  return useMemo(() => {
    const found = group === null ? undefined : groups.find((entry) => entry.id === group.id);
    return {
      worktreeNames: found?.worktreeNames ?? {},
      sessionNames: found?.sessionNames ?? {},
    };
  }, [group, groups]);
}

export function useSessions(groupId: string | null): PiSession[] {
  const state = useApp();
  const aliases = useGroupAliases();
  return useMemo(() => {
    if (groupId === null) return NO_SESSIONS;
    const sessions = state.sessionsByGroup[groupId] ?? NO_SESSIONS;
    const names = aliases.sessionNames;
    const renamed = sessions.filter((session) => names[session.id] !== undefined);
    if (renamed.length === 0) return sessions;
    return sessions.map((session) =>
      names[session.id] === undefined ? session : { ...session, title: names[session.id] ?? session.title },
    );
  }, [groupId, state.sessionsByGroup, aliases]);
}

export function useVisibleWorktrees(): WorktreeView[] {
  const state = useApp();
  const group = useSelectedGroup();
  const projects = state.orca.projects;
  const worktrees = state.orca.worktrees;
  const aliases = useGroupAliases();

  return useMemo(() => {
    if (group === null) return NO_WORKTREES;
    const projectName = new Map(projects.map((project) => [project.id, project.displayName]));
    return worktrees.map((worktree) => ({
      id: worktree.id,
      groupId: group.id,
      repo: projectName.get(worktree.repoId) ?? worktree.displayName,
      name: aliases.worktreeNames[worktree.id] ?? worktree.displayName,
      branch: worktree.branch,
      parentWorktreeId: worktree.parentWorktreeId,
      // Orca 스냅샷에는 미커밋 여부가 없다. git 상태는 별도 조회가 필요하다.
      dirty: false,
      orcaMissing: false,
      path: worktree.path,
    }));
  }, [group, projects, worktrees, aliases]);
}

/** 허브 세션 제목은 `"<그룹명> 관리"` 다(mock/mock-data.js 의 허브 세션 규칙). */
function toGroupView(id: string, sessions: PiSession[]): GroupView {
  const hub = sessions.find((session) => session.isHub) ?? null;
  if (hub === null) {
    return { id, name: id, note: '', hubSessionId: null, parentRepo: '' };
  }
  const suffix = ' 관리';
  const name = hub.title.endsWith(suffix) ? hub.title.slice(0, -suffix.length) : hub.title;
  return { id, name, note: '', hubSessionId: hub.id, parentRepo: '' };
}

/**
 * 목업 `sessionSlotColors`/`groupSlotColors`(mock/index.html:945-966) 의 상태 판정.
 * 하네스가 없으면 배지를 그리지 않는다(목업과 동일).
 */
export function sessionSlotKinds(
  session: PiSession,
  harness: HarnessSnapshot | null,
): SlotKind[] | null {
  if (harness === null || harness.availability === 'missing') return null;

  const goals = harness.goals.filter((goal) => goal.sessionId === session.id);
  const goal = latestGoal(goals);
  const goalIds = goals.map((entry) => entry.id);
  const items = harness.listItems.filter(
    (item) => item.sessionId === session.id || (item.goalId !== null && goalIds.includes(item.goalId)),
  );
  const loops = harness.loops.filter(
    (loop) => loop.sessionId === session.id || goalIds.includes(loop.goalId),
  );
  const audits = harness.audits.filter((audit) => goalIds.includes(audit.goalId));

  return [goalSlot(goal), listSlot(items), loopSlot(loops), auditSlot(audits)];
}

export const SLOT_COLORS: Record<SlotKind, string> = {
  good: '#10b981',
  active: '#51a2ff',
  wait: '#d4a300',
  bad: '#ff6568',
  none: '#404040',
};

function latestGoal(goals: GoalRecord[]): GoalRecord | null {
  const open = goals.find((goal) => goal.status === 'active' || goal.status === 'auditing');
  if (open !== undefined) return open;
  let latest: GoalRecord | null = null;
  for (const goal of goals) {
    if (latest === null || goal.updatedAt > latest.updatedAt) latest = goal;
  }
  return latest;
}

function goalSlot(goal: GoalRecord | null): SlotKind {
  if (goal === null) return 'none';
  if (goal.status === 'complete') return 'good';
  if (goal.status === 'active' || goal.status === 'auditing') return 'active';
  if (goal.status === 'paused') return 'wait';
  return 'bad';
}

function listSlot(items: ListItemRecord[]): SlotKind {
  if (items.length === 0) return 'none';
  if (items.some((item) => item.state === 'active')) return 'active';
  if (items.some((item) => item.completedAt === null)) return 'wait';
  return 'good';
}

function loopSlot(loops: LoopRecord[]): SlotKind {
  if (loops.length === 0) return 'none';
  if (loops.some((loop) => loop.status === 'stopped' || loop.status === 'paused')) return 'bad';
  if (loops.some((loop) => loop.status === 'running')) return 'active';
  if (loops.some((loop) => loop.status === 'done')) return 'good';
  return 'wait';
}

function auditSlot(audits: AuditRecord[]): SlotKind {
  if (audits.length === 0) return 'none';
  if (
    audits.some(
      (audit) =>
        audit.verdict === 'rejected' || audit.verdict === 'impossible' || audit.verdict === 'error',
    )
  ) {
    return 'bad';
  }
  if (audits.some((audit) => audit.verdict === 'approved' || audit.state === 'skipped')) return 'good';
  return 'wait';
}
