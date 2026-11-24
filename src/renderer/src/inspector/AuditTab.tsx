/**
 * 감독 Audit 탭. 목업 `auditTabHTML`(mock/index.html:1656-1693).
 * 읽기 전용 안내 + 통합 감사 gate 표 + 감사 카드(최신/이전) 구조를 따른다.
 * 계약에 `gateRows` 필드는 없으므로 행은 하위 Goal 상태와 최신 감사 verdict 에서 파생한다.
 *
 * 수용기준 43: 허브(그룹)·상위 세션 Audit 탭에는 하위 Goal verdict gate 와 **통합 판정**을 함께 보여준다.
 * 수용기준 46: 세션 Audit 은 그 세션 탭에만 그린다(보드·사이드바에 독립 카드를 만들지 않는다).
 */
import type { ReactElement } from 'react';
import type {
  AuditRecord,
  AuditScope,
  AuditVerdict,
  GoalStatus,
  HarnessSnapshot,
} from '../../../shared/contract/index.ts';

/** 통합 감사 gate 한 행(파생값). `goal-accept` 체크리스트로 그린다. */
export type GateRow = {
  /** 하위 Goal id. React key 로만 쓴다. */
  key: string;
  /** 소유 세션 제목. */
  label: string;
  status: GoalStatus;
  /** 최신 감사 verdict. 판정 전이면 null. */
  verdict: AuditVerdict | null;
  /** 감사 에이전트가 통합 감사를 생략했는지. */
  skipped: boolean;
  ok: boolean;
};

export type AuditGateSummary = {
  ok: number;
  total: number;
  ready: boolean;
  rows: readonly GateRow[];
};

export type AuditTabProps = {
  harness: HarnessSnapshot | null;
  /** 이미 스코프(세션·상위 세션·그룹)로 걸러 최신순 정렬된 감사 목록. */
  audits: readonly AuditRecord[];
  scope: AuditScope;
  /** 세션 Audit 에는 gate 가 없다. */
  gate: AuditGateSummary | null;
};

const VERDICT_LABELS: Record<AuditVerdict, string> = {
  approved: '승인',
  rejected: '거절',
  impossible: '불가능',
  error: '오류',
};

const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: '진행 중',
  auditing: '감사 중',
  complete: '완료',
  paused: '일시정지',
  aborted: '중단',
};

export function verdictLabel(verdict: AuditVerdict | null): string {
  if (verdict === null) return '보류';
  return VERDICT_LABELS[verdict];
}

/** gate 행 체크 표시. 판정 전·오류는 확인 필요(?)로 둔다. */
export function gateRowClass(row: GateRow): string {
  if (row.ok) return '';
  if (row.verdict === 'error' || row.verdict === null) return 'unknown';
  return 'no';
}

function scopeLineFor(scope: AuditScope): string {
  if (scope === 'group') return '그룹 Audit · 그룹 Goal이 만든 세션의 작업을 통합 검사';
  if (scope === 'parent') return '상위 세션 Audit · 이 세션과 자식 세션의 작업을 통합 검사';
  return '세션 Audit · 이 세션에서 작업한 내용만';
}

function emptyTextFor(scope: AuditScope): string {
  if (scope === 'group') {
    return '대상 하위 Goal의 Audit이 모두 승인되면 그룹 Audit을 시작할 수 있습니다. 감사 에이전트는 통합 감사를 생략할 수 있습니다.';
  }
  if (scope === 'parent') {
    return '자식 Goal의 Audit이 모두 승인되면 상위 세션 Audit을 시작할 수 있습니다. 감사 에이전트는 통합 감사를 생략할 수 있습니다.';
  }
  return '아직 감사 기록이 없습니다. 이 세션의 Goal 완료를 주장하면 세션 Audit이 시작됩니다.';
}

/** 통합 판정 줄(수용기준 43). `audits` 는 최신순으로 정렬되어 온다. */
function renderIntegrated(scope: AuditScope, audits: readonly AuditRecord[]): ReactElement {
  const latest = audits[0] ?? null;
  const scopeText = scope === 'group' ? '그룹 Audit' : '상위 세션 Audit';
  if (latest === null) {
    return (
      <div className="audit-gate wait" data-integrated-verdict="none">
        통합 판정 · 아직 없음 — {scopeText} 기록이 생기면 여기에 표시됩니다.
      </div>
    );
  }
  if (latest.state === 'skipped') {
    return (
      <div className="audit-gate ready" data-integrated-verdict="skipped">
        통합 판정 · 통합 감사 생략 — {latest.skipReason ?? '사유가 기록되지 않았습니다.'}
      </div>
    );
  }
  const tone = latest.verdict === 'approved' ? 'ready' : 'wait';
  return (
    <div className={`audit-gate ${tone}`} data-integrated-verdict={latest.verdict ?? 'pending'}>
      통합 판정 · {verdictLabel(latest.verdict)}
    </div>
  );
}

/** 통합 감사 gate 표(파생). 세션 Audit 에는 gate 가 없다. */
function renderGate(scope: AuditScope, gate: AuditGateSummary | null): ReactElement | null {
  if (scope === 'session' || gate === null) return null;
  if (gate.total === 0) {
    return (
      <div className="sup-empty">
        {scope === 'group'
          ? '그룹 Goal이 만든 세션에서 진행된 Goal이 없어 그룹 Audit을 실행하지 않습니다.'
          : '자식 Goal이 없어 상위 세션 Audit을 실행하지 않습니다.'}
      </div>
    );
  }
  return (
    <>
      <div className={`audit-gate ${gate.ready ? 'ready' : 'wait'}`}>
        {gate.ready ? '시작 가능' : '대기'} · {gate.ok}/{gate.total}
        {scope === 'group' ? ' 세션 승인' : ' 자식 Goal 승인'}
        {gate.ready ? ' · 감사 에이전트가 생략할 수 있습니다' : ''}
      </div>
      <ul className="goal-accept">
        {gate.rows.map((row) => (
          <li key={row.key} className={gateRowClass(row)}>
            {row.label} · {GOAL_STATUS_LABELS[row.status]} — {row.skipped ? '생략' : verdictLabel(row.verdict)}
          </li>
        ))}
      </ul>
    </>
  );
}

export function AuditTab(props: AuditTabProps): ReactElement {
  const harness = props.harness;
  if (harness === null || harness.availability !== 'ok') {
    return (
      <div className="sup-empty">
        {harness !== null && harness.availability === 'version-mismatch'
          ? '하네스 스키마 버전이 맞지 않습니다. 패키지를 업데이트한 뒤 앱을 다시 열어 주세요.'
          : 'Pi 하네스 패키지가 없습니다. 패키지를 설치한 뒤 앱을 다시 열어 주세요.'}
        <br />
        Audit 기능이 비활성입니다.
      </div>
    );
  }

  const scope = props.scope;
  const scopeLine = scopeLineFor(scope);

  return (
    <>
      <div className="audit-ro">읽기 전용 · 소스 수정 불가 · 테스트·측정만 실행</div>
      <div className="hint">{scopeLine}</div>
      {renderGate(scope, props.gate)}
      {scope === 'session' ? null : renderIntegrated(scope, props.audits)}
      {props.audits.length === 0 ? <div className="sup-empty">{emptyTextFor(scope)}</div> : null}
      {props.audits.map((audit, index) => renderAuditCard(audit, index === 0))}
    </>
  );
}

function renderAuditCard(audit: AuditRecord, latest: boolean): ReactElement {
  if (audit.state === 'skipped') {
    return (
      <div className="audit-card skipped" key={audit.id}>
        <div className="a-top">
          <span className="a-verdict">통합 감사 생략</span>
          <span className="audit-verdict skipped">생략</span>
        </div>
        <div className="g-meta">
          {audit.skippedAt === null ? '시각 미상' : audit.skippedAt} · {audit.skippedBy ?? '감사 에이전트'} 판단
        </div>
        <div className="g-meta" style={{ marginTop: 4 }}>
          {audit.skipReason ?? '생략 사유가 기록되지 않았습니다.'}
        </div>
      </div>
    );
  }

  const badgeClass = audit.verdict === null ? 'audit-verdict' : `audit-verdict ${audit.verdict}`;
  return (
    <div className="audit-card" key={audit.id}>
      <div className="a-top">
        <span className="a-verdict">{latest ? '최신 감사' : '이전 감사'}</span>
        <span className={badgeClass}>{verdictLabel(audit.verdict)}</span>
      </div>
      <div className="g-meta">
        {audit.createdAt} · {audit.model ?? '모델 미확인'} · commit {audit.commitHash ?? '—'} ·{' '}
        {audit.worktreeState ?? '워크트리 상태 없음'}
      </div>
      {audit.criteriaResults.length === 0 ? null : (
        <ul className="audit-criteria">
          {audit.criteriaResults.map((result, index) => (
            <li key={`${audit.id}-${index}`}>
              <span className={`cr ${result.result}`}>{result.result}</span>
              {result.criterion} — {result.evidence}
            </li>
          ))}
        </ul>
      )}
      <div className="g-meta" style={{ marginTop: 4 }}>
        {audit.report ?? audit.evidenceSummary ?? '보고서가 기록되지 않았습니다.'}
      </div>
    </div>
  );
}
