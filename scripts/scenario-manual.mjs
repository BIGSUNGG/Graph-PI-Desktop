/**
 * Manual 프리셋 시나리오(수용기준 62): 프리셋이 진행 순서를 강제하지 않을 때
 * 허브가 스스로 구조를 정하는지 실제 모델 실행으로 관찰한다.
 *
 * 관찰 기준: 프롬프트에 Feature/Loop 단계 지시가 없고(MANUAL 대기 문장만), 실행 뒤 하네스 기록이
 * 남는다 — 허브가 자기 판단으로 ask/todo/세션 같은 구조를 만들었다는 뜻이다.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { hubInitialPrompt } from '../src/main/preset.ts'

const PI_ENTRY = process.env['PI_ENTRY'] ?? join(process.env['APPDATA'] ?? '', 'npm', 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'bundle', 'cli.js')
const MODEL = process.env['SCENARIO_MODEL'] ?? 'opencode-go/deepseek-v4.1-flash'
const tag = Date.now().toString(36)
const groupId = `manual-${tag}`
const repo = mkdtempSync(join(tmpdir(), 'gp-manual-repo-'))
const data = mkdtempSync(join(tmpdir(), 'gp-manual-data-'))
const cwd = process.cwd()
const firstPrompt = '이 저장소에 작은 CLI 도구를 하나 만들고 싶어. 구조는 네가 정해줘.'

const results = []
const step = (label, ok, detail) => {
  results.push(ok)
  process.stdout.write(`scenario-manual ${label} ${ok ? 'PASS' : 'FAIL'} ${detail}\n`)
}

execFileSync('git', ['init', '-q'], { cwd: repo })
writeFileSync(join(repo, 'README.md'), '# manual 시나리오 저장소\n')
execFileSync('git', ['add', '-A'], { cwd: repo })
execFileSync('git', ['-c', 'user.email=s@e', '-c', 'user.name=s', 'commit', '-q', '-m', 'init'], { cwd: repo })

writeFileSync(
  join(data, 'groups.json'),
  JSON.stringify([
    {
      id: groupId,
      name: 'Manual 시나리오',
      note: '',
      parentRepo: repo,
      createdAt: new Date().toISOString(),
      worktreeIds: [],
      worktreePaths: {},
      worktreeTerminals: {},
      worktreeNames: {},
      sessionNames: {},
      hubTerminalId: '',
      hubCwd: repo,
      hubSessionId: null,
      preset: 'manual',
      firstPrompt,
    },
  ]),
)

const prompt = hubInitialPrompt({
  groupId,
  groupName: 'Manual 시나리오',
  groupCwd: repo,
  cliPath: join(cwd, 'packages/harness/src/cli.ts'),
  preset: 'manual',
  firstPrompt,
})

// Manual 은 진행 순서를 강제하지 않는다 — 대기 문장만 있고 Feature/Loop 단계 지시는 없다.
// 첫 요청이 있으면 대기 문장 대신 그 요청이 실린다(대기 문장은 첫 요청이 비었을 때만).
step('prompt-carries-first-request', prompt.includes(`첫 요청: ${firstPrompt}`), '첫 요청 포함')
step('prompt-has-no-preset-steps', !prompt.includes('워크트리를 각각 만들고'), '프리셋 단계 지시 없음')

let runError = null
try {
  execFileSync(process.execPath, [PI_ENTRY, '-p', '--model', MODEL, '--tools', 'bash', prompt], {
    cwd: repo,
    env: { ...process.env, GRAPH_PI_DATA_DIR: data },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 900_000,
    maxBuffer: 32 * 1024 * 1024,
  })
} catch (error) {
  runError = error
}
step('hub-run', runError === null, runError === null ? '모델 실행 완료' : String(runError.message).slice(0, 120))

const stateFile = join(data, 'groups', groupId, 'state.jsonl')
const records = existsSync(stateFile)
  ? readFileSync(stateFile, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .flatMap((line) => {
        try {
          return [JSON.parse(line)]
        } catch {
          return []
        }
      })
  : []
const kinds = [...new Set(records.map((record) => String(record.type)))].join(',')
step('hub-decided-structure', records.length > 0, `records=${records.length} types=${kinds || '없음'}`)

const failed = results.filter((ok) => !ok).length
process.stdout.write(`scenario-manual ${failed === 0 ? 'PASS' : 'FAIL'} (steps=${results.length}, failed=${failed}, tag=${tag})\n`)
process.exit(failed === 0 ? 0 : 1)
