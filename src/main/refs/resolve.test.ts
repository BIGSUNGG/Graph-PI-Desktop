import assert from 'node:assert/strict';
import test from 'node:test';
import type { RefCandidate } from '../../shared/contract/refs.ts';
import { EMPTY_ORCA_SNAPSHOT } from '../../shared/contract/orca.ts';
import type { OrcaProject, OrcaSnapshot, OrcaWorktree } from '../../shared/contract/orca.ts';
import { tokenizeRefs } from '../../shared/refs/tokenize.ts';
import { promptWithRefs, refContextBlock, refPromptFacts, resolveTokens } from './resolve.ts';

const WT = 'C:/Projects/x/wt-1';

const candidates: RefCandidate[] = [
  { kind: 'worktree', handle: 'worktree-1', label: 'worktree-1', detail: WT },
  { kind: 'branch', handle: 'feature-x', label: 'feature/x', detail: WT },
  { kind: 'path', handle: 'src', label: 'src', detail: `${WT}/src` },
  { kind: 'project', handle: 'graph-pi', label: 'Graph-PI', detail: 'C:/Projects/x' },
];

function worktree(partial: Partial<OrcaWorktree> & { id: string }): OrcaWorktree {
  const base: OrcaWorktree = {
    id: partial.id,
    displayName: partial.displayName ?? partial.id,
    branch: partial.branch ?? 'main',
    path: partial.path ?? `C:/wt/${partial.id}`,
    repoId: partial.repoId ?? 'repo-1',
    parentWorktreeId: partial.parentWorktreeId ?? null,
  };
  if (partial.projectId !== undefined) base.projectId = partial.projectId;
  if (partial.isMainWorktree !== undefined) base.isMainWorktree = partial.isMainWorktree;
  return base;
}

function project(partial: Partial<OrcaProject> & { id: string }): OrcaProject {
  return {
    id: partial.id,
    displayName: partial.displayName ?? partial.id,
    path: partial.path ?? `C:/Projects/${partial.id}`,
  };
}

const snapshot: OrcaSnapshot = {
  ...EMPTY_ORCA_SNAPSHOT,
  reachable: true,
  fetchedAt: '2026-11-24T00:00:00.000Z',
  worktrees: [
    worktree({ id: 'wt_main', displayName: 'Graph-PI', branch: 'main', path: 'C:/Projects/x', projectId: 'proj-1' }),
    worktree({ id: 'wt_123', displayName: 'worktree-1', branch: 'feature/x', path: WT, projectId: 'proj-1' }),
  ],
  projects: [project({ id: 'proj-1', displayName: 'Graph-PI', path: 'C:/Projects/x' })],
};

test('해석된 참조가 없으면 promptWithRefs 는 원문을 그대로 돌려준다', () => {
  const text = '지금 상황 요약해줘';
  const validation = resolveTokens(tokenizeRefs(text), candidates);
  assert.deepEqual(validation.resolutions, []);
  assert.equal(refContextBlock(validation.resolutions, snapshot), '');
  assert.equal(promptWithRefs(text, validation.resolutions, snapshot), text);
});

test('해석된 참조 블록은 레포·브랜치·워크트리 id·절대 경로를 모두 담는다', () => {
  const text = '@worktree-1/src/app.ts 고쳐줘';
  const validation = resolveTokens(tokenizeRefs(text), candidates);
  assert.equal(validation.ok, true);
  assert.deepEqual(refContextBlock(validation.resolutions, snapshot).split('\n'), [
    '[참조]',
    '@worktree-1/src/app.ts → worktree=wt_123 repo=Graph-PI branch=feature/x path=C:/Projects/x/wt-1',
  ]);
  assert.equal(
    promptWithRefs(text, validation.resolutions, snapshot),
    `${text}\n\n[참조]\n@worktree-1/src/app.ts → worktree=wt_123 repo=Graph-PI branch=feature/x path=C:/Projects/x/wt-1`,
  );
});

test('미해석 참조는 블록에 넣지 않고 본문은 그대로 둔다', () => {
  const text = '@없는것/값 그리고 @worktree-1 봐줘';
  const validation = resolveTokens(tokenizeRefs(text), candidates);
  assert.equal(validation.ok, false);
  assert.equal(validation.unresolved.length, 1);
  const block = refContextBlock(validation.resolutions, snapshot);
  assert.ok(!block.includes('없는것'));
  assert.deepEqual(block.split('\n'), [
    '[참조]',
    '@worktree-1 → worktree=wt_123 repo=Graph-PI branch=feature/x path=C:/Projects/x/wt-1',
  ]);
  const prompt = promptWithRefs(text, validation.resolutions, snapshot);
  assert.ok(prompt.startsWith(`${text}\n\n`));
});

test('여러 참조는 입력 순서를 유지한다', () => {
  const text = '@worktree-1 @feature-x @graph-pi 순서대로';
  const validation = resolveTokens(tokenizeRefs(text), candidates);
  assert.equal(validation.ok, true);
  assert.deepEqual(
    refPromptFacts(validation.resolutions, snapshot).map((fact) => fact.token),
    ['@worktree-1', '@feature-x', '@graph-pi'],
  );
  assert.deepEqual(refContextBlock(validation.resolutions, snapshot).split('\n'), [
    '[참조]',
    '@worktree-1 → worktree=wt_123 repo=Graph-PI branch=feature/x path=C:/Projects/x/wt-1',
    '@feature-x → worktree=wt_123 repo=Graph-PI branch=feature/x path=C:/Projects/x/wt-1',
    '@graph-pi → worktree=wt_main repo=Graph-PI branch=main path=C:/Projects/x',
  ]);
});

test('경로 참조는 상위 워크트리에서 레포·브랜치·워크트리 id 를 찾는다', () => {
  const text = '@src/lib/main.ts 읽어줘';
  const validation = resolveTokens(tokenizeRefs(text), candidates);
  assert.equal(validation.ok, true);
  assert.deepEqual(refPromptFacts(validation.resolutions, snapshot), [
    {
      token: '@src/lib/main.ts',
      repo: 'Graph-PI',
      branch: 'feature/x',
      worktree: 'wt_123',
      path: 'C:/Projects/x/wt-1/src',
    },
  ]);
});

test('스냅샷이 없으면 아는 값만 채우고 모르는 값은 - 로 둔다', () => {
  const validation = resolveTokens(tokenizeRefs('@worktree-1 봐줘'), candidates);
  assert.equal(validation.ok, true);
  assert.deepEqual(refPromptFacts(validation.resolutions), [
    { token: '@worktree-1', repo: '-', branch: '-', worktree: '-', path: 'C:/Projects/x/wt-1' },
  ]);
});

test('브랜치 참조는 워크트리를 못 찾아도 브랜치 이름을 남긴다', () => {
  const validation = resolveTokens(tokenizeRefs('@feature-x 봐줘'), candidates);
  assert.equal(validation.ok, true);
  assert.deepEqual(refPromptFacts(validation.resolutions, EMPTY_ORCA_SNAPSHOT), [
    { token: '@feature-x', repo: '-', branch: 'feature/x', worktree: '-', path: 'C:/Projects/x/wt-1' },
  ]);
});
