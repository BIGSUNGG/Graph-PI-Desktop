/**
 * 수용기준 5·22·23: 앱 밖에서 자라는 파일(pi 세션·하네스 상태)이 화면에 즉시 따라온다.
 * - 5: 실행 중 세션이 노드로 보이고 세션 파일 성장분이 열람에 반영된다(새 세션 파일도 등장).
 * - 22: 질문이 오면 인스펙터 카드와 채팅 인라인에 동시에 보인다.
 * - 23: 앱 재시작 후에도 미답 질문이 남는다(강조·카드 유지).
 * Orca GUI 없이 돌리기 위해 GP_ORCA_FIXTURE 를 쓰고, 상태 파일은 허브 CLI 와 같은 방식으로 덧붙인다.
 */
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const SLUG = '-C-Projects-live-fixture'

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

function questionRecord(seq: number): string {
  return `${JSON.stringify({
    type: 'question',
    schemaVersion: 1,
    writer: 'hub',
    id: 'ask-live',
    groupId: 'live',
    seq,
    at: new Date().toISOString(),
    sessionId: 'live-hub',
    sequence: 1,
    questions: [
      {
        header: 'API 검증',
        question: '로그인 API 토큰 검증 방식을 골라 주세요.',
        multiSelect: false,
        options: [
          { label: 'JWT Bearer', description: '표준 헤더' },
          { label: '세션 쿠키', description: '서버 저장' },
        ],
      },
    ],
    status: 'pending',
    answer: null,
    createdAt: new Date().toISOString(),
    deliveredAt: null,
    answeredAt: null,
    answerAppliedAt: null,
  })}\n`
}

async function launch(env: Record<string, string>): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, ...env, NODE_ENV: 'production' } })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1240, height: 860 })
  await expect(page.locator('.app')).toBeVisible()
  return { app, page }
}

test('질문과 새 세션이 앱 밖 변경만으로 화면에 나타나고 재시작 후에도 남는다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-live-'))
  const sessions = join(base, 'sessions')
  const cwd = join(base, 'repo')
  const data = join(base, 'data')
  mkdirSync(cwd, { recursive: true })
  mkdirSync(join(data, 'groups', 'live'), { recursive: true })

  const now = Date.now()
  writeSession(sessions, new Date(now - 600_000).toISOString(), 'live-hub', cwd, 'Live 관리')
  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'live',
          name: 'Live',
          note: '',
          preset: 'manual',
          firstPrompt: '',
          hubSessionId: 'live-hub',
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
    JSON.stringify({ lastGroupId: 'live', view: 'board', listFilter: 'all', inspectorTab: 'goal', inspectorHeight: 260 }),
  )
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Live', path: cwd, repoIds: ['r-1'] }],
      worktrees: [{ id: 'wt-1', displayName: 'live', branch: 'main', path: cwd, repoId: 'p-1', parentWorktreeId: null }],
      orchestration: null,
    }),
  )
  const stateFile = join(data, 'groups', 'live', 'state.jsonl')
  writeFileSync(stateFile, '')

  const env = {
    GRAPH_PI_DATA_DIR: data,
    PI_SESSIONS_DIR: sessions,
    GP_ORCA_FIXTURE: join(data, 'orca.json'),
  }
  const first = await launch(env)
  await expect.poll(() => first.page.locator('.node').count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1)

  // 5: 앱이 켜진 뒤에 생긴 세션도 노드로 등장한다(폴링 반영).
  writeSession(sessions, new Date().toISOString(), 'live-2', cwd, '두 번째 세션')
  await expect.poll(() => first.page.locator('.node').count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)

  // 22: 세션을 선택한 상태에서 허브가 남긴 질문이 인스펙터 카드로 즉시 나타난다.
  await first.page.locator('.node[data-session="live-hub"]').click()
  appendFileSync(stateFile, questionRecord(1))
  await expect(first.page.locator('.sup-question')).toBeVisible({ timeout: 20_000 })
  await expect(first.page.locator('.sup-question')).toContainText('로그인 API')

  // 22: 같은 질문이 채팅 인라인에도 보인다.
  await first.page.getByRole('tab', { name: '대화' }).click()
  await expect(first.page.locator('.chat-question')).toBeVisible({ timeout: 20_000 })
  await expect(first.page.locator('.chat-question')).toContainText('로그인 API')
  await first.app.close()

  // 23: 재시작해도 미답 질문이 남는다(상태 파일이 유일한 출처).
  const second = await launch(env)
  // 첫 실행에서 대화 화면을 보고 닫았으므로 설정에 view 가 남는다. 보드로 되돌린 뒤 노드를 센다.
  await second.page.getByRole('tab', { name: '보드' }).click()
  await expect.poll(() => second.page.locator('.node').count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
  await second.page.locator('.node[data-session="live-hub"]').click()
  await expect(second.page.locator('.sup-question')).toBeVisible({ timeout: 20_000 })
  await second.app.close()
})
