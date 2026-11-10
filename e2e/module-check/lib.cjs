// Shared helpers for the module checks (docs/MODULE_TESTING.md). Plain Node + Playwright, not @playwright/test:
// they run on LIVE as well as local and write screenshots + a report a person can look at.
const fs = require('fs');
const path = require('path');

const RX = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

function readEnvFile(file) {
    if (!fs.existsSync(file)) return {};
    return Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
}

/** Everything a module check needs: page, api, step(), shot(), and the standard UI actions. */
function makeKit({ page, ctx, PORTAL, API, EVENT, OUT, STAMP, report }) {
    let shotNo = 0;
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('response', (r) => {
        if (r.url().startsWith(API) && r.status() >= 500) errors.push(`${r.status()} ${r.request().method()} ${r.url().replace(API, '')}`);
    });

    const shot = async (name) => {
        shotNo += 1;
        const file = `${String(shotNo).padStart(2, '0')}_${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        return file;
    };

    const step = async (name, fn) => {
        const t = Date.now();
        try {
            await fn();
            report.steps.push({ step: name, ok: true, ms: Date.now() - t });
            console.log('  ✓', name);
        } catch (e) {
            const error = String(e.message).split('\n')[0].slice(0, 240);
            report.steps.push({ step: name, ok: false, error });
            console.log('  ✗', name, '—', error);
            await shot(`FAIL_${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`).catch(() => null);
            await page.keyboard.press('Escape').catch(() => null);
        }
    };

    const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

    const api = async (p, init = {}) => {
        const r = await ctx.request.fetch(`${API}${p}`, {
            method: init.method || 'GET',
            headers: { 'Content-Type': 'application/json', Origin: PORTAL, Referer: `${PORTAL}/` },
            data: init.body,
        });
        return { status: r.status(), body: await r.json().catch(() => null) };
    };

    /** Hold every write (and optionally reads) this long, so loaders can be seen. */
    let holdWrites = 0;
    let holdReads = 0;
    const routeOn = page.route(`${API}/client/**`, async (route) => {
        const write = route.request().method() !== 'GET';
        const wait = write ? holdWrites : holdReads;
        if (wait) await new Promise((r) => setTimeout(r, wait));
        await route.continue();
    });
    const slow = async ({ writes = 0, reads = 0 } = {}) => { await routeOn; holdWrites = writes; holdReads = reads; };

    const openTab = async (tab, readyButton) => {
        await page.goto(`${PORTAL}/event/${EVENT}?tab=${tab}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('button', { name: readyButton }).first().waitFor({ timeout: 90000 });
        await page.waitForTimeout(800);
    };

    /** A toast (sonner) with this text. */
    const toast = async (text, timeout = 30000) => {
        await page.locator('[data-sonner-toast]').filter({ hasText: text }).first().waitFor({ timeout });
    };

    /**
     * Click Save and prove the SAVING state (check 5): the button shows its spinner + is disabled, and the
     * "Saving..." loader is on screen — covering everything except the sidebar.
     */
    const saveAndWatch = async (saveButton, shotName) => {
        await slow({ writes: 4000 });
        const btn = page.getByRole('button', { name: saveButton }).first();
        await btn.click();
        await page.getByText('Saving...', { exact: true }).first().waitFor({ timeout: 8000 });
        const spinner = await btn.locator('.animate-spin').count();
        const disabled = await btn.isDisabled();
        const box = await page.locator('[role="status"]').filter({ hasText: 'Saving...' }).first().evaluate((el) => {
            const host = el.parentElement.getBoundingClientRect();
            const sidebar = document.querySelector('[data-sidebar="sidebar"]')?.getBoundingClientRect();
            return { left: host.left, top: host.top, right: host.right, sidebarRight: sidebar ? sidebar.right : 0, width: window.innerWidth };
        });
        await shot(shotName);
        await slow({ writes: 0 });
        // Recorded as its own step ("5. saving state") so the add itself carries on and is still verified.
        const problems = [
            !spinner && 'Save button has no spinner while saving',
            !disabled && 'Save button is not disabled while saving',
            box.top > 1 && `saving loader does not start at the top (top=${box.top})`,
            box.right < box.width - 1 && 'saving loader does not reach the right edge (panel not covered)',
            Math.abs(box.left - box.sidebarRight) > 2 && `saving loader covers the sidebar or leaves a gap (left=${box.left}, sidebar ends ${box.sidebarRight})`,
        ].filter(Boolean);
        report.steps.push({ step: '5. saving state (button spinner + loader)', ok: !problems.length, ...(problems.length ? { error: problems.join('; ') } : {}) });
        console.log(problems.length ? '  ✗' : '  ✓', '5. saving state (button spinner + loader)', problems.length ? `— ${problems.join('; ')}` : '');
    };

    /** Row ⋯ menu on the row that contains [rowText], then the menu item. */
    const rowMenu = async (rowText, item) => {
        const row = page.locator('tr, li, div.rounded-xl').filter({ hasText: rowText }).last();
        await row.getByRole('button', { name: /actions/i }).first().click();
        await page.getByRole('menuitem', { name: item }).first().click();
        await page.waitForTimeout(500);
    };

    /**
     * The delete confirmation = the centre popup (Jamal, 2026-11-09 / 11-11): checks it is a popup (not a slide-in),
     * presses its red button with the delete held 2.5 s, and checks the button shows its spinner.
     * Recorded as its own step "9b"; the caller then checks the item is gone.
     */
    const confirmDelete = async () => {
        const dlg = page.locator('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]').last();
        await dlg.waitFor();
        const popup = (await page.locator('[data-slot="dialog-content"][data-state="open"]').count()) > 0;
        await shot('delete-confirm');
        const btn = dlg.getByRole('button', { name: /Delete|Remove/ }).last();
        await slow({ writes: 2500 });
        await btn.click();
        await page.waitForTimeout(400);
        const spin = await btn.locator('.animate-spin').count().catch(() => 0);
        await slow({ writes: 0 });
        const problems = [!popup && 'delete opened a slide-in panel, not the centre popup', !spin && 'Delete button shows no spinner while deleting'].filter(Boolean);
        note('9b. delete = centre popup + spinner', !problems.length, problems.join('; '));
    };

    /** Page-load loader (check 2): reload with reads held, the "Loading..." loader shows. */
    const loadingCheck = async (tab, readyButton) => {
        await slow({ reads: 2500 });
        await page.goto(`${PORTAL}/event/${EVENT}?tab=${tab}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        const seen = await page.getByText('Loading...', { exact: true }).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
        if (seen) await shot('loading');
        await slow({ reads: 0 });
        await page.getByRole('button', { name: readyButton }).first().waitFor({ timeout: 90000 });
        expect(seen, 'no "Loading..." loader while the page data was loading');
    };

    const panelClosed = async () => {
        await page.locator('[role="dialog"][data-state="open"]').first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => null);
        await page.waitForTimeout(400);
    };

    /** A finding that does not stop the flow (e.g. "opens as a popup, not a slide-in"). */
    const note = (name, ok, error) => {
        report.steps.push({ step: name, ok, ...(ok ? {} : { error }) });
        console.log(ok ? '  ✓' : '  ✗', name, ok ? '' : `— ${error}`);
    };

    /** The open panel is a slide-in (Sheet), not a centred popup (Dialog). */
    const isSlideIn = async () => (await page.locator('[data-slot="sheet-content"][data-state="open"]').count()) > 0;

    return { page, api, step, shot, expect, isSlideIn, note, slow, openTab, toast, saveAndWatch, rowMenu, confirmDelete, loadingCheck, panelClosed, errors, RX, STAMP, EVENT };
}

module.exports = { makeKit, readEnvFile, RX };
