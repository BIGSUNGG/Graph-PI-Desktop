/**
 * 대화 입력. 목업 `#composer`(mock/index.html:649-654) 와 참조 메뉴(`showRefMenu`/`insertRef`,
 * mock/index.html:995-1025) 를 옮겼다. 전송 전 `refs:resolve` 로 참조를 검증하고,
 * 해석하지 못한 참조가 있으면 전송을 막는다(acceptance 29행).
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { RefCandidate, RefKind, RefToken, RefValidation } from '../../../shared/contract/index.ts';
import { tokenAtCursor, tokenizeRefs } from '../../../shared/refs/tokenize.ts';
import { useSelectedGroup, useSessions, useVisibleWorktrees } from '../state/hooks.ts';
import { isExternalSession } from '../state/selectors.ts';
import { readApi } from './MessageStream.tsx';

/** 참조 종류의 한국어 표기. 목업 메뉴의 `프로젝트`·`브랜치`·`파일 참조` 어휘를 따른다. */
const KIND_LABEL: Record<RefKind, string> = {
  project: '프로젝트',
  branch: '브랜치',
  worktree: '워크트리',
  path: '파일 참조',
};

/** 입력 후 참조 검증까지의 지연. 한 글자마다 IPC 를 부르지 않는다. */
const VALIDATE_DELAY_MS = 180;

type Status = { text: string; kind: '' | 'ok' | 'err' };

const EMPTY_STATUS: Status = { text: '', kind: '' };

export function Composer(props: {
  sessionId: string | null;
  groupId: string | null;
  /** 전송에 성공하면 ChatView 가 메시지를 다시 읽는다. */
  onSent: () => void;
  /** 호출부가 이미 판정했으면 그 값을 쓴다. 없으면 Composer 가 스스로 판정한다(수용기준 11). */
  external?: boolean;
}): ReactElement {
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(0);
  const [focused, setFocused] = useState(false);
  /** Escape 로 닫은 토큰의 head. 같은 head 를 다시 입력하면 다시 연다. */
  const [dismissedHead, setDismissedHead] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RefCandidate[]>([]);
  /** 검증 결과와 그 결과를 만든 본문. 본문이 바뀌면 결과는 버린다. */
  const [checked, setChecked] = useState<{ source: string; validation: RefValidation } | null>(null);
  const [status, setStatus] = useState<Status>(EMPTY_STATUS);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCursor = useRef<number | null>(null);

  // 수용기준 11: 선택된 그룹의 워크트리 경로에 없는 cwd 의 세션은 외부다. ChatView 를 고치지 않고
  // 여기서 스스로 판정한다(호출부가 `external` 을 주면 그 값을 우선한다).
  const group = useSelectedGroup();
  const worktrees = useVisibleWorktrees();
  const sessions = useSessions(group === null ? null : group.id);
  const selectedSession =
    props.sessionId === null
      ? null
      : (sessions.find((session) => session.id === props.sessionId) ?? null);
  const external = props.external ?? (selectedSession !== null && isExternalSession(selectedSession, worktrees));

  const disabled = props.sessionId === null || external;
  const tokens = tokenizeRefs(text);
  const activeToken = tokenAtCursor(text, cursor);
  const activeHead = activeToken === null ? null : activeToken.head;
  const menuOpen = focused && activeToken !== null && dismissedHead !== activeToken.head;
  const menuToken = menuOpen ? activeToken : null;

  // 후보 팝오버 — 목업은 토큰의 프로젝트·브랜치·파일을 그 자리에서 나열했다.
  useEffect(() => {
    const groupId = props.groupId;
    if (activeHead === null || groupId === null || !focused) {
      setCandidates([]);
      return;
    }
    const client = readApi();
    if (client === null) {
      setCandidates([]);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const list = await client.invoke('refs:candidates', { groupId, head: activeHead });
        if (alive) setCandidates(list);
      } catch {
        if (alive) setCandidates([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeHead, props.groupId, focused]);

  // 입력 중 참조 검증. 실패한 토큰은 아래에 빨간 배지로 남긴다.
  useEffect(() => {
    const groupId = props.groupId;
    const body = text.trim();
    const live = tokenizeRefs(body);
    if (live.length === 0 || groupId === null) {
      setChecked(null);
      return;
    }
    const client = readApi();
    if (client === null) {
      setChecked(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const validation = await client.invoke('refs:resolve', { groupId, tokens: live });
          if (alive) setChecked({ source: body, validation });
        } catch {
          if (alive) setChecked(null);
        }
      })();
    }, VALIDATE_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [text, props.groupId]);

  // 후보를 고르면 커서를 삽입 위치 뒤로 되돌린다.
  useEffect(() => {
    const target = pendingCursor.current;
    const input = inputRef.current;
    if (target === null || input === null) return;
    pendingCursor.current = null;
    input.focus();
    input.setSelectionRange(target, target);
    setCursor(target);
  }, [text]);

  const body = text.trim();
  const liveValidation = checked !== null && checked.source === body ? checked.validation : null;
  const unresolved: RefToken[] = liveValidation !== null && !liveValidation.ok ? liveValidation.unresolved : [];

  /** 목업 `insertRef`(mock/index.html:1015-1024): 토큰 전체를 `@handle ` 로 바꾼다. */
  const insertHandle = (handle: string): void => {
    if (activeToken === null) return;
    const inserted = `@${handle} `;
    const next = `${text.slice(0, activeToken.start)}${inserted}${text.slice(activeToken.end)}`;
    setText(next);
    pendingCursor.current = activeToken.start + inserted.length;
    setDismissedHead(activeToken.head);
  };

  const submit = async (): Promise<void> => {
    const sessionId = props.sessionId;
    const groupId = props.groupId;
    if (sessionId === null || external || body === '' || sending) return;
    const client = readApi();
    if (client === null) return;

    const live = tokenizeRefs(body);
    setSending(true);
    try {
      if (live.length > 0 && groupId !== null) {
        // 방금 읽은 검증이 이 본문의 것이면 그대로 쓰고, 아니면 전송 직전에 다시 확인한다.
        let validation: RefValidation | null =
          checked !== null && checked.source === body ? checked.validation : null;
        if (validation === null) {
          validation = await client.invoke('refs:resolve', { groupId, tokens: live });
          setChecked({ source: body, validation });
        }
        if (!validation.ok) {
          setStatus({
            text: '해석하지 못한 참조가 있습니다. 참조를 확인한 뒤 전송해 주세요.',
            kind: 'err',
          });
          return;
        }
      }

      const result = await client.invoke('pi:send', { sessionId, text: body });
      if (!result.ok) {
        setStatus({ text: result.error ?? '전송하지 못했습니다.', kind: 'err' });
        return;
      }
      setText('');
      setChecked(null);
      setDismissedHead(null);
      setCursor(0);
      setStatus({ text: '전달됨 · 터미널 입력 대기', kind: 'ok' });
      props.onSent();
    } catch {
      setStatus({ text: '전송하지 못했습니다.', kind: 'err' });
    } finally {
      setSending(false);
    }
  };

  let placeholder = '프롬프트를 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈 · @로 참조)';
  if (external) placeholder = '외부 세션에는 보낼 수 없습니다';
  else if (disabled) placeholder = '세션이 없습니다 — 프롬프트를 보낼 수 없습니다';

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div id="ref-menu" className={menuOpen ? '' : 'hidden'}>
        {menuToken === null ? null : candidates.length === 0 ? (
          <div className="ref-item">
            <span className="ri-t">일치하는 참조 없음</span>
            <span className="ri-d">@{menuToken.head}</span>
          </div>
        ) : (
          candidates.map((candidate) => (
            <button
              key={`${candidate.kind}:${candidate.handle}`}
              type="button"
              className="ref-item"
              // 클릭 전에 textarea 포커스를 잃으면 메뉴가 먼저 닫힌다. mousedown 기본 동작을 막는다.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                insertHandle(candidate.handle);
              }}
            >
              <span className="ri-t">
                {candidate.label} · {KIND_LABEL[candidate.kind]}
              </span>
              <span className="ri-d">
                @{candidate.handle}
                {candidate.detail === '' ? '' : ` · ${candidate.detail}`}
              </span>
            </button>
          ))
        )}
      </div>

      <textarea
        ref={inputRef}
        rows={2}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          setCursor(event.target.selectionStart);
        }}
        onSelect={(event) => {
          setCursor(event.currentTarget.selectionStart);
        }}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && activeToken !== null) {
            setDismissedHead(activeToken.head);
            return;
          }
          if (event.key !== 'Enter' || event.shiftKey) return;
          // 한글 조합 중의 Enter 는 전송이 아니다.
          if (event.nativeEvent.isComposing) return;
          event.preventDefault();
          void submit();
        }}
      />

      {tokens.length === 0 ? null : (
        <div className="hint">
          참조 미리보기{' '}
          {tokens.map((token) => (
            <span className="ref-tag mono" key={`ref-${token.start}-${token.raw}`}>
              @{token.raw}{' '}
            </span>
          ))}
        </div>
      )}

      {unresolved.length === 0 ? null : (
        <div className="hint">
          {unresolved.map((token) => (
            <span className="pill failed" key={`unresolved-${token.start}-${token.raw}`}>
              <span className="d" />@{token.raw}{' '}
            </span>
          ))}
        </div>
      )}

      {external ? <div className="hint">외부 세션에는 보낼 수 없습니다</div> : null}

      <div className="composer-foot">
        <span className={status.kind === '' ? 'status' : `status ${status.kind}`}>{status.text}</span>
        <button className="btn primary" type="submit" disabled={disabled || body === '' || sending}>
          전송
        </button>
      </div>
    </form>
  );
}
