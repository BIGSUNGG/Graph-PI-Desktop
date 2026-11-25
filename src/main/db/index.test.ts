/**
 * 본문 검색 회귀 테스트(수용기준 32, SPEC-graph-pi-ade 197):
 * 30일이 지난 세션의 본문도 검색에 나오고, 목록 창과는 별개로 계산된다.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { PiMessage } from '../../shared/contract/index.ts';
import { createIndexService } from './index.ts';

const DAY = 24 * 60 * 60 * 1000;

function message(id: string, text: string, at: string): PiMessage {
  return { id, sessionId: 'old-session', role: 'user', at, text, think: '', usage: null };
}

test('30일 이전 세션 본문도 검색 결과에 나온다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'graph-pi-index-'));
  const index = createIndexService({ dbPath: join(dir, 'index.sqlite'), sessionsRoot: dir });
  const old = new Date(Date.now() - 40 * DAY).toISOString();

  index.upsertSession(
    {
      sessionId: 'old-session',
      filePath: join(dir, 'old-session.jsonl'),
      cwd: 'C:/repo',
      parentSessionId: null,
      createdAt: old,
      mtimeMs: Date.now() - 40 * DAY,
      sizeBytes: 2048,
    },
    [message('m1', '아주 오래된 본문의 결정적 문장', old)],
    'deepseek-v4.1-flash',
  );

  const found = index.search({ text: '결정적 문장', limit: 10 });
  assert.ok(found.hits.length >= 1);
  assert.equal(found.hits[0]?.sessionId, 'old-session');

  // 목록 창(30일)과 검색은 별개다 — 창 밖이면 목록에서는 빠진다.
  const recent = index.list({ includeOlder: false, limit: 10 });
  assert.equal(recent.some((entry) => entry.sessionId === 'old-session'), false);
  const older = index.list({ includeOlder: true, limit: 10 });
  assert.equal(older.some((entry) => entry.sessionId === 'old-session'), true);
});
