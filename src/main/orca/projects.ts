/**
 * 프로젝트(저장소) 조회·등록과 워크트리 목록. 명령 문자열은 문서에 실측된 형태만 쓴다.
 * 근거: `docs/90-reference/orca-cli-and-pi-sessions.md` §이 프로젝트가 쓰는 명령.
 */
import type { OrcaProject, OrcaWorktree } from '../../shared/contract/orca.ts'
import { orcaJson, type OrcaRunResult } from './cli.ts'
import { pickProjects, pickWorktrees } from './types.ts'

export async function listProjects(): Promise<OrcaRunResult<OrcaProject[]>> {
  const res = await orcaJson<unknown>(['project', 'list'])
  if (!res.ok) return res
  const projects = pickProjects(res.result)
  // 실측: `project list` 응답에는 filesystem 경로가 없다. 저장소 루트 워크트리에서 채운다.
  if (projects.some((project) => project.path === '')) {
    const worktrees = await orcaJson<unknown>(['worktree', 'list'])
    if (worktrees.ok) {
      const roots = pickWorktrees(worktrees.result).filter((tree) => tree.isMainWorktree === true)
      for (const project of projects) {
        if (project.path !== '') continue
        const root = roots.find((tree) => (tree.projectId ?? tree.repoId) === project.id)
        if (root !== undefined) project.path = root.path
      }
    }
  }
  return { ok: true, result: projects }
}

/**
 * `orca repo add --path <path> [--kind git|folder]` — 실측된 플래그 형태가 `--path` 다.
 * add 응답 원형이 실측되지 않아 성공 후 project list 를 다시 읽어 결과로 돌려준다.
 */
export async function addProject(path: string): Promise<OrcaRunResult<OrcaProject[]>> {
  const added = await orcaJson<unknown>(['repo', 'add', '--path', path])
  if (!added.ok) return added
  return listProjects()
}

export async function listWorktrees(): Promise<OrcaRunResult<OrcaWorktree[]>> {
  const res = await orcaJson<unknown>(['worktree', 'list'])
  if (!res.ok) return res
  return { ok: true, result: pickWorktrees(res.result) }
}
