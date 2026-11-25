/**
 * 감사 세션 실행 배선(수용기준 46-53, SPEC-hub-orchestration §10.4).
 *
 * 감사는 앱이 띄운다: `auditing` 상태 Goal 을 찾아 커밋을 고정하고 감사 프롬프트로 세션을 시작한 뒤
 * `audit` 기록(state='running')을 남긴다. 판정은 감사 세션이 CLI 로 기록한다(`audit --verdict …`).
 * 실행 실패는 Goal 을 `paused`(`audit_error`)로 두고, 다음 주기에 다시 시도할 수 있게 한다.
 */
import type {
  AuditRecord,
  GoalRecord,
  HarnessRecord,
  HarnessSnapshot,
} from '../../shared/contract/index.ts';
import { auditSystemPrompt } from './audit-session.ts';

export type AuditRunDeps = {
  headCommit(repoPath: string): Promise<string | null>;
  launch(input: { cwd: string; prompt: string; model: string | null }): Promise<{
    ok: boolean;
    sessionId?: string | null;
    error?: string;
  }>;
  append(groupId: string, record: HarnessRecord): Promise<void>;
  now(): string;
};

export type AuditRunContext = {
  /** 감사 세션이 커밋을 고정하고 코드를 읽는 경로(그룹 허브 폴더). */
  repoPath: string;
  model: string | null;
};

/** 기록 id 는 Goal·revision 으로 고정한다 — 같은 감사를 두 번 append 해도 재생에서 한 건으로 접힌다. */
function auditIdFor(goal: GoalRecord): string {
  return `audit:${goal.id}:r${String(goal.revision)}`;
}

function maxSeq(snapshot: HarnessSnapshot): number {
  let seq = 0;
  for (const goal of snapshot.goals) seq = Math.max(seq, goal.seq);
  for (const item of snapshot.listItems) seq = Math.max(seq, item.seq);
  for (const loop of snapshot.loops) seq = Math.max(seq, loop.seq);
  for (const audit of snapshot.audits) seq = Math.max(seq, audit.seq);
  for (const todo of snapshot.todos) seq = Math.max(seq, todo.seq);
  for (const question of snapshot.questions) seq = Math.max(seq, question.seq);
  for (const message of snapshot.messages) seq = Math.max(seq, message.seq);
  for (const command of snapshot.commands) seq = Math.max(seq, command.seq);
  return seq;
}

export async function runPendingAudits(
  groupId: string,
  snapshot: HarnessSnapshot,
  context: AuditRunContext,
  deps: AuditRunDeps,
): Promise<string[]> {
  const started: string[] = [];
  let seq = maxSeq(snapshot);

  for (const goal of snapshot.goals) {
    if (goal.status !== 'auditing') continue;
    const existing = snapshot.audits.some(
      (audit) => audit.goalId === goal.id && audit.revision === goal.revision,
    );
    if (existing) continue;

    const at = deps.now();
    const commit = await deps.headCommit(context.repoPath);
    const launched = await deps.launch({
      cwd: context.repoPath,
      prompt: auditSystemPrompt({ goal, commit, repoPath: context.repoPath }),
      model: context.model,
    });

    if (!launched.ok) {
      await deps.append(groupId, {
        ...goal,
        seq: seq + 1,
        at,
        status: 'paused',
        pauseReason: 'audit_error',
        updatedAt: at,
      } satisfies GoalRecord);
      seq += 1;
      continue;
    }

    const record: AuditRecord = {
      type: 'audit',
      id: auditIdFor(goal),
      groupId,
      seq: seq + 1,
      at,
      schemaVersion: 1,
      writer: 'audit-agent',
      goalId: goal.id,
      scope: 'session',
      auditSessionId: launched.sessionId ?? null,
      state: 'running',
      skipReason: null,
      skippedBy: null,
      skippedAt: null,
      verdict: null,
      commitHash: commit,
      worktreeState: null,
      criteriaResults: [],
      evidenceSummary: null,
      report: null,
      model: context.model,
      revision: goal.revision,
      createdAt: at,
      finishedAt: null,
      durationMs: null,
    };
    await deps.append(groupId, record);
    seq += 1;
    started.push(goal.id);
  }

  return started;
}
