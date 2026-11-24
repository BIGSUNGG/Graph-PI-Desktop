import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  HarnessRecord,
  HarnessSnapshot,
  AgentMessageRecord,
  AgentCommandRecord,
  AuditRecord,
  GoalRecord,
  ListItemRecord,
  LoopRecord,
  QuestionRecord,
  TodoRecord,
} from '../../shared/contract/harness.ts';
import { EMPTY_HARNESS_SNAPSHOT, HARNESS_SCHEMA_VERSION } from '../../shared/contract/harness.ts';
import { groupStateFile } from '../paths.ts';

/**
 * 하네스 상태 파일(append-only JSONL)을 읽어 스냅샷으로 재생한다.
 * 같은 id 의 뒤 레코드가 앞 레코드를 덮는다(상태 전이 = 새 레코드 append).
 */
export async function readSnapshot(groupId: string): Promise<HarnessSnapshot> {
  const file = groupStateFile(groupId);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return { ...EMPTY_HARNESS_SNAPSHOT, groupId, availability: 'missing' };
  }

  const warnings: string[] = [];
  const latest = new Map<string, HarnessRecord>();
  let versionSeen = 0;
  let skipped = 0;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }
    if (!isRecord(parsed)) {
      skipped += 1;
      continue;
    }
    versionSeen = Math.max(versionSeen, parsed.schemaVersion);
    latest.set(parsed.id, parsed);
  }

  if (skipped > 0) warnings.push(`${skipped}개 레코드를 읽지 못했습니다`);

  const records = [...latest.values()].sort((a, b) => a.seq - b.seq);
  const byType = <T extends HarnessRecord['type']>(type: T): Extract<HarnessRecord, { type: T }>[] =>
    records.filter((r): r is Extract<HarnessRecord, { type: T }> => r.type === type);

  const availability: HarnessSnapshot['availability'] =
    versionSeen === 0 || versionSeen === HARNESS_SCHEMA_VERSION ? 'ok' : 'version-mismatch';
  if (availability === 'version-mismatch') {
    warnings.push(`하네스 스키마 버전 ${versionSeen} (앱 기대 ${HARNESS_SCHEMA_VERSION})`);
  }

  return {
    availability,
    groupId,
    schemaVersion: versionSeen,
    goals: byType('goal') as GoalRecord[],
    listItems: byType('list_item') as ListItemRecord[],
    loops: byType('loop') as LoopRecord[],
    audits: byType('audit') as AuditRecord[],
    todos: byType('todo') as TodoRecord[],
    questions: byType('question') as QuestionRecord[],
    messages: byType('message') as AgentMessageRecord[],
    commands: byType('command') as AgentCommandRecord[],
    warnings,
  };
}

/**
 * 전이 레코드를 새 레코드로 append 한다(질문 응답·에이전트 메시지 전달 결과).
 * 같은 파일에 마지막으로 쓴 레코드가 이기므로 스냅샷 재생이 상태 전이가 된다.
 */
export async function appendAnswer(
  groupId: string,
  record: HarnessRecord,
): Promise<{ ok: boolean; error: string | null }> {
  const file = groupStateFile(groupId);
  try {
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(record)}\n`, 'utf8');
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function isRecord(value: unknown): value is HarnessRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['type'] === 'string' &&
    typeof candidate['groupId'] === 'string' &&
    typeof candidate['seq'] === 'number' &&
    typeof candidate['schemaVersion'] === 'number'
  );
}
