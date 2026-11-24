/**
 * 허브 초기 프롬프트(preset.ts) 검증. `node --test` 로 그대로 실행된다.
 * Electron·orca 를 쓰지 않으므로 순수 문자열 규칙만 확인한다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESET_KINDS, PRESETS, type PresetKind } from '../shared/contract/index.ts';
import { MANUAL_WAIT_LINE, hubInitialPrompt, hubSystemPrompt, presetInstruction, type HubContext } from './preset.ts';

function makeContext(overrides: Partial<HubContext> = {}): HubContext {
  return {
    groupId: 'g_alpha1',
    groupName: '알파 그룹',
    groupCwd: 'C:/groups/alpha',
    cliPath: 'C:/app/packages/harness/src/cli.ts',
    preset: 'feature',
    firstPrompt: '로그인·회원가입을 백엔드에 구현해.',
    ...overrides,
  };
}

test('시스템 지시에 그룹 id·그룹 폴더·CLI 경로가 그대로 들어간다', () => {
  const ctx = makeContext();
  const text = hubSystemPrompt(ctx);
  assert.ok(text.includes(ctx.groupId), 'groupId 누락');
  assert.ok(text.includes(ctx.groupCwd), 'groupCwd 누락');
  assert.ok(text.includes(ctx.cliPath), 'cliPath 누락');
  assert.ok(text.includes(ctx.groupName), 'groupName 누락');
  // 상태 기록은 CLI 로만: 실행 형태가 프롬프트에 보여야 한다.
  assert.ok(text.includes(`node "${ctx.cliPath}"`), 'node "<cliPath>" 실행 형태 누락');
  assert.ok(text.includes(`--group ${ctx.groupId} --writer hub`), '--group/--writer hub 누락');
});

test('모든 프리셋에서 예외 없이 문자열이 나오고 flow 항목이 모두 들어간다', () => {
  for (const kind of PRESET_KINDS) {
    const meta = PRESETS.find((item) => item.id === kind);
    if (meta === undefined) assert.fail(`${kind} 프리셋 메타가 없다`);
    const prompt = hubInitialPrompt(makeContext({ preset: kind }));
    assert.equal(typeof prompt, 'string');
    assert.ok(prompt.length > 0, `${kind}: 빈 문자열`);
    for (const step of meta.flow) {
      assert.ok(prompt.includes(step), `${kind}: flow 항목 "${step}" 누락`);
    }
  }
});

test('firstPrompt 가 비면 "첫 요청:" 줄이 없고 Manual 대기 문구가 있다', () => {
  const prompt = hubInitialPrompt(makeContext({ firstPrompt: '' }));
  assert.ok(!prompt.includes('첫 요청:'), '빈 firstPrompt 인데 "첫 요청:" 줄이 있다');
  assert.ok(prompt.includes(MANUAL_WAIT_LINE), '수동 대기 문구 누락');
  assert.ok(prompt.includes('기다'), '대기 지시 누락');
});

test('firstPrompt 가 있으면 "첫 요청: …" 줄이 들어가고 대기 문구는 없다', () => {
  const prompt = hubInitialPrompt(makeContext({ firstPrompt: '보안·속도·확장성을 검토해.' }));
  assert.ok(prompt.includes('첫 요청: 보안·속도·확장성을 검토해.'), '첫 요청 줄 누락');
  assert.ok(!prompt.includes(MANUAL_WAIT_LINE), 'firstPrompt 가 있는데 대기 문구가 붙었다');
});

test('ask·say·command 사용법과 answered 응답 확인 방법이 들어간다', () => {
  const ctx = makeContext();
  const text = hubSystemPrompt(ctx);
  assert.ok(text.includes('--question'), 'ask --question 누락');
  assert.ok(text.includes('--option'), 'ask --option 누락');
  assert.ok(text.includes('--multi'), 'ask --multi 누락');
  assert.ok(text.includes('--from') && text.includes('--to'), 'say --from/--to 누락');
  assert.ok(
    text.includes('remove-worktree') &&
      text.includes('rename-worktree') &&
      text.includes('remove-session') &&
      text.includes('rename-session'),
    'command --action 목록 누락',
  );
  assert.ok(text.includes('status:"answered"'), 'answered 상태 표기 누락');
  assert.ok(text.includes('answer'), 'answer 필드 안내 누락');
  assert.ok(text.includes('orca worktree create'), 'orca worktree create 사용법 누락');
  assert.ok(text.includes('중복 생성하지 않는다'), '중복 질문 금지 안내 누락');
});

test('presetInstruction 은 프리셋마다 비어 있지 않은 지시 배열을 돌려준다', () => {
  for (const kind of PRESET_KINDS) {
    const lines = presetInstruction(kind);
    assert.ok(Array.isArray(lines), `${kind}: 배열이 아니다`);
    assert.ok(lines.length > 0, `${kind}: 빈 배열`);
    for (const line of lines) assert.ok(line.trim() !== '', `${kind}: 빈 지시문`);
  }
  const kinds: PresetKind[] = [...PRESET_KINDS];
  assert.deepEqual(kinds, ['feature', 'loop', 'manual']);
});

test('hubInitialPrompt 는 시스템 지시 + 프리셋 지시 + 첫 요청을 모두 담는다', () => {
  const ctx = makeContext({ preset: 'loop', firstPrompt: '보안 검토' });
  const prompt = hubInitialPrompt(ctx);
  assert.ok(prompt.startsWith(hubSystemPrompt(ctx)), '시스템 지시로 시작하지 않는다');
  for (const line of presetInstruction('loop')) {
    assert.ok(prompt.includes(line), `프리셋 지시 누락: ${line}`);
  }
  assert.ok(prompt.trimEnd().endsWith('첫 요청: 보안 검토'), '첫 요청이 마지막 줄이 아니다');
});
