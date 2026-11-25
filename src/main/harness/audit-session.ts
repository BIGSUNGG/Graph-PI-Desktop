/**
 * 감사 세션(§10.4). Goal 완료는 작업 세션과 분리된 읽기 전용 감사 세션이 판정한다 —
 * 작업 에이전트가 자기 결과를 승인하지 못하게 하려면 실행 주체가 달라야 한다.
 *
 * 프롬프트·판정 파서·기록 초안은 순수 함수로 두고 세션 실행만 deps 로 주입한다(commands.ts 와 같은 방식).
 * 그래야 Orca·Electron 없이 "무엇을 지시하고 어떻게 읽는가"를 테스트할 수 있다.
 * 파서는 형식이 어긋나도 throw 하지 않는다 — 감사 인프라 오류는 verdict `error` 로 남기고 Goal 은 재시도 여지가 있다.
 */
import type {
  AcceptanceCriterion,
  AuditRecord,
  AuditScope,
  AuditVerdict,
  CriterionResult,
  GoalRecord,
  HarnessEnvelope,
} from '../../shared/contract/harness.ts';

/** 감사 세션이 쓸 수 있는 도구. 쓰기·수정 도구는 넣지 않는다(§10.4 읽기 전용 규칙). */
export const AUDIT_TOOLS = ['read', 'grep', 'find', 'ls', 'bash'] as const;

/** 감사 대상 Goal 과 그 기록 위치. `hubSessionId` 는 감사 세션을 붙일 부모 세션(그룹 감사면 허브). */
export type AuditTarget = {
  groupId: string;
  goal: GoalRecord;
  hubSessionId: string | null;
};

export type AuditPromptInput = {
  goal: GoalRecord;
  /** 감사 시작 시 고정한 커밋. 없으면 프롬프트에 "고정된 커밋 없음"으로 적는다. */
  commit: string | null;
  repoPath: string;
};

/** 판정 블록 제목. 프롬프트와 파서가 같은 문자열을 쓴다. */
const VERDICT_HEADING = '## 판정';

/** 판정 블록이 아예 없을 때의 요약. 화면·테스트가 이 문구를 그대로 쓴다. */
const MISSING_BLOCK_SUMMARY = '판정 블록을 찾지 못했습니다';

const HEADING_PATTERN = /^#{1,6}\s*판정\s*$/u;
/** `verdict: approved` 한 줄. 뒤에 설명을 붙인 줄은 판정 줄로 보지 않는다. */
const VERDICT_PATTERN = /^verdict\s*:\s*([^\s]+)\s*$/iu;
/** `- c1: pass — src/app.ts:42`. 조건 id 의 대괄호는 관대하게 허용한다(`- [c1]: pass`). */
const CRITERION_PATTERN = /^-\s*\[?([^:\]\s]+)\]?\s*:\s*(pass|fail|unknown)\b\s*(?:(?:—|--)\s*)?(.*)$/iu;

export type AuditCriterionResult = {
  criterionId: string;
  result: 'pass' | 'fail' | 'unknown';
  evidence: string;
};

export type AuditReport = {
  verdict: AuditVerdict;
  /** 완료 조건 순서(전달받은 criteria 순서)를 그대로 따른다. */
  criterionResults: AuditCriterionResult[];
  /** 판정 블록 안의 자유 서술(증거 요약). 판정 줄 뒤 문장은 넣지 않는다. */
  summary: string;
};

/**
 * 감사 세션의 시스템 프롬프트.
 * 읽기 전용 규칙·허용 도구·완료 조건·판정 블록 형식을 모두 여기서 알려준다 —
 * 감사 세션은 사람이 보는 화면이 아니라 별도 pi 세션이므로 프롬프트 밖에 규칙을 둘 곳이 없다.
 */
export function auditSystemPrompt(input: AuditPromptInput): string {
  const commit = input.commit === null ? '(고정된 커밋 없음)' : input.commit;
  const criteria =
    input.goal.acceptanceCriteria.length === 0
      ? ['- (완료 조건이 기록되지 않았다. 목표 설명만 보고 판정한다.)']
      : input.goal.acceptanceCriteria.map(
          (criterion) => `- [${criterion.id}] ${criterion.desc}`,
        );

  return [
    '너는 Goal 완료를 검사하는 읽기 전용 감사자다. 작업 세션이 아니라 분리된 감사 세션에서 실행된다.',
    '작업한 에이전트의 자기 승인은 인정되지 않는다. 너의 일은 결과물을 읽고 조건별 증거로 판정하는 것뿐이다.',
    '',
    '## 감사 대상',
    `- 저장소: ${input.repoPath}`,
    `- 감사 기준 커밋: ${commit}`,
    `- Goal: ${input.goal.id} (revision ${String(input.goal.revision)})`,
    `- 목표: ${input.goal.objective}`,
    '',
    '## 읽기 전용 규칙',
    '- 파일 쓰기·수정·삭제·이름 변경은 금지한다. 소스·설정·의존성을 바꾸는 명령도 금지한다.',
    '- 파일 생성, 커밋, 스태시, 브랜치 생성도 금지한다. 감사 산출물은 판정문 하나뿐이다.',
    '- 테스트·측정 명령 실행은 허용한다. 그 출력은 증거로만 쓰고, 명령이 만든 산출물은 커밋하지 않는다.',
    `- 사용할 수 있는 도구는 ${AUDIT_TOOLS.join(', ')} 뿐이다. 목록에 없는 도구를 쓰지 않는다.`,
    `- 감사 기준 커밋(${commit}) 이후 워크트리가 바뀌었으면 verdict 를 쓰지 않고 error 로 끝낸다.`,
    '',
    '## 완료 조건',
    ...criteria,
    '',
    '조건마다 증거를 확인한다. 증거가 없거나 조건을 충족하지 못하면 pass 로 쓰지 않는다.',
    '증거는 파일 경로와 줄 번호(`src/app.ts:42`) 또는 실행한 명령과 그 출력으로 적는다.',
    '',
    '## 판정 형식',
    '응답의 마지막은 아래 형식의 코드 블록이어야 한다. 블록 밖에 다른 판정을 쓰지 않는다.',
    '',
    '```',
    VERDICT_HEADING,
    '- <criterion id>: pass|fail|unknown — <evidence: file:line or command output>',
    'verdict: approved|rejected|impossible|error',
    '```',
    '',
    '- 조건 줄은 완료 조건마다 하나씩 쓴다. 조건 id 는 위 목록 대괄호 안 값이다.',
    '- evidence 가 없는 조건은 unknown 으로 쓰고 근거가 없다는 사실을 적는다.',
    '- verdict 뜻: approved = 조건을 모두 충족, rejected = 작업으로 고칠 수 있는 실패, impossible = 현재 조건으로 완료 불가, error = 감사 자체 실패(도구 오류·커밋 불일치 등).',
  ].join('\n');
}

/** 결과 토큰을 계약 값으로 좁힌다. 목록 밖 토큰은 null. */
function toCriterionResult(raw: string | undefined): AuditCriterionResult['result'] | null {
  switch (raw === undefined ? '' : raw.toLowerCase()) {
    case 'pass':
      return 'pass';
    case 'fail':
      return 'fail';
    case 'unknown':
      return 'unknown';
    default:
      return null;
  }
}

/** verdict 줄의 토큰을 계약 값으로 좁힌다. 목록 밖 토큰은 null(파서가 error 로 낮춘다). */
function toVerdict(raw: string | null): AuditVerdict | null {
  const token = raw === null ? '' : raw.replace(/[.,;]+$/u, '').toLowerCase();
  switch (token) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'impossible':
      return 'impossible';
    case 'error':
      return 'error';
    default:
      return null;
  }
}

/** 판정이 없는 조건을 unknown 으로 채운다 — 조건 누락이 승인으로 새지 않게 한다. */
function unknownResults(criteria: readonly AcceptanceCriterion[]): AuditCriterionResult[] {
  return criteria.map((criterion) => ({
    criterionId: criterion.id,
    result: 'unknown',
    evidence: '',
  }));
}

/** 찾은 판정을 완료 조건 순서로 재배열한다. 조건에 없는 id 는 버린다(계약에 없는 조건을 만들지 않는다). */
function mergeResults(
  found: ReadonlyMap<string, { result: AuditCriterionResult['result']; evidence: string }>,
  criteria: readonly AcceptanceCriterion[],
): AuditCriterionResult[] {
  return criteria.map((criterion) => {
    const hit = found.get(criterion.id);
    return hit === undefined
      ? { criterionId: criterion.id, result: 'unknown', evidence: '' }
      : { criterionId: criterion.id, result: hit.result, evidence: hit.evidence };
  });
}

/** 판정 블록의 자유 서술과 오류 사유를 한 줄로 합친다. */
function joinSummary(notes: string, reason: string | null): string {
  if (reason === null) return notes;
  return notes === '' ? reason : `${notes} / ${reason}`;
}

/**
 * 감사 세션의 응답에서 판정을 읽는다(§10.4).
 *
 * - `## 판정` 블록이 없으면 verdict `error` + `판정 블록을 찾지 못했습니다`.
 * - 조건 줄이 없는 완료 조건은 `unknown`·빈 증거로 남는다(누락을 통과로 읽지 않는다).
 * - verdict 줄이 없거나 목록 밖 토큰이면 `error`.
 * - 같은 조건·verdict 줄이 여러 번 나오면 첫 줄만 쓴다.
 * - 어떤 입력에도 throw 하지 않는다.
 */
export function parseAuditReport(
  text: string,
  criteria: readonly AcceptanceCriterion[],
): AuditReport {
  const lines = text.split(/\r?\n/u);
  const headingIndex = lines.findIndex((line) => HEADING_PATTERN.test(line.trim()));

  if (headingIndex === -1) {
    return {
      verdict: 'error',
      criterionResults: unknownResults(criteria),
      summary: MISSING_BLOCK_SUMMARY,
    };
  }

  const found = new Map<string, { result: AuditCriterionResult['result']; evidence: string }>();
  const notes: string[] = [];
  let rawVerdict: string | null = null;

  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim();
    // 코드 펜스·빈 줄·다른 제목은 판정 내용이 아니다.
    if (trimmed === '' || trimmed.startsWith('```') || trimmed.startsWith('#')) continue;

    const verdictMatch = VERDICT_PATTERN.exec(trimmed);
    if (verdictMatch !== null) {
      if (rawVerdict === null) rawVerdict = verdictMatch[1] ?? '';
      // verdict 는 블록의 마지막 줄이다 — 뒤 문장은 요약에 넣지 않는다.
      continue;
    }

    const criterionMatch = CRITERION_PATTERN.exec(trimmed);
    if (criterionMatch !== null) {
      const id = criterionMatch[1] ?? '';
      const result = toCriterionResult(criterionMatch[2]);
      if (id !== '' && result !== null && !found.has(id)) {
        found.set(id, { result, evidence: (criterionMatch[3] ?? '').trim() });
      }
      continue;
    }

    if (rawVerdict === null) notes.push(trimmed);
  }

  const summary = notes.join(' ').trim();
  const verdict = toVerdict(rawVerdict);

  if (verdict === null) {
    const reason =
      rawVerdict === null ? 'verdict 줄을 찾지 못했습니다' : `알 수 없는 verdict: ${rawVerdict}`;
    return {
      verdict: 'error',
      criterionResults: mergeResults(found, criteria),
      summary: joinSummary(summary, reason),
    };
  }

  return { verdict, criterionResults: mergeResults(found, criteria), summary };
}

/** 감사 세션 시작 결과. 실행기·호출부가 분기만 하도록 좁힌 합 타입으로 돌려준다. */
export type AuditLaunch =
  | { ok: true; terminalId: string | null; sessionId: string | null }
  | { ok: false; error: string };

/** 감사 세션 실행에 필요한 바깥 세계. 테스트는 이 두 함수만 바꿔 끼운다. */
export type AuditDeps = {
  headCommit(repoPath: string): Promise<string | null>;
  launch(input: { cwd: string; prompt: string; model: string | null }): Promise<{
    ok: boolean;
    terminalId?: string | null;
    sessionId?: string | null;
    error?: string;
  }>;
};

export type AuditStartInput = {
  target: AuditTarget;
  repoPath: string;
  model: string | null;
};

/**
 * 감사 세션 실행기. 커밋 고정 → 프롬프트 작성 → 세션 실행 순서로만 움직인다(§10.4, §51).
 * 도구 제한은 실행 인자가 아니라 프롬프트 문장으로만 전달한다 — 실행기는 도구 목록을 모른다.
 * headCommit·launch 실패는 throw 대신 `ok:false` 로 돌려준다. 호출부는 그때 Goal 을 `paused`(`audit_error`)로
 * 두고 다시 시도할 수 있어야 한다.
 */
export function createAuditRunner(deps: AuditDeps): {
  start(input: AuditStartInput): Promise<AuditLaunch>;
} {
  return {
    async start(input) {
      try {
        const commit = await deps.headCommit(input.repoPath);
        const prompt = auditSystemPrompt({
          goal: input.target.goal,
          commit,
          repoPath: input.repoPath,
        });
        const launched = await deps.launch({
          cwd: input.repoPath,
          prompt,
          model: input.model,
        });

        if (!launched.ok) {
          return { ok: false, error: launched.error ?? '감사 세션을 시작하지 못했습니다.' };
        }

        return {
          ok: true,
          terminalId: launched.terminalId ?? null,
          sessionId: launched.sessionId ?? null,
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/** 감사 기록 초안(봉투 제외). 저장은 호출부가 봉투(id·seq·at·writer)를 붙여 append 한다. */
export type AuditRecordDraft = Omit<AuditRecord, keyof HarnessEnvelope> & { type: 'audit' };

export type AuditRecordInput = {
  /** 봉투에 들어가는 그룹 id. 초안에는 넣지 않는다 — 호출부가 `makeEnvelope` 로 붙인다. */
  groupId: string;
  goal: GoalRecord;
  report: ReturnType<typeof parseAuditReport>;
  commit: string | null;
  auditSessionId: string | null;
  at: string;
  /** 감사 범위. 세션 감사가 기본이고 상위 세션·그룹 감사는 호출부가 지정한다(§10.4). */
  scope?: AuditScope;
};

/**
 * 파서 결과를 저장 가능한 Audit 기록 초안으로 옮긴다.
 * 계약에 없는 필드를 만들지 않는다 — 스펙 용어(criterionResults·summary·commit)는 계약 이름
 * (`criteriaResults`·`evidenceSummary`·`commitHash`)으로 옮기고, revision 은 `goal.revision` 을 고정한다(§51).
 * 판정 원문은 감사 세션 채팅에 남으므로 `report` 는 null 이고, `durationMs` 는 시작·종료가 같은 시각이라 0 이다.
 */
export function auditRecordFor(input: AuditRecordInput): AuditRecordDraft {
  const criteriaResults: CriterionResult[] = input.report.criterionResults.map((result) => ({
    criterion: result.criterionId,
    result: result.result,
    evidence: result.evidence,
  }));
  const summary = input.report.summary.trim();

  return {
    type: 'audit',
    goalId: input.goal.id,
    scope: input.scope ?? 'session',
    auditSessionId: input.auditSessionId,
    state: 'finished',
    skipReason: null,
    skippedBy: null,
    skippedAt: null,
    verdict: input.report.verdict,
    commitHash: input.commit,
    worktreeState: null,
    criteriaResults,
    // 증거 요약이 비면 빈 문자열 대신 null 로 둔다 — 화면이 "요약 없음"으로 구분해 그린다.
    evidenceSummary: summary === '' ? null : summary,
    report: null,
    model: null,
    revision: input.goal.revision,
    createdAt: input.at,
    finishedAt: input.at,
    durationMs: 0,
  };
}
