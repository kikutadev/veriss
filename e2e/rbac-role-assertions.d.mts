import { type Page } from '@playwright/test';
export type DemoRole = 'Admin' | 'Manager' | 'Viewer';
export declare const demoUsers: readonly [readonly ["Ada Lovelace", "Suspend"], readonly ["Alan Turing", "Suspend"], readonly ["Barbara Liskov", "Suspend"], readonly ["Dennis Ritchie", "Reactivate"], readonly ["Grace Hopper", "Suspend"], readonly ["Katherine Johnson", "Suspend"], readonly ["Ken Thompson", "Suspend"], readonly ["Linus Torvalds", "Suspend"]];
export declare function expectRbacUserActions(page: Page, role: DemoRole, { timeout }?: {
    timeout?: number;
}): Promise<{
    editEnabled: number;
    statusEnabled: number;
    matched: 8;
}>;
