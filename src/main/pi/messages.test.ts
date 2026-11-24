import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentMessageRecord } from '../../shared/contract/harness.ts'
import type { PiSession } from '../../shared/contract/pi.ts'
import { planDelivery } from './messages.ts'

const NOW = Date.parse('2026-11-24T12:00:00.000Z')

function session(id: string, cwd: string, state: PiSession['state'] = 'running'): PiSession {
  return {
    id,
    groupId: 'g',
    title: id,
    worktreeId: cwd,
    model: 'anthropic/claude-sonnet-4.5',
    state,
    startedAt: '2026-11-24T11:00:00.000Z',
    lastActivityAt: '2026-11-24T11:10:00.000Z',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    parentSessionId: null,
    isAudit: false,
    isHub: false,
    filePath: `/sessions/${id}.jsonl`,
    pendingLaunch: false,
  }
}

function message(to: string): AgentMessageRecord {
  return {
    type: 'message',
    id: 'msg-1',
    groupId: 'g',
    seq: 1,
    at: '2026-11-24T11:59:00.000Z',
    schemaVersion: 1,
    writer: 'fe',
    fromSessionId: 'fe',
    toSessionId: to,
    body: 'API 스펙 알려줘',
    status: 'pending',
    createdAt: '2026-11-24T11:59:00.000Z',
    deliveredAt: null,
    failureReason: null,
    resumeAttempted: false,
  }
}

test('받는 세션이 실행 중이고 터미널을 알면 그 터미널로 전달한다', () => {
  const plan = planDelivery({
    message: message('be'),
    sessions: [session('be', 'C:/wt/be')],
    terminalId: 't-1',
    now: NOW,
  })
  assert.deepEqual(plan, { action: 'deliver', terminalId: 't-1' })
})

test('받는 세션이 비활성이면 같은 cwd 와 모델로 자동 재개한다', () => {
  for (const state of ['idle', 'done', 'failed'] as const) {
    const plan = planDelivery({
      message: message('be'),
      sessions: [session('be', 'C:/wt/be', state)],
      terminalId: null,
      now: NOW,
    })
    assert.deepEqual(plan, { action: 'resume', cwd: 'C:/wt/be', model: 'anthropic/claude-sonnet-4.5' })
  }
})

test('받는 세션이 없고 터미널도 모르면 실패 사유를 남긴다', () => {
  const plan = planDelivery({
    message: message('gone'),
    sessions: [session('be', 'C:/wt/be')],
    terminalId: null,
    now: NOW,
  })
  assert.deepEqual(plan, { action: 'fail', reason: '수신 세션을 찾을 수 없습니다' })
})

test('받는 세션이 실행 중이어도 터미널을 모르면 실패한다', () => {
  const plan = planDelivery({
    message: message('be'),
    sessions: [session('be', 'C:/wt/be')],
    terminalId: null,
    now: NOW,
  })
  assert.deepEqual(plan, { action: 'fail', reason: '실행 중인 수신 세션의 터미널을 찾을 수 없습니다' })
})

test('세션이 목록에 없어도 터미널만 살아 있으면 그 터미널로 전달한다', () => {
  const plan = planDelivery({
    message: message('be'),
    sessions: [],
    terminalId: 't-2',
    now: NOW,
  })
  assert.deepEqual(plan, { action: 'deliver', terminalId: 't-2' })
})

test('비활성 세션의 작업 경로를 모르면 재개하지 않고 실패한다', () => {
  const idle = session('be', 'C:/wt/be', 'idle')
  const plan = planDelivery({
    message: message('be'),
    sessions: [{ ...idle, worktreeId: null }],
    terminalId: null,
    now: NOW,
  })
  assert.deepEqual(plan, { action: 'fail', reason: '수신 세션의 작업 경로를 알 수 없습니다' })
})
