import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const ev = path.join(root, '_evidence');
const coveragePath = path.join(root, 'COVERAGE.md');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.on('pageerror', e => errs.push('page: ' + e.message));

const url = pathToFileURL(path.join(root, 'index.html')).href;
const shot = async (name, locator) => {
  await page.waitForTimeout(180);
  if (locator) await locator.screenshot({ path: path.join(ev, name) });
  else await page.screenshot({ path: path.join(ev, name) });
};
const go = async (view) => { await page.click(`[data-view="${view}"]`); await page.waitForTimeout(250); };
const group = async (gid) => { if (!(await page.locator('#view-board').isVisible())) await go('board'); await page.click(`[data-grp="${gid}"]`); await page.waitForTimeout(300); };
const session = async (sid) => { if (!(await page.locator('#view-board').isVisible())) await go('board'); await page.locator(`g[data-session="${sid}"]`).evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await page.waitForTimeout(300); };
const tab = async (name) => { await page.click(`.sup-tab[data-tab="${name}"]`); await page.waitForTimeout(160); };
const contains = async (sel, needle, label) => {
  try {
    const t = await page.locator(sel).first().innerText();
    if (!t.includes(needle)) errs.push(label + ' (missing ' + needle + ')');
  } catch { errs.push(label + ' (selector ' + sel + ')'); }
};
const reload = async () => { await page.goto(url); await page.waitForTimeout(500); };

await page.goto(url);
await page.waitForTimeout(500);

// 1. group create / preset required / manual / empty group
await page.click('#group-new');
await page.waitForTimeout(250);
if (await page.locator('.preset').count() < 3) errs.push('preset cards < 3');
await shot('planning-group-create.png');
await page.fill('#dlg-gname', '빈 오케스트레이션');
await page.click('#dlg-ok');
await page.waitForTimeout(250);
await shot('planning-group-required.png');
await contains('#dialog', '이 프리셋은 첫 프롬프트가 필요합니다.', 'preset required error');
await page.click('[data-preset="manual"]');
await page.waitForTimeout(160);
await shot('planning-manual.png');
await page.click('#dlg-ok');
await page.waitForTimeout(350);
await shot('planning-group-created.png');
await reload();

// 2. feature board / sessions / question
await group('g-feature');
await shot('planning-overview.png');
await shot('planning-slot-priority.png');
await shot('planning-board-badges.png');
const badSlots = await page.locator('.slot-badges').evaluateAll(els => els.filter(e => e.querySelectorAll('[data-slot]').length !== 4).length);
if (badSlots) errs.push('slot containers without 4 slots: ' + badSlots);
await shot('planning-feature-worktrees.png');
await shot('planning-sidebar.png', page.locator('.sidebar'));
await session('s-onb-api');
await tab('audit');
await shot('planning-session-audit-complete.png', page.locator('.sup-panel'));
await contains('.sup-panel', '세션 Audit', 'session audit scope');
await contains('.sup-panel', '승인', 'session audit approved');
await shot('planning-readonly.png', page.locator('#inspector'));
await group('g-feature');
await session('s-onb-hub');
await tab('audit');
await shot('planning-group-audit-gate.png', page.locator('.audit-gate'));
await shot('planning-group-audit-skip.png', page.locator('.audit-card.skipped'));
await contains('.audit-gate', '시작 가능 · 2/2', 'group audit gate ready');
await contains('.audit-card.skipped', '통합 감사 생략', 'group audit skipped');
await contains('.audit-card.skipped', 'audit-agent', 'group audit skip actor');
const gateStyle = await page.locator('.audit-gate.ready').evaluate(el => {
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, border: cs.borderTopColor };
});
if (gateStyle.bg === 'rgba(0, 0, 0, 0)') errs.push('group audit gate ready has no background');
if (await page.locator('.sup-panel').innerText().then(t => t.includes('Audit 세션'))) errs.push('standalone audit session still shown');
await session('s-onb-web');
await tab('audit');
await shot('planning-parent-audit.png', page.locator('.sup-panel'));
await contains('.sup-panel', '상위 세션 Audit', 'parent audit scope');
await contains('.audit-gate', '시작 가능 · 1/1 자식 Goal 승인', 'parent audit gate ready');
await contains('.sup-panel', '승인', 'parent audit approved');
await contains('.sup-panel', '자식 QA 1/1 포함', 'parent audit child integration');
await contains('.sup-panel', '이전 감사', 'audit history');
await session('s-onb-web');
await go('chat');
await page.locator('#chat-log').evaluate(el => { el.scrollTop = 0; });
await shot('planning-feature-mockup.png', page.locator('#chat-log'));
await page.locator('.agent-msg').last().scrollIntoViewIfNeeded();
await shot('planning-feature-api.png', page.locator('#chat-log'));
await shot('planning-chat.png');
await session('s-onb-web');
await shot('planning-todo.png', page.locator('.todo-panel'));
await shot('planning-todo-status.png', page.locator('.todo-panel'));
await contains('.todo-panel', '그룹', 'todo group');
await contains('.todo-panel', '세션', 'todo session');
if (await page.locator('.todo-panel button').count()) errs.push('todo panel is not read-only');

// 3. loop preset / integration / fan-out / audit
await group('g-loop');
await shot('planning-loop-worktrees.png');
await session('s-perf-hub');
await tab('goal');
await shot('planning-hub-goal.png', page.locator('.sup'));
await shot('planning-hub-autonomy.png', page.locator('.sup'));
await contains('.sup', '허브 활동', 'hub actions');
await contains('.sup', '확인 없음', 'hub confirmation-free action');
await tab('audit');
await shot('planning-group-audit-wait.png', page.locator('.audit-gate'));
await contains('.audit-gate', '대기 · 1/3', 'group audit gate wait');
const waitStyle = await page.locator('.audit-gate.wait').evaluate(el => getComputedStyle(el).backgroundColor);
if (waitStyle === 'rgba(0, 0, 0, 0)') errs.push('group audit gate wait has no background');
await tab('goal');
await shot('planning-hub-aggregate.png', page.locator('.sup'));
await shot('planning-loop-integration.png', page.locator('.sup-panel'));
await tab('list');
await shot('planning-hub-fanout.png', page.locator('.sup-panel'));
await shot('planning-list-queue.png', page.locator('.sup-panel'));
await session('s-perf-index');
await tab('audit');
await shot('planning-audit-evidence.png', page.locator('.sup-panel'));
await contains('.sup-panel', 'pass', 'audit criteria pass');
await session('s-perf-query');
await tab('goal');
await shot('planning-session-goal.png', page.locator('.sup-panel'));
await go('chat');
await shot('planning-agent-chat.png', page.locator('#chat-log'));
await session('s-perf-query');
await shot('planning-question-pending.png', page.locator('.sup-question'));
await session('s-perf-cache');
await tab('loop');
await shot('planning-loop-states.png', page.locator('.sup-panel'));
await tab('audit');
await shot('planning-audit-rejected.png', page.locator('.sup-panel'));
await contains('.sup-panel', '거부', 'audit rejected');
await session('s-perf-query');
await go('chat');
await shot('planning-agent-pending.png', page.locator('#chat-log'));
await shot('planning-agent-failed.png', page.locator('#chat-log'));
await contains('#chat-log', '전달 실패', 'agent delivery failure');

// 4. manual question / inline / sidebar / archive / blocked list
await group('g-manual');
await session('s-sec-audit');
await shot('planning-question.png', page.locator('.sup-question'));
await shot('planning-sidebar-question.png', page.locator('.sidebar'));
await shot('planning-board-question.png');
if (await page.locator('[data-attn="question"]').count() < 1) errs.push('board question attention missing');
await go('chat');
await shot('planning-question-inline.png', page.locator('#chat-log'));
const qBefore = await page.locator('#chat-log [data-act="ask-answer"]').count();
if (qBefore < 1) errs.push('no question answer button');
else {
  await page.locator('#chat-log [data-act="ask-answer"]').first().click();
  await page.waitForTimeout(250);
  const qAfter = await page.locator('#chat-log [data-act="ask-answer"]').count();
  if (qAfter >= qBefore) errs.push('question did not resolve');
  if (await page.locator('#inspector [data-act="ask-answer"]').count()) errs.push('inspector question did not sync');
}
await group('g-fix');
await session('s-fix-sec');
await tab('audit');
await shot('planning-audit-impossible.png', page.locator('.sup-panel'));
await contains('.sup-panel', '불가능', 'audit impossible');
await tab('list');
await page.click('[data-act="arch-toggle"]');
await page.waitForTimeout(200);
await shot('planning-archive-failed.png', page.locator('.sup-panel'));
await contains('.sup-panel', '불가능', 'blocked archive');
await session('s-fix-perf');
await tab('loop');
await shot('planning-loop-bounds.png', page.locator('.sup-panel'));
await session('s-fix-hub');
await tab('audit');
await shot('planning-group-audit-none.png', page.locator('.sup-panel'));
await contains('.sup-panel', '그룹 Goal이 만든 세션의 작업을 통합 검사', 'group audit scope heading');
await contains('.sup-panel', '그룹 Goal이 만든 세션에서 진행된 Goal이 없어', 'group audit no group-created goal');
if (await page.locator('.audit-gate').count()) errs.push('group audit gate shown without group-created goal');
await tab('list');
await shot('planning-list-queue.png', page.locator('.sup-panel'));
await group('g-feature');
await session('s-onb-web');
await tab('list');
await page.click('[data-act="arch-toggle"]');
await page.waitForTimeout(200);
await shot('planning-archive.png', page.locator('.sup-panel'));

// 5. @ references
await group('g-feature');
await go('chat');
await page.fill('#chat-input', '@');
await page.dispatchEvent('#chat-input', 'input');
await page.waitForTimeout(200);
if (!(await page.locator('#ref-menu').isVisible())) errs.push('ref menu not visible');
if ((await page.locator('#ref-menu .ref-item').count()) < 3) errs.push('ref menu projects < 3');
await shot('planning-ref-menu.png');
await page.locator('#ref-menu .ref-item', { hasText: 'Backend' }).click();
await page.fill('#chat-input', '@backend/feature');
await page.dispatchEvent('#chat-input', 'input');
await page.waitForTimeout(200);
await page.locator('#ref-menu .ref-item', { hasText: 'feature/account' }).click();
await page.waitForTimeout(250);
if (!(await page.locator('#dialog').isVisible())) errs.push('worktree create dialog not shown');
await shot('planning-ref-create.png', page.locator('#dialog'));
await page.click('#dlg-cancel');
await page.waitForTimeout(200);
await page.fill('#chat-input', '@backend/feature/account');
await page.dispatchEvent('#chat-input', 'input');
await page.waitForTimeout(200);
await shot('planning-ref-branch.png');
await page.fill('#chat-input', '@backend');
await page.dispatchEvent('#chat-input', 'input');
await page.waitForTimeout(200);
await page.locator('#ref-menu .ref-item', { hasText: 'src/routes/onboarding.ts' }).click();
await page.waitForTimeout(200);
await shot('planning-ref-file.png');
await page.fill('#chat-input', '@backend/src/routes/onboarding.ts 기준으로 API 연결 계획을 정리해.');
await page.press('#chat-input', 'Enter');
await page.waitForTimeout(450);
if (!(await page.locator('#chat-log').innerText()).includes('@backend/src/routes/onboarding.ts')) errs.push('ref not handed off to prompt');
await shot('planning-ref-prompt.png', page.locator('#chat-log'));
await page.fill('#chat-input', '@nope');
await page.dispatchEvent('#chat-input', 'input');
await page.waitForTimeout(150);
await page.press('#chat-input', 'Enter');
await page.waitForTimeout(250);
if (!(await page.locator('#toast').innerText()).includes('해석하지 못한')) errs.push('unresolved ref not blocked');
await shot('planning-ref-blocked.png');

// 6. ADE views / worktree dialog / 4 tabs + 4 slots
await page.fill('#chat-input', '');
await go('orch');
await contains('#view-orch', '목적', 'run purpose label');
await shot('planning-run-purpose.png');
await shot('planning-orch.png');
await go('history');
await shot('planning-history.png');
await go('board');
await group('g-feature');
const tabs = await page.locator('.sup-tab').count();
if (tabs !== 4) errs.push('sup tabs !== 4: ' + tabs);
for (const t of ['goal', 'list', 'loop', 'audit']) if (!(await page.locator(`.sup-tab[data-tab="${t}"]`).count())) errs.push('missing tab ' + t);
const slots = await page.locator('[data-slot]').count();
if (slots < 4 || slots % 4 !== 0) errs.push('slot count not 4x: ' + slots);
await page.click('[data-act="wt-new"]');
await page.waitForTimeout(250);
await shot('planning-worktree-add.png', page.locator('#dialog'));
await page.click('#dlg-cancel');

await group('g-billing');
await session('s-bill-web');
await tab('audit');
await shot('planning-audit-error.png', page.locator('.sup-panel'));
await contains('.sup-panel', '오류', 'audit error');

await reload();
await group('g-loop');
await session('s-perf-query');
await shot('planning-question-persist.png', page.locator('.sup-question'));
if (await page.locator('.sup-question').count() < 1) errs.push('question not persisted after reload');

await page.goto(url + '#harness-missing');
await page.waitForTimeout(500);
await group('g-feature');
await session('s-onb-hub');
await shot('planning-harness-missing.png');
if (!(await page.locator('#harness-banner').isVisible())) errs.push('harness banner not visible');
await contains('.sup-empty', '비활성', 'harness disabled message');
if (await page.locator('[data-slot]').count()) errs.push('harness missing still shows slots');
if (await page.locator('.audit-run').count()) errs.push('harness missing still shows audit card');
if (await page.locator('#slot-legend').isVisible()) errs.push('harness missing still shows legend');
await reload();

// 7. coverage + screenshots
const md = fs.readFileSync(coveragePath, 'utf8');
const rows = md.split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l));
if (rows.length < 44) errs.push('COVERAGE rows < 44: ' + rows.length);
for (const r of rows) {
  if (!/`planning-[a-z-]+\.png`/.test(r)) errs.push('COVERAGE row missing screenshot: ' + r.slice(0, 60));
  if (!/(SPEC-hub-orchestration|SPEC-graph-pi-ade|같은 문서)/.test(r)) errs.push('COVERAGE row missing SPEC ref: ' + r.slice(0, 60));
}
const refs = [...new Set([...md.matchAll(/`(planning-[a-z-]+\.png)`/g)].map(m => m[1]))];
for (const f of refs) {
  const p = path.join(ev, f);
  if (!fs.existsSync(p) || fs.statSync(p).size === 0) errs.push('missing screenshot ' + f);
}
console.log(JSON.stringify({ rows: rows.length, screenshots: refs.length, tabs, slots, errors: errs }, null, 2));
await browser.close();
if (errs.length) process.exit(1);
