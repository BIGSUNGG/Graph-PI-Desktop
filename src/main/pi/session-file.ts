/**
 * Pi 세션 JSONL(포맷 v3) 파서.
 *
 * 형식 근거: `docs/90-reference/orca-cli-and-pi-sessions.md` §Pi 세션 파일
 * - 경로: `<sessionsRoot>/<project-slug>/<ISO시각>_<sessionId>.jsonl`
 * - 첫 줄은 세션 헤더이며 이후 레코드가 이어진다.
 *   `{"type":"session","version":3,"id":"…","timestamp":"…","cwd":"C:\\Projects\\…"}`,
 *   포크 세션은 `parentSession`(부모 세션 파일 경로)이 붙는다.
 * - 레코드 type: `model_change` · `thinking_level_change` · `message` · `custom_message` · `custom` · `compaction`.
 * - `message.role` 은 `system` · `user` · `assistant` · `toolResult` 이고 `toolResult` 가 남으므로
 *   도구 호출/결과를 파싱만으로 복원할 수 있다.
 * - 공개 계약 문서가 없고 새 type 이 늘 수 있으므로 모르는 type 은 경고 1건으로 모으고 파싱은 계속한다.
 *
 * 예외는 경계에서 잡아 경고/오류 객체로 바꾼다(프로세스 크래시 금지).
 */
import { open, readFile, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  PiMessage,
  PiMessageRole,
  PiWarning,
  PiWarningKind,
  SessionFileInfo,
  TokenUsage,
} from '../../shared/contract/pi.ts';
import { EMPTY_USAGE } from '../../shared/contract/pi.ts';
import type { SessionState } from '../../shared/contract/app.ts';

/** 헤더 `version` 필드의 기대값. */
export const SUPPORTED_FORMAT_VERSION = 3;

/** `stateOf` 가 running 으로 보는 마지막 활동 창(120초). */
export const RUNNING_WINDOW_MS = 120_000;

const FIRST_LINE_LIMIT = 16 * 1024;

/* ── 경로·파일명 ────────────────────────────────────────────────── */

/**
 * 세션 디렉터리 루트. `PI_SESSIONS_DIR` 가 있으면 그 값이 우선한다.
 * 기본값은 `%USERPROFILE%\.pi\agent\sessions` (= `homedir()/.pi/agent/sessions`).
 */
export function sessionsRoot(): string {
  const override = process.env['PI_SESSIONS_DIR'];
  if (override !== undefined && override.trim().length > 0) return override;
  return join(homedir(), '.pi', 'agent', 'sessions');
}

/** POSIX·Windows 구분자 모두에서 마지막 경로 조각을 돌려준다. */
export function lastPathSegment(path: string): string {
  const parts = path.split(/[\\/]/);
  const last = parts[parts.length - 1];
  return last === undefined ? path : last;
}

/** `<ISO시각>_<sessionId>.jsonl` 에서 ISO 접두부를 떼고 남은 본문. */
function stemPartsOf(fileName: string): { iso: string | null; rest: string } {
  const base = lastPathSegment(fileName).replace(/\.jsonl$/i, '');
  const match = /^\d{4}-\d{2}-\d{2}[T_ ]\d{2}[-:.]?\d{2}[-:.]?\d{2}(?:[.-]\d{1,6})?(?:Z)?/.exec(base);
  if (match === null) return { iso: null, rest: base };
  return { iso: match[0], rest: base.slice(match[0].length).replace(/^[_-]+/, '') };
}

/**
 * 파일명 앞 19자 ISO 시각 → createdAt.
 * 표기가 없어 UTC 로 해석한다(헤더 `timestamp` 가 있으면 그 값을 먼저 쓴다).
 */
export function createdAtFromFileName(fileName: string): string | null {
  const { iso } = stemPartsOf(fileName);
  if (iso === null) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})[T_ ](\d{2})[-:.]?(\d{2})[-:.]?(\d{2})(?:[.-](\d{1,3}))?/.exec(iso);
  if (parts === null) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const millis = parts[7] === undefined ? 0 : Number(parts[7].padEnd(3, '0'));
  const time = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

/** 파일명에서 세션 ID 를 뽑는다. 헤더 `id` 가 없을 때의 대체 경로다. */
export function sessionIdFromFileName(fileName: string): string {
  const { iso, rest } = stemPartsOf(fileName);
  if (iso === null) return rest;
  const parts = rest.split('_').filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  return last !== undefined && last.length > 0 ? last : rest;
}

/**
 * 파일명에서 사람이 읽는 이름을 뽑는다. `<ISO>_<sessionId>.jsonl` 처럼 이름 조각이 없으면 null.
 * (Pi 는 세션 제목을 JSONL 에 남기지 않는다 — §레코드 타입 표에 제목 레코드가 없다.)
 */
export function sessionNameFromFileName(fileName: string): string | null {
  const { iso, rest } = stemPartsOf(fileName);
  if (iso === null) return null;
  const parts = rest.split('_').filter((part) => part.length > 0);
  if (parts.length < 2) return null;
  const name = parts.slice(0, -1).join('_').trim();
  return name.length > 0 ? name : null;
}

/** 파일 첫 줄만 읽는다(전체 파일을 읽지 않는다). 읽기 실패는 null. */
export async function readFirstLine(filePath: string, limitBytes: number = FIRST_LINE_LIMIT): Promise<string | null> {
  let handle: FileHandle | null = null;
  try {
    handle = await open(filePath, 'r');
    const buffer = Buffer.alloc(limitBytes);
    const { bytesRead } = await handle.read(buffer, 0, limitBytes, 0);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    const newline = text.indexOf('\n');
    const line = newline >= 0 ? text.slice(0, newline) : text;
    return line.trim();
  } catch {
    return null;
  } finally {
    if (handle !== null) {
      await handle.close().catch(() => undefined);
    }
  }
}

/* ── 헤더 ──────────────────────────────────────────────────────── */

/**
 * 세션 헤더(첫 줄)를 읽는다. 헤더가 아니거나 `id` 가 없으면 null.
 * `parentSession` 은 부모 세션 **파일 경로**이므로 파일명에서 ID 만 뽑아 둔다.
 */
export function parseHeader(
  line: string,
): { id: string; cwd: string | null; parentSessionId: string | null } | null {
  const record = parseJsonRecord(line.trim());
  if (record === null) return null;
  if (asString(record['type']) !== 'session') return null;
  const id = asString(record['id']);
  if (id === null || id.length === 0) return null;
  return {
    id,
    cwd: asString(record['cwd']),
    parentSessionId: parentSessionIdOf(record),
  };
}

function parentSessionIdOf(header: Record<string, unknown>): string | null {
  const direct = asString(header['parentSessionId']);
  if (direct !== null && direct.length > 0) return direct;
  const path = asString(header['parentSession']);
  if (path === null || path.length === 0) return null;
  return sessionIdFromFileName(lastPathSegment(path));
}

/* ── 레코드 ────────────────────────────────────────────────────── */

/** `parseRecords` 에 넘기는 문맥. 경고·메시지에 세션/파일을 붙이는 데만 쓴다. */
export type ParseContext = { sessionId?: string | null; filePath?: string | null };

export type ParsedRecords = { messages: PiMessage[]; warnings: PiWarning[] };

type PendingCall = { id: string | null; command: string };

type BlockParts = { text: string[]; think: string[]; calls: PendingCall[] };

/**
 * 줄 단위 레코드를 읽어 채팅 메시지로 바꾼다.
 *
 * - `message`: `message:{role, content, model?, usage?}`. `content` 가 문자열이거나
 *   `{type:'text',text}[]` 이면 텍스트만 이어붙이고, `think`/`thinking` 블록은 `think` 로 분리한다.
 * - `toolResult`: `→ ` 접두 1행 결과. 직전 도구 호출(명령)과 짝지어 `명령\n→ 결과` 로 정규화한다.
 * - `compaction`: role `compaction`.
 * - 모르는 type: `unknown-record-type` 경고 **1건**으로 모으고 나머지 파싱은 계속한다.
 * - 깨진 JSON 줄: `malformed-line` 경고 후 skip.
 *
 * 예외를 던지지 않는다.
 */
export function parseRecords(lines: string[], ctx: ParseContext = {}): ParsedRecords {
  const sessionId = ctx.sessionId ?? '';
  const filePath = ctx.filePath ?? '';
  const messages: PiMessage[] = [];
  const warnings: PiWarning[] = [];
  const unknownTypes = new Map<string, number>();
  const pending: PendingCall[] = [];

  const warn = (kind: PiWarningKind, line: number | null, detail: string): void => {
    warnings.push({ kind, sessionId: sessionId.length > 0 ? sessionId : null, filePath, line, detail });
  };

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? '';
    const line = raw.trim();
    if (line.length === 0) continue;
    const lineNo = index + 1;
    const record = parseJsonRecord(line);
    if (record === null) {
      warn('malformed-line', lineNo, `JSON 을 해석하지 못했습니다: ${clip(line)}`);
      continue;
    }
    const type = asString(record['type']);
    if (type === null || type.length === 0) {
      const key = '(type 없음)';
      unknownTypes.set(key, (unknownTypes.get(key) ?? 0) + 1);
      continue;
    }
    switch (type) {
      case 'session':
        // 헤더. readSessionFile 이 이미 처리했다.
        break;
      case 'message': {
        const message = toMessage(record, lineNo, sessionId, pending, null);
        if (message !== null) messages.push(message);
        break;
      }
      case 'compaction': {
        messages.push(toCompaction(record, lineNo, sessionId));
        break;
      }
      case 'model_change':
      case 'thinking_level_change':
        // 세션 메타 변경. 채팅 본문이 아니다(모델 표시는 아직 쓰지 않는다).
        break;
      case 'custom_message':
      case 'custom':
        // 확장이 넣은 레코드. 본문 계약이 없어 건너뛴다(모르는 type 경고 대상도 아니다).
        break;
      default:
        unknownTypes.set(type, (unknownTypes.get(type) ?? 0) + 1);
        break;
    }
  }

  if (unknownTypes.size > 0) {
    const total = [...unknownTypes.values()].reduce((sum, count) => sum + count, 0);
    const names = [...unknownTypes.keys()].join(', ');
    warn('unknown-record-type', null, `알 수 없는 레코드 타입 ${unknownTypes.size}종 ${total}건: ${names}`);
  }

  return { messages, warnings };
}

function toMessage(
  record: Record<string, unknown>,
  lineNo: number,
  sessionId: string,
  pending: PendingCall[],
  forcedRole: PiMessageRole | null,
): PiMessage | null {
  const inner = asRecord(record['message']);
  const message = inner ?? record;
  const roleText = (asString(message['role']) ?? asString(record['role']) ?? '').toLowerCase();
  const role = forcedRole ?? roleOf(roleText);
  // role 이 system 이거나 알 수 없는 값이면 채팅 본문이 아니다.
  if (role === null) return null;

  const blocks = collectBlocks(message['content'] ?? record['content']);
  const id = messageId(record, lineNo, sessionId);
  const at = asString(record['timestamp']) ?? asString(record['at']) ?? '';
  const usage = usageOf(message['usage']) ?? usageOf(record['usage']);

  if (role === 'assistant') {
    for (const call of blocks.calls) pending.push(call);
    return {
      id,
      sessionId,
      role,
      at,
      text: blocks.text.join('\n\n'),
      think: joinThink(blocks.think),
      usage,
    };
  }

  if (role === 'user') {
    return {
      id,
      sessionId,
      role,
      at,
      text: blocks.text.join('\n\n'),
      think: joinThink(blocks.think),
      usage,
    };
  }

  // tool 결과: 직전 도구 호출 명령과 짝지어 `명령` 1행 + `→ 결과` 1행으로 정규화한다.
  const callId = asString(message['toolCallId']) ?? asString(record['toolCallId']);
  const matched = takePendingCall(pending, callId);
  const toolName = asString(message['toolName']) ?? asString(record['toolName']) ?? '';
  const command = matched === null ? oneLine(toolName) : matched.command;
  const result = oneLine(blocks.text.join(' '));
  const resultLine = result.length > 0 ? `→ ${result}` : '→';
  return {
    id,
    sessionId,
    role: 'tool',
    at,
    text: command.length > 0 ? `${command}\n${resultLine}` : resultLine,
    think: null,
    usage,
  };
}

function toCompaction(record: Record<string, unknown>, lineNo: number, sessionId: string): PiMessage {
  const summary =
    asString(record['summary']) ?? asString(record['text']) ?? asString(record['message']) ?? '';
  return {
    id: messageId(record, lineNo, sessionId),
    sessionId,
    role: 'compaction',
    at: asString(record['timestamp']) ?? asString(record['at']) ?? '',
    text: summary,
    think: null,
    usage: usageOf(record['usage']),
  };
}

function collectBlocks(content: unknown): BlockParts {
  const parts: BlockParts = { text: [], think: [], calls: [] };
  if (typeof content === 'string') {
    if (content.length > 0) parts.text.push(content);
    return parts;
  }
  if (!Array.isArray(content)) return parts;
  for (const block of content) {
    if (typeof block === 'string') {
      if (block.length > 0) parts.text.push(block);
      continue;
    }
    const object = asRecord(block);
    if (object === null) continue;
    const type = (asString(object['type']) ?? '').toLowerCase();
    if (type === 'text' || type === 'input_text' || type === 'output_text') {
      const text = asString(object['text']);
      if (text !== null && text.length > 0) parts.text.push(text);
      continue;
    }
    if (type === 'think' || type === 'thinking' || type === 'reasoning') {
      const thinking =
        asString(object['thinking']) ?? asString(object['text']) ?? asString(object['reasoning']);
      if (thinking !== null && thinking.length > 0) parts.think.push(thinking);
      continue;
    }
    if (type === 'toolcall' || type === 'tool_call' || type === 'tool_use' || type === 'tooluse') {
      parts.calls.push({
        id: asString(object['id']) ?? asString(object['toolCallId']) ?? null,
        command: commandOf(object),
      });
    }
    // 그 밖의 블록(이미지 등)은 본문 텍스트가 아니므로 버린다.
  }
  return parts;
}

/** 도구 호출 1건을 1행 명령으로 요약한다. */
function commandOf(block: Record<string, unknown>): string {
  const name = asString(block['name']) ?? asString(block['toolName']) ?? '';
  const args = block['arguments'] ?? block['input'] ?? block['args'];
  let argText = '';
  if (typeof args === 'string') {
    argText = args;
  } else {
    const argObject = asRecord(args);
    if (argObject !== null) {
      argText =
        asString(argObject['command']) ??
        asString(argObject['cmd']) ??
        asString(argObject['path']) ??
        safeJson(argObject);
    }
  }
  const head = name.length > 0 ? name : 'tool';
  return oneLine(argText.length > 0 ? `${head}: ${argText}` : head);
}

function messageId(record: Record<string, unknown>, lineNo: number, sessionId: string): string {
  const own = asString(record['id']);
  const suffix = own !== null && own.length > 0 ? own : `line-${lineNo}`;
  return sessionId.length > 0 ? `${sessionId}:${suffix}` : suffix;
}

function joinThink(blocks: string[]): string | null {
  const joined = blocks.filter((block) => block.trim().length > 0).join('\n\n');
  return joined.length > 0 ? joined : null;
}

/** `usage` 객체에서 4개 카운터를 읽는다. 없으면 null(0 으로 추정하지 않는다). */
function usageOf(value: unknown): TokenUsage | null {
  const object = asRecord(value);
  if (object === null) return null;
  const keys: Array<keyof TokenUsage> = ['input', 'output', 'cacheRead', 'cacheWrite'];
  const hasAny = keys.some((key) => key in object);
  if (!hasAny) return null;
  const usage: TokenUsage = { ...EMPTY_USAGE };
  for (const key of keys) {
    const raw = object[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) usage[key] = raw;
    else if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) usage[key] = parsed;
    }
  }
  return usage;
}

/* ── 파일 ──────────────────────────────────────────────────────── */

export type SessionFileRead =
  | { info: SessionFileInfo; messages: PiMessage[]; usage: TokenUsage; warnings: PiWarning[] }
  | { error: string };

/**
 * 세션 파일 1개를 읽어 info·messages·usage·warnings 로 바꾼다.
 * 읽기 실패는 `{ error }` 로 돌려준다(throw 금지).
 */
export async function readSessionFile(filePath: string): Promise<SessionFileRead> {
  const loaded = await loadSessionFile(filePath);
  if ('error' in loaded) return { error: loaded.error };
  const { text, size, mtimeMs } = loaded;

  const fileName = lastPathSegment(filePath);
  const lines = text.split(/\r?\n/);

  // 헤더는 첫 비어있지 않은 줄이다.
  let headerIndex = -1;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (line.trim().length === 0) continue;
    headerIndex = index;
    break;
  }

  const headerLine = headerIndex >= 0 ? (lines[headerIndex] ?? '') : '';
  const header = headerIndex >= 0 ? parseHeader(headerLine) : null;
  const headerRecord = parseJsonRecord(headerLine.trim());
  const sessionId = header?.id ?? sessionIdFromFileName(fileName);
  const mtimeIso = new Date(mtimeMs).toISOString();
  // 파일명 ISO 접두부가 1순위, 없으면 헤더 timestamp, 마지막으로 stat mtime.
  const createdAt =
    createdAtFromFileName(fileName) ?? asString(headerRecord?.['timestamp']) ?? mtimeIso;

  const warnings: PiWarning[] = [];

  if (headerIndex >= 0 && header === null) {
    warnings.push({
      kind: 'malformed-line',
      sessionId,
      filePath,
      line: headerIndex + 1,
      detail: '세션 헤더를 해석하지 못했습니다',
    });
  }

  const versionNumber = versionOf(headerRecord?.['version']);
  if (versionNumber !== null && versionNumber !== SUPPORTED_FORMAT_VERSION) {
    warnings.push({
      kind: 'unsupported-format-version',
      sessionId,
      filePath,
      line: headerIndex >= 0 ? headerIndex + 1 : null,
      detail: `세션 포맷 버전 ${versionNumber} (기대 ${SUPPORTED_FORMAT_VERSION})`,
    });
  }

  const bodyLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;
  const parsed = parseRecords(bodyLines, { sessionId, filePath });
  const offset = headerIndex >= 0 ? headerIndex + 1 : 0;
  for (const warning of parsed.warnings) {
    warnings.push(warning.line === null ? warning : { ...warning, line: warning.line + offset });
  }

  const usage: TokenUsage = { ...EMPTY_USAGE };
  const messages = parsed.messages.map((message) => {
    if (message.usage !== null) {
      usage.input += message.usage.input;
      usage.output += message.usage.output;
      usage.cacheRead += message.usage.cacheRead;
      usage.cacheWrite += message.usage.cacheWrite;
    }
    return {
      ...message,
      sessionId: message.sessionId.length > 0 ? message.sessionId : sessionId,
      at: message.at.length > 0 ? message.at : mtimeIso,
    };
  });

  const info: SessionFileInfo = {
    sessionId,
    filePath,
    cwd: header?.cwd ?? null,
    parentSessionId: header?.parentSessionId ?? null,
    createdAt,
    mtimeMs,
    sizeBytes: size,
  };

  return { info, messages, usage, warnings };
}

/* ── 상태 ──────────────────────────────────────────────────────── */

/**
 * 마지막 활동이 120초 이내면 running, 아니면 assistant 응답 유무에 따라 done/idle.
 * `now` 는 테스트에서 고정 시각을 넣기 위한 인자다.
 */
export function stateOf(
  lastActivityAt: string,
  hasAssistant: boolean,
  now: number = Date.now(),
): SessionState {
  const last = Date.parse(lastActivityAt);
  if (Number.isFinite(last) && Math.abs(now - last) <= RUNNING_WINDOW_MS) return 'running';
  return hasAssistant ? 'done' : 'idle';
}

/* ── 내부 헬퍼 ─────────────────────────────────────────────────── */

type LoadedSessionFile = { text: string; size: number; mtimeMs: number } | { error: string };

async function loadSessionFile(filePath: string): Promise<LoadedSessionFile> {
  try {
    const stats = await stat(filePath);
    const text = await readFile(filePath, 'utf8');
    return { text, size: stats.size, mtimeMs: stats.mtimeMs };
  } catch (error) {
    return { error: `세션 파일을 읽지 못했습니다: ${errorMessage(error)}` };
  }
}

/** JSON 객체 한 줄을 읽는다. 배열·원시값·깨진 JSON 은 null(외부 입력은 경계에서 좁힌다). */
function parseJsonRecord(text: string): Record<string, unknown> | null {
  if (text.length === 0) return null;
  try {
    return asRecord(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/** 헤더 `version` 을 숫자로 좁힌다. 숫자/문자열이 아니면 null. */
function versionOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** 레코드 role 문자열을 채팅 역할로 좁힌다. system 이나 미지의 값은 null. */
function roleOf(text: string): PiMessageRole | null {
  if (text === 'user') return 'user';
  if (text === 'assistant') return 'assistant';
  if (text === 'toolresult' || text === 'tool') return 'tool';
  return null;
}

/** 직전 도구 호출 1건을 꺼낸다. toolCallId 로 찾고, 없으면 도착 순서대로 꺼낸다. */
function takePendingCall(pending: PendingCall[], callId: string | null): PendingCall | null {
  if (callId !== null) {
    const index = pending.findIndex((call) => call.id === callId);
    if (index >= 0) return pending.splice(index, 1)[0] ?? null;
  }
  if (pending.length === 0) return null;
  return pending.splice(0, 1)[0] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clip(text: string): string {
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

function safeJson(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? '' : json;
  } catch {
    return '';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
