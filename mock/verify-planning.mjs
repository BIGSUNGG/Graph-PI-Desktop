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
const reload = async () => { await page.goto(url); await page.waitForTimeout(500); };

await page.goto(url);
await page.waitForTimeout(500);

// 1. group create / preset required / manual / empty group
await page.click('#group-new');
await page.waitForTimeout(250);
await shot('planning-group-create.png');
await page.fill('#dlg-gname', '빈 오케스트레이션');
await page.click('#dlg-ok');
await page.waitForTimeout(250);
await shot('planning-group-required.png');
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
await shot('planning-board-badges.png');
await shot('planning-feature-worktrees.png');
await shot('planning-sidebar.png', page.locator('.sidebar'));
await session('s-onb-api');
await shot('planning-feature-question.png', page.locator('.sup-question'));
await shot('planning-readonly.png', page.locator('#inspector'));
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

// 3. loop preset / integration / fan-out / states
await group('g-loop');
await shot('planning-loop-worktrees.png');
await session('s-perf-hub');
await tab('goal');
await shot('planning-hub-goal.png', page.locator('.sup'));
await shot('planning-hub-aggregate.png', page.locator('.sup'));
await shot('planning-loop-integration.png', page.locator('.sup-panel'));
await tab('list');
await shot('planning-hub-fanout.png', page.locator('.sup-panel'));
await shot('planning-list-queue.png', page.locator('.sup-panel'));
await session('s-perf-index');
await tab('audit');
await shot('planning-session-audit.png', page.locator('.sup-panel'));
await shot('planning-audit-evidence.png', page.locator('.sup-panel'));
await session('s-perf-query');
await tab('goal');
await shot('planning-session-goal.png', page.locator('.sup-panel'));
await go('chat');
await shot('planning-agent-chat.png', page.locator('#chat-log'));
await session('s-perf-cache');
await tab('loop');
await shot('planning-loop-states.png', page.locator('.sup-panel'));
await session('s-perf-query');
await go('chat');
await shot('planning-agent-pending.png', page.locator('#chat-log'));

// 4. manual question / inline / sidebar / archive / blocked list
await group('g-manual');
await session('s-sec-audit');
await shot('planning-question.png', page.locator('.sup-question'));
await shot('planning-sidebar-question.png', page.locator('.sidebar'));
await go('chat');
await shot('planning-question-inline.png', page.locator('#chat-log'));
const qBefore = await page.locator('#chat-log [data-act="ask-answer"]').count();
if (qBefore < 1) errs.push('no question answer button');
else {
  await page.locator('#chat-log [data-act="ask-answer"]').first().click();
  await page.waitForTimeout(250);
  const qAfter = await page.locator('#chat-log [data-act="ask-answer"]').count();
  if (qAfter >= qBefore) errs.push('question did not resolve');
}
await group('g-fix');
await session('s-fix-perf');
await tab('loop');
await shot('planning-loop-bounds.png', page.locator('.sup-panel'));
await session('s-fix-hub');
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

// 7. coverage + screenshots
const md = fs.readFileSync(coveragePath, 'utf8');
const rows = md.split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l));
if (rows.length < 40) errs.push('COVERAGE rows < 40: ' + rows.length);
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
