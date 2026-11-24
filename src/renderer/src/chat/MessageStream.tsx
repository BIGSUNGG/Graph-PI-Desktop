/**
 * 대화 로그. 목업 `renderChat` 의 턴 조립과 `turnHTML`/`thinkHTML`/`toolParts`/`toolIcon`
 * (mock/index.html:2030-2083) 을 JSX 로 옮겼다.
 * 메시지는 `pi:messages` 로 읽고, 세션 파일 경고는 로그 위 1줄로 표시한다(acceptance 21행).
 */
import { Fragment, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type {
  AgentMessageRecord,
  GraphPiApi,
  PiMessage,
  PiWarning,
  PiWarningKind,
} from '../../../shared/contract/index.ts';
import { clockOf } from '../board/layout.ts';
import { useApp } from '../state/hooks.ts';

/** 한 번에 읽는 메시지 수 상한. task 계약(pi:messages 의 limit)을 그대로 쓴다. */
const MESSAGE_LIMIT = 200;

/** 상태 파일 경고 종류의 한국어 표기. 경고가 1줄에 들어가야 해서 짧게 쓴다. */
const WARNING_KIND: Record<PiWarningKind, string> = {
  'unknown-record-type': '알 수 없는 레코드',
  'malformed-line': '깨진 줄',
  'unsupported-format-version': '지원하지 않는 형식',
  'outside-workspace': '워크스페이스 밖 경로',
  'unreadable-file': '읽을 수 없는 파일',
};

/**
 * preload 가 노출한 표면을 읽는다. 단위 환경에는 `window` 자체가 없고, preload 없이 뜬 창에는
 * `window.api` 가 없다 — 호출부는 null 이면 조용히 빈 상태를 유지한다(app-store 와 같은 방어).
 */
export function readApi(): GraphPiApi | null {
  if (typeof window === 'undefined') return null;
  // SAFETY: Window.api 는 preload 없이도 undefined 일 수 있다. 선언이 필수 필드라 부재를 타입으로 표현할 수 없다.
  const candidate: unknown = (window as unknown as { api?: GraphPiApi }).api;
  if (typeof candidate !== 'object' || candidate === null) return null;
  return candidate as GraphPiApi;
}

/** 목업 `turnsOf`(mock/index.html:2030-2039): 사용자 메시지마다 턴을 끊고 나머지를 한 턴에 모은다. */
type Turn =
  | { kind: 'divider'; message: PiMessage }
  | { kind: 'exchange'; user: PiMessage | null; agent: PiMessage[] };

function turnsOf(messages: PiMessage[]): Turn[] {
  const turns: Turn[] = [];
  let bucket: PiMessage[] | null = null;
  for (const message of messages) {
    if (message.role === 'compaction') {
      turns.push({ kind: 'divider', message });
      bucket = null;
      continue;
    }
    if (message.role === 'user') {
      turns.push({ kind: 'exchange', user: message, agent: [] });
      bucket = null;
      continue;
    }
    if (bucket === null) {
      const agent: PiMessage[] = [];
      turns.push({ kind: 'exchange', user: null, agent });
      bucket = agent;
    }
    bucket.push(message);
  }
  return turns;
}

/** 목업 `toolParts`(mock/index.html:2013-2021): 첫 행이 명령, 이후 `→` 결과. */
function toolParts(text: string): { name: string; out: string } {
  const lines = text.split('\n');
  const name = lines[0] ?? '';
  const out = lines.slice(1).join('\n').replace(/^→\s*/, '').trim();
  return { name, out };
}

/** 목업 `toolIcon`(mock/index.html:2023-2029) 문자표를 그대로 쓴다. */
function toolIcon(name: string): string {
  if (/playwright|test/i.test(name)) return '✓';
  if (/merge|worktree|branch/i.test(name)) return '⎇';
  if (/build|compile/i.test(name)) return '▣';
  if (/read|grep|rg /i.test(name)) return '◉';
  return '▸';
}

/** 사용량은 메시지 우측에 작게 붙인다(목업의 `.answer-at` 자리). 1000 이상은 k 로 줄인다. */
function shortCount(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1)}k`;
}

function usageText(message: PiMessage): string {
  if (message.usage === null) return clockOf(message.at);
  return `${clockOf(message.at)} · in ${shortCount(message.usage.input)} · out ${shortCount(
    message.usage.output,
  )}`;
}

export function MessageStream(props: {
  sessionId: string | null;
  /** 전송 성공 등으로 다시 읽어야 할 때 증가한다. */
  reloadKey: number;
  /** 로그 끝에 붙일 노드(에이전트 질문 카드). */
  footer?: ReactNode;
}): ReactElement {
  const sessionId = props.sessionId;
  const reloadKey = props.reloadKey;
  // 에이전트 메시지(수용기준 24·25): 이 세션이 보내거나 받은 메시지를 Pi 로그 뒤에 이어 붙인다.
  const harness = useApp().harness;
  const agentMessages = (harness?.messages ?? []).filter(
    (message) => message.fromSessionId === sessionId || message.toSessionId === sessionId,
  );
  // 상태가 바뀌면(전달→실패) 행 높이가 달라지므로 마지막 상태까지 스크롤 키에 넣는다.
  const agentKey = agentMessages.map((message) => `${message.id}:${message.status}`).join('|');
  const [messages, setMessages] = useState<PiMessage[]>([]);
  const [warnings, setWarnings] = useState<PiWarning[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (sessionId === null) {
      setMessages([]);
      setWarnings([]);
      setPhase('idle');
      return;
    }
    const client = readApi();
    if (client === null) {
      // IPC 표면이 없는 단위 환경: 조용히 빈 상태로 둔다.
      setMessages([]);
      setWarnings([]);
      setPhase('idle');
      return;
    }
    let alive = true;
    setPhase('loading');
    void (async () => {
      try {
        const result = await client.invoke('pi:messages', { sessionId, limit: MESSAGE_LIMIT });
        if (!alive) return;
        setMessages(result.messages);
        setWarnings(result.warnings);
        setPhase('loaded');
      } catch {
        if (!alive) return;
        setMessages([]);
        setWarnings([]);
        setPhase('failed');
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, reloadKey]);

  // 목업은 렌더 후 `chat-log.scrollTop = scrollHeight`(mock/index.html:2009). 같은 동작을 effect 로 옮겼다.
  useEffect(() => {
    const log = logRef.current;
    if (log === null) return;
    log.scrollTop = log.scrollHeight;
  }, [messages, agentKey]);

  const warning = warnings.length === 0 ? null : (warnings[0] ?? null);
  const turns = turnsOf(messages);

  const renderBody = (): ReactElement => {
    if (sessionId === null) return <p className="empty">세션이 없습니다. 새 세션을 시작하세요.</p>;
    if (phase === 'loading') return <p className="empty">메시지를 읽는 중입니다…</p>;
    if (phase === 'failed') return <p className="empty">메시지를 읽지 못했습니다.</p>;
    if (turns.length === 0) {
      // 에이전트 메시지만 있어도 빈 상태 문구를 넣지 않는다(받은·보낸 채팅에 동시에 보여야 한다).
      return agentMessages.length === 0 ? <p className="empty">저장된 메시지가 없습니다.</p> : <></>;
    }
    return (
      <>
        {turns.map((turn, index) => (
          <TurnView
            key={turn.kind === 'divider' ? turn.message.id : (turn.user?.id ?? turn.agent[0]?.id ?? String(index))}
            turn={turn}
            latest={index === turns.length - 1}
          />
        ))}
      </>
    );
  };

  return (
    <>
      {warning === null ? null : (
        <div className="banner" title={`${warning.filePath}${warning.detail === '' ? '' : ` · ${warning.detail}`}`}>
          <span className="dot" />
          세션 파일 경고 {warnings.length}건 · {WARNING_KIND[warning.kind]}
          {warning.line === null ? '' : ` · ${warning.line}행`}
          {warnings.length > 1 ? ` 외 ${warnings.length - 1}건` : ''}
        </div>
      )}
      <div className="chat-log" ref={logRef}>
        {renderBody()}
        {agentMessages.map((message) => (
          <AgentMessageRow key={message.id} message={message} sessionId={sessionId} />
        ))}
        {sessionId === null ? null : props.footer}
      </div>
    </>
  );
}

/** 목업 `turnHTML`(mock/index.html:2060-2077). */
function TurnView(props: { turn: Turn; latest: boolean }): ReactElement {
  const turn = props.turn;
  if (turn.kind === 'divider') {
    return (
      <div className="divider">
        {turn.message.text} · {clockOf(turn.message.at)}
      </div>
    );
  }

  const tools = turn.agent.filter((message) => message.role === 'tool');
  const answers = turn.agent.filter((message) => message.role === 'assistant');
  const hasThink = tools.length > 0 || answers.some((answer) => answer.think !== null && answer.think.trim() !== '');
  const stamp = turn.agent[0]?.at ?? '';

  return (
    <>
      {turn.user === null ? null : (
        <div className="msg user">
          <div className="head">
            <span>{clockOf(turn.user.at)}</span>
          </div>
          <div className="bubble">{turn.user.text}</div>
        </div>
      )}
      {turn.agent.length === 0 ? null : (
        <div className={`msg agent${props.latest ? ' is-new' : ''}`}>
          {hasThink ? <ThinkBlock answers={answers} tools={tools} open={props.latest} at={stamp} /> : null}
          {answers.map((answer) => (
            <Fragment key={answer.id}>
              <div className="answer">{answer.text}</div>
              <div className="answer-at">{usageText(answer)}</div>
            </Fragment>
          ))}
        </div>
      )}
    </>
  );
}

/** 목업 `thinkHTML`(mock/index.html:2041-2058). `details` 접기/펼치기를 로컬 상태로 유지한다. */
function ThinkBlock(props: {
  answers: PiMessage[];
  tools: PiMessage[];
  open: boolean;
  at: string;
}): ReactElement {
  const [open, setOpen] = useState(props.open);
  const lines = props.answers
    .map((answer) => answer.think)
    .filter((line): line is string => line !== null && line.trim() !== '');
  // 목업은 think 가 없고 도구만 있으면 안내 문구 한 줄을 넣는다.
  const bodyLines = lines.length > 0
    ? lines
    : props.tools.length > 0
      ? ['요청을 확인하고 필요한 도구를 실행했습니다.']
      : [];
  const label = props.answers.length > 0 ? '사고 과정' : '대기 중';

  return (
    <details
      className="think"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <span className="brain">✳</span>
        <span className="think-label">{label}</span>
        {props.tools.length > 0 ? <span className="think-count">도구 {props.tools.length}개</span> : null}
        {props.at === '' ? null : <span className="think-at">{clockOf(props.at)}</span>}
        <span className="chev">›</span>
      </summary>
      <div className="think-body">
        {bodyLines.map((line, index) => (
          <p className="think-line" key={`think-${index}`}>
            {line}
          </p>
        ))}
        {props.tools.map((tool) => (
          <ToolRow key={tool.id} message={tool} />
        ))}
      </div>
    </details>
  );
}

function ToolRow(props: { message: PiMessage }): ReactElement {
  const parts = toolParts(props.message.text);
  return (
    <div className="tool-row">
      <span className="ico">{toolIcon(parts.name)}</span>
      <span className="name" title={parts.name}>
        {parts.name}
      </span>
      <span className="tool-at">{clockOf(props.message.at)}</span>
      {parts.out === '' ? null : <span className="out">{parts.out}</span>}
    </div>
  );
}

/**
 * 에이전트 메시지 한 건. 보낸 세션과 받은 세션 채팅이 같은 레코드를 방향만 바꿔 그린다(수용기준 24).
 * 실패 사유는 보낸 세션에도 남아야 하므로 행 아래 한 줄로 붙인다(수용기준 25).
 */
function AgentMessageRow(props: { message: AgentMessageRecord; sessionId: string | null }): ReactElement {
  const out = props.sessionId !== null && props.message.fromSessionId === props.sessionId;
  return (
    <div className={`msg agent-msg${out ? ' is-out' : ''}`}>
      <div className="head">
        <span>에이전트 · {out ? '보냄' : '받음'}</span>
        <span>{clockOf(props.message.createdAt)}</span>
      </div>
      <div className="bubble">{props.message.body}</div>
      {props.message.status === 'failed' ? (
        <div className="msg-error">{props.message.failureReason ?? '전달하지 못했습니다'}</div>
      ) : null}
    </div>
  );
}
