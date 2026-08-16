import { defineConfig, devices } from '@playwright/test';

const isSingleProject = process.argv.some(arg => arg.startsWith('--project') || arg === '-p');

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
        channel: 'chrome',
        launchOptions: {
          args: ['--incognito'] // Open Chrome visually in Incognito
        }
      },
    },
    {
      name: 'msedge',
      use: { 
        ...devices['Desktop Edge'],
        channel: 'msedge',
        launchOptions: {
          args: ['--inprivate'] // Open Edge visually in InPrivate
        }
      },
    },
  ],
});
