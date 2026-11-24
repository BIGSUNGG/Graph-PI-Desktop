/**
 * 수용기준 12: 동시 20세션 재그리기에서 끊김이 눈에 띄지 않는다.
 * 합성 세션 20개를 임시 세션 디렉터리에 심고, 보드가 그려지는 시간과 화면 왕복 재그리기 시간을 측정한다.
 * 예산을 넘으면 실패한다(사람이 끊김을 느끼는 수준을 기준으로 잡았다).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const SESSION_COUNT = 20
const RENDER_BUDGET_MS = 3000
const REDRAW_BUDGET_MS = 1200
const SLUG = '-C-Projects-perf-fixture'

type Seed = { dir: string; id: string; cwd: string; title: string }

function writeSession(dir: string, stamp: string, id: string, cwd: string, title: string): void {
  mkdirSync(join(dir, SLUG), { recursive: true })
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id, cwd, timestamp: stamp }),
    JSON.stringify({ type: 'message', message: { role: 'user', at: stamp, content: title } }),
    JSON.stringify({
      type: 'message',
      message: {
        role: 'assistant',
        at: new Date(Date.parse(stamp) + 1000).toISOString(),
        content: `${title} 응답`,
        model: 'deepseek-v4.1-flash',
        usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0 },
      },
    }),
  ]
  writeFileSync(join(dir, SLUG, `${stamp.replace(/[:.]/g, '-')}_${id}.jsonl`), `${lines.join('\n')}\n`)
}

function seedSessions(seed: Seed): void {
  writeSession(seed.dir, new Date(Date.now() - 3600_000).toISOString(), seed.id, seed.cwd, seed.title)
  for (let index = 0; index < SESSION_COUNT; index += 1) {
    const stamp = new Date(Date.now() - index * 60_000).toISOString()
    const id = `perf-${String(index).padStart(2, '0')}`
    writeSession(seed.dir, stamp, id, seed.cwd, `세션 ${index} 요청`)
  }
}

test('20세션 보드가 예산 안에 그려지고 화면 전환도 끊기지 않는다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-perf-'))
  const sessions = join(base, 'sessions')
  const cwd = join(base, 'repo')
  const data = join(base, 'data')
  mkdirSync(cwd, { recursive: true })
  mkdirSync(data, { recursive: true })
  seedSessions({ dir: sessions, id: 'perf-hub', cwd, title: 'Perf 관리' })
  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'perf',
          name: 'Perf',
          note: '',
          hubSessionId: 'perf-hub',
          parentRepo: cwd,
          createdAt: new Date().toISOString(),
          worktreeIds: ['wt-1'],
          worktreePaths: { 'wt-1': cwd },
          worktreeTerminals: {},
          hubTerminalId: null,
          hubCwd: cwd,
        },
      ],
    }),
  )
  // Orca GUI 없이 레인을 그리기 위한 스냅샷 고정(GP_ORCA_FIXTURE).
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Perf', path: cwd, repoIds: ['r-1'] }],
      worktrees: [
        { id: 'wt-1', displayName: 'perf', branch: 'main', path: cwd, repoId: 'p-1', parentWorktreeId: null },
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

  const started = Date.now()
  await expect(page.locator('#view-board')).toBeVisible()
  await expect.poll(() => page.locator('.node').count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
  const firstDraw = Date.now() - started
  const nodes = await page.locator('.node').count()
  console.log(`perf: 첫 보드 그리기 ${firstDraw}ms, 노드 ${nodes}개`)
  expect(firstDraw).toBeLessThan(RENDER_BUDGET_MS)

  const redrawStart = Date.now()
  await page.getByRole('tab', { name: '대화' }).click()
  await page.getByRole('tab', { name: '보드' }).click()
  await expect.poll(() => page.locator('.node').count(), { timeout: 20_000 }).toBe(nodes)
  const redraw = Date.now() - redrawStart
  console.log(`perf: 화면 왕복 재그리기 ${redraw}ms (노드 ${nodes}개)`)
  expect(redraw).toBeLessThan(REDRAW_BUDGET_MS)

  await app.close()
})
