import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 앱이 실제로 뜨는지 확인하는 최소 스모크. 오케스트레이터/Orca CLI 가 없어도 창과 셸은 렌더되어야 한다.
 * 데이터 디렉터리는 임시 폴더로 격리해 사용자의 실제 그룹 상태를 건드리지 않는다.
 */
test('앱이 부팅되고 보드 셸이 렌더된다', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'graph-pi-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      GRAPH_PI_DATA_DIR: dataDir,
      NODE_ENV: 'production',
    },
  });

  const window = await app.firstWindow();
  await expect(window.locator('.app')).toBeVisible();

  // 좌측 레일과 뷰 전환 컨트롤이 목업 클래스 그대로 존재한다.
  await expect(window.locator('.sidebar, .rail').first()).toBeVisible();
  await expect(window.locator('.topbar').first()).toBeVisible();

  // 뷰 전환: 대화 화면으로 갔다가 보드로 돌아온다.
  await window.getByRole('tab', { name: '대화' }).click();
  await expect(window.getByRole('tab', { name: '대화' })).toHaveAttribute('aria-selected', 'true');
  await window.getByRole('tab', { name: '보드' }).click();
  await expect(window.getByRole('tab', { name: '보드' })).toHaveAttribute('aria-selected', 'true');

  await app.close();
});
