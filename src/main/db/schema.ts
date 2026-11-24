/**
 * 히스토리 인덱스 DDL. SQLite 한 파일에 세션·메시지·전문 검색(FTS5)을 둔다.
 *
 * 근거
 * - `.crew/handoff/mvp-implementation-map.md` §P3: `main/db/schema.ts` 가 테이블·FTS5·트리거 DDL 을 소유한다.
 * - `docs/30-specs/SPEC-graph-pi-ade.md` §데이터: "인덱스는 앱 데이터 폴더의 SQLite 한 파일".
 * - `node:sqlite`(host Node 24)에서 FTS5 가 동작함을 부모가 실측했다 → 외부 의존성 없이 FTS5 를 쓴다.
 *
 * FTS 설계: external content(`content=messages`) 대신 **standalone** `messages_fts` 를 쓴다.
 * external content 는 rowid 정합을 직접 관리해야 하고 `snippet()` 호출 시 원본 테이블 재조회 비용이 붙는다.
 * standalone 은 본문을 한 번 더 저장하지만 트리거 3개로만 동기화하면 되고, `snippet()` 이 FTS 안에서 끝난다.
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  group_id TEXT,
  worktree TEXT,
  model TEXT,
  started_at TEXT,
  last_at TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  in_window INTEGER NOT NULL DEFAULT 1
)`,
  `CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  at TEXT,
  body TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS messages_session_id_idx ON messages(session_id)`,
  // 목록 정렬(최근 활동 내림차순)과 30일 창 필터가 같은 컬럼을 쓴다.
  `CREATE INDEX IF NOT EXISTS sessions_last_at_idx ON sessions(last_at)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  body,
  session_id UNINDEXED,
  message_id UNINDEXED
)`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, body, session_id, message_id)
  VALUES (new.rowid, new.body, new.session_id, new.id);
END`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE rowid = old.rowid;
END`,
  `CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE ON messages BEGIN
  DELETE FROM messages_fts WHERE rowid = old.rowid;
  INSERT INTO messages_fts(rowid, body, session_id, message_id)
  VALUES (new.rowid, new.body, new.session_id, new.id);
END`,
];

/** 한 번에 실행할 DDL 문자열(문장 단위 실행이 필요하면 `SCHEMA_STATEMENTS` 를 쓴다). */
export const SCHEMA_SQL = `${SCHEMA_STATEMENTS.join(';\n')};`;

/** FTS5 테이블 이름. `snippet()/bm25()` 인자와 트리거가 같은 이름을 쓴다. */
export const FTS_TABLE = 'messages_fts';

/** messages 에서 검색 대상으로 삼는 컬럼 순서(0 = body). */
export const FTS_BODY_COLUMN = 0;
