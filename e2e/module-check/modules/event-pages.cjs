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
            k.note(`V3a. incomplete venue refused with ${n} "required" messages`, true);
            // Complete it once (Jamal OK'd, 2026-11-12): map search → pin (fills lat / lng / map link), City typed.
            await page.getByPlaceholder('Search a venue, area or address').fill('Palayamkottai, Tirunelveli');
            await page.getByRole('button', { name: 'Search', exact: true }).click();
            const list = page.getByText('Nearest to you first');
            if (await list.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) {
                await list.locator('xpath=../..').getByRole('button').nth(1).click();
            }
            const lat = page.getByPlaceholder('13.0827');
            await page.waitForFunction(() => { const el = document.querySelector('input[placeholder="13.0827"]'); return el && el.value; }, null, { timeout: 30000 });
            if (!(await page.getByPlaceholder('e.g. Chennai').inputValue())) await page.getByPlaceholder('e.g. Chennai').fill('Tirunelveli');
            expect((await venueName().inputValue()) === originalVenue, 'the map search overwrote the venue name');
            await k.shot('venue-completed');
            await page.getByRole('button', { name: 'Save', exact: true }).click();
            await k.toast(/updated|saved/i, 60000);
            await loadEvent();
            expect(event.venue_lat && event.venue_lng && event.venue_map_link && !!event.venue_landmark && event.venue_name === originalVenue,
                `venue not completed in the API: ${JSON.stringify({ lat: event.venue_lat, lng: event.venue_lng, link: event.venue_map_link, city: event.venue_landmark, name: event.venue_name })}`);
            k.note(`V3b. venue completed: pin ${event.venue_lat}, ${event.venue_lng}, City ${event.venue_landmark}`, true);
            void lat;
            await go('venue');
            await venueName().waitFor({ timeout: 60000 });
            await page.waitForTimeout(800);
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

    // The organizer's real flow (Jamal, 2026-11-12): Use My Current Location, then type the hall's name
    // ("JK Mahal"), pick it from the nearest-first list → the pin goes there. Venue put back afterwards.
    await step('V4. Venue: My Location → search "JK Mahal" → pick nearest → Save (then put back)', async () => {
        const ME = { latitude: 8.7164, longitude: 77.7366, accuracy: 30 }; // Palayamkottai
        const ctx = page.context();
        await ctx.grantPermissions(['geolocation']);
        await ctx.setGeolocation(ME);
        const before = await loadEvent();
        const keep = { venue_name: before.venue_name, venue_address: before.venue_address, venue_landmark: before.venue_landmark,
            venue_lat: before.venue_lat, venue_lng: before.venue_lng, venue_map_link: before.venue_map_link };
        const latBox = page.getByPlaceholder('13.0827');
        const lngBox = page.getByPlaceholder('80.2707');
        const cityBox = page.getByPlaceholder('e.g. Chennai');
        const addrBox = page.getByPlaceholder('Please enter the venue address');
        const km = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
            return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2)); };
        const pinNow = async () => ({ lat: Number(await latBox.inputValue()), lng: Number(await lngBox.inputValue()) });
        let restored = false;
        try {
            await go('venue');
            await venueName().waitFor({ timeout: 60000 });
            await page.waitForTimeout(1500);
            // A new event's empty venue.
            await venueName().fill(''); await addrBox.fill(''); await cityBox.fill('');
            await page.getByRole('button', { name: 'Use My Current Location' }).click();
            await page.waitForFunction((want) => { const el = document.querySelector('input[placeholder="13.0827"]'); return el && Math.abs(Number(el.value) - want) < 0.001; }, ME.latitude, { timeout: 20000 });
            await page.waitForTimeout(2500); // the address lookup for the pin
            await k.shot('venue-my-location');
            const mine = await pinNow();
            k.note(`V4a. My Location pin ${mine.lat}, ${mine.lng}${(await venueName().inputValue()) ? ` · filled "${await venueName().inputValue()}"` : ''}`, true);

            await page.getByPlaceholder('Search a venue, area or address').fill('JK Mahal');
            await page.getByRole('button', { name: 'Search', exact: true }).click();
            const list = page.getByText('Nearest to you first');
            const noPlace = page.getByText(/No place found/);
            const moved = page.waitForFunction((want) => { const el = document.querySelector('input[placeholder="13.0827"]'); return el && Math.abs(Number(el.value) - want) > 0.0005; }, mine.lat, { timeout: 30000 }).then(() => 'moved').catch(() => null);
            const outcome = await Promise.race([
                list.waitFor({ timeout: 30000 }).then(() => 'list').catch(() => null),
                noPlace.waitFor({ timeout: 30000 }).then(() => 'none').catch(() => null),
                moved,
            ]);
            expect(outcome && outcome !== 'none', 'searching "JK Mahal" found no place');
            if (outcome === 'list') {
                const rows = list.locator('xpath=../..').getByRole('button').filter({ hasNotText: /^$/ });
                const n = await rows.count();
                const texts = [];
                for (let i = 1; i < n; i++) texts.push((await rows.nth(i).innerText()).replace(/\s+/g, ' ').trim());
                await k.shot('venue-search-results');
                const dists = texts.map((t) => { const m = t.match(/([\d.]+)\s*(km|m)\b/i); return m ? Number(m[1]) / (m[2].toLowerCase() === 'm' ? 1000 : 1) : null; }).filter((d) => d !== null);
                k.note(`V4b. results (nearest first): ${texts.slice(0, 5).join(' | ')}`, true);
                expect(dists.every((d, i) => i === 0 || d >= dists[i - 1]), `results are not nearest-first: ${dists.join(', ')}`);
                await rows.nth(1).click();
                await moved;
            }
            await page.waitForTimeout(2500);
            const pin = await pinNow();
            const name = await venueName().inputValue();
            const addr = await addrBox.inputValue();
            const city = await cityBox.inputValue();
            await k.shot('venue-picked');
            const away = km({ lat: mine.lat, lng: mine.lng }, pin);
            k.note(`V4c. picked: pin ${pin.lat}, ${pin.lng} (${away.toFixed(1)} km from me) · name "${name}" · city "${city}"`, true);
            expect(away < 50, `the picked place is ${away.toFixed(0)} km away - not near my location`);
            expect(name && addr && city, `the pick did not fill the venue: name "${name}", address "${addr}", city "${city}"`);
            await page.getByRole('button', { name: 'Save', exact: true }).click();
            await k.toast(/updated|saved/i, 60000);
            const saved = await loadEvent();
            expect(Math.abs(Number(saved.venue_lat) - pin.lat) < 1e-5 && saved.venue_name === name && String(saved.venue_map_link || '').includes(String(pin.lat).slice(0, 6)),
                `saved venue ≠ the pick: ${JSON.stringify({ lat: saved.venue_lat, name: saved.venue_name, link: saved.venue_map_link })}`);
        } finally {
            // Put the venue back exactly (API), then confirm.
            await api(`/client/events/${EVENT}`, { method: 'PUT', body: JSON.stringify(keep) });
            const back = await loadEvent();
            restored = back.venue_name === keep.venue_name && String(back.venue_lat) === String(keep.venue_lat) && back.venue_landmark === keep.venue_landmark;
            if (!restored) console.log('    !! venue NOT restored:', JSON.stringify({ was: keep, now: { name: back.venue_name, lat: back.venue_lat, city: back.venue_landmark } }));
        }
        expect(restored, 'the venue was NOT put back - see the log line above');
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
