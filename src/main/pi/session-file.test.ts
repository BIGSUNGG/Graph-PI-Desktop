/**
 * Pi JSONL v3 파서 회귀 테스트(수용기준 10, SPEC-graph-pi-ade 200):
 * 모르는 레코드 타입은 경고 1건으로 모으고 나머지 줄은 계속 읽는다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHeader, parseRecords } from './session-file.ts';

const HEADER = JSON.stringify({ type: 'session', version: 3, id: 'sess-1', cwd: 'C:/repo' });

function line(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

test('모르는 레코드 타입이 두 종류 섞여도 경고는 1건이다', () => {
  const parsed = parseRecords(
    [
      line({ type: 'message', message: { role: 'user', at: '2026-11-25T00:00:00.000Z', content: '안녕' } }),
      line({ type: 'telemetry', payload: { whatever: 1 } }),
      line({ type: 'branch', name: 'main' }),
      line({ type: 'message', message: { role: 'assistant', at: '2026-11-25T00:00:01.000Z', content: '네' } }),
    ],
    { sessionId: 'sess-1', filePath: 'C:/x/sess-1.jsonl' },
  );

  assert.equal(parsed.messages.length, 2);
  const unknown = parsed.warnings.filter((warning) => warning.kind === 'unknown-record-type');
  assert.equal(unknown.length, 1);
  assert.match(unknown[0]?.detail ?? '', /telemetry|branch/);
});

test('깨진 JSON 줄은 경고 후 건너뛰고 나머지를 읽는다', () => {
  const parsed = parseRecords([
    '{ "type": "message", ',
    line({ type: 'message', message: { role: 'user', at: '2026-11-25T00:00:00.000Z', content: '계속' } }),
  ]);

  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.messages[0]?.text, '계속');
  assert.equal(parsed.warnings.filter((warning) => warning.kind === 'malformed-line').length, 1);
});

test('content 배열의 text·think 블록을 나눠 담는다', () => {
  const parsed = parseRecords([
    line({
      type: 'message',
      message: {
        role: 'assistant',
        at: '2026-11-25T00:00:02.000Z',
        model: 'deepseek-v4.1-flash',
        usage: { input: 10, output: 5 },
        content: [
          { type: 'thinking', text: '고민' },
          { type: 'text', text: '결론' },
        ],
      },
    }),
  ]);

  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.messages[0]?.text, '결론');
  assert.equal(parsed.messages[0]?.think, '고민');
  assert.equal(parsed.messages[0]?.usage?.input, 10);
});

test('헤더 파서가 id·cwd·부모를 읽고 없는 필드는 null 로 둔다', () => {
  const header = parseHeader(HEADER);
  assert.equal(header?.id, 'sess-1');
  assert.equal(header?.cwd, 'C:/repo');
  assert.equal(header?.parentSessionId, null);
});
