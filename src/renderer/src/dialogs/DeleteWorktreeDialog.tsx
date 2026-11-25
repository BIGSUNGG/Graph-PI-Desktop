/**
 * 워크트리 삭제 확인 다이얼로그(목업 mock/index.html:2243-2261, 2663-2690).
 * `삭제` 버튼을 **명시적으로 눌렀을 때만** `worktree:remove` 를 호출한다.
 * 배경 클릭·Esc·취소로 닫히면 아무것도 지우지 않는다. 성공했을 때만 스스로 닫힌다.
 */
import { useState, type ReactElement } from 'react';
import type { GraphPiApi, IpcChannel, IpcRequest, IpcResult } from '../../../shared/contract/index.ts';
import { useSelectedGroup, useVisibleWorktrees } from '../state/hooks.ts';

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

export function DeleteWorktreeDialog(props: {
  worktreeId: string;
  onClose: () => void;
}): ReactElement {
  const group = useSelectedGroup();
  const worktrees = useVisibleWorktrees();
  const worktree = worktrees.find((entry) => entry.id === props.worktreeId) ?? null;
  const groupId = group === null ? null : group.id;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** 확인 클릭 = 이 함수 실행. 다른 경로(배경·Esc·취소)는 삭제를 부르지 않는다. */
  const confirmDelete = async (): Promise<void> => {
    if (groupId === null || worktree === null) {
      setError('삭제할 워크트리를 찾지 못했습니다.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await invoke('worktree:remove', {
      groupId,
      worktreeId: worktree.id,
      // 계약 필드지만 Orca 어댑터가 아직 쓰지 않는다 → 기본값 false(세션 기록은 남긴다).
      deleteRunningSessions: false,
    });
    setBusy(false);
    if (result === null) {
      setError('요청을 보내지 못했습니다. 앱 연결을 확인하세요.');
      return;
    }
    if (!result.ok) {
      const message = result.error;
      if (message === null) {
        setError('워크트리를 삭제하지 못했습니다.');
      } else {
        setError(message);
      }
      return;
    }
    props.onClose();
  };

  return (
    <>
      <div className="dlg-body">
        {worktree === null ? (
          <p className="muted">삭제할 워크트리를 찾지 못했습니다. 보드나 사이드바에서 다시 선택하세요.</p>
        ) : (
          <>
            <p>
              <b>{worktree.name}</b> 워크트리를 삭제합니다. 이 동작은 되돌릴 수 없습니다.
            </p>
            <p className="muted">
              {worktree.repo} · {worktree.branch}
            </p>
            {worktree.dirty ? (
              <div className="warn">미커밋 변경이 있습니다. 삭제하면 변경 내용이 사라집니다.</div>
            ) : null}
            <div className="warn">
              Orca 목록에서도 삭제됩니다. 세션 기록은 히스토리에 남습니다.
            </div>
          </>
        )}
        {error === null ? null : (
          <div className="warn" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="dlg-actions">
        <button className="btn ghost" type="button" disabled={busy} onClick={props.onClose}>
          취소
        </button>
        <button
          className="btn danger"
          type="button"
          disabled={busy || groupId === null || worktree === null}
          onClick={() => {
            void confirmDelete();
          }}
        >
          {busy ? '삭제 중…' : '삭제'}
        </button>
      </div>
    </>
  );
}
