/**
 * 워크트리 생성·삭제·조회. 문서에 실측된 플래그만 쓰고, 근거가 없는 부분은 `shortcut:` 으로 표시한다.
 * 근거: `docs/90-reference/orca-cli-and-pi-sessions.md` §이 프로젝트가 쓰는 명령(worktree create/rm/show).
 */
import type { OrcaWorktree } from '../../shared/contract/orca.ts'
import { orcaJson, type OrcaRunResult } from './cli.ts'
import { isRecord, pickProjects, pickWorktree, pickWorktrees } from './types.ts'

export type CreateWorktreeInput = {
  /** Orca selector(id 또는 `path:…`)를 그대로 받는다. */
  repo: string
  name: string
  branch: string
  base: string
  parentWorktreeId?: string | null
}

/** result 가 목록/단일/`{worktree:{…}}` 중 무엇이어도 첫 워크트리를 꺼낸다. */
function firstWorktree(raw: unknown): OrcaWorktree | null {
  const fromList = pickWorktrees(raw)[0]
  if (fromList !== undefined) return fromList
  if (isRecord(raw)) {
    const nested = raw['worktree']
    if (isRecord(nested)) return pickWorktree(nested)
  }
  return pickWorktree(raw)
}

/**
 * `--repo` 선택자는 repo id 를 받는다. 앱은 project id 를 들고 있으므로 먼저 옮긴다.
 * 순서: project list 의 sourceRepoIds → worktree list 의 repoId → 원본 값.
 */
async function resolveRepoSelector(selector: string): Promise<string> {
  const projects = await orcaJson<unknown>(['project', 'list'])
  if (projects.ok) {
    const hit = pickProjects(projects.result).find(
      (project) => project.id === selector || project.displayName === selector
    )
    const repoId = hit?.repoIds?.[0]
    if (repoId !== undefined && repoId !== '') return repoId
  }
  const trees = await orcaJson<unknown>(['worktree', 'list'])
  if (trees.ok) {
    const rows = pickWorktrees(trees.result)
    const byRepo = rows.find((row) => row.repoId === selector)
    if (byRepo !== undefined) return byRepo.repoId
    const byProject = rows.find(
      (row) => row.projectId === selector || row.projectId === `repo:${selector}`
    )
    if (byProject !== undefined) return byProject.repoId
  }
  return selector
}

export async function createWorktree(req: CreateWorktreeInput): Promise<OrcaRunResult<OrcaWorktree | null>> {
  // 실측 스키마: `worktree create --name <name> [--repo <selector>] [--base-branch <ref>] [--branch <name>]`.
  const repo = await resolveRepoSelector(req.repo)
  const args = ['worktree', 'create', '--name', req.name, '--repo', repo, '--base-branch', req.base]
  if (req.branch.trim() !== '' && req.branch !== req.name) args.push('--branch', req.branch)
  if (req.parentWorktreeId !== undefined && req.parentWorktreeId !== null && req.parentWorktreeId !== '') {
    args.push('--parent-worktree', req.parentWorktreeId)
  }
  const res = await orcaJson<unknown>(args)
  if (!res.ok) return res
  return { ok: true, result: firstWorktree(res.result) }
}

export async function removeWorktree(
  id: string,
  opts: { force?: boolean } = {},
): Promise<OrcaRunResult<void>> {
  const args = ['worktree', 'rm', '--worktree', id]
  // 앱은 사용자 확인 뒤에만 지우고, 잠금 때문에 실패하면 그대로 알린다(force 는 호출자가 명시할 때만).
  if (opts.force === true) args.push('--force')
  const res = await orcaJson<unknown>(args)
  if (!res.ok) return res
  return { ok: true, result: undefined }
}

export async function showWorktree(id: string): Promise<OrcaRunResult<OrcaWorktree | null>> {
  // 실측 스키마: `worktree show --worktree <selector>`.
  const res = await orcaJson<unknown>(['worktree', 'show', '--worktree', id])
  if (!res.ok) return res
  return { ok: true, result: firstWorktree(res.result) }
}
