/**
 * 화면 흐름 E2E. `e2e/app.spec.ts` 와 같은 실행 관례(임시 데이터 디렉터리 + Electron launch)를 따른다.
 * 여기서는 뷰 전환·그룹 다이얼로그·대화 빈 상태·인스펙터 탭 4가지만 확인한다(선택자는 실제 컴포넌트 기준).
 */
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VIEW_TABS = [
  { tab: '보드', section: '#view-board' },
  { tab: '대화', section: '#view-chat' },
  { tab: '오케스트레이션', section: '#view-orch' },
  { tab: '히스토리', section: '#view-history' }
] as const;

const INSPECTOR_TABS = ['Goal', 'List', 'Loop', 'Audit'] as const;

async function launchApp() {
  const dataDir = await mkdtemp(join(tmpdir(), 'graph-pi-flows-'));
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      GRAPH_PI_DATA_DIR: dataDir,
      NODE_ENV: 'production'
    }
  });
  const window = await app.firstWindow();
  await expect(window.locator('.app')).toBeVisible();
  return { app, window, dataDir };
}

/** 임시 데이터 디렉터리를 매번 지운다(테스트가 사용자 그룹 상태를 오염시키지 않게). */
async function closeApp(app: Awaited<ReturnType<typeof electron.launch>>, dataDir: string): Promise<void> {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}

test('4개 화면 탭을 차례로 누르면 각 뷰 섹션이 보인다', async () => {
  const { app, window, dataDir } = await launchApp();
  try {
    for (const view of VIEW_TABS) {
      const tab = window.getByRole('tab', { name: view.tab });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(window.locator(view.section)).toBeVisible();
    }
  } finally {
    await closeApp(app, dataDir);
  }
});

test('사이드바 "새 그룹" 은 #dialog 백드롭과 .dialog 를 열고 Esc 로 닫힌다', async () => {
  const { app, window, dataDir } = await launchApp();
  try {
    // 버튼의 접근 이름은 title="새 그룹" 이다(사이드바의 + 버튼).
    await window.getByTitle('새 그룹').click();
    await expect(window.locator('#dialog')).toBeVisible();
    await expect(window.locator('#dialog .dialog')).toBeVisible();
    await expect(window.locator('#dialog .dialog h2')).toHaveText('새 그룹');

    await window.keyboard.press('Escape');
    await expect(window.locator('#dialog')).toHaveCount(0);
  } finally {
    await closeApp(app, dataDir);
  }
});

test('세션이 없는 대화 뷰는 안내 문구를 보여준다', async () => {
  const { app, window, dataDir } = await launchApp();
  try {
    await window.getByRole('tab', { name: '대화' }).click();
    await expect(window.locator('#view-chat')).toBeVisible();
    await expect(window.locator('#view-chat .chat-list')).toContainText('세션이 없습니다');
  } finally {
    await closeApp(app, dataDir);
  }
});

test('인스펙터 Goal/List/Loop/Audit 탭을 누르면 aria-selected 가 따라간다', async () => {
  const { app, window, dataDir } = await launchApp();
  try {
    await window.getByRole('tab', { name: '보드' }).click();
    await expect(window.locator('.insp-tabs')).toBeVisible();

    for (const name of INSPECTOR_TABS) {
      const tab = window.getByRole('tab', { name });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      for (const other of INSPECTOR_TABS) {
        if (other === name) continue;
        await expect(window.getByRole('tab', { name: other })).toHaveAttribute('aria-selected', 'false');
      }
    }
  } finally {
    await closeApp(app, dataDir);
  }
});
