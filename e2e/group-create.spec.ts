/**
 * 수용기준 17(SPEC-hub-orchestration 572): Feature·Loop 는 첫 프롬프트가 필수이고
 * Manual 은 비워도 만들 수 있다. 생성 버튼 상태로 확인한다(실제 생성은 IPC 부작용이 커서 다루지 않는다).
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const data = mkdtempSync(join(tmpdir(), 'graph-pi-create-'))
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, GRAPH_PI_DATA_DIR: data, NODE_ENV: 'production' },
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1240, height: 860 })
  await expect(page.locator('.app')).toBeVisible()
  return { app, page }
}

test('Feature·Loop 는 첫 프롬프트가 있어야 만들 수 있고 Manual 은 비워도 된다', async () => {
  const { app, page } = await launch()
  try {
    await page.locator('.side-add').click()
    const dialog = page.locator('.dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })

    const submit = dialog.locator('.btn.primary')
    const prompt = dialog.locator('textarea')
    const hint = dialog.locator('.hint', { hasText: '첫 프롬프트를 입력해야' })

    await dialog.locator('.preset:has(b:text-is("Feature"))').click()
    await expect(prompt).toHaveValue('')
    await expect(submit).toBeDisabled()
    await expect(hint).toBeVisible()

    await prompt.fill('로그인 API와 화면 목업을 만들어줘.')
    await expect(submit).toBeEnabled()
    await expect(hint).toHaveCount(0)

    await dialog.locator('.preset:has(b:text-is("Loop"))').click()
    await prompt.fill('')
    await expect(submit).toBeDisabled()

    await dialog.locator('.preset:has(b:text-is("Manual"))').click()
    await expect(submit).toBeEnabled()
    await expect(hint).toHaveCount(0)
  } finally {
    await app.close()
  }
})
