/**
 * 7종 레코드 빌더와 재생(`applyRecords`). 재생 의미는 앱의 `src/main/harness/bridge.ts` 와 같다.
 */
import type {
  AgentCommandRecord,
  AgentMessageRecord,
  AuditRecord,
  GoalRecord,
  HarnessEnvelope,
  HarnessRecord,
  HarnessSnapshot,
  ListItemRecord,
  LoopRecord,
  QuestionRecord,
  TodoRecord,
} from '../../../src/shared/contract/harness.ts';
import { HARNESS_SCHEMA_VERSION } from '../../../src/shared/contract/harness.ts';
import type { EnvelopeInput } from './envelope.ts';
import { makeEnvelope } from './envelope.ts';

/** 빌더가 받는 payload — 계약 레코드에서 공통 봉투 키만 뺀다(계약 필드 목록을 복제하지 않는다). */
export type RecordPayload<R extends HarnessRecord> = Omit<R, keyof HarnessEnvelope>;

export function goalRecord(payload: RecordPayload<GoalRecord>, envelope: EnvelopeInput): GoalRecord {
  return { ...makeEnvelope({ ...envelope, type: 'goal' }), ...payload };
}

export function listItemRecord(
  payload: RecordPayload<ListItemRecord>,
  envelope: EnvelopeInput,
): ListItemRecord {
  return { ...makeEnvelope({ ...envelope, type: 'list_item' }), ...payload };
}

export function loopRecord(payload: RecordPayload<LoopRecord>, envelope: EnvelopeInput): LoopRecord {
  return { ...makeEnvelope({ ...envelope, type: 'loop' }), ...payload };
}

export function auditRecord(payload: RecordPayload<AuditRecord>, envelope: EnvelopeInput): AuditRecord {
  return { ...makeEnvelope({ ...envelope, type: 'audit' }), ...payload };
}

export function todoRecord(payload: RecordPayload<TodoRecord>, envelope: EnvelopeInput): TodoRecord {
  return { ...makeEnvelope({ ...envelope, type: 'todo' }), ...payload };
}

export function questionRecord(
  payload: RecordPayload<QuestionRecord>,
  envelope: EnvelopeInput,
): QuestionRecord {
  return { ...makeEnvelope({ ...envelope, type: 'question' }), ...payload };
}

export function messageRecord(
  payload: RecordPayload<AgentMessageRecord>,
  envelope: EnvelopeInput,
): AgentMessageRecord {
  return { ...makeEnvelope({ ...envelope, type: 'message' }), ...payload };
}

export function commandRecord(
  payload: RecordPayload<AgentCommandRecord>,
  envelope: EnvelopeInput,
): AgentCommandRecord {
  return { ...makeEnvelope({ ...envelope, type: 'command' }), ...payload };
}

/**
 * 레코드 목록을 앱이 렌더링하는 스냅샷으로 재생한다.
 * 같은 id 는 뒤 레코드가 이기고(상태 전이 = append), 남은 레코드는 seq 오름차순으로 정렬한다.
 */
export function applyRecords(records: HarnessRecord[]): HarnessSnapshot {
  const latest = new Map<string, HarnessRecord>();
  let versionSeen = 0;

  for (const record of records) {
    versionSeen = Math.max(versionSeen, record.schemaVersion);
    latest.set(record.id, record);
  }

  const ordered = [...latest.values()].sort((a, b) => a.seq - b.seq);
  const first = ordered[0];

  const warnings: string[] = [];
  const availability: HarnessSnapshot['availability'] =
    versionSeen === 0 || versionSeen === HARNESS_SCHEMA_VERSION ? 'ok' : 'version-mismatch';
  if (availability === 'version-mismatch') {
    warnings.push(`하네스 스키마 버전 ${versionSeen} (앱 기대 ${HARNESS_SCHEMA_VERSION})`);
  }

  return {
    availability,
    groupId: first === undefined ? '' : first.groupId,
    schemaVersion: versionSeen,
    goals: ordered.filter((record): record is GoalRecord => record.type === 'goal'),
    listItems: ordered.filter((record): record is ListItemRecord => record.type === 'list_item'),
    loops: ordered.filter((record): record is LoopRecord => record.type === 'loop'),
    audits: ordered.filter((record): record is AuditRecord => record.type === 'audit'),
    todos: ordered.filter((record): record is TodoRecord => record.type === 'todo'),
    questions: ordered.filter((record): record is QuestionRecord => record.type === 'question'),
    messages: ordered.filter((record): record is AgentMessageRecord => record.type === 'message'),
    commands: ordered.filter((record): record is AgentCommandRecord => record.type === 'command'),
    warnings,
  };
}
