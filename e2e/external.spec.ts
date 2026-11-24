/**
 * 수용기준 11: Orca 가 관리하지 않는 경로의 세션은 `외부` 라벨로 남고 제어가 비활성된다.
 *
 * 그룹 폴더 하위지만 Orca 워크트리 경로가 아닌 cwd(`inside/scratch`)에서 세션을 심어 확인한다.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const SLUG = '-C-Projects-external-fixture'

function writeSession(dir: string, stamp: string, id: string, cwd: string, title: string): void {
  mkdirSync(join(dir, SLUG), { recursive: true })
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id, cwd, timestamp: stamp }),
    JSON.stringify({ type: 'message', message: { role: 'user', at: stamp, content: title } }),
    JSON.stringify({
      type: 'message',
      message: { role: 'assistant', at: new Date(Date.parse(stamp) + 1000).toISOString(), content: '응답', model: 'm' },
    }),
  ]
  writeFileSync(join(dir, SLUG, `${stamp.replace(/[:.]/g, '-')}_${id}.jsonl`), `${lines.join('\n')}\n`)
}

test('워크트리 밖 세션은 외부 라벨이 붙고 전송이 막힌다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-external-'))
  const sessions = join(base, 'sessions')
  const data = join(base, 'data')
  const inside = join(base, 'repo')
  const outside = join(inside, 'scratch')
  mkdirSync(outside, { recursive: true })
  mkdirSync(data, { recursive: true })

  writeSession(sessions, new Date(Date.now() - 600_000).toISOString(), 'hub', inside, 'Ext 관리')
  writeSession(sessions, new Date(Date.now() - 300_000).toISOString(), 'inside-1', inside, '내부 세션')
  writeSession(sessions, new Date(Date.now() - 120_000).toISOString(), 'outside-1', outside, '외부 세션')

  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'ext',
          name: 'Ext',
          note: '',
          hubSessionId: 'hub',
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
      projects: [{ id: 'p-1', displayName: 'Ext', path: inside }],
      worktrees: [
        { id: 'wt-1', displayName: 'ext', branch: 'main', path: inside, repoId: 'p-1', parentWorktreeId: null },
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
  const badge = page.locator('.badge.external').first()
  await expect(badge).toBeVisible({ timeout: 20_000 })
  await expect(badge).toHaveText('외부')

  await badge.click()
  await page.getByRole('tab', { name: '대화' }).click()
  await expect(page.locator('#view-chat')).toBeVisible()
  await expect(page.locator('#view-chat textarea')).toBeDisabled()
  await expect(page.locator('#view-chat')).toContainText('외부 세션에는 보낼 수 없습니다')

  await app.close()
})
