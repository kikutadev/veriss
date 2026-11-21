import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export function isolatedFirefoxAppData(environment = process.env, platform = process.platform) {
    if (platform !== 'darwin' || (environment.MOZ_APP_DATA && environment.MOZ_LOCAL_APP_DATA)) {
        return { env: environment, cleanup() { } };
    }
    const root = mkdtempSync(join(tmpdir(), 'veriss-firefox-'));
    const env = {
        ...environment,
        MOZ_APP_DATA: environment.MOZ_APP_DATA || join(root, 'state'),
        MOZ_LOCAL_APP_DATA: environment.MOZ_LOCAL_APP_DATA || join(root, 'cache'),
    };
    let cleaned = false;
    return {
        env,
        cleanup() {
            if (cleaned)
                return;
            rmSync(root, { recursive: true, force: true });
            cleaned = true;
        },
    };
}
