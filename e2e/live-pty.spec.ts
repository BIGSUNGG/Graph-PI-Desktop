/**
 * 수용기준 14 — 실제 Orca PTY 세션을 띄우면 앱 보드에 그 세션이 나타난다.
 * 픽스처가 아니라 진짜 Orca CLI·진짜 pi 세션을 쓴다. 그래서 기본 실행에서는 건너뛰고,
 * `GP_LIVE=1 npx playwright test e2e/live-pty.spec.ts` 로만 돌린다(느리고 환경을 탄다).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { addProject } from '../src/main/orca/projects.ts'
import { createWorktree, removeWorktree } from '../src/main/orca/worktrees.ts'
import { startPiAgent } from '../src/main/orca/agents.ts'
import { orcaJson } from '../src/main/orca/cli.ts'

const live = process.env['GP_LIVE'] === '1'
const norm = (value: string): string => value.split(sep).join('/').toLowerCase()

test.skip(!live, 'GP_LIVE=1 일 때만 실제 Orca PTY 로 확인한다')

test('실제 PTY 세션이 보드 노드로 나타난다', async () => {
  test.setTimeout(300_000)
  const stamp = Date.now().toString(36)
  const repo = mkdtempSync(join(tmpdir(), 'gp-live-repo-'))
  const data = mkdtempSync(join(tmpdir(), 'gp-live-data-'))
  const sessions = mkdtempSync(join(tmpdir(), 'gp-live-sessions-'))

  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  execFileSync('git', ['-C', repo, 'commit', '-q', '--allow-empty', '-m', 'live: init'])
  const project = await addProject(repo)
  const matched = project.ok ? project.result.find((entry) => norm(entry.path) === norm(repo)) : null
  const made = await createWorktree({
    repo: matched?.id ?? repo,
    name: `live-${stamp}`,
    branch: `live/${stamp}`,
    base: 'main',
    parentWorktreeId: null,
  })
  expect(made.ok && made.result !== null).toBe(true)
  const worktree = made.ok ? made.result : null

  const launched = worktree === null
    ? { ok: false as const, error: 'worktree 없음' }
    : await startPiAgent(worktree.path, '보드 확인용 짧은 답변만 하세요.', 'opencode-go/deepseek-v4.1-flash')
  expect(launched.ok).toBe(true)

  mkdirSync(data, { recursive: true })
  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'live',
          name: '실측',
          note: '',
          parentRepo: repo,
          createdAt: new Date().toISOString(),
          worktreeIds: worktree === null ? [] : [worktree.id],
          worktreePaths: worktree === null ? {} : { [worktree.id]: worktree.path },
          worktreeTerminals: {},
          worktreeNames: {},
          sessionNames: {},
          hubTerminalId: null,
          hubCwd: repo,
          hubSessionId: null,
        },
      ],
    }),
  )
  writeFileSync(
    join(data, 'app-settings.json'),
    JSON.stringify({ lastGroupId: 'live', view: 'board', listFilter: 'all', inspectorTab: 'goal' }),
  )

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      GRAPH_PI_DATA_DIR: data,
      PI_SESSIONS_DIR: defaultSessions(),
      NODE_ENV: 'production',
      ...(process.env['GP_ORCA_FIXTURE'] === undefined ? {} : { GP_ORCA_FIXTURE: process.env['GP_ORCA_FIXTURE'] }),
    },
  })
  const window = await app.firstWindow()

  // 실제 Orca CLI 로 세션이 만들어지고, 앱이 그 세션 파일을 읽어 보드에 그린다.
  const node = window.locator('#view-board .node[data-session]').first()
  await expect(node).toBeVisible({ timeout: 180_000 })

  // 수용기준 18: 허브가 남긴 command 가 확인 없이 실행되고 결과가 보드에 반영된다.
  // 여기서는 실제 데이터 디렉터리에 rename-session 명령을 덧붙이고, 앱이 그 이름을 그리는지 본다.
  const sessionId = await node.getAttribute('data-session')
  if (sessionId !== null) {
    execFileSync(
      process.execPath,
      [
        join(process.cwd(), 'packages', 'harness', 'src', 'cli.ts'),
        'command', '--group', 'live', '--writer', 'hub', '--session', sessionId,
        '--action', 'rename-session', '--target', sessionId, '--value', '이름변경 확인',
      ],
      { env: { ...process.env, GRAPH_PI_DATA_DIR: data }, stdio: 'ignore' },
    )
    await expect(window.locator(`#view-board .node[data-session="${sessionId}"]`)).toContainText('이름변경 확인', {
      timeout: 60_000,
    })
  }

  await app.close()

  if (worktree !== null) {
    await orcaJson(['terminal', 'close', '--worktree', `path:${worktree.path}`, '--all'])
    await removeWorktree(worktree.id, { force: true })
  }
  // Windows 는 방금 닫은 프로세스의 핸들이 잠시 남는다 — 정리 실패가 결과를 뒤집지 않게 한다.
  for (const dir of [repo, data, sessions]) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* 잠금 해제 대기 — 테스트 결과와 무관하다 */
    }
  }
})

/** pi 세션 기본 경로(앱과 같은 규칙). */
function defaultSessions(): string {
  return join(process.env['USERPROFILE'] ?? process.env['HOME'] ?? '', '.pi', 'agent', 'sessions')
}
