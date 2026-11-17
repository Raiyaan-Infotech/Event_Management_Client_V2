// 2026-11-17: Splash Screen page (Jamal's design) with templates + frames from the admin portal, and the
// template Event Logo on the invitation. Saves the splash ONCE, then puts the event's original splash
// back (or deletes the one it created). The event's own logo is not changed.
module.exports = async (k) => {
    const { page, step, expect, api, EVENT } = k;
    const PORTAL_URL = k.PORTAL;
    let event = {};
    let original = null; // the splash row before the test
    let frames = [];
    let templates = [];
    const phone = () => page.locator('div.rounded-\\[40px\\]').first();

    const splashRow = async () => {
        const r = await api(`/client/splash-screens?event_id=${EVENT}&limit=100`);
        return (r.body?.data || []).find((x) => Number(x.event_id) === Number(EVENT)) || null;
    };

    await step('setup: event, its splash row, admin frames + templates (API)', async () => {
        const e = await api(`/client/events/${EVENT}`);
        event = e.body?.data?.event || e.body?.data || {};
        expect(event.name, `event not readable (${e.status})`);
        original = await splashRow();
        const d = await api('/client/splash-screens/decorations');
        frames = d.body?.data?.frames || [];
        const o = await api('/client/event-options');
        templates = o.body?.data?.templates || [];
        return `event "${event.name}", splash row ${original ? `#${original.id} (${original.status})` : 'none'}, ${frames.length} frames, ${templates.length} templates`;
    });

    await step('A1. Backend: splash frames list = admin Frame Styles (was empty)', async () => {
        expect(frames.length > 0, 'no frames returned - backend frames change not live?');
        expect(frames.every((f) => f.id && f.file_url), 'a frame without id / artwork');
        return `${frames.length} frames`;
    });

    await step('A2. Backend: templates carry the sample Event Logo + position', async () => {
        const withLogo = templates.filter((t) => t.logo_image);
        expect(templates.length > 0, 'no templates on the plan');
        expect(withLogo.length === templates.length, `${withLogo.length}/${templates.length} templates have a logo`);
        expect(templates.every((t) => t.logo_position), 'logo_position missing');
        return `${withLogo.length}/${templates.length} with logo, e.g. ${templates[0].name}: ${templates[0].logo_position} ${templates[0].logo_size}%`;
    });

    await step('S1. Event sidebar → Splash Screen opens the new design', async () => {
        await page.goto(`${PORTAL_URL}/event/${EVENT}?tab=splash`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByText('Splash Content', { exact: true }).waitFor({ timeout: 90000 });
        for (const t of ['Enable Splash Screen', 'Show Event Date', 'Show Event Logo / Monogram', 'Design & Style', 'Background Type',
            'Border / Frame Style', 'Animation / Style', 'Display Duration', 'Quick Templates']) {
            await page.getByText(t, { exact: true }).first().waitFor({ timeout: 15000 });
        }
        for (const b of ['Image', 'Gradient', 'Solid Color', 'Preview', 'Reset to Default', 'Save']) {
            expect(await page.getByRole('button', { name: b, exact: true }).count() > 0, `button missing: ${b}`);
        }
        await page.waitForTimeout(1500);
        await k.shot('splash-page');
    });

    await step('S2. Logo = template sample (or the event logo), shown in the phone', async () => {
        const img = phone().locator('img').filter({ hasNot: page.locator('[aria-hidden]') });
        const srcs = await phone().locator('img').evaluateAll((els) => els.map((e) => e.getAttribute('src') || ''));
        const logo = srcs.find((s) => /template-logos|logo/i.test(s)) || (event.logo_image && srcs.find((s) => s.includes(event.logo_image)));
        expect(logo, `no logo image in the phone (imgs: ${srcs.map((s) => s.slice(-40)).join(', ')})`);
        void img;
        return logo.slice(-60);
    });

    await step('S3. Quick Templates = the admin invitation templates', async () => {
        const tiles = page.locator('button[aria-pressed]').filter({ has: page.locator('span.truncate') });
        const n = await tiles.count();
        expect(n > 0, 'no template tiles');
        const names = await tiles.locator('span.truncate').allTextContents();
        expect(names.every((nm) => templates.some((t) => t.name === nm)), `tile not an admin template: ${names.find((nm) => !templates.some((t) => t.name === nm))}`);
        return `${n} tiles (${names.slice(0, 3).join(', ')}…)`;
    });

    await step('S4. Background types: Gradient / Solid Color / Image each show their controls', async () => {
        await page.getByRole('button', { name: 'Gradient', exact: true }).click();
        await page.getByText('Gradient Colors', { exact: true }).waitFor();
        await page.getByText('Gradient Style', { exact: true }).waitFor();
        await k.shot('splash-gradient');
        await page.getByRole('button', { name: 'Solid Color', exact: true }).click();
        await page.getByText('Primary Background Color', { exact: false }).first().waitFor();
        await k.shot('splash-solid');
        await page.getByRole('button', { name: 'Image', exact: true }).click();
        await page.getByText('Background Image', { exact: true }).waitFor();
        await page.getByText('Overlay Color', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Gradient', exact: true }).click();
    });

    await step('S5. Border / Frame Style tiles = admin frames; picking one draws it in the phone', async () => {
        const first = frames.find((f) => !f.supported_layouts?.length || f.supported_layouts.includes('portrait'));
        const tile = page.locator(`button[title="${first.name.replace(/"/g, '\\"')}"]`).first();
        await tile.waitFor({ timeout: 20000 });
        await tile.click();
        expect(await tile.getAttribute('aria-pressed') === 'true', 'frame tile not selected');
        const srcs = await phone().locator('img').evaluateAll((els) => els.map((e) => e.getAttribute('src') || ''));
        const file = first.file_url.split('/').pop();
        expect(srcs.some((s) => s.endsWith(file)), 'picked frame not drawn in the phone');
        await page.getByText(/Show all \d+ frames/).first().waitFor({ timeout: 5000 }).catch(() => null);
        await k.shot('splash-frame');
        return first.name;
    });

    let pickedTemplate = null;
    await step('S6. Click a Quick Template → its look is applied', async () => {
        const tile = page.locator('button[aria-pressed]').filter({ has: page.locator('span.truncate') }).nth(1);
        pickedTemplate = (await tile.locator('span.truncate').textContent()) || '';
        await tile.click();
        expect(await tile.getAttribute('aria-pressed') === 'true', 'template tile not selected');
        await page.waitForTimeout(600);
        await k.shot('splash-template');
        return pickedTemplate;
    });

    await step('S7. Preview opens the large phone, Close shuts it', async () => {
        await page.getByRole('button', { name: 'Preview', exact: true }).click();
        const dlg = page.locator('[data-slot="dialog-content"][data-state="open"]').last();
        await dlg.waitFor({ timeout: 10000 });
        await page.waitForTimeout(1200);
        await k.shot('splash-preview');
        await dlg.getByRole('button', { name: 'Close' }).click();
        await dlg.waitFor({ state: 'detached', timeout: 10000 });
    });

    await step('C1. Splash Components: old fields back with on/off (Event Title, Host Names, Venue, Decoration…)', async () => {
        await page.getByText('Splash Components', { exact: true }).waitFor();
        for (const l of ['Event Logo / Monogram', 'Event Title', 'Host / Couple Names', 'Decoration', 'Subtitle / Tagline', 'Date & Time', 'Venue']) {
            expect(await page.getByRole('switch', { name: l, exact: true }).count() === 1, `switch missing: ${l}`);
        }
        const venue = page.getByRole('switch', { name: 'Venue', exact: true });
        if ((await venue.getAttribute('aria-checked')) !== 'true') await venue.click();
        const title = page.getByRole('switch', { name: 'Event Title', exact: true });
        if ((await title.getAttribute('aria-checked')) !== 'true') await title.click();
        await phone().locator('[data-splash-part="venue"]').waitFor({ timeout: 5000 }).catch(() => null);
        const hasVenue = await phone().locator('[data-splash-part="venue"]').count();
        const hasTitle = await phone().locator('[data-splash-part="event_title"]').count();
        expect(hasTitle === 1, 'Event Title not drawn after switching it on');
        await k.shot('splash-components');
        return `venue drawn: ${hasVenue ? 'yes' : 'no (event has no venue)'}; event title drawn`;
    });

    await step('C2. Component Order: drag "Event Title" to first place → phone follows', async () => {
        const chips = page.locator('ul[aria-label="Component order"] li');
        await chips.filter({ hasText: 'Event Title' }).dragTo(chips.first());
        await page.waitForTimeout(500);
        const first = await chips.first().getAttribute('data-part');
        expect(first === 'event_title', `first chip is ${first}`);
        const order = await phone().locator('[data-splash-part]').evaluateAll((els) => els.map((e) => e.getAttribute('data-splash-part')));
        expect(order[0] === 'event_title', `phone order starts with ${order[0]} (${order.join(', ')})`);
        await k.shot('splash-order');
        return order.join(' → ');
    });

    await step('S8. Save stores the splash (template, frame, logo copy for the app)', async () => {
        await page.getByLabel('Show event date').click(); // a change, so the save is a real write
        await page.getByLabel('Show event date').click();
        await page.getByRole('button', { name: 'Save', exact: true }).last().click();
        await k.toast(/saved|updated/i, 60000).catch(() => null);
        await page.waitForTimeout(4000);
        const row = await splashRow();
        expect(row, 'no splash row after save');
        const c = row.background_config || {};
        const t = templates.find((x) => x.name === pickedTemplate);
        expect(t && c.template === t.code, `saved template ${c.template}, expected ${t?.code}`);
        expect(c.duration && c.text_color && Array.isArray(c.gradient_colors) || row.background_type !== 'gradient', 'new design fields missing');
        expect(c.show_logo === false || !!c.logo_url, 'logo_url copy for the app missing');
        expect(Array.isArray(c.order) && c.order[0] === 'event_title', `saved order ${JSON.stringify(c.order)}`);
        expect(c.parts && c.parts.event_title === true && c.parts.venue === true, `saved parts ${JSON.stringify(c.parts)}`);
        expect(Array.isArray(row.component_order) && row.component_order[0] === 'event_title', `app component_order ${JSON.stringify(row.component_order)}`);
        return `row #${row.id} ${row.status}, template ${c.template}, frame ${c.frame_id ?? 'none'}, logo ${String(c.logo_url || '').slice(-40)}`;
    });

    await step('S9. Reload: the saved splash comes back', async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByText('Splash Content', { exact: true }).waitFor({ timeout: 90000 });
        await page.waitForTimeout(2000);
        const tile = page.locator('button[aria-pressed="true"]').filter({ has: page.locator('span.truncate') });
        expect(await tile.count() === 1, 'no template selected after reload');
        expect((await tile.locator('span.truncate').textContent()) === pickedTemplate, 'a different template is selected after reload');
        await k.shot('splash-reloaded');
    });

    await step('I1. Invitation page: template tiles draw the Event Logo', async () => {
        await page.goto(`${PORTAL_URL}/event/${EVENT}?tab=invitation`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('button', { name: 'Next' }).first().waitFor({ timeout: 90000 });
        await page.getByRole('button', { name: 'Next' }).first().click();
        await page.locator('[data-event-logo]').first().waitFor({ timeout: 30000 });
        const n = await page.locator('[data-event-logo]').count();
        await page.waitForTimeout(1500);
        await k.shot('invitation-logo');
        return `${n} cards with a logo`;
    });

    await step('clean up: put the original splash back', async () => {
        const now = await splashRow();
        if (!now) return 'nothing to clean';
        if (!original) {
            const r = await api(`/client/splash-screens/${now.id}`, { method: 'DELETE' });
            expect(r.status < 300, `delete failed ${r.status}`);
            return `deleted test row #${now.id}`;
        }
        const body = {
            main_title: original.main_title, tagline: original.tagline, background_type: original.background_type,
            background_url: original.background_url, bg_color: original.bg_color, background_config: original.background_config,
            components: original.components, component_order: original.component_order ?? null, status: original.status,
        };
        const r = await api(`/client/splash-screens/${original.id}`, { method: 'PUT', body: JSON.stringify(body) });
        expect(r.status < 300, `restore failed ${r.status} ${JSON.stringify(r.body?.message)}`);
        return `restored row #${original.id}`;
    });
};
