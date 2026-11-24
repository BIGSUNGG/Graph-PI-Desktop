/**
 * Pi 세션 디렉터리 폴링 감시자.
 *
 * 근거: `docs/90-reference/orca-cli-and-pi-sessions.md` §Pi 세션 파일
 * - 경로 규칙 `<root>/<project-slug>/<ISO시각>_<sessionId>.jsonl`
 * - Orca CLI 는 이벤트 푸시를 제공하지 않으므로 상태 변화는 폴링으로만 관찰된다.
 *
 * 30일 이전 파일도 목록에서 제외하지 않는다. 히스토리 전문 검색(#32)이 전체 기간을 요구하므로
 * 스캔은 `SessionFileInfo` 만 만들고, 화면 목록 필터는 db 서비스가 `in_window` 로 판단한다.
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionFileInfo } from '../../shared/contract/pi.ts';
import {
  createdAtFromFileName,
  parseHeader,
  readFirstLine,
  sessionIdFromFileName,
  sessionsRoot,
} from './session-file.ts';

/** 폴링 하한. 20세션 재그리기(#12)에서 과도한 스캔을 막는다. */
export const MIN_POLL_MS = 2_000;

const DEFAULT_POLL_MS = 3_000;

export type SessionWatcherOptions = {
  root?: string;
  pollMs?: number;
  onCreate?: (info: SessionFileInfo) => void;
  onChange?: (info: SessionFileInfo) => void;
};

export type SessionWatcher = {
  start(): void;
  stop(): void;
  scan(): Promise<SessionFileInfo[]>;
};

/**
 * 세션 루트를 폴링해 새 파일(onCreate)과 성장한 파일(onChange)을 알린다.
 * onCreate 는 감시 시작 **이후** 발견된 파일에만 발생한다(기존 파일은 기준선으로만 기록).
 */
export function createSessionWatcher(opts: SessionWatcherOptions = {}): SessionWatcher {
  const root = opts.root !== undefined && opts.root.length > 0 ? opts.root : sessionsRoot();
  const pollMs = Math.max(MIN_POLL_MS, opts.pollMs ?? DEFAULT_POLL_MS);

  /** 헤더를 다시 읽지 않도록 (경로, 크기, mtime) 기준으로 캐시한다(2,272개 규모 대비). */
  const headerCache = new Map<string, { sizeBytes: number; mtimeMs: number; info: SessionFileInfo }>();
  /** 첫 스캔 전에는 null — 이때는 onCreate 를 쏘지 않는다. */
  let known: Map<string, SessionFileInfo> | null = null;
  let inFlight: Promise<SessionFileInfo[]> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const describe = async (filePath: string, fileName: string): Promise<SessionFileInfo | null> => {
    try {
      const stats = await stat(filePath);
      const cached = headerCache.get(filePath);
      if (cached !== undefined && cached.sizeBytes === stats.size && cached.mtimeMs === stats.mtimeMs) {
        return cached.info;
      }
      const firstLine = await readFirstLine(filePath);
      const header = firstLine === null ? null : parseHeader(firstLine);
      const info: SessionFileInfo = {
        sessionId: header?.id ?? sessionIdFromFileName(fileName),
        filePath,
        cwd: header?.cwd ?? null,
        parentSessionId: header?.parentSessionId ?? null,
        // 파일명 앞 ISO 접두부 우선, 없으면 stat mtime.
        createdAt: createdAtFromFileName(fileName) ?? new Date(stats.mtimeMs).toISOString(),
        mtimeMs: stats.mtimeMs,
        sizeBytes: stats.size,
      };
      headerCache.set(filePath, { sizeBytes: stats.size, mtimeMs: stats.mtimeMs, info });
      return info;
    } catch {
      // 읽는 중 사라졌거나 권한이 없는 파일은 스캔 결과에서 뺀다(크래시 금지).
      return null;
    }
  };

  const collect = async (dir: string, files: SessionFileInfo[]): Promise<void> => {
    const names = await readDirSafe(dir);
    if (names === null) return;
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.jsonl')) continue;
      const info = await describe(join(dir, name), name);
      if (info !== null) files.push(info);
    }
  };

  const notify = (files: SessionFileInfo[]): void => {
    const next = new Map<string, SessionFileInfo>();
    const baseline = known;
    for (const file of files) {
      next.set(file.sessionId, file);
      if (baseline === null) continue;
      const previous = baseline.get(file.sessionId);
      if (previous === undefined) {
        safeCall(opts.onCreate, file);
        continue;
      }
      if (previous.mtimeMs !== file.mtimeMs || previous.sizeBytes !== file.sizeBytes) {
        safeCall(opts.onChange, file);
      }
    }
    known = next;

    const live = new Set(files.map((file) => file.filePath));
    for (const cachedPath of headerCache.keys()) {
      if (!live.has(cachedPath)) headerCache.delete(cachedPath);
    }
  };

  const scanOnce = async (): Promise<SessionFileInfo[]> => {
    const files: SessionFileInfo[] = [];
    const slugs = await readDirSafe(root);
    if (slugs === null) {
      // 루트가 아직 없으면 세션이 없는 것으로 본다.
      notify(files);
      return files;
    }
    // 루트 자체에 jsonl 이 있는 경우(테스트·단일 폴더)도 함께 본다.
    for (const name of slugs) {
      if (!name.toLowerCase().endsWith('.jsonl')) continue;
      const info = await describe(join(root, name), name);
      if (info !== null) files.push(info);
    }
    for (const slug of slugs) {
      if (slug.toLowerCase().endsWith('.jsonl') || slug.startsWith('.')) continue;
      await collect(join(root, slug), files);
    }
    files.sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.sessionId.localeCompare(right.sessionId),
    );
    notify(files);
    return files;
  };

  const scan = (): Promise<SessionFileInfo[]> => {
    if (inFlight !== null) return inFlight;
    const run = scanOnce().finally(() => {
      inFlight = null;
    });
    inFlight = run;
    return run;
  };

  return {
    start(): void {
      if (timer !== null) return;
      void scan();
      timer = setInterval(() => {
        void scan();
      }, pollMs);
      timer.unref();
    },
    stop(): void {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
    scan,
  };
}

function safeCall(
  handler: ((info: SessionFileInfo) => void) | undefined,
  info: SessionFileInfo,
): void {
  if (handler === undefined) return;
  try {
    handler(info);
  } catch {
    // 감시자 콜백 예외가 폴링을 죽이지 않게 한다.
  }
}

/** 디렉터리 목록. 없거나 읽을 수 없으면 null(스캔에서는 '세션 없음'). */
async function readDirSafe(dir: string): Promise<string[] | null> {
  try {
    return await readdir(dir);
  } catch {
    return null;
  }
}
