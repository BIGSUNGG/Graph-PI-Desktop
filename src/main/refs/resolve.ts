import type { RefCandidate, RefResolution, RefToken, RefValidation } from '../../shared/contract/refs.ts';
import type { OrcaProject, OrcaSnapshot, OrcaWorktree } from '../../shared/contract/orca.ts';

/** 블록에서 값을 모를 때 쓰는 표기. */
const UNKNOWN = '-';

/**
 * 토큰을 후보에 맞춘다. `@handle/나머지` 중 handle 이 맞아야 하고,
 * `/` 만 남은 토큰(`@web/`)은 값이 비어 있으므로 미해석으로 본다(acceptance 30행).
 */
export function resolveTokens(tokens: RefToken[], candidates: RefCandidate[]): RefValidation {
  const resolutions: RefResolution[] = [];
  for (const token of tokens) {
    const matches = candidates.filter((candidate) => candidate.handle === token.head.toLowerCase());
    if (matches.length === 0) {
      resolutions.push({ ok: false, token, reason: 'unknown', candidates: [] });
      continue;
    }
    const exact = matches.filter((candidate) => candidate.handle === token.raw.toLowerCase());
    const chosen = exact.length === 1 ? exact : matches;
    if (chosen.length !== 1) {
      resolutions.push({ ok: false, token, reason: 'ambiguous', candidates: chosen });
      continue;
    }
    const candidate = chosen[0];
    if (candidate === undefined) continue;
    if (token.rest === '' && token.raw.includes('/')) {
      // `@repo/` 처럼 값이 비어 있으면 전송을 막는다.
      resolutions.push({ ok: false, token, reason: 'unknown', candidates: matches });
      continue;
    }
    resolutions.push({
      ok: true,
      token,
      candidate,
      resolvedPath: candidate.kind === 'path' || candidate.kind === 'worktree' || candidate.kind === 'project' ? candidate.detail : null,
    });
  }
  return {
    ok: resolutions.every((resolution) => resolution.ok),
    unresolved: resolutions.filter((resolution) => !resolution.ok).map((resolution) => resolution.token),
    resolutions,
  };
}

/** 해석된 참조 하나가 프롬프트에 남기는 정보. */
export type RefPromptFacts = {
  /** 메시지에 남은 토큰 원문(`@` 포함). */
  token: string;
  /** 레포지토리 표시 이름(스냅샷의 프로젝트). 모르면 `-`. */
  repo: string;
  /** 브랜치 이름. 모르면 `-`. */
  branch: string;
  /** 워크트리 id. 모르면 `-`. */
  worktree: string;
  /** 절대 경로. */
  path: string;
};

/**
 * 해석된 참조를 사람이 읽는 프롬프트 정보로 바꾼다. 미해석 참조는 버린다.
 * 후보(`RefCandidate`)에는 레포·브랜치·워크트리 id 가 없으므로 Orca 스냅샷에서 경로로 찾아 채운다.
 * 스냅샷을 주지 않으면 아는 값만 채우고 나머지는 `-` 로 둔다(해석 자체는 스냅샷 없이도 동작한다).
 */
export function refPromptFacts(resolutions: RefResolution[], snapshot?: OrcaSnapshot): RefPromptFacts[] {
  const facts: RefPromptFacts[] = [];
  for (const resolution of resolutions) {
    if (!resolution.ok) continue;
    const path = resolution.resolvedPath ?? resolution.candidate.detail;
    const located = locate(snapshot, path);
    const branch =
      located.worktree !== null
        ? branchName(located.worktree.branch)
        : resolution.candidate.kind === 'branch'
          ? resolution.candidate.label
          : null;
    const repo = located.project?.displayName ?? located.worktree?.repoId ?? null;
    facts.push({
      token: `@${resolution.token.raw}`,
      repo: repo === null || repo === '' ? UNKNOWN : repo,
      branch: branch === null || branch === '' ? UNKNOWN : branch,
      worktree: located.worktree?.id ?? UNKNOWN,
      path,
    });
  }
  return facts;
}

/**
 * 프롬프트 뒤에 붙는 `[참조]` 블록. 해석된 참조가 없으면 빈 문자열이다.
 * 형식: `@handle → worktree=<id> repo=<이름> branch=<브랜치> path=<절대 경로>`
 */
export function refContextBlock(resolutions: RefResolution[], snapshot?: OrcaSnapshot): string {
  const facts = refPromptFacts(resolutions, snapshot);
  if (facts.length === 0) return '';
  const lines = facts.map(
    (fact) => `${fact.token} → worktree=${fact.worktree} repo=${fact.repo} branch=${fact.branch} path=${fact.path}`,
  );
  return ['[참조]', ...lines].join('\n');
}

/**
 * 사용자가 쓴 본문 뒤에 참조 블록을 붙인다. 토큰 텍스트는 지우지 않는다(사용자가 무엇을 가리켰는지 읽을 수 있어야 한다).
 * 해석된 참조가 0개면 본문을 그대로 돌려준다.
 */
export function promptWithRefs(text: string, resolutions: RefResolution[], snapshot?: OrcaSnapshot): string {
  const block = refContextBlock(resolutions, snapshot);
  return block === '' ? text : `${text}\n\n${block}`;
}

function locate(
  snapshot: OrcaSnapshot | undefined,
  path: string,
): { worktree: OrcaWorktree | null; project: OrcaProject | null } {
  if (snapshot === undefined) return { worktree: null, project: null };
  let worktree: OrcaWorktree | null = null;
  for (const item of snapshot.worktrees) {
    if (!encloses(item.path, path)) continue;
    if (worktree === null || normalizePath(item.path).length > normalizePath(worktree.path).length) worktree = item;
  }
  let project: OrcaProject | null = null;
  for (const item of snapshot.projects) {
    if (!encloses(item.path, path)) continue;
    if (project === null || normalizePath(item.path).length > normalizePath(project.path).length) project = item;
  }
  if (project === null) {
    const projectId = worktree?.projectId;
    if (projectId !== undefined) {
      project = snapshot.projects.find((item) => item.id === projectId) ?? null;
    }
  }
  return { worktree, project };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** 경로(또는 그 하위 경로)가 root 안에 있는지. 접두사만 같은 `C:/wt/web2` 는 제외한다. */
function encloses(root: string, path: string): boolean {
  const base = normalizePath(root);
  if (base === '') return false;
  const target = normalizePath(path);
  return target === base || target.startsWith(`${base}/`);
}

function branchName(branch: string): string {
  return branch.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : branch;
}
