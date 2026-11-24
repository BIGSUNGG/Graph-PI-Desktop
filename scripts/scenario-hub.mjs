// 허브(LLM)가 프리셋 지시를 따르는지 실제 모델로 관찰한다(수용기준 58~61 증거).
// 앱이 만드는 것과 같은 초기 프롬프트(hubInitialPrompt)를 실제 pi 세션에 넣고, 결과를 상태 파일로 확인한다.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hubInitialPrompt } from '../src/main/preset.ts'

const cwd = process.cwd()
const data = mkdtempSync(join(tmpdir(), 'graph-pi-scenario-'))
const repo = join(data, 'repo')
const groupId = 'scn'
mkdirSync(repo, { recursive: true })
execFileSync('git', ['init', '-q'], { cwd: repo })
writeFileSync(join(repo, 'README.md'), '# 시나리오 저장소\n')
execFileSync('git', ['add', '-A'], { cwd: repo })
execFileSync('git', ['-c', 'user.email=s@e', '-c', 'user.name=s', 'commit', '-q', '-m', 'init'], { cwd: repo })

const firstPrompt = '로그인 API와 로그인 화면 목업을 만들어줘.'
const now = new Date().toISOString()
writeFileSync(
  join(data, 'groups.json'),
  JSON.stringify([
    {
      id: groupId,
      name: '시나리오',
      note: '',
      parentRepo: repo,
      createdAt: now,
      worktreeIds: [],
      worktreePaths: {},
      worktreeTerminals: {},
      worktreeNames: {},
      sessionNames: {},
      hubTerminalId: '',
      hubCwd: repo,
      hubSessionId: null,
      preset: 'feature',
      firstPrompt,
    },
  ]),
)

const prompt = hubInitialPrompt({
  groupId,
  groupName: '시나리오',
  groupCwd: repo,
  cliPath: join(cwd, 'packages/harness/src/cli.ts'),
  preset: 'feature',
  firstPrompt,
})

let answer = ''
let failed = ''
try {
  answer = execFileSync('cmd.exe', ['/c', 'pi', '-p', '--model', 'opencode-go/deepseek-v4.1-flash', prompt], {
    cwd: repo,
    env: { ...process.env, GRAPH_PI_DATA_DIR: data },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600_000,
    maxBuffer: 32 * 1024 * 1024,
  })
} catch (error) {
  failed = String(error.stderr ?? error.message).slice(-800)
}

const stateFile = join(data, 'groups', groupId, 'state.jsonl')
const records = existsSync(stateFile)
  ? readFileSync(stateFile, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  : []
const questions = records.filter((record) => record.type === 'question')
const goals = records.filter((record) => record.type === 'goal')

let worktrees = []
try {
  const raw = execFileSync(join(process.env['LOCALAPPDATA'] ?? '', 'Programs/Orca/resources/bin/orca.exe'), ['worktree', 'list', '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const rows = JSON.parse(raw).result?.worktrees ?? JSON.parse(raw).worktrees ?? []
  worktrees = rows.filter((row) => String(row.path ?? '').split('\\').join('/').startsWith(repo.split('\\').join('/')))
} catch (error) {
  console.log(`scenario: orca 목록 실패 ${String(error.message).split('\n')[0]}`)
}

console.log(`scenario data=${data}`)
console.log(`scenario exit=${failed === '' ? 'ok' : 'fail'} questions=${questions.length} goals=${goals.length} worktrees=${worktrees.length}`)
console.log(`scenario answer=${answer.trim().slice(-400).replace(/\s+/g, ' ')}`)
if (failed !== '') console.log(`scenario stderr=${failed.replace(/\s+/g, ' ')}`)

const ok58 = questions.length > 0 && worktrees.length === 0
console.log(`row58(질문 후 워크트리 없음)=${ok58 ? 'PASS' : 'FAIL'}`)
process.exit(ok58 ? 0 : 1)
