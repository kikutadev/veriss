// App-specific expectations, expressed with Playwright—not veriss proof facts.
// The static names are only public demo-fixture labels; no user data is saved.
import { expect } from '@playwright/test';
export const demoUsers = [
    ['Ada Lovelace', 'Suspend'],
    ['Alan Turing', 'Suspend'],
    ['Barbara Liskov', 'Suspend'],
    ['Dennis Ritchie', 'Reactivate'],
    ['Grace Hopper', 'Suspend'],
    ['Katherine Johnson', 'Suspend'],
    ['Ken Thompson', 'Suspend'],
    ['Linus Torvalds', 'Suspend']
];
export async function expectRbacUserActions(page, role, { timeout = 8000 } = {}) {
    const editButtons = page.locator('button[aria-label^="Edit "]');
    const statusButtons = page.locator('button[aria-label^="Suspend "],button[aria-label^="Reactivate "]');
    await expect(editButtons).toHaveCount(demoUsers.length, { timeout });
    await expect(statusButtons).toHaveCount(demoUsers.length, { timeout });
    // Exact labels also reject a duplicate/missing/wrongly associated control.
    const counts = { editEnabled: 0, statusEnabled: 0, matched: demoUsers.length };
    for (const [name, statusAction] of demoUsers) {
        const edit = page.getByRole('button', { name: `Edit ${name}`, exact: true });
        const status = page.getByRole('button', { name: `${statusAction} ${name}`, exact: true });
        await expect(edit).toBeVisible({ timeout });
        await expect(status).toBeVisible({ timeout });
        const editEnabled = role === 'Admin';
        const statusEnabled = role === 'Admin' && name !== 'Ada Lovelace';
        for (const [target, enabled] of [[edit, editEnabled], [status, statusEnabled]]) {
            if (enabled)
                await expect(target).toBeEnabled({ timeout });
            else {
                await expect(target).toBeDisabled({ timeout });
                // Unlike aria-disabled alone, a native disabled button or inert parent
                // is actually suppressed by the browser's interaction/focus semantics.
                expect(await target.evaluate(el => el.matches(':disabled') || !!el.closest('[inert]')), `${role}: expected native/inert blocked UI for ${name}`).toBe(true);
            }
        }
        if (editEnabled)
            counts.editEnabled++;
        if (statusEnabled)
            counts.statusEnabled++;
    }
    return counts;
}
