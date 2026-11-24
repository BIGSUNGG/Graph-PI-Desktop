/**
 * 계약 배럴 + IPC 채널 정의. main·preload·renderer 가 모두 이 파일을 통해 타입을 공유한다.
 * 규칙: 렌더러는 이 디렉터리만 import 한다.
 */
import type { AppStatus, Banner, ListFilter, Settings, ViewId, PresetKind } from './app.ts';
import type { OrcaSnapshot } from './orca.ts';
import type { PiMessage, PiSession, PiWarning } from './pi.ts';
import type { HarnessSnapshot } from './harness.ts';
import type { HistoryEntry, HistoryListQuery, HistorySearchQuery, IndexProgress } from './history.ts';
import type { RefCandidate, RefKind, RefResolution, RefToken, RefValidation } from './refs.ts';

export const CONTRACT_VERSION = 1;

/* ── 요청/응답 타입 ─────────────────────────────────────────────── */

export type MutationResult = { ok: boolean; error: string | null };

export type StartSessionRequest = {
  groupId: string;
  worktreeId: string | null;
  title: string;
  model: string | null;
  /** 첫 프롬프트. null 이면 프롬프트 없이 연다. */
  prompt: string | null;
};

export type StartSessionResult = { ok: boolean; sessionId: string | null; error: string | null };

export type AnswerQuestionRequest = {
  questionId: string;
  answer: Record<string, string[]>;
};

export type CreateGroupRequest = {
  name: string;
  note: string;
  parentRepo: string;
  preset: PresetKind;
  /** 프리셋 지시 텍스트가 들어간 첫 프롬프트. Feature·Loop 는 필수. */
  firstPrompt: string;
  model: string | null;
};

export type CreateGroupResult = { ok: boolean; groupId: string | null; error: string | null };

export type CreateWorktreeRequest = {
  groupId: string;
  repo: string;
  name: string;
  branch: string;
  base: string;
  parentWorktreeId: string | null;
  model: string | null;
};

export type RemoveWorktreeRequest = {
  groupId: string;
  worktreeId: string;
  deleteRunningSessions: boolean;
};

export type HistorySearchResult = {
  hits: Array<{
    sessionId: string;
    messageId: string;
    role: string;
    at: string;
    snippet: string;
    score: number;
  }>;
  error: string | null;
};

export type DeleteGroupRequest = { groupId: string };

/* ── IPC 채널 맵 ───────────────────────────────────────────────── */

export type IpcRequests = {
  'app:status': { req: void; res: AppStatus };
  'app:settings:get': { req: void; res: Settings };
  'app:settings:set': { req: Partial<Settings>; res: Settings };
  'app:banner:dismiss': { req: void; res: AppStatus };

  'orca:snapshot': { req: void; res: OrcaSnapshot };
  'orca:refresh': { req: void; res: OrcaSnapshot };

  'pi:sessions': { req: { groupId: string }; res: { sessions: PiSession[]; warnings: PiWarning[] } };
  'pi:messages': { req: { sessionId: string; limit: number }; res: { messages: PiMessage[]; warnings: PiWarning[] } };
  'pi:send': { req: { sessionId: string; text: string }; res: MutationResult };
  'pi:start': { req: StartSessionRequest; res: StartSessionResult };

  'harness:snapshot': { req: { groupId: string }; res: HarnessSnapshot };
  'harness:answer': { req: AnswerQuestionRequest; res: MutationResult };

  'history:list': { req: HistoryListQuery; res: HistoryEntry[] };
  'history:search': { req: HistorySearchQuery; res: HistorySearchResult };
  'history:index': { req: void; res: IndexProgress };

  'refs:candidates': { req: { groupId: string; head: string }; res: RefCandidate[] };
  'refs:resolve': { req: { groupId: string; tokens: RefToken[] }; res: RefValidation };
  'refs:create': { req: { groupId: string; kind: RefKind; handle: string }; res: { candidate: RefCandidate | null; error: string | null } };

  'group:create': { req: CreateGroupRequest; res: CreateGroupResult };
  'group:delete': { req: DeleteGroupRequest; res: MutationResult };

  'worktree:create': { req: CreateWorktreeRequest; res: MutationResult };
  'worktree:remove': { req: RemoveWorktreeRequest; res: MutationResult };
};

export type IpcChannel = keyof IpcRequests;
export type IpcRequest<K extends IpcChannel> = IpcRequests[K]['req'];
export type IpcResult<K extends IpcChannel> = IpcRequests[K]['res'];

/** preload 가 노출하는 invoke 표면. 채널 이름은 여기서만 문자열로 등장한다. */
export type GraphPiApi = {
  invoke<K extends IpcChannel>(channel: K, request: IpcRequest<K>): Promise<IpcResult<K>>;
  subscribe(listener: (event: PushEvent) => void): () => void;
};

/* ── main → renderer 푸시 이벤트 ───────────────────────────────── */

export const EVT_CHANNEL = 'evt:push';

export type PushEvent =
  | { type: 'status'; status: AppStatus }
  | { type: 'orca'; snapshot: OrcaSnapshot }
  | { type: 'sessions'; groupId: string; sessions: PiSession[]; warnings: PiWarning[] }
  | { type: 'harness'; snapshot: HarnessSnapshot }
  | { type: 'index'; progress: IndexProgress };

/* ── 프리셋·모델 정적 목록(목업과 동일) ────────────────────────── */

export type PresetMeta = {
  id: PresetKind;
  name: string;
  desc: string;
  required: boolean;
  placeholder: string;
  flow: string[];
};

export const PRESETS: readonly PresetMeta[] = [
  {
    id: 'feature',
    name: 'Feature',
    desc: '명세를 확인한 뒤 레포별 워크트리와 세션을 만들고, 목업 선택과 API 중계까지 진행합니다.',
    required: true,
    placeholder: '예: 로그인·회원가입과 채팅 로직을 백엔드에 구현하고, 프론트는 목업 시안을 만든 뒤 선택한 안을 적용해.',
    flow: ['명세 질문', '워크트리·세션', '목업 선택', 'API 중계'],
  },
  {
    id: 'loop',
    name: 'Loop',
    desc: '검토 축을 레포별 Loop로 나누고, 각 Loop가 끝날 때 허브가 통합해 다음 주기를 시작합니다.',
    required: true,
    placeholder: '예: 이 쇼핑 서비스의 보안·속도·확장성·유지보수성을 검토해.',
    flow: ['검토 축 분해', 'Loop 6개', '종료 시 통합', '다음 주기'],
  },
  {
    id: 'manual',
    name: 'Manual',
    desc: '허브가 Feature/Loop 구조를 참고해 요청에 맞는 워크트리·세션·Loop 구조를 스스로 정합니다.',
    required: false,
    placeholder: '예: 이 그룹에서 진행할 작업을 설명해. (선택)',
    flow: ['허브가 구조 결정', '필요한 질문', '자율 관리'],
  },
];

export const MODELS: readonly string[] = [
  'anthropic/claude-sonnet-4.5',
  'openai/gpt-5',
  'google/gemini-2.5-pro',
  'opencode-go/deepseek-v4.1-flash',
];

// 값까지 함께 내보낸다: PRESETS·MODELS·PRESET_KINDS·DEFAULT_SETTINGS·EMPTY_* 는 런타임 값이다.
export * from './app.ts';
export * from './orca.ts';
export * from './pi.ts';
export * from './harness.ts';
export * from './history.ts';
export * from './refs.ts';
