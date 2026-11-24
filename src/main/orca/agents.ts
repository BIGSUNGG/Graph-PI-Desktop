/**
 * 에이전트 실행(새 세션 시작). `pi` 는 유효한 agent id 이고 기본 설정에서 터미널 표면으로 뜬다(2026-11-22 실검증).
 * 근거: `docs/90-reference/orca-cli-and-pi-sessions.md` §이 프로젝트가 쓰는 명령·§주의점.
 */
import type { OrcaLaunchReceipt } from '../../shared/contract/orca.ts'
import { orcaJson, type OrcaRunResult } from './cli.ts'
import { isRecord, pickString } from './types.ts'

export type LaunchAgentRequest = {
  cwd: string
  prompt: string
  /** 생략하면 이 앱의 기본 에이전트(pi)를 쓴다. */
  agent?: string
  model?: string | null
}

const DEFAULT_AGENT = 'pi'
// 에이전트 기동은 터미널 생성까지 기다려 20초 기본값을 넘길 수 있다.
const LAUNCH_TIMEOUT_MS = 60_000

export async function launchAgent(req: LaunchAgentRequest): Promise<OrcaRunResult<OrcaLaunchReceipt>> {
  const agent = req.agent ?? DEFAULT_AGENT
  // 실검증된 호출 형태: `agent launch --agent pi --worktree path:<abs>`.
  const args = ['agent', 'launch', '--agent', agent, '--worktree', `path:${req.cwd}`, '--prompt', req.prompt]
  // 실측: `agent launch --agent pi --model …` 는 invalid_argument 로 거부된다
  // ("Agent pi does not support launch-time model selection"). pi 는 자기 설정의 모델을 쓴다.
  if (agent !== 'pi' && req.model !== undefined && req.model !== null && req.model !== '') {
    args.push('--model', req.model)
  }
  const res = await orcaJson<unknown>(args, { timeoutMs: LAUNCH_TIMEOUT_MS })
  if (!res.ok) return res
  return { ok: true, result: normalizeReceipt(res.result, agent, req) }
}

export function startPiAgent(
  cwd: string,
  prompt: string,
  model: string | null
): Promise<OrcaRunResult<OrcaLaunchReceipt>> {
  return launchAgent({ cwd, prompt, model, agent: DEFAULT_AGENT })
}

/**
 * 영수증 정규화. 문서상 확인된 것은 `outcome.kind` 와 `receipt.reason` 뿐이라
 * terminalId·worktreeId 는 후보 키를 훑고, 없으면 null 로 두고 원형(raw)을 보존한다.
 */
function normalizeReceipt(rawResult: unknown, agent: string, req: LaunchAgentRequest): OrcaLaunchReceipt {
  const raw: Record<string, unknown> = isRecord(rawResult) ? rawResult : {}
  const outcome: Record<string, unknown> = isRecord(raw['outcome']) ? raw['outcome'] : {}
  const receipt: Record<string, unknown> = isRecord(raw['receipt']) ? raw['receipt'] : {}

  const terminalKeys = ['terminalId', 'terminalHandle', 'handle', 'terminal']
  const terminalId =
    pickString(receipt, terminalKeys) ?? pickString(outcome, terminalKeys) ?? pickString(raw, terminalKeys)

  const worktreeKeys = ['worktreeId', 'worktree']
  const worktreeId = pickString(receipt, worktreeKeys) ?? pickString(outcome, worktreeKeys) ?? pickString(raw, worktreeKeys)

  const launchedAt =
    pickString(receipt, ['launchedAt', 'startedAt', 'at']) ??
    pickString(raw, ['launchedAt', 'startedAt', 'at']) ??
    // CLI 가 시각을 주지 않으면 앱이 관측한 호출 시각을 쓴다.
    new Date().toISOString()

  return {
    terminalId,
    worktreeId,
    agent,
    prompt: req.prompt,
    launchedAt,
    raw
  }
}
