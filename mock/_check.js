const fs = require('fs');
const html = fs.readFileSync('mock/index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
global.window = {};
eval(fs.readFileSync('mock/mock-data.js', 'utf8'));
const M = global.window.MOCK;
const hubIds = new Set(M.groups.filter((g) => g.hubSessionId).map((g) => g.hubSessionId));
const errs = [];
try { new Function(js); } catch (e) { errs.push('inline js syntax: ' + e.message); }
const ids = [...js.matchAll(/\$\("([a-z0-9-]+)"\)/g)].map((m) => m[1]);
const all = (html + js).replace(/\\"/g, '"');
const declared = new Set([...all.matchAll(/id="([a-z0-9-]+)"/g)].map((m) => m[1]));
for (const id of new Set(ids)) if (!declared.has(id)) errs.push('missing id: ' + id);
for (const v of ['board', 'chat', 'orch', 'history']) {
  if (!declared.has('view-' + v)) errs.push('missing view-' + v);
  if (!html.includes('data-view="' + v + '"')) errs.push('missing nav ' + v);
}
if (!/window\.MOCK/.test(fs.readFileSync('mock/mock-data.js', 'utf8'))) errs.push('MOCK not exported');
if (!M.sessions.every((s) => (s.wt == null ? hubIds.has(s.id) : M.worktrees.some((w) => w.id === s.wt)))) errs.push('session wt orphan');
if (!M.sessions.some((s) => (M.messages[s.id] || []).some((m) => m.role === 'tool'))) errs.push('no tool messages');
if ((M.messages['s-onb-hub'] || []).filter((m) => m.think).length < 1) errs.push('s-onb-hub think missing');
if (!M.tasks.every((t) => M.runs.some((r) => r.id === t.run))) errs.push('task run orphan');
if (!M.workers.every((w) => M.tasks.some((t) => t.id === w.task))) errs.push('worker task orphan');
const legacy = html.match(/#(?:7aa2f7|14171d|262b33|e7e9ee|5f6672|191d24|8a919e|5a6474|4a5160|3a1f24|1d3b2e|2e2717|1d2637|f07178|6ed3a1|e0af68|3a4150|a9b1c1)/g) || [];
if (legacy.length) errs.push('legacy hex: ' + legacy.join(','));
if ((html.match(/\.innerHTML\s*=/g) || []).length) errs.push('innerHTML assignment');
if (!fs.existsSync('mock/fonts/Geist-Variable.woff2')) errs.push('font missing');
for (const c of ['renderSidebar', 'wt-list', 'nav-search', 'tb-status']) if (!html.includes(c)) errs.push('missing ' + c);
if (!/\.app\{display:grid;grid-template-rows:var\(--tb\)/.test(html)) errs.push('shell grid missing');
if (!/--sidebar:#2a2a2a/.test(html)) errs.push('orca sidebar token missing');
if (!/font:13px\/1\.5 'Geist'/.test(html)) errs.push('Geist body font missing');
if (!/titlebar\{[\s\S]{0,200}?height:var\(--tb\)/.test(html)) errs.push('titlebar height missing');

// 보드 기하: 그룹 · 관리 세션 · 칩이 열 안에 들어가는지
const G = (html.match(/var G = \{ pad: (\d+), colW: (\d+), gap: (\d+), head: (\d+), rowH: (\d+), chipH: (\d+), hubH: (\d+) \}/) || []).slice(1).map(Number);
if (G.length !== 7) errs.push('G const missing');
else {
  const colW = G[1];
  const head = G[3];
  const rowH = G[4];
  const maxToolW = colW - 42;
  if (32 + maxToolW > colW - 10) errs.push('tool chip overflows column: ' + (32 + maxToolW) + ' > ' + (colW - 10));
  if (head + 4 + rowH < 40) errs.push('card header too short for one row');
}
if (!Array.isArray(M.groups) || M.groups.length !== 6) errs.push('groups !== 6');
if (M.worktrees.length !== 22) errs.push('worktrees !== 22');
if (M.sessions.length !== 33) errs.push('sessions !== 33');
if (M.tasks.length < 15) errs.push('tasks < 15');
if (M.workers.length < 8) errs.push('workers < 8');
if (M.gates.length < 6) errs.push('gates < 6');
if (!M.sessions.every((s) => s.group && M.groups.some((g) => g.id === s.group) && (s.wt == null ? hubIds.has(s.id) : M.worktrees.some((w) => w.id === s.wt && w.group === s.group)))) errs.push('session group mismatch');
for (const g of M.groups) {
  const h = g.hubSessionId ? M.sessions.filter((s) => s.id === g.hubSessionId)[0] : null;
  if (!h || h.removed) errs.push('group hub orphan: ' + g.id);
  else if (h.wt !== null) errs.push('hub session must bind no worktree: ' + g.id);
  else if (h.group !== g.id) errs.push('hub session group mismatch: ' + g.id);
}
if (M.worktrees.some((w) => w.hub === true)) errs.push('hub worktrees must be 0');
if (!M.sessions.every((s) => Array.isArray(M.messages[s.id]) && M.messages[s.id].length >= 1)) errs.push('session messages missing');
if (!M.worktrees.every((w) => w.loop == null || (w.loop.prompt && w.loop.maxRounds >= 1 && w.loop.round >= 0 && M.loopStates.includes(w.loop.status)))) errs.push('loop invalid');
if (!M.orcaOnly.every((o) => !o.blockedBy || M.groups.some((g) => g.id === o.blockedBy))) errs.push('orcaOnly blockedBy orphan');
if (!Object.keys(M.deletePreview).every((gid) => M.groups.some((g) => g.id === gid))) errs.push('deletePreview group orphan');
if (!M.worktrees.every((w) => M.groups.some((g) => g.id === w.group))) errs.push('worktree group orphan');
const hub = M.sessions.filter((s) => M.sessions.filter((k) => k.parent === s.id && k.wt !== s.wt).length >= 2)[0];
if (!hub) errs.push('hub session missing');
if (!M.sessions.some((s) => s.loop)) errs.push('loop session missing');
if (!M.sessions.some((s) => s.mergeTo)) errs.push('merge session missing');
const fixWts = M.worktrees.filter((w) => w.group === 'g-fix');
const fixRoots = fixWts.filter((w) => fixWts.some((k) => k.parent === w.id));
if (!(fixRoots.length === 1 && fixRoots[0].id === 'wt-develop')) errs.push('fix root must be wt-develop');
if (fixWts.filter((w) => w.parent === 'wt-develop').length !== 2) errs.push('develop child count !== 2');
for (const c of ['.edge-flow', '.edge-dot', 'prefers-reduced-motion', 'animateMotion']) if (!html.includes(c)) errs.push('missing ' + c);
if (html.includes('class="legend"')) errs.push('legend markup still present');

// 애니메이션 판정: 혼합 상태 픽스처 + 루프 경로
const MOTION = require('./motion.js');
if (MOTION.liveEdge('running', 'running') !== true) errs.push('liveEdge: both running must move');
if (MOTION.liveEdge('running', 'idle') !== false) errs.push('liveEdge: mixed must stay static');
if (MOTION.allLive([true, true]) !== true) errs.push('allLive: all true must move');
if (MOTION.allLive([true, false]) !== false) errs.push('allLive: mixed must stay static');
if (MOTION.allLive([]) !== false) errs.push('allLive: empty must stay static');
if (!/MOTION\.allLive\(\[topLive\]\.concat\(cols\.map/.test(js)) errs.push('trunk must require all children live');
if (!/MOTION\.allLive\(\[topLive, liveWt\(c\.wt\.id\)\]\)/.test(js)) errs.push('stub must require both endpoints');
if (!/class="loop-arc"[^;]*?marker-end="url\(#arwl\)"/.test(js)) errs.push('loop arc with marker-end missing');
if (html.includes('function liveEdge')) errs.push('unused liveEdge still defined inline');
if (!/<script src="\.\/motion\.js"><\/script>/.test(html)) errs.push('motion.js not loaded');

for (const c of ['#dialog .dialog-wide', '#dialog .dialog-xl', '#dialog .wizard', '#dialog .preset-grid', '#dialog .preset', '#dialog .preset .p-name', '#dialog .preset .p-desc', '#dialog .preset .p-tag', '.panel', '#dialog .kv', '#dialog .side-actions', '#dialog .hintx', '#dialog .del-list', '#dialog .del-item', '#dialog .stats', '#dialog .imp-row', '#dialog .imp-main', '#dialog .imp-name', '#dialog .imp-meta', '#dialog .tabs', '#dialog .tab', '#dialog .loop-actions', '#dialog .field', '#dialog .grid2', '#dialog .notice']) if (!html.includes(c)) errs.push('missing ' + c);
for (const c of ['insp-tools', '세션별 최근 도구', 'tool-row', 'data-tool']) if (!html.includes(c)) errs.push('missing ' + c);
for (const f of ['function lastTool', 'function toolName', 'function toolTextW', 'var maxW = c.w - 42', 'measureText']) if (!js.includes(f)) errs.push('missing ' + f);
for (const f of ['function applyView', 'function setZoom', 'function resetView', 'state.nodePts =', 'pointerdown']) if (!js.includes(f)) errs.push('missing ' + f);
for (const f of ['function sessionRoot', 'function defaultChat', 'function chatTarget', 'groupSessions(state.group)']) if (!js.includes(f)) errs.push('missing ' + f);
if (!M.runs.every((r) => M.groups.some((g) => g.id === r.group))) errs.push('run group missing');
for (const f of ['M.runs.filter(function (r) { return r.group === state.group; })', '(s.group || "") === state.group', 'histOpen', 'h-item', 'h-detail', 'h-ev', 'h-toggle', 'data-hist']) if (!html.includes(f)) errs.push('missing ' + f);
for (const c of ['.msg.user .bubble', '.think', '.think-line', '.tool-row', '.think-count', '.think .think-at', '.msg.agent .answer-at', '.tool-at']) if (!html.includes(c)) errs.push('missing ' + c);
if (html.includes('class="agent-head"')) errs.push('agent-head still rendered');
if (html.includes('<b>나</b>')) errs.push('user label still rendered');
if (html.includes('.msg.user .head b')) errs.push('user label style still present');
for (const f of ['function turnsOf', 'function thinkHTML', 'function turnHTML', 'function toolParts', 'function toolIcon', 'Thought for ', 'Thinking...', 'class="think"', 'msg user']) if (!js.includes(f)) errs.push('missing ' + f);
if (!M.sessions.some((s) => (M.messages[s.id] || []).some((m) => m.role === 'assistant' && m.think))) errs.push('no assistant think text');
if (!M.sessions.some((s) => (M.messages[s.id] || []).some((m) => m.role === 'assistant' && m.thinkFor > 0))) errs.push('no thinkFor data');
for (const f of ["function dfield", "function dopts", "size: 'dialog-xl'", "size: 'dialog-wide'", 'id="dlg-gdup"', 'id="dlg-gprompt"', 'id="dlg-wtbase"', 'id="dlg-wtmodel"', 'id="dlg-wtprompt"', 'data-loop-act="start"']) if (!js.includes(f)) errs.push('missing ' + f);

// 워크트리 추가 팝업의 레포지토리 선택
const REPOS = M.repos || [];
if (REPOS.length !== 6) errs.push('M.repos must list 6 repositories');
for (const w of M.worktrees.concat(M.orcaOnly)) if (w.repo !== 'hub' && !REPOS.includes(w.repo)) errs.push('seeded repo not in M.repos: ' + w.repo);
for (const f of ['id="dlg-wtrepo"', 'id="dlg-wtfilter"', "dfield('레포지토리'", '<option value="">전체</option>']) if (!js.includes(f)) errs.push('missing ' + f);
if (js.includes('repo: M.repo,')) errs.push('worktree create still hardcodes M.repo');

// 부모 저장소 + 허브
if (!M.workspacesRoot) errs.push('M.workspacesRoot missing');
if (typeof M.slug !== 'function') errs.push('M.slug missing');
for (const [name, want] of [
  ['고객 온보딩', 'gogaek-onboding'],
  ['구독 결제', 'gudok-gyeolje'],
  ['API 성능 루프', 'api-seongneung-rupeu'],
  ['릴리스 안정화', 'rilliseu-anjeonghwa'],
  ['결제 화면', 'gyeolje-hwamyeon'],
  ['보안 점검', 'boan-jeomgeom'],
  ['v2 스프린트', 'v2-seupeurinteu'],
  ['A  B!', 'a-b'],
  ['!!!', ''],
  ['🎉', '']
]) {
  const got = typeof M.slug === 'function' ? M.slug(name) : '';
  if (got !== want) errs.push('slug(' + name + '): ' + got);
}
for (const g of M.groups) if (g.parentRepo !== M.workspacesRoot + '\\' + M.slug(g.name)) errs.push('group parentRepo: ' + g.id + ' = ' + g.parentRepo);
for (const w of M.worktrees) {
  const g = M.groups.filter((x) => x.id === w.group)[0];
  if (!g) continue;
  const want = w.hub ? g.parentRepo : M.workspacesRoot + '\\' + M.slug(g.name) + '\\' + M.slug(w.name);
  if (!w.path) errs.push('worktree path missing: ' + w.id);
  else if (w.path !== want) errs.push('worktree path mismatch: ' + w.id + ' = ' + w.path);
}
if (/M\.repo(?!s)/.test(js)) errs.push('M.repo still referenced');
if (!js.includes('id="dlg-grepo"')) errs.push('missing id="dlg-grepo"');
if (!js.includes('id="dlg-grepo-edit"')) errs.push('missing id="dlg-grepo-edit"');
if (!/dfield\('부모 저장소'[\s\S]{0,240}?dfield\('모델'/.test(js)) errs.push('group create: model not on parent repo row');
if (!js.includes('id="dlg-gprompt" rows="4"')) errs.push('group create: prompt rows != 4');
if (!js.includes('id="dlg-wtprompt" rows="4"')) errs.push('worktree add: prompt rows != 4');
if (!js.includes('function inspChatHTML')) errs.push('missing function inspChatHTML');
for (const f of ['id="insp-thread"', 'id="insp-input"', 'id="insp-resize"', 'inspChatH']) if (!js.includes(f)) errs.push('missing ' + f);
if (js.includes('data-act="open-chat"')) errs.push('inspector chat button still present');

// 허브 오케스트레이션: Goal·List·Loop·Audit·TODO·질문·@참조
for (const f of ['data-tab="goal"', 'data-tab="list"', 'data-tab="loop"', 'data-tab="audit"', 'data-act="ask-answer"', 'data-slot="goal"', 'data-slot="list"', 'data-slot="loop"', 'data-slot="audit"', '목적: ', 'function supervisionHTML', 'function refCreateDialog', 'function questionHTML']) {
  if (!js.includes(f)) errs.push('missing planning hook ' + f);
}
if (!html.includes('id="ref-menu"')) errs.push('missing ref-menu');
if (!Array.isArray(M.goals) || M.goals.length < 10) errs.push('goals missing');
if (!Array.isArray(M.listItems) || M.listItems.length < 10) errs.push('listItems missing');
if (!Array.isArray(M.loops) || M.loops.length < 5) errs.push('loops missing');
if (!Array.isArray(M.audits) || M.audits.length < 8) errs.push('audits missing');
if (!Array.isArray(M.todos) || M.todos.length < 8) errs.push('todos missing');
if (!Array.isArray(M.questions) || !M.questions.some((q) => q.status === 'pending')) errs.push('pending question missing');
if (!Array.isArray(M.agentMessages) || !M.agentMessages.length) errs.push('agentMessages missing');
if (!Array.isArray(M.refProjects) || !M.refProjects.some((p) => p.branches.includes('feature/account'))) errs.push('refProjects missing');
if (!M.goals.every((g) => M.sessions.some((s) => s.id === g.sessionId))) errs.push('goal session orphan');
if (!M.audits.every((a) => M.goals.some((g) => g.id === a.goalId))) errs.push('audit goal orphan');
if (!M.audits.every((a) => a.scope === 'session' || a.scope === 'parent' || a.scope === 'group')) errs.push('audit scope invalid');
if (M.auditRuns || M.audits.some((a) => a.sessionId)) errs.push('legacy audit session shape remains');
const goalIds = new Set(M.goals.map((g) => g.id));
if (!M.goals.every((g) => Object.prototype.hasOwnProperty.call(g, 'parentGoalId') && (g.parentGoalId === null || goalIds.has(g.parentGoalId)))) errs.push('goal parentGoalId orphan');
const hasCycle = M.goals.some((g) => {
  let cur = g, seen = new Set();
  while (cur && cur.parentGoalId) {
    if (seen.has(cur.id)) return true;
    seen.add(cur.id);
    cur = M.goals.find((x) => x.id === cur.parentGoalId);
  }
  return false;
});
if (hasCycle) errs.push('goal parentGoalId cycle');
const auditFieldsOk = M.audits.every((a) => {
  const target = M.goals.find((g) => g.id === a.goalId);
  const hasChild = M.goals.some((g) => g.parentGoalId === a.goalId);
  const isHub = target && M.groups.some((g) => g.hubSessionId === target.sessionId);
  const payloadOk = a.state === 'skipped' ? Boolean(a.skipReason) : Boolean(a.verdict);
  if (!payloadOk) return false;
  if (a.scope === 'session') return !hasChild;
  if (a.scope === 'parent') return hasChild && !isHub;
  return Boolean(isHub);
});
if (!auditFieldsOk) errs.push('audit scope fields invalid');
if (!M.audits.some((a) => a.scope === 'group' && a.state === 'skipped')) errs.push('group audit skip example missing');
if (!M.loops.every((l) => M.goals.some((g) => g.id === l.goalId))) errs.push('loop goal orphan');
if (!M.listItems.every((li) => (!li.parentGoalId || M.goals.some((g) => g.id === li.parentGoalId)) && (!li.sessionId || M.sessions.some((s) => s.id === li.sessionId)))) errs.push('list goal/session orphan');
if (!M.todos.every((t) => M.groups.some((g) => g.id === t.groupId) && (!t.sessionId || M.sessions.some((s) => s.id === t.sessionId)))) errs.push('todo group/session orphan');
if (!M.questions.every((q) => M.sessions.some((s) => s.id === q.sessionId))) errs.push('question session orphan');
if (!M.agentMessages.every((m) => M.sessions.some((s) => s.id === m.from) && M.sessions.some((s) => s.id === m.to))) errs.push('agent message session orphan');

// 사이드바: 워크트리 선택 시 하위 세션 펼침 (승인 설계: .wt-item/.wt-chev/.wt-sess/.wt-sess-row/.wt-sess-empty)
for (const c of ['.wt-item', '.wt-chev', '.wt-sess', '.wt-sess-row', '.wt-sess-row.is-sel', '.wt-sess-name', '.wt-sess-time', '.wt-sess-empty']) {
  if (!html.includes(c)) errs.push('missing ' + c);
}
for (const f of ['state.sideOpenWt', 'data-sess="', 'aria-expanded', '[data-sess]', 'state.selected = { type: "session", id: sid };', 'state.selected = { type: "wt", id: wid };', '세션 없음']) {
  if (!js.includes(f)) errs.push('missing ' + f);
}
if (js.includes('state.openWt')) errs.push('state.openWt must be state.sideOpenWt');
if (js.includes('data-wt-toggle')) errs.push('caret toggle handler must not exist, row click toggles');
if (js.includes('function sessionsOf')) errs.push('sessionsOf is not in the approved design');
if (!js.includes('state.sideOpenWt = state.sideOpenWt === wid ? null : wid;')) errs.push('worktree row click must toggle the session list');
if (!js.includes('state.sideOpenWt = null;')) errs.push('group switch must clear the open worktree');
if (!/state\.view === "history"\) \{ setView\("chat"\); renderSidebar\(\); return; \}/.test(js)) errs.push('history session click must open chat');
if (js.includes('state.sideOpenWt = s.wt')) errs.push('board/chat must not auto-expand the sidebar');
if (/' data-sess="' \+ s\.id \+ '" data-wt=/.test(js)) errs.push('session row must not carry data-wt');
if ((js.match(/querySelectorAll\("\[data-sess\]"\)/g) || []).length !== 1) errs.push('sidebar session handler count !== 1');
console.log(
  errs.length
    ? 'FAIL\n' + errs.join('\n')
    : 'PASS ids=' + new Set(ids).size + ' sessions=' + M.sessions.length + ' worktrees=' + M.worktrees.length + ' tasks=' + M.tasks.length + ' workers=' + M.workers.length
);
process.exit(errs.length ? 1 : 0);
