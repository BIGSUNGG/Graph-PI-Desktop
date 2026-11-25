/**
 * 아카이브 정책(SPEC-hub-orchestration §아카이브). 아카이브는 별도 엔티티가 아니라
 * `archivedAt` 이 있는 Goal·Audit 조회다. 완료·중단된 Goal 과 그 Audit verdict 이력을
 * 그룹 단위로 남겨, 세션을 삭제해도 조회할 수 있게 한다.
 */
import type {
  AuditRecord,
  AuditVerdict,
  GoalRecord,
} from '../../../../src/shared/contract/harness.ts';

/** 아카이브에 남는 Goal 한 건의 요약. `status` 는 종료 상태 두 가지만 담는다. */
export type ArchiveEntry = {
  goalId: string;
  status: 'complete' | 'aborted';
  completedAt: string | null;
  /** 그 Goal 의 Audit verdict 를 seq 오름차순으로. verdict 가 없는 기록(진행 중·생략)은 null 이다. */
  auditVerdicts: (AuditVerdict | null)[];
};

/**
 * 아카이브 표시는 `archivedAt` 뿐이다 — 상태·완료 시각은 바꾸지 않는다(§아카이브).
 * 이미 아카이브된 Goal 은 다시 옮기지 않는다(처음 시각을 유지하는 멱등 동작).
 */
export function archiveGoal(goal: GoalRecord, at: string): GoalRecord {
  if (goal.archivedAt !== null) return goal;
  return { ...goal, archivedAt: at };
}

/** 아카이브로 옮겨졌는지 — `archivedAt` 이 채워졌는지만 본다. */
export function isArchived(goal: GoalRecord): boolean {
  return goal.archivedAt !== null;
}

/**
 * 그룹 아카이브 목록 — 완료·중단된 Goal 만 담고, 각 Goal 의 Audit verdict 를 재생 순서(seq)로 모은다.
 * Goal 순서는 입력 순서를 그대로 유지한다(화면 정렬은 호출부가 정한다).
 */
export function archiveEntries(
  goals: readonly GoalRecord[],
  audits: readonly AuditRecord[],
): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  for (const goal of goals) {
    const status = goal.status;
    // 진행 중(active·auditing·paused) Goal 은 아카이브 대상이 아니다.
    if (status !== 'complete' && status !== 'aborted') continue;
    entries.push({
      goalId: goal.id,
      status,
      completedAt: goal.completedAt,
      auditVerdicts: verdictsFor(goal.id, audits),
    });
  }
  return entries;
}

/** 한 Goal 의 Audit verdict 목록. seq 오름차순(같으면 id 순)이라 입력 순서가 달라도 결과가 같다. */
function verdictsFor(goalId: string, audits: readonly AuditRecord[]): (AuditVerdict | null)[] {
  const forGoal = audits.filter((audit) => audit.goalId === goalId);
  forGoal.sort(bySeqThenId);
  return forGoal.map((audit) => audit.verdict);
}

/** 재생 순서 비교 — seq 가 파일 안 단조 증가라 1차 키이고, 같으면 id 로 고정한다. */
function bySeqThenId(left: AuditRecord, right: AuditRecord): number {
  if (left.seq !== right.seq) return left.seq - right.seq;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}
