/**
 * 앱 전체에서 쓰는 화면·선택·그룹·설정 타입.
 * 렌더러는 이 파일과 다른 `@contract` 모듈만 import 한다 (ADR-0006).
 */

export type ViewId = 'board' | 'chat' | 'orchestration' | 'history';

export type SessionState = 'running' | 'done' | 'idle' | 'failed';

/** 목업 `MOCK.groups`(:118-125) 와 동일한 필드. */
export type Group = {
  id: string;
  name: string;
  note: string;
  /** 그룹을 관리하는 허브 세션. null 이면 아직 시작 전. */
  hubSessionId: string | null;
  /** 그룹 생성 시 고른 상위 저장소. */
  parentRepo: string;
};

/** 목업 `MOCK.worktrees`(:127-159) 의 런타임 필드. loop 는 Loop 탭이 하네스 상태에서 채운다. */
export type WorktreeView = {
  id: string;
  groupId: string;
  repo: string;
  name: string;
  branch: string;
  parentWorktreeId: string | null;
  dirty: boolean;
  /** Orca 에서 사라졌지만 이전에 있던 워크트리. */
  orcaMissing: boolean;
  path: string | null;
};

export type Selection =
  | { kind: 'none' }
  | { kind: 'group'; groupId: string }
  | { kind: 'worktree'; worktreeId: string }
  | { kind: 'session'; sessionId: string };

export type InspectorTab = 'goal' | 'list' | 'loop' | 'audit';

export type ListFilter = 'all' | 'queued' | 'active' | 'blocked' | 'done';

export type BannerKind = 'orca-off' | 'harness-missing' | 'harness-version' | 'error';

export type Banner = {
  kind: BannerKind;
  message: string;
  actionLabel: string | null;
};

export type HarnessAvailability = 'ok' | 'missing' | 'version-mismatch';

/** 사이드바가 쓰는 그룹 요약. 그룹 파일(groups.json)이 단일 기준이다. */
export type GroupSummary = {
  id: string;
  name: string;
  note: string;
  /** 허브가 바꾼 워크트리 표시 이름(수용기준 18). 비어 있으면 Orca 이름을 그대로 쓴다. */
  worktreeNames: Record<string, string>;
  /** 허브가 바꾼 세션 표시 이름. */
  sessionNames: Record<string, string>;
};

export type AppStatus = {
  /** Orca CLI 응답 여부. 마지막 폴링 결과. */
  orca: 'ok' | 'offline' | 'unknown';
  /** 저장된 그룹 목록. 새 데이터 디렉터리에서도 첫 그룹을 고를 수 있어야 한다. */
  groups: GroupSummary[];
  harness: HarnessAvailability;
  /** Orca CLI 실행 파일 경로(설정·환경변수 반영). */
  orcaBin: string;
  banner: Banner | null;
};

/** 앱 로컬 설정. `src/main/state/store.ts` 가 JSON 으로 저장한다. */
export type Settings = {
  lastGroupId: string | null;
  view: ViewId;
  listFilter: ListFilter;
  inspectorTab: InspectorTab;
  /** 보드 하단 인스펙터 높이(px). */
  inspectorHeight: number;
};

export const DEFAULT_SETTINGS: Settings = {
  lastGroupId: null,
  view: 'board',
  listFilter: 'all',
  inspectorTab: 'goal',
  inspectorHeight: 260,
};

/** 목업 `MOCK.presets`(:15-19). 그룹 생성 다이얼로그의 3분기. */
export type PresetKind = 'feature' | 'loop' | 'manual';

export const PRESET_KINDS: readonly PresetKind[] = ['feature', 'loop', 'manual'];

/** 목업 `MOCK.models`(:9-14) 는 하드코딩 목록이다. 앱은 Pi 설정에서 읽지 않고 이 목록을 쓴다. */
export type ModelChoice = { id: string; label: string };
