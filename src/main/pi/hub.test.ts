import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PiSession } from '../../shared/contract/pi.ts'
import { HUB_RETRY_MS, planHub, samePath } from './hub.ts'

const NOW = Date.parse('2026-11-24T12:00:00.000Z')

function session(id: string, cwd: string, startedAt = '2026-11-24T11:00:00.000Z', isHub = false): PiSession {
  return {
    id,
    groupId: 'g',
    title: id,
    worktreeId: cwd,
    model: null,
    state: 'done',
    startedAt,
    lastActivityAt: startedAt,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    parentSessionId: null,
    isAudit: false,
    isHub,
    filePath: `/sessions/${id}.jsonl`,
    pendingLaunch: false,
  }
}

test('허브가 살아 있으면 아무것도 하지 않는다', () => {
  const plan = planHub({
    hubCwd: 'C:/groups/alpha',
    hubSessionId: 'hub-1',
    hubTerminalId: null,
    sessions: [session('hub-1', 'C:/groups/alpha')],
    now: NOW,
    lastAttemptAt: null,
  })
  assert.deepEqual(plan, { action: 'none', reason: 'alive' })
})

test('허브가 사라지고 그룹 폴더 세션이 있으면 그 세션을 채택한다', () => {
  const plan = planHub({
    hubCwd: 'C:/groups/alpha',
    hubSessionId: 'hub-1',
    hubTerminalId: null,
    sessions: [
      session('old', 'C:/groups/alpha', '2026-11-24T10:00:00.000Z'),
      session('new', 'c:/groups/alpha/', '2026-11-24T11:30:00.000Z'),
    ],
    now: NOW,
    lastAttemptAt: null,
  })
  assert.deepEqual(plan, { action: 'adopt', sessionId: 'new' })
})

test('허브도 그룹 폴더 세션도 없으면 재생성을 요청한다', () => {
  const plan = planHub({
    hubCwd: 'C:/groups/alpha',
    hubSessionId: 'hub-1',
    hubTerminalId: null,
    sessions: [session('other', 'C:/groups/alpha/wt-a')],
    now: NOW,
    lastAttemptAt: null,
  })
  assert.deepEqual(plan, { action: 'launch' })
})

test('최근에 시도했으면 재시도를 미룬다', () => {
  const plan = planHub({
    hubCwd: 'C:/groups/alpha',
    hubSessionId: 'hub-1',
    hubTerminalId: null,
    sessions: [],
    now: NOW,
    lastAttemptAt: new Date(NOW - HUB_RETRY_MS + 1_000).toISOString(),
  })
  assert.deepEqual(plan, { action: 'none', reason: 'retry-wait' })
})

test('재시도 간격이 지나면 다시 시도한다', () => {
  const plan = planHub({
    hubCwd: 'C:/groups/alpha',
    hubSessionId: 'hub-1',
    hubTerminalId: null,
    sessions: [],
    now: NOW,
    lastAttemptAt: new Date(NOW - HUB_RETRY_MS - 1_000).toISOString(),
  })
  assert.deepEqual(plan, { action: 'launch' })
})

test('그룹 폴더가 없으면 대상이 아니다', () => {
  const plan = planHub({
    hubCwd: '  ',
    hubSessionId: null,
    hubTerminalId: null,
    sessions: [],
    now: NOW,
    lastAttemptAt: null,
  })
  assert.deepEqual(plan, { action: 'none', reason: 'no-cwd' })
})

test('경로 비교는 대소문자·구분자·끝 구분자를 무시한다', () => {
  assert.equal(samePath('C:\\Groups\\Alpha', 'c:/groups/alpha/'), true)
  assert.equal(samePath('C:/groups/alpha/wt-a', 'C:/groups/alpha'), false)
  assert.equal(samePath('', ''), false)
})
