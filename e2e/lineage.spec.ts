/**
 * 수용기준 7: 세션 계보 트리 — 부모 세션이 루트로, 자식 세션이 들여쓰기(depth)로 목록에 나타나고
 * 감사 세션은 `AUDIT` 배지로 구분된다. 코드 존재가 아니라 화면에서 확인한다.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const SLUG = '-C-Projects-lineage-fixture'

function writeSession(
  dir: string,
  stamp: string,
  id: string,
  cwd: string,
  title: string,
  parentSessionId: string | null,
): void {
  mkdirSync(join(dir, SLUG), { recursive: true })
  const header: Record<string, unknown> = { type: 'session', version: 3, id, cwd, timestamp: stamp, title }
  if (parentSessionId !== null) header['parentSessionId'] = parentSessionId
  const lines = [
    JSON.stringify(header),
    JSON.stringify({ type: 'message', message: { role: 'user', at: stamp, content: title } }),
    JSON.stringify({
      type: 'message',
      message: { role: 'assistant', at: new Date(Date.parse(stamp) + 1000).toISOString(), content: '응답', model: 'm' },
    }),
  ]
  writeFileSync(join(dir, SLUG, `${stamp.replace(/[:.]/g, '-')}_${id}.jsonl`), `${lines.join('\n')}\n`)
}

test('부모·자식 세션이 계보 트리로 보이고 감사 세션에 배지가 붙는다', async () => {
  const base = mkdtempSync(join(tmpdir(), 'graph-pi-lineage-'))
  const sessions = join(base, 'sessions')
  const data = join(base, 'data')
  const inside = join(base, 'repo')
  mkdirSync(inside, { recursive: true })
  mkdirSync(data, { recursive: true })

  const root = new Date(Date.now() - 900_000).toISOString()
  const child = new Date(Date.now() - 600_000).toISOString()
  const audit = new Date(Date.now() - 300_000).toISOString()
  writeSession(sessions, root, 'lin-root', inside, '루트 세션', null)
  writeSession(sessions, child, 'lin-child', inside, '자식 세션', 'lin-root')
  writeSession(sessions, audit, 'lin-audit', inside, '감사 세션', 'lin-root')

  writeFileSync(
    join(data, 'groups.json'),
    JSON.stringify({
      version: 1,
      groups: [
        {
          id: 'lin',
          name: 'Lin',
          note: '',
          hubSessionId: null,
          parentRepo: inside,
          createdAt: new Date().toISOString(),
          worktreeIds: ['wt-1'],
          worktreePaths: { 'wt-1': inside },
          worktreeTerminals: {},
          hubTerminalId: null,
          hubCwd: '',
        },
      ],
    }),
  )
  writeFileSync(
    join(data, 'orca.json'),
    JSON.stringify({
      reachable: true,
      projects: [{ id: 'p-1', displayName: 'Lin', path: inside }],
      worktrees: [
        { id: 'wt-1', displayName: 'lin', branch: 'main', path: inside, repoId: 'p-1', parentWorktreeId: null },
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
  await page.getByRole('tab', { name: '대화' }).click()
  await expect(page.locator('#view-chat')).toBeVisible()

  // 루트 1개, 자식 2개(자식 세션 + 감사 세션). 목록 제목은 cwd 폴더 이름이라 id 로 구분한다.
  const roots = page.locator('.chat-item[data-depth="0"]')
  const children = page.locator('.chat-item[data-depth="1"]')
  await expect(roots).toHaveCount(1, { timeout: 20_000 })
  await expect(children).toHaveCount(2)

  // 들여쓰기가 실제로 다르다 — depth 값만 맞고 스타일이 없으면 트리로 읽히지 않는다.
  const rootPad = await roots.first().evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingLeft))
  const childPad = await children.first().evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingLeft))
  expect(childPad - rootPad).toBeGreaterThanOrEqual(12)

  // 감사 세션은 자식이면서 AUDIT 배지를 달고, 루트에는 붙지 않는다.
  const auditBadges = page.locator('.chat-item[data-depth="1"] .audit-badge')
  await expect(auditBadges).toHaveCount(1)
  await expect(auditBadges.first()).toHaveText('AUDIT')
  await expect(page.locator('.chat-item[data-depth="0"] .audit-badge')).toHaveCount(0)

  await app.close()
})
