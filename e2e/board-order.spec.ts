/**
 * 수용기준 10(SPEC-mvp-acceptance): 허브는 보드 상단에 전폭으로 서고, 워크트리 컬럼은 그 아래에 놓인다.
 * 컬럼이 하나면 전폭=컬럼 폭이라 의미가 없으므로 컬럼 2개 픽스처로 확인한다.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

async function launch(env: Record<string, string>): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, ...env, NODE_ENV: 'production' } })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1240, height: 860 })
  await expect(page.locator('.app')).toBeVisible()
  return { app, page }
}

test('허브는 전폭으로 위에, 워크트리 컬럼은 그 아래에 놓인다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-order-'))
  const data = join(base, 'data')
  const repoA = join(base, 'repo-a')
  const repoB = join(base, 'repo-b')
  const sessions = join(base, 'sessions')
  for (const dir of [repoA, repoB]) mkdirSync(dir, { recursive: true })
  mkdirSync(join(data, 'groups', 'order'), { recursive: true })

  const at = new Date(Date.now() - 60_000).toISOString()
  const slug = (dir: string): string => dir.replace(/[/:\\]/g, '-')
  const writeSession = (dir: string, id: string, title: string): void => {
    const dirPath = join(sessions, slug(dir))
    mkdirSync(dirPath, { recursive: true })
    const lines = [
      JSON.stringify({ type: 'session', version: 3, id, cwd: dir, timestamp: at, title }),
      JSON.stringify({ type: 'message', message: { role: 'user', at, content: title } }),
    ]
    writeFileSync(join(dirPath, `${at.replace(/[:.]/g, '-')}_${id}.jsonl`), `${lines.join('\n')}\n`)
  }
  writeSession(repoA, 'hub', '허브')
  writeSession(repoA, 'child-a', 'A 세션')
  writeSession(repoB, 'child-b', 'B 세션')

  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'order',
          name: 'Order',
          note: '',
          preset: 'manual',
          firstPrompt: '',
          hubSessionId: 'hub',
          parentRepo: repoA,
          createdAt: at,
          worktreeIds: ['wt-a', 'wt-b'],
          worktreePaths: { 'wt-a': repoA, 'wt-b': repoB },
          worktreeNames: {},
          sessionNames: {},
          worktreeTerminals: {},
          hubTerminalId: null,
          hubCwd: repoA,
        },
      ],
    }),
  )
  writeFileSync(
    join(data, 'app-settings.json'),
    JSON.stringify({ lastGroupId: 'order', view: 'board', listFilter: 'all', inspectorTab: 'goal', inspectorHeight: 260 }),
  )
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Order', path: repoA, repoIds: ['r-1'] }],
      worktrees: [
        { id: 'wt-a', displayName: 'a', branch: 'main', path: repoA, repoId: 'p-1', parentWorktreeId: null },
        { id: 'wt-b', displayName: 'b', branch: 'main', path: repoB, repoId: 'p-1', parentWorktreeId: null },
      ],
      orchestration: null,
    }),
  )
  writeFileSync(join(data, 'groups', 'order', 'state.jsonl'), '')

  const { app, page } = await launch({
    GRAPH_PI_DATA_DIR: data,
    PI_SESSIONS_DIR: sessions,
    GP_ORCA_FIXTURE: join(data, 'orca.json'),
  })

  try {
    await expect.poll(() => page.locator('#view-board .node').count(), { timeout: 20_000 }).toBe(3)
    const hub = await page.locator('#view-board .node[data-session="hub"]').boundingBox()
    const childA = await page.locator('#view-board .node[data-session="child-a"]').boundingBox()
    const childB = await page.locator('#view-board .node[data-session="child-b"]').boundingBox()
    expect(hub).not.toBeNull()
    expect(childA).not.toBeNull()
    expect(childB).not.toBeNull()
    if (hub === null || childA === null || childB === null) throw new Error('노드 위치를 읽지 못했습니다')

    // 허브는 모든 컬럼 위에 있고 폭이 컬럼보다 넓다.
    expect(hub.y).toBeLessThan(childA.y)
    expect(hub.y).toBeLessThan(childB.y)
    expect(hub.width).toBeGreaterThan(childA.width)
    expect(hub.x).toBeLessThanOrEqual(childA.x)

    // 컬럼은 같은 높이에서 옆으로 나란히 선다(루트 컬럼 = 첫 컬럼).
    expect(Math.abs(childA.y - childB.y)).toBeLessThan(2)
    expect(childA.x).toBeLessThan(childB.x)
  } finally {
    await app.close()
  }
})
