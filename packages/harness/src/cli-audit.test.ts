/**
 * CLI 런타임 전이 테스트(수용기준 51·52·611): Audit 시작은 대상 Goal 을 `auditing` 으로 만들고,
 * 거부되면 Goal 이 `active` 로 돌아오면서 원 항목은 그대로 둔 채 보완 항목이 대기로 추가된다.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { HarnessSnapshot } from '../../../src/shared/contract/index.ts';
import { createHarnessStore } from './store.ts';

const CLI = join(import.meta.dirname, 'cli.ts');

function run(data: string, argv: string[]): string {
  return execFileSync(process.execPath, [CLI, ...argv], {
    encoding: 'utf8',
    env: { ...process.env, GRAPH_PI_DATA_DIR: data },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function idOf(out: string, kind: string): string {
  const match = new RegExp(`^ok ${kind} (\\S+)`, 'm').exec(out);
  assert.ok(match, `명령 출력에서 ${kind} id 를 찾지 못했습니다: ${out}`);
  return match[1] as string;
}

/** 앱과 같은 리플레이 규칙으로 스냅샷을 만든다(마지막 레코드가 이긴다). */
async function snapshot(data: string): Promise<HarnessSnapshot> {
  return await createHarnessStore({ dataDir: data }).snapshot('g1');
}

test('audit start 는 대상 Goal 을 auditing 으로 옮긴다', async () => {
  const data = mkdtempSync(join(tmpdir(), 'harness-audit-'));
  const goalId = idOf(run(data, ['goal', '--group', 'g1', '--writer', 'hub', '--objective', '감사 전이', '--check', '테스트']), 'goal');

  const started = run(data, ['audit', 'start', '--group', 'g1', '--writer', 'audit-agent', '--goal', goalId]);
  assert.match(started, /status=auditing/);

  const latest = (await snapshot(data)).goals.find((goal) => goal.id === goalId);
  assert.equal(latest?.status, 'auditing');
});

test('거부된 감사는 Goal 을 active 로 되돌리고 보완 항목을 대기에 넣는다', async () => {
  const data = mkdtempSync(join(tmpdir(), 'harness-audit-'));
  const itemId = idOf(run(data, ['list', '--group', 'g1', '--writer', 'hub', '--title', '로그인 API']), 'list_item');
  const goalId = idOf(
    run(data, ['goal', '--group', 'g1', '--writer', 'hub', '--objective', '로그인 API 완성', '--check', '테스트', '--parent-list-item', itemId]),
    'goal',
  );

  run(data, ['audit', 'start', '--group', 'g1', '--writer', 'audit-agent', '--goal', goalId]);
  const finished = run(data, ['audit', 'finish', '--group', 'g1', '--writer', 'audit-agent', '--goal', goalId, '--verdict', 'rejected', '--summary', '토큰 만료 처리 누락']);
  assert.match(finished, /status=active/);

  const shown = await snapshot(data);
  const goal = shown.goals.find((candidate) => candidate.id === goalId);
  assert.equal(goal?.status, 'active');

  const items = shown.listItems;
  const original = items.find((item) => item.id === itemId);
  assert.equal(original?.title, '로그인 API');
  const complement = items.find((item) => item.title === '보완: 로그인 API');
  assert.equal(complement?.state, 'queued');
  assert.equal(complement?.parentGoalId, null);
});

test('audit skip 은 사유와 주체를 남기고, 사유 없이는 거부된다', async () => {
  const data = mkdtempSync(join(tmpdir(), 'harness-audit-'));
  const goalId = idOf(run(data, ['goal', '--group', 'g1', '--writer', 'hub', '--objective', '생략 감사', '--check', '테스트']), 'goal');

  assert.throws(() => {
    run(data, ['audit', 'skip', '--group', 'g1', '--writer', 'hub', '--goal', goalId]);
  }, /감사를 생략하려면/);

  const out = run(data, ['audit', 'skip', '--group', 'g1', '--writer', 'hub', '--goal', goalId, '--reason', '하위 Goal 없음', '--by', 'hub']);
  const auditId = idOf(out, 'audit');

  const audits = (await snapshot(data)).audits;
  const skipped = audits.find((audit) => audit.id === auditId);
  assert.equal(skipped?.state, 'skipped');
  assert.equal(skipped?.skipReason, '하위 Goal 없음');
  assert.equal(skipped?.skippedBy, 'hub');
});
