/**
 * Audit 전이(§10.4). gate 는 저장하지 않고 파생값으로 계산한다 — AuditRecord 에는 verdict·요약·조건 결과만 남는다.
 */
import type {
  AuditGate,
  AuditRecord,
  AuditScope,
  AuditVerdict,
} from '../../../../src/shared/contract/harness.ts';
import type { EnvelopeInput } from '../envelope.ts';
import type { RecordPayload } from '../records.ts';
import { auditRecord } from '../records.ts';
import type { TransitionResult } from './goal.ts';

export type AuditResult = TransitionResult<AuditRecord>;

export type StartAuditInput = {
  scope: AuditScope;
  sessionId?: string | null;
} & EnvelopeInput & {
  goalId: string;
  revision?: number;
};

export type FinishAuditInput = {
  verdict: AuditVerdict;
  summary: string;
  gates: AuditGate[];
  at: string;
};

export function startAudit(input: StartAuditInput): AuditResult {
  // 감사 기록은 Goal 에 매달리므로 대상 없는 감사를 만들지 않는다(§10.4).
  if (input.goalId.length === 0) {
    return { ok: false, error: 'Audit 대상 Goal 이 필요합니다.' };
  }

  const at = input.at ?? new Date().toISOString();
  const payload: RecordPayload<AuditRecord> = {
    goalId: input.goalId,
    scope: input.scope,
    auditSessionId: input.sessionId ?? null,
    state: 'running',
    skipReason: null,
    skippedBy: null,
    skippedAt: null,
    verdict: null,
    commitHash: null,
    worktreeState: null,
    criteriaResults: [],
    evidenceSummary: null,
    report: null,
    model: null,
    revision: input.revision ?? 1,
    createdAt: at,
    finishedAt: null,
    durationMs: null,
  };

  return {
    ok: true,
    record: auditRecord(payload, {
      id: input.id,
      groupId: input.groupId,
      seq: input.seq,
      writer: input.writer,
      at,
    }),
  };
}

export function finishAudit(audit: AuditRecord, input: FinishAuditInput): AuditResult {
  if (audit.state !== 'running') {
    return { ok: false, error: '진행 중인 Audit 만 끝낼 수 있습니다.' };
  }

  const summary = input.summary.trim();
  // 증거 없는 verdict 는 아카이브에서 검증 근거를 읽을 수 없게 만든다(§10.4).
  if (summary.length === 0) {
    return { ok: false, error: 'Audit 증거 요약이 비어 있습니다.' };
  }

  // gate 는 저장하지 않는 파생값이라(계약 AuditGate 주석) verdict·요약만 남긴다.
  void input.gates;

  const started = Date.parse(audit.createdAt);
  const finished = Date.parse(input.at);
  const durationMs =
    Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : null;

  return {
    ok: true,
    record: {
      ...audit,
      state: 'finished',
      verdict: input.verdict,
      evidenceSummary: summary,
      finishedAt: input.at,
      durationMs,
    },
  };
}

/** 감사 시작 전 gate 판정. gate 가 없는 세션 Audit 은 막을 조건이 없으므로 통과로 본다. */
export function gatesPassed(gates: readonly AuditGate[]): boolean {
  return gates.every((gate) => gate === 'passed');
}
