// Event pages without their own module check (Jamal, 2026-11-12): Dashboard, Event Info, Venue,
// App Menu (settings), Activity Log. Values are compared with the API; every setting this run
// changes is put back the way it was (the event is real QA data).
module.exports = async (k) => {
    const { page, step, expect, api, EVENT, STAMP } = k;
    let event = {};
    const loadEvent = async () => {
        const r = await api(`/client/events/${EVENT}`);
        event = r.body?.data?.event || r.body?.data || {};
        return event;
    };
    const go = async (tab) => {
        const base = page.url().includes('/event/') ? page.url().split('?')[0] : null;
        if (base) await page.goto(`${base}?tab=${tab}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        else await k.openTab(tab, /.+/);
    };
    /** Seconds until the page-wide "Loading..." overlay is gone (null = never within the limit). */
    const loaderGone = async (limit = 45) => {
        const t = Date.now();
        await page.waitForTimeout(300);
        const ok = await page.locator('[role="status"]').filter({ hasText: 'Loading...' }).first()
            .waitFor({ state: 'hidden', timeout: limit * 1000 }).then(() => true).catch(() => false);
        return ok ? Math.round((Date.now() - t) / 100) / 10 : null;
    };
    const card = (title) => page.locator('[data-slot="card"]').filter({ has: page.getByText(title, { exact: true }) }).first();
    const fmtDMY = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

    await step('setup: read the event (API)', async () => {
        await k.openTab('overview', /View Guests/);
        await loadEvent();
        expect(!!event.id, 'event not readable from the API');
    });

    /* ── Dashboard ─────────────────────────────────────────────────────────── */
    await step('D1. Dashboard loads (overlay gone, every card shown)', async () => {
        await go('overview');
        const secs = await loaderGone(45);
        expect(secs !== null, 'the "Loading..." overlay was still on the Dashboard after 45 s');
        k.note(`D1a. Dashboard ready in ${secs} s`, secs <= 10, `the Dashboard took ${secs} s to finish loading (over 10 s)`);
        for (const t of ['Basic Information', 'Event Status', 'Quick Links', 'Date & Time', 'RSVP Summary', 'Region']) {
            await page.getByText(t, { exact: true }).first().waitFor({ timeout: 15000 });
        }
        await k.shot('dashboard');
    });

    await step('D2. Dashboard values = the event (API)', async () => {
        const text = (await page.locator('#main-content').innerText()).replace(/\s+/g, ' ');
        const want = [
            event.category_name || event.category?.name,
            fmtDMY(event.start_date || event.event_date),
            event.venue_name,
        ].filter(Boolean);
        const missing = want.filter((w) => !text.includes(w));
        expect(!missing.length, `Dashboard does not show: ${missing.join(', ')}`);
    });

    await step('D3. Quick Links: View Guests / View RSVPs open their pages', async () => {
        await page.getByRole('button', { name: 'View Guests' }).or(page.getByRole('link', { name: 'View Guests' })).first().click();
        await page.waitForURL(/tab=guests/, { timeout: 30000 });
        await go('overview');
        await loaderGone(45);
        await page.getByRole('button', { name: 'View RSVPs' }).or(page.getByRole('link', { name: 'View RSVPs' })).first().click();
        await page.waitForURL(/tab=rsvps/, { timeout: 30000 });
    });

    await step('D4. Download QR Code', async () => {
        await go('overview');
        await loaderGone(45);
        const dl = page.waitForEvent('download', { timeout: 20000 }).then((d) => d.suggestedFilename()).catch(() => null);
        await page.getByRole('button', { name: 'Download QR Code' }).click();
        // Either a file is saved, or a QR dialog opens with its own download.
        const dlg = page.getByRole('dialog');
        const opened = await dlg.first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
        if (opened) {
            await k.shot('qr-dialog');
            const inDialog = dlg.getByRole('button', { name: /Download/i }).first();
            const dl2 = page.waitForEvent('download', { timeout: 20000 }).then((d) => d.suggestedFilename()).catch(() => null);
            if (await inDialog.count()) await inDialog.click();
            const name = await dl2;
            await page.keyboard.press('Escape');
            expect(!!name, 'the QR dialog opened but nothing was downloaded');
        } else {
            expect(!!(await dl), 'Download QR Code saved nothing');
        }
    });

    /* ── Event Info ────────────────────────────────────────────────────────── */
    await step('I1. Event Info = the event (API)', async () => {
        await go('information');
        await page.getByText('Event Information', { exact: true }).first().waitFor({ timeout: 60000 });
        await page.waitForTimeout(800);
        await k.shot('event-info');
        const text = (await page.locator('#main-content').innerText()).replace(/\s+/g, ' ');
        const want = [event.name || event.title, event.event_code ? `#${String(event.event_code).replace(/^#/, '')}` : null, event.category_name || event.category?.name].filter(Boolean);
        const missing = want.filter((w) => !text.includes(w));
        expect(!missing.length, `Event Info does not show: ${missing.join(', ')}`);
        const desc = (event.description || event.short_description || '').trim();
        expect(desc ? text.includes(desc.slice(0, 30)) : /No description was added/.test(text), 'Description card does not match the event');
        await page.getByText('Menus Included', { exact: true }).waitFor();
    });

    /* ── Venue ─────────────────────────────────────────────────────────────── */
    const venueName = () => page.getByPlaceholder('e.g. The Grand Palace');
    let originalVenue = '';
    await step('V1. Venue loads with the saved venue', async () => {
        await go('venue');
        await page.getByText('Event Venue', { exact: true }).first().waitFor({ timeout: 60000 });
        await venueName().waitFor();
        await page.waitForTimeout(1000);
        originalVenue = await venueName().inputValue();
        expect(originalVenue === (event.venue_name || ''), `venue name field "${originalVenue}" ≠ saved "${event.venue_name}"`);
        await k.shot('venue');
    });

    await step('V2. Venue: empty name → error message', async () => {
        await venueName().fill('');
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await k.toast(/fill all mandatory|venue name|required/i);
        await k.shot('venue-error');
    });

    await step('V3. Venue: change name → Save → saved (then put back)', async () => {
        const temp = `${originalVenue} ${STAMP}`.trim();
        await go('venue');
        await venueName().waitFor({ timeout: 60000 });
        await page.waitForTimeout(800);
        // City, Google Map Link and the map pin are required. When the saved venue lacks them, Save must
        // refuse with "This field is required" - the QA event is like that, and they cannot be emptied
        // again afterwards, so the save itself is only tried on a complete venue.
        const city = await page.getByPlaceholder('e.g. Chennai').inputValue();
        const link = await page.getByPlaceholder('https://maps.google.com/...').inputValue();
        if (!city || !link || !event.venue_lat) {
            await page.getByRole('button', { name: 'Save', exact: true }).click();
            await page.getByText('This field is required').first().waitFor({ timeout: 10000 });
            const n = await page.getByText('This field is required').count();
            expect((await loadEvent()).venue_name === originalVenue, 'an incomplete venue was saved anyway');
            k.note(`V3a. saved venue is incomplete (city ${city ? 'ok' : 'missing'}, map link ${link ? 'ok' : 'missing'}, pin ${event.venue_lat ? 'ok' : 'missing'}) - Save refused with ${n} "required" messages; save not tried`, true);
            return;
        }
        await venueName().fill(temp);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await k.toast(/updated|saved/i, 60000);
        expect((await loadEvent()).venue_name === temp, `venue name not saved (API: "${event.venue_name}")`);
        // Put it back.
        await go('venue');
        await venueName().waitFor({ timeout: 60000 });
        await page.waitForTimeout(800);
        await venueName().fill(originalVenue);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await k.toast(/updated|saved/i, 60000);
        expect((await loadEvent()).venue_name === originalVenue, `venue name NOT restored (API: "${event.venue_name}")`);
    });

    /* ── App Menu (settings) ───────────────────────────────────────────────── */
    const flipAndBack = async (section, switchId, saveName, toastText) => {
        const sw = () => page.locator(`#${switchId}`);
        const box = card(section);
        const before = await sw().getAttribute('aria-checked');
        await sw().click();
        await box.getByRole('button', { name: saveName, exact: true }).click();
        await k.toast(toastText);
        // Saved = still flipped after a reload.
        await go('settings');
        await sw().waitFor({ timeout: 60000 });
        await page.waitForTimeout(800);
        const after = await sw().getAttribute('aria-checked');
        // Put it back either way.
        if (after !== before) {
            await sw().click();
            await card(section).getByRole('button', { name: saveName, exact: true }).click();
            await k.toast(toastText);
        }
        expect(after !== before, `${section}: the change did not stay after reload`);
        await go('settings');
        await sw().waitFor({ timeout: 60000 });
        await page.waitForTimeout(800);
        expect((await sw().getAttribute('aria-checked')) === before, `${section}: NOT restored to "${before}"`);
    };

    await step('S1. App Menu loads (all settings cards)', async () => {
        await go('settings');
        for (const t of ['RSVP Settings', 'Participants Settings', 'Family Settings', 'Contact Person', 'Wish Settings']) {
            await page.getByText(t, { exact: true }).first().waitFor({ timeout: 60000 });
        }
        await k.shot('app-menu');
    });
    await step('S2. RSVP Settings: Food Preference → Save → stays (then put back)', () => flipAndBack('RSVP Settings', 'rsvp-food', 'Save', /RSVP settings saved/));
    await step('S3. Participants Settings: Profile Screen → Save → stays (then put back)', () => flipAndBack('Participants Settings', 'part-profile', 'Save', /Participant settings saved/));
    await step('S4. Family Settings: Profile Screen → Save → stays (then put back)', () => flipAndBack('Family Settings', 'fam-profile', 'Save', /Family settings saved/));
    await step('S5. Wish Settings: Show time → Save → stays (then put back)', async () => {
        const box = card('Wish Settings');
        const save = (await box.getByRole('button', { name: 'Save', exact: true }).count()) ? 'Save' : 'Save Wishes Settings';
        await flipAndBack('Wish Settings', 'ws-time', save, /Wish settings saved/);
    });

    await step('S6. Contact Person: empty name → error; Save Changes (unchanged) → saved + spinner', async () => {
        const box = card('Contact Person');
        const nameBox = box.getByPlaceholder('Enter full name');
        const original = await nameBox.inputValue();
        await nameBox.fill('');
        await box.getByRole('button', { name: /Save Changes/ }).click();
        await k.toast(/fill all mandatory/i);
        await nameBox.fill(original);
        if (!original) { k.note('S6a. Contact Person has no saved name - save skipped', true); return; }
        await k.saveAndWatch(/Save Changes/, 'contact-saving');
        await k.toast(/Organizer contact saved/);
        const c = (await api(`/client/events/${EVENT}/organizer-contact`)).body?.data?.contact || {};
        expect(c.name === original, `contact name changed: "${c.name}" (was "${original}")`);
    });

    /* ── Activity Log ──────────────────────────────────────────────────────── */
    await step('A1. Activity Log = the event record', async () => {
        await go('activity');
        await page.getByText('Event created').first().waitFor({ timeout: 60000 });
        await page.waitForTimeout(800);
        await k.shot('activity-log');
        const text = (await page.locator('#main-content').innerText()).replace(/\s+/g, ' ');
        for (const t of ['Event created', 'Last updated']) expect(text.includes(t), `missing "${t}"`);
        const created = fmtDMY(event.created_at);
        expect(!created || text.includes(created), `created date ${created} not shown`);
    });
};
