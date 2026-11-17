// 2026-11-17 changes: Share Event modal (+ Guests list), public invitation page, Delete Event popup,
// event sidebar (Invitation, Splash Screen, Event Attendance, File Downloads) and Create Event without Splash.
// Creates ONE QA-stamped guest (to prove WhatsApp Send marks it Invited) and deletes it. No event is deleted.
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const PORTAL_URL = k.PORTAL;
    const GUEST = `${STAMP} Share Guest`;
    const MOBILE = `9${String(Date.now()).slice(-9)}`;
    let event = {};
    let guestId = null;
    let madeGroup = null;
    let link = '';
    const dialog = () => page.locator('[data-slot="dialog-content"][data-state="open"]').last();
    const guestRows = async () => {
        const r = await api(`/client/guests?event_id=${EVENT}&limit=200&sort=name_asc`);
        return { rows: r.body?.data || [], total: r.body?.pagination?.totalItems ?? 0 };
    };
    const openDashboardRow = async (item) => {
        await page.goto(`${PORTAL_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByText('Events Overview (All Events)').waitFor({ timeout: 90000 });
        await page.getByRole('combobox').filter({ hasText: /01 Jan/ }).first().click();
        await page.getByRole('option', { name: 'All Dates' }).click();
        await page.getByPlaceholder('Search event by name...').fill(event.name);
        const row = page.locator('table tbody tr').filter({ hasText: event.name }).first();
        await row.waitFor({ timeout: 30000 });
        await page.waitForTimeout(800);
        await row.getByRole('button', { name: /Actions for/ }).click();
        await page.getByRole('menuitem', { name: item }).click();
        await dialog().waitFor({ timeout: 15000 });
    };

    await step('setup: event + a QA guest (API)', async () => {
        const e = await api(`/client/events/${EVENT}`);
        event = e.body?.data?.event || e.body?.data || {};
        expect(event.name && event.qr_token, `event not readable (${e.status})`);
        const g = await api('/client/guests/groups/all');
        let groupId = (g.body?.data?.groups || [])[0]?.id;
        if (!groupId) {
            const c = await api('/client/guests/groups', { method: 'POST', body: JSON.stringify({ name: `${STAMP} Friends` }) });
            madeGroup = groupId = c.body?.data?.group?.id ?? c.body?.data?.id;
        }
        const c = await api('/client/guests', { method: 'POST', body: JSON.stringify({ event_id: EVENT, group_id: groupId, first_name: GUEST, dial_code: '+91', mobile: MOBILE }) });
        expect(c.status < 300, `could not add the QA guest (${c.status} ${JSON.stringify(c.body?.message)})`);
        guestId = c.body?.data?.guest?.id ?? c.body?.data?.id;
        expect(guestId, 'QA guest id missing');
    });

    /* ── Share Event ─────────────────────────────────────────────────────── */

    await step('S1. Dashboard ⋯ → Share Event opens the new modal', async () => {
        await openDashboardRow('Share Event');
        const d = dialog();
        for (const t of ['Share Event', 'Shareable Event Link', 'Event QR Code', 'Share via']) await d.getByText(t, { exact: true }).first().waitFor();
        await d.getByText(`Invite your guests to ${event.name}`).waitFor();
        for (const b of ['WhatsApp', 'Email', 'Copy Link', 'Guests', 'Download QR']) expect(await d.getByRole('button', { name: b }).count() > 0, `button missing: ${b}`);
        link = await d.getByLabel('Shareable event link').inputValue();
        expect(link === `${PORTAL_URL}/e/${event.qr_token}`, `link is ${link.slice(0, 80)}…`);
        expect(await d.locator('[data-qr-svg] svg').count() === 1, 'QR code not drawn');
        await page.waitForTimeout(600);
        await k.shot('share-modal');
    });

    await step('S2. Copy Link copies the link + toast', async () => {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: PORTAL_URL }).catch(() => null);
        await dialog().getByRole('button', { name: 'Copy Link' }).first().click();
        await k.toast('Event link copied');
        const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
        expect(copied === null || copied === link, `clipboard holds ${String(copied).slice(0, 60)}`);
    });

    await step('S3. Download QR saves a PNG', async () => {
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), dialog().getByRole('button', { name: 'Download QR' }).click()]);
        expect(/\.png$/i.test(dl.suggestedFilename()), `file ${dl.suggestedFilename()}`);
        return dl.suggestedFilename();
    });

    await step('S4. WhatsApp + Email buttons build the right targets', async () => {
        const [pop] = await Promise.all([page.waitForEvent('popup', { timeout: 15000 }), dialog().getByRole('button', { name: 'WhatsApp' }).click()]);
        await pop.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => null);
        // wa.me forwards to api.whatsapp.com with the text form-encoded (+ for a space).
        const url = decodeURIComponent(pop.url().replace(/[+]/g, ' '));
        await pop.close().catch(() => null);
        expect(/wa\.me|whatsapp\.com/.test(url), `WhatsApp opened ${url.slice(0, 80)}`);
        expect(url.includes(event.name), 'WhatsApp text has no event name');
    });

    await step('S5. Guests → the event guest list (rows = API), search, select all', async () => {
        await dialog().getByRole('button', { name: 'Guests' }).click();
        const d = dialog();
        await d.getByText('Send to Guests', { exact: true }).waitFor();
        const { rows, total } = await guestRows();
        await d.locator('ul li').first().waitFor({ timeout: 30000 });
        const shown = await d.locator('ul li').count();
        expect(shown === rows.length, `list shows ${shown}, API ${rows.length} (total ${total})`);
        await d.getByText(`Select all (${rows.length})`).click();
        await d.getByRole('button', { name: `Email Selected (${rows.length})` }).waitFor();
        await k.shot('share-guests');
        await d.getByPlaceholder('Search guest by name or mobile...').fill('zzqq-nobody');
        await d.getByText('No guests match this search.').waitFor({ timeout: 20000 });
        await d.getByPlaceholder('Search guest by name or mobile...').fill(STAMP);
        await d.locator('ul li').filter({ hasText: GUEST }).waitFor({ timeout: 20000 });
        return `${rows.length} guests`;
    });

    await step('S6. Send (WhatsApp) on a guest opens their chat and marks them Invited', async () => {
        const row = dialog().locator('ul li').filter({ hasText: GUEST });
        const [pop] = await Promise.all([page.waitForEvent('popup', { timeout: 15000 }), row.getByRole('button', { name: /Send to/ }).click()]);
        await pop.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => null);
        // wa.me forwards to api.whatsapp.com with the text form-encoded (+ for a space).
        const url = decodeURIComponent(pop.url().replace(/[+]/g, ' '));
        await pop.close().catch(() => null);
        expect(url.includes(`91${MOBILE}`), `chat opened for ${url.slice(0, 80)}`);
        expect(url.includes('/e/'), 'message has no invitation link');
        await row.getByText('Sent', { exact: true }).waitFor({ timeout: 15000 });
        await page.waitForTimeout(2500);
        const g = await api(`/client/guests/${guestId}`);
        const saved = g.body?.data?.guest || g.body?.data || {};
        expect(saved.status === 'invited' || !!saved.invited_at, `guest status after send: ${saved.status}`);
        await k.shot('share-guest-sent');
    });

    await step('S7. Back arrow returns to Share Event; ✕ closes', async () => {
        await dialog().getByRole('button', { name: 'Back to Share Event' }).click();
        await dialog().getByText('Shareable Event Link').waitFor();
        await dialog().getByRole('button', { name: 'Close' }).click();
        await k.panelClosed();
        expect(await dialog().count() === 0, 'modal still open');
    });

    await step('S8. Public invitation page opens WITHOUT a login', async () => {
        const anon = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 } });
        const p = await anon.newPage();
        try {
            await p.goto(link, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await p.getByRole('heading', { name: event.name }).waitFor({ timeout: 90000 });
            await p.getByText(/scan this code to join the event/i).waitFor();
            expect(await p.locator('svg').count() > 0, 'no QR on the public page');
            await p.screenshot({ path: require('path').join(k.OUT || '.', 'public-invitation.png') }).catch(() => null);
            await p.goto(`${PORTAL_URL}/e/EVQ1.bad.bad.bad`, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await p.getByText('Invitation not available').waitFor({ timeout: 60000 });
        } finally { await anon.close(); }
    });

    /* ── Delete Event popup (never confirmed) ────────────────────────────── */

    await step('D1. Dashboard ⋯ → Delete Event = centre popup with the event; Cancel closes, event kept', async () => {
        await openDashboardRow('Delete Event');
        const d = dialog();
        await d.getByText('Delete Event', { exact: true }).first().waitFor();
        await d.getByText(event.name).first().waitFor();
        await d.getByText(/QR code and\s+invitation link will stop working/).waitFor();
        expect(await d.getByRole('button', { name: 'Delete Event' }).count() === 1, 'Delete Event button missing');
        expect(!(await k.isSlideIn()), 'opened as a slide-in');
        await page.waitForTimeout(500);
        await k.shot('delete-popup');
        await d.getByRole('button', { name: 'Cancel' }).click();
        await k.panelClosed();
        const e = await api(`/client/events/${EVENT}`);
        expect(e.status === 200, `event after Cancel: ${e.status}`);
    });

    await step('D2. My Events: Share + Delete open the same two popups', async () => {
        await page.goto(`${PORTAL_URL}/dashboard/events?search=${encodeURIComponent(event.name)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        const card = page.locator('li').filter({ hasText: event.name }).first();
        await card.getByRole('button', { name: 'Share' }).waitFor({ timeout: 90000 });
        await page.waitForTimeout(1000);
        await card.getByRole('button', { name: 'Share' }).click();
        await dialog().getByText('Shareable Event Link').waitFor();
        await dialog().getByRole('button', { name: 'Close' }).click();
        await k.panelClosed();
        await card.getByRole('button', { name: 'Delete' }).click();
        await dialog().getByRole('button', { name: 'Delete Event' }).waitFor();
        await dialog().getByRole('button', { name: 'Cancel' }).click();
        await k.panelClosed();
    });

    /* ── Event sidebar ───────────────────────────────────────────────────── */

    const sidebar = () => page.locator('[data-sidebar="sidebar"]').first();
    await step('B1. Sidebar: Invitation + Splash Screen on top; Event Attendance + File Downloads under ADDITIONAL MENU; no QR Code', async () => {
        await page.goto(`${PORTAL_URL}/event/${EVENT}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await sidebar().getByRole('link', { name: 'Invitation' }).waitFor({ timeout: 90000 });
        await page.waitForTimeout(2500);
        const text = (await sidebar().innerText()).replace(/\s+/g, ' ').toUpperCase();
        const at = (t) => text.indexOf(t.toUpperCase());
        for (const t of ['Invitation', 'Splash Screen', 'Event Attendance', 'File Downloads', 'Additional Menu', 'Activity Log']) expect(at(t) >= 0, `sidebar missing: ${t}`);
        expect(at('QR CODE') < 0, 'QR Code is still in the sidebar');
        expect(at('Event Info') < at('Invitation') && at('Invitation') < at('Splash Screen') && at('Splash Screen') < at('Contact'), 'top order is not Event Info · Invitation · Splash Screen · Contact');
        expect(at('Additional Menu') < at('Event Attendance') && at('Event Attendance') < at('File Downloads') && at('File Downloads') < at('SETTING'), 'Event Attendance / File Downloads are not inside ADDITIONAL MENU');
        expect(at('REPORT') < at('Activity Log'), 'Activity Log is not under REPORT');
        await k.shot('sidebar');
    });

    const open = async (label, heading) => {
        await sidebar().getByRole('link', { name: label, exact: true }).click();
        await page.locator('#main-content, main').first().getByText(heading).first().waitFor({ timeout: 60000 });
        await page.waitForTimeout(1500);
        await k.shot(label.toLowerCase().replace(/\s+/g, '-'));
    };
    await step('B2. Invitation opens the Invitation Card page in the event', () => open('Invitation', /Event Invitation Card/));
    await step('B3. Splash Screen opens the Splash Screen page in the event', () => open('Splash Screen', /Event Splash Screen/));
    await step('B4. Event Attendance opens', () => open('Event Attendance', 'Event Attendance'));
    await step('B5. File Downloads opens', () => open('File Downloads', 'Files Downloaded Participants List'));

    /* ── Create Event steps ──────────────────────────────────────────────── */

    await step('C1. Create Event steps: 8 steps, no Splash Screen', async () => {
        await page.goto(`${PORTAL_URL}/event/${EVENT}/edit?section=all`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        const stepper = page.locator('ol').filter({ hasText: 'Event Type' }).first();
        await stepper.waitFor({ timeout: 90000 });
        const labels = (await stepper.locator('li').allInnerTexts()).map((t) => t.replace(/^\s*\d+\s*/, '').replace(/\s+/g, ' ').trim());
        const want = ['Event Type', 'Basic Details', 'Date & Time', 'Venue', 'App Menus', 'Organizer Details', 'Review', 'Event Created'];
        expect(labels.length === want.length && want.every((w, i) => labels[i].includes(w)), `steps: ${labels.join(' | ')}`);
        await k.shot('create-steps');
        return labels.join(' › ');
    });

    await step('clean up: QA guest removed', async () => {
        if (guestId) await api(`/client/guests/${guestId}`, { method: 'DELETE' });
        if (madeGroup) await api(`/client/guests/groups/${madeGroup}`, { method: 'DELETE' });
        const left = ((await guestRows()).rows).filter((g) => (g.name || '').startsWith(STAMP));
        expect(!left.length, `${left.length} QA guest(s) left`);
    });
};
