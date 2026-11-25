import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PiSession, TokenUsage, WorktreeView } from '../../../shared/contract/index.ts'
import {
  BOARD_METRICS,
  belongsToWorktree,
  clipText,
  clockOf,
  layoutBoard,
  sessionRows,
  shortModel,
  tokenK,
  type BoardHubNode,
  type BoardLayout,
  type BoardWorktreeNode,
  type GroupView,
  type LayoutInput,
} from './layout.ts'

/**
 * 보드 좌표·계보 계산 회귀 테스트. `layout.ts` 는 DOM·store 의존이 없어 node 에서 그대로 돈다.
 * 계약: `PiSession.worktreeId` 는 세션 JSONL 헤더의 cwd 경로이고, 보드는 id 가 아니라 경로로 세션을 붙인다.
 */

function usage(input: number, output: number): TokenUsage {
  return { input, output, cacheRead: 0, cacheWrite: 0 }
}

function session(id: string, overrides: Partial<PiSession> = {}): PiSession {
  return {
    id,
    groupId: 'g1',
    title: id,
    worktreeId: null,
    model: null,
    state: 'done',
    startedAt: '2026-11-24T10:00:00.000Z',
    lastActivityAt: '2026-11-24T10:00:00.000Z',
    usage: usage(0, 0),
    parentSessionId: null,
    isAudit: false,
    isHub: false,
    filePath: null,
    pendingLaunch: false,
    ...overrides,
  }
}

function worktree(
  id: string,
  path: string | null,
  overrides: Partial<WorktreeView> = {},
): WorktreeView {
  return {
    id,
    groupId: 'g1',
    repo: 'repo',
    name: id,
    branch: 'main',
    parentWorktreeId: null,
    dirty: false,
    orcaMissing: false,
    path,
    ...overrides,
  }
}

const GROUP: GroupView = {
  id: 'g1',
  name: '알파',
  note: '',
  hubSessionId: 'hub',
  parentRepo: 'repo',
}

function hubNodeOf(layout: BoardLayout): BoardHubNode {
  const found = layout.nodes.find((node): node is BoardHubNode => node.kind === 'hub')
  assert.ok(found !== undefined, '허브 카드가 없다')
  return found
}

function worktreeNodesOf(layout: BoardLayout): BoardWorktreeNode[] {
  return layout.nodes.filter((node): node is BoardWorktreeNode => node.kind === 'worktree')
}

test('belongsToWorktree: 같거나 하위 경로만 속하고 접미사만 겹치는 형제 폴더는 속하지 않는다', () => {
  // 구분자·대소문자·끝 구분자가 달라도 같은 경로다.
  assert.equal(belongsToWorktree('C:\\Repo\\Alpha', 'c:/repo/alpha/'), true)
  assert.equal(belongsToWorktree('C:/repo/alpha/packages/app', 'C:/repo/alpha'), true)
  // `alpha-x` 는 `alpha` 의 하위가 아니다(접두 비교는 구분자까지 포함해야 한다).
  assert.equal(belongsToWorktree('C:/repo/alpha-x', 'C:/repo/alpha'), false)
  assert.equal(belongsToWorktree('C:/repo/alpha-x/pkg', 'C:/repo/alpha'), false)
  assert.equal(belongsToWorktree(null, 'C:/repo/alpha'), false)
  assert.equal(belongsToWorktree('C:/repo/alpha', ''), false)
})

test('sessionRows: 부모-자식 계보를 depth·가이드로 펴고 허브·다른 워크트리 세션은 뺀다', () => {
  const sessions = [
    session('hub', { isHub: true, worktreeId: 'C:/repo/alpha' }),
    session('a', { worktreeId: 'C:\\repo\\alpha\\' }),
    session('b', {
      worktreeId: 'C:/repo/alpha/pkg',
      parentSessionId: 'a',
      startedAt: '2026-11-24T10:05:00.000Z',
    }),
    session('c', {
      worktreeId: 'C:/repo/alpha',
      parentSessionId: 'a',
      startedAt: '2026-11-24T10:06:00.000Z',
    }),
    session('d', { worktreeId: 'C:/repo/beta' }),
  ]

  const rows = sessionRows(sessions, 'C:/repo/alpha')
  assert.deepEqual(
    rows.map((row) => [row.session.id, row.depth, row.guide]),
    [
      ['a', 0, ''],
      ['b', 1, '├─ '],
      ['c', 1, '└─ '],
    ],
  )
})

test('layoutBoard: 허브 카드가 맨 위에 오고 워크트리 열 순서가 입력 순서를 따른다', () => {
  const wtA = worktree('wt-a', 'C:/repo/alpha')
  const wtB = worktree('wt-b', 'C:/repo/beta')
  const sessions = [
    session('hub', { isHub: true, title: '알파 관리', worktreeId: 'C:/groups/g1' }),
    session('a', { worktreeId: 'C:/repo/alpha' }),
    session('b', { worktreeId: 'C:/repo/beta', startedAt: '2026-11-24T10:05:00.000Z' }),
  ]
  const input: LayoutInput = { groups: [GROUP], worktrees: [wtA, wtB], sessions, collapsed: {} }

  const layout = layoutBoard(input)
  const hub = hubNodeOf(layout)
  assert.equal(hub.y, BOARD_METRICS.pad)
  assert.equal(hub.x, BOARD_METRICS.pad)
  assert.equal(hub.repoCount, 2)
  assert.ok(hub.y < Math.min(...worktreeNodesOf(layout).map((node) => node.y)))

  assert.deepEqual(
    worktreeNodesOf(layout).map((node) => node.worktree.id),
    ['wt-a', 'wt-b'],
  )
  const [first, second] = worktreeNodesOf(layout)
  assert.ok(first !== undefined && second !== undefined && first.x < second.x)

  // 같은 입력은 같은 좌표를 낸다(순수 함수).
  assert.deepEqual(layout, layoutBoard(input))

  // 열 순서는 입력 순서를 그대로 따른다(정렬로 흔들리지 않는다).
  const flipped = layoutBoard({ ...input, worktrees: [wtB, wtA] })
  assert.deepEqual(
    worktreeNodesOf(flipped).map((node) => node.worktree.id),
    ['wt-b', 'wt-a'],
  )
})

test('layoutBoard: 워크트리가 없으면 허브 카드 하나만 두고, 접힌 그룹은 빈 보드를 준다', () => {
  const sessions = [session('hub', { isHub: true, title: '알파 관리', worktreeId: 'C:/groups/g1' })]

  const onlyHub = layoutBoard({ groups: [GROUP], worktrees: [], sessions, collapsed: {} })
  assert.equal(onlyHub.nodes.length, 1)
  const hub = hubNodeOf(onlyHub)
  assert.equal(hub.x, BOARD_METRICS.pad)
  assert.equal(hub.width, 900 - BOARD_METRICS.pad * 2)
  assert.equal(hub.height, BOARD_METRICS.hubH)
  assert.equal(hub.repoCount, 0)
  assert.deepEqual([onlyHub.edges.length, onlyHub.markers.length], [0, 0])
  assert.deepEqual([onlyHub.width, onlyHub.height], [900, 480])

  // 그룹이 접히면 그릴 것이 없다(목업의 빈 보드 viewBox).
  assert.deepEqual(
    layoutBoard({ groups: [GROUP], worktrees: [], sessions, collapsed: { g1: true } }),
    { nodes: [], edges: [], markers: [], width: 900, height: 480 },
  )
})

test('layoutBoard: 감사 세션에는 AUDIT 마커와 감사 계보선이 붙고 실행 중이면 흐른다', () => {
  const sessions = [
    session('hub', { isHub: true, title: '알파 관리', worktreeId: 'C:/groups/g1' }),
    session('p', { worktreeId: 'C:/repo/alpha', state: 'running' }),
    session('au', {
      worktreeId: 'C:/repo/alpha',
      parentSessionId: 'p',
      isAudit: true,
      state: 'running',
      startedAt: '2026-11-24T10:05:00.000Z',
    }),
  ]
  const layout = layoutBoard({
    groups: [GROUP],
    worktrees: [worktree('wt-a', 'C:/repo/alpha')],
    sessions,
    collapsed: {},
  })

  assert.deepEqual(
    layout.markers.map((marker) => [marker.kind, marker.sessionId, marker.label]),
    [['audit', 'au', 'AUDIT']],
  )
  const auditEdges = layout.edges.filter((edge) => edge.kind === 'audit')
  assert.equal(auditEdges.length, 1)
  assert.equal(auditEdges[0]?.active, true)
})

test('clipText·shortModel·tokenK·clockOf 는 화면 표기 규칙을 지킨다', () => {
  assert.equal(clipText('abcdefg', 4), 'abc…')
  assert.equal(clipText('abc', 3), 'abc')
  assert.equal(shortModel('anthropic/claude-sonnet-4'), 'claude-sonnet-4')
  assert.equal(shortModel(null), '모델 미확인')
  assert.equal(tokenK(usage(1200, 800)), '2k')
  // 시각은 로컬 타임존에 따라 값이 달라지므로 형식만 고정한다.
  assert.match(clockOf('2026-11-24T10:00:00.000Z'), /^\d{2}:\d{2}$/)
  assert.equal(clockOf('날짜 아님'), '')
})
