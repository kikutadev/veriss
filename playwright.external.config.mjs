// Live third-party demos are deliberately excluded from the offline release gate.
// They have network and deployment dependencies outside veriss's control.
import { defineConfig } from '@playwright/test';
import { isolatedFirefoxAppData } from './tools/firefox-app-data.mjs';
const firefoxData = isolatedFirefoxAppData();
process.once('exit', firefoxData.cleanup);
export default defineConfig({
    testDir: './e2e', testMatch: 'external-authenticated-ui.spec.mjs', workers: 1,
    timeout: 60000, expect: { timeout: 12000 }, retries: 0,
    use: { headless: true, trace: 'off', actionTimeout: 8000 },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
        { name: 'firefox', use: { browserName: 'firefox', launchOptions: { env: firefoxData.env } } },
        { name: 'webkit', use: { browserName: 'webkit' } }
    ]
});
