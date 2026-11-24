/**
 * PTY 터미널 읽기·입력·대기. 채팅 전송이 PTY 로 들어가고 JSONL 에 반영되는 경로의 쓰기 지점이다(#20).
 * 근거: `docs/90-reference/orca-cli-and-pi-sessions.md` §이 프로젝트가 쓰는 명령(terminal read/send/wait).
 */
import type { OrcaTerminalOutput, OrcaTerminalState } from '../../shared/contract/orca.ts'
import { orcaJson, type OrcaRunResult } from './cli.ts'
import { isRecord, pickString, pickTerminalState } from './types.ts'

const WAIT_GRACE_MS = 5_000
const DEFAULT_WAIT_MS = 30_000

/** `terminal wait --for` 가 받는 값. 문서상 패턴 매칭은 없고 이 두 상태만 기다린다. */
export type TerminalWaitTarget = 'exit' | 'tui-idle'

export async function readTerminal(terminalId: string): Promise<OrcaRunResult<OrcaTerminalOutput>> {
  const res = await orcaJson<unknown>(['terminal', 'read', '--terminal', terminalId])
  if (!res.ok) return res
  return { ok: true, result: normalizeTerminalOutput(res.result, terminalId) }
}

/** read 원형이 실측되지 않아 문자열 응답과 객체 응답을 모두 받는다. */
function normalizeTerminalOutput(raw: unknown, fallbackId: string): OrcaTerminalOutput {
  if (typeof raw === 'string') return { terminalId: fallbackId, state: 'running', output: raw }
  const rec: Record<string, unknown> = isRecord(raw) ? raw : {}
  const nested: Record<string, unknown> = isRecord(rec['terminal']) ? rec['terminal'] : {}
  const terminalId =
    pickString(rec, ['terminalId', 'id']) ?? pickString(nested, ['terminalId', 'id']) ?? fallbackId
  const stateRaw = pickString(rec, ['state', 'terminalState', 'status']) ?? pickString(nested, ['state', 'terminalState', 'status'])
  const state: OrcaTerminalState = pickTerminalState(stateRaw)
  const output =
    pickString(rec, ['output', 'text', 'buffer', 'content', 'screen']) ??
    pickString(nested, ['output', 'text', 'buffer', 'content', 'screen']) ??
    ''
  return { terminalId, state, output }
}

export async function sendToTerminal(terminalId: string, text: string): Promise<OrcaRunResult<void>> {
  // 문서의 send 플래그 중 개행 제출은 `--enter` 다(텍스트 끝 `\r` 방식은 근거 없음).
  const res = await orcaJson<unknown>(['terminal', 'send', '--terminal', terminalId, '--text', text, '--enter'])
  if (!res.ok) return res
  return { ok: true, result: undefined }
}

/**
 * `orca terminal wait --for exit|tui-idle [--timeout-ms]`.
 * shortcut: wait 의 터미널 선택자 플래그가 문서에 없어 read/send 와 같은 `--terminal` 로 보낸다(미검증).
 */
export async function waitTerminal(
  terminalId: string,
  target: TerminalWaitTarget,
  timeoutMs?: number
): Promise<OrcaRunResult<void>> {
  const waitMs = timeoutMs ?? DEFAULT_WAIT_MS
  const args = ['terminal', 'wait', '--terminal', terminalId, '--for', target, '--timeout-ms', String(waitMs)]
  // orcaJson 기본 20초보다 오래 기다려야 하므로 이 호출만 대기 시간보다 넉넉히 준다.
  const res = await orcaJson<unknown>(args, { timeoutMs: waitMs + WAIT_GRACE_MS })
  if (!res.ok) return res
  return { ok: true, result: undefined }
}
