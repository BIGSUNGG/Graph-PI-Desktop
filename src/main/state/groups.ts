import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Group, PresetKind } from '../../shared/contract/app.ts';
import { dataDir } from '../paths.ts';

/** 그룹 정의는 앱 로컬 JSON 에만 저장한다(SQLite 는 검색 인덱스 전용, A12). */
export type GroupRecord = Group & {
  createdAt: string;
  /** 이 그룹에 연결된 Orca 워크트리 id(생성 순서). */
  worktreeIds: string[];
  /** 워크트리 id → 워크트리 절대 경로. 세션 cwd 매칭에 쓴다. */
  worktreePaths: Record<string, string>;
  /** 허브 PTY 터미널 id. JSONL 세션과 매칭되기 전까지의 키. */
  hubTerminalId: string | null;
  /** 워크트리 id → pi PTY 터미널 id. 프롬프트 주입에 쓴다. */
  worktreeTerminals: Record<string, string>;
  /** 허브 세션 cwd(그룹 폴더). */
  hubCwd: string;
  /** 허브가 요청한 워크트리 표시 이름(id → 이름). 보드가 Orca 이름 위에 덮어 그린다. */
  worktreeNames: Record<string, string>;
  /** 허브가 요청한 세션 표시 이름(sessionId → 이름). */
  sessionNames: Record<string, string>;
};

type StoreFile = { version: 1; groups: GroupRecord[] };

const EMPTY: StoreFile = { version: 1, groups: [] };

export type GroupStore = {
  list(): GroupRecord[];
  get(groupId: string): GroupRecord | null;
  create(input: {
    name: string;
    note: string;
    parentRepo: string;
    hubCwd: string;
    /** 그룹 생성 다이얼로그의 프리셋. 없으면 'manual'(구버전 호출자). */
    preset?: PresetKind;
    /** 프리셋 지시가 들어간 첫 프롬프트. 없으면 빈 문자열. */
    firstPrompt?: string;
  }): Promise<GroupRecord>;
  remove(groupId: string): Promise<void>;
  linkWorktree(groupId: string, worktreeId: string, path: string): Promise<void>;
  unlinkWorktree(worktreeId: string): Promise<void>;
  setHubTerminal(groupId: string, terminalId: string | null): Promise<void>;
  setHubSession(groupId: string, sessionId: string | null): Promise<void>;
  setWorktreeTerminal(groupId: string, worktreeId: string, terminalId: string): Promise<void>;
  terminalFor(groupId: string, worktreeId: string | null): string | null;
  findGroupByWorktree(worktreeId: string): GroupRecord | null;
  setAlias(kind: 'worktree' | 'session', id: string, name: string): Promise<void>;
};

export function createGroupStore(filePath: string = join(dataDir(), 'groups.json')): GroupStore {
  let cache: StoreFile | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  // list()/get() 는 동기 API 다(IPC 상태 응답). 그래서 첫 읽기는 생성 시점에 동기로 끝낸다.
  // 비동기로 미루면 앱을 새로 켤 때 그룹이 하나도 없어 보인다.
  const loadSync = (): StoreFile => {
    try {
      return normalize(JSON.parse(readFileSync(filePath, 'utf8')) as unknown);
    } catch {
      return EMPTY;
    }
  };
  cache = loadSync();

  const read = async (): Promise<StoreFile> => cache ?? EMPTY;

  const persist = (next: StoreFile): Promise<void> => {
    cache = next;
    // 동시 쓰기가 겹치지 않도록 순차 실행하고, 부분 쓰기를 막기 위해 rename 한다.
    queue = queue.then(async () => {
      await mkdir(dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
      await rename(tmp, filePath);
    });
    return queue.then(() => undefined);
  };

  return {
    list(): GroupRecord[] {
      return (cache ?? EMPTY).groups.slice();
    },
    get(groupId) {
      return (cache ?? EMPTY).groups.find((g) => g.id === groupId) ?? null;
    },
    async create(input) {
      const file = await read();
      const record: GroupRecord = {
        id: `g_${Date.now().toString(36)}`,
        name: input.name,
        note: input.note,
        hubSessionId: null,
        parentRepo: input.parentRepo,
        preset: input.preset ?? 'manual',
        firstPrompt: input.firstPrompt ?? '',
        createdAt: new Date().toISOString(),
        worktreeIds: [],
        worktreePaths: {},
        worktreeNames: {},
        sessionNames: {},
        hubTerminalId: null,
        worktreeTerminals: {},
        hubCwd: input.hubCwd,
      };
      await persist({ version: 1, groups: [...file.groups, record] });
      return record;
    },
    async remove(groupId) {
      const file = await read();
      await persist({ version: 1, groups: file.groups.filter((g) => g.id !== groupId) });
    },
    async linkWorktree(groupId, worktreeId, path) {
      const file = await read();
      await persist({
        version: 1,
        groups: file.groups.map((g) =>
          g.id === groupId
            ? {
                ...g,
                worktreeIds: g.worktreeIds.includes(worktreeId) ? g.worktreeIds : [...g.worktreeIds, worktreeId],
                worktreePaths: { ...g.worktreePaths, [worktreeId]: path },
              }
            : g,
        ),
      });
    },
    async unlinkWorktree(worktreeId) {
      const file = await read();
      await persist({
        version: 1,
        groups: file.groups.map((g) => {
          if (!g.worktreeIds.includes(worktreeId)) return g;
          const paths = { ...g.worktreePaths };
          delete paths[worktreeId];
          return { ...g, worktreeIds: g.worktreeIds.filter((id) => id !== worktreeId), worktreePaths: paths };
        }),
      });
    },
    async setHubTerminal(groupId, terminalId) {
      const file = await read();
      await persist({
        version: 1,
        groups: file.groups.map((g) => (g.id === groupId ? { ...g, hubTerminalId: terminalId } : g)),
      });
    },
    async setHubSession(groupId, sessionId) {
      const file = await read();
      await persist({
        version: 1,
        groups: file.groups.map((g) => (g.id === groupId ? { ...g, hubSessionId: sessionId } : g)),
      });
    },
    async setAlias(kind, id, name) {
      const file = await read();
      await persist({
        version: 1,
        groups: file.groups.map((g) => {
          // 이름 변경은 그룹 소속을 모르는 id 로도 올 수 있어, 그룹을 몰라도 첫 그룹에 붙이지 않고 넘긴다.
          if (kind === 'worktree') {
            return g.worktreeIds.includes(id) ? { ...g, worktreeNames: { ...g.worktreeNames, [id]: name } } : g;
          }
          return { ...g, sessionNames: { ...g.sessionNames, [id]: name } };
        }),
      });
    },
    findGroupByWorktree(worktreeId) {
      return (cache ?? EMPTY).groups.find((g) => g.worktreeIds.includes(worktreeId)) ?? null;
    },
    async setWorktreeTerminal(groupId, worktreeId, terminalId) {
      const file = await read();
      await persist({
        version: 1,
        groups: file.groups.map((g) =>
          g.id === groupId ? { ...g, worktreeTerminals: { ...g.worktreeTerminals, [worktreeId]: terminalId } } : g,
        ),
      });
    },
    terminalFor(groupId, worktreeId) {
      const group = (cache ?? EMPTY).groups.find((g) => g.id === groupId);
      if (group === undefined) return null;
      if (worktreeId === null) return group.hubTerminalId;
      return group.worktreeTerminals[worktreeId] ?? null;
    },
  };
}

function normalize(value: unknown): StoreFile {
  if (typeof value !== 'object' || value === null) return EMPTY;
  const groups = (value as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return EMPTY;
  return { version: 1, groups: groups.filter(isGroupRecord).map(withDefaults) };
}

/** 구버전 레코드에 없는 필드를 채운다(필드 추가 시 마이그레이션 지점). */
function withDefaults(group: GroupRecord): GroupRecord {
  return {
    ...group,
    worktreeIds: Array.isArray(group.worktreeIds) ? group.worktreeIds : [],
    worktreePaths: group.worktreePaths ?? {},
    worktreeTerminals: group.worktreeTerminals ?? {},
    hubTerminalId: group.hubTerminalId ?? null,
    hubSessionId: group.hubSessionId ?? null,
    hubCwd: group.hubCwd ?? '',
    preset: group.preset ?? 'manual',
    firstPrompt: group.firstPrompt ?? '',
    worktreeNames: group.worktreeNames ?? {},
    sessionNames: group.sessionNames ?? {},
  };
}

function isGroupRecord(value: unknown): value is GroupRecord {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  return typeof g['id'] === 'string' && typeof g['name'] === 'string';
}
