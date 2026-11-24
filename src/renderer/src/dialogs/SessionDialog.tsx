/**
 * 새 Pi 세션 다이얼로그. 목업 `newSessionDialog`(mock/index.html:2300-2330) 의 필드를 계약에 맞춘다.
 * 제목·모델·첫 프롬프트(선택) → `pi:start`. 대상이 허브(그룹 폴더)면 `worktreeId: null` 이다.
 * 대상 워크트리는 현재 선택에서 온다 — 워크트리가 선택돼 있으면 그 워크트리, 아니면 허브 세션.
 */
import { useState, type ReactElement } from 'react';
import type { GraphPiApi, IpcChannel, IpcRequest, IpcResult } from '../../../shared/contract/index.ts';
import { MODELS } from '../../../shared/contract/index.ts';
import { useApp, useSelectedGroup, useVisibleWorktrees } from '../state/hooks.ts';

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

export function SessionDialog(props: { onClose: () => void }): ReactElement {
  const { selection, orca } = useApp();
  const group = useSelectedGroup();
  const worktrees = useVisibleWorktrees();
  const selectedWorktreeId = selection.kind === 'worktree' ? selection.worktreeId : null;
  const worktree =
    selectedWorktreeId === null
      ? null
      : (worktrees.find((entry) => entry.id === selectedWorktreeId) ?? null);
  const [title, setTitle] = useState('');
  const [model, setModel] = useState<string>(MODELS[0] ?? '');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const offline = orca.reachable === false;

  const submit = async (): Promise<void> => {
    if (group === null) {
      setError('그룹을 먼저 선택하세요.');
      return;
    }
    if (offline) {
      setError('Orca 연결이 없어 세션을 시작할 수 없습니다.');
      return;
    }

    setBusy(true);
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedPrompt = prompt.trim();
    const result = await invoke('pi:start', {
      groupId: group.id,
      // 허브 세션은 그룹 폴더에서 시작하므로 worktreeId 가 null 이다(계약 StartSessionRequest).
      worktreeId: worktree === null ? null : worktree.id,
      title: trimmedTitle === '' ? '새 세션' : trimmedTitle,
      model: model === '' ? null : model,
      prompt: trimmedPrompt === '' ? null : trimmedPrompt,
    });
    setBusy(false);

    if (result === null) {
      setError('요청을 보내지 못했습니다. 앱 연결을 확인하세요.');
      return;
    }
    if (!result.ok) {
      setError(result.error === null ? '세션을 시작하지 못했습니다.' : result.error);
      return;
    }
    props.onClose();
  };

  return (
    <>
      <div className="dlg-body">
        <p className="muted">
          대상: {worktree === null ? '허브 세션 (그룹 폴더)' : `${worktree.repo} · ${worktree.name}`}
        </p>
        <div className="form">
          <label className="field">
            <span className="lbl">제목</span>
            <input
              value={title}
              placeholder="비우면 새 세션"
              onChange={(event) => {
                setTitle(event.target.value);
                setError(null);
              }}
            />
          </label>

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
            <span className="lbl">첫 프롬프트 (선택)</span>
            <textarea
              rows={3}
              value={prompt}
              placeholder="무엇을 할까요?"
              onChange={(event) => {
                setPrompt(event.target.value);
              }}
            />
          </label>

          {error === null ? null : (
            <label className="field err">
              <span className="err-txt">{error}</span>
            </label>
          )}
        </div>
        {offline ? <p className="muted">Orca 연결 없음 · 세션을 시작할 수 없습니다.</p> : null}
      </div>

      <div className="dlg-actions">
        <button className="btn" type="button" disabled={busy} onClick={props.onClose}>
          취소
        </button>
        <button
          className="btn primary"
          type="button"
          disabled={busy || offline}
          onClick={() => {
            void submit();
          }}
        >
          {busy ? '시작 중…' : '시작'}
        </button>
      </div>
    </>
  );
}
