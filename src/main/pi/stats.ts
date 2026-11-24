/**
 * 세션 파일에서 보드가 필요로 하는 값(모델·토큰 합계·마지막 응답 시각)만 뽑는다.
 * `readSessionFile` 은 메시지 본문 중심이라 `message.model` 을 보존하지 않으므로 원문을 한 번 더 훑는다.
 * 근거: SPEC-mvp-acceptance 6행(노드 선택 시 모델·시작·마지막 활동·토큰).
 */
import { readFile } from 'node:fs/promises'
import type { TokenUsage } from '../../shared/contract/pi.ts'
import { EMPTY_USAGE } from '../../shared/contract/pi.ts'

export type SessionStats = {
  model: string | null
  usage: TokenUsage
  lastAssistantAt: string | null
}

type RawRecord = Record<string, unknown>

function asRecord(value: unknown): RawRecord | null {
  return typeof value === 'object' && value !== null ? (value as RawRecord) : null
}

function usageOf(raw: unknown): TokenUsage | null {
  const record = asRecord(raw)
  if (record === null) return null
  const num = (key: string): number => {
    const value = record[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  return { input: num('input'), output: num('output'), cacheRead: num('cacheRead'), cacheWrite: num('cacheWrite') }
}

/** 라인 단위로 훑어 모델·토큰·마지막 응답 시각을 누적한다. 깨진 줄은 건너뛴다. */
export async function readSessionStats(filePath: string): Promise<SessionStats> {
  let text = ''
  try {
    text = await readFile(filePath, 'utf8')
  } catch {
    return { model: null, usage: EMPTY_USAGE, lastAssistantAt: null }
  }
  let model: string | null = null
  const usage: TokenUsage = { ...EMPTY_USAGE }
  let lastAssistantAt: string | null = null

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    const record = asRecord(parsed)
    if (record === null || record['type'] !== 'message') continue
    const message = asRecord(record['message'])
    if (message === null) continue
    if (typeof message['model'] === 'string' && message['model'] !== '') model = message['model']
    const messageUsage = usageOf(message['usage'])
    if (messageUsage !== null) {
      usage.input += messageUsage.input
      usage.output += messageUsage.output
      usage.cacheRead += messageUsage.cacheRead
      usage.cacheWrite += messageUsage.cacheWrite
    }
    if (message['role'] === 'assistant') {
      const at = typeof message['at'] === 'string' ? message['at'] : null
      if (at !== null && (lastAssistantAt === null || Date.parse(at) > Date.parse(lastAssistantAt))) lastAssistantAt = at
    }
  }

  return { model, usage, lastAssistantAt }
}
