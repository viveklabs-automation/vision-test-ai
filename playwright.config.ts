import { defineConfig, devices } from '@playwright/test';

const isSingleProject = process.argv.some(arg => arg.startsWith('--project') || arg === '-p');
const isCloudEnv = process.env.CI === 'true' || process.env.RENDER === 'true';

export default defineConfig({
  testDir: './output',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: isSingleProject ? 1 : undefined, // Force 1 worker for sequential runs when targeting a single project
  retries: 0,
  reporter: 'list',
  use: {
    actionTimeout: 15000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      use: { 
        ...devices['Desktop Chrome'],
        ...(isCloudEnv ? {} : { channel: 'chrome' }),
        launchOptions: {
          args: ['--incognito', '--no-sandbox', '--disable-setuid-sandbox']
        }
      },
    },
    {
      name: 'msedge',
      use: { 
        ...devices['Desktop Edge'],
        ...(isCloudEnv ? {} : { channel: 'msedge' }),
        launchOptions: {
          args: ['--inprivate', '--no-sandbox', '--disable-setuid-sandbox']
        }
      },
    },
  ],
});
