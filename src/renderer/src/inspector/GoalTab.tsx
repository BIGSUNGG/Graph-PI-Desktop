/**
 * 감독 Goal 탭. 목업 `goalTabHTML`(mock/index.html:1585-1607).
 * 활성 Goal 한 건의 목표·상태·일시정지 사유와 완료 조건 체크리스트를 보여준다.
 * 계약에 `findingGroups`/`gateRows` 필드는 없으므로, 접이식 영역은 최신 Audit 의
 * `criteriaResults`(통과하지 못한 기준)와 하위 Goal gate 행에서 파생한다.
 *
 * 수용기준 43: 하위 Goal 은 `parentListItemId` 로 부모 허브 List 항목을 보여준다.
 * 수용기준 52: Audit 이 거부하면 Goal 은 `active` 로 돌아가고 실패 조건을 접지 않고 바로 보여준다.
 */
import { useState, type ReactElement } from 'react';
import type {
  AuditRecord,
  AuditVerdict,
  CriterionResult,
  GoalRecord,
  GoalStatus,
  HarnessSnapshot,
  ListItemRecord,
  PauseReason,
} from '../../../shared/contract/index.ts';
import { clockOf } from '../board/layout.ts';
import { gateRowClass, verdictLabel, type GateRow } from './AuditTab.tsx';

/** 허브 집계(하위 Goal 수·승인·중단·차단 항목). 목업 `goalTabHTML` 의 `agg` 줄. */
export type GoalAggregate = {
  childGoals: number;
  approved: number;
  aborted: number;
  blockedItems: number;
};

export type GoalTabProps = {
  harness: HarnessSnapshot | null;
  /** 활성 Goal 1건(없으면 null). */
  goal: GoalRecord | null;
  /** 그 Goal 의 최신 감사(없으면 null). */
  latestAudit: AuditRecord | null;
  isHub: boolean;
  aggregate: GoalAggregate | null;
  /** 하위 Goal gate 행(허브에서만 채워진다). */
  gateRows: readonly GateRow[];
  /** 이 Goal 을 만든 부모 허브 List 항목(수용기준 43). */
  parentItem?: ListItemRecord | null;
  /** Goal 에 붙은 Loop 요약 한 줄(없으면 null). */
  loopSummary?: string | null;
};

const STATUS_LABELS: Record<GoalStatus, string> = {
  active: '진행 중',
  auditing: '감사 중',
  complete: '완료',
  paused: '일시정지',
  aborted: '중단',
};

/** 목업 `goalPillClass`(mock/index.html:1557-1559). */
function pillClass(status: GoalStatus): string {
  if (status === 'complete') return 'done';
  if (status === 'aborted') return 'failed';
  if (status === 'paused') return 'idle';
  return 'running';
}

/** 8종 일시정지 사유의 화면 표기. `agent` 는 계약 주석대로 사유를 그대로 쓴다. */
const PAUSE_LABELS: Record<PauseReason, string> = {
  user: '사용자 중지',
  agent: 'agent',
  audit_error: '감사 오류',
  question: '질문 대기',
  loop_bounds: 'Loop 상한',
  dependency: '의존성',
  standby: '대기',
  blocked: '차단',
};

/** Audit 문제 표시 문구. 거부는 재작업, 불가능은 중단, 오류는 재시도 대기다. */
const PROBLEM_LABELS: Record<Exclude<AuditVerdict, 'approved'>, string> = {
  rejected: '감사 거부',
  impossible: '감사 불가능',
  error: '감사 오류',
};

function auditProblem(verdict: AuditVerdict | null): Exclude<AuditVerdict, 'approved'> | null {
  if (verdict === 'rejected' || verdict === 'impossible' || verdict === 'error') return verdict;
  return null;
}

/** 완료 조건 체크리스트 표시 클래스. 목업 `goalTabHTML` 의 ""/no/unknown(`.goal-accept li.no`/`.unknown`, mock.css:239-243). */
function criterionClass(result: CriterionResult | null, passed: boolean): string {
  if (result === null) return passed ? '' : 'unknown';
  if (result.result === 'pass') return '';
  if (result.result === 'fail') return 'no';
  return 'unknown';
}

/** 실패 조건 목록(거부·불가능·오류일 때는 접지 않고 바로 보여준다). */
function FailuresList(props: { findings: readonly CriterionResult[]; always?: boolean }): ReactElement {
  return (
    <ul className="audit-criteria" data-audit-failures={props.always === true ? 'true' : undefined}>
      {props.findings.map((finding, index) => (
        <li key={`${finding.criterion}-${index}`}>
          <span className={`cr ${finding.result}`}>{finding.result}</span>
          {finding.criterion} — {finding.evidence}
        </li>
      ))}
    </ul>
  );
}

/** 수용기준 52: Audit 결과가 거부·불가능·오류면 실패 조건과 Goal 상태를 한 줄로 알린다. */
function AuditProblemBlock(props: {
  problem: Exclude<AuditVerdict, 'approved'>;
  findings: readonly CriterionResult[];
}): ReactElement {
  const tail =
    props.problem === 'rejected'
      ? 'Goal 이 active 로 돌아가 재작업합니다. 상한이 남은 Loop 는 계속 진행합니다.'
      : props.problem === 'impossible'
        ? 'Goal 이 중단(aborted) 상태입니다.'
        : 'Goal 이 일시정지 상태입니다. 재시도 정책을 확인하세요.';
  return (
    <>
      <div className="audit-gate wait" data-audit-problem={props.problem} role="status">
        {PROBLEM_LABELS[props.problem]} · 실패 조건 {props.findings.length}개 — {tail}
      </div>
      {props.findings.length === 0 ? null : <FailuresList findings={props.findings} always />}
    </>
  );
}

export function GoalTab(props: GoalTabProps): ReactElement {
  const [findingsOpen, setFindingsOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const harness = props.harness;

  if (harness === null || harness.availability !== 'ok') {
    return (
      <div className="sup-empty">
        {harness !== null && harness.availability === 'version-mismatch'
          ? '하네스 스키마 버전이 맞지 않습니다. 패키지를 업데이트한 뒤 앱을 다시 열어 주세요.'
          : 'Pi 하네스 패키지가 없습니다. 패키지를 설치한 뒤 앱을 다시 열어 주세요.'}
        <br />
        Goal 기능이 비활성입니다.
      </div>
    );
  }

  const goal = props.goal;
  if (goal === null) {
    return (
      <div className="sup-empty">
        이 세션에 활성 Goal이 없습니다.
        <br />
        에이전트가 Goal을 만들면 여기에 표시됩니다.
      </div>
    );
  }

  const criteriaResults: readonly CriterionResult[] =
    props.latestAudit === null ? [] : props.latestAudit.criteriaResults;
  const findings = criteriaResults.filter((result) => result.result !== 'pass');
  const aggregate = props.aggregate;
  const verdict = props.latestAudit === null ? null : props.latestAudit.verdict;
  const problem = auditProblem(verdict);
  const parentItem = props.parentItem === undefined ? null : props.parentItem;

  return (
    <div className="goal-row" data-goal-status={goal.status} data-audit-verdict={verdict ?? 'none'}>
      <div className="g-top">
        <span className={`pill ${pillClass(goal.status)}`}>
          <span className="d" />
          {STATUS_LABELS[goal.status]}
        </span>
        <span className="g-obj">{goal.objective}</span>
      </div>
      <div className="g-meta">
        revision {goal.revision} · 감사 {goal.auditAttemptCount}회
        {goal.completedAt === null ? '' : ` · 완료 ${clockOf(goal.completedAt)}`}
      </div>
      {goal.pauseReason === null ? null : (
        <div className="g-meta" data-pause-reason={goal.pauseReason}>
          일시정지 사유 · {PAUSE_LABELS[goal.pauseReason]}
        </div>
      )}
      {goal.parentListItemId === null ? null : (
        <div className="g-meta" data-parent-item={goal.parentListItemId}>
          부모 허브 항목 ·{' '}
          {parentItem === null
            ? goal.parentListItemId
            : `#${String(parentItem.queueOrder)} ${parentItem.title}`}
        </div>
      )}
      {props.loopSummary === undefined || props.loopSummary === null ? null : (
        <div className="g-meta" data-loop-summary="true">
          Loop · {props.loopSummary}
        </div>
      )}
      {aggregate === null ? null : (
        <div className="g-meta" data-child-summary="true">
          하위 Goal {aggregate.childGoals}개 · 승인 {aggregate.approved} · 중단 {aggregate.aborted} · 차단 항목{' '}
          {aggregate.blockedItems}
        </div>
      )}

      {/* 수용기준 52: 거부/불가능/오류는 실패 조건을 접지 않고 바로 보여준다. */}
      {problem === null ? null : <AuditProblemBlock problem={problem} findings={findings} />}

      <ul className="goal-accept">
        {goal.acceptanceCriteria.length === 0 ? (
          <li className="unknown">완료 조건이 기록되지 않았습니다.</li>
        ) : (
          goal.acceptanceCriteria.map((criterion) => {
            const result =
              criteriaResults.find(
                (entry) => entry.criterion === criterion.desc || entry.criterion === criterion.id,
              ) ?? null;
            return (
              <li key={criterion.id} className={criterionClass(result, criterion.passed)}>
                {criterion.desc}
              </li>
            );
          })
        )}
      </ul>

      {problem === null && findings.length > 0 ? (
        <button
          className="btn ghost"
          type="button"
          aria-expanded={findingsOpen}
          style={{ alignSelf: 'flex-start', marginTop: 6 }}
          onClick={() => {
            setFindingsOpen(!findingsOpen);
          }}
        >
          감사 실패 항목 {findings.length}
        </button>
      ) : null}
      {problem === null && findingsOpen && findings.length > 0 ? (
        <FailuresList findings={findings} />
      ) : null}

      {props.isHub && props.gateRows.length > 0 ? (
        <button
          className="btn ghost"
          type="button"
          aria-expanded={gateOpen}
          style={{ alignSelf: 'flex-start', marginTop: 6 }}
          onClick={() => {
            setGateOpen(!gateOpen);
          }}
        >
          하위 Goal 게이트 {props.gateRows.length}
        </button>
      ) : null}
      {gateOpen && props.gateRows.length > 0 ? (
        <ul className="goal-accept">
          {props.gateRows.map((row) => (
            <li key={row.key} className={gateRowClass(row)}>
              {row.label} · {STATUS_LABELS[row.status]} — {row.skipped ? '생략' : verdictLabel(row.verdict)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
