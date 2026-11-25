/**
 * `refs:create` — 없는 참조를 확인 후 만든다.
 * 규칙(SPEC-mvp-acceptance 27·28): 워크트리·브랜치는 만들 수 있지만 없는 파일·폴더는 만들지 않는다.
 */
import type { RefCandidate, RefKind } from '../../shared/contract/refs.ts'
import type { OrcaSnapshot } from '../../shared/contract/orca.ts'
import type { OrcaService } from '../orca/index.ts'

export type CreateRefInput = {
  kind: RefKind
  handle: string
  repo: string | null
  base: string;
}

export type CreateRefResult = {
  candidate: RefCandidate | null;
  /** 만들어진 워크트리 id. 실패·비워크트리면 null — 그룹 연결에만 쓴다. */
  worktreeId: string | null;
  error: string | null;
};

/** 그룹 스냅샷에서 워크트리를 만들 때 쓸 repo·base 를 고른다. */
export function refTarget(
  snapshot: OrcaSnapshot,
  worktreeIds: readonly string[],
  parentRepo: string,
): { repo: string | null; base: string } {
  const own = snapshot.worktrees.filter((tree) => worktreeIds.includes(tree.id))
  const first = own[0]
  const repo = first === undefined ? (parentRepo === '' ? null : parentRepo) : (first.projectId ?? first.repoId)
  const base = first === undefined || first.branch === '' ? 'main' : first.branch
  return { repo, base }
}

export async function createRef(
  orca: OrcaService,
  input: CreateRefInput,
): Promise<CreateRefResult> {
  if (input.kind !== 'worktree') {
    return { candidate: null, worktreeId: null, error: '워크트리 참조만 만들 수 있습니다' }
  }
  if (input.repo === null) {
    return { candidate: null, worktreeId: null, error: '저장소를 알 수 없어 워크트리를 만들 수 없습니다' }
  }
  const created = await orca.createWorktree({
    repo: input.repo,
    name: input.handle,
    branch: input.handle,
    base: input.base,
    parentWorktreeId: null,
  })
  if (!created.ok) return { candidate: null, worktreeId: null, error: created.error }
  const tree = created.result
  if (tree === null) return { candidate: null, worktreeId: null, error: '워크트리 생성 결과를 읽지 못했습니다' }
  return {
    candidate: {
      kind: 'worktree',
      handle: tree.displayName === '' ? input.handle : tree.displayName,
      label: tree.displayName === '' ? input.handle : tree.displayName,
      detail: tree.path,
    },
    worktreeId: tree.id,
    error: null,
  }
}
