/**
 * 감사 순서 시나리오(수용기준 63): 자식 Goal 감사 → 자식 완료 → 상위 Goal 감사 순서가
 * 하네스 런타임에서 실제로 지켜지는지 CLI 로 관찰한다.
 *
 * 순서가 지켜지지 않는 시도(자식 감사 전 상위 감사)는 거부되어야 한다 — 정책 테스트가 아니라 실행 기록으로 본다.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(process.cwd(), 'packages/harness/src/cli.ts')
const data = mkdtempSync(join(tmpdir(), 'gp-audit-order-'))
const results = []
const step = (label, ok, detail) => {
  results.push(ok)
  process.stdout.write(`scenario-audit-order ${label} ${ok ? 'PASS' : 'FAIL'} ${detail}\n`)
}

const cli = (argv) =>
  execFileSync(process.execPath, [CLI, ...argv], {
    encoding: 'utf8',
    env: { ...process.env, GRAPH_PI_DATA_DIR: data },
  })

/** `ok <kind> <id> …` 에서 id 만 꺼낸다. */
const idOf = (out, kind) => {
  const match = new RegExp(`^ok ${kind} ([^ ]+)`, 'm').exec(out)
  if (match === null) throw new Error(`id 없음: ${out}`)
  return match[1]
}

/** 실패 명령의 메시지(마지막 줄)를 문자열로 돌려준다 — 거부 사유를 관찰하기 위한 것. */
const lastLine = (out) => out.trim().split('\n').slice(-1)[0] ?? ''

const groupGoal = idOf(
  cli(['goal', '--group', 'g1', '--writer', 'hub', '--objective', '그룹 목표', '--check', '전체']),
  'goal',
)
// 자식 Goal 은 그룹 Goal 을 부모로 가리킨다 — 그래야 감사 게이트가 "직계 자식"을 센다.
const childA = idOf(
  cli(['goal', '--group', 'g1', '--writer', 's1', '--session', 's1', '--objective', '자식 A', '--check', 'A', '--parent-goal', groupGoal]),
  'goal',
)
const childB = idOf(
  cli(['goal', '--group', 'g1', '--writer', 's2', '--session', 's2', '--objective', '자식 B', '--check', 'B', '--parent-goal', groupGoal]),
  'goal',
)

// 1) 자식 감사 전 상위 감사는 거부된다.
let refused = ''
try {
  cli(['audit', 'start', '--group', 'g1', '--writer', 'audit', '--goal', groupGoal, '--scope', 'parent'])
} catch (error) {
  refused = `${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message ?? ''}`
}
step(
  'parent-audit-refused-before-children',
  /자식|승인|정산/.test(refused),
  lastLine(refused) || '거부 메시지 없음',
)

// 2) 자식 A: 감사 승인 → 완료.
const approvedA = cli(['audit', 'start', '--group', 'g1', '--writer', 'audit', '--goal', childA])
void approvedA
const finishedA = cli(['audit', 'finish', '--group', 'g1', '--writer', 'audit', '--goal', childA, '--verdict', 'approved', '--summary', 'A 통과'])
step('child-a-approved', /verdict=approved/.test(finishedA), lastLine(finishedA))
const completedA = cli(['goal', 'complete', '--group', 'g1', '--writer', 's1', '--id', childA, '--summary', 'A 완료'])
step('child-a-completed', /status=complete/.test(completedA), lastLine(completedA))

// 3) 자식 B: 거부 → 재작업 → 승인 → 완료.
cli(['audit', 'start', '--group', 'g1', '--writer', 'audit', '--goal', childB])
const rejectedB = cli(['audit', 'finish', '--group', 'g1', '--writer', 'audit', '--goal', childB, '--verdict', 'rejected', '--summary', 'B 누락'])
step('child-b-rejected', /status=active/.test(rejectedB), lastLine(rejectedB))
cli(['audit', 'start', '--group', 'g1', '--writer', 'audit', '--goal', childB])
const approvedB = cli(['audit', 'finish', '--group', 'g1', '--writer', 'audit', '--goal', childB, '--verdict', 'approved', '--summary', 'B 보완 완료'])
step('child-b-approved-after-rework', /verdict=approved/.test(approvedB), lastLine(approvedB))
const completedB = cli(['goal', 'complete', '--group', 'g1', '--writer', 's2', '--id', childB, '--summary', 'B 완료'])
step('child-b-completed', /status=complete/.test(completedB), lastLine(completedB))

// 4) 자식이 모두 정산된 뒤에야 상위 감사가 진행된다.
cli(['audit', 'start', '--group', 'g1', '--writer', 'audit', '--goal', groupGoal, '--scope', 'parent'])
const parentAudit = cli([
  'audit', 'finish', '--group', 'g1', '--writer', 'audit', '--goal', groupGoal,
  '--verdict', 'approved', '--summary', '자식 감사 정산 완료',
])
step('parent-audit-after-children', /verdict=approved/.test(parentAudit), lastLine(parentAudit))

const failed = results.filter((ok) => !ok).length
process.stdout.write(`scenario-audit-order ${failed === 0 ? 'PASS' : 'FAIL'} (steps=${results.length}, failed=${failed})\n`)
process.exit(failed === 0 ? 0 : 1)
