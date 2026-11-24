/**
 * 감독 TODO 목록. 목업 `supervisionHTML`(:1713-1716) 의 `.todo-panel`.
 * 앱은 하네스 상태를 읽기만 하므로(SPEC-hub-orchestration §10.5) 체크·편집 UI 를 두지 않는다.
 * 상태별(대기·진행·완료)로 묶어서 보여준다.
 *
 * 스코프(수용기준 36): 그룹 TODO 는 항상 보이고(`sessionId` 필터 없음), 세션 TODO 는 그 세션에서,
 * 허브(그룹) 인스펙터에서는 그룹 전 세션 TODO 까지 보인다(`groupWide`).
 */
import type { ReactElement } from 'react';
import type { HarnessSnapshot, TodoRecord, TodoStatus } from '../../../shared/contract/index.ts';
import { todosFor } from '../state/selectors.ts';

const STATUS_ORDER: readonly TodoStatus[] = ['todo', 'doing', 'done'];

const STATUS_LABELS: Record<TodoStatus, string> = {
  todo: '대기',
  doing: '진행',
  done: '완료',
};

export function TodoBlock(props: {
  harness: HarnessSnapshot | null;
  sessionId: string | null;
  /** 허브(그룹) 인스펙터면 true — 그룹 전 세션 TODO 를 함께 보여준다. */
  groupWide?: boolean;
}): ReactElement {
  const harness = props.harness;
  const groupWide = props.groupWide === true;

  if (harness === null || harness.availability !== 'ok') {
    return (
      <div className="todo-panel">
        <div className="sup-head">
          TODO<span className="n">읽기 전용</span>
        </div>
        <div className="sup-empty">
          {harness !== null && harness.availability === 'version-mismatch'
            ? '하네스 스키마 버전이 맞지 않습니다. 패키지를 업데이트한 뒤 앱을 다시 열어 주세요.'
            : 'Pi 하네스 패키지가 없습니다. 패키지를 설치한 뒤 앱을 다시 열어 주세요.'}
          <br />
          TODO 기능이 비활성입니다.
        </div>
      </div>
    );
  }

  const visible: TodoRecord[] = todosFor(harness, {
    sessionId: props.sessionId,
    groupWide,
  });
  const groupCount = visible.filter((todo) => todo.scope === 'group').length;

  return (
    <div className="todo-panel" data-todo-scope={groupWide ? 'group' : 'session'}>
      <div className="sup-head">
        TODO<span className="n">{groupWide ? `그룹 전 세션 · ${String(visible.length)}개` : '읽기 전용'}</span>
      </div>
      {visible.length === 0 ? <div className="sup-empty">TODO가 없습니다.</div> : null}
      {STATUS_ORDER.map((status) => {
        const rows = visible.filter((todo) => todo.status === status);
        if (rows.length === 0) return null;
        return (
          <div key={status}>
            <div className="sup-head">
              {STATUS_LABELS[status]}
              <span className="n">{rows.length}개</span>
            </div>
            {rows.map((todo) => (
              <div
                className={`todo-row ${todo.status}`}
                key={todo.id}
                data-todo-id={todo.id}
                data-todo-scope={todo.scope}
              >
                <i className="td" />
                <span className="tt">{todo.title}</span>
                <span className="ts">
                  {todo.scope === 'group' ? '그룹' : '세션'} · {todo.status}
                </span>
              </div>
            ))}
          </div>
        );
      })}
      {groupWide && visible.length > 0 ? (
        <div className="g-meta" data-todo-summary="true">
          그룹 TODO {groupCount}개 · 세션 TODO {visible.length - groupCount}개
        </div>
      ) : null}
    </div>
  );
}
