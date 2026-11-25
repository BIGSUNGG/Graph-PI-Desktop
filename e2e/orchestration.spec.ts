/**
 * 수용기준 31(SPEC-mvp-acceptance): 오케스트레이션 Run 의 저장 필드 `goal` 은 화면에서 `목적` 으로
 * 표시되고, 화면은 조회 전용이다(상태를 바꾸는 조작 버튼이 없다).
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

test('Run 의 goal 은 목적으로 보이고 화면은 조회 전용이다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-orch-'))
  const cwd = join(base, 'repo')
  const data = join(base, 'data')
  mkdirSync(cwd, { recursive: true })
  mkdirSync(join(data, 'groups', 'orch'), { recursive: true })
  const at = new Date().toISOString()

  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'orch',
          name: 'Orch',
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
    JSON.stringify({
      lastGroupId: 'orch',
      view: 'orchestration',
      listFilter: 'all',
      inspectorTab: 'goal',
      inspectorHeight: 260,
    }),
  )
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Orch', path: cwd, repoIds: ['r-1'] }],
      worktrees: [{ id: 'wt-1', displayName: 'orch', branch: 'main', path: cwd, repoId: 'p-1', parentWorktreeId: null }],
      orchestration: {
        runs: [{ id: 'run-1', goal: '로그인 API 를 완성한다', status: 'running', startedAt: at }],
        tasks: [{ id: 'task-1', runId: 'run-1', title: '엔드포인트 구현', state: 'running', dependsOn: [] }],
        workers: [
          {
            id: 'w-1',
            runId: 'run-1',
            taskId: 'task-1',
            state: 'working',
            terminalState: 'running',
            attention: false,
            host: 'local',
          },
        ],
        gates: [{ id: 'g-1', runId: 'run-1', name: 'e2e', state: 'pending' }],
      },
    }),
  )
  writeFileSync(join(data, 'groups', 'orch', 'state.jsonl'), '')

  const { app, page } = await launch({
    GRAPH_PI_DATA_DIR: data,
    PI_SESSIONS_DIR: join(base, 'sessions'),
    GP_ORCA_FIXTURE: join(data, 'orca.json'),
  })

  try {
    await page.locator('.nav-item[data-view="orchestration"]').click()
    const orch = page.locator('.orch')
    await expect(orch).toBeVisible({ timeout: 20_000 })
    await expect(orch).toContainText('목적: 로그인 API 를 완성한다')
    await expect(orch).toContainText('엔드포인트 구현')

    // 조회 전용: 버튼은 실행 선택(select) 외에 없고, run 상태를 바꾸는 조작이 없다.
    await expect(orch.locator('button')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
