// Participants — standard steps (docs/MODULE_TESTING.md) + Block / Unblock.
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const FIRST = `${STAMP}`;
    const MOBILE = `98${String(Date.now()).slice(-8)}`;
    const mine = async () => {
        const r = await api(`/client/participants?event_id=${EVENT}&search=${encodeURIComponent(STAMP)}&limit=50`);
        const d = r.body?.data;
        return (Array.isArray(d) ? d : d?.items || []).filter((p) => (p.name || p.first_name || '').includes(STAMP));
    };
    let NAME = null; // the full name as the list shows it ("Mr. QA-xxx")
    const menu = async (item) => {
        await page.getByRole('button', { name: new RegExp(`Actions for .*${STAMP}`) }).first().click();
        await page.getByRole('menuitem', { name: item }).click();
        await page.waitForTimeout(500);
    };

    await step('1. page loads', async () => {
        await k.openTab('participants', /Add Participant/i);
        await page.getByText('Total Participants').first().waitFor();
        await k.shot('page');
    });
    await step('2. loading state', () => k.loadingCheck('participants', /Add Participant/i));

    await step('3. error message (save empty)', async () => {
        await page.getByRole('button', { name: /Add Participant/i }).first().click();
        await page.getByPlaceholder('Enter first name').waitFor();
        await page.getByRole('dialog').getByRole('button', { name: /Add Participant/ }).last().click();
        await k.toast(/complete all required fields/i);
        await k.shot('error-message');
    });

    await step('4. add', async () => {
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('combobox').first().click();
        await page.getByRole('option').first().click();
        await page.getByPlaceholder('Enter first name').fill(FIRST);
        await page.getByPlaceholder('Enter mobile number').fill(MOBILE);
        await dialog.getByRole('button', { name: /^Bride/i }).first().click();
        await dialog.getByRole('combobox').filter({ hasText: /Select relation/ }).first().click();
        await page.getByRole('option').first().click();
        await k.saveAndWatch(/Add Participant|Adding/, 'saving');
        await k.toast(/Participant added/i);
        await k.panelClosed();
        const list = await mine();
        expect(list.length === 1, 'new participant not in the API');
        NAME = list[0].name;
        await page.getByText(STAMP).first().waitFor();
        await k.shot('added');
    });

    await step('6. edit', async () => {
        await menu(/Edit Participant/);
        await page.getByRole('dialog').getByText('Edit Participant').first().waitFor();
        const notes = page.getByRole('dialog').locator('textarea').first();
        if (await notes.count()) await notes.fill(`${STAMP} edited note`);
        await page.getByRole('button', { name: /Save Changes|^Update$/ }).last().click();
        await k.toast(/Participant updated/i);
        await k.panelClosed();
    });

    await step('7. view (View Participant)', async () => {
        await menu(/View Participant/);
        await page.getByRole('dialog').getByText('Participant Details').first().waitFor();
        await k.shot('view');
        k.note('7b. view is a slide-in panel', await k.isSlideIn(), 'View Participant is not a slide-in panel');
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('extra: block, then unblock', async () => {
        await menu(/Block Participant/);
        const dialog = page.getByRole('dialog');
        const reason = dialog.getByRole('combobox');
        if (await reason.count()) { await reason.first().click(); await page.getByRole('option').first().click(); }
        await dialog.getByRole('button', { name: /Block Participant/ }).last().click();
        await k.toast(/Participant updated/i);
        await k.panelClosed();
        expect((await mine())[0]?.is_blocked === true, 'block not saved in the API');
        await menu(/Unblock Participant/);
        await page.getByRole('dialog').getByRole('button', { name: /Unblock Participant/ }).last().click();
        await k.toast(/Participant updated/i);
        await k.panelClosed();
        expect((await mine())[0]?.is_blocked === false, 'unblock not saved in the API');
    });

    await step('8. hide', async () => {
        await menu(/Hide Participant/);
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('combobox').first().click();
        await page.getByRole('option').first().click();
        const keep = dialog.locator('button[role="checkbox"]').last();
        if ((await keep.getAttribute('data-state')) !== 'checked') await keep.click();
        await dialog.getByRole('button', { name: /Hide Participant/ }).last().click();
        await k.toast(/Participant updated/i);
        await k.panelClosed();
        expect((await mine())[0]?.is_hidden === true, 'hide not saved in the API');
    });

    await step('9. delete', async () => {
        // A hidden participant may only be in the Hidden tab.
        if (!(await page.getByRole('button', { name: new RegExp(`Actions for .*${STAMP}`) }).count())) {
            await page.getByRole('button', { name: /Hidden/ }).or(page.getByRole('tab', { name: /Hidden/ })).first().click().catch(() => null);
        }
        await menu(/Delete Participant/);
        const tick = page.getByRole('checkbox', { name: /understand/i });
        if (await tick.count()) await tick.click();
        await k.confirmDelete();
        await k.toast(/Participant removed/i);
        await k.panelClosed();
        expect((await mine()).length === 0, 'participant still in the API');
    });

    await step('10. clean up', async () => {
        for (const p of await mine()) await api(`/client/participants/${p.id}`, { method: 'DELETE' });
        expect((await mine()).length === 0, 'test participants left behind');
    });
    void NAME;
};
