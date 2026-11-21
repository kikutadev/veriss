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
export declare function isolatedFirefoxAppData(environment?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): FirefoxAppData;
