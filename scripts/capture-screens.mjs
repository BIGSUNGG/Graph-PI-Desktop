/**
 * 목업 대응 스크린샷 산출물을 만든다(검증계약 6행).
 * 실제 앱을 띄우고, 임시 데이터 디렉터리에 그룹·하네스 기록을 심은 뒤 4화면 + 인스펙터를 캡처한다.
 * 사용: node scripts/capture-screens.mjs
 */
import { spawnSync } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const OUT = 'mock/_evidence'
const base = mkdtempSync(join(tmpdir(), 'graph-pi-shots-'))
const repo = join(base, 'demo-repo')
const data = join(base, 'data')
const groupId = 'demo'

function cli(args) {
  const res = spawnSync(process.execPath, ['packages/harness/src/cli.ts', ...args], {
    encoding: 'utf8',
    env: { ...process.env, GRAPH_PI_DATA_DIR: data },
  })
  if (res.status !== 0) throw new Error(`cli ${args.join(' ')} 실패: ${res.stderr || res.stdout}`)
  return res.stdout.trim()
}

mkdirSync(repo, { recursive: true })
execFileSync('git', ['init', '--quiet'], { cwd: repo })
mkdirSync(data, { recursive: true })
mkdirSync(OUT, { recursive: true })

const now = new Date().toISOString()
writeFileSync(
  join(data, 'groups.json'),
  JSON.stringify(
    {
      version: 1,
      groups: [
        {
          id: groupId,
          name: 'Graph-PI',
          note: '데모 그룹',
          hubSessionId: null,
          parentRepo: repo,
          createdAt: now,
          worktreeIds: [],
          worktreePaths: {},
          worktreeTerminals: {},
          hubTerminalId: null,
          hubCwd: repo,
        },
      ],
    },
    null,
    2
  )
)

cli(['goal', '--group', groupId, '--id', 'goal-1', '--objective', 'MVP 를 목업과 동일하게 완성', '--status', 'active', '--check', '빌드 통과', '--check', 'E2E 통과'])
cli(['list', '--group', groupId, '--id', 'item-1', '--title', '인스펙터 탭 연결', '--state', 'queued', '--order', '1'])
cli(['list', '--group', groupId, '--id', 'item-2', '--title', '검색 인덱스 점검', '--state', 'in-progress', '--order', '2'])
cli(['loop', '--group', groupId, '--id', 'loop-1', '--goal', 'goal-1', '--target', 'typecheck 오류 0', '--measure', 'npx tsc --noEmit | wc -l', '--direction', 'min', '--max', '20'])
cli(['todo', '--group', groupId, '--id', 'todo-1', '--text', '목업 스크린샷 대조', '--state', 'pending'])
cli(['audit', '--group', groupId, '--id', 'audit-1', '--goal', 'goal-1', '--scope', 'goal', '--verdict', 'approved', '--summary', '하네스 상태 기계 검증 완료'])

// 실제 Pi 세션을 하나 만들어 대화 화면이 빈 상태가 아니게 한다.
if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/c', 'pi', '-p', '--model', 'opencode-go/deepseek-v4.1-flash', '--no-tools', '스크린샷용 짧은 답변 부탁해'], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 240_000,
  })
}

const app = await electron.launch({
  args: ['.'],
  cwd: process.cwd(),
  env: { ...process.env, GRAPH_PI_DATA_DIR: data, NODE_ENV: 'production' },
})
const win = await app.firstWindow()
await win.setViewportSize({ width: 1240, height: 860 })
await win.waitForSelector('.topbar')
await win.waitForTimeout(2500)

async function shoot(name) {
  await win.waitForTimeout(500)
  await win.screenshot({ path: join(OUT, `${name}.png`) })
  console.log('captured', name)
}

await shoot('view-board')
await win.getByRole('tab', { name: '대화' }).click()
await shoot('view-chat')
await win.getByRole('tab', { name: '오케스트레이션' }).click()
await shoot('view-orchestration')
await win.getByRole('tab', { name: '히스토리' }).click()
await shoot('view-history')

await win.getByRole('tab', { name: '보드' }).click()
// 세션 노드가 없어도 인스펙터는 그룹 허브 범위로 항상 그려진다(수용기준 6·20).
await win.getByRole('tab', { name: 'Goal' }).click()
await shoot('inspector-goal')
await win.getByRole('tab', { name: 'List' }).click()
await shoot('inspector-list')
await app.close()
console.log('evidence dir:', OUT)
