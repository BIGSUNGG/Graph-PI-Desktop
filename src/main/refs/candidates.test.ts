/**
 * 참조 후보 회귀 테스트(SPEC 588 — 파일·폴더 자동완성).
 * 고정하는 동작:
 * - `rest` 가 없으면 기존처럼 프로젝트·워크트리·브랜치·1단계 폴더 후보만 만든다
 * - `rest` 가 경로 접두어면 `head` 가 가리키는 경로 아래 한 단계 더 깊은 파일·폴더를 만든다
 * - 후보는 head 당 20개로 제한하고, 숨김·`node_modules`·경로 이탈은 조용히 뺀다(예외 없음)
 * 실행: `node --test src/main/refs/candidates.test.ts`
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EMPTY_ORCA_SNAPSHOT } from '../../shared/contract/orca.ts';
import type { OrcaSnapshot, OrcaWorktree } from '../../shared/contract/orca.ts';
import { buildCandidates } from './candidates.ts';

const PROJECT = 'C:/Projects/graph-pi';

/** 그룹 워크트리 하나와 프로젝트 하나를 가진 스냅샷. 워크트리 경로만 실제 디스크를 읽는다. */
function snapshot(worktreePath: string): OrcaSnapshot {
  const worktree: OrcaWorktree = {
    id: 'wt_1',
    displayName: 'wt-1',
    branch: 'feature/src',
    path: worktreePath,
    repoId: 'repo-1',
    parentWorktreeId: null,
  };
  return {
    ...EMPTY_ORCA_SNAPSHOT,
    reachable: true,
    fetchedAt: '2026-11-25T00:00:00.000Z',
    projects: [{ id: 'proj-1', displayName: 'Graph-PI', path: PROJECT }],
    worktrees: [worktree],
  };
}

async function withWorktreeRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'refs-candidates-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('rest 가 없으면 기존처럼 1단계 폴더 후보만 만든다', async () => {
  await withWorktreeRoot(async (root) => {
    await mkdir(join(root, 'src'));
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'package.json'), '{}');

    const list = await buildCandidates({ snapshot: snapshot(root), groupRoots: [root], head: '' });
    const handles = list.map((candidate) => candidate.handle);
    assert.ok(handles.includes('graph-pi'));
    assert.ok(handles.includes('wt-1'));
    assert.ok(handles.includes('feature-src'));

    // 경로 후보는 1단계 폴더뿐이고 handle 은 폴더 이름이다(기존 동작 유지).
    const paths = list.filter((candidate) => candidate.kind === 'path');
    assert.deepEqual(paths.map((candidate) => candidate.handle).sort(), ['docs', 'src']);
    assert.deepEqual(paths.map((candidate) => candidate.detail).sort(), [
      join(root, 'docs'),
      join(root, 'src'),
    ]);
  });
});

test('head 접두어는 대소문자를 가리지 않고 기존 후보를 걸러낸다', async () => {
  await withWorktreeRoot(async (root) => {
    await mkdir(join(root, 'src'));

    const list = await buildCandidates({
      snapshot: snapshot(root),
      groupRoots: [root],
      head: 'WT',
      rest: '',
    });
    assert.deepEqual(
      list.map((candidate) => `${candidate.kind}:${candidate.handle}`),
      ['worktree:wt-1'],
    );
  });
});

test('rest 경로 접두어는 워크트리 아래 파일·폴더 후보를 한 단계 더 만든다', async () => {
  await withWorktreeRoot(async (root) => {
    await mkdir(join(root, 'src', 'components'), { recursive: true });
    await writeFile(join(root, 'src', 'app.ts'), '');

    const list = await buildCandidates({
      snapshot: snapshot(root),
      groupRoots: [root],
      head: 'wt-1',
      rest: 'src/',
    });

    // handle 은 `워크트리handle/상대경로` 라 토큰 원문과 그대로 맞출 수 있다(SPEC 588).
    assert.deepEqual(list.map((candidate) => candidate.handle), [
      'wt-1/src/app.ts',
      'wt-1/src/components',
    ]);
    assert.deepEqual(list.map((candidate) => candidate.kind), ['path', 'path']);
    // 파일은 이름 그대로, 폴더는 `/` 로 구분해 보여준다.
    assert.equal(list[0]?.label, 'app.ts');
    assert.equal(list[0]?.detail, join(root, 'src', 'app.ts'));
    assert.equal(list[1]?.label, 'components/');
    assert.equal(list[1]?.detail, join(root, 'src', 'components'));
  });
});

test('입력 중인 이름 접두어로 걸러내고 Windows 구분자도 받는다', async () => {
  await withWorktreeRoot(async (root) => {
    await mkdir(join(root, 'src', 'components'), { recursive: true });
    await mkdir(join(root, 'src', 'styles'), { recursive: true });
    await writeFile(join(root, 'src', 'app.ts'), '');
    await writeFile(join(root, 'package.json'), '{}');

    const filtered = await buildCandidates({
      snapshot: snapshot(root),
      groupRoots: [root],
      head: 'wt-1',
      rest: 'src/co',
    });
    assert.deepEqual(filtered.map((candidate) => candidate.handle), ['wt-1/src/components']);

    // `\` 로 입력해도 같은 폴더를 본다.
    const backslash = await buildCandidates({
      snapshot: snapshot(root),
      groupRoots: [root],
      head: 'wt-1',
      rest: 'src\\co',
    });
    assert.deepEqual(backslash.map((candidate) => candidate.handle), ['wt-1/src/components']);

    // `/` 없이 워크트리 바로 아래 파일 이름을 입력해도 파일 후보가 나온다.
    const atRoot = await buildCandidates({
      snapshot: snapshot(root),
      groupRoots: [root],
      head: 'wt-1',
      rest: 'pack',
    });
    assert.deepEqual(atRoot.map((candidate) => candidate.handle), ['wt-1/package.json']);
  });
});

test('경로 후보는 head 당 20개로 제한하고 숨김·node_modules 는 뺀다', async () => {
  await withWorktreeRoot(async (root) => {
    for (let index = 1; index <= 25; index += 1) {
      const name = `f${String(index).padStart(2, '0')}.txt`;
      await writeFile(join(root, name), '');
    }
    await writeFile(join(root, '.env'), '');
    await mkdir(join(root, 'node_modules', 'left-pad'), { recursive: true });

    const list = await buildCandidates({
      snapshot: snapshot(root),
      groupRoots: [root],
      head: 'wt-1',
      rest: 'f',
    });
    assert.equal(list.length, 20);
    assert.equal(list[0]?.handle, 'wt-1/f01.txt');
    assert.equal(list[19]?.handle, 'wt-1/f20.txt');
    assert.ok(!list.some((candidate) => candidate.handle.includes('.env')));
    assert.ok(!list.some((candidate) => candidate.handle.includes('node_modules')));

    // 숨김 이름은 경로 접두어로도 열리지 않는다.
    const hidden = await buildCandidates({
      snapshot: snapshot(root),
      groupRoots: [root],
      head: 'wt-1',
      rest: '.',
    });
    assert.deepEqual(hidden, []);
  });
});

test('경로 이탈·없는 폴더·모르는 head 는 예외 없이 빈 목록이 된다', async () => {
  await withWorktreeRoot(async (root) => {
    await mkdir(join(root, 'src', 'nested'), { recursive: true });

    const cases: { head: string; rest: string }[] = [
      { head: 'wt-1', rest: '../etc' },
      { head: 'wt-1', rest: 'src/../../outside' },
      { head: 'wt-1', rest: '/etc' },
      { head: 'wt-1', rest: 'C:/Windows' },
      { head: 'wt-1', rest: 'missing/x' },
      // 프로젝트 경로는 이 테스트 환경에 없으므로 읽기 실패가 조용히 빈 목록이 된다.
      { head: 'graph-pi', rest: 'src/' },
      { head: 'nope', rest: 'src/' },
    ];

    for (const input of cases) {
      const list = await buildCandidates({
        snapshot: snapshot(root),
        groupRoots: [root],
        head: input.head,
        rest: input.rest,
      });
      assert.deepEqual(list, [], `${input.head} ${input.rest}`);
    }
  });
});
