/**
 * 히스토리 화면 — 세션 목록(최근 30일/전체)과 본문 검색 결과(FTS5), 인덱싱 진행률.
 * 목업 `renderHistory`·`runSearch`(mock/index.html:2158-2222) 의 화면 구조를 따르되,
 * 목업의 가짜 `setInterval` 진행률 대신 store 의 `state.index`(푸시 `index`)를 그대로 쓴다.
 */
import { useEffect, useState, type ReactElement } from 'react';
import type {
  GraphPiApi,
  HistoryEntry,
  HistorySearchHit,
  IpcChannel,
  IpcRequest,
  IpcResult,
} from '../../../shared/contract/index.ts';
import { shortModel } from '../board/layout.ts';
import { useApp, useDispatch } from '../state/hooks.ts';

const LIST_LIMIT = 200;
const HIT_LIMIT = 100;

/** 목업 `ROLE`(:2163). 계약의 `role` 은 자유 문자열이라 표에 없으면 그대로 보여준다. */
const ROLE_LABEL: Record<string, string> = {
  user: '사용자',
  assistant: '에이전트',
  tool: '도구',
  compaction: '압축',
};

/** `window.api` 는 preload 없이 렌더되는 단위 환경에서 undefined 일 수 있다. */
function readApi(): GraphPiApi | null {
  if (typeof window === 'undefined') return null;
  // SAFETY: Window.api 는 필수 필드로 선언돼 있어 부재를 타입으로 표현할 수 없다. 런타임에만 확인한다.
  const candidate: unknown = (window as unknown as { api?: GraphPiApi }).api;
  if (typeof candidate !== 'object' || candidate === null) return null;
  return candidate as GraphPiApi;
}

async function invoke<K extends IpcChannel>(
  channel: K,
  request: IpcRequest<K>,
): Promise<IpcResult<K> | null> {
  const client = readApi();
  if (client === null) return null;
  try {
    return await client.invoke(channel, request);
  } catch {
    // IPC 실패는 화면을 죽이지 않는다. 호출부가 안내 문구로 바꾼다.
    return null;
  }
}

/** 목업은 `HH:MM` 만 썼다(:715). 히스토리는 날짜가 필요해 `MM-DD HH:MM` 으로 자른다. */
function stampOf(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

type SnippetPart = { text: string; hit: boolean };

/** FTS5 `snippet()` 은 매치를 `[`·`]` 로 감싼다(src/main/db/index.ts SEARCH_SQL). */
function snippetParts(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let rest = snippet;
  for (;;) {
    const open = rest.indexOf('[');
    if (open < 0) {
      if (rest !== '') parts.push({ text: rest, hit: false });
      return parts;
    }
    if (open > 0) parts.push({ text: rest.slice(0, open), hit: false });
    const close = rest.indexOf(']', open + 1);
    if (close < 0) {
      parts.push({ text: rest.slice(open), hit: true });
      return parts;
    }
    parts.push({ text: rest.slice(open + 1, close), hit: true });
    rest = rest.slice(close + 1);
  }
}

export function HistoryView(): ReactElement {
  const { index } = useApp();
  const actions = useDispatch();
  const [includeOlder, setIncludeOlder] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [hits, setHits] = useState<HistorySearchHit[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 목록은 기간 필터가 바뀌거나 인덱스 상태가 바뀔 때 다시 읽는다.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const list = await invoke('history:list', { includeOlder, limit: LIST_LIMIT });
      if (!alive) return;
      setEntries(list ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [includeOlder, index.state]);

  // `as const` 로 튜플을 고정한다. 그렇지 않으면 `string[][]` 로 추론돼 Map 생성자와 맞지 않는다.
  const titles = new Map<string, string>(
    entries.map((entry) => [entry.sessionId, entry.title] as const),
  );

  const runSearch = async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setHits(null);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await invoke('history:search', { text: trimmed, limit: HIT_LIMIT });
    setBusy(false);
    if (result === null) {
      setHits([]);
      setError('검색 결과를 받지 못했습니다. 앱 연결을 확인하세요.');
      return;
    }
    setHits(result.hits);
    setError(result.error);
  };

  const openSession = (sessionId: string): void => {
    actions.select({ kind: 'session', sessionId });
    actions.setView('chat');
  };

  const renderEntry = (entry: HistoryEntry): ReactElement => (
    <div key={entry.sessionId} className="h-item">
      <div
        className="h-row"
        role="button"
        tabIndex={0}
        onClick={() => {
          openSession(entry.sessionId);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openSession(entry.sessionId);
          }
        }}
      >
        <div>
          <div className="h-title">{entry.title}</div>
          <div className="h-meta">
            {entry.worktreeName === null ? '그룹 폴더' : entry.worktreeName} · {shortModel(entry.model)} ·{' '}
            {stampOf(entry.startedAt)}–{stampOf(entry.lastActivityAt)}
            {entry.inWindow ? null : ' · 30일 이전'}
          </div>
        </div>
        <div className="h-side">
          <span className="h-tok">{entry.messageCount.toLocaleString()} msg</span>
        </div>
      </div>
    </div>
  );

  const renderHit = (hit: HistorySearchHit): ReactElement => (
    <div key={hit.messageId} className="h-item">
      <div
        className="h-row"
        role="button"
        tabIndex={0}
        onClick={() => {
          openSession(hit.sessionId);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openSession(hit.sessionId);
          }
        }}
      >
        <div>
          <div className="h-title">{titles.get(hit.sessionId) ?? hit.sessionId}</div>
          <div className="h-meta">
            <span className={`h-kind ${hit.role}`}>{ROLE_LABEL[hit.role] ?? hit.role}</span> · {stampOf(hit.at)}
          </div>
          <div className="h-meta">
            {snippetParts(hit.snippet).map((part, partIndex) =>
              part.hit ? (
                <span key={partIndex} className="hit">
                  {part.text}
                </span>
              ) : (
                <span key={partIndex}>{part.text}</span>
              ),
            )}
          </div>
        </div>
        <div className="h-side">
          <span className="h-tok">score {hit.score.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );

  const indexing = index.state === 'indexing';
  const ratioPercent = Math.round((index.ratio ?? 0) * 100);

  return (
    <div className="history">
      <form
        className="history-head"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query);
        }}
      >
        <input
          aria-label="히스토리 검색"
          placeholder="세션 제목·본문 검색"
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            if (next.trim() === '') {
              setHits(null);
              setError(null);
            }
          }}
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? '검색 중…' : '검색'}
        </button>
        <div className="tabs" role="tablist" aria-label="기간">
          <button
            type="button"
            role="tab"
            aria-selected={!includeOlder}
            className={includeOlder ? 'tab' : 'tab is-active'}
            onClick={() => {
              setIncludeOlder(false);
            }}
          >
            30일
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={includeOlder}
            className={includeOlder ? 'tab is-active' : 'tab'}
            onClick={() => {
              setIncludeOlder(true);
            }}
          >
            전체
          </button>
        </div>
      </form>

      {indexing ? (
        <div className="indexbar">
          <div className="bar">
            <i style={{ width: `${ratioPercent}%` }} />
          </div>
          <span>
            색인 중 {ratioPercent}% · {index.indexedSessions}/{index.totalSessions} 세션
          </span>
        </div>
      ) : null}

      {index.state === 'error' && index.error !== null ? (
        <p className="muted">인덱스 오류: {index.error}</p>
      ) : null}

      {error !== null ? <p className="muted">검색 오류: {error}</p> : null}

      <div className="history-list">
        {hits === null
          ? entries.length === 0
            ? <p className="empty">조건에 맞는 세션이 없습니다.</p>
            : entries.map(renderEntry)
          : hits.length === 0
            ? <p className="empty">검색 결과가 없습니다.</p>
            : hits.map(renderHit)}
      </div>
    </div>
  );
}
