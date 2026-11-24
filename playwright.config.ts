import { defineConfig } from '@playwright/test'

// 테스트가 Electron 앱을 직접 launch 하므로 webServer를 두지 않는다.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  use: { trace: 'retain-on-failure' }
})
