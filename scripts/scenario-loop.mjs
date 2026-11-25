// Loop 프리셋 그룹에서 허브가 6개 loop·워크트리·하위 Goal 을 만들고 통합 기록을 남기는지 실제 모델로 관찰한다(수용기준 61·64).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hubInitialPrompt } from '../src/main/preset.ts'

const cwd = process.cwd()
const PI_ENTRY =
  'C:/Users/DAESUNG/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'
const ORCA = join(process.env['LOCALAPPDATA'] ?? '', 'Programs/Orca/resources/bin/orca.exe')
const MODEL = 'opencode-go/deepseek-v4.1-flash'
const NEWLINE = String.fromCharCode(10)

const data = mkdtempSync(join(tmpdir(), 'graph-pi-loop-'))
const repo = join(data, 'repo')
const groupId = 'loop'
mkdirSync(repo, { recursive: true })
execFileSync('git', ['init', '-q'], { cwd: repo })
writeFileSync(join(repo, 'README.md'), '# Loop 시나리오 저장소')
execFileSync('git', ['add', '-A'], { cwd: repo })
execFileSync('git', ['-c', 'user.email=s@e', '-c', 'user.name=s', 'commit', '-q', '-m', 'init'], { cwd: repo })

const firstPrompt = '이 서비스의 보안·속도·확장성·유지보수성을 검토하고 개선해.'
const now = new Date().toISOString()
writeFileSync(
  join(data, 'groups.json'),
  JSON.stringify([
    {
      id: groupId,
      name: '루프',
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
      preset: 'loop',
      firstPrompt,
    },
  ]),
)

const prompt = hubInitialPrompt({
  groupId,
  groupName: '루프',
  groupCwd: repo,
  cliPath: join(cwd, 'packages/harness/src/cli.ts'),
  preset: 'loop',
  firstPrompt,
})

const runPi = (args) =>
  execFileSync(process.execPath, [PI_ENTRY, ...args], {
    cwd: repo,
    env: { ...process.env, GRAPH_PI_DATA_DIR: data },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 2_700_000,
    maxBuffer: 64 * 1024 * 1024,
  })

const stateFile = join(data, 'groups', groupId, 'state.jsonl')
const readRecords = () =>
  existsSync(stateFile)
    ? readFileSync(stateFile, 'utf8')
        .split(NEWLINE)
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line))
    : []
const worktreeIds = () => {
  try {
    const raw = execFileSync(ORCA, ['worktree', 'list', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const parsed = JSON.parse(raw)
    const rows = parsed.result?.worktrees ?? parsed.worktrees ?? []
    return new Set(rows.map((row) => String(row.id ?? '')))
  } catch {
    return new Set()
  }
}

const before = worktreeIds()
let phase1 = ''
let phase1Error = ''
try {
  phase1 = runPi(['-p', '--model', MODEL, '--tools', 'bash', prompt])
} catch (error) {
  phase1Error = String(error.stderr ?? error.message).slice(-800)
}
const records = readRecords()
const loops = records.filter((record) => record.type === 'loop')
const goals = records.filter((record) => record.type === 'goal')
const created = [...worktreeIds()].filter((id) => id !== '' && !before.has(id))
console.log(`loop-scenario data=${data}`)
console.log(`loop-scenario phase1=${phase1Error === '' ? 'ok' : 'fail'} loops=${loops.length} goals=${goals.length} worktrees=${created.length}`)
console.log(`loop-scenario note=${phase1.trim().slice(-300).split(NEWLINE).join(' ')}`)
const ok61 = created.length >= 6 && loops.length >= 6
const ok64 = goals.length >= 6
console.log(`row61(loop 6개·워크트리 6개)=${ok61 ? 'PASS' : 'FAIL'} row64(하위 Goal 6개)=${ok64 ? 'PASS' : 'FAIL'}`)
process.exit(ok61 && ok64 ? 0 : 1)
