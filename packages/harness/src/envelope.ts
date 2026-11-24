/**
 * 모든 레코드가 공유하는 봉투 생성. 계약 타입은 `src/shared/contract/harness.ts` 것을 그대로 쓴다.
 */
import type {
  HarnessEnvelope,
  HarnessRecord,
  HarnessRecordType,
} from '../../../src/shared/contract/harness.ts';
import { HARNESS_SCHEMA_VERSION } from '../../../src/shared/contract/harness.ts';

/** 빌더·저장소가 받는 봉투 입력. `at` 을 생략하면 기록 시각으로 채운다. */
export type EnvelopeInput = {
  id: string;
  groupId: string;
  seq: number;
  writer: string;
  at?: string;
};

/** append-only 파일에서 다음 순서를 고른다(max+1, 비었으면 1). */
export function nextSeq(records: HarnessRecord[]): number {
  let max = 0;
  for (const record of records) {
    if (record.seq > max) max = record.seq;
  }
  return max + 1;
}

export function makeEnvelope<T extends HarnessRecordType>(
  input: EnvelopeInput & { type: T },
): HarnessEnvelope & { type: T } {
  return {
    type: input.type,
    id: input.id,
    groupId: input.groupId,
    seq: input.seq,
    at: input.at ?? new Date().toISOString(),
    schemaVersion: HARNESS_SCHEMA_VERSION,
    writer: input.writer,
  };
}
