/**
 * 수용기준 6·13·33·34·35·36·45: 인스펙터·배지·TODO·일시정지 표시.
 * 하네스 상태는 실제 CLI(`packages/harness/src/cli.ts`)로 심는다 — 앱이 읽는 파일 형식과
 * 에이전트가 쓰는 형식이 같다는 것도 이 테스트가 함께 확인한다.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const SLUG = '-C-Projects-insp-fixture'
const CLI = join(process.cwd(), 'packages', 'harness', 'src', 'cli.ts')

function cli(data: string, args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args, '--group', 'insp', '--writer', 'hub'], {
    env: { ...process.env, GRAPH_PI_DATA_DIR: data },
    encoding: 'utf8',
  })
}

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
        content: '완료했습니다.',
        model: 'deepseek-v4.1-flash',
        usage: { input: 1500, output: 400, cacheRead: 0, cacheWrite: 0 },
      },
    }),
  ]
  writeFileSync(join(dir, SLUG, `${stamp.replace(/[:.]/g, '-')}_${id}.jsonl`), `${lines.join('\n')}\n`)
}

test('노드 상세·4슬롯 배지·TODO 읽기 전용·일시정지 사유가 보인다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-insp-'))
  const sessions = join(base, 'sessions')
  const cwd = join(base, 'repo')
  const data = join(base, 'data')
  mkdirSync(cwd, { recursive: true })
  mkdirSync(join(data, 'groups', 'insp'), { recursive: true })

  const stamp = new Date(Date.now() - 900_000).toISOString()
  writeSession(sessions, stamp, 'insp-hub', cwd, 'Insp 관리')

  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'insp',
          name: 'Insp',
          note: '',
          preset: 'manual',
          firstPrompt: '',
          hubSessionId: 'insp-hub',
          parentRepo: cwd,
          createdAt: new Date().toISOString(),
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
    JSON.stringify({ lastGroupId: 'insp', view: 'board', listFilter: 'all', inspectorTab: 'goal', inspectorHeight: 260 }),
  )
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Insp', path: cwd, repoIds: ['r-1'] }],
      worktrees: [{ id: 'wt-1', displayName: 'insp', branch: 'main', path: cwd, repoId: 'p-1', parentWorktreeId: null }],
      orchestration: null,
    }),
  )

  // 하네스 상태: 일시정지 Goal + 완료 조건, List 항목, Loop, Audit, TODO 3상태.
  cli(data, ['list', '--id', 'item-1', '--goal', 'goal-paused', '--title', '인스펙터 탭 정리', '--state', 'active', '--session', 'insp-hub'])
  cli(data, ['loop', '--id', 'loop-1', '--goal', 'goal-paused', '--target', '번들 크기', '--measure', 'echo 100', '--value', '100', '--iteration', '1', '--max', '5', '--session', 'insp-hub'])
  // Audit 은 대상 Goal 의 상태를 바꾸므로(승인 전이는 정책이 수행) 별도 Goal 로 심는다.
  cli(data, ['goal', '--id', 'goal-audited', '--objective', '감사 승인 경로 확인', '--check', '근거 확인', '--session', 'insp-hub'])
  cli(data, ['audit', '--goal', 'goal-audited', '--verdict', 'approved', '--summary', '조건 충족', '--session', 'insp-hub'])
  cli(data, ['goal', '--id', 'goal-paused', '--objective', '보드 인스펙터를 목업에 맞춘다', '--check', '빌드 통과', '--check', '수용기준 확인', '--status', 'paused', '--pause-reason', 'user', '--session', 'insp-hub'])
  cli(data, ['todo', '--session', 'insp-hub', '--text', '대기 작업', '--status', 'todo', '--scope', 'session'])
  cli(data, ['todo', '--session', 'insp-hub', '--text', '진행 작업', '--status', 'doing', '--scope', 'session'])
  cli(data, ['todo', '--session', 'insp-hub', '--text', '끝난 작업', '--status', 'done', '--scope', 'session'])

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
  await expect(page.locator('.app')).toBeVisible()

  // 6: 노드 카드가 모델·시작 시각·토큰을 보여준다.
  await expect.poll(() => page.locator('.node').count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1)
  await expect(page.getByText('deepseek-v4.1-flash').first()).toBeVisible()
  await expect(page.getByText(/k/).first()).toBeVisible()

  // 13: 보드 카드와 사이드바에 4슬롯 배지가 항상 있다.
  // SVG <g> 는 bounding box 가 0 이면 Playwright 가 hidden 으로 본다. 배지 4개가 그려졌는지로 확인한다.
  await expect.poll(() => page.locator('.slot-badges [data-slot]').count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(4)

  // 33·45: 세션을 고르면 4탭 + 일시정지 사유가 보인다.
  await page.locator('.node[data-session="insp-hub"]').click()
  await expect(page.locator('.insp-tabs')).toBeVisible()
  await expect(page.getByText('일시정지 사유')).toBeVisible()
  await expect(page.getByText('일시정지 사유').locator('..')).toContainText('사용자')

  // 34: TODO 3상태가 읽기 전용으로 표시된다.
  await expect(page.getByText('대기 작업')).toBeVisible()
  await expect(page.getByText('진행 작업')).toBeVisible()
  await expect(page.getByText('끝난 작업')).toBeVisible()

  // 35: TODO 패널에는 조작 버튼이 없다.
  expect(await page.locator('.todo-panel button, .todo-panel input').count()).toBe(0)

  // 36: 세션을 고른 인스펙터는 세션 스코프 TODO 만 보여준다.
  await expect(page.locator('.todo-panel')).toHaveAttribute('data-todo-scope', 'session')

  // 33·36: 그룹을 고르면 허브 4탭 + 하위 세션 집계 + 그룹 전 세션 TODO 로 바뀐다.
  await page.locator('.grp[data-group="insp"] .grp-name').click()
  await expect(page.locator('.insp-tabs')).toBeVisible()
  await expect.poll(() => page.locator('[data-group-aggregate="true"]').count(), { timeout: 10_000 }).toBe(1)
  await expect(page.locator('[data-group-aggregate="true"]')).toContainText('세션')
  await expect(page.locator('.todo-panel')).toHaveAttribute('data-todo-scope', 'group')
  await expect(page.getByText('대기 작업')).toBeVisible()

  await app.close()
})
