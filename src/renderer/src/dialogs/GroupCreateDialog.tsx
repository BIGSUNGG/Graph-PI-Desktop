/**
 * 새 그룹 다이얼로그(목업 mock/index.html:2345, 2425-2530). 프리셋 3분기가 첫 프롬프트를 결정한다.
 * Feature·Loop 는 프리셋 지시문이 들어간 프롬프트가 필수이고 Manual 은 비워도 된다.
 */
import { useState, type ReactElement } from 'react';
import { MODELS, PRESET_KINDS, PRESETS, type PresetKind } from '../../../shared/contract/index.ts';
import { useApp } from '../state/hooks.ts';

export function GroupCreateDialog({ onClose }: { onClose: () => void }): ReactElement {
  const { orca } = useApp();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [parentRepo, setParentRepo] = useState(orca.projects[0]?.path ?? '');
  const [preset, setPreset] = useState<PresetKind>('feature');
  const [firstPrompt, setFirstPrompt] = useState('');
  const [model, setModel] = useState(MODELS[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = PRESETS.find((item) => item.id === preset);
  // Feature·Loop 는 프리셋 지시가 들어간 첫 프롬프트가 필수이고 Manual 만 비워도 된다
  // (SPEC-hub-orchestration 완료 조건, 목업 mock/index.html:2425-2530).
  const promptRequired = preset !== 'manual';
  const promptMissing = promptRequired && firstPrompt.trim() === '';

  const submit = async (): Promise<void> => {
    if (name.trim() === '') {
      setError('그룹 이름을 입력하세요');
      return;
    }
    if (promptMissing) {
      setError('이 프리셋은 첫 프롬프트가 필요합니다');
      return;
    }
    const api = window.api;
    if (api === undefined) {
      setError('앱 API 를 사용할 수 없습니다');
      return;
    }
    setBusy(true);
    const result = await api.invoke('group:create', {
      name: name.trim(),
      note: note.trim(),
      parentRepo,
      preset,
      firstPrompt: firstPrompt.trim(),
      model: model === '' ? null : model,
    });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error ?? '그룹을 만들지 못했습니다');
  };

  return (
    <div className="wizard">
      <label className="field">
        <span>그룹 이름</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="결제 리팩터링" />
      </label>
      <label className="field">
        <span>메모</span>
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="선택" />
      </label>
      <label className="field">
        <span>상위 저장소</span>
        <select value={parentRepo} onChange={(event) => setParentRepo(event.target.value)}>
          {orca.projects.map((project) => (
            <option key={project.id} value={project.path}>
              {project.displayName}
            </option>
          ))}
        </select>
      </label>

      <div className="preset-grid">
        {PRESET_KINDS.map((kind) => {
          const item = PRESETS.find((candidate) => candidate.id === kind);
          const on = kind === preset;
          return (
            <button
              key={kind}
              type="button"
              // a11y: 버튼 요소에 role="radio" 를 던지는 대신 토글 버튼(aria-pressed)으로 표시한다.
              // 시각·동작은 그대로고, 프리셋은 하나만 선택된다.
              aria-pressed={on}
              className={on ? 'preset on' : 'preset'}
              onClick={() => setPreset(kind)}
            >
              <b>{item?.name ?? kind}</b>
              <span>{item?.desc ?? ''}</span>
              {item?.required === true ? <span className="preset-required">필수</span> : null}
            </button>
          );
        })}
      </div>
      {meta === undefined ? null : (
        <div className="preset-flow">
          {meta.flow.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      )}

      <label className="field">
        <span>첫 프롬프트{promptRequired ? ' (필수)' : ' (선택)'}</span>
        <textarea
          value={firstPrompt}
          onChange={(event) => setFirstPrompt(event.target.value)}
          placeholder={meta?.placeholder ?? ''}
          rows={4}
        />
      </label>
      {promptMissing ? (
        <p className="hint">첫 프롬프트를 입력해야 그룹을 만들 수 있습니다.</p>
      ) : null}
      <label className="field">
        <span>모델</span>
        <select value={model} onChange={(event) => setModel(event.target.value)}>
          {MODELS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {error === null ? null : <div className="hint error">{error}</div>}

      <div className="dialog-actions">
        <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>
          취소
        </button>
        <button
          className="btn primary"
          type="button"
          onClick={() => {
            void submit();
          }}
          disabled={busy || promptMissing}
          title={promptMissing ? '첫 프롬프트를 입력해야 그룹을 만들 수 있습니다.' : undefined}
        >
          {busy ? '만드는 중…' : '그룹 만들기'}
        </button>
      </div>
    </div>
  );
}
