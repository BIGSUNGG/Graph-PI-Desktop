/**
 * 다이얼로그 호스트 — 어떤 다이얼로그를 열지 **로컬 상태**로만 관리한다(전역 상태를 만들지 않는다).
 * 열림 트리거는 window 커스텀 이벤트다:
 *   window.dispatchEvent(new CustomEvent('graph-pi:dialog', { detail: 'group' | 'worktree' | 'session' }))
 * 닫기는 배경 클릭과 Esc. 목업 골격 `#dialog.backdrop > .dialog`(mock/index.html:689-698)를 그대로 쓴다.
 * CSS 의 다이얼로그 규칙이 `#dialog …` 로 스코프돼 있으므로 컨테이너 id 는 반드시 `dialog` 다.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { GroupCreateDialog } from './GroupCreateDialog.tsx';
import { SessionDialog } from './SessionDialog.tsx';
import { WorktreeDialog } from './WorktreeDialog.tsx';

export type DialogKind = 'group' | 'worktree' | 'session';

/** 열림 이벤트 채널 이름. 호출부는 `openDialog()` 를 쓰면 문자열을 몰라도 된다. */
export const DIALOG_EVENT = 'graph-pi:dialog';

/** 어디서든 다이얼로그를 연다. 이벤트를 받는 곳은 `DialogHost` 하나다. */
export function openDialog(kind: DialogKind): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DialogKind>(DIALOG_EVENT, { detail: kind }));
}

/** 목업 `openDialog` 의 title·size(목업 :2331-2336, :2345, :2537, :2300). */
const DIALOG_META: Record<DialogKind, { title: string; size: string }> = {
  group: { title: '새 그룹', size: 'dialog-xl' },
  worktree: { title: '워크트리 추가', size: 'dialog-wide' },
  session: { title: '새 Pi 세션', size: '' },
};

function isDialogKind(value: unknown): value is DialogKind {
  return value === 'group' || value === 'worktree' || value === 'session';
}

export function DialogHost(): ReactElement {
  const [open, setOpen] = useState<DialogKind | null>(null);

  useEffect(() => {
    const onOpen = (event: Event): void => {
      // SAFETY: CustomEvent.detail 은 unknown 이다. 세 종류일 때만 연다.
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (isDialogKind(detail)) setOpen(detail);
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

  const meta = DIALOG_META[open];

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
        {open === 'group' ? <GroupCreateDialog onClose={close} /> : null}
        {open === 'worktree' ? <WorktreeDialog onClose={close} /> : null}
        {open === 'session' ? <SessionDialog onClose={close} /> : null}
      </div>
    </div>
  );
}
