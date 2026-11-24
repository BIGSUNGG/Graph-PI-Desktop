/**
 * 그룹 스코프 append-only JSONL 저장소. 앱은 같은 파일을 `src/main/harness/bridge.ts` 로 읽는다.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { HarnessRecord, HarnessSnapshot } from '../../../src/shared/contract/harness.ts';
import { EMPTY_HARNESS_SNAPSHOT } from '../../../src/shared/contract/harness.ts';
import { nextSeq } from './envelope.ts';
import { applyRecords } from './records.ts';

export type HarnessStore = {
  append(groupId: string, record: HarnessRecord): Promise<void>;
  read(groupId: string): Promise<HarnessRecord[]>;
  snapshot(groupId: string): Promise<HarnessSnapshot>;
  nextSeqFor(groupId: string): Promise<number>;
};

/** 앱의 `src/main/paths.ts` 와 같은 규칙이어야 앱이 이 파일을 읽는다. */
export function groupStateFile(dataDir: string, groupId: string): string {
  return join(dataDir, 'groups', groupId, 'state.jsonl');
}

export function createHarnessStore(input: { dataDir: string }): HarnessStore {
  return {
    async append(groupId, record) {
      const file = groupStateFile(input.dataDir, groupId);
      await mkdir(dirname(file), { recursive: true });
      await appendFile(file, `${JSON.stringify(record)}\n`, 'utf8');
    },
    async read(groupId) {
      const { records } = await readRecords(groupStateFile(input.dataDir, groupId));
      return records;
    },
    async snapshot(groupId) {
      const { records, skipped, found } = await readRecords(groupStateFile(input.dataDir, groupId));
      // 파일이 없으면 앱과 같이 `missing` 으로 알린다(#4 안내 표시 근거).
      if (!found) return { ...EMPTY_HARNESS_SNAPSHOT, groupId };
      const snapshot = applyRecords(records);
      // 깨진 줄 수는 재생 결과에만 담는다(읽기 자체는 조용히 계속한다).
      if (skipped > 0) snapshot.warnings.unshift(`${skipped}개 레코드를 읽지 못했습니다`);
      return snapshot;
    },
    async nextSeqFor(groupId) {
      const { records } = await readRecords(groupStateFile(input.dataDir, groupId));
      return nextSeq(records);
    },
  };
}

async function readRecords(
  file: string,
): Promise<{ records: HarnessRecord[]; skipped: number; found: boolean }> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return { records: [], skipped: 0, found: false };
  }

  const records: HarnessRecord[] = [];
  let skipped = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const record = parseRecord(line);
    if (record === null) {
      skipped += 1;
      continue;
    }
    records.push(record);
  }
  return { records, skipped, found: true };
}

function parseRecord(line: string): HarnessRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  return isRecord(parsed) ? parsed : null;
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
