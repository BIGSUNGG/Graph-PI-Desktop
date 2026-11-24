/**
 * 히스토리 인덱스 서비스. SQLite(`node:sqlite` DatabaseSync) + FTS5 한 파일.
 *
 * 근거
 * - `.crew/handoff/mvp-implementation-map.md` §P3: 목록(최근 활동)·본문 검색(30일 이전 포함)·진행률.
 * - acceptance 32: "30일 이전 세션 본문 검색 결과" → 스캔은 전체 기간, 목록 필터만 `in_window`.
 *
 * 원칙
 * - 열기/쿼리 실패는 예외를 밖으로 던지지 않는다. 상태(`progress().state='error'`)와 빈 결과로 바꾼다.
 * - `upsertSession` 은 메시지를 id 기준 `INSERT OR IGNORE` 로 증분 반영한다(재인덱싱 비용 최소화).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { HistoryEntry, HistoryListQuery, HistorySearchHit, HistorySearchQuery, IndexProgress } from '../../shared/contract/history.ts';
import { EMPTY_INDEX_PROGRESS } from '../../shared/contract/history.ts';
import type { PiMessage, SessionFileInfo } from '../../shared/contract/pi.ts';
import { titleForFile } from '../pi/lineage.ts';
import { readSessionFile } from '../pi/session-file.ts';
import type { SessionWatcher } from '../pi/watcher.ts';
import { createSessionWatcher } from '../pi/watcher.ts';
import { SCHEMA_STATEMENTS } from './schema.ts';

/** 백그라운드 인덱싱 주기(5초). */
export const INDEX_INTERVAL_MS = 5_000;

/** 목록 창(30일). 창 밖 세션도 검색 결과에는 나온다. */
export const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;
/** 진행률 알림을 파일마다 쏘지 않도록 묶는 단위. */
const PROGRESS_EVERY = 20;

/** `history:search` 응답과 같은 모양(계약 배럴을 끌어오지 않으려고 구조적으로 맞춘다). */
export type IndexSearchResult = { hits: HistorySearchHit[]; error: string | null };

export type IndexService = {
  start(): void;
  stop(): void;
  progress(): IndexProgress;
  list(q: HistoryListQuery): HistoryEntry[];
  search(q: HistorySearchQuery): IndexSearchResult;
  upsertSession(info: SessionFileInfo, messages: PiMessage[], model: string | null): void;
  onChange(cb: (p: IndexProgress) => void): () => void;
};

export type IndexServiceOptions = {
  dbPath: string;
  /** 세션 루트. 없으면 `sessionsRoot()`(환경변수 `PI_SESSIONS_DIR` 우선). */
  sessionsRoot?: string;
};

/**
 * 본문 검색 SQL. 테이블·컬럼 이름은 `schema.ts` 의 `messages_fts(body)` 와 같아야 한다.
 * 식별자는 바인딩할 수 없어 상수 문자열로 고정하고, 사용자 입력은 `?` 로만 전달한다.
 */
const SEARCH_SQL = `SELECT m.session_id AS session_id,
       m.id AS message_id,
       m.role AS role,
       m.at AS at,
       snippet(messages_fts, 0, '[', ']', '…', 12) AS excerpt,
       bm25(messages_fts) AS score
FROM messages_fts
JOIN messages m ON m.rowid = messages_fts.rowid
WHERE messages_fts MATCH ?
ORDER BY score ASC, m.at DESC
LIMIT ?`;

const LIST_SQL = `SELECT id, group_id, title, worktree, model, started_at, last_at, message_count, in_window
FROM sessions
WHERE (? = 1 OR in_window = 1)
ORDER BY last_at DESC
LIMIT ?`;

const UPSERT_SESSION_SQL = `INSERT INTO sessions (id, title, group_id, worktree, model, started_at, last_at, message_count, in_window)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  group_id = excluded.group_id,
  worktree = excluded.worktree,
  model = excluded.model,
  started_at = excluded.started_at,
  last_at = excluded.last_at,
  in_window = excluded.in_window`;

const INSERT_MESSAGE_SQL =
  'INSERT OR IGNORE INTO messages (id, session_id, role, at, body) VALUES (?, ?, ?, ?, ?)';

const COUNT_MESSAGES_SQL = 'SELECT COUNT(*) AS count FROM messages WHERE session_id = ?';
const TOUCH_SESSION_SQL = 'UPDATE sessions SET last_at = ? WHERE id = ?';
const SET_MESSAGE_COUNT_SQL = 'UPDATE sessions SET message_count = ? WHERE id = ?';
const LOAD_LAST_AT_SQL = 'SELECT id, last_at FROM sessions';
/** 앱을 오래 켜 둬도 창 밖으로 밀린 세션이 목록에 남지 않게 매 주기 다시 계산한다. */
const REFRESH_WINDOW_SQL = 'UPDATE sessions SET in_window = CASE WHEN last_at >= ? THEN 1 ELSE 0 END';

export function createIndexService(opts: IndexServiceOptions): IndexService {
  let progress: IndexProgress = { ...EMPTY_INDEX_PROGRESS };
  const listeners = new Set<(p: IndexProgress) => void>();
  let watcher: SessionWatcher | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const publish = (patch: Partial<IndexProgress>): void => {
    progress = { ...progress, ...patch };
    for (const listener of listeners) {
      try {
        listener({ ...progress });
      } catch {
        // 구독자 예외가 인덱싱을 멈추지 않게 한다.
      }
    }
  };

  const db = openDatabase(opts.dbPath, (failure) => {
    progress = { ...EMPTY_INDEX_PROGRESS, state: 'error', error: failure };
  });

  const ensureWatcher = (): SessionWatcher => {
    if (watcher === null) watcher = createSessionWatcher({ root: opts.sessionsRoot });
    return watcher;
  };

  const upsertSession = (info: SessionFileInfo, messages: PiMessage[], model: string | null): void => {
    if (db === null) return;
    try {
      const lastAt = new Date(info.mtimeMs).toISOString();
      const inWindow = Date.now() - info.mtimeMs <= HISTORY_WINDOW_MS ? 1 : 0;
      db.exec('BEGIN');
      try {
        db.prepare(UPSERT_SESSION_SQL).run(
          info.sessionId,
          titleForFile(info),
          null,
          info.cwd,
          model,
          info.createdAt,
          lastAt,
          0,
          inWindow,
        );

        const insertMessage = db.prepare(INSERT_MESSAGE_SQL);
        for (const message of messages) {
          insertMessage.run(
            messageKey(info.sessionId, message),
            info.sessionId,
            message.role,
            message.at,
            bodyOf(message),
          );
        }

        const counted = db.prepare(COUNT_MESSAGES_SQL).get(info.sessionId);
        db.prepare(SET_MESSAGE_COUNT_SQL).run(rowNum(counted, 'count'), info.sessionId);
        // 마지막 활동은 파일 mtime 기준(메시지 at 은 형식별로 비어 있을 수 있다).
        db.prepare(TOUCH_SESSION_SQL).run(lastAt, info.sessionId);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      publish({ state: 'error', error: `세션 인덱싱 실패(${info.sessionId}): ${errorMessage(error)}` });
    }
  };

  const list = (query: HistoryListQuery): HistoryEntry[] => {
    if (db === null) return [];
    try {
      const rows = db.prepare(LIST_SQL).all(query.includeOlder ? 1 : 0, clampLimit(query.limit));
      return rows.map((row) => toEntry(row));
    } catch (error) {
      publish({ state: 'error', error: `히스토리 목록 조회 실패: ${errorMessage(error)}` });
      return [];
    }
  };

  const search = (query: HistorySearchQuery): IndexSearchResult => {
    if (db === null) return { hits: [], error: progress.error };
    const match = ftsMatchQuery(query.text);
    if (match === null) return { hits: [], error: null };
    try {
      const rows = db.prepare(SEARCH_SQL).all(match, clampLimit(query.limit));
      const hits: HistorySearchHit[] = rows.map((row) => ({
        sessionId: rowStr(row, 'session_id') ?? '',
        messageId: rowStr(row, 'message_id') ?? '',
        role: rowStr(row, 'role') ?? '',
        at: rowStr(row, 'at') ?? '',
        snippet: rowStr(row, 'excerpt') ?? '',
        score: rowNum(row, 'score'),
      }));
      return { hits, error: null };
    } catch (error) {
      publish({ state: 'error', error: `히스토리 검색 실패: ${errorMessage(error)}` });
      return { hits: [], error: errorMessage(error) };
    }
  };

  const tick = async (): Promise<void> => {
    const handle = db;
    if (handle === null || running) return;
    running = true;
    try {
      const files = await ensureWatcher().scan();
      const known = new Map<string, string>();
      for (const row of handle.prepare(LOAD_LAST_AT_SQL).all()) {
        const id = rowStr(row, 'id');
        if (id !== null) known.set(id, rowStr(row, 'last_at') ?? '');
      }
      // 30일 창은 저장된 플래그가 아니라 지금 시각 기준으로 다시 계산한다.
      handle
        .prepare(REFRESH_WINDOW_SQL)
        .run(new Date(Date.now() - HISTORY_WINDOW_MS).toISOString());
      publish({
        state: 'indexing',
        error: null,
        indexedSessions: 0,
        totalSessions: files.length,
        ratio: files.length === 0 ? null : 0,
      });

      let indexed = 0;
      for (const info of files) {
        const lastAt = new Date(info.mtimeMs).toISOString();
        // 파일 mtime 이 그대로면 다시 읽지 않는다(증분 인덱싱).
        if (known.get(info.sessionId) !== lastAt) {
          const parsed = await readSessionFile(info.filePath);
          if (!('error' in parsed)) upsertSession(parsed.info, parsed.messages, null);
        }
        indexed += 1;
        if (indexed % PROGRESS_EVERY === 0 && indexed < files.length) {
          publish({ indexedSessions: indexed, ratio: files.length === 0 ? null : indexed / files.length });
        }
      }

      publish({
        state: 'ready',
        indexedSessions: indexed,
        totalSessions: files.length,
        ratio: files.length === 0 ? null : 1,
        error: null,
      });
    } catch (error) {
      publish({ state: 'error', error: `히스토리 인덱싱 실패: ${errorMessage(error)}` });
    } finally {
      running = false;
    }
  };

  return {
    start(): void {
      if (db === null || timer !== null) return;
      void tick();
      timer = setInterval(() => {
        void tick();
      }, INDEX_INTERVAL_MS);
      timer.unref();
    },
    stop(): void {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
    progress(): IndexProgress {
      return { ...progress };
    },
    list,
    search,
    upsertSession,
    onChange(cb: (p: IndexProgress) => void): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

/* ── FTS 쿼리 ──────────────────────────────────────────────────── */

/**
 * 사용자 입력을 FTS5 MATCH 질의로 살균한다.
 * `"` 를 지우고 토큰을 각각 `"` 로 감싼 뒤 AND 로 잇는다(구문 오류·연산자 주입 차단).
 * 토큰이 없으면 null(= 빈 결과).
 */
export function ftsMatchQuery(text: string): string | null {
  const stripped = text.replace(/"/g, ' ');
  const tokens = stripped
    .split(/[^\p{L}\p{N}_]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  const unique = [...new Set(tokens.slice(0, 16))];
  return unique.map((token) => `"${token}"`).join(' AND ');
}

/* ── 내부 헬퍼 ─────────────────────────────────────────────────── */

function openDatabase(dbPath: string, onFailure: (failure: string) => void): DatabaseSync | null {
  try {
    if (dbPath !== ':memory:' && dbPath.length > 0) mkdirSync(dirname(dbPath), { recursive: true });
    const handle = new DatabaseSync(dbPath);
    handle.exec('PRAGMA busy_timeout = 5000');
    for (const statement of SCHEMA_STATEMENTS) handle.exec(statement);
    return handle;
  } catch (error) {
    onFailure(`히스토리 인덱스를 열지 못했습니다: ${errorMessage(error)}`);
    return null;
  }
}

/** 메시지 PK. 파서가 이미 `sessionId:id` 로 만들므로 중복 접두를 피한다. */
function messageKey(sessionId: string, message: PiMessage): string {
  if (message.id.length === 0) return `${sessionId}:${message.role}:${message.at}`;
  if (message.sessionId === sessionId) return message.id;
  return `${sessionId}:${message.id}`;
}

/** 검색 본문. 채팅에 보이는 본문 + 생각 블록을 함께 색인한다. */
function bodyOf(message: PiMessage): string {
  const parts: string[] = [];
  if (message.text.length > 0) parts.push(message.text);
  if (message.think !== null && message.think.length > 0) parts.push(message.think);
  return parts.join('\n\n');
}

function toEntry(row: Record<string, unknown>): HistoryEntry {
  const worktree = rowStr(row, 'worktree');
  return {
    sessionId: rowStr(row, 'id') ?? '',
    groupId: rowStr(row, 'group_id'),
    title: rowStr(row, 'title') ?? '',
    worktreeName: worktree === null ? null : lastSegment(worktree),
    model: rowStr(row, 'model'),
    startedAt: rowStr(row, 'started_at') ?? '',
    lastActivityAt: rowStr(row, 'last_at') ?? '',
    messageCount: rowNum(row, 'message_count'),
    inWindow: rowNum(row, 'in_window') === 1,
  };
}

function lastSegment(path: string): string | null {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  return last === undefined ? null : last;
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)));
}

function rowStr(row: Record<string, unknown> | undefined, key: string): string | null {
  if (row === undefined) return null;
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

function rowNum(row: Record<string, unknown> | undefined, key: string): number {
  if (row === undefined) return 0;
  const value = row[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
