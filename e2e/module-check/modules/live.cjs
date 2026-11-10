// Live Streaming — standard steps (docs/MODULE_TESTING.md). Hide = the row's "Enabled" switch.
// Needs at least one category on the event (Add Category) — made by the test if missing, and removed again.
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const TITLE = `${STAMP} Ceremony Live`;
    const TITLE2 = `${TITLE} edited`;
    const URL = `https://youtube.com/live/${STAMP.toLowerCase()}`;
    const mine = async () => ((await api(`/client/events/${EVENT}/live-streams`)).body?.data?.streams || []).filter((s) => s.title.startsWith(TITLE));
    const row = (t) => page.locator('li').filter({ hasText: t }).last();
    let madeType = null;

    await step('0. a category exists', async () => {
        const types = (await api(`/client/events/${EVENT}/live-stream-types`)).body?.data?.types || [];
        if (!types.length) {
            const r = await api(`/client/events/${EVENT}/live-stream-types`, { method: 'POST', body: JSON.stringify({ name: `${STAMP} Main` }) });
            madeType = r.body?.data?.type?.id ?? r.body?.data?.id ?? null;
            expect(r.status < 300, `could not make a category (${r.status})`);
        }
    });

    await step('1. page loads', async () => {
        await k.openTab('live', /Add Live Stream/i);
        await page.getByText('Total Streams').first().waitFor();
        await k.shot('page');
    });
    await step('2. loading state', () => k.loadingCheck('live', /Add Live Stream/i));

    await step('3. error message (save empty)', async () => {
        await page.getByRole('button', { name: /Add Live Stream/i }).first().click();
        await page.getByRole('dialog').getByRole('button', { name: /Add Live Stream/i }).click();
        await k.toast(/fill all mandatory fields/i);
        await k.shot('error-message');
        k.note('3b. add form is a slide-in panel', await k.isSlideIn(), 'Add form opens as a centre popup, not the slide-in panel');
    });

    await step('4. add', async () => {
        const start = (await api(`/client/events/${EVENT}/live-stream-types`)).body?.data?.event_start_date;
        const dialog = page.getByRole('dialog');
        await dialog.getByPlaceholder(/Wedding Ceremony Live/).fill(TITLE);
        await dialog.getByPlaceholder('https://').fill(URL);
        await dialog.locator('input[type="date"]').fill(String(start || '').slice(0, 10));
        await dialog.locator('input[type="time"]').fill('18:30');
        await k.saveAndWatch(/^Add Live Stream$/, 'saving');
        await k.toast(/Live stream added/i);
        await k.panelClosed();
        expect((await mine()).length === 1, 'new stream not in the API');
        await row(TITLE).waitFor();
        await k.shot('added');
    });

    await step('6. edit', async () => {
        await row(TITLE).getByRole('button', { name: 'Edit' }).click();
        await page.getByRole('dialog').getByPlaceholder(/Wedding Ceremony Live/).fill(TITLE2);
        await page.getByRole('button', { name: /Save Changes/i }).click();
        await k.toast(/Live stream updated/i);
        await k.panelClosed();
        await row(TITLE2).waitFor();
        expect((await mine())[0]?.title === TITLE2, 'edit not saved in the API');
    });

    await step('7. view opens', async () => {
        await row(TITLE2).getByRole('button', { name: TITLE2 }).click();
        await page.getByRole('dialog').first().waitFor();
        await k.shot('view');
        const slideIn = await k.isSlideIn();
        await page.keyboard.press('Escape');
        await k.panelClosed();
        k.note('7b. view is a slide-in panel', slideIn, 'View opens as a centre popup, not the slide-in panel');
    });

    await step('8. hide (Enabled switch off)', async () => {
        await row(TITLE2).getByRole('switch', { name: 'Enabled' }).click();
        await k.toast(/Live stream disabled/i);
        await page.waitForTimeout(1500);
        expect((await mine())[0]?.is_enabled === false, 'disable not saved in the API');
    });

    await step('9. delete', async () => {
        await row(TITLE2).getByRole('button', { name: 'Delete' }).click();
        await k.confirmDelete();
        await k.toast(/Live stream deleted/i);
        await k.panelClosed();
        expect((await mine()).length === 0, 'stream still in the API');
    });

    await step('10. clean up', async () => {
        for (const s of await mine()) await api(`/client/live-streams/${s.id}`, { method: 'DELETE' });
        if (madeType) await api(`/client/live-stream-types/${madeType}`, { method: 'DELETE' });
        expect((await mine()).length === 0, 'test streams left behind');
    });
};
