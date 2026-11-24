import assert from 'node:assert/strict';
import test from 'node:test';
import type { RefCandidate } from '../contract/refs.ts';
import { tokenAtCursor, tokenizeRefs } from './tokenize.ts';
import { resolveTokens } from '../../main/refs/resolve.ts';

const candidates: RefCandidate[] = [
  { kind: 'worktree', handle: 'web', label: 'web', detail: 'C:/repos/web' },
  { kind: 'branch', handle: 'feature-login', label: 'feature/login', detail: 'C:/repos/web' },
];

test('토크나이저는 @ 뒤 handle 과 나머지를 분리한다', () => {
  const [token] = tokenizeRefs('고쳐줘 @web/src/app.ts 그리고 계속');
  assert.ok(token);
  assert.equal(token.head, 'web');
  assert.equal(token.rest, 'src/app.ts');
  assert.equal(token.raw, 'web/src/app.ts');
});

test('이메일 안의 @ 는 참조로 보지 않는다', () => {
  assert.deepEqual(tokenizeRefs('메일 a@b.com 으로'), []);
});

test('커서가 놓인 미완성 토큰을 찾는다', () => {
  const text = '@we';
  const token = tokenAtCursor(text, text.length);
  assert.equal(token?.head, 'we');
});

test('해석되지 않는 참조는 전송을 막는다', () => {
  const validation = resolveTokens(tokenizeRefs('@없는것/값 보내기'), candidates);
  assert.equal(validation.ok, false);
  assert.equal(validation.unresolved.length, 1);
});

test('값 없는 `@handle/` 는 미해석으로 본다', () => {
  const validation = resolveTokens(tokenizeRefs('@web/'), candidates);
  assert.equal(validation.ok, false);
});

test('맞는 참조는 경로까지 해석한다', () => {
  const validation = resolveTokens(tokenizeRefs('@web/src 보기'), candidates);
  assert.equal(validation.ok, true);
  const [resolution] = validation.resolutions;
  assert.ok(resolution?.ok);
  assert.equal(resolution.resolvedPath, 'C:/repos/web');
});
