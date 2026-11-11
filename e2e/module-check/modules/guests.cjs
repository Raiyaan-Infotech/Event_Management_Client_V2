// Guests — standard steps (docs/MODULE_TESTING.md) + the row menu's Send Invitation / View RSVP panels.
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const NAME = `${STAMP} Guest`;
    const NAME2 = `${NAME} edited`;
    // A unique Indian mobile per run (9 + 9 digits from the stamp time).
    const MOBILE = `9${String(Date.now()).slice(-9)}`;
    const mine = async () => {
        const r = await api(`/client/guests?event_id=${EVENT}&search=${encodeURIComponent(STAMP)}&limit=50`);
        const d = r.body?.data;
        return (Array.isArray(d) ? d : d?.items || d?.guests || []).filter((g) => (g.name || '').startsWith(NAME));
    };
    const menu = async (name, item) => {
        await page.getByRole('button', { name: `Actions for ${name}` }).first().click();
        await page.getByRole('menuitem', { name: item }).click();
        await page.waitForTimeout(500);
    };

    let madeGroup = null;
    await step('0. a guest group exists', async () => {
        const r = await api('/client/guests/groups/all');
        if (!(r.body?.data?.groups || []).length) {
            const c = await api('/client/guests/groups', { method: 'POST', body: JSON.stringify({ name: `${STAMP} Friends` }) });
            expect(c.status < 300, `could not make a group (${c.status} ${JSON.stringify(c.body?.message)})`);
            madeGroup = c.body?.data?.group?.id ?? c.body?.data?.id ?? null;
        }
    });

    await step('1. page loads', async () => {
        await k.openTab('guests', /Add Guest/i);
        await page.getByText('Guest Overview').first().waitFor();
        await k.shot('page');
    });
    await step('2. loading state', () => k.loadingCheck('guests', /Add Guest/i));

    await step('3. error message (save empty)', async () => {
        await page.getByRole('button', { name: /Add Guest/i }).first().click();
        await page.getByRole('button', { name: /Save Guest/i }).click();
        await k.toast(/fill all mandatory fields/i);
        await k.shot('error-message');
    });

    await step('4. add', async () => {
        const dialog = page.getByRole('dialog');
        await page.getByPlaceholder('Enter full name').fill(NAME);
        await page.getByPlaceholder('Enter mobile number').fill(MOBILE);
        const groups = dialog.getByRole('combobox');
        if (await groups.count()) {
            await groups.last().click();
            await page.getByRole('option').first().click();
        }
        await k.saveAndWatch(/Save Guest|Saving/i, 'saving');
        await k.toast(/Guest added/i);
        await k.panelClosed();
        expect((await mine()).length === 1, 'new guest not in the API');
        await page.getByText(NAME).first().waitFor();
        await k.shot('added');
    });

    await step('6. edit', async () => {
        await menu(NAME, /Edit Guest/);
        await page.getByPlaceholder('Enter full name').fill(NAME2);
        await page.getByRole('button', { name: /Save Changes/i }).click();
        await k.toast(/Guest updated/i);
        await k.panelClosed();
        await page.getByText(NAME2).first().waitFor();
        expect((await mine())[0]?.name === NAME2, 'edit not saved in the API');
    });

    await step('7. view (View Guest)', async () => {
        await menu(NAME2, /View Guest/);
        await page.getByRole('dialog').getByText('View Guest').first().waitFor();
        await k.shot('view');
        k.note('7b. view is a slide-in panel', await k.isSlideIn(), 'View Guest is not a slide-in panel');
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('extra: Send Invitation + View RSVP panels open', async () => {
        await menu(NAME2, /Send Invitation/);
        await page.getByRole('dialog').getByText('Invitation Channels').first().waitFor();
        await k.shot('send-invitation');
        await page.keyboard.press('Escape');
        await k.panelClosed();
        await menu(NAME2, /View RSVP Response/);
        await page.getByRole('dialog').getByText(/View RSVP Response/).first().waitFor();
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('8. hide — n/a (guests have no hide in the row menu)', async () => {});

    await step('9. delete', async () => {
        await menu(NAME2, /Delete Guest/);
        // Guests still use the slide-in delete panel (tick "I understand…"): tick it if it is there.
        const tick = page.getByRole('checkbox', { name: /understand/i });
        if (await tick.count()) await tick.click();
        await k.confirmDelete();
        await k.toast(/Guest removed|deleted/i);
        await k.panelClosed();
        expect((await mine()).length === 0, 'guest still in the API');
    });

    await step('10. clean up', async () => {
        for (const g of await mine()) await api(`/client/guests/${g.id}`, { method: 'DELETE' });
        if (madeGroup) await api(`/client/guests/groups/${madeGroup}`, { method: 'DELETE' });
        expect((await mine()).length === 0, 'test guests left behind');
    });
};
