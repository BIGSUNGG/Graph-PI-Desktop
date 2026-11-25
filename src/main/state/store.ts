/**
 * 앱 로컬 설정 저장소(JSON 한 파일).
 *
 * 근거
 * - `docs/30-specs/SPEC-graph-pi-ade.md` §데이터: 그룹·선택·패널 높이는 "앱 로컬 설정으로만 저장"한다.
 *   그래서 설정은 SQLite 인덱스가 아니라 이 JSON 파일이 소유한다(A12 기본값).
 * - `.crew/handoff/mvp-implementation-map.md` §P10: `src/main/state/store.ts` 가 마지막 화면·그룹·패널 높이를 저장.
 *
 * 원칙
 * - 읽기 실패/깨진 JSON 은 기본값으로 떨어진다(throw 금지).
 * - 쓰기는 임시 파일 → rename 으로 원자적으로 바꾼다(부분 쓰기 방지).
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { InspectorTab, ListFilter, Settings, ViewId } from '../../shared/contract/app.ts';
import { DEFAULT_SETTINGS } from '../../shared/contract/app.ts';

export type SettingsStore = {
  get(): Settings;
  set(patch: Partial<Settings>): Settings;
};

const VIEWS: readonly ViewId[] = ['board', 'chat', 'orchestration', 'history'];
const LIST_FILTERS: readonly ListFilter[] = ['all', 'queued', 'active', 'blocked', 'done'];
const INSPECTOR_TABS: readonly InspectorTab[] = ['goal', 'list', 'loop', 'audit'];

export function createSettingsStore(filePath: string): SettingsStore {
  let current = readSettings(filePath);
  return {
    get(): Settings {
      return { ...current };
    },
    set(patch: Partial<Settings>): Settings {
      current = mergeSettings(current, patch);
      writeSettings(filePath, current);
      return { ...current };
    },
  };
}

/** patch 의 정의된 키만 덮고 다시 검증한다. `undefined` 를 넣어도 기본값을 지우지 않는다. */
function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch) as Array<keyof Settings>) {
    const value = patch[key];
    if (value !== undefined) merged[key] = value;
  }
  return sanitizeSettings(merged);
}

function readSettings(filePath: string): Settings {
  try {
    const text = readFileSync(filePath, 'utf8');
    return sanitizeSettings(JSON.parse(text) as unknown);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(filePath: string, settings: Settings): void {
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    renameSync(temp, filePath);
  } catch {
    // 저장 실패가 앱을 죽이지 않게 한다. 메모리 값은 그대로 유지된다.
    try {
      rmSync(temp, { force: true });
    } catch {
      // 임시 파일 정리 실패는 무시한다.
    }
  }
}

/** 외부 JSON 은 경계에서 좁힌다. 알 수 없는 필드는 버리고 기본값으로 채운다. */
function sanitizeSettings(input: unknown): Settings {
  const record = asRecord(input);
  if (record === null) return { ...DEFAULT_SETTINGS };
  const lastGroupId = asString(record['lastGroupId']);
  return {
    lastGroupId: lastGroupId !== null && lastGroupId.length > 0 ? lastGroupId : null,
    view: oneOf(record['view'], VIEWS) ?? DEFAULT_SETTINGS.view,
    listFilter: oneOf(record['listFilter'], LIST_FILTERS) ?? DEFAULT_SETTINGS.listFilter,
    inspectorTab: oneOf(record['inspectorTab'], INSPECTOR_TABS) ?? DEFAULT_SETTINGS.inspectorTab,
    inspectorHeight: heightOf(record['inspectorHeight']),
    background:
      typeof record['background'] === 'boolean' ? record['background'] : DEFAULT_SETTINGS.background,
  };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null;
  for (const candidate of allowed) {
    if (candidate === value) return candidate;
  }
  return null;
}

function heightOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.inspectorHeight;
  return Math.max(0, Math.round(value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
