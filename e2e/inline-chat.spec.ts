/**
 * 수용기준 9 — 보드에서 세션을 고르면 인스펙터에서 바로 보낼 수 있다(인라인 대화).
 * 외부 세션은 채팅 화면과 같은 규칙으로 전송이 막힌다.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const SLUG = '-C-Projects-inline-fixture'

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
          id: 'in',
          name: '인라인',
          note: '',
          parentRepo: cwd,
          createdAt: new Date().toISOString(),
          worktreeIds: ['wt-1'],
          worktreePaths: { 'wt-1': cwd },
          worktreeTerminals: {},
          worktreeNames: {},
          sessionNames: {},
          hubTerminalId: 'term-hub',
          hubCwd: cwd,
          hubSessionId: hubId,
        },
      ],
    }),
  )
  writeFileSync(
    join(data, 'app-settings.json'),
    JSON.stringify({ lastGroupId: 'in', view: 'board', listFilter: 'all', inspectorTab: 'goal' }),
  )
}

test('인스펙터 인라인 대화가 선택한 세션에 붙는다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-inline-'))
  const sessions = join(base, 'sessions')
  const data = join(base, 'data')
  const repo = join(base, 'repo')
  mkdirSync(repo, { recursive: true })
  mkdirSync(data, { recursive: true })
  writeSession(sessions, new Date(Date.now() - 60_000).toISOString(), 'hub', repo, '인라인 허브')
  seedGroup(data, repo, 'hub')
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: '인라인', path: repo }],
      worktrees: [
        { id: 'wt-1', displayName: 'in', branch: 'main', path: repo, repoId: 'p-1', parentWorktreeId: null },
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

  await window.locator('.node[data-session="hub"]').click()
  // 보드에서도 같은 세션에 바로 보낼 수 있다(그래프 아래 인라인 대화).
  await expect(window.locator('.board-chat .insp-chat')).toBeVisible()
  const chat = window.locator('.inspector .insp-chat')
  await expect(chat).toBeVisible()
  await expect(chat.locator('textarea')).toBeEditable()
  await expect(chat.getByRole('button', { name: '보내기' })).toBeVisible()

  // 허브는 외부 세션이 아니므로 전송이 열려 있어야 한다.
  await chat.locator('textarea').fill('인라인에서 보낸다')
  await expect(chat.getByRole('button', { name: '보내기' })).toBeEnabled()

  await app.close()
})
