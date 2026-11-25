/**
 * 질문 답변 후 재개 실측(수용기준 26): 임시 레포 → Orca 워크트리 → PTY 세션 실행 →
 * 앱이 쓰는 `resumeSession` 으로 재개 프롬프트를 보내고, 그 문장이 세션 파일에 사용자 메시지로 남는지 본다.
 * 실행: node scripts/smoke-resume.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import { orcaJson } from '../src/main/orca/cli.ts'
import { addProject } from '../src/main/orca/projects.ts'
import { createWorktree, removeWorktree } from '../src/main/orca/worktrees.ts'
import { startPiAgent } from '../src/main/orca/agents.ts'
import { createPiService } from '../src/main/pi/index.ts'
import { sendToTerminal } from '../src/main/orca/terminals.ts'
import { RESUME_PROMPT, resumeSession } from '../src/main/harness/resume.ts'

const MODEL = process.env['SMOKE_MODEL'] ?? 'opencode-go/deepseek-v4.1-flash'
const WAIT_MS = Number(process.env['SMOKE_WAIT_MS'] ?? 180_000)
const stamp = Date.now().toString(36)
const name = `resume-${stamp}`
const branch = `resume/${stamp}`

const results = []
const step = (label, ok, detail) => {
  results.push(ok)
  process.stdout.write(`smoke-resume ${label} ${ok ? 'PASS' : 'FAIL'} ${detail}\n`)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const norm = (value) => value.split(sep).join('/').toLowerCase()

/** 세션 파일에서 사용자 메시지 본문만 꺼낸다. */
function userTexts(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .flatMap((line) => {
        try {
          const record = JSON.parse(line)
          const message = record?.message
          if (message?.role !== 'user') return []
          if (typeof message.content === 'string') return [message.content]
          if (Array.isArray(message.content)) {
            return message.content
              .filter((part) => part?.type === 'text' && typeof part.text === 'string')
              .map((part) => part.text)
          }
          return []
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}

const tmpRepo = mkdtempSync(join(tmpdir(), 'graph-pi-resume-'))
let created = null

try {
  execFileSync('git', ['init', '-q', '-b', 'main', tmpRepo])
  execFileSync('git', ['-C', tmpRepo, 'commit', '-q', '--allow-empty', '-m', 'resume: init'])
  const project = await addProject(tmpRepo)
  const matched = project.ok ? project.result.find((p) => norm(p.path) === norm(tmpRepo)) : null
  step('repo-add', matched !== undefined && matched !== null, project.ok ? `projects=${project.result.length}` : project.error)

  const made = await createWorktree({
    repo: matched?.id ?? tmpRepo,
    name,
    branch,
    base: 'main',
    parentWorktreeId: null,
  })
  if (!made.ok || made.result === null || made.result.path === '') {
    step('worktree-create', false, made.ok ? '경로 없음' : made.error)
    throw new Error('worktree-create')
  }
  created = made.result
  step('worktree-create', true, `${created.id} ${created.path}`)

  const launched = await startPiAgent(created.path, '재개 스모크 시작합니다. 준비되면 짧게 답하세요.', MODEL)
  if (!launched.ok) {
    step('agent-launch', false, launched.error)
    throw new Error('agent-launch')
  }
  const terminalId = launched.result.terminalId ?? ''
  step('agent-launch', terminalId !== '', terminalId === '' ? 'terminalId 없음' : terminalId)

  const pi = createPiService({})
  let node = null
  const started = Date.now()
  while (Date.now() - started < WAIT_MS) {
    const scanned = await pi.sessions('smoke', [created.path])
    // 세션 파일 경로는 슬러그로 인코딩되므로 worktreeId(cwd) 비교를 먼저 본다.
    node =
      scanned.sessions.find((s) => norm(s.worktreeId) === norm(created.path)) ??
      scanned.sessions.find((s) => norm(s.filePath).includes(norm(created.path))) ??
      null
    if (node !== null) break
    await sleep(3000)
  }
  step('session-node', node !== null, node === null ? '세션 노드 없음' : `id=${node.id.slice(0, 8)}`)

  if (node !== null && terminalId !== '') {
    // 앱이 답변 후 쓰는 것과 같은 함수·같은 문구를 쓴다.
    // 앱의 sendPrompt 와 같은 경로(터미널 입력 + Enter)를 쓴다. raw terminal send 는 줄바꿈이 없다.
    const orca = {
      sendPrompt: async (id, text) => {
        const sent = await sendToTerminal(id, text)
        return sent.ok ? { ok: true } : { ok: false, error: sent.error }
      },
    }
    const resumed = await resumeSession(orca, { session: node, terminalId })
    step('resume-send', resumed.ok, resumed.ok ? RESUME_PROMPT : String(resumed.error))

    let landed = false
    const sendStart = Date.now()
    while (Date.now() - sendStart < WAIT_MS) {
      landed = userTexts(node.filePath ?? '').some((text) => text.includes(RESUME_PROMPT))
      if (landed) break
      await sleep(3000)
    }
    step('resume-in-session-file', landed, landed ? 'user 메시지 확인' : '세션 파일에서 찾지 못함')
  }
} finally {
  if (created !== null) {
    await orcaJson(['terminal', 'close', '--worktree', `path:${created.path}`, '--all'])
    let removed = await removeWorktree(created.id, { force: true })
    for (let attempt = 0; attempt < 3 && !removed.ok; attempt += 1) {
      await sleep(2000)
      removed = await removeWorktree(created.id, { force: true })
    }
    step('worktree-remove', removed.ok, removed.ok ? created.id : removed.error)
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      rmSync(tmpRepo, { recursive: true, force: true })
      break
    } catch {
      await sleep(2000)
    }
  }
  const failed = results.filter((ok) => !ok).length
  process.stdout.write(
    `smoke-resume ${failed === 0 ? 'PASS' : 'FAIL'} (steps=${results.length}, failed=${failed}, tag=${stamp})\n`,
  )
  process.exit(failed === 0 ? 0 : 1)
}
