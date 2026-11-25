/**
 * 보드 배경(설정 토글): 켜면 `.graph-wrap` 에 `has-bg` 가 붙어 그라디언트가 칠해지고,
 * 노드 카드는 여전히 불투명(`--card`)이라 텍스트 대비가 유지된다.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const SLUG = '-C-Projects-bg-fixture'

function writeSession(dir: string, stamp: string, id: string, cwd: string, title: string): void {
  mkdirSync(join(dir, SLUG), { recursive: true })
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id, cwd, timestamp: stamp, title }),
    JSON.stringify({ type: 'message', message: { role: 'user', at: stamp, content: title } }),
    JSON.stringify({
      type: 'message',
      message: { role: 'assistant', at: new Date(Date.parse(stamp) + 1000).toISOString(), content: '응답', model: 'm' },
    }),
  ]
  writeFileSync(join(dir, SLUG, `${stamp.replace(/[:.]/g, '-')}_${id}.jsonl`), `${lines.join('\n')}\n`)
}

test('배경 토글이 보드 캔버스에만 적용되고 노드 카드는 불투명하다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-bg-'))
  const sessions = join(base, 'sessions')
  const data = join(base, 'data')
  const repo = join(base, 'repo')
  const groupDir = join(data, 'groups', 'bg')
  mkdirSync(repo, { recursive: true })
  mkdirSync(groupDir, { recursive: true })

  writeSession(sessions, new Date(Date.now() - 300_000).toISOString(), 'bg-hub', groupDir, 'Bg 관리')
  writeSession(sessions, new Date(Date.now() - 120_000).toISOString(), 'bg-sess', repo, 'Bg 작업')

  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'bg',
          name: 'Bg',
          note: '',
          hubSessionId: 'bg-hub',
          parentRepo: repo,
          createdAt: new Date().toISOString(),
          worktreeIds: ['wt-1'],
          worktreePaths: { 'wt-1': repo },
          worktreeTerminals: {},
          hubTerminalId: null,
          hubCwd: groupDir,
        },
      ],
    }),
  )
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Bg', path: repo }],
      worktrees: [
        { id: 'wt-1', displayName: 'bg', branch: 'main', path: repo, repoId: 'p-1', parentWorktreeId: null },
      ],
      orchestration: null,
    }),
  )

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      GRAPH_PI_DATA_DIR: data,
      PI_SESSIONS_DIR: sessions,
      GP_ORCA_FIXTURE: join(data, 'orca.json'),
      NODE_ENV: 'production',
    },
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1240, height: 860 })

  const wrap = page.locator('.graph-wrap')
  const toggle = page.locator('.tb-bg')
  await expect(wrap).toBeVisible()
  // 기본값은 켜짐이다(계약 DEFAULT_SETTINGS.background = true).
  await expect(wrap).toHaveClass(/has-bg/)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  const cardBg = await page
    .locator('#view-board .board-session-card')
    .first()
    .evaluate((el) => getComputedStyle(el).fill)
  expect(cardBg).toBe('rgb(23, 23, 23)')
  expect(await wrap.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('radial-gradient')

  await toggle.click()
  await expect(wrap).not.toHaveClass(/has-bg/)
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  await toggle.click()
  await expect(wrap).toHaveClass(/has-bg/)

  await app.close()
})
