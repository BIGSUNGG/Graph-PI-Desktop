/**
 * 수용기준 21(SPEC-graph-pi-ade 200): 모르는 레코드 타입이 섞인 세션 파일도 열람되고,
 * 경고는 화면에 1건만 표시된다.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const SLUG = '-C-Projects-warn-fixture'

async function launch(env: Record<string, string>): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, ...env, NODE_ENV: 'production' } })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1240, height: 860 })
  await expect(page.locator('.app')).toBeVisible()
  return { app, page }
}

test('모르는 레코드가 두 종류 섞여도 경고는 1건이고 본문은 그대로 보인다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-warn-'))
  const sessions = join(base, 'sessions')
  const cwd = join(base, 'repo')
  const data = join(base, 'data')
  mkdirSync(join(cwd), { recursive: true })
  mkdirSync(join(data, 'groups', 'warn'), { recursive: true })
  mkdirSync(join(sessions, SLUG), { recursive: true })

  const at = new Date(Date.now() - 120_000).toISOString()
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id: 'warn-hub', cwd, timestamp: at }),
    JSON.stringify({ type: 'message', message: { role: 'user', at, content: '경고 픽스처 질문' } }),
    JSON.stringify({ type: 'telemetry', payload: { whatever: 1 } }),
    JSON.stringify({ type: 'branch', name: 'main' }),
    JSON.stringify({
      type: 'message',
      message: {
        role: 'assistant',
        at: new Date(Date.parse(at) + 1000).toISOString(),
        content: '경고 픽스처 응답',
        model: 'deepseek-v4.1-flash',
        usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
      },
    }),
  ]
  writeFileSync(join(sessions, SLUG, `${at.replace(/[:.]/g, '-')}_warn-hub.jsonl`), `${lines.join('\n')}\n`)

  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'warn',
          name: 'Warn',
          note: '',
          preset: 'manual',
          firstPrompt: '',
          hubSessionId: 'warn-hub',
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
    JSON.stringify({ lastGroupId: 'warn', view: 'board', listFilter: 'all', inspectorTab: 'goal', inspectorHeight: 260 }),
  )
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Warn', path: cwd, repoIds: ['r-1'] }],
      worktrees: [{ id: 'wt-1', displayName: 'warn', branch: 'main', path: cwd, repoId: 'p-1', parentWorktreeId: null }],
      orchestration: null,
    }),
  )
  writeFileSync(join(data, 'groups', 'warn', 'state.jsonl'), '')

  const { app, page } = await launch({
    GRAPH_PI_DATA_DIR: data,
    PI_SESSIONS_DIR: sessions,
    GP_ORCA_FIXTURE: join(data, 'orca.json'),
  })

  try {
    await page.locator('.node[data-session="warn-hub"]').click({ timeout: 20_000 })
    await page.locator('.nav-item[data-view="chat"]').click()
    const warn = page.locator('.chat-main .banner')
    await expect(warn).toBeVisible({ timeout: 20_000 })
    await expect(warn).toContainText('세션 파일 경고 1건')
    await expect(warn).toContainText('알 수 없는 레코드')
    await expect(page.locator('.chat-log')).toContainText('경고 픽스처 질문')
    await expect(page.locator('.chat-log')).toContainText('경고 픽스처 응답')
  } finally {
    await app.close()
  }
})
