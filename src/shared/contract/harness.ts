/**
 * 하네스(그룹 단위 상태 저장소) 계약. `packages/harness` 가 쓰고 앱이 읽는다.
 * 저장 형식: append-only JSONL, 그룹 스코프(`<dataDir>/groups/<groupId>/state.jsonl`) + 세션 스코프 파일.
 * 모든 레코드는 공통 봉투(type·id·groupId·seq·at·schemaVersion·writer)를 갖는다.
 */

export const HARNESS_SCHEMA_VERSION = 1;

export type HarnessRecordType =
  | 'goal'
  | 'list_item'
  | 'loop'
  | 'audit'
  | 'todo'
  | 'question'
  | 'message'
  | 'command';

export type HarnessEnvelope = {
  type: HarnessRecordType;
  id: string;
  groupId: string;
  /** 파일 내 단조 증가 순서. 재생 시 중복 배제 키. */
  seq: number;
  /** 봉투 기록 시각(ISO). */
  at: string;
  schemaVersion: number;
  /** 기록 주체: 세션 ID 또는 `audit-agent`. */
  writer: string;
};

export type GoalStatus = 'active' | 'auditing' | 'complete' | 'paused' | 'aborted';

/**
 * 일시정지 사유. 스펙 데이터 표의 7종에 상태표가 쓰는 `blocked` 를 더한다(A6 해소).
 * `agent` 는 화면에 그대로 표시한다.
 */
export type PauseReason =
  | 'user'
  | 'agent'
  | 'audit_error'
  | 'question'
  | 'loop_bounds'
  | 'dependency'
  | 'standby'
  | 'blocked';

export type AuditVerdict = 'approved' | 'rejected' | 'impossible' | 'error';

export type AcceptanceCriterion = {
  id: string;
  desc: string;
  passed: boolean;
  evidence: string | null;
};

export type GoalRecord = HarnessEnvelope & {
  type: 'goal';
  sessionId: string;
  parentListItemId: string | null;
  parentGoalId: string | null;
  supersededByGoalId: string | null;
  objective: string;
  acceptanceCriteria: AcceptanceCriterion[];
  status: GoalStatus;
  pauseReason: PauseReason | null;
  auditAttemptCount: number;
  revision: number;
  loopId: string | null;
  latestAuditId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedRevision: number | null;
  /** 아카이브로 이동한 시각(§54). */
  archivedAt: string | null;
};

/** 저장되는 상태는 `queued`·`active` 뿐이다. 대기·진행·차단·완료 표시는 파생값이다. */
export type ListItemState = 'queued' | 'active';

export type ListItemRecord = HarnessEnvelope & {
  type: 'list_item';
  sessionId: string;
  /** 허브가 만든 항목이면 goalId 가 있고, 세션 큐 항목이면 sessionId 가 있다. */
  goalId: string | null;
  parentGoalId: string | null;
  title: string;
  state: ListItemState;
  queueOrder: number;
  childGoalIds: string[];
  supersededGoalIds: string[];
  /** 하위 Goal 배정이 끝나 목록이 고정됐는지(A5 해소). 고정 후 null 배정만 남으면 차단이다. */
  childGoalsFrozen: boolean;
  childGoalsFrozenAt: string | null;
  integrationNote: string | null;
  createdAt: string;
  activatedAt: string | null;
  completedAt: string | null;
  completedRevision: number | null;
};

export type LoopDirection = 'min' | 'max';

export type LoopStatus = 'idle' | 'running' | 'waiting' | 'paused' | 'done' | 'stopped';

export type LoopStopReason =
  | 'metric_target'
  | 'max_iterations'
  | 'time_limit'
  | 'token_limit'
  | 'plateau'
  | 'user'
  | 'audit_approved';

export type LoopHistoryEntry = {
  iteration: number;
  value: number | null;
  at: string;
  improved: boolean;
};

export type LoopRecord = HarnessEnvelope & {
  type: 'loop';
  goalId: string;
  sessionId: string;
  target: string;
  measureCmd: string;
  direction: LoopDirection;
  currentValue: number | null;
  bestValue: number | null;
  iteration: number;
  maxIterations: number;
  timeLimitSeconds: number | null;
  tokenLimit: number | null;
  tokensUsed: number;
  status: LoopStatus;
  pauseKind: 'audit' | 'error' | 'bounds' | null;
  stopReason: LoopStopReason | null;
  /** 측정 실행 실패와 측정값 0 을 구분한다. */
  measureExitCode: number | null;
  measureStderr: string | null;
  measuredAt: string | null;
  history: LoopHistoryEntry[];
  startedAt: string;
  updatedAt: string;
};

export type AuditScope = 'session' | 'parent' | 'group';

export type CriterionResult = {
  criterion: string;
  result: 'pass' | 'fail' | 'unknown';
  evidence: string;
};

export type AuditRecord = HarnessEnvelope & {
  type: 'audit';
  goalId: string;
  scope: AuditScope;
  /** 감사 세션 ID. 계보 자식 노드로 그린다(A8 해소). */
  auditSessionId: string | null;
  state: 'skipped' | 'finished' | 'running';
  skipReason: string | null;
  skippedBy: string | null;
  skippedAt: string | null;
  verdict: AuditVerdict | null;
  commitHash: string | null;
  worktreeState: string | null;
  criteriaResults: CriterionResult[];
  evidenceSummary: string | null;
  report: string | null;
  model: string | null;
  revision: number;
  createdAt: string;
  finishedAt: string | null;
  durationMs: number | null;
};

export type TodoScope = 'session' | 'group';
export type TodoStatus = 'todo' | 'doing' | 'done';

export type TodoRecord = HarnessEnvelope & {
  type: 'todo';
  scope: TodoScope;
  sessionId: string | null;
  title: string;
  status: TodoStatus;
  createdBySessionId: string;
  createdAt: string;
  updatedAt: string;
};

export type QuestionStatus = 'pending' | 'answered' | 'canceled';

export type QuestionOption = {
  label: string;
  description: string;
};

export type QuestionItem = {
  header: string;
  question: string;
  multiSelect: boolean;
  options: QuestionOption[];
};

export type QuestionRecord = HarnessEnvelope & {
  type: 'question';
  sessionId: string;
  /** 대기열 순서. 먼저 온 묶음부터 처리한다. */
  sequence: number;
  questions: QuestionItem[];
  status: QuestionStatus;
  answer: Record<string, string[]> | null;
  createdAt: string;
  deliveredAt: string | null;
  answeredAt: string | null;
  answerAppliedAt: string | null;
};

export type AgentMessageStatus = 'pending' | 'delivered' | 'failed';

export type AgentMessageRecord = HarnessEnvelope & {
  type: 'message';
  fromSessionId: string;
  toSessionId: string;
  body: string;
  status: AgentMessageStatus;
  createdAt: string;
  deliveredAt: string | null;
  failureReason: string | null;
  resumeAttempted: boolean;
};

/** 허브 세션이 요청한 보드 조작(수용기준 18). 사용자 확인 없이 실행된다. */
export type AgentCommandAction = 'remove-worktree' | 'rename-worktree' | 'remove-session' | 'rename-session';

export type AgentCommandStatus = 'pending' | 'done' | 'failed';

export type AgentCommandRecord = HarnessEnvelope & {
  type: 'command';
  fromSessionId: string;
  action: AgentCommandAction;
  /** 워크트리 id 또는 세션 id. */
  target: string;
  /** 이름 변경일 때만 쓴다. */
  value: string | null;
  status: AgentCommandStatus;
  result: string | null;
  createdAt: string;
  executedAt: string | null;
};

export type HarnessRecord =
  | GoalRecord
  | ListItemRecord
  | LoopRecord
  | AuditRecord
  | TodoRecord
  | QuestionRecord
  | AgentMessageRecord
  | AgentCommandRecord;

/** 앱이 렌더링에 쓰는 그룹 스냅샷. 저장 순서(seq)대로 재생한 결과. */
export type HarnessSnapshot = {
  availability: 'ok' | 'missing' | 'version-mismatch';
  groupId: string;
  schemaVersion: number;
  goals: GoalRecord[];
  listItems: ListItemRecord[];
  loops: LoopRecord[];
  audits: AuditRecord[];
  todos: TodoRecord[];
  questions: QuestionRecord[];
  messages: AgentMessageRecord[];
  commands: AgentCommandRecord[];
  warnings: string[];
};

export const EMPTY_HARNESS_SNAPSHOT: HarnessSnapshot = {
  availability: 'missing',
  groupId: '',
  schemaVersion: 0,
  goals: [],
  listItems: [],
  loops: [],
  audits: [],
  todos: [],
  questions: [],
  messages: [],
  commands: [],
  warnings: [],
};

/** 허브 List 항목의 표시 상태(파생, 저장하지 않음) — §10.2. */
export type ListDisplayState = 'queued' | 'active' | 'blocked' | 'complete';

/** 감사 gate 계산 결과(파생, 저장하지 않음) — §10.4. */
export type AuditGate = 'passed' | 'pending' | 'none';
