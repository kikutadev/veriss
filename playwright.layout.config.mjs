import { defineConfig } from '@playwright/test';
import { isolatedFirefoxAppData } from './tools/firefox-app-data.mjs';
const firefoxData = isolatedFirefoxAppData();
process.once('exit', firefoxData.cleanup);
// The layout e2e in Chromium (the reference the static checks are proved against), and in Firefox and WebKit to see
// where their CSS baselines (UA styles, defaults, rendering) differ: `--project chromium|firefox|webkit`.
export default defineConfig({
    testDir: './e2e', testMatch: 'layout*.spec.mjs', workers: 1,
    use: { headless: true },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
        { name: 'firefox', use: { browserName: 'firefox', launchOptions: { env: firefoxData.env } } },
        { name: 'webkit', use: { browserName: 'webkit' } },
    ],
});
