/**
 * 채팅 전송 실측(SPEC-graph-pi-ade 194·195): 임시 레포 → Orca 워크트리 → PTY 세션 실행 →
 * 앱 계약 계층이 세션을 읽고(194), `sendPrompt` 로 보낸 문장이 세션 파일에 사용자 메시지로 남는지(195) 본다.
 * 실행: node scripts/smoke-chat.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import { orcaJson } from '../src/main/orca/cli.ts'
import { addProject } from '../src/main/orca/projects.ts'
import { createWorktree, removeWorktree } from '../src/main/orca/worktrees.ts'
import { startPiAgent } from '../src/main/orca/agents.ts'
import { sendToTerminal } from '../src/main/orca/terminals.ts'
import { createPiService } from '../src/main/pi/index.ts'

const MODEL = process.env['SMOKE_MODEL'] ?? 'opencode-go/deepseek-v4.1-flash'
const WAIT_MS = Number(process.env['SMOKE_WAIT_MS'] ?? 180_000)
const stamp = Date.now().toString(36)
const name = `chat-${stamp}`
const branch = `chat/${stamp}`
const SENT = `보드 확인 ${stamp}`

const results = []
const step = (label, ok, detail) => {
  results.push(ok)
  process.stdout.write(`smoke-chat ${label} ${ok ? 'PASS' : 'FAIL'} ${detail}\n`)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const norm = (value) => value.split(sep).join('/').toLowerCase()

function textsOf(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        try {
          const record = JSON.parse(line)
          const content = record?.message?.content
          if (typeof content === 'string') return { role: record.message.role, text: content }
          if (Array.isArray(content)) {
            const text = content
              .filter((part) => part?.type === 'text' && typeof part.text === 'string')
              .map((part) => part.text)
              .join('')
            return { role: record.message.role, text }
          }
          return { role: null, text: '' }
        } catch {
          return { role: null, text: '' }
        }
      })
  } catch {
    return []
  }
}

const tmpRepo = mkdtempSync(join(tmpdir(), 'graph-pi-chat-'))
let created = null

try {
  execFileSync('git', ['init', '-q', '-b', 'main', tmpRepo])
  execFileSync('git', ['-C', tmpRepo, 'commit', '-q', '--allow-empty', '-m', 'chat: init'])
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

  // 앱과 같은 경로로 띄운다: Orca 터미널 + pi 에이전트. 그래야 PTY 로 프롬프트를 더 보낼 수 있다.
  const launched = await startPiAgent(created.path, '보드 스모크 시작합니다. 준비되면 짧게 답하세요.', MODEL)
  if (!launched.ok) {
    step('agent-launch', false, launched.error)
    throw new Error('agent-launch')
  }
  step('agent-launch', true, `terminal=${launched.result.terminalId ?? 'null'} worktree=${launched.result.worktreeId ?? 'null'}`)

  const pi = createPiService({})
  let node = null
  const started = Date.now()
  while (Date.now() - started < WAIT_MS) {
    const scanned = await pi.sessions('smoke', [created.path])
    node = scanned.sessions.find((s) => norm(s.worktreeId) === norm(created.path) || norm(s.filePath).includes(norm(created.path))) ?? null
    if (node !== null) break
    await sleep(3000)
  }
  step('session-node', node !== null, node === null ? '세션 노드 없음' : `id=${node.id.slice(0, 8)} file=${node.filePath !== ''}`)

  const terminalId = launched.result.terminalId ?? ''
  step('terminal-found', terminalId !== '', terminalId === '' ? '영수증에 terminalId 없음' : terminalId)

  if (terminalId !== '') {
    const sent = await sendToTerminal(terminalId, SENT)
    step('send-prompt', sent.ok, sent.ok ? SENT : sent.error)
    let landed = false
    const sendStart = Date.now()
    while (Date.now() - sendStart < WAIT_MS && node !== null) {
      const read = await pi.messages(node.id)
      landed = read.messages.some((message) => message.role === 'user' && message.text.includes(stamp)) || textsOf(node.filePath).some((m) => m.role === 'user' && m.text.includes(stamp))
      if (landed) break
      await sleep(3000)
    }
    step('prompt-in-session-file', landed, landed ? 'user 메시지 확인' : '세션 파일에서 찾지 못함')
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
  // Windows 는 방금 지운 워크트리의 git 핸들이 잠시 남는다. 정리 실패가 결과를 뒤집지 않게 한다.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      rmSync(tmpRepo, { recursive: true, force: true })
      break
    } catch {
      await sleep(2000)
    }
  }
  const failed = results.filter((ok) => !ok).length
  process.stdout.write(`smoke-chat ${failed === 0 ? 'PASS' : 'FAIL'} (steps=${results.length}, failed=${failed}, tag=${stamp})\n`)
  process.exit(failed === 0 ? 0 : 1)
}
