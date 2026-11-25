#!/usr/bin/env node
/**
 * 64행 수용 기준 맵 검사기. 의존성 없이 `node scripts/check-acceptance.mjs` 로 실행한다.
 *
 * 왜 이 검사가 필요한가: 판정표(`docs/30-specs/SPEC-mvp-acceptance.md`)의 64행을 코드 근거와
 * 연결해 두지 않으면 "없는 파일을 근거로 적은" 통과가 생긴다. 그래서 근거 경로 존재를 실패 조건으로 둔다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAP_FILE = 'scripts/acceptance-map.json';
const SPEC_FILE = 'docs/30-specs/SPEC-mvp-acceptance.md';
const EXPECTED_ROWS = 64;

const PROOFS = new Set(['unit', 'e2e', 'manual', 'cli']);
const STATUSES = new Set(['done', 'partial', 'todo']);
const GROUPS = new Set(['graph', 'hub']);

/** 테스트 파일·실행 스크립트만 "검증 표면"으로 인정한다. */
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const strict = process.argv.slice(2).includes('--strict');
const failures = [];
const warnings = [];

function fail(line) {
  failures.push(line);
}

function warn(line) {
  warnings.push(line);
}

function readText(rel) {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

/**
 * 단위·CLI 증거는 "실행할 수 있는 것"이어야 한다.
 * 하네스 CLI 는 문서화된 실행 진입점(`node packages/harness/src/cli.ts …`)이라 스크립트로 센다.
 */
const E2E_FILE = /^e2e\/.+\.spec\.ts$/;

function isTestOrScript(path) {
  if (TEST_FILE.test(path)) return true;
  if (path.startsWith('scripts/')) return true;
  return path === 'packages/harness/src/cli.ts';
}

/** 판정표의 데이터 행만 센다. 이 표의 첫 열은 숫자 ID 이고 다른 표의 첫 열은 텍스트다. */
function specRowIds(text) {
  const ids = [];
  for (const line of text.split('\n')) {
    const match = /^\|\s*(\d+)\s*\|/.exec(line.trim());
    if (match !== null) ids.push(match[1]);
  }
  return ids;
}

const raw = readText(MAP_FILE);
if (raw === null) {
  console.log(`${MAP_FILE}: 파일 없음`);
  console.log('RESULT: FAIL');
  process.exitCode = 1;
} else {
  run(raw);
}

function run(text) {
  let map = null;
  try {
    map = JSON.parse(text);
  } catch (error) {
    console.log(`${MAP_FILE}: JSON 파싱 실패 (${String(error.message)})`);
    console.log('RESULT: FAIL');
    process.exitCode = 1;
    return;
  }

  if (map === null || typeof map !== 'object' || Array.isArray(map)) {
    console.log(`${MAP_FILE}: 최상위가 객체가 아님`);
    console.log('RESULT: FAIL');
    process.exitCode = 1;
    return;
  }
  if (map.version !== 1) fail(`${MAP_FILE}: version=1 이어야 함 (현재 ${JSON.stringify(map.version)})`);
  const rows = Array.isArray(map.rows) ? map.rows : null;
  if (rows === null) {
    fail(`${MAP_FILE}: rows 배열 없음`);
    finish([]);
    return;
  }
  if (rows.length !== EXPECTED_ROWS) {
    fail(`${MAP_FILE}: 행 수 ${rows.length} (기대 ${EXPECTED_ROWS})`);
  }

  const seen = new Set();
  const counts = { done: 0, partial: 0, todo: 0 };
  const unfinished = [];

  rows.forEach((row, index) => {
    const where = `${MAP_FILE} (${index + 1}번째 행)`;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      fail(`${where}: 행이 객체가 아님`);
      return;
    }
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (id === '') fail(`${where}: id 없음`);
    if (id !== '' && seen.has(id)) fail(`${MAP_FILE}: id 중복 '${id}'`);
    if (id !== '') seen.add(id);

    if (typeof row.requirement !== 'string' || row.requirement.trim() === '') {
      fail(`${where}: requirement 없음`);
    }
    if (!GROUPS.has(row.group)) fail(`${where}: group 은 graph|hub (현재 ${JSON.stringify(row.group)})`);
    if (typeof row.package !== 'string' || !/^P\d{1,2}$/.test(row.package)) {
      fail(`${where}: package 는 P0~P99 형식 (현재 ${JSON.stringify(row.package)})`);
    }
    if (!PROOFS.has(row.proof)) fail(`${where}: proof 는 unit|e2e|manual|cli (현재 ${JSON.stringify(row.proof)})`);
    if (!STATUSES.has(row.status)) fail(`${where}: status 는 done|partial|todo (현재 ${JSON.stringify(row.status)})`);
    if (typeof row.note !== 'string') fail(`${where}: note 문자열 필요`);

    const evidence = Array.isArray(row.evidence) ? row.evidence : null;
    if (evidence === null) {
      fail(`${where}: evidence 배열 없음`);
      return;
    }

    for (const path of evidence) {
      if (typeof path !== 'string' || path.trim() === '') {
        fail(`${where}: evidence 항목이 빈 문자열/비문자열`);
        continue;
      }
      if (isAbsolute(path)) {
        fail(`${path}: 저장소 상대 경로가 아님`);
        continue;
      }
      if (path.split(/[\\/]/).includes('..')) {
        fail(`${path}: 저장소 밖을 가리킴(..)`);
        continue;
      }
      if (!existsSync(join(ROOT, path))) fail(`${path}: 근거 파일 없음 (id ${id})`);
    }

    if (row.proof === 'e2e' && !evidence.some((path) => E2E_FILE.test(String(path)))) {
      fail(`${MAP_FILE}: id ${id} — proof=e2e 인데 e2e 스펙 근거가 없음`);
    }
    if ((row.proof === 'unit' || row.proof === 'cli') && !evidence.some((path) => isTestOrScript(String(path)))) {
      fail(`${MAP_FILE}: id ${id} — proof=${row.proof} 인데 테스트/스크립트 근거가 없음`);
    }
    if (row.status === 'done' && evidence.length === 0) {
      fail(`${MAP_FILE}: id ${id} — status=done 인데 근거가 비었음`);
    }

    if (row.status in counts) counts[row.status] += 1;
    if (row.status !== 'done') unfinished.push(id);
  });

  finish(rows, counts, unfinished);
}

function finish(rows, counts = { done: 0, partial: 0, todo: 0 }, unfinished = []) {
  console.log(`acceptance: done=${counts.done} partial=${counts.partial} todo=${counts.todo} / ${EXPECTED_ROWS}`);

  const specText = readText(SPEC_FILE);
  if (specText === null) {
    warn(`${SPEC_FILE}: 판정표 파일 없음 — 행 수 대조 생략`);
  } else {
    const specIds = specRowIds(specText);
    console.log(`spec: ${SPEC_FILE} table rows=${specIds.length}`);
    if (specIds.length !== rows.length) {
      warn(`${SPEC_FILE}: 표 데이터 행 ${specIds.length}개 vs 맵 ${rows.length}개`);
    }
    const mapIds = new Set(rows.map((row) => String((row === null || typeof row !== 'object' ? '' : row.id) ?? '')));
    for (const id of specIds) {
      if (!mapIds.has(id)) warn(`${SPEC_FILE}: 표 id '${id}' 가 맵에 없음`);
    }
    const specIdSet = new Set(specIds);
    for (const id of mapIds) {
      if (id !== '' && !specIdSet.has(id)) warn(`${MAP_FILE}: id '${id}' 가 판정표에 없음`);
    }
  }

  if (strict && unfinished.length > 0) {
    fail(`${MAP_FILE}: --strict — done 이 아닌 행 ${unfinished.length}건 (${unfinished.join(' ')})`);
  }

  for (const line of warnings) console.log(`WARN ${line}`);
  for (const line of failures) console.log(line);
  if (failures.length > 0) {
    console.log('RESULT: FAIL');
    process.exitCode = 1;
  } else {
    console.log('RESULT: PASS');
  }
}
