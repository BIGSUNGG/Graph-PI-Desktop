/**
 * 히스토리 화면(30일 목록·본문 검색) 읽기 모델. 인덱스는 SQLite FTS5 한 파일이다.
 */

export type HistoryEntry = {
  sessionId: string;
  groupId: string | null;
  title: string;
  worktreeName: string | null;
  model: string | null;
  startedAt: string;
  lastActivityAt: string;
  messageCount: number;
  /** 30일 창 안에 있는지. 창 밖도 검색 결과에는 나올 수 있다. */
  inWindow: boolean;
};

export type HistorySearchHit = {
  sessionId: string;
  messageId: string;
  role: string;
  at: string;
  /** 매치 주변 발췌. FTS5 snippet(). */
  snippet: string;
  score: number;
};

export type IndexProgress = {
  state: 'idle' | 'indexing' | 'ready' | 'error';
  indexedSessions: number;
  totalSessions: number;
  /** 진행률(0..1). total 이 0 이면 null. */
  ratio: number | null;
  error: string | null;
};

export type HistoryListQuery = {
  /** 30일 이전 포함 여부. 기본 false(= 최근 30일). */
  includeOlder: boolean;
  limit: number;
};

export type HistorySearchQuery = {
  text: string;
  limit: number;
};

export const EMPTY_INDEX_PROGRESS: IndexProgress = {
  state: 'idle',
  indexedSessions: 0,
  totalSessions: 0,
  ratio: null,
  error: null,
};
