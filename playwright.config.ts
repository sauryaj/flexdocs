import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 45000,
  use: { baseURL: process.env.TEST_BASE_URL, browserName: 'chromium' },
});
