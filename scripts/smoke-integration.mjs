/**
 * 통합 스모크: 임시 레포 → Orca 워크트리 → Pi 세션 실행 → 앱 계약 계층(createPiService)이
 * 세션 노드(모델·시작 시각·마지막 활동·토큰)를 읽는지 확인 → 자원 정리(잔여 0).
 *
 * 근거: docs/30-specs/SPEC-mvp-acceptance.md (14·20행), docs/40-guides/build-and-verify.md
 * 실행: npm run smoke:integration
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import { orcaJson } from '../src/main/orca/cli.ts'
import { addProject, listWorktrees } from '../src/main/orca/projects.ts'
import { createWorktree, removeWorktree } from '../src/main/orca/worktrees.ts'
import { createPiService } from '../src/main/pi/index.ts'

const MODEL = process.env['SMOKE_MODEL'] ?? 'opencode-go/deepseek-v4.1-flash'
const NODE_WAIT_MS = Number(process.env['SMOKE_WAIT_MS'] ?? 240_000)
const stamp = Date.now().toString(36)
const name = `smoke-${stamp}`
const branch = `smoke/${stamp}`

const results = []
function step(label, ok, detail) {
  results.push({ label, ok, detail })
  process.stdout.write(`smoke-integration ${label} ${ok ? 'PASS' : 'FAIL'} ${detail}\n`)
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 워크트리 경로에 세션 노드가 나타날 때까지 돈다. 앱이 쓰는 서비스 그대로 쓴다. */
const norm = (value) => value.split(sep).join('/').toLowerCase()

async function waitForNode(pi, cwd) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < NODE_WAIT_MS) {
    const scanned = await pi.sessions('smoke', [cwd])
    last = scanned
    // Orca 는 경로를 `C:/…` 로, 세션 헤더는 `C:\…` 로 준다. 구분자를 맞춰 비교한다.
    const node = scanned.sessions.find(
      (session) => norm(session.worktreeId) === norm(cwd) || norm(session.filePath).includes(norm(cwd))
    )
    if (node !== undefined) return node
    await sleep(3000)
  }
  return { warnings: last?.warnings ?? [] }
}

const tmpRepo = mkdtempSync(join(tmpdir(), 'graph-pi-smoke-'))
let created = null
let closedOk = false

try {
  execFileSync('git', ['init', '-q', '-b', 'main', tmpRepo])
  // 빈 커밋만 있는 레포는 Orca 가 프로젝트로 등록하지 않는다(실측). 파일 하나를 커밋해야 목록에 나타난다.
  writeFileSync(join(tmpRepo, 'README.md'), 'smoke repo\n')
  execFileSync('git', ['-C', tmpRepo, 'add', '-A'])
  execFileSync('git', ['-C', tmpRepo, '-c', 'user.email=smoke@example.com', '-c', 'user.name=Smoke', 'commit', '-q', '-m', 'smoke: init'])
  step('temp-repo', true, tmpRepo)

  const project = await addProject(tmpRepo)
  const target = norm(tmpRepo)
  const matched = project.ok ? project.result.filter((p) => norm(p.path) === target) : []
  step('repo-add', project.ok && matched.length > 0, project.ok ? `projects=${project.result.length} matched=${matched.length}` : project.error)
  if (!project.ok || matched.length === 0) process.exitCode = 1

  const repoSelector = matched[0]?.id ?? tmpRepo
  const createdRes = await createWorktree({ repo: repoSelector, name, branch, base: 'main', parentWorktreeId: null })
  if (!createdRes.ok || createdRes.result === null) {
    step('worktree-create', false, createdRes.ok ? '응답에서 워크트리를 찾지 못함' : createdRes.error)
    process.exitCode = 1
  } else {
    created = createdRes.result
    step('worktree-create', created.path !== '', `${created.id} ${created.path}`)
    if (created.path === '') process.exitCode = 1
  }

  if (created !== null && created.path !== '') {
    // pi 세션을 그 워크트리에서 실제로 만든다(비대화형, 도구 비활성, 저비용 모델).
    try {
      // shell:true 로 띄우면 cwd 가 적용되지 않아 세션이 다른 폴더에 생긴다(실측). cmd.exe 로 감싸 cwd 를 보장한다.
      const args = ['-p', '--model', MODEL, '--no-tools', '--name', 'smoke', 'ok 이라고만 답해줘.']
      if (process.platform === 'win32') {
        execFileSync('cmd.exe', ['/c', 'pi', ...args], { cwd: created.path, encoding: 'utf8', timeout: 240_000 })
      } else {
        execFileSync('pi', args, { cwd: created.path, encoding: 'utf8', timeout: 240_000 })
      }
      step('agent-launch', true, `pi -p (${MODEL})`)
    } catch (error) {
      step('agent-launch', false, String(error.message).slice(0, 160))
      process.exitCode = 1
    }

    const pi = createPiService({})
    const node = await waitForNode(pi, created.path)
    const nodeOk = typeof node.id === 'string' && node.id !== ''
    if (!nodeOk) {
      step('session-node', false, `${NODE_WAIT_MS}ms 안에 세션 노드를 찾지 못함`)
      process.exitCode = 1
    } else {
      const hasModel = typeof node.model === 'string' && node.model !== ''
      const started = Date.parse(node.startedAt)
      const last = Date.parse(node.lastActivityAt)
      const hasTokens = typeof node.usage.input === 'number' && typeof node.usage.output === 'number'
      step('session-node', true, `id=${node.id.slice(0, 8)} state=${node.state} messages-file=${node.filePath !== ''}`)
      step('session-fields', hasModel && Number.isFinite(started) && Number.isFinite(last), `model=${node.model} started=${node.startedAt} last=${node.lastActivityAt}`)
      step('session-usage', hasTokens && node.usage.input >= 0 && node.usage.output >= 0, `input=${node.usage.input} output=${node.usage.output} cacheRead=${node.usage.cacheRead}`)
      const read = await pi.messages(node.id)
      step('session-messages', read.messages.length > 0, `messages=${read.messages.length} warnings=${read.warnings.length}`)
      if (!hasModel || !Number.isFinite(started) || !hasTokens || read.messages.length === 0) process.exitCode = 1
    }
  }
} finally {
  // 정리: 터미널 → 워크트리 → 임시 레포
  if (created !== null) {
    const closed = await orcaJson(['terminal', 'close', '--worktree', `path:${created.path}`, '--all'])
    closedOk = closed.ok
    step('terminal-close', true, closed.ok ? 'closed' : `nothing to close (${closed.error})`)
    // Windows 는 방금 끝난 프로세스의 핸들이 잠시 남는다. 잠금은 force + 재시도로 푼다.
    let removed = await removeWorktree(created.id, { force: true })
    for (let attempt = 0; attempt < 3 && !removed.ok; attempt += 1) {
      await sleep(2000)
      removed = await removeWorktree(created.id, { force: true })
    }
    step('worktree-remove', removed.ok, removed.ok ? created.id : removed.error)
    const after = await listWorktrees()
    const left = after.ok ? after.result.filter((w) => w.id === created.id || w.displayName === name) : []
    step('no-leftover', after.ok && left.length === 0, `remaining=${left.length}`)
    if (!removed.ok || left.length > 0) process.exitCode = 1
  }
  rmSync(tmpRepo, { recursive: true, force: true })
  const failed = results.filter((r) => !r.ok).length
  process.stdout.write(`smoke-integration ${failed === 0 ? 'PASS' : 'FAIL'} (steps=${results.length}, failed=${failed}, terminalClosed=${closedOk})\n`)
}
