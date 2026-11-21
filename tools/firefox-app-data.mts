import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Firefox on macOS 27 may fail to read the shared Firefox application-data
 * directory from a CLI-launched process, even when -profile is writable.
 * Keep the per-test Firefox app data separate from real Firefox user data.
 *
 * The caller owns cleanup. Leave explicit overrides and non-macOS unchanged.
 */
export interface FirefoxAppData {
  env: NodeJS.ProcessEnv;
  cleanup(): void;
}

export function isolatedFirefoxAppData(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): FirefoxAppData {
  if (platform !== 'darwin' || (environment.MOZ_APP_DATA && environment.MOZ_LOCAL_APP_DATA)) {
    return { env: environment, cleanup() {} };
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
      if (cleaned) return;
      rmSync(root, { recursive: true, force: true });
      cleaned = true;
    },
  };
}
