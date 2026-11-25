import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { OrcaSnapshot } from '../../shared/contract/orca.ts';
import type { RefCandidate } from '../../shared/contract/refs.ts';

/** 한 head 에서 보여줄 경로 후보 상한 — 폴더가 커도 자동완성 목록이 넘치지 않게 한다(SPEC 588). */
const MAX_PATH_CANDIDATES = 20;

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
 *
 * `rest`(토큰의 첫 `/` 뒤 나머지)가 있으면 그 값을 경로 접두어로 써서 `head` 가 가리키는
 * 경로 아래의 파일·폴더를 한 단계 더 보여준다(SPEC 588 파일·폴더 자동완성).
 * 경로 후보의 handle 은 `워크트리handle/상대경로` 라 토큰 원문과 그대로 맞출 수 있다.
 */
export async function buildCandidates(input: {
  snapshot: OrcaSnapshot;
  groupRoots: string[];
  head: string;
  /** 토큰의 첫 `/` 뒤 나머지. 없으면 기존처럼 1단계 후보만 만든다. */
  rest?: string;
}): Promise<RefCandidate[]> {
  const base: RefCandidate[] = [];
  for (const project of input.snapshot.projects) {
    base.push({
      kind: 'project',
      handle: toHandle(basename(project.path)),
      label: project.displayName,
      detail: project.path,
    });
  }
  for (const worktree of input.snapshot.worktrees) {
    if (!input.groupRoots.includes(worktree.path)) continue;
    base.push({
      kind: 'worktree',
      handle: toHandle(worktree.displayName),
      label: worktree.displayName,
      detail: worktree.path,
    });
    if (worktree.branch !== null) {
      base.push({
        kind: 'branch',
        handle: toHandle(worktree.branch),
        label: worktree.branch,
        detail: worktree.path,
      });
    }
    for (const entry of await listEntries(worktree.path)) {
      base.push({ kind: 'path', handle: entry, label: entry, detail: join(worktree.path, entry) });
    }
  }

  const head = input.head.toLowerCase();
  const rest = input.rest ?? '';
  // 경로 접두어가 있으면 그 아래 한 단계만 본다 — 상위 후보(@워크트리 자체)는 다시 보여주지 않는다.
  if (rest !== '') return pathCandidates(base, head, rest);

  return unique(base.filter((candidate) => head === '' || candidate.handle.startsWith(head)));
}

/**
 * `head` 와 정확히 맞는 워크트리·프로젝트·브랜치 후보의 경로 아래에서, 입력 접두어보다
 * 한 단계 깊은 파일·폴더 후보를 만든다. 읽을 수 없는 폴더는 조용히 빠지고 예외를 던지지 않는다.
 */
async function pathCandidates(
  base: readonly RefCandidate[],
  head: string,
  rest: string,
): Promise<RefCandidate[]> {
  const prefix = parsePathPrefix(rest);
  // 절대 경로·상위 이동(`..`)은 워크트리 밖을 가리키므로 후보를 만들지 않는다.
  if (prefix === null) return [];

  const suggestions: RefCandidate[] = [];
  for (const candidate of base) {
    if (candidate.handle.toLowerCase() !== head) continue;
    if (!isPathRoot(candidate.kind)) continue;
    for (const suggestion of await listSuggestions(candidate, prefix)) {
      suggestions.push(suggestion);
    }
  }
  return unique(suggestions);
}

/** 경로 후보의 기준이 될 수 있는 후보 — `detail` 이 실제 디렉터리 경로인 것만 쓴다. */
function isPathRoot(kind: RefCandidate['kind']): boolean {
  return kind === 'worktree' || kind === 'project' || kind === 'branch';
}

type PathPrefix = {
  /** 사용자가 이미 입력한 폴더 조각. */
  dirs: string[];
  /** 마지막으로 입력 중인 이름 접두어(경로가 `/` 로 끝나면 빈 문자열). */
  filter: string;
};

/** 토큰의 `rest` 를 폴더 조각과 이름 접두어로 나눈다. 워크트리 밖을 가리키면 null 이다. */
function parsePathPrefix(rest: string): PathPrefix | null {
  // Windows 입력은 `\` 로도 들어온다 — 구분자를 `/` 로 맞춘다.
  const normalized = rest.replace(/\\/gu, '/');
  // 절대 경로·드라이브 표기는 워크트리 밖을 가리킨다.
  if (normalized.startsWith('/') || /^[a-zA-Z]:/u.test(normalized)) return null;

  const endsWithSlash = normalized.endsWith('/');
  const segments = normalized.split('/').filter((segment) => segment !== '');
  // `/` 로 끝나면 모든 조각이 폴더이고, 아니면 마지막 조각이 입력 중인 이름이다.
  const dirCount = endsWithSlash ? segments.length : Math.max(segments.length - 1, 0);

  const dirs: string[] = [];
  for (let index = 0; index < dirCount; index += 1) {
    const segment = segments[index];
    if (segment === undefined) return null;
    if (!isSafeSegment(segment)) return null;
    dirs.push(segment);
  }

  if (endsWithSlash) return { dirs, filter: '' };
  const last = segments[segments.length - 1] ?? '';
  if (!isSafeSegment(last)) return null;
  return { dirs, filter: last };
}

/** 경로를 벗어나거나 후보로 보여주지 않는 조각(상위 이동·숨김·구분자·드라이브 문자)을 막는다. */
function isSafeSegment(segment: string): boolean {
  if (segment === '.' || segment === '..') return false;
  // 숨김 폴더·파일은 1단계 목록과 마찬가지로 자동완성에 내보이지 않는다.
  if (segment.startsWith('.')) return false;
  return !/[\\/:*?"<>|]/u.test(segment);
}

/** 숨김 파일·`node_modules` 는 자동완성에서 뺀다 — 1단계 폴더 목록과 같은 규칙이다. */
function isVisibleName(name: string): boolean {
  return !name.startsWith('.') && name !== 'node_modules';
}

/** 이름순 비교 — readdir 순서는 플랫폼마다 달라 이름순으로 고정한다. */
function byName(left: { name: string }, right: { name: string }): number {
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
}

/** `prefix` 폴더 안에서 이름 접두어가 맞는 파일·폴더를 최대 {@link MAX_PATH_CANDIDATES}개 돌려준다. */
async function listSuggestions(
  root: RefCandidate,
  prefix: PathPrefix,
): Promise<RefCandidate[]> {
  const dir = join(root.detail, ...prefix.dirs);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const needle = prefix.filter.toLowerCase();
    const matched = entries
      .filter((entry) => isVisibleName(entry.name) && (entry.isFile() || entry.isDirectory()))
      .filter((entry) => entry.name.toLowerCase().startsWith(needle))
      .sort(byName)
      .slice(0, MAX_PATH_CANDIDATES);

    const suggestions: RefCandidate[] = matched.map((entry) => {
      const folder = entry.isDirectory();
      return {
        kind: 'path',
        handle: `${root.handle}/${[...prefix.dirs, entry.name].join('/')}`,
        // 폴더는 이름 뒤 `/` 로 구분한다 — 선택 후 이어서 입력하면 한 단계 더 열린다.
        label: folder ? `${entry.name}/` : entry.name,
        detail: join(dir, entry.name),
      };
    });
    return suggestions;
  } catch {
    // 없는 폴더·읽을 수 없는 폴더는 후보에서 조용히 빠진다 — 자동완성은 실패해도 입력을 막지 않는다.
    return [];
  }
}

function unique(candidates: readonly RefCandidate[]): RefCandidate[] {
  const seen = new Set<string>();
  const result: RefCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.handle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

async function listEntries(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && isVisibleName(entry.name))
      .map((entry) => entry.name);
  } catch {
    // 접근 불가한 워크트리는 후보에서 조용히 빠진다.
    return [];
  }
}
