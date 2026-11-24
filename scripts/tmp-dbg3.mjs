import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPiService } from '../src/main/pi/index.ts'

const base = mkdtempSync(join(tmpdir(), 'gp-dbg-'))
const sessions = join(base, 'sessions')
const cwd = join(base, 'repo')
mkdirSync(cwd, { recursive: true })
const slug = '-C-Projects-perf-fixture'
mkdirSync(join(sessions, slug), { recursive: true })
const stamp = new Date().toISOString()
const id = 'perf-00'
writeFileSync(
  join(sessions, slug, `${stamp.replace(/[:.]/g, '-')}_${id}.jsonl`),
  [
    JSON.stringify({ type: 'session', id, cwd, createdAt: stamp }),
    JSON.stringify({ type: 'message', message: { role: 'assistant', at: stamp, content: 'hi', model: 'deepseek-v4.1-flash', usage: { input: 5, output: 1 } } }),
  ].join('\n') + '\n',
)

const service = createPiService({ root: sessions })
service.start()
const files = await service.files()
console.log('files', files.length, JSON.stringify(files[0] ?? null))
const result = await service.sessions('g', [cwd])
console.log('sessions', result.sessions.length, JSON.stringify(result.sessions.map((s) => ({ id: s.id, wt: s.worktreeId, state: s.state, model: s.model }))))
service.stop()
