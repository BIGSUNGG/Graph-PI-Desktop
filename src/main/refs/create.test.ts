import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRef, refTarget } from './create.ts'
import { EMPTY_ORCA_SNAPSHOT } from '../../shared/contract/orca.ts'
import type { OrcaSnapshot, OrcaWorktree } from '../../shared/contract/orca.ts'
import type { OrcaRunResult } from '../orca/cli.ts'
import type { CreateWorktreeInput } from '../orca/worktrees.ts'

function tree(partial: Partial<OrcaWorktree> & { id: string }): OrcaWorktree {
  return {
    id: partial.id,
    displayName: partial.displayName ?? partial.id,
    branch: partial.branch ?? 'main',
    path: partial.path ?? `C:/wt/${partial.id}`,
    repoId: partial.repoId ?? 'repo-1',
    parentWorktreeId: partial.parentWorktreeId ?? null,
    ...(partial.projectId === undefined ? {} : { projectId: partial.projectId }),
    ...(partial.isMainWorktree === undefined ? {} : { isMainWorktree: partial.isMainWorktree }),
  }
}

function snapshot(worktrees: OrcaWorktree[]): OrcaSnapshot {
  return { ...EMPTY_ORCA_SNAPSHOT, worktrees }
}

test('refTarget 는 그룹 워크트리의 projectId 와 branch 를 고른다', () => {
  const snap = snapshot([tree({ id: 'a', projectId: 'proj-9', branch: 'refs/heads/feature/web' })])
  assert.deepEqual(refTarget(snap, ['a'], 'proj-fallback'), { repo: 'proj-9', base: 'refs/heads/feature/web' })
})

test('refTarget 는 워크트리가 없으면 parentRepo + main 을 쓴다', () => {
  assert.deepEqual(refTarget(snapshot([]), [], 'proj-3'), { repo: 'proj-3', base: 'main' })
})

test('refTarget 는 저장소를 모르면 repo 를 null 로 둔다', () => {
  assert.deepEqual(refTarget(snapshot([]), [], ''), { repo: null, base: 'main' })
})

test('createRef 는 워크트리 외 종류를 거부한다(없는 파일·폴더를 만들지 않는다)', async () => {
  const calls: CreateWorktreeInput[] = []
  const orca = {
    createWorktree: async (input: CreateWorktreeInput): Promise<OrcaRunResult<OrcaWorktree | null>> => {
      calls.push(input)
      return { ok: true, result: tree({ id: 'new', displayName: input.name, path: 'C:/wt/new' }) }
    },
  }
  for (const kind of ['branch', 'path', 'project'] as const) {
    const result = await createRef(orca as never, { kind, handle: 'web', repo: 'proj-1', base: 'main' })
    assert.equal(result.candidate, null)
    assert.equal(result.error, '워크트리 참조만 만들 수 있습니다')
  }
  assert.equal(calls.length, 0)
})

test('createRef 는 저장소를 모르면 만들지 않는다', async () => {
  const result = await createRef({} as never, { kind: 'worktree', handle: 'web', repo: null, base: 'main' })
  assert.equal(result.candidate, null)
  assert.equal(result.error, '저장소를 알 수 없어 워크트리를 만들 수 없습니다')
})

test('createRef 는 워크트리가 만들어지면 후보를 돌려준다', async () => {
  const orca = {
    createWorktree: async (input: CreateWorktreeInput): Promise<OrcaRunResult<OrcaWorktree | null>> => ({
      ok: true,
      result: tree({ id: 'new', displayName: input.name, path: 'C:/wt/new' }),
    }),
  }
  const result = await createRef(orca as never, { kind: 'worktree', handle: 'web', repo: 'proj-1', base: 'main' })
  assert.deepEqual(result, {
    candidate: { kind: 'worktree', handle: 'web', label: 'web', detail: 'C:/wt/new' },
    error: null,
  })
})

test('createRef 는 Orca 실패를 그대로 전한다', async () => {
  const orca = {
    createWorktree: async (): Promise<OrcaRunResult<OrcaWorktree | null>> => ({ ok: false, error: 'orca 실패' }),
  }
  const result = await createRef(orca as never, { kind: 'worktree', handle: 'web', repo: 'proj-1', base: 'main' })
  assert.equal(result.candidate, null)
  assert.equal(result.error, 'orca 실패')
})
