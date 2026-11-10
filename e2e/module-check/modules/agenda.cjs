// Agenda — standard steps (docs/MODULE_TESTING.md). Agenda has no View / Hide; rows have Edit + Delete buttons,
// and the form stays open after an add (ready for the next session).
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const TITLE = `${STAMP} Haldi`;
    const TITLE2 = `${TITLE} edited`;
    const mine = async () => ((await api(`/client/events/${EVENT}/agenda`)).body?.data?.items || []).filter((i) => i.title.startsWith(TITLE));
    const row = (t) => page.locator('div.rounded-xl.border').filter({ hasText: t }).filter({ has: page.getByRole('button', { name: 'Edit' }) }).last();
    const closeForm = async () => { await page.keyboard.press('Escape'); await k.panelClosed(); };

    await step('1. page loads', async () => {
        await k.openTab('agenda', /Add Session/i);
        await page.getByText('Event Agenda').first().waitFor();
        await k.shot('page');
    });
    await step('2. loading state', () => k.loadingCheck('agenda', /Add Session/i));

    await step('3. error message (save empty)', async () => {
        await page.getByRole('button', { name: /Add Session/i }).first().click();
        await page.getByRole('button', { name: /Save Session/i }).waitFor();
        await page.getByRole('button', { name: /Save Session/i }).click();
        await k.toast(/complete all required fields/i);
        await k.shot('error-message');
    });

    await step('4. add', async () => {
        const dialog = page.getByRole('dialog');
        const times = dialog.locator('input[type="time"]');
        await times.nth(0).fill('10:00');
        await times.nth(1).fill('11:00');
        await page.locator('#agenda-title').fill(TITLE);
        await k.saveAndWatch(/Save Session/i, 'saving');
        await k.toast(/Session added/i);
        expect((await mine()).length === 1, 'new session not in the API');
        await closeForm();
        await row(TITLE).waitFor();
        await k.shot('added');
    });

    await step('6. edit', async () => {
        await row(TITLE).getByRole('button', { name: 'Edit' }).click();
        await page.locator('#agenda-title').fill(TITLE2);
        await page.getByRole('button', { name: /Update Session/i }).click();
        await k.toast(/Session updated/i);
        await k.panelClosed();
        await row(TITLE2).waitFor();
        expect((await mine())[0]?.title === TITLE2, 'edit not saved in the API');
    });

    await step('7. view — n/a (Agenda rows show everything inline)', async () => {});
    await step('8. hide — n/a (Agenda has no per-session hide)', async () => {});

    await step('9. delete', async () => {
        await row(TITLE2).getByRole('button', { name: 'Delete' }).click();
        await k.confirmDelete();
        await k.toast(/deleted/i);
        await k.panelClosed();
        expect((await mine()).length === 0, 'session still in the API');
    });

    await step('10. clean up', async () => {
        for (const i of await mine()) await api(`/client/agenda/${i.id}`, { method: 'DELETE' });
        expect((await mine()).length === 0, 'test sessions left behind');
    });
};
