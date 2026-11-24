/**
 * Orca CLI(`orca … --json`) 실행기. IPC 경계를 지키기 위해 모든 실패를 결과 객체로 돌려주고 절대 throw 하지 않는다.
 * 근거: `docs/90-reference/orca-cli-and-pi-sessions.md` §CLI 공통 계약(실패 시에도 종료 코드가 0인 경우가 있어 `ok` 를 신뢰).
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord, pickString } from './types.ts'

export type OrcaRunResult<T> = { ok: true; result: T } | { ok: false; error: string }

const DEFAULT_TIMEOUT_MS = 20_000
const STDERR_TAIL_CHARS = 400
const MAX_STDOUT_BYTES = 10 * 1024 * 1024

/**
 * env `GP_ORCA_BIN` → Windows 설치 후보 → PATH 의 `orca`.
 * shortcut: Orca 설치 경로가 문서에 없어 후보를 훑고, 없으면 PATH 해석에 맡긴다.
 */
export function orcaBin(): string {
  const fromEnv = process.env['GP_ORCA_BIN']
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv.trim()
  for (const candidate of windowsCandidates()) {
    if (existsSync(candidate)) return candidate
  }
  return 'orca'
}

function windowsCandidates(): string[] {
  if (process.platform !== 'win32') return []
  const roots = [
    process.env['LOCALAPPDATA'],
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)']
  ].filter((root): root is string => typeof root === 'string' && root !== '')
  const candidates: string[] = []
  for (const root of roots) {
    // GUI 실행 파일(Orca.exe)은 single-instance 로 즉시 종료하고 stdout 이 비어 있다.
    // CLI 는 설치 폴더의 resources/bin 에 있다(실측: `Orca/resources/bin/orca.exe project list --json` 가 봉투를 돌려줌).
    candidates.push(join(root, 'Programs', 'Orca', 'resources', 'bin', 'orca.exe'))
    candidates.push(join(root, 'Programs', 'orca', 'resources', 'bin', 'orca.exe'))
    candidates.push(join(root, 'Orca', 'resources', 'bin', 'orca.exe'))
  }
  return candidates
}

export async function orcaJson<T>(args: string[], opts?: { timeoutMs?: number }): Promise<OrcaRunResult<T>> {
  const finalArgs = withJsonFlag(args)
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise<OrcaRunResult<T>>((resolve) => {
    let settled = false
    const finish = (value: OrcaRunResult<T>): void => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const onDone = (error: unknown, stdout: unknown, stderr: unknown): void => {
      const out = String(stdout ?? '')
      const errOut = String(stderr ?? '')
      const parsed = parseEnvelope(out)
      if (parsed.ok) {
        // 종료 코드가 0 이 아니어도 ok:true 봉투면 성공으로 본다(문서 주의점).
        finish({ ok: true, result: parsed.result as T })
        return
      }
      if (parsed.reason === 'envelope-false') {
        finish({ ok: false, error: parsed.error })
        return
      }
      const timeoutHint = wasKilled(error) ? `${timeoutMs}ms 타임아웃 | ` : ''
      finish({ ok: false, error: `orca: ${timeoutHint}${failureText(error, parsed.error, errOut)}` })
    }
    try {
      execFile(
        orcaBin(),
        finalArgs,
        {
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          windowsHide: true,
          maxBuffer: MAX_STDOUT_BYTES,
          encoding: 'utf8'
        },
        (error, stdout, stderr) => {
          onDone(error, stdout, stderr)
        }
      )
    } catch (thrown) {
      finish({ ok: false, error: `orca 실행 실패: ${errorMessage(thrown)}` })
    }
  })
}

/** `--json` 은 모든 명령의 공통 계약이므로 없으면 붙이고, 있으면 중복해서 붙이지 않는다. */
function withJsonFlag(args: string[]): string[] {
  return args.includes('--json') ? [...args] : [...args, '--json']
}

type ParsedEnvelope =
  | { ok: true; result: unknown }
  | { ok: false; reason: 'envelope-false'; error: string }
  | { ok: false; reason: 'unparsable'; error: string }

function parseEnvelope(stdout: string): ParsedEnvelope {
  const trimmed = stdout.trim()
  if (trimmed === '') return { ok: false, reason: 'unparsable', error: 'stdout 이 비어 있습니다' }
  const candidate = extractJson(trimmed)
  if (candidate === null) return { ok: false, reason: 'unparsable', error: `stdout 이 JSON 이 아닙니다: ${tailText(trimmed, 120)}` }
  let value: unknown
  try {
    value = JSON.parse(candidate)
  } catch {
    return { ok: false, reason: 'unparsable', error: `stdout JSON 파싱 실패: ${tailText(trimmed, 120)}` }
  }
  if (!isRecord(value)) return { ok: false, reason: 'unparsable', error: 'stdout JSON 최상위가 객체가 아닙니다' }
  if (value['ok'] !== true) return { ok: false, reason: 'envelope-false', error: errorText(value['error']) }
  if (value['result'] === undefined) return { ok: false, reason: 'unparsable', error: 'orca: 응답에 result 가 없습니다' }
  return { ok: true, result: value['result'] }
}

function extractJson(text: string): string | null {
  if (text.startsWith('{') || text.startsWith('[')) return text
  // CLI 가 앞에 로그를 섞어도 봉투를 찾도록 첫 '{' 부터 마지막 '}' 까지 잘라 본다.
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return null
}

/** CLI 의 error 는 `{code, message, data}` 객체이거나 문자열이다. 사람이 읽을 한 줄로 접는다. */
function errorText(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim()
  if (isRecord(raw)) {
    const code = pickString(raw, ['code'])
    const message = pickString(raw, ['message', 'reason', 'detail'])
    if (code !== null && message !== null) return `${code}: ${message}`
    if (message !== null) return message
    if (code !== null) return code
  }
  const text = safeJson(raw)
  return text === '' ? 'orca: 알 수 없는 오류' : `orca: ${text}`
}

function failureText(error: unknown, envelopeError: string, stderr: string): string {
  const parts: string[] = []
  const message = errorMessage(error)
  if (message !== '') parts.push(message)
  if (envelopeError !== '') parts.push(envelopeError)
  const stderrTail = tailText(stderr.trim(), STDERR_TAIL_CHARS)
  if (stderrTail !== '') parts.push(`stderr: ${stderrTail}`)
  return parts.length > 0 ? parts.join(' | ') : '알 수 없는 오류'
}

function errorMessage(error: unknown): string {
  if (error === null || error === undefined) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) {
    const code = 'code' in error ? error.code : undefined
    const codeText = typeof code === 'string' ? ` (${code})` : ''
    return `${error.message}${codeText}`
  }
  return safeJson(error)
}

function wasKilled(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'killed' in error && error.killed === true
}

function tailText(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(text.length - limit)
}

function safeJson(value: unknown): string {
  if (value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}
