// Empirical post-login evidence from public DEMO accounts. No personal auth,
// session tokens, screenshots, document text, or private user data are stored.
// This is an external network audit, NOT a universal static proof or release gate.
import { test, expect } from '@playwright/test';
import { captureViewport, captureClosedScopeTabFocus, captureModalTabFocus, captureControlAvailability } from '../packages/adapter-core/src/browser-observations.mjs';
import { verifyUI } from '../packages/adapter-core/src/ui-contracts.mjs';
const widths = [320, 390, 768, 1280];
const height = 844;
async function sample(page, state, frames, observations) {
    // The application can finish a fetch or redraw charts after route navigation.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.waitForTimeout(180);
    const { frame, observation } = await captureViewport(page, { state, profile: 'demo' });
    frames.push({ state, width: frame.viewport, ...frame });
    observations.push(observation);
    return frame;
}
function scopedModel(browserName) {
    const profile = { id: 'demo', ua: browserName, viewport: { min: 320, max: 1280, height: { min: 844, max: 844 } } };
    return { version: 1, initial: 'login', states: ['login', 'dashboard', 'drawer-open', 'list'],
        transitions: [
            { from: 'login', event: 'sign-in', to: 'dashboard' },
            { from: 'dashboard', event: 'open-menu', to: 'drawer-open' },
            { from: 'drawer-open', event: 'navigate-list', to: 'list' },
            { from: 'dashboard', event: 'keyboard-focus-visible', to: 'dashboard' }
        ], profiles: [profile], contracts: [
            { id: 'main-horizontal-fit', kind: 'predicate', states: ['dashboard', 'list'], predicate: { op: 'compare', relation: 'le', left: { target: 'main', field: 'inlineEnd' }, right: { environment: 'safeRight' } } },
            { id: 'document-width-fit', kind: 'predicate', states: ['dashboard', 'list'], predicate: { op: 'compare', relation: 'le', left: { target: 'scrollExtent', field: 'inlineEnd' }, right: { environment: 'safeRight' } } },
            { id: 'menu-open', kind: 'action', event: 'open-menu' },
            { id: 'keyboard-focus-visible', kind: 'action', event: 'keyboard-focus-visible' }
        ] };
}
function result(name, browser, frames, focus, observations) {
    const proof = verifyUI({ model: scopedModel(browser), observations });
    // Runtime observations cannot prove *all widths*. No browser sampling may be
    // smuggled into closed affine evidence or relabeled static VERIFIED.
    expect(proof.status, 'Sampled external UI is not a static proof').not.toBe('verified');
    const failures = proof.contracts.filter(c => c.observations.some(o => o.status === 'failed')).map(c => c.id);
    const overflowing = frames.some(f => f.documentWidth > f.viewport + 0.5);
    const offscreen = focus.some(f => f.offscreen && f.inScope);
    expect(failures.includes('document-width-fit')).toBe(overflowing);
    expect(failures.includes('keyboard-focus-visible')).toBe(offscreen);
    expect(proof.observationStatus === 'failed').toBe(overflowing || offscreen);
    console.log('AUTH_UI_AUDIT ' + JSON.stringify({ app: name, browser, frames, focusIssues: focus.filter(f => f.offscreen && f.inScope), focusSteps: focus.map(f => ({ tag: f.tag, inDrawer: f.inScope, offscreen: f.offscreen })), veriss: { status: proof.status, observationStatus: proof.observationStatus, observedFailures: failures, reachable: proof.reachable } }));
}
test('role-based admin demo: authenticated dashboard, hidden drawer, user list', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 390, height });
    await page.goto('https://jorgeariosg.github.io/react-admin-rbac/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[name=email]')).toBeVisible();
    const observations = [];
    observations.push({ state: 'login', profile: 'demo', width: 390, height, event: 'sign-in', to: 'dashboard', passed: true });
    // Explicitly published demo credentials, never a user's real session.
    await page.locator('input[name=email]').fill('admin@demo.bank');
    await page.locator('input[name=password]').fill('password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    const frames = [];
    for (const width of widths) {
        await page.setViewportSize({ width, height });
        await sample(page, 'dashboard', frames, observations);
    }
    await page.setViewportSize({ width: 390, height });
    const aside = page.locator('aside');
    await expect.poll(async () => aside.evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
    const focus = await captureClosedScopeTabFocus(page, { state: 'dashboard', profile: 'demo', anchor: 'button[aria-label="Open menu"]', closedScope: 'aside', steps: 6 });
    const closed = focus.steps;
    const offscreenDrawer = closed.filter(f => f.offscreen && f.inScope);
    observations.push(focus.observation);
    // This is an observation, not an invented CSS proof. If the upstream demo
    // is fixed, the finding becomes 0 without making this audit fail.
    observations.push({ state: 'dashboard', profile: 'demo', width: 390, height, event: 'open-menu', to: 'drawer-open', passed: true });
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect.poll(async () => aside.evaluate(el => el.getBoundingClientRect().left)).toBeGreaterThanOrEqual(-1);
    await expect(aside.getByRole('link', { name: 'Users' })).toBeVisible();
    const opened = await captureViewport(page, { state: 'drawer-open', profile: 'demo' });
    expect(opened.frame.viewport).toBe(390);
    const menuTarget = aside.getByRole('link', { name: 'Users' });
    observations.push({ state: 'drawer-open', profile: 'demo', width: 390, height, event: 'navigate-list', to: 'list', passed: true });
    await menuTarget.click();
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    for (const width of widths) {
        await page.setViewportSize({ width, height });
        await sample(page, 'list', frames, observations);
    }
    result('RBAC public demo', browserName, frames, closed, observations);
    console.log('AUTH_UI_FOCUS_FINDING ' + JSON.stringify({ app: 'RBAC public demo', browser: browserName, closedDrawerFocusableOffscreen: offscreenDrawer.length }));
});
test('react-admin official demo: authenticated dashboard, drawer, orders table', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 390, height });
    await page.goto('https://marmelab.com/react-admin-demo/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[name=username]')).toBeVisible();
    const observations = [{ state: 'login', profile: 'demo', width: 390, height, event: 'sign-in', to: 'dashboard', passed: true }];
    await page.locator('input[name=username]').fill('demo');
    await page.locator('input[name=password]').fill('demo');
    await page.locator('button[type=submit]').click();
    await expect(page.getByText('Welcome to the react-admin e-commerce demo')).toBeVisible();
    console.log('REACT_LOGGED_IN', browserName);
    const frames = [];
    // Interact while the mobile drawer is in its original state. Desktop→mobile
    // resizing may preserve an already-open modal; that is a separate state,
    // not a legitimate reason to use force-click through its backdrop.
    await sample(page, 'dashboard', frames, observations);
    const menu = page.getByRole('button', { name: 'Open menu' });
    await expect(menu).toBeVisible();
    const focus = await captureClosedScopeTabFocus(page, { state: 'dashboard', profile: 'demo', anchor: 'button[aria-label="Open menu"]', closedScope: '.RaSidebar-docked', steps: 6 });
    const closed = focus.steps;
    console.log('REACT_FOCUS_DONE', browserName, closed.length);
    observations.push(focus.observation);
    observations.push({ state: 'dashboard', profile: 'demo', width: 390, height, event: 'open-menu', to: 'drawer-open', passed: true });
    await menu.click({ noWaitAfter: true, timeout: 8000 });
    console.log('REACT_OPENED', browserName);
    await expect(page.getByRole('menuitem', { name: 'Orders', exact: true })).toBeVisible();
    observations.push({ state: 'drawer-open', profile: 'demo', width: 390, height, event: 'navigate-list', to: 'list', passed: true });
    await page.getByRole('menuitem', { name: 'Orders', exact: true }).click();
    console.log('REACT_NAV_CLICKED', browserName);
    await expect(page).toHaveURL(/#\/orders/);
    await expect(page.getByRole('heading', { name: 'Orders' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Add filter' }).click();
    await page.getByRole('menuitem', { name: 'Save current query...' }).click();
    await expect(page.locator('[role=dialog][aria-modal=true]')).toBeVisible();
    const modalRows = [];
    const modalObservations = [];
    for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height });
        const sample = await captureModalTabFocus(page, { state: 'query-dialog-open', profile: 'demo', steps: 8 });
        modalObservations.push(sample.observation);
        modalRows.push({ width, inside: sample.observation.passed === true, outside: sample.steps.filter(s => !s.inScope).length });
    }
    console.log('AUTH_MODAL_AUDIT ' + JSON.stringify({ app: 'react-admin official demo', browser: browserName, rows: modalRows }));
    expect(modalRows.every(r => r.inside), JSON.stringify(modalRows)).toBe(true);
    const modalModel = { version: 1, initial: 'query-dialog-open', states: ['query-dialog-open'],
        transitions: [{ from: 'query-dialog-open', event: 'modal-focus-contained', to: 'query-dialog-open' }],
        profiles: [{ id: 'demo', ua: browserName, viewport: { min: 320, max: 768, height: { min: 844, max: 844 } } }],
        contracts: [{ id: 'keyboard-contained', kind: 'action', event: 'modal-focus-contained' }] };
    const modalReport = verifyUI({ model: modalModel, observations: modalObservations });
    expect(modalReport.status).toBe('unknown');
    expect(modalReport.observationStatus).toBe('sampled');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[role=dialog][aria-modal=true]')).toBeHidden();
    for (const width of widths) {
        await page.setViewportSize({ width, height });
        await sample(page, 'list', frames, observations);
    }
    // Revisit the dashboard route with the same demo session after the list.
    // This is a route access check, NOT a second asserted menu transition.
    await page.goto('https://marmelab.com/react-admin-demo/#/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Welcome to the react-admin e-commerce demo')).toBeVisible();
    for (const width of [320, 768, 1280]) {
        await page.setViewportSize({ width, height });
        await sample(page, 'dashboard', frames, observations);
    }
    result('react-admin official demo', browserName, frames, closed, observations);
});
// Role-aware UI capability comparison on the same authenticated Users screen.
// Only public demo accounts; does not submit edits, suspensions, or user creation.
for (const role of ['Admin', 'Manager', 'Viewer']) {
    test(`RBAC public demo: ${role} Users permissions match controls without changing data`, async ({ page, browserName }) => {
        await page.setViewportSize({ width: 390, height });
        await page.goto('https://jorgeariosg.github.io/react-admin-rbac/', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('input[name=email]')).toBeVisible();
        await page.getByRole('button', { name: new RegExp('^' + role + ' ', 'i') }).click();
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
        await page.goto('https://jorgeariosg.github.io/react-admin-rbac/users', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
        await expect.poll(() => page.locator('button[aria-label^="Edit "]').count()).toBeGreaterThan(2);
        const state = `${role.toLowerCase()}-users`;
        const profileId = 'role';
        const controls = [
            { id: 'edit', selector: 'button[aria-label^="Edit "]', expect: role === 'Admin' ? 'all-enabled' : 'all-blocked' },
            { id: 'user-status', selector: 'button[aria-label^="Suspend "],button[aria-label^="Reactivate "]', expect: role === 'Admin' ? 'some-enabled' : 'all-blocked' }
        ];
        const profile = { id: profileId, ua: browserName, viewport: { min: 390, max: 1280, height: { min: 844, max: 844 } } };
        const model = { version: 1, initial: state, states: [state],
            transitions: [{ from: state, event: 'role-controls-match', to: state }], profiles: [profile],
            contracts: [{ id: 'role-controls', kind: 'action', event: 'role-controls-match' }] };
        const samples = [];
        const measured = [];
        for (const width of [390, 1280]) {
            await page.setViewportSize({ width, height });
            const capture = await captureControlAvailability(page, { state, profile: profileId, controls });
            samples.push(capture.observation);
            measured.push({ width, controls: capture.controls });
            expect(capture.observation.passed, `${role} ${browserName} ${width}: ${JSON.stringify(capture.controls)}`).toBe(true);
            const edits = capture.controls.find(c => c.id === 'edit');
            const statuses = capture.controls.find(c => c.id === 'user-status');
            expect(edits.matched).toBeGreaterThan(2);
            expect(statuses.matched).toBeGreaterThan(2);
            if (role === 'Admin') {
                // Admin cannot suspend themselves; all-edit-enabled is correct, all-status-
                // enabled would be a false positive for intentional self-protection.
                expect(edits.enabled).toBe(edits.matched);
                expect(statuses.enabled).toBeGreaterThan(0);
                expect(statuses.blocked).toBeGreaterThan(0);
            }
            else {
                expect(edits.blocked).toBe(edits.matched);
                expect(statuses.blocked).toBe(statuses.matched);
            }
            // Native disabled buttons cannot receive focus. Check actual browser focus
            // behavior, not just a CSS class or aria-disabled decoration.
            await page.locator('body').focus();
            await page.locator('button[aria-label^="Edit "]').first().focus();
            const focused = await page.locator('button[aria-label^="Edit "]').first().evaluate(el => document.activeElement === el);
            expect(focused).toBe(role === 'Admin');
        }
        const proof = verifyUI({ model, observations: samples });
        expect(proof.status).toBe('unknown');
        expect(proof.observationStatus).toBe('sampled');
        console.log('AUTH_ROLE_AUDIT ' + JSON.stringify({ role, browser: browserName, states: measured, proof: proof.status, observation: proof.observationStatus }));
    });
}
