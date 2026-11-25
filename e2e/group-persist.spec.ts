/**
 * 수용기준 8: 그룹 선택이 저장돼 앱을 다시 열어도 마지막 그룹으로 돌아온다.
 *
 * ① 저장된 `lastGroupId` 로 시작하면 그 그룹이 활성이다.
 * ② 레일에서 다른 그룹을 고르면 `app-settings.json` 이 그 그룹으로 바뀐다(재시작 유지의 근거).
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const SLUG = '-C-Projects-group-fixture'

function writeSession(dir: string, stamp: string, id: string, cwd: string, title: string): void {
  mkdirSync(join(dir, SLUG), { recursive: true })
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id, cwd, timestamp: stamp }),
    JSON.stringify({ type: 'message', message: { role: 'user', at: stamp, content: title } }),
  ]
  writeFileSync(join(dir, SLUG, `${stamp.replace(/[:.]/g, '-')}_${id}.jsonl`), `${lines.join('\n')}\n`)
}

test('마지막 그룹이 복원되고 그룹을 바꾸면 저장된다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-groups-'))
  const sessions = join(base, 'sessions')
  const data = join(base, 'data')
  const alpha = join(base, 'alpha')
  const beta = join(base, 'beta')
  for (const dir of [alpha, beta, data]) mkdirSync(dir, { recursive: true })

  writeSession(sessions, new Date(Date.now() - 120_000).toISOString(), 'alpha-hub', alpha, 'Alpha 관리')
  writeSession(sessions, new Date(Date.now() - 60_000).toISOString(), 'beta-hub', beta, 'Beta 관리')

  const group = (id: string, name: string, cwd: string, hub: string) => ({
    id,
    name,
    note: '',
    parentRepo: cwd,
    createdAt: new Date().toISOString(),
    worktreeIds: [],
    worktreePaths: {},
    worktreeTerminals: {},
    worktreeNames: {},
    sessionNames: {},
    hubTerminalId: null,
    hubCwd: cwd,
    hubSessionId: hub,
  })
  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({ version: 1, groups: [group('alpha', 'Alpha', alpha, 'alpha-hub'), group('beta', 'Beta', beta, 'beta-hub')] }),
  )
  writeFileSync(
    join(data, 'app-settings.json'),
    JSON.stringify({ lastGroupId: 'beta', view: 'board', listFilter: 'all', inspectorTab: 'goal' }),
  )
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({ reachable: true, projects: [], worktrees: [], orchestration: null }),
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
  const window = await app.firstWindow()

  // ① 저장된 마지막 그룹이 활성이다.
  await expect(window.locator('.grp[data-group="beta"]')).toHaveClass(/is-active/u)

  // ② 다른 그룹을 고르면 설정 파일이 따라 바뀐다.
  // 그룹 선택은 헤더 버튼이 맡는다(`Sidebar.tsx` `.grp-head`). 행 자체를 누르면 접기만 된다.
  await window.locator('.grp[data-group="alpha"] .grp-head').click()
  await expect(window.locator('.grp[data-group="alpha"]')).toHaveClass(/is-active/u)
  await expect
    .poll(() => JSON.parse(readFileSync(join(data, 'app-settings.json'), 'utf8')).lastGroupId)
    .toBe('alpha')

  await app.close()
})
