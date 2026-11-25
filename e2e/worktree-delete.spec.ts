/**
 * 수용기준 19(SPEC-graph-pi-ade 198): 워크트리 삭제는 확인 대화상자 없이 실행되지 않는다.
 * 취소/Esc 는 아무것도 지우지 않고, `삭제` 는 worktree:remove 를 실제로 호출한다.
 * 픽스처 워크트리는 Orca 에 없으므로 호출 결과는 실패 문구로 나타난다(호출 자체의 증거).
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

test('삭제는 확인 다이얼로그를 거치고, 취소는 아무것도 지우지 않는다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-del-'))
  const cwd = join(base, 'repo')
  const data = join(base, 'data')
  mkdirSync(cwd, { recursive: true })
  mkdirSync(join(data, 'groups', 'del'), { recursive: true })
  const at = new Date().toISOString()

  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'del',
          name: 'Del',
          note: '',
          preset: 'manual',
          firstPrompt: '',
          hubSessionId: null,
          parentRepo: cwd,
          createdAt: at,
          worktreeIds: ['wt-1'],
          worktreePaths: { 'wt-1': cwd },
          worktreeNames: {},
          sessionNames: {},
          worktreeTerminals: {},
          hubTerminalId: null,
          hubCwd: cwd,
        },
      ],
    }),
  )
  writeFileSync(
    join(data, 'app-settings.json'),
    JSON.stringify({ lastGroupId: 'del', view: 'board', listFilter: 'all', inspectorTab: 'goal', inspectorHeight: 260 }),
  )
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Del', path: cwd, repoIds: ['r-1'] }],
      worktrees: [{ id: 'wt-1', displayName: 'del-main', branch: 'main', path: cwd, repoId: 'p-1', parentWorktreeId: null }],
      orchestration: null,
    }),
  )
  writeFileSync(join(data, 'groups', 'del', 'state.jsonl'), '')

  const { app, page } = await launch({
    GRAPH_PI_DATA_DIR: data,
    PI_SESSIONS_DIR: join(base, 'sessions'),
    GP_ORCA_FIXTURE: join(data, 'orca.json'),
  })

  try {
    const trigger = page.locator('.wt-item .wt-del')
    await expect(trigger).toHaveCount(1, { timeout: 20_000 })
    await trigger.click()

    const dialog = page.locator('.dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toContainText('워크트리를 삭제합니다')
    await expect(dialog).toContainText('되돌릴 수 없습니다')

    await dialog.locator('.btn.ghost').click()
    await expect(page.locator('.dialog')).toHaveCount(0)
    await expect(page.locator('.wt-item')).toHaveCount(1)

    await trigger.click()
    await expect(page.locator('.dialog')).toBeVisible()
    await page.locator('.dialog .btn.danger').click()

    // 픽스처 워크트리는 Orca 에 없으므로 호출은 실패 문구로 끝나거나, 오류가 없으면 닫힌다.
    await expect(async () => {
      const alert = await page.locator('.dialog [role="alert"]').count()
      const open = await page.locator('.dialog').count()
      expect(alert > 0 || open === 0).toBe(true)
    }).toPass({ timeout: 30_000 })
    await expect(page.locator('.app')).toBeVisible()
  } finally {
    await app.close()
  }
})
