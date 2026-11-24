import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentCommandRecord } from '../../shared/contract/harness.ts'
import { planCommand, type CommandContext } from './commands.ts'

const CONTEXT: CommandContext = {
  worktreeName: (worktreeId) => (worktreeId === 'wt-1' ? '기능 A' : null),
  terminalForSession: (sessionId) => (sessionId === 'sess-1' ? 'term-1' : null),
}

function record(overrides: Partial<AgentCommandRecord>): AgentCommandRecord {
  return {
    type: 'command',
    id: 'cmd-1',
    groupId: 'g1',
    seq: 1,
    at: '2026-11-24T12:00:00.000Z',
    schemaVersion: 1,
    writer: 'hub',
    fromSessionId: 'hub',
    action: 'remove-worktree',
    target: 'wt-1',
    value: null,
    status: 'pending',
    result: null,
    createdAt: '2026-11-24T12:00:00.000Z',
    executedAt: null,
    ...overrides,
  }
}

test('보드에 있는 워크트리 삭제는 그대로 실행 계획이 된다', () => {
  assert.deepEqual(planCommand(record({}), CONTEXT), { action: 'remove-worktree', worktreeId: 'wt-1' })
})

test('없는 워크트리 삭제는 거부한다', () => {
  const plan = planCommand(record({ target: 'wt-9' }), CONTEXT)
  assert.equal(plan.action, 'refuse')
})

test('워크트리 이름 변경은 새 이름을 계획에 담는다', () => {
  assert.deepEqual(planCommand(record({ action: 'rename-worktree', value: ' 결제 ' }), CONTEXT), {
    action: 'rename-worktree',
    worktreeId: 'wt-1',
    name: '결제',
  })
})

test('빈 이름으로 바꾸려 하면 거부한다', () => {
  const plan = planCommand(record({ action: 'rename-worktree', value: '   ' }), CONTEXT)
  assert.equal(plan.action, 'refuse')
  assert.match(plan.action === 'refuse' ? plan.reason : '', /비어/)
})

test('세션 삭제는 알고 있는 터미널 id 를 함께 넘긴다', () => {
  assert.deepEqual(planCommand(record({ action: 'remove-session', target: 'sess-1' }), CONTEXT), {
    action: 'remove-session',
    sessionId: 'sess-1',
    terminalId: 'term-1',
  })
})

test('터미널을 모르는 세션 삭제는 terminalId null 로 남겨 실행기가 실패 처리한다', () => {
  const plan = planCommand(record({ action: 'remove-session', target: 'sess-2' }), CONTEXT)
  assert.deepEqual(plan, { action: 'remove-session', sessionId: 'sess-2', terminalId: null })
})

test('세션 이름 변경은 값이 있어야 한다', () => {
  assert.deepEqual(planCommand(record({ action: 'rename-session', target: 'sess-1', value: '리뷰' }), CONTEXT), {
    action: 'rename-session',
    sessionId: 'sess-1',
    name: '리뷰',
  })
  assert.equal(planCommand(record({ action: 'rename-session', target: 'sess-1', value: null }), CONTEXT).action, 'refuse')
})
