// 허브(LLM)가 프리셋 지시를 따르는지 실제 모델로 관찰한다(수용기준 58·59 증거).
// 앱이 만드는 것과 같은 초기 프롬프트(hubInitialPrompt)를 실제 pi 세션에 넣고, 결과를 상태 파일과 Orca 로 확인한다.
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

const data = mkdtempSync(join(tmpdir(), 'graph-pi-scenario-'))
const repo = join(data, 'repo')
const groupId = 'scn'
mkdirSync(repo, { recursive: true })
execFileSync('git', ['init', '-q'], { cwd: repo })
writeFileSync(join(repo, 'README.md'), '# 시나리오 저장소')
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

const runPi = (args) =>
  execFileSync(process.execPath, [PI_ENTRY, ...args], {
    cwd: repo,
    env: { ...process.env, GRAPH_PI_DATA_DIR: data },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 900_000,
    maxBuffer: 32 * 1024 * 1024,
  })

const stateFile = join(data, 'groups', groupId, 'state.jsonl')
const readRecords = () =>
  existsSync(stateFile)
    ? readFileSync(stateFile, 'utf8')
        .split(NEWLINE)
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line))
    : []
// 허브가 만든 워크트리는 저장소 밖(orca/workspaces)에 생긴다. 경로 대신 실행 전후 id 차집합으로 센다.
const worktreeIds = () => {
  try {
    const raw = execFileSync(ORCA, ['worktree', 'list', '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    const parsed = JSON.parse(raw)
    const rows = parsed.result?.worktrees ?? parsed.worktrees ?? []
    return new Set(rows.map((row) => String(row.id ?? '')))
  } catch {
    return new Set()
  }
}
const beforeIds = worktreeIds()
const newWorktrees = () => [...worktreeIds()].filter((id) => id !== '' && !beforeIds.has(id))

// ── 1단계: 명세 질문만 보내고 워크트리를 만들지 않는다(완료기준 58)
let phase1 = ''
let phase1Error = ''
try {
  phase1 = runPi(['-p', '--model', MODEL, '--tools', 'bash', prompt])
} catch (error) {
  phase1Error = String(error.stderr ?? error.message).slice(-600)
}
const afterFirst = readRecords()
const questions1 = afterFirst.filter((record) => record.type === 'question')
const worktrees1 = newWorktrees()
const ok58 = questions1.length > 0 && worktrees1.length === 0
console.log(`scenario data=${data}`)
console.log(`scenario phase1=${phase1Error === '' ? 'ok' : 'fail'} questions=${questions1.length} worktrees=${worktrees1.length}`)
console.log(`scenario phase1 note=${phase1.trim().slice(-200).split(NEWLINE).join(' ')}`)

// ── 질문에 사용자가 답한 것과 같은 방식으로 같은 id 레코드를 다시 append 한다
const maxSeq = (list) => list.reduce((max, record) => (typeof record.seq === 'number' && record.seq > max ? record.seq : max), 0)
const pending = questions1.filter((record) => record.status === 'pending')
let seq = maxSeq(afterFirst)
for (const record of pending) {
  seq += 1
  writeFileSync(
    stateFile,
    `${JSON.stringify({
      ...record,
      seq,
      at: new Date().toISOString(),
      writer: 'scenario',
      status: 'answered',
      answeredAt: new Date().toISOString(),
      answer: Object.fromEntries(
        (record.questions ?? []).map((question) => [question.header, [question.options?.[0]?.label ?? '기본안']]),
      ),
    })}${NEWLINE}`,
    { flag: 'a' },
  )
}

// ── 2단계: 답변을 읽고 워크트리·세션을 만들고 프론트엔드에 목업 선택 질문을 보낸다(완료기준 59)
let phase2 = ''
let phase2Error = ''
try {
  phase2 = runPi([
    '-c',
    '-p',
    '--model',
    MODEL,
    '--tools',
    'bash',
    '질문 답변이 기록되었다. `show` 로 답변을 확인한 뒤 프리셋 흐름의 다음 단계를 진행해라. 필요한 워크트리와 세션을 만들고, 프론트엔드에는 목업 후보를 골라 달라는 질문을 보내라.',
  ])
} catch (error) {
  phase2Error = String(error.stderr ?? error.message).slice(-600)
}
const afterSecond = readRecords()
const worktrees2 = newWorktrees()
const mockQuestion = afterSecond.some(
  (record) => record.type === 'question' && JSON.stringify(record).includes('목업'),
)
const ok59 = worktrees2.length >= 2 && mockQuestion
console.log(`scenario phase2=${phase2Error === '' ? 'ok' : 'fail'} worktrees=${worktrees2.length} mockQuestion=${mockQuestion}`)
console.log(`scenario phase2 note=${phase2.trim().slice(-200).split(NEWLINE).join(' ')}`)
// ── 3단계: 목업 선택 답변 후 프론트엔드 요청을 허브가 백엔드 계약으로 중계한다(완료기준 60)
let seq2 = maxSeq(afterSecond)
for (const record of afterSecond.filter((item) => item.type === 'question' && item.status === 'pending')) {
  seq2 += 1
  writeFileSync(
    stateFile,
    `${JSON.stringify({
      ...record,
      seq: seq2,
      at: new Date().toISOString(),
      status: 'answered',
      answeredAt: new Date().toISOString(),
      answer: Object.fromEntries(
        (record.questions ?? []).map((question) => [question.header, [question.options?.[0]?.label ?? '기본안']]),
      ),
    })}${NEWLINE}`,
    { flag: 'a' },
  )
}

let phase3 = ''
let phase3Error = ''
try {
  phase3 = runPi([
    '-c',
    '-p',
    '--model',
    MODEL,
    '--tools',
    'bash',
    '프론트엔드가 API 정보를 요청했다. 백엔드 API 계약을 정리해 `say` 로 프론트엔드·백엔드 세션 양쪽에 전달하고, 전달한 메시지 id 를 보고해라.',
  ])
} catch (error) {
  phase3Error = String(error.stderr ?? error.message).slice(-600)
}
const afterThird = readRecords()
const messages = afterThird.filter((record) => record.type === 'message')
const targets = new Set(messages.map((record) => record.toSessionId))
const ok60 = messages.length >= 2 && targets.size >= 2
console.log(`scenario phase3=${phase3Error === '' ? 'ok' : 'fail'} messages=${messages.length} targets=${targets.size}`)
console.log(`scenario phase3 pairs=${messages.map((record) => `${record.fromSessionId}->${record.toSessionId}`).join(',')}`)
console.log(`scenario phase3 note=${phase3.trim().slice(-200).split(NEWLINE).join(' ')}`)
console.log(`row58=${ok58 ? 'PASS' : 'FAIL'} row59=${ok59 ? 'PASS' : 'FAIL'} row60=${ok60 ? 'PASS' : 'FAIL'}`)
process.exit(ok58 && ok59 && ok60 ? 0 : 1)
