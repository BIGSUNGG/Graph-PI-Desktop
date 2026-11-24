import type { PiMessage, PiSession, PiWarning, SessionFileInfo, TokenUsage } from '../../shared/contract/pi.ts';
import { groupSessions } from './lineage.ts';
import { readSessionFile } from './session-file.ts';
import { readSessionStats, type SessionStats } from './stats.ts';
import { createSessionWatcher } from './watcher.ts';

export type PendingLaunch = {
  cwd: string;
  at: string;
  terminalId: string | null;
  title: string;
  groupId: string;
  model: string | null;
};

export type PiService = {
  start(): void;
  stop(): void;
  /** PTY 실행 영수증을 등록해 JSONL 이 생기기 전에도 노드를 그린다(A2). */
  noteLaunch(launch: PendingLaunch): void;
  sessions(groupId: string, roots: string[]): Promise<{ sessions: PiSession[]; warnings: PiWarning[] }>;
  messages(sessionId: string): Promise<{ messages: PiMessage[]; warnings: PiWarning[] }>;
  files(): SessionFileInfo[];
};

const PENDING_STATE_WINDOW_MS = 10 * 60_000;

/**
 * 세션 파일·계보·대기 노드를 한 곳에서 조립한다.
 * 파일 경로는 세션 ID 로만 찾는다(렌더러가 경로를 다루지 않는다).
 */
export function createPiService(opts: { root?: string } = {}): PiService {
  const watcher = createSessionWatcher({ root: opts.root });
  const pending = new Map<string, PendingLaunch>();
  const pathById = new Map<string, string>();
  // mtime 이 같은 파일은 다시 읽지 않는다. 세션 파일은 수백 KB 라 매 스캔 전체 파싱은 비싸다.
  const statsCache = new Map<string, { mtimeMs: number; stats: SessionStats }>();
  let lastScan: SessionFileInfo[] = [];

  const refreshIndex = (files: SessionFileInfo[]): void => {
    lastScan = files;
    pathById.clear();
    for (const file of files) pathById.set(file.sessionId, file.filePath);
  };

  return {
    start(): void {
      watcher.start();
    },
    stop(): void {
      watcher.stop();
    },
    noteLaunch(launch: PendingLaunch): void {
      pending.set(`pending:${launch.terminalId ?? launch.at}`, launch);
    },
    files(): SessionFileInfo[] {
      return lastScan;
    },
    async sessions(groupId, roots) {
      const files = await watcher.scan();
      refreshIndex(files);
      // groupId 를 넘기지 않으면 lineage 가 groupId 를 매칭된 경로로 채운다.
      // 렌더러는 `session.groupId === 그룹 id` 로 보드를 거르므로 그룹 id 를 명시한다.
      const sessions = groupSessions(files, { groupId, groupRoots: roots });
      const warnings: PiWarning[] = [];

      // 보드 노드는 모델·토큰·마지막 활동을 보여야 한다(6행). 메타데이터에는 없으므로 파일에서 채운다.
      const mtimeByPath = new Map(files.map((file): [string, number] => [file.filePath, file.mtimeMs]));
      for (const session of sessions) {
        if (session.filePath === null) continue;
        const mtimeMs = mtimeByPath.get(session.filePath) ?? 0;
        const cached = statsCache.get(session.filePath);
        let stats: SessionStats;
        if (cached !== undefined && cached.mtimeMs === mtimeMs) {
          stats = cached.stats;
        } else {
          stats = await readSessionStats(session.filePath);
          statsCache.set(session.filePath, { mtimeMs, stats });
        }
        if (session.model === null || session.model === '') session.model = stats.model;
        session.usage = stats.usage;
        if (stats.lastAssistantAt !== null && Date.parse(stats.lastAssistantAt) > Date.parse(session.lastActivityAt)) {
          session.lastActivityAt = stats.lastAssistantAt;
        }
      }

      // 첫 턴 전에도 보드에 보이도록 실행 영수증 기반 노드를 붙인다.
      const now = Date.now();
      const matchedCwds = new Set(sessions.map((s: PiSession) => s.worktreeId));
      for (const [id, launch] of pending) {
        if (launch.groupId !== groupId) continue;
        const inWindow = now - Date.parse(launch.at) < PENDING_STATE_WINDOW_MS;
        const sameRoot = sessions.some((s: PiSession) => s.worktreeId === launch.cwd);
        if (!inWindow && !sameRoot) {
          pending.delete(id);
          continue;
        }
        if (sameRoot && matchedCwds.has(launch.cwd)) {
          pending.delete(id);
          continue;
        }
        sessions.push({
          id,
          groupId,
          title: launch.title,
          worktreeId: launch.cwd,
          model: launch.model,
          state: 'running',
          startedAt: launch.at,
          lastActivityAt: launch.at,
          usage: emptyUsage(),
          parentSessionId: null,
          isAudit: false,
          isHub: false,
          filePath: null,
          pendingLaunch: true,
        });
      }

      return { sessions, warnings };
    },
    async messages(sessionId) {
      if (sessionId.startsWith('pending:')) return { messages: [], warnings: [] };
      const filePath = pathById.get(sessionId);
      if (filePath === undefined) return { messages: [], warnings: [] };
      const parsed = await readSessionFile(filePath);
      if ('error' in parsed) {
        return {
          messages: [],
          warnings: [
            { kind: 'unreadable-file', sessionId, filePath, line: null, detail: parsed.error },
          ],
        };
      }
      return { messages: parsed.messages, warnings: parsed.warnings };
    },
  };
}

function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}
