/**
 * 워크트리 추가 다이얼로그. 목업 `worktreeDialog` 의 "새 워크트리" 탭(mock/index.html:2537-2639)을 옮겼다.
 * 저장소·이름·브랜치·베이스·부모 워크트리·모델 → `worktree:create`.
 * 목업의 "기존 불러오기" 탭은 계약에 해당 IPC 가 없어 넣지 않는다.
 * 대신 목업 인스펙터의 `삭제`(mock/index.html:1778, 2663-2690)를 이 다이얼로그에 모아,
 * 워크트리 삭제는 항상 확인 다이얼로그(`worktree-delete`)를 거치게 한다.
 */
import { useState, type ReactElement } from 'react';
import type { GraphPiApi, IpcChannel, IpcRequest, IpcResult } from '../../../shared/contract/index.ts';
import { MODELS } from '../../../shared/contract/index.ts';
import { useApp, useSelectedGroup, useVisibleWorktrees } from '../state/hooks.ts';
// 순환 import 처럼 보이지만, 이 함수는 클릭 시점에만 쓰인다(모듈 평가 중에는 접근하지 않는다).
import { openWorktreeDeleteDialog } from './DialogHost.tsx';

/** `window.api` 는 preload 없이 렌더되는 단위 환경에서 undefined 일 수 있다. */
function readApi(): GraphPiApi | null {
  if (typeof window === 'undefined') return null;
  // SAFETY: Window.api 는 필수 필드로 선언돼 있어 부재를 타입으로 표현할 수 없다. 런타임에만 확인한다.
  const candidate: unknown = (window as unknown as { api?: GraphPiApi }).api;
  if (typeof candidate !== 'object' || candidate === null) return null;
  return candidate as GraphPiApi;
}

async function invoke<K extends IpcChannel>(
  channel: K,
  request: IpcRequest<K>,
): Promise<IpcResult<K> | null> {
  const client = readApi();
  if (client === null) return null;
  try {
    return await client.invoke(channel, request);
  } catch {
    // IPC 실패는 다이얼로그 안 오류 문구로 바꾼다.
    return null;
  }
}

export function WorktreeDialog(props: { onClose: () => void }): ReactElement {
  const { orca, selection } = useApp();
  const group = useSelectedGroup();
  const worktrees = useVisibleWorktrees();
  const [repo, setRepo] = useState<string>(orca.projects[0]?.id ?? '');
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [base, setBase] = useState('main');
  const [parentWorktreeId, setParentWorktreeId] = useState('');
  const [model, setModel] = useState<string>(MODELS[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (group === null) {
      setError('그룹을 먼저 선택하세요.');
      return;
    }
    const trimmedName = name.trim();
    if (trimmedName === '') {
      setError('이름을 입력하세요.');
      return;
    }
    if (repo === '') {
      setError('레포지토리를 선택하세요.');
      return;
    }

    setBusy(true);
    setError(null);
    const trimmedBase = base.trim();
    const result = await invoke('worktree:create', {
      groupId: group.id,
      repo,
      name: trimmedName,
      // 비우면 목업과 같이 `feature/<이름>` 을 쓴다(mock/index.html:2618).
      branch: branch.trim() === '' ? `feature/${trimmedName}` : branch.trim(),
      base: trimmedBase === '' ? 'main' : trimmedBase,
      parentWorktreeId: parentWorktreeId === '' ? null : parentWorktreeId,
      model: model === '' ? null : model,
    });
    setBusy(false);

    if (result === null) {
      setError('요청을 보내지 못했습니다. 앱 연결을 확인하세요.');
      return;
    }
    if (!result.ok) {
      setError(result.error === null ? '워크트리를 만들지 못했습니다.' : result.error);
      return;
    }
    props.onClose();
  };

  return (
    <>
      <div className="dlg-body">
        {group === null ? (
          <p className="muted">그룹이 없습니다. 먼저 그룹을 만드세요.</p>
        ) : (
          <p className="muted">{group.name} 그룹에 추가합니다.</p>
        )}
        <div className="form">
          <div className="grid2">
            <label className="field">
              <span className="lbl">레포지토리</span>
              <select
                value={repo}
                onChange={(event) => {
                  setRepo(event.target.value);
                  setError(null);
                }}
              >
                {orca.projects.length === 0 ? <option value="">프로젝트 없음</option> : null}
                {orca.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.displayName} · {project.path}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="lbl">이름</span>
              <input
                value={name}
                placeholder="예: billing-api"
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
              />
            </label>
          </div>

          <div className="grid2">
            <label className="field">
              <span className="lbl">브랜치</span>
              <input
                value={branch}
                placeholder={'비우면 feature/<이름>'}
                onChange={(event) => {
                  setBranch(event.target.value);
                }}
              />
            </label>
            <label className="field">
              <span className="lbl">베이스 브랜치</span>
              <input
                value={base}
                onChange={(event) => {
                  setBase(event.target.value);
                }}
              />
            </label>
          </div>

          <div className="grid2">
            <label className="field">
              <span className="lbl">모델</span>
              <select
                value={model}
                onChange={(event) => {
                  setModel(event.target.value);
                }}
              >
                {MODELS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="lbl">부모 워크트리</span>
              <select
                value={parentWorktreeId}
                onChange={(event) => {
                  setParentWorktreeId(event.target.value);
                }}
              >
                <option value="">없음 (루트로 추가)</option>
                {worktrees.map((worktree) => (
                  <option key={worktree.id} value={worktree.id}>
                    {worktree.name} · {worktree.branch}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error === null ? null : (
            <div className="field err">
              <span className="err-txt">{error}</span>
            </div>
          )}
        </div>

        <div className="card-h">기존 워크트리 삭제</div>
        {worktrees.length === 0 ? (
          <p className="muted">워크트리 없음</p>
        ) : (
          <div className="dlg-list">
            {worktrees.map((worktree) => {
              const isSelected =
                selection.kind === 'worktree' && selection.worktreeId === worktree.id;
              return (
                <div className="dlg-row" key={worktree.id}>
                  <span className="grow">
                    {worktree.name} · {worktree.branch}
                  </span>
                  {isSelected ? <span className="pill">선택</span> : null}
                  <button
                    className="btn danger"
                    type="button"
                    disabled={busy}
                    title={`${worktree.name} 삭제 (확인 필요)`}
                    onClick={() => {
                      // 확인 다이얼로그가 열리고, 실제 삭제는 그 창의 `삭제` 클릭 뒤에만 실행된다.
                      openWorktreeDeleteDialog(worktree.id);
                    }}
                  >
                    삭제
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="dlg-actions">
        <button className="btn" type="button" disabled={busy} onClick={props.onClose}>
          취소
        </button>
        <button
          className="btn primary"
          type="button"
          disabled={busy}
          onClick={() => {
            void submit();
          }}
        >
          {busy ? '추가 중…' : '추가'}
        </button>
      </div>
    </>
  );
}
