/**
 * 앱 전역 상태. main 프로세스와는 `window.api` 로만 통신한다.
 * `window.api` 가 없는 단위 환경에서도 조용히 초기 상태로 렌더되어야 한다.
 */
import {
  createContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactElement,
  type ReactNode,
} from 'react';
import type {
  AppStatus,
  Banner,
  GraphPiApi,
  HarnessSnapshot,
  IndexProgress,
  InspectorTab,
  IpcChannel,
  IpcRequest,
  IpcResult,
  ListFilter,
  OrcaSnapshot,
  PiSession,
  PushEvent,
  Selection,
  Settings,
  ViewId,
} from '../../../shared/contract/index.ts';
import { DEFAULT_SETTINGS } from '../../../shared/contract/app.ts';
import { EMPTY_INDEX_PROGRESS } from '../../../shared/contract/history.ts';
import { EMPTY_ORCA_SNAPSHOT } from '../../../shared/contract/orca.ts';

/** 인스펙터 높이 허용 범위. 목업 인스펙터 채팅 리사이즈와 같은 값(mock/index.html:1881). */
export const INSPECTOR_MIN_HEIGHT = 120;
export const INSPECTOR_MAX_HEIGHT = 720;

export type AppState = {
  status: AppStatus | null;
  settings: Settings;
  orca: OrcaSnapshot;
  sessionsByGroup: Record<string, PiSession[]>;
  harness: HarnessSnapshot | null;
  selection: Selection;
  banner: Banner | null;
  /** 히스토리 화면이 쓰는 인덱싱 진행률(푸시 `index`). */
  index: IndexProgress;
};

export type AppActions = {
  select(selection: Selection): void;
  setView(view: ViewId): void;
  setInspectorTab(tab: InspectorTab): void;
  setListFilter(filter: ListFilter): void;
  setInspectorHeight(px: number): void;
  setBackground(on: boolean): void;
  dismissBanner(): void;
  refreshOrca(): void;
  loadSessions(groupId: string): void;
  loadHarness(groupId: string): void;
};

type Action =
  | { type: 'status'; status: AppStatus }
  | { type: 'settings'; settings: Settings }
  | { type: 'patchSettings'; patch: Partial<Settings> }
  | { type: 'orca'; snapshot: OrcaSnapshot }
  | { type: 'sessions'; groupId: string; sessions: PiSession[] }
  | { type: 'harness'; snapshot: HarnessSnapshot }
  | { type: 'selection'; selection: Selection }
  | { type: 'banner'; banner: Banner | null }
  | { type: 'index'; progress: IndexProgress };

const INITIAL_STATE: AppState = {
  status: null,
  settings: DEFAULT_SETTINGS,
  orca: EMPTY_ORCA_SNAPSHOT,
  sessionsByGroup: {},
  harness: null,
  selection: { kind: 'none' },
  banner: null,
  index: EMPTY_INDEX_PROGRESS,
};

function createInitialState(): AppState {
  return INITIAL_STATE;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.status, banner: action.status.banner };
    case 'settings':
      return { ...state, settings: action.settings };
    case 'patchSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'orca':
      return { ...state, orca: action.snapshot };
    case 'sessions':
      return {
        ...state,
        sessionsByGroup: { ...state.sessionsByGroup, [action.groupId]: action.sessions },
      };
    case 'harness':
      return { ...state, harness: action.snapshot };
    case 'selection':
      return { ...state, selection: action.selection };
    case 'banner':
      return { ...state, banner: action.banner };
    case 'index':
      return { ...state, index: action.progress };
    default:
      return state;
  }
}

export const AppStateContext = createContext<AppState | null>(null);
export const AppActionsContext = createContext<AppActions | null>(null);

/** preload 가 노출한 표면. 단위 환경(node)에는 window 자체가 없다. */
function readApi(): GraphPiApi | null {
  if (typeof window === 'undefined') return null;
  // SAFETY: Window.api 는 preload 없이도 undefined 일 수 있다. 선언이 필수 필드라 부재를 타입으로 표현할 수 없다.
  const candidate: unknown = (window as unknown as { api?: GraphPiApi }).api;
  if (typeof candidate !== 'object' || candidate === null) return null;
  return candidate as GraphPiApi;
}

async function tryInvoke<K extends IpcChannel>(
  client: GraphPiApi,
  channel: K,
  request: IpcRequest<K>,
): Promise<IpcResult<K> | null> {
  try {
    return await client.invoke(channel, request);
  } catch {
    // IPC 실패는 화면을 죽이지 않는다. 다음 푸시/폴링이 상태를 덮는다.
    return null;
  }
}

function persistSettings(patch: Partial<Settings>): void {
  const client = readApi();
  if (client === null) return;
  void tryInvoke(client, 'app:settings:set', patch);
}

function pushToAction(event: PushEvent): Action {
  switch (event.type) {
    case 'status':
      return { type: 'status', status: event.status };
    case 'orca':
      return { type: 'orca', snapshot: event.snapshot };
    case 'sessions':
      return { type: 'sessions', groupId: event.groupId, sessions: event.sessions };
    case 'harness':
      return { type: 'harness', snapshot: event.snapshot };
    case 'index':
      return { type: 'index', progress: event.progress };
  }
}

export function AppProvider(props: { children: ReactNode }): ReactElement {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const groupId = state.settings.lastGroupId;

  useEffect(() => {
    const client = readApi();
    if (client === null) return;
    let alive = true;
    const load = async (): Promise<void> => {
      const [status, settings, snapshot] = await Promise.all([
        tryInvoke(client, 'app:status', undefined),
        tryInvoke(client, 'app:settings:get', undefined),
        tryInvoke(client, 'orca:snapshot', undefined),
      ]);
      if (!alive) return;
      if (status !== null) dispatch({ type: 'status', status });
      if (settings !== null) dispatch({ type: 'settings', settings });
      // 새 데이터 디렉터리에서는 lastGroupId 가 비어 있다. 그룹이 있으면 첫 그룹을 골라야 화면이 빈다.
      if (status !== null && settings !== null) {
        const known = status.groups.some((group) => group.id === settings.lastGroupId);
        const first = status.groups[0];
        if (!known && first !== undefined) {
          dispatch({ type: 'patchSettings', patch: { lastGroupId: first.id } });
          persistSettings({ lastGroupId: first.id });
        }
      }
      if (snapshot !== null) dispatch({ type: 'orca', snapshot });
    };
    void load();
    const unsubscribe = client.subscribe((event: PushEvent) => {
      dispatch(pushToAction(event));
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  // 그룹이 바뀌면 그룹 스코프 데이터를 다시 읽는다.
  useEffect(() => {
    if (groupId === null) return;
    const client = readApi();
    if (client === null) return;
    let alive = true;
    const load = async (): Promise<void> => {
      const [sessions, harness] = await Promise.all([
        tryInvoke(client, 'pi:sessions', { groupId }),
        tryInvoke(client, 'harness:snapshot', { groupId }),
      ]);
      if (!alive) return;
      if (sessions !== null) dispatch({ type: 'sessions', groupId, sessions: sessions.sessions });
      if (harness !== null) dispatch({ type: 'harness', snapshot: harness });
    };
    void load();
    return () => {
      alive = false;
    };
  }, [groupId]);

  const actions = useMemo<AppActions>(() => {
    return {
      select: (selection) => {
        dispatch({ type: 'selection', selection });
        if (selection.kind === 'group') {
          dispatch({ type: 'patchSettings', patch: { lastGroupId: selection.groupId } });
          persistSettings({ lastGroupId: selection.groupId });
        }
      },
      setView: (view) => {
        dispatch({ type: 'patchSettings', patch: { view } });
        persistSettings({ view });
      },
      setInspectorTab: (tab) => {
        dispatch({ type: 'patchSettings', patch: { inspectorTab: tab } });
        persistSettings({ inspectorTab: tab });
      },
      setListFilter: (filter) => {
        dispatch({ type: 'patchSettings', patch: { listFilter: filter } });
        persistSettings({ listFilter: filter });
      },
      setInspectorHeight: (px) => {
        const height = Math.min(INSPECTOR_MAX_HEIGHT, Math.max(INSPECTOR_MIN_HEIGHT, Math.round(px)));
        dispatch({ type: 'patchSettings', patch: { inspectorHeight: height } });
        persistSettings({ inspectorHeight: height });
      },
      setBackground: (on) => {
        dispatch({ type: 'patchSettings', patch: { background: on } });
        persistSettings({ background: on });
      },
      dismissBanner: () => {
        dispatch({ type: 'banner', banner: null });
        const client = readApi();
        if (client === null) return;
        void (async () => {
          const status = await tryInvoke(client, 'app:banner:dismiss', undefined);
          if (status !== null) dispatch({ type: 'status', status });
        })();
      },
      refreshOrca: () => {
        const client = readApi();
        if (client === null) return;
        void (async () => {
          const [snapshot, status] = await Promise.all([
            tryInvoke(client, 'orca:refresh', undefined),
            tryInvoke(client, 'app:status', undefined),
          ]);
          if (snapshot !== null) dispatch({ type: 'orca', snapshot });
          if (status !== null) dispatch({ type: 'status', status });
        })();
      },
      loadSessions: (target) => {
        const client = readApi();
        if (client === null) return;
        void (async () => {
          const result = await tryInvoke(client, 'pi:sessions', { groupId: target });
          if (result !== null) dispatch({ type: 'sessions', groupId: target, sessions: result.sessions });
        })();
      },
      loadHarness: (target) => {
        const client = readApi();
        if (client === null) return;
        void (async () => {
          const snapshot = await tryInvoke(client, 'harness:snapshot', { groupId: target });
          if (snapshot !== null) dispatch({ type: 'harness', snapshot });
        })();
      },
    };
  }, []);

  return (
    <AppStateContext.Provider value={state}>
      <AppActionsContext.Provider value={actions}>{props.children}</AppActionsContext.Provider>
    </AppStateContext.Provider>
  );
}
