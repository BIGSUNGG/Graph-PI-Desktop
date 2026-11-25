/**
 * 수용기준 27: `@` 참조 후보가 뜨고, 고르면 토큰이 바뀌며, 해석하지 못한 참조는 전송이 막힌다.
 * 코드 존재가 아니라 화면 동작으로 확인한다.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const SLUG = '-C-Projects-refs-fixture'

function writeSession(dir: string, stamp: string, id: string, cwd: string, title: string): void {
  mkdirSync(join(dir, SLUG), { recursive: true })
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id, cwd, timestamp: stamp, title }),
    JSON.stringify({ type: 'message', message: { role: 'user', at: stamp, content: title } }),
  ]
  writeFileSync(join(dir, SLUG, `${stamp.replace(/[:.]/g, '-')}_${id}.jsonl`), `${lines.join('\n')}\n`)
}

test('참조 후보를 고르면 토큰이 바뀌고 해석 못한 참조는 전송이 막힌다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-refs-'))
  const sessions = join(base, 'sessions')
  const data = join(base, 'data')
  const inside = join(base, 'repo')
  mkdirSync(inside, { recursive: true })
  mkdirSync(data, { recursive: true })

  writeSession(sessions, new Date(Date.now() - 120_000).toISOString(), 'refs-hub', inside, 'Refs 관리')

  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'refs',
          name: 'Refs',
          note: '',
          hubSessionId: 'refs-hub',
          parentRepo: inside,
          createdAt: new Date().toISOString(),
          worktreeIds: ['wt-1'],
          worktreePaths: { 'wt-1': inside },
          worktreeTerminals: {},
          hubTerminalId: null,
          hubCwd: inside,
        },
      ],
    }),
  )
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Refs', path: inside }],
      worktrees: [
        { id: 'wt-1', displayName: 'backend', branch: 'main', path: inside, repoId: 'p-1', parentWorktreeId: null },
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

  await expect(page.locator('#view-board')).toBeVisible()
  await page.getByRole('tab', { name: '대화' }).click()
  const box = page.locator('#view-chat textarea')
  await expect(box).toBeEnabled({ timeout: 20_000 })
  await box.click()
  await box.pressSequentially('@back')

  const menu = page.locator('#ref-menu')
  await expect(menu).toBeVisible()
  const item = menu.locator('.ref-item').filter({ hasText: 'backend' }).first()
  await expect(item).toBeVisible()
  await item.click()
  await expect(box).toHaveValue(/@backend /)

  // 해석할 수 없는 참조는 실패 배지로 남고 전송이 막힌다.
  await box.fill('@없는참조 확인해줘')
  await expect(page.locator('.composer .pill.failed')).toBeVisible({ timeout: 20_000 })
  await page.locator('.composer .btn.primary').click()
  await expect(page.locator('.composer .status.err')).toContainText('해석하지 못한 참조가 있습니다')
  await expect(box).toHaveValue('@없는참조 확인해줘')

  await app.close()
})
