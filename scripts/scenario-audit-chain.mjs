/**
 * 감사 체인 검증(SPEC-hub-orchestration 617, 수용기준 46-53·57): 허브가 쓰는 CLI 만으로
 * Goal → Audit → 승인/거부 → 다음 항목 배정 순서를 관찰한다. 모델 창의성에 의존하지 않는다.
 * 실행: node scripts/scenario-audit-chain.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(process.cwd(), 'packages', 'harness', 'src', 'cli.ts')
const data = mkdtempSync(join(tmpdir(), 'graph-pi-audit-chain-'))
const GROUP = 'audit-chain'

function cli(args) {
  return execFileSync(process.execPath, [CLI, ...args, '--group', GROUP, '--writer', 'hub'], {
    env: { ...process.env, GRAPH_PI_DATA_DIR: data },
    encoding: 'utf8',
  }).trim()
}
function expectOk(label, args) {
  try {
    const out = cli(args)
    process.stdout.write(`${label}: ${out.split('\n')[0]}\n`)
    return out
  } catch (error) {
    process.stdout.write(`${label}: FAIL ${String(error.stdout ?? error.message).trim()}\n`)
    process.exitCode = 1
    return ''
  }
}
function expectFail(label, args, pattern) {
  try {
    cli(args)
    process.stdout.write(`${label}: FAIL (명령이 성공했다)\n`)
    process.exitCode = 1
  } catch (error) {
    const text = `${String(error.stdout ?? '')}
${String(error.stderr ?? '')}`.trim() || error.message
    const matched = pattern === undefined || pattern.test(text)
    process.stdout.write(`${label}: ${matched ? 'PASS' : 'FAIL'} ${text.split('\n')[0]}\n`)
    if (!matched) process.exitCode = 1
  }
}
function state() {
  return readFileSync(join(data, 'groups', GROUP, 'state.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
}

// 1) 조건 없는 Goal 은 생성되지 않는다.
expectFail('goal-requires-criterion', ['goal', '--id', 'g-bad', '--objective', '조건 없음'], /완료 조건/)

// 2) 자식 없는 세션 Goal 은 감사 없이 완료를 주장할 수 없다.
expectOk('list-item', ['list', '--id', 'item-1', '--title', '항목 1', '--state', 'active', '--order', '1', '--child-goal', 'g-1'])
expectOk('goal', ['goal', '--id', 'g-1', '--objective', '항목 1 목표', '--check', '명령 exit 0', '--parent-list-item', 'item-1', '--session', 'hub'])
expectFail('complete-without-audit', ['goal', 'complete', '--id', 'g-1'], /승인|감사/)

// 3) 승인된 Audit 이 있으면 완료되고 다음 List 항목이 배정된다.
expectOk('list-item-2', ['list', '--id', 'item-2', '--title', '항목 2', '--order', '2', '--child-goal', 'g-2'])
expectOk('audit-approve', ['audit', '--goal', 'g-1', '--verdict', 'approved', '--summary', '조건 충족', '--scope', 'session'])
expectOk('complete', ['goal', 'complete', '--id', 'g-1'])

// 4) 거부된 Audit 은 Goal 을 active 로 되돌리고, 재주장은 새 증거 없이는 막힌다.
expectOk('goal-2', ['goal', '--id', 'g-2', '--objective', '항목 2 목표', '--check', '명령 exit 0', '--parent-list-item', 'item-2', '--session', 'hub'])
expectOk('audit-reject', ['audit', '--goal', 'g-2', '--verdict', 'rejected', '--summary', '증거 부족', '--scope', 'session'])
expectFail('complete-frozen', ['goal', 'complete', '--id', 'g-2'], /승인|감사|증거/)

// 5) 불가능 판정은 aborted 로 남는다.
expectOk('goal-3', ['goal', '--id', 'g-3', '--objective', '항목 3 목표', '--check', '측정 가능', '--session', 'hub'])
expectOk('audit-impossible', ['audit', '--goal', 'g-3', '--verdict', 'impossible', '--summary', '측정 불가', '--scope', 'session'])

const rows = state()
const last = (id) => rows.filter((row) => row.id === id).at(-1)
const item1 = last('item-1')
const item2 = last('item-2')
const g1 = last('g-1')
const g3 = last('g-3')
const checks = [
  ['g-1 complete', g1?.status === 'complete'],
  ['g-3 aborted', g3?.status === 'aborted'],
  ['item-1 closed', item1?.completedAt !== null && item1?.completedAt !== undefined],
  ['item-2 activated', item2?.state === 'active' && item2?.activatedAt !== null && item2?.activatedAt !== undefined],
  ['audit records', rows.filter((row) => row.type === 'audit').length >= 3],
]
for (const [label, ok] of checks) {
  process.stdout.write(`check ${label}: ${ok ? 'PASS' : 'FAIL'}\n`)
  if (!ok) process.exitCode = 1
}
process.stdout.write(`scenario-audit-chain ${(process.exitCode ?? 0) === 0 ? 'PASS' : 'FAIL'} (data=${data})\n`)
