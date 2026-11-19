const fs = require('fs');
const html = fs.readFileSync('mock/index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
global.window = {};
eval(fs.readFileSync('mock/mock-data.js', 'utf8'));
const M = global.window.MOCK;
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
if (!M.sessions.every((s) => M.worktrees.some((w) => w.id === s.wt))) errs.push('session wt orphan');
if (!M.sessions.some((s) => (M.messages[s.id] || []).some((m) => m.role === 'tool'))) errs.push('no tool messages');
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
if (!Array.isArray(M.groups) || M.groups.length < 5) errs.push('groups missing');
if (M.worktrees.length < 15) errs.push('worktrees < 15');
if (M.sessions.length < 25) errs.push('sessions < 25');
if (M.tasks.length < 15) errs.push('tasks < 15');
if (M.workers.length < 8) errs.push('workers < 8');
if (M.gates.length < 6) errs.push('gates < 6');
if (!M.sessions.every((s) => s.group && M.worktrees.some((w) => w.id === s.wt && w.group === s.group))) errs.push('session group mismatch');
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
for (const f of ["function dfield", "function dopts", "size: 'dialog-xl'", "size: 'dialog-wide'", 'id="dlg-gdup"', 'id="dlg-gprompt"', 'id="dlg-wtbase"', 'id="dlg-wtmodel"', 'id="dlg-wtprompt"', 'data-loop-act="start"']) if (!js.includes(f)) errs.push('missing ' + f);
console.log(
  errs.length
    ? 'FAIL\n' + errs.join('\n')
    : 'PASS ids=' + new Set(ids).size + ' sessions=' + M.sessions.length + ' worktrees=' + M.worktrees.length + ' tasks=' + M.tasks.length + ' workers=' + M.workers.length
);
process.exit(errs.length ? 1 : 0);
