/**
 * Pi 세션 파일(JSONL)을 읽어 만든 읽기 모델.
 * 근거: `Pi 세션 파일` 형식 — 첫 줄 header(id/cwd/parentSession), 이후 message 레코드.
 */
import type { SessionState } from './app.ts';

export type TokenUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export const EMPTY_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * 보드·채팅·인스펙터가 쓰는 세션 하나.
 * `pendingLaunch` 는 PTY 실행 영수증만 있고 JSONL 이 아직 없는 상태(A2 해소: 노드를 먼저 그린다).
 */
export type PiSession = {
  id: string;
  groupId: string;
  title: string;
  worktreeId: string | null;
  /** 알 수 없으면 null. JSONL 의 마지막 model_change 또는 message.model. */
  model: string | null;
  state: SessionState;
  startedAt: string;
  lastActivityAt: string;
  usage: TokenUsage;
  parentSessionId: string | null;
  /** 감사 전용 세션(계보에서 AUDIT 배지). */
  isAudit: boolean;
  isHub: boolean;
  filePath: string | null;
  pendingLaunch: boolean;
};

export type PiMessageRole = 'user' | 'assistant' | 'tool' | 'compaction';

export type PiMessage = {
  id: string;
  sessionId: string;
  role: PiMessageRole;
  at: string;
  /** 본문. tool 은 명령 1행 + 결과 `→` 행으로 정규화한다. */
  text: string;
  think: string | null;
  /** assistant 응답 1건에 붙은 usage. 없으면 null. */
  usage: TokenUsage | null;
};

export type PiWarningKind =
  | 'unknown-record-type'
  | 'malformed-line'
  | 'unsupported-format-version'
  | 'outside-workspace'
  | 'unreadable-file';

/** 파싱 경고. 채팅 화면에 1건 이상 경고 배지로 노출한다(acceptance 21행). */
export type PiWarning = {
  kind: PiWarningKind;
  sessionId: string | null;
  filePath: string;
  line: number | null;
  detail: string;
};

/** 워크트리 경로 기준 세션 묶음. 계보 계산 입력. */
export type SessionFileInfo = {
  sessionId: string;
  filePath: string;
  cwd: string | null;
  parentSessionId: string | null;
  createdAt: string;
  mtimeMs: number;
  sizeBytes: number;
};

/** PTY 실행 영수증과 JSONL 세션의 매칭 결과(A4 해소). */
export type SessionMatch = {
  sessionId: string;
  terminalId: string | null;
  matchedBy: 'terminal-id' | 'cwd-time-window' | 'unmatched';
};
