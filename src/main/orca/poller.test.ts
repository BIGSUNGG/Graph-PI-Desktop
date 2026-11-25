/**
 * 폴러 회귀 테스트(수용기준 3, SPEC-graph-pi-ade 199):
 * Orca CLI 가 실패해도 마지막 성공 값을 유지하고 stale 로 표시한다.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OrcaSnapshot } from '../../shared/contract/index.ts';
import { createOrcaPoller } from './poller.ts';

function snapshot(patch: Partial<OrcaSnapshot> = {}): OrcaSnapshot {
  return {
    reachable: true,
    stale: false,
    fetchedAt: '2026-11-25T00:00:00.000Z',
    projects: [{ id: 'p1', displayName: 'repo', path: 'C:/repo' }],
    worktrees: [],
    orchestration: { runs: [], tasks: [], workers: [], gates: [] },
    ...patch,
  };
}

test('성공하면 그대로 반영하고 stale 을 풀어 준다', async () => {
  const poller = createOrcaPoller({ fetch: async () => snapshot({ stale: true }) });
  const next = await poller.refreshNow();

  assert.equal(next.reachable, true);
  assert.equal(next.stale, false);
  assert.equal(poller.get().projects.length, 1);
});

test('fetch 가 던지면 직전 성공 값을 유지하고 stale 로 표시한다', async () => {
  let fail = false;
  const poller = createOrcaPoller({
    fetch: async () => {
      if (fail) throw new Error('orca offline');
      return snapshot();
    },
  });

  await poller.refreshNow();
  fail = true;
  const after = await poller.refreshNow();

  assert.equal(after.reachable, false);
  assert.equal(after.stale, true);
  assert.equal(after.projects.length, 1);
  assert.equal(after.fetchedAt, '2026-11-25T00:00:00.000Z');
});

test('도달 실패 스냅샷이 와도 비어 있는 필드는 직전 값으로 채운다', async () => {
  const poller = createOrcaPoller({ fetch: async () => snapshot() });
  await poller.refreshNow();

  const offline = createOrcaPoller({
    fetch: async () => snapshot({ reachable: false, projects: [], fetchedAt: '' }),
  });
  await offline.refreshNow();

  assert.equal(offline.get().reachable, false);
  assert.equal(offline.get().stale, true);
});

test('동시 새로고침은 같은 약속을 공유한다', async () => {
  let calls = 0;
  const poller = createOrcaPoller({
    fetch: async () => {
      calls += 1;
      return snapshot();
    },
  });

  await Promise.all([poller.refreshNow(), poller.refreshNow(), poller.refreshNow()]);
  assert.equal(calls, 1);
});

test('구독자 예외가 폴링을 멈추지 않는다', async () => {
  const poller = createOrcaPoller({ fetch: async () => snapshot() });
  let seen = 0;
  poller.onChange(() => {
    throw new Error('listener bug');
  });
  poller.onChange(() => {
    seen += 1;
  });

  await poller.refreshNow();
  assert.equal(seen, 1);
});
