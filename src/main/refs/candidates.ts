import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { OrcaSnapshot } from '../../shared/contract/orca.ts';
import type { RefCandidate } from '../../shared/contract/refs.ts';

/** 표시 이름 → `@` handle. 소문자·공백은 하이픈, 영숫자/하이픈/언더스코어만 남긴다. */
export function toHandle(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * 후보는 Orca 스냅샷(프로젝트·워크트리·브랜치)과 그룹 워크트리의 1단계 파일에서 만든다.
 * 스냅샷을 다시 조회하지 않으므로 폴러가 죽어도 후보 목록은 유지된다.
 */
export async function buildCandidates(input: {
  snapshot: OrcaSnapshot;
  groupRoots: string[];
  head: string;
}): Promise<RefCandidate[]> {
  const candidates: RefCandidate[] = [];
  for (const project of input.snapshot.projects) {
    candidates.push({
      kind: 'project',
      handle: toHandle(basename(project.path)),
      label: project.displayName,
      detail: project.path,
    });
  }
  for (const worktree of input.snapshot.worktrees) {
    if (!input.groupRoots.includes(worktree.path)) continue;
    candidates.push({
      kind: 'worktree',
      handle: toHandle(worktree.displayName),
      label: worktree.displayName,
      detail: worktree.path,
    });
    if (worktree.branch !== null) {
      candidates.push({
        kind: 'branch',
        handle: toHandle(worktree.branch),
        label: worktree.branch,
        detail: worktree.path,
      });
    }
    for (const entry of await listEntries(worktree.path)) {
      candidates.push({ kind: 'path', handle: entry, label: entry, detail: join(worktree.path, entry) });
    }
  }

  const head = input.head.toLowerCase();
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (head !== '' && !candidate.handle.startsWith(head)) return false;
    const key = `${candidate.kind}:${candidate.handle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function listEntries(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .map((entry) => entry.name);
  } catch {
    // 접근 불가한 워크트리는 후보에서 조용히 빠진다.
    return [];
  }
}
