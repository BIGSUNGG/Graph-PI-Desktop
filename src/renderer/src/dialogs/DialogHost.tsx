/**
 * 다이얼로그 호스트 — 어떤 다이얼로그를 열지 **로컬 상태**로만 관리한다(전역 상태를 만들지 않는다).
 * 열림 트리거는 window 커스텀 이벤트다:
 *   window.dispatchEvent(new CustomEvent('graph-pi:dialog', { detail: { kind: 'group' | 'worktree' | 'session' } }))
 *   window.dispatchEvent(new CustomEvent('graph-pi:dialog', { detail: { kind: 'worktree-delete', worktreeId } }))
 * 닫기는 배경 클릭과 Esc. 목업 골격 `#dialog.backdrop > .dialog`(mock/index.html:689-698)를 그대로 쓴다.
 * CSS 의 다이얼로그 규칙이 `#dialog …` 로 스코프돼 있으므로 컨테이너 id 는 반드시 `dialog` 다.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { DeleteWorktreeDialog } from './DeleteWorktreeDialog.tsx';
import { GroupCreateDialog } from './GroupCreateDialog.tsx';
import { SessionDialog } from './SessionDialog.tsx';
import { WorktreeDialog } from './WorktreeDialog.tsx';

/** 추가 인자 없이 여는 다이얼로그 종류. */
export type PlainDialogKind = 'group' | 'worktree' | 'session';

/** 열 수 있는 다이얼로그 종류 전부. */
export type DialogKind = PlainDialogKind | 'worktree-delete';

/** 열림 이벤트의 detail. `worktree-delete` 만 대상 id 가 필요하다. */
export type DialogRequest =
  | { kind: PlainDialogKind }
  | { kind: 'worktree-delete'; worktreeId: string };

/** 열림 이벤트 채널 이름. 호출부는 `openDialog()` 를 쓰면 문자열을 몰라도 된다. */
export const DIALOG_EVENT = 'graph-pi:dialog';

/** 어디서든 다이얼로그를 연다. 이벤트를 받는 곳은 `DialogHost` 하나다. */
export function openDialog(kind: PlainDialogKind): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DialogRequest>(DIALOG_EVENT, { detail: { kind } }));
}

/** 워크트리 삭제는 대상 id 가 필요하므로 별도 진입점을 둔다(확인 다이얼로그를 거친다). */
export function openWorktreeDeleteDialog(worktreeId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<DialogRequest>(DIALOG_EVENT, { detail: { kind: 'worktree-delete', worktreeId } }),
  );
}

/** 목업 `openDialog` 의 title·size(목업 :2331-2336, :2345, :2537, :2300, :2665). */
const DIALOG_META: Record<DialogKind, { title: string; size: string }> = {
  group: { title: '새 그룹', size: 'dialog-xl' },
  worktree: { title: '워크트리 추가', size: 'dialog-wide' },
  session: { title: '새 Pi 세션', size: '' },
  'worktree-delete': { title: '워크트리 삭제', size: '' },
};

function isPlainDialogKind(value: unknown): value is PlainDialogKind {
  return value === 'group' || value === 'worktree' || value === 'session';
}

/** 이벤트 detail 을 검증해 연다. 알 수 없는 값은 무시한다(다이얼로그를 열지 않는다). */
function toDialogRequest(detail: unknown): DialogRequest | null {
  // 이전 호출부 호환: detail 이 종류 문자열이면 그대로 쓴다.
  if (isPlainDialogKind(detail)) return { kind: detail };
  if (typeof detail !== 'object' || detail === null) return null;
  // SAFETY: 이벤트 detail 은 unknown 이다. 필드 존재를 런타임에 확인한 뒤에만 좁힌다.
  const record = detail as { kind?: unknown; worktreeId?: unknown };
  if (
    record.kind === 'worktree-delete' &&
    typeof record.worktreeId === 'string' &&
    record.worktreeId !== ''
  ) {
    return { kind: 'worktree-delete', worktreeId: record.worktreeId };
  }
  if (isPlainDialogKind(record.kind)) return { kind: record.kind };
  return null;
}

export function DialogHost(): ReactElement {
  const [open, setOpen] = useState<DialogRequest | null>(null);

  useEffect(() => {
    const onOpen = (event: Event): void => {
      // SAFETY: CustomEvent.detail 은 unknown 이다. 네 종류(대상 id 포함)일 때만 연다.
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      const request = toDialogRequest(detail);
      if (request !== null) setOpen(request);
    };
    window.addEventListener(DIALOG_EVENT, onOpen);
    return () => {
      window.removeEventListener(DIALOG_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = (): void => {
    setOpen(null);
  };

  if (open === null) return <></>;

  const meta = DIALOG_META[open.kind];

  return (
    <div
      id="dialog"
      className="backdrop"
      onClick={(event) => {
        // 배경(카드 바깥) 클릭만 닫는다.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className={`dialog ${meta.size}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={meta.title}
      >
        <h2>{meta.title}</h2>
        {open.kind === 'group' ? <GroupCreateDialog onClose={close} /> : null}
        {open.kind === 'worktree' ? <WorktreeDialog onClose={close} /> : null}
        {open.kind === 'session' ? <SessionDialog onClose={close} /> : null}
        {open.kind === 'worktree-delete' ? (
          <DeleteWorktreeDialog worktreeId={open.worktreeId} onClose={close} />
        ) : null}
      </div>
    </div>
  );
}
