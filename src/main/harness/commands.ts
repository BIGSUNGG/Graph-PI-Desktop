/**
 * 허브가 요청한 보드 조작 실행기(수용기준 18).
 *
 * 판정(planCommand)은 순수 함수로 두고 실행만 deps 로 주입한다. 그래야 Orca·Electron 없이
 * 규칙(무엇을 거부하는가)을 테스트할 수 있다. 확인 대화상자는 두지 않는다 — 요청 즉시 실행.
 */
import type { AgentCommandRecord } from '../../shared/contract/harness.ts';
import type { OrcaRunResult } from '../orca/cli.ts';

export type CommandContext = {
  /** 워크트리 id → 표시 이름. 없으면 null. */
  worktreeName: (worktreeId: string) => string | null;
  /** 세션 id → PTY 터미널 id. 없으면 null. */
  terminalForSession: (sessionId: string) => string | null;
};

export type CommandPlan =
  | { action: 'remove-worktree'; worktreeId: string }
  | { action: 'rename-worktree'; worktreeId: string; name: string }
  | { action: 'remove-session'; sessionId: string; terminalId: string | null }
  | { action: 'rename-session'; sessionId: string; name: string }
  | { action: 'refuse'; reason: string };

/**
 * 요청을 실행 계획으로 바꾼다.
 *
 * - 이미 처리된 요청(status !== 'pending')은 다시 실행하지 않는다(재생 멱등성).
 * - 이름 변경은 빈 이름을 거부한다. 빈 이름을 저장하면 보드에서 카드가 사라진 것처럼 보인다.
 * - 워크트리 삭제는 보드에 있는 워크트리만 허용한다(오타 id 로 엉뚱한 것을 지우지 않는다).
 * - 세션 삭제는 PTY 를 닫을 수 있으면 닫고, 못 찾으면 실패로 남긴다(조용히 성공 처리하지 않는다).
 */
export function planCommand(record: AgentCommandRecord, context: CommandContext): CommandPlan {
  const name = record.value === null ? '' : record.value.trim();
  switch (record.action) {
    case 'remove-worktree':
      return context.worktreeName(record.target) === null
        ? { action: 'refuse', reason: `워크트리를 찾을 수 없습니다: ${record.target}` }
        : { action: 'remove-worktree', worktreeId: record.target };
    case 'rename-worktree':
      if (context.worktreeName(record.target) === null) {
        return { action: 'refuse', reason: `워크트리를 찾을 수 없습니다: ${record.target}` };
      }
      return name === ''
        ? { action: 'refuse', reason: '새 이름이 비어 있습니다' }
        : { action: 'rename-worktree', worktreeId: record.target, name };
    case 'remove-session':
      return { action: 'remove-session', sessionId: record.target, terminalId: context.terminalForSession(record.target) };
    case 'rename-session':
      if (record.target.trim() === '') return { action: 'refuse', reason: '세션 id 가 비어 있습니다' };
      return name === ''
        ? { action: 'refuse', reason: '새 이름이 비어 있습니다' }
        : { action: 'rename-session', sessionId: record.target, name };
  }
}

export type CommandDeps = {
  removeWorktree: (worktreeId: string) => Promise<OrcaRunResult<void>>;
  closeTerminal: (terminalId: string) => Promise<OrcaRunResult<void>>;
  renameWorktree: (worktreeId: string, name: string) => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  /** 처리 결과를 같은 id 로 append 한다(상태 전이). */
  append: (record: AgentCommandRecord) => Promise<void>;
};

/** 대기 중인 요청을 순서대로 실행하고 상태를 append 한다. 실패한 요청도 기록해 보드에 남긴다. */
export async function runCommands(
  records: readonly AgentCommandRecord[],
  context: CommandContext,
  deps: CommandDeps,
): Promise<number> {
  let executed = 0;
  for (const record of records) {
    if (record.status !== 'pending') continue;
    const plan = planCommand(record, context);
    const done = async (result: string): Promise<void> => {
      executed += 1;
      await deps.append({ ...record, status: 'done', result, executedAt: new Date().toISOString() });
    };
    const fail = async (reason: string): Promise<void> => {
      executed += 1;
      await deps.append({ ...record, status: 'failed', result: reason, executedAt: new Date().toISOString() });
    };
    if (plan.action === 'refuse') {
      await fail(plan.reason);
      continue;
    }
    if (plan.action === 'remove-worktree') {
      const removed = await deps.removeWorktree(plan.worktreeId);
      if (removed.ok) await done('워크트리를 삭제했습니다');
      else await fail(removed.error);
      continue;
    }
    if (plan.action === 'rename-worktree') {
      await deps.renameWorktree(plan.worktreeId, plan.name);
      await done(`이름을 ${plan.name} 로 바꿨습니다`);
      continue;
    }
    if (plan.action === 'rename-session') {
      await deps.renameSession(plan.sessionId, plan.name);
      await done(`이름을 ${plan.name} 로 바꿨습니다`);
      continue;
    }
    if (plan.terminalId === null) {
      await fail('종료할 터미널을 찾을 수 없습니다');
      continue;
    }
    const closed = await deps.closeTerminal(plan.terminalId);
    if (closed.ok) await done('세션을 닫았습니다');
    else await fail(closed.error);
  }
  return executed;
}
