/**
 * 수용기준 2·4: Orca 가 응답하지 않으면 실행이 막히고, 하네스 상태가 없으면 4탭이 안내로 대체된다.
 *
 * 두 경우 모두 픽스처(`GP_ORCA_FIXTURE`)로 만든다 — 실제 CLI 상태에 의존하면 테스트가 환경을 탄다.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const SLUG = '-C-Projects-banner-fixture'

function writeSession(dir: string, stamp: string, id: string, cwd: string, title: string): void {
  mkdirSync(join(dir, SLUG), { recursive: true })
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id, cwd, timestamp: stamp }),
    JSON.stringify({ type: 'message', message: { role: 'user', at: stamp, content: title } }),
  ]
  writeFileSync(join(dir, SLUG, `${stamp.replace(/[:.]/g, '-')}_${id}.jsonl`), `${lines.join('\n')}\n`)
}

function seedGroup(data: string, cwd: string, hubId: string): void {
  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'bn',
          name: 'Banner',
          note: '',
          parentRepo: cwd,
          createdAt: new Date().toISOString(),
          worktreeIds: ['wt-1'],
          worktreePaths: { 'wt-1': cwd },
          worktreeTerminals: {},
          worktreeNames: {},
          sessionNames: {},
          hubTerminalId: null,
          hubCwd: cwd,
          hubSessionId: hubId,
        },
      ],
    }),
  )
  writeFileSync(
    join(data, 'app-settings.json'),
    JSON.stringify({ lastGroupId: 'bn', view: 'board', listFilter: 'all', inspectorTab: 'goal' }),
  )
}

test('Orca 가 오프라인이면 배너가 뜨고 실행 버튼이 비활성이다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-banner-'))
  const sessions = join(base, 'sessions')
  const data = join(base, 'data')
  const repo = join(base, 'repo')
  mkdirSync(repo, { recursive: true })
  mkdirSync(data, { recursive: true })
  writeSession(sessions, new Date(Date.now() - 60_000).toISOString(), 'hub', repo, 'Banner 관리')
  seedGroup(data, repo, 'hub')
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({ reachable: false, projects: [], worktrees: [], orchestration: null }),
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

  await expect(window.locator('.banner')).toContainText('Orca CLI 응답 없음')
  await expect(window.getByRole('button', { name: '새 세션' })).toBeDisabled()
  await expect(window.getByRole('button', { name: '워크트리' })).toBeDisabled()

  await app.close()
})

test('하네스 상태가 없으면 4탭이 안내 문구로 대체된다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-harness-'))
  const sessions = join(base, 'sessions')
  const data = join(base, 'data')
  const repo = join(base, 'repo')
  mkdirSync(repo, { recursive: true })
  mkdirSync(data, { recursive: true })
  writeSession(sessions, new Date(Date.now() - 60_000).toISOString(), 'hub', repo, 'Harness 관리')
  seedGroup(data, repo, 'hub')
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Banner', path: repo }],
      worktrees: [
        { id: 'wt-1', displayName: 'bn', branch: 'main', path: repo, repoId: 'p-1', parentWorktreeId: null },
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
  const window = await app.firstWindow()

  await expect(window.locator('.banner')).toContainText('하네스 상태 파일이 없습니다')
  await expect(window.locator('.insp-tabs')).toBeVisible()
  await expect(window.getByText('하네스 상태가 없어 Goal·List·Loop·Audit 을 표시할 수 없습니다.')).toBeVisible()

  await app.close()
})
