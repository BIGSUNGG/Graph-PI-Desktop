/**
 * 감사 세션(audit-session.ts) 회귀 테스트(§10.4, §51).
 * 고정하는 계약:
 * - 감사 프롬프트가 조건 id·읽기 전용 규칙·판정 블록 형식을 모두 담는다
 * - 판정 파서가 전체 보고·조건 누락·블록 없음·알 수 없는 verdict·증거 안의 `—` 를 견딘다
 * - 실행기가 HEAD 커밋을 고정해 프롬프트로 넘기고, 실패를 throw 대신 `ok:false` 로 돌려준다
 * - 기록 초안이 goal.revision·커밋·조건 결과·증거 요약을 채운다
 * 실행: `node --test src/main/harness/audit-session.test.ts`
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AcceptanceCriterion, GoalRecord } from '../../shared/contract/harness.ts';
import { HARNESS_SCHEMA_VERSION } from '../../shared/contract/harness.ts';
import {
  AUDIT_TOOLS,
  auditRecordFor,
  auditSystemPrompt,
  createAuditRunner,
  parseAuditReport,
  type AuditDeps,
  type AuditTarget,
} from './audit-session.ts';

const AT = '2026-11-25T00:00:00.000Z';

const CRITERIA: AcceptanceCriterion[] = [
  { id: 'c1', desc: '빌드가 통과한다', passed: false, evidence: null },
  { id: 'c2', desc: '테스트가 통과한다', passed: false, evidence: null },
];

const GOAL: GoalRecord = {
  type: 'goal',
  id: 'goal_1',
  groupId: 'g1',
  seq: 1,
  at: AT,
  schemaVersion: HARNESS_SCHEMA_VERSION,
  writer: 's1',
  sessionId: 's1',
  parentListItemId: null,
  parentGoalId: null,
  supersededByGoalId: null,
  objective: '결제 화면을 완성한다',
  acceptanceCriteria: CRITERIA,
  status: 'auditing',
  pauseReason: null,
  auditAttemptCount: 1,
  revision: 3,
  loopId: null,
  latestAuditId: null,
  createdAt: AT,
  updatedAt: AT,
  completedAt: null,
  completedRevision: null,
  archivedAt: null,
};

const TARGET: AuditTarget = { groupId: 'g1', goal: GOAL, hubSessionId: 'hub_1' };

/** 조건 두 개를 모두 통과로 쓴 정상 보고. 블록 앞뒤 문장은 요약에 섞이면 안 된다. */
const FULL_REPORT = [
  '저장소를 읽고 테스트를 실행했다.',
  '',
  '## 판정',
  '두 조건을 확인했다. 빌드 로그와 e2e 출력을 대조했다.',
  '- c1: pass — src/app.ts:42 빌드 로그 통과',
  '- c2: pass — e2e 7 passed',
  'verdict: approved',
  '',
  '이 문장은 판정 뒤에 붙은 잡담이라 요약에 넣지 않는다.',
].join('\n');

type LaunchCall = { cwd: string; prompt: string; model: string | null };

// (1) 프롬프트 — 조건·판정 형식
test('감사 프롬프트는 모든 완료 조건 id 와 판정 블록 형식을 담는다', () => {
  const prompt = auditSystemPrompt({ goal: GOAL, commit: 'abc123', repoPath: 'C:/repo' });

  // 조건은 `- [id] 설명` 으로 나열한다 — 감사자가 조건 id 를 그대로 인용할 수 있어야 한다.
  assert.ok(prompt.includes('- [c1] 빌드가 통과한다'), 'c1 누락');
  assert.ok(prompt.includes('- [c2] 테스트가 통과한다'), 'c2 누락');
  assert.ok(prompt.includes('## 판정'), '판정 블록 제목 누락');
  assert.ok(
    prompt.includes('- <criterion id>: pass|fail|unknown — <evidence: file:line or command output>'),
    '조건 줄 형식 누락',
  );
  assert.ok(prompt.includes('verdict: approved|rejected|impossible|error'), 'verdict 줄 형식 누락');
  // 대상 식별자 — 감사자가 어느 Goal·어느 커밋을 보는지 프롬프트만으로 알 수 있어야 한다.
  assert.ok(prompt.includes('C:/repo'), '저장소 경로 누락');
  assert.ok(prompt.includes('abc123'), '고정 커밋 누락');
  assert.ok(prompt.includes('goal_1'), 'goal id 누락');
  assert.ok(prompt.includes('revision 3'), 'goal revision 누락');
});

// (2) 프롬프트 — 읽기 전용 규칙 + 테스트 허용
test('감사 프롬프트는 읽기 전용 규칙과 테스트 실행 허용을 함께 적는다', () => {
  const prompt = auditSystemPrompt({ goal: GOAL, commit: 'abc123', repoPath: 'C:/repo' });

  assert.match(prompt, /읽기 전용/u);
  assert.match(prompt, /파일 쓰기·수정·삭제/u);
  assert.match(prompt, /테스트·측정 명령 실행은 허용/u);
  // 도구 목록은 상수에서 만든다 — 프롬프트와 실행기가 같은 목록을 본다.
  assert.ok(prompt.includes(AUDIT_TOOLS.join(', ')), '허용 도구 목록 누락');
  const tools: readonly string[] = AUDIT_TOOLS;
  assert.equal(tools.includes('write'), false);
  assert.equal(tools.includes('edit'), false);
});

// (3) 프롬프트 — 커밋 없음
test('감사 프롬프트는 커밋이 고정되지 않았으면 그 사실을 적는다', () => {
  const prompt = auditSystemPrompt({ goal: GOAL, commit: null, repoPath: 'C:/repo' });

  assert.ok(prompt.includes('(고정된 커밋 없음)'), '커밋 없음 안내 누락');
  assert.equal(prompt.includes('undefined'), false);
  assert.equal(prompt.includes('null'), false);
});

// (4) 파서 — 정상 보고
test('판정 블록이 온전하면 조건 순서대로 verdict·증거를 읽는다', () => {
  const report = parseAuditReport(FULL_REPORT, CRITERIA);

  assert.equal(report.verdict, 'approved');
  assert.deepEqual(report.criterionResults, [
    { criterionId: 'c1', result: 'pass', evidence: 'src/app.ts:42 빌드 로그 통과' },
    { criterionId: 'c2', result: 'pass', evidence: 'e2e 7 passed' },
  ]);
  // 블록 안의 자유 서술만 요약이다 — 블록 앞 문장과 verdict 뒤 문장은 들어가지 않는다.
  assert.equal(report.summary, '두 조건을 확인했다. 빌드 로그와 e2e 출력을 대조했다.');
});

// (5) 파서 — 조건 누락
test('판정 블록에 빠진 조건은 unknown 과 빈 증거로 남는다', () => {
  const report = parseAuditReport(
    ['## 판정', '- c1: pass — src/a.ts:1', 'verdict: rejected'].join('\n'),
    CRITERIA,
  );

  assert.equal(report.verdict, 'rejected');
  assert.deepEqual(report.criterionResults, [
    { criterionId: 'c1', result: 'pass', evidence: 'src/a.ts:1' },
    { criterionId: 'c2', result: 'unknown', evidence: '' },
  ]);
  assert.equal(report.summary, '');
});

// (6) 파서 — 블록 없음
test('판정 블록이 없으면 error 와 고정 문구를 돌려준다', () => {
  const report = parseAuditReport('조건은 모두 통과했다. verdict: approved', CRITERIA);

  assert.equal(report.verdict, 'error');
  assert.equal(report.summary, '판정 블록을 찾지 못했습니다');
  assert.deepEqual(report.criterionResults.map((result) => result.result), ['unknown', 'unknown']);
  // 블록이 없어도 빈 문자열·null 같은 함정 없이 조건마다 증거 칸이 있어야 한다.
  assert.deepEqual(report.criterionResults.map((result) => result.evidence), ['', '']);
});

// (7) 파서 — 알 수 없는 verdict / verdict 줄 없음
test('목록에 없는 verdict 토큰이나 verdict 줄 누락은 error 로 낮춘다', () => {
  const unknownToken = parseAuditReport(
    ['## 판정', '- c1: pass — a.ts:1', 'verdict: probably'].join('\n'),
    CRITERIA,
  );
  assert.equal(unknownToken.verdict, 'error');
  assert.match(unknownToken.summary, /알 수 없는 verdict: probably/u);

  const missingLine = parseAuditReport(['## 판정', '- c1: pass — a.ts:1'].join('\n'), CRITERIA);
  assert.equal(missingLine.verdict, 'error');
  assert.match(missingLine.summary, /verdict 줄을 찾지 못했습니다/u);
  // verdict 가 error 여도 읽은 조건 결과는 버리지 않는다 — 화면이 실패 항목을 보여줄 수 있어야 한다.
  assert.equal(missingLine.criterionResults[0]?.result, 'pass');
});

// (8) 파서 — 증거 안의 `—`
test('증거 안의 — 기호는 증거의 일부로 남는다', () => {
  const report = parseAuditReport(
    ['## 판정', '- c1: pass — 로그 C — 로그 D 를 비교함', '- c2: fail — a.ts:9 — b.ts:12 불일치', 'verdict: rejected'].join('\n'),
    CRITERIA,
  );

  assert.equal(report.criterionResults[0]?.evidence, '로그 C — 로그 D 를 비교함');
  assert.equal(report.criterionResults[1]?.evidence, 'a.ts:9 — b.ts:12 불일치');
  assert.equal(report.verdict, 'rejected');
});

// (9) 파서 — 관대한 표기
test('대문자 결과와 대괄호 조건 id 도 같은 판정으로 읽는다', () => {
  const report = parseAuditReport(
    ['## 판정', '- [c1]: PASS — a.ts:9', 'verdict: APPROVED'].join('\n'),
    CRITERIA,
  );
  assert.equal(report.verdict, 'approved');
  assert.equal(report.criterionResults[0]?.result, 'pass');
  assert.equal(report.criterionResults[1]?.result, 'unknown');

  // 완료 조건이 없으면 결과도 비고, 판정은 그대로 읽는다(감사 대상 없는 승인을 만들지 않는다).
  const withoutCriteria = parseAuditReport(['## 판정', 'verdict: rejected'].join('\n'), []);
  assert.deepEqual(withoutCriteria.criterionResults, []);
  assert.equal(withoutCriteria.verdict, 'rejected');
});

// (10) 실행기 — 커밋 고정 + 프롬프트 전달
test('실행기는 HEAD 커밋을 고정해 프롬프트에 넣고 launch 로 넘긴다', async () => {
  const seen: { repoPath: string; launch: LaunchCall | null } = { repoPath: '', launch: null };
  const deps: AuditDeps = {
    headCommit: async (repoPath) => {
      seen.repoPath = repoPath;
      return 'abc123';
    },
    launch: async (input) => {
      seen.launch = input;
      return { ok: true, terminalId: 'term-9', sessionId: 'sess-9' };
    },
  };

  const launch = await createAuditRunner(deps).start({
    target: TARGET,
    repoPath: 'C:/repo',
    model: 'model-a',
  });

  assert.equal(seen.repoPath, 'C:/repo');
  assert.deepEqual(launch, { ok: true, terminalId: 'term-9', sessionId: 'sess-9' });
  assert.equal(seen.launch?.cwd, 'C:/repo');
  assert.equal(seen.launch?.model, 'model-a');
  // 고정 커밋·조건 id·허용 도구가 모두 프롬프트로만 전달된다(실행 인자에 도구 목록은 없다).
  assert.ok(seen.launch?.prompt.includes('abc123'), '고정 커밋 누락');
  assert.ok(seen.launch?.prompt.includes('- [c1] 빌드가 통과한다'), '조건 누락');
  assert.ok(seen.launch?.prompt.includes(AUDIT_TOOLS.join(', ')), '도구 목록 누락');
});

// (11) 실행기 — 예외를 ok:false 로
test('실행기는 launch·headCommit 예외를 ok:false 로 감싼다', async () => {
  const launchThrows: AuditDeps = {
    headCommit: async () => 'abc123',
    launch: async () => {
      throw new Error('pty 생성 실패');
    },
  };
  assert.deepEqual(
    await createAuditRunner(launchThrows).start({
      target: TARGET,
      repoPath: 'C:/repo',
      model: null,
    }),
    { ok: false, error: 'pty 생성 실패' },
  );

  const headThrows: AuditDeps = {
    headCommit: async () => {
      throw new Error('git 없음');
    },
    launch: async () => ({ ok: true }),
  };
  assert.deepEqual(
    await createAuditRunner(headThrows).start({
      target: TARGET,
      repoPath: 'C:/repo',
      model: null,
    }),
    { ok: false, error: 'git 없음' },
  );
});

// (12) 실행기 — 실패 사유 전달, id 없음
test('실행기는 launch 실패 사유를 넘기고 받은 id 가 없으면 null 로 채운다', async () => {
  const failed = await createAuditRunner({
    headCommit: async () => null,
    launch: async () => ({ ok: false, error: '모델을 찾을 수 없습니다' }),
  }).start({ target: TARGET, repoPath: 'C:/repo', model: null });
  assert.deepEqual(failed, { ok: false, error: '모델을 찾을 수 없습니다' });

  const bare = await createAuditRunner({
    headCommit: async () => null,
    launch: async () => ({ ok: true }),
  }).start({ target: TARGET, repoPath: 'C:/repo', model: null });
  assert.deepEqual(bare, { ok: true, terminalId: null, sessionId: null });
});

// (13) 기록 초안
test('auditRecordFor 는 goal revision·커밋·조건 결과·증거 요약을 채운다', () => {
  const report = parseAuditReport(FULL_REPORT, CRITERIA);
  const record = auditRecordFor({
    groupId: GOAL.groupId,
    goal: GOAL,
    report,
    commit: 'abc123',
    auditSessionId: 'audit_s1',
    at: AT,
  });

  assert.equal(record.type, 'audit');
  assert.equal(record.goalId, 'goal_1');
  // 감사한 revision 을 고정해야 이후 개정이 승인을 재사용하지 못한다(§10.1, §51).
  assert.equal(record.revision, 3);
  assert.equal(record.commitHash, 'abc123');
  assert.equal(record.auditSessionId, 'audit_s1');
  assert.equal(record.verdict, 'approved');
  assert.equal(record.scope, 'session');
  assert.equal(record.state, 'finished');
  assert.equal(record.createdAt, AT);
  assert.equal(record.finishedAt, AT);
  assert.equal(record.durationMs, 0);
  // 계약 이름으로 옮긴다 — criterionResults·summary·commit 은 계약 필드로 매핑된다.
  assert.deepEqual(record.criteriaResults, [
    { criterion: 'c1', result: 'pass', evidence: 'src/app.ts:42 빌드 로그 통과' },
    { criterion: 'c2', result: 'pass', evidence: 'e2e 7 passed' },
  ]);
  assert.equal(record.evidenceSummary, '두 조건을 확인했다. 빌드 로그와 e2e 출력을 대조했다.');
  assert.equal(record.report, null);
  assert.equal(record.model, null);
  assert.equal(record.skipReason, null);
});

// (14) 기록 초안 — 오류 판정·범위 지정
test('auditRecordFor 는 판정 블록이 없으면 error 기록을 남기고 scope 를 지정할 수 있다', () => {
  const report = parseAuditReport('아무 보고 없음', CRITERIA);
  const record = auditRecordFor({
    groupId: GOAL.groupId,
    goal: GOAL,
    report,
    commit: null,
    auditSessionId: null,
    at: AT,
    scope: 'group',
  });

  assert.equal(record.verdict, 'error');
  assert.equal(record.scope, 'group');
  assert.equal(record.commitHash, null);
  assert.equal(record.auditSessionId, null);
  assert.equal(record.evidenceSummary, '판정 블록을 찾지 못했습니다');
  assert.deepEqual(record.criteriaResults.map((result) => result.result), ['unknown', 'unknown']);
});
