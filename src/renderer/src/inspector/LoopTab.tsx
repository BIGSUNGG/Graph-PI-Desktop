/**
 * 감독 Loop 탭. 목업 `loopTabHTML`(mock/index.html:1641-1654) + `loopReason`(:1629-1639).
 *
 * 수용기준 56: 측정값·회차·상한(회차/시간/토큰 3종)·종료 이유를 표로 보여준다.
 *   `measureCmd` 가 없는 Loop 는 "Audit 승인이 종료 조건" 이라고 표에 명시한다.
 * 수용기준 52: 상한이 남은 Loop 는 "계속 진행 중" 섹션에 남는다.
 *
 * 표는 mock.css 에 표 클래스가 없어 구조만 인라인으로 주고, 색은 mock.css 토큰만 쓴다.
 */
import type { CSSProperties, ReactElement } from 'react';
import type { HarnessSnapshot, LoopRecord, LoopStatus } from '../../../shared/contract/index.ts';
import { clockOf } from '../board/layout.ts';
import { LOOP_STATUS_LABELS, loopRows, type LoopRow } from '../state/selectors.ts';

export type LoopTabProps = {
  harness: HarnessSnapshot | null;
  /** 스코프(그룹 또는 세션)로 걸러낸 Loop 목록. */
  loops: readonly LoopRecord[];
  /** Goal 이 감사 거부로 `active` 로 돌아온 상태면 true(수용기준 52). */
  auditRejected?: boolean;
};

/** 목업 `loopTabHTML` 의 `.loop-card.paused`/`.stopped` 테두리(mock.css:255-256). */
function cardClass(status: LoopStatus): string {
  if (status === 'paused') return 'loop-card paused';
  if (status === 'stopped') return 'loop-card stopped';
  return 'loop-card';
}

function statusPillClass(status: LoopStatus): string {
  if (status === 'running' || status === 'waiting') return 'running';
  if (status === 'done') return 'done';
  if (status === 'stopped') return 'failed';
  return 'idle';
}

function valueText(value: number | null): string {
  return value === null ? '—' : String(value);
}

/** stderr 첫 줄만 남기고 자른다. 경고 줄이 카드 레이아웃을 밀지 않게 한다. */
function stderrSummary(stderr: string | null): string {
  if (stderr === null) return '';
  const line = stderr.trim().split('\n')[0] ?? '';
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 9.5,
  marginBottom: 6,
};

const TH_STYLE: CSSProperties = {
  padding: '3px 4px',
  textAlign: 'left',
  fontWeight: 500,
  color: 'var(--dim)',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--line)',
};

const TD_STYLE: CSSProperties = {
  padding: '3px 4px',
  verticalAlign: 'top',
  color: 'var(--muted)',
  borderBottom: '1px dashed var(--line)',
};

function LoopTable(props: { rows: readonly LoopRow[] }): ReactElement {
  return (
    <table style={TABLE_STYLE} data-loop-table="true" aria-label="Loop 측정·회차·상한·종료 이유">
      <thead>
        <tr>
          <th style={TH_STYLE}>Loop</th>
          <th style={TH_STYLE}>상태</th>
          <th style={TH_STYLE}>측정값</th>
          <th style={TH_STYLE}>회차</th>
          <th style={TH_STYLE}>회차 상한</th>
          <th style={TH_STYLE}>시간 상한</th>
          <th style={TH_STYLE}>토큰 상한</th>
          <th style={TH_STYLE}>종료 이유</th>
          <th style={TH_STYLE}>종료 조건</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.id} data-loop-id={row.id} data-loop-audit-only={row.auditOnly ? 'true' : 'false'}>
            <td style={TD_STYLE}>{row.target}</td>
            <td style={TD_STYLE}>
              <span className={`pill ${statusPillClass(row.status)}`}>
                <span className="d" />
                {row.statusLabel}
              </span>
            </td>
            <td style={TD_STYLE}>
              현재 {row.current} · 최고 {row.best}
              <br />
              {row.direction}
            </td>
            <td style={TD_STYLE}>{row.iteration}</td>
            <td style={TD_STYLE}>{row.maxIterations}</td>
            <td style={TD_STYLE}>{row.timeLimit}</td>
            <td style={TD_STYLE}>
              {row.tokenLimit} · 사용 {row.tokensUsed}
            </td>
            <td style={TD_STYLE}>{row.stopReason}</td>
            <td style={TD_STYLE}>{row.endCondition}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LoopSection(props: {
  title: string;
  rows: readonly LoopRow[];
  empty: string | null;
  marker: string;
}): ReactElement | null {
  if (props.rows.length === 0 && props.empty === null) return null;
  return (
    <div data-loop-section={props.marker}>
      <div className="sup-head">
        {props.title}
        <span className="n">{props.rows.length}개</span>
      </div>
      {props.rows.length === 0 ? (
        <div className="sup-empty">{props.empty}</div>
      ) : (
        <LoopTable rows={props.rows} />
      )}
    </div>
  );
}

export function LoopTab(props: LoopTabProps): ReactElement {
  const harness = props.harness;

  if (harness === null || harness.availability !== 'ok') {
    return (
      <div className="sup-empty">
        {harness !== null && harness.availability === 'version-mismatch'
          ? '하네스 스키마 버전이 맞지 않습니다. 패키지를 업데이트한 뒤 앱을 다시 열어 주세요.'
          : 'Pi 하네스 패키지가 없습니다. 패키지를 설치한 뒤 앱을 다시 열어 주세요.'}
        <br />
        Loop 기능이 비활성입니다.
      </div>
    );
  }

  if (props.loops.length === 0) {
    return (
      <div className="sup-empty">
        이 Goal에는 Loop가 없습니다.
        <br />
        완료 조건은 Audit만으로 검증합니다.
      </div>
    );
  }

  const rows = loopRows(harness, props.loops);
  const continuing = rows.filter((row) => row.continues);
  const settled = rows.filter((row) => !row.continues);

  return (
    <>
      {props.auditRejected === true ? (
        <div className="audit-gate wait" data-loop-after-reject="true">
          감사 거부 · 상한이 남은 Loop 는 계속 진행 중입니다.
        </div>
      ) : null}
      <LoopSection
        title="계속 진행 중"
        rows={continuing}
        empty="상한이 남아 계속 진행 중인 Loop 가 없습니다."
        marker="continuing"
      />
      <LoopSection title="멈춤·종료" rows={settled} empty={null} marker="settled" />
      {props.loops.map((loop) => {
        const pct =
          loop.maxIterations > 0
            ? Math.min(100, Math.round((loop.iteration / loop.maxIterations) * 100))
            : 0;
        const stderr = stderrSummary(loop.measureStderr);
        const failed = loop.measureExitCode !== null && loop.measureExitCode !== 0;
        return (
          <div className={cardClass(loop.status)} key={loop.id}>
            <div className="lp-top">
              <span className="lp-target">
                {loop.target === '' ? '측정값 없음 · Audit 판정' : loop.target}
              </span>
              <span className={`pill ${statusPillClass(loop.status)}`}>
                <span className="d" />
                {LOOP_STATUS_LABELS[loop.status]}
              </span>
            </div>
            <div className="loop-progress">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="lp-meta">
              {loop.iteration}/{loop.maxIterations} 회차 · 현재 {valueText(loop.currentValue)} · 최고{' '}
              {valueText(loop.bestValue)}
              <br />
              <span className="mono">{loop.measureCmd === '' ? 'measureCmd 없음' : loop.measureCmd}</span>
              <br />
              마지막 측정 {loop.measuredAt === null ? '—' : clockOf(loop.measuredAt)}
            </div>
            {failed ? (
              <div className="audit-gate wait">
                측정 실패 · exit {loop.measureExitCode}
                {stderr === '' ? ' · stderr 없음' : <span className="mono"> · {stderr}</span>}
              </div>
            ) : null}
            {loop.history.length === 0 ? null : (
              <div className="audit-hist">
                {loop.history
                  .map((entry) => `#${entry.iteration} ${valueText(entry.value)} · ${clockOf(entry.at)}`)
                  .join('  ')}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
