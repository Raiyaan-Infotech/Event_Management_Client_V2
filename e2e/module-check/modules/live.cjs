// Live Streaming (Jamal's "Live Stream Updated" screens, 2026-11-11) — the standard steps (docs/MODULE_TESTING.md):
// overview → Create Category → Create Live Stream (form → Review & Create) → edit → View Live Stream →
// Share → Go Live / End Stream → Duplicate → hide (Show Stream in Event Page off) → delete. Cleans up after itself.
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const CAT = `${STAMP} Category`;
    const TITLE = `${STAMP} Ceremony Live`;
    const TITLE2 = `${TITLE} edited`;
    const URL = `https://youtube.com/live/${STAMP.toLowerCase().replace(/[^a-z0-9]/g, '')}abc`;
    const all = async () => (await api(`/client/events/${EVENT}/live-streams`)).body?.data?.streams || [];
    const mine = async () => (await all()).filter((s) => s.title.startsWith(TITLE));
    const types = async () => (await api(`/client/events/${EVENT}/live-stream-types`)).body?.data;
    const myType = async () => ((await types())?.types || []).find((t) => t.name === CAT) || null;
    const panel = () => page.locator('[data-slot="sheet-content"][data-state="open"]').last();
    const choose = async (label, option) => {
        await panel().getByRole('combobox', { name: label, exact: true }).click();
        await page.getByRole('option', { name: option }).first().click();
    };
    const rowMenu = async (title, item) => {
        await page.locator('tr').filter({ hasText: title }).first().getByRole('button', { name: 'Stream actions' }).click();
        await page.getByRole('menuitem', { name: item }).first().click();
        await page.waitForTimeout(500);
    };

    await step('1. page loads', async () => {
        await k.openTab('live', /Create Live Stream/i);
        await page.getByText('Total Streams').first().waitFor();
        await page.getByText('Live Streams by Category').first().waitFor();
        await k.shot('page');
    });
    await step('2. loading state', () => k.loadingCheck('live', /Create Live Stream/i));

    await step('2b. Create Category (right-side form)', async () => {
        await page.getByRole('button', { name: /Create Category/i }).first().click();
        expect(await k.isSlideIn(), 'Create Category is not a slide-in panel');
        await panel().getByRole('button', { name: /Save Category/i }).click();
        await k.toast(/enter the category name/i);
        await panel().getByPlaceholder('e.g. Reception Live').fill(CAT);
        await panel().getByPlaceholder('What this category covers').fill('Made by the module check.');
        await choose('Default Visibility', /Participants Only/);
        await k.shot('category-form');
        await panel().getByRole('button', { name: /Save Category/i }).click();
        await k.toast(/Category created/i);
        await k.panelClosed();
        const t = await myType();
        expect(t && t.default_visibility === 'participants' && t.is_active === true, 'category not saved with its visibility');
        await page.getByText(CAT).first().waitFor();
    });

    await step('3. error message (Review with nothing filled)', async () => {
        await page.getByRole('button', { name: /Create Live Stream/i }).first().click();
        expect(await k.isSlideIn(), 'Create Live Stream is not a slide-in panel');
        await panel().getByRole('button', { name: /Review & Create/i }).click();
        await k.toast(/fill all mandatory fields/i);
        await k.shot('error-message');
    });

    await step('4. add (form → Review & Create)', async () => {
        const day = String((await types())?.event_start_date || '').slice(0, 10);
        await panel().getByPlaceholder('e.g., Main Wedding Ceremony').fill(TITLE);
        await choose('Stream Category', CAT);
        await panel().getByRole('combobox', { name: 'Streaming Platform', exact: true }).click();
        expect((await page.getByRole('option').count()) === 9, 'the platform dropdown does not list 9 platforms');
        await k.shot('platform-dropdown');
        await page.getByRole('option', { name: /YouTube Live/ }).click();
        await panel().getByPlaceholder(/youtube\.com\/live\/abc123/).fill(URL);
        // The category's default visibility was applied; the dropdown lists all six.
        await panel().getByRole('combobox', { name: 'Visibility', exact: true }).click();
        expect((await page.getByRole('option').count()) === 6, 'the visibility dropdown does not list 6 choices');
        await k.shot('visibility-dropdown');
        await page.getByRole('option', { name: /^Public/ }).click();
        await panel().locator('input[type="date"]').fill(day);
        await panel().getByLabel('Start Time').fill('09:30');
        await panel().getByLabel('End Time').fill('11:00');
        await panel().getByPlaceholder(/short description/).fill('Live from the wedding mandap');
        await k.shot('stream-form');
        await panel().getByRole('button', { name: /Review & Create/i }).click();
        await panel().getByText('Publishing Options').waitFor();
        await panel().getByText(TITLE).first().waitFor();
        await k.shot('review');
        // No notification to real participants from a test.
        await panel().getByRole('switch', { name: 'Notify Participants' }).click();
        await panel().getByRole('switch', { name: 'Go Live Automatically' }).click();
        await k.saveAndWatch(/^Schedule Stream$/, 'saving');
        await k.toast(/Live stream created/i);
        await k.panelClosed();
        const s = (await mine())[0];
        expect(s, 'new stream not in the API');
        expect(s.visibility === 'public' && s.end_time === '11:00' && s.status === 'scheduled' && s.notify_participants === false, `stream saved wrong: ${JSON.stringify({ v: s.visibility, e: s.end_time, st: s.status })}`);
        await page.locator('tr').filter({ hasText: TITLE }).first().waitFor();
        await k.shot('added');
    });

    await step('6. edit', async () => {
        await rowMenu(TITLE, /Edit Stream/);
        await panel().getByPlaceholder('e.g., Main Wedding Ceremony').fill(TITLE2);
        await panel().getByRole('button', { name: /Review & Save/i }).click();
        await panel().getByRole('button', { name: /Save Changes/i }).click();
        await k.toast(/Live stream updated/i);
        await k.panelClosed();
        await page.locator('tr').filter({ hasText: TITLE2 }).first().waitFor();
        expect((await mine())[0]?.title === TITLE2, 'edit not saved in the API');
    });

    await step('7. view (View Live Stream page) + Go Live / End Stream', async () => {
        await rowMenu(TITLE2, /View Stream/);
        await page.getByText('View Live Stream').first().waitFor();
        await page.getByText('Stream Information').first().waitFor();
        await page.getByText('Viewer Statistics').first().waitFor();
        expect((await page.locator('iframe[src*="youtube.com/embed/"]').count()) === 1, 'the YouTube stream is not embedded');
        await k.shot('view');
        await page.getByRole('button', { name: /^Go Live$/ }).click();
        await k.toast(/stream is live/i);
        await page.getByRole('button', { name: /End Stream/ }).waitFor();
        expect((await mine())[0]?.status === 'live', 'Go Live not saved in the API');
        await k.shot('view-live');
        await page.getByRole('button', { name: /End Stream/ }).click();
        await k.toast(/Live stream ended/i);
        expect((await mine())[0]?.status === 'ended', 'End Stream not saved in the API');
    });

    await step('7b. Share Stream (link + QR)', async () => {
        await page.getByRole('button', { name: /Share Link/ }).click();
        expect(await k.isSlideIn(), 'Share Stream is not a slide-in panel');
        await panel().getByText('Scan to Watch').waitFor();
        expect((await panel().locator('svg[height="132"]').count()) === 1, 'no QR code in the Share panel');
        await panel().getByText(URL).first().waitFor();
        for (const t of ['Copy Link', 'Download QR', 'Share via WhatsApp', 'Share via Email', 'Share to Participants']) await panel().getByText(t, { exact: true }).waitFor();
        await k.shot('share');
        await page.keyboard.press('Escape');
        await k.panelClosed();
        await page.getByRole('button', { name: 'Back to live streams' }).click();
        await page.getByText('Live Streams by Category').first().waitFor();
    });

    await step('7c. Duplicate Stream', async () => {
        await rowMenu(TITLE2, /Duplicate Stream/);
        await k.toast(/Live stream duplicated/i);
        const list = await mine();
        const copy = list.find((s) => s.title.endsWith('(Copy)'));
        expect(list.length === 2 && copy && copy.status === 'scheduled', 'the copy is not in the API as a scheduled stream');
        await api(`/client/live-streams/${copy.id}`, { method: 'DELETE' });
        await k.openTab('live', /Create Live Stream/i);
    });

    await step('8. hide (Show Stream in Event Page off)', async () => {
        await rowMenu(TITLE2, /Edit Stream/);
        await panel().getByRole('button', { name: /Review & Save/i }).click();
        await panel().getByRole('switch', { name: 'Show Stream in Event Page' }).click();
        await panel().getByRole('button', { name: /Save Changes/i }).click();
        await k.toast(/Live stream updated/i);
        await k.panelClosed();
        expect((await mine())[0]?.is_enabled === false, 'hide not saved in the API');
        await page.locator('tr').filter({ hasText: TITLE2 }).getByText('(hidden)').waitFor();
    });

    await step('9. delete', async () => {
        await rowMenu(TITLE2, /Delete Stream/);
        await k.confirmDelete();
        await k.toast(/Live stream deleted/i);
        await k.panelClosed();
        expect((await mine()).length === 0, 'stream still in the API');
    });

    await step('10. clean up', async () => {
        for (const s of await mine()) await api(`/client/live-streams/${s.id}`, { method: 'DELETE' });
        const t = await myType();
        if (t) await api(`/client/live-stream-types/${t.id}`, { method: 'DELETE' });
        expect((await mine()).length === 0 && !(await myType()), 'test data left behind');
    });
};
