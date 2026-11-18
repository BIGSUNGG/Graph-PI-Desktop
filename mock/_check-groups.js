// 그룹 프리셋 목업 검사 — repo 루트에서 `node mock/_check-groups.js`
// 의존성 없음. 실패하면 어떤 검사가 실패했는지 출력하고 exit 1.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const errs = [];
const htmlPath = path.join(__dirname, 'groups.html');
const dataPath = path.join(__dirname, 'groups-data.js');

function readText(p, label) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { errs.push(label + ' 읽기 실패: ' + e.message); return ''; }
}

const html = readText(htmlPath, 'groups.html');
const dataSrc = readText(dataPath, 'groups-data.js');

/* ---------- 1) groups.html 마지막 인라인 script 문법 ---------- */
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!inline.length) errs.push('groups.html: 인라인 script 없음');
else {
  try { new vm.Script(inline[inline.length - 1], { filename: 'groups.html#inline' }); }
  catch (e) { errs.push('groups.html 인라인 script 문법 오류: ' + e.message); }
}

/* ---------- 2) groups-data.js 를 vm sandbox 에서 실행 ---------- */
const sandbox = { window: {} };
vm.createContext(sandbox);
try {
  vm.runInContext(dataSrc, sandbox, { filename: 'groups-data.js' });
} catch (e) {
  errs.push('groups-data.js 실행 오류: ' + e.message);
}

const G = sandbox.window.GROUPS_MOCK;
const LOOP_STATES = ['idle', 'running', 'waiting', 'paused', 'done', 'stopped'];
const SESS_STATES = ['running', 'idle', 'done', 'failed'];

if (!G) {
  errs.push('window.GROUPS_MOCK 없음');
} else {
  const groups = Array.isArray(G.groups) ? G.groups : [];
  const wts = Array.isArray(G.worktrees) ? G.worktrees : [];
  const sess = Array.isArray(G.sessions) ? G.sessions : [];
  const gids = groups.map((g) => g.id);
  const wtIds = wts.map((w) => w.id);
  const sids = sess.map((s) => s.id);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  if (G.workspace !== 'graph-pi') errs.push('workspace 는 graph-pi 여야 함: ' + G.workspace);
  if (!G.repo) errs.push('repo 없음');
  if (!Array.isArray(G.presets) || G.presets.length !== 3) errs.push('presets 3개여야 함');
  if (!Array.isArray(G.models) || !G.models.length) errs.push('models 없음');

  if (groups.length !== 3) errs.push('groups 3개여야 함: ' + groups.length);
  if (new Set(gids).size !== gids.length) errs.push('group id 중복');
  for (const g of groups) {
    if (!g.name) errs.push('group name 없음: ' + g.id);
    if ('preset' in g) errs.push('그룹에 preset 저장 금지: ' + g.id);
  }
  if (!groups.some((g) => g.id === 'g-feature')) errs.push('g-feature 그룹 없음');
  if (!groups.some((g) => g.id === 'g-loop')) errs.push('g-loop 그룹 없음');
  if (!groups.some((g) => g.id === 'g-manual')) errs.push('g-manual 그룹 없음');

  if (new Set(wtIds).size !== wtIds.length) errs.push('worktree id 중복 (한 워크트리가 두 그룹에 속함)');
  for (const w of wts) {
    if (!w.group) errs.push('worktree group 없음: ' + w.id);
    else if (!groupById.has(w.group)) errs.push('worktree group 미존재: ' + w.id + ' → ' + w.group);
    if (w.parent === null || w.parent === undefined) {
      if (w.parent !== null) errs.push('worktree parent 는 id 또는 null: ' + w.id);
    } else {
      const p = wts.find((x) => x.id === w.parent);
      if (!p) errs.push('worktree parent 미존재: ' + w.id + ' → ' + w.parent);
      else if (p.group !== w.group) errs.push('worktree parent 그룹 불일치: ' + w.id);
    }
    if (typeof w.dirty !== 'boolean') errs.push('worktree dirty 는 boolean: ' + w.id);
    if (typeof w.orcaMissing !== 'boolean') errs.push('worktree orcaMissing 은 boolean: ' + w.id);
    if (!w.name || !w.branch) errs.push('worktree name/branch 없음: ' + w.id);
  }

  const feat = groups.find((g) => g.id === 'g-feature');
  if (!feat) errs.push('g-feature 그룹 없음');
  else {
    if (feat.id !== 'g-feature') errs.push('feature 그룹 id 는 g-feature 여야 함');
    if (!feat.hubSessionId) errs.push('feature 그룹 hubSessionId 없음');
    const hub = sess.find((s) => s.id === feat.hubSessionId);
    if (!hub) errs.push('허브 세션 미존재: ' + feat.hubSessionId);
    else if (!wts.some((w) => w.id === hub.wt && w.group === feat.id)) errs.push('허브 세션 워크트리가 feature 그룹 소속이 아님');
  }

  const loopGroup = groups.find((g) => g.id === 'g-loop');
  if (!loopGroup) errs.push('g-loop 그룹 없음');
  else {
    const children = wts.filter((w) => w.group === loopGroup.id && w.parent);
    if (!children.length) errs.push('loop 그룹 자식 워크트리 없음');
    const statuses = new Set();
    for (const c of children) {
      if (!c.loop) { errs.push('loop 자식에 loop 설정 없음: ' + c.id); continue; }
      if (!c.loop.prompt) errs.push('loop prompt 없음: ' + c.id);
      if (!(c.loop.maxRounds > 0)) errs.push('loop maxRounds 값 이상: ' + c.id);
      if (!(c.loop.round >= 0)) errs.push('loop round 값 이상: ' + c.id);
      if (!LOOP_STATES.includes(c.loop.status)) errs.push('loop status 값 이상: ' + c.id + ' → ' + c.loop.status);
      statuses.add(c.loop.status);
    }
    if (statuses.size < 2) errs.push('loop 자식 상태가 다양하지 않음: ' + [...statuses].join(','));
  }
  for (const w of wts) {
    if (w.loop && !LOOP_STATES.includes(w.loop.status)) errs.push('loop status 값 이상: ' + w.id + ' → ' + w.loop.status);
  }

  const manual = groups.find((g) => g.id === 'g-manual');
  if (!manual) errs.push('g-manual 그룹 없음');
  else {
    const roots = wts.filter((w) => w.group === manual.id && !w.parent);
    if (roots.length !== 2) errs.push('manual 그룹 루트 2개여야 함: ' + roots.length);
    if (!wts.some((w) => w.group === manual.id && w.loop)) errs.push('manual 그룹에 수동 loop 설정 없음');
  }

  const missing = wts.filter((w) => w.orcaMissing);
  if (missing.length < 1) errs.push('orcaMissing 사례 없음 (화면⑥)');

  if (!sess.length) errs.push('sessions 없음');
  if (new Set(sids).size !== sids.length) errs.push('session id 중복');
  for (const s of sess) {
    if (!wtIds.includes(s.wt)) errs.push('session wt 미존재: ' + s.id + ' → ' + s.wt);
    if (!groupById.has(s.group)) errs.push('session group 미존재: ' + s.id);
    if (!SESS_STATES.includes(s.state)) errs.push('session state 값 이상: ' + s.id + ' → ' + s.state);
    if (s.parent && !sids.includes(s.parent)) errs.push('session parent 미존재: ' + s.id + ' → ' + s.parent);
  }

  const dp = G.deletePreview;
  if (!dp) errs.push('deletePreview 없음');
  else {
    for (const g of groups) {
      const pv = dp[g.id];
      if (!pv) { errs.push('deletePreview 누락: ' + g.id); continue; }
      const own = wts.filter((w) => w.group === g.id);
      const gs = sess.filter((s) => s.group === g.id || own.some((w) => w.id === s.wt));
      if (!Array.isArray(pv.worktreeIds)) errs.push('deletePreview worktreeIds 배열 아님: ' + g.id);
      else {
        if (pv.worktreeIds.length !== own.length) errs.push('deletePreview worktreeIds 개수 불일치: ' + g.id);
        if (!pv.worktreeIds.every((id) => own.some((w) => w.id === id))) errs.push('deletePreview worktreeIds 에 다른 그룹 워크트리: ' + g.id);
      }
      const running = gs.filter((s) => s.state === 'running').length;
      const dirty = own.filter((w) => w.dirty).length;
      if (pv.runningSessions !== running) errs.push('deletePreview runningSessions 불일치: ' + g.id + ' ' + pv.runningSessions + ' != ' + running);
      if (pv.dirtyWorktrees !== dirty) errs.push('deletePreview dirtyWorktrees 불일치: ' + g.id + ' ' + pv.dirtyWorktrees + ' != ' + dirty);
      if (pv.sessionCount !== gs.length) errs.push('deletePreview sessionCount 불일치: ' + g.id);
    }
  }

  if (!Array.isArray(G.orcaOnly) || !G.orcaOnly.length) errs.push('orcaOnly 목록 없음');
  else if (!G.orcaOnly.some((x) => x.blockedBy)) errs.push('orcaOnly 다른 그룹 소속(비활성) 사례 없음');
}

/* ---------- 3) groups.html 필수 문자열 / 구조 ---------- */
const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
if (srcs.length !== 1 || srcs[0] !== './groups-data.js') errs.push('groups-data.js 만 script 로 로드해야 함: ' + srcs.join(','));
for (let n = 1; n <= 6; n++) {
  if (!html.includes('data-screen="' + n + '"')) errs.push('화면 스위처 data-screen="' + n + '" 없음');
}
for (const text of ['그룹 만들기', '기존 불러오기', '다시 만들기', '그룹에서 제거', '히스토리에 남습니다', 'Orca에서 함께 삭제']) {
  if (!html.includes(text)) errs.push('필수 문자열 없음: ' + text);
}
for (const act of ['preset', 'hub-start', 'loop-enable']) {
  if (!html.includes('data-act="' + act + '"')) errs.push('필수 액션 없음: ' + act);
}
if (!/btn danger/.test(html)) errs.push('파괴적 확인 버튼(.btn danger) 없음');
if (/https?:\/\//.test(html)) errs.push('외부 네트워크 요청(http/https) 발견');

/* ---------- 결과 ---------- */
if (errs.length) {
  console.log('FAIL\n- ' + errs.join('\n- '));
  process.exit(1);
}

const wts = G.worktrees;
console.log(
  'PASS screens=6 groups=' + G.groups.length +
  ' worktrees=' + wts.length +
  ' sessions=' + G.sessions.length +
  ' loops=' + wts.filter((w) => w.loop).length +
  ' orcaMissing=' + wts.filter((w) => w.orcaMissing).length
);
process.exit(0);
