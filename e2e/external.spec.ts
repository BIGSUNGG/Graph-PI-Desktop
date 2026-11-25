/**
 * 수용기준 11: Orca 가 관리하지 않는 경로의 세션은 `외부` 라벨로 남고 제어가 비활성된다.
 *
 * 허브가 도는 그룹 폴더(`hubCwd`)는 워크트리 경로가 아니므로, 그 폴더에서 시작한 세션은 외부다.
 * 워크트리 하위 폴더는 내부로 본다(`isExternalSession`).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const SLUG = '-C-Projects-external-fixture'

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

test('워크트리 밖 세션은 외부 라벨이 붙고 전송이 막힌다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-external-'))
  const sessions = join(base, 'sessions')
  const data = join(base, 'data')
  const inside = join(base, 'repo')
  const groupDir = join(data, 'groups', 'ext')
  const outside = groupDir
  mkdirSync(outside, { recursive: true })
  mkdirSync(data, { recursive: true })

  writeSession(sessions, new Date(Date.now() - 600_000).toISOString(), 'hub', groupDir, 'Ext 관리')
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
          hubCwd: groupDir,
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
  // 수용기준 11: 외부 세션은 목록에 남고 라벨이 붙는다. 보드가 아니라 사이드바 목록이 판정 기준이다.
  console.log('SIDEBAR', JSON.stringify(await page.locator('.sidebar').innerText().catch((e) => String(e))))
  const row = page.locator('.wt-sess-row').filter({ has: page.locator('.badge.external') }).first()
  const badge = row.locator('.badge.external')
  await expect(badge).toBeVisible({ timeout: 20_000 })
  await expect(badge).toHaveText('외부')

  await badge.click()
  await page.getByRole('tab', { name: '대화' }).click()
  await expect(page.locator('#view-chat')).toBeVisible()
  await expect(page.locator('#view-chat textarea')).toBeDisabled()
  await expect(page.locator('#view-chat')).toContainText('외부 세션에는 보낼 수 없습니다')

  await app.close()
})
