/**
 * 에이전트 질문 카드. 하네스 `questions` 중 `status === 'pending'` 인 묶음만 그리고,
 * 답을 보내면 그 묶음을 로컬에서 즉시 지운다(하네스 푸시가 오기 전에도 카드가 사라진다).
 *
 * 수용기준 22: 같은 질문이 (a) 인스펙터 카드(`variant="panel"`, 목업 `.sup-question`)와
 * (b) 채팅 인라인(`variant="inline"`, 목업 `.chat-question`)에 동시에 보여야 한다.
 * 두 변형은 목업 `questionHTML(q, compact)`(mock/index.html:1560-1571)의 두 갈래와 같다.
 */
import { useState, type ReactElement } from 'react';
import type { QuestionItem, QuestionRecord } from '../../../shared/contract/index.ts';
import { useApp } from '../state/hooks.ts';
import { readApi } from './MessageStream.tsx';

export type QuestionCardsProps = {
  sessionId: string | null;
  /** `inline` = 채팅 인라인, `panel` = 인스펙터 카드. 기본은 기존 동작(인라인). */
  variant?: 'inline' | 'panel';
};

export function QuestionCards(props: QuestionCardsProps): ReactElement | null {
  const { harness } = useApp();
  const [answered, setAnswered] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);
  const variant = props.variant ?? 'inline';

  /**
   * 선택지 클릭 = 그 질문의 답. 계약 `QuestionItem` 에는 id 가 없어 `header` 를 키로 쓴다
   * (task 지시의 `{[questionId]: [label]}` 형태).
   */
  const answer = async (record: QuestionRecord, item: QuestionItem, label: string): Promise<void> => {
    const client = readApi();
    if (client === null) return;
    try {
      const result = await client.invoke('harness:answer', {
        questionId: record.id,
        answer: { [item.header]: [label] },
      });
      if (!result.ok) {
        setError(result.error ?? '답변을 보내지 못했습니다.');
        return;
      }
      setError(null);
      setAnswered((prev) => ({ ...prev, [record.id]: true }));
    } catch {
      setError('답변을 보내지 못했습니다.');
    }
  };

  if (harness === null || harness.availability !== 'ok') return null;

  const pending = harness.questions.filter(
    (question) =>
      question.status === 'pending' &&
      answered[question.id] !== true &&
      (props.sessionId === null || question.sessionId === props.sessionId),
  );
  if (pending.length === 0) return null;

  const panel = variant === 'panel';

  return (
    <>
      {pending.map((record) => (
        <div
          className={panel ? 'sup-question' : 'chat-question'}
          key={record.id}
          data-question-id={record.id}
          data-question-session={record.sessionId}
          data-question-variant={variant}
          data-attention="true"
        >
          {record.questions.map((item, index) => (
            <div key={`${record.id}-${index}`}>
              <div className={panel ? 'q-h' : 'cq-h'}>? 에이전트 질문 · {item.header}</div>
              <div className={panel ? 'q-t' : 'cq-q'}>{item.question}</div>
              <div className="q-opts">
                {item.options.map((option) => (
                  <button
                    key={`${record.id}-${index}-${option.label}`}
                    type="button"
                    className="q-opt"
                    onClick={() => {
                      void answer(record, item, option.label);
                    }}
                  >
                    <b>{option.label}</b> — {option.description}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      {error === null ? null : <div className="status err">{error}</div>}
    </>
  );
}
