#!/usr/bin/env node
/**
 * Orca CLI 계약 스모크. 의존성 없이 `node scripts/smoke-orca.mjs` 로 실행한다.
 * 실제 `orca … --json` 을 호출해 봉투(ok/result)를 검증하고, 실패하면 exit 1 로 끝낸다.
 * 근거: docs/90-reference/orca-cli-and-pi-sessions.md §CLI 공통 계약·§이 프로젝트가 쓰는 명령.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const TIMEOUT_MS = 20_000
const STDERR_TAIL = 400
const DETAIL_LIMIT = 120
const ALLOWED_FLAGS = ['--group', '--orchestration', '--audit']

const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--')))
const unknownFlags = [...flags].filter((flag) => !ALLOWED_FLAGS.includes(flag))

function clip(text, limit) {
  const single = String(text).replace(/\s+/g, ' ').trim()
  return single.length <= limit ? single : `${single.slice(0, limit - 1)}…`
}

function tail(text, limit) {
  return text.length <= limit ? text : text.slice(text.length - limit)
}

// Orca 설치 경로는 문서에 없어 후보를 훑고, 없으면 PATH 해석에 맡긴다(cli.ts 와 같은 규칙).
function windowsCandidates() {
  if (process.platform !== 'win32') return []
  const roots = [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(
    (root) => typeof root === 'string' && root !== ''
  )
  const candidates = []
  for (const root of roots) {
    // GUI(Orca.exe)는 single-instance 로 끝나 stdout 이 비어 있다. CLI 는 resources/bin 에 있다.
    candidates.push(join(root, 'Programs', 'Orca', 'resources', 'bin', 'orca.exe'))
    candidates.push(join(root, 'Programs', 'orca', 'resources', 'bin', 'orca.exe'))
    candidates.push(join(root, 'Orca', 'resources', 'bin', 'orca.exe'))
  }
  return candidates
}

function orcaBin() {
  const fromEnv = process.env.GP_ORCA_BIN
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  for (const candidate of windowsCandidates()) {
    if (existsSync(candidate)) return candidate
  }
  return 'orca'
}

function errorText(raw) {
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim()
  if (raw !== null && typeof raw === 'object') {
    const code = typeof raw.code === 'string' ? raw.code : ''
    const message = typeof raw.message === 'string' ? raw.message : ''
    if (code !== '' && message !== '') return `${code}: ${message}`
    if (message !== '') return message
    if (code !== '') return code
  }
  return 'ok:false (사유 없음)'
}

/** 실패 시에도 종료 코드가 0 인 경우가 있어 봉투의 ok/result 만 신뢰한다. */
function parseEnvelope(stdout) {
  const text = stdout.trim()
  if (text === '') return { ok: false, error: 'stdout 비어 있음' }
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, error: `JSON 아님: ${tail(text, 80)}` }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: '최상위가 객체 아님' }
  }
  if (value.ok !== true) return { ok: false, error: errorText(value.error) }
  if (value.result === undefined) return { ok: false, error: 'result 없음' }
  return { ok: true, result: value.result }
}

function describeFailure(error, stderr) {
  const parts = []
  if (error !== null && error !== undefined && typeof error === 'object') {
    if (error.killed === true) parts.push(`${TIMEOUT_MS}ms 타임아웃`)
    if (error.code === 'ENOENT') parts.push('orca 실행 파일을 찾지 못했습니다')
    if (typeof error.message === 'string' && error.message.trim() !== '') parts.push(error.message.trim())
  } else if (typeof error === 'string' && error !== '') {
    parts.push(error)
  }
  const stderrTail = tail(String(stderr ?? '').trim(), STDERR_TAIL)
  if (stderrTail !== '') parts.push(`stderr: ${stderrTail}`)
  return parts.join(' | ')
}

function runOrca(args) {
  return new Promise((resolve) => {
    try {
      execFile(
        orcaBin(),
        [...args, '--json'],
        {
          timeout: TIMEOUT_MS,
          killSignal: 'SIGKILL',
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
          encoding: 'utf8'
        },
        (error, stdout, stderr) => {
          const parsed = parseEnvelope(String(stdout ?? ''))
          if (parsed.ok) {
            resolve(parsed)
            return
          }
          const parts = [parsed.error, describeFailure(error, String(stderr ?? ''))].filter((part) => part !== '')
          resolve({ ok: false, error: clip(parts.join(' | '), DETAIL_LIMIT) })
        }
      )
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      resolve({ ok: false, error: `orca 실행 실패: ${message}` })
    }
  })
}

function countOf(result, key) {
  if (Array.isArray(result)) return result.length
  if (result !== null && typeof result === 'object' && Array.isArray(result[key])) return result[key].length
  return -1
}

function pass(name, detail) {
  return { name, ok: true, detail }
}

function fail(name, detail) {
  return { name, ok: false, detail: clip(detail, DETAIL_LIMIT) }
}

function runIdOf(item) {
  if (item === null || typeof item !== 'object') return ''
  if (typeof item.id === 'string') return item.id
  if (typeof item.runId === 'string') return item.runId
  return ''
}

let runsPromise = null

async function loadRuns() {
  if (runsPromise === null) runsPromise = loadRunsOnce()
  return runsPromise
}

async function loadRunsOnce() {
  const res = await runOrca(['orchestration', 'run-list'])
  if (!res.ok) return { ok: false, error: res.error }
  let items = null
  if (Array.isArray(res.result)) items = res.result
  else if (res.result !== null && typeof res.result === 'object' && Array.isArray(res.result.runs)) items = res.result.runs
  if (items === null) return { ok: false, error: 'runs[] 없음' }
  const ids = []
  for (const item of items) {
    const id = runIdOf(item)
    if (id !== '') ids.push(id)
  }
  return { ok: true, ids }
}

async function checkProjectList() {
  const res = await runOrca(['project', 'list'])
  if (!res.ok) return fail('project list', res.error)
  const count = countOf(res.result, 'projects')
  if (count < 0) return fail('project list', 'projects[] 없음')
  return pass('project list', `${count}개`)
}

async function checkWorktreeList() {
  const res = await runOrca(['worktree', 'list'])
  if (!res.ok) return fail('worktree list', res.error)
  const count = countOf(res.result, 'worktrees')
  if (count < 0) return fail('worktree list', 'worktrees[] 없음')
  return pass('worktree list', `${count}개`)
}

async function checkRunList() {
  const runs = await loadRuns()
  if (!runs.ok) return fail('run-list', runs.error)
  return pass('run-list', `${runs.ids.length}개`)
}

async function checkTaskList() {
  const runs = await loadRuns()
  if (!runs.ok) return fail('task-list', `run-list 실패: ${runs.error}`)
  const first = runs.ids[0]
  if (first === undefined) return pass('task-list', 'SKIP run 없음')
  const name = `task-list(--run ${first})`
  const res = await runOrca(['orchestration', 'task-list', '--run', first, '--brief'])
  if (!res.ok) return fail(name, res.error)
  const count = countOf(res.result, 'tasks')
  if (count < 0) return fail(name, 'tasks[] 없음')
  return pass(name, `${count}개`)
}

async function checkGateList() {
  const runs = await loadRuns()
  if (!runs.ok) return fail('gate-list', `run-list 실패: ${runs.error}`)
  const first = runs.ids[0]
  if (first === undefined) return pass('gate-list', 'SKIP run 없음')
  const name = `gate-list(--run ${first})`
  const res = await runOrca(['orchestration', 'gate-list', '--run', first])
  if (!res.ok) return fail(name, res.error)
  const count = countOf(res.result, 'gates')
  if (count < 0) return fail(name, 'gates[] 없음')
  return pass(name, `${count}개`)
}

async function runGroups(groups) {
  let failedCount = 0
  for (const group of groups) {
    const results = await Promise.all(group.checks.map((check) => check()))
    for (const result of results) {
      if (!result.ok) failedCount += 1
    }
    const text = results.map((result) => `${result.name} ${result.ok ? 'PASS' : 'FAIL'} ${result.detail}`).join(' | ')
    console.log(`orca-smoke [${group.label}] ${text}`)
  }
  return failedCount
}

function planGroups() {
  const groupRequested = flags.has('--group')
  const orchestrationRequested = flags.has('--orchestration')
  const auditRequested = flags.has('--audit')
  const fullRun = !groupRequested && !orchestrationRequested && !auditRequested

  const groups = []
  if (fullRun) groups.push({ label: 'base', checks: [checkProjectList, checkWorktreeList, checkRunList] })
  if (groupRequested) groups.push({ label: 'group', checks: [checkProjectList, checkWorktreeList] })
  if (orchestrationRequested) groups.push({ label: 'orchestration', checks: [checkRunList, checkTaskList] })
  if (auditRequested) groups.push({ label: 'audit', checks: [checkRunList, checkGateList] })
  return groups
}

async function main() {
  let failedCount = 0
  try {
    failedCount = await runGroups(planGroups())
  } catch (thrown) {
    failedCount += 1
    const message = thrown instanceof Error ? thrown.message : String(thrown)
    console.log(`orca-smoke FAIL: 예상 못한 오류 ${message}`)
  }

  console.log(`orca-smoke ${failedCount === 0 ? 'PASS' : 'FAIL'} (bin=${orcaBin()}, 실패 ${failedCount}건)`)
  if (failedCount > 0) process.exitCode = 1
}

if (unknownFlags.length > 0) {
  console.log(`orca-smoke FAIL: 알 수 없는 플래그 ${unknownFlags.join(', ')}`)
  process.exitCode = 1
} else {
  await main()
}
