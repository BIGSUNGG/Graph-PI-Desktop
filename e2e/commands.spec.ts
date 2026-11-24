/**
 * 수용기준 18: 허브가 남긴 command 레코드가 사용자 확인 없이 실행되고 보드에 반영된다.
 *
 * 허브 세션이 CLI 로 남기는 상황을 흉내내 `state.jsonl` 에 pending 이름 변경 요청을 심고,
 * 앱이 그것을 실행해 보드 제목이 바뀌는지 본다. 외부 의존(Orca·모델) 없이 실행되는 경로만 쓴다.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const SLUG = '-C-Projects-command-fixture'

function writeSession(dir: string, stamp: string, id: string, cwd: string, title: string): void {
  mkdirSync(join(dir, SLUG), { recursive: true })
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id, cwd, timestamp: stamp }),
    JSON.stringify({ type: 'message', message: { role: 'user', at: stamp, content: title } }),
  ]
  writeFileSync(join(dir, SLUG, `${stamp.replace(/[:.]/g, '-')}_${id}.jsonl`), `${lines.join('\n')}\n`)
}

test('허브의 이름 변경 요청이 확인 없이 실행되어 보드 제목이 바뀐다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-command-'))
  const sessions = join(base, 'sessions')
  const data = join(base, 'data')
  const repo = join(base, 'repo')
  const groupDir = join(data, 'groups', 'cmd')
  mkdirSync(repo, { recursive: true })
  mkdirSync(groupDir, { recursive: true })

  writeSession(sessions, new Date(Date.now() - 600_000).toISOString(), 'hub', repo, 'Cmd 관리')
  writeSession(sessions, new Date(Date.now() - 300_000).toISOString(), 'sess-a', repo, '원래 제목')

  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'cmd',
          name: 'Cmd',
          note: '',
          hubSessionId: 'hub',
          parentRepo: repo,
          createdAt: new Date().toISOString(),
          worktreeIds: ['wt-1'],
          worktreePaths: { 'wt-1': repo },
          worktreeTerminals: {},
          hubTerminalId: null,
          hubCwd: repo,
        },
      ],
    }),
  )
  writeFileSync(
    join(data, 'app-settings.json'),
    JSON.stringify({ lastGroupId: 'cmd', view: 'board', listFilter: 'all', inspectorTab: 'goal', inspectorHeight: 260 }),
  )
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Cmd', path: repo }],
      worktrees: [
        { id: 'wt-1', displayName: 'cmd', branch: 'main', path: repo, repoId: 'p-1', parentWorktreeId: null },
      ],
      orchestration: null,
    }),
  )
  const record = {
    type: 'command',
    id: 'cmd-record-1',
    groupId: 'cmd',
    seq: 1,
    at: new Date().toISOString(),
    schemaVersion: 1,
    writer: 'hub',
    fromSessionId: 'hub',
    action: 'rename-session',
    target: 'sess-a',
    value: '허브가 정한 제목',
    status: 'pending',
    result: null,
    createdAt: new Date().toISOString(),
    executedAt: null,
  }
  writeFileSync(join(groupDir, 'state.jsonl'), `${JSON.stringify(record)}\n`)

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
  await expect(page.locator('.node').first()).toBeVisible({ timeout: 20_000 })
  // 앱이 요청을 실행하면 별칭이 그룹 파일에 저장되고, push 로 보드 제목이 바뀐다.
  // 카드 제목은 SVG <text> 라 innerText 가 없다. 텍스트 노드로 확인한다.
  await expect(page.getByText('허브가 정한 제목').first()).toBeVisible({ timeout: 20_000 })

  await app.close()

  // 실행 결과가 같은 id 로 append 되어 남는다(요청 + 결과 두 줄).
  const lines = readFileSync(join(groupDir, 'state.jsonl'), 'utf8').trim().split('\n')
  expect(lines.length).toBe(2)
  const settled = JSON.parse(lines[1] ?? '{}') as { id: string; status: string; executedAt: string | null }
  expect(settled.id).toBe('cmd-record-1')
  expect(settled.status).toBe('done')
  expect(settled.executedAt).not.toBeNull()
})
