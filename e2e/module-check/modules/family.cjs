// Family — standard steps (docs/MODULE_TESTING.md). Rows have Edit + Delete buttons; "hide" is the form's
// Visibility = Hide from App; there is no separate View (the row shows everything).
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const NAME = `${STAMP} Uncle`;
    const NAME2 = `${NAME} edited`;
    const mine = async () => ((await api(`/client/events/${EVENT}/family-members`)).body?.data?.items || []).filter((m) => m.full_name.startsWith(NAME));
    const row = (t) => page.locator('li').filter({ hasText: t }).filter({ has: page.getByRole('button', { name: /Edit/ }) }).last();

    await step('1. page loads', async () => {
        await k.openTab('family', /Add Family Member/i);
        await page.getByText('Family Overview').first().waitFor();
        await k.shot('page');
    });
    await step('2. loading state', () => k.loadingCheck('family', /Add Family Member/i));

    await step('3. error message (save empty)', async () => {
        await page.getByRole('button', { name: /Add Family Member/i }).first().click();
        await page.getByRole('button', { name: /Save Family Member/i }).click();
        await k.toast(/fill all mandatory fields/i);
        await k.shot('error-message');
    });

    await step('4. add', async () => {
        await page.getByPlaceholder('Enter full name').fill(NAME);
        await page.getByRole('dialog').getByRole('combobox').nth(1).click();
        await page.getByRole('option').first().click();
        await k.saveAndWatch(/Save Family Member/i, 'saving');
        await k.toast(/Family member added/i);
        await k.panelClosed();
        expect((await mine()).length === 1, 'new member not in the API');
        await row(NAME).waitFor();
        await k.shot('added');
    });

    await step('6. edit', async () => {
        await row(NAME).getByRole('button', { name: /Edit/ }).click();
        await page.getByPlaceholder('Enter full name').fill(NAME2);
        await page.getByRole('button', { name: /Update Family Member/i }).click();
        await k.toast(/Family member updated/i);
        await k.panelClosed();
        await row(NAME2).waitFor();
        expect((await mine())[0]?.full_name === NAME2, 'edit not saved in the API');
    });

    await step('7. view — n/a (the row shows the member)', async () => {});

    await step('8. hide (Edit → Hide from App)', async () => {
        await row(NAME2).getByRole('button', { name: /Edit/ }).click();
        await page.getByRole('dialog').getByText('Hide from App').click();
        await page.getByRole('button', { name: /Update Family Member/i }).click();
        await k.toast(/Family member updated/i);
        await k.panelClosed();
        await row(NAME2).getByText('Hidden').first().waitFor();
        expect((await mine())[0]?.is_visible === false, 'hide not saved in the API');
    });

    await step('9. delete', async () => {
        await row(NAME2).getByRole('button', { name: /Delete/ }).click();
        await k.confirmDelete();
        await k.toast(/deleted/i);
        await k.panelClosed();
        expect((await mine()).length === 0, 'member still in the API');
    });

    await step('10. clean up', async () => {
        for (const m of await mine()) await api(`/client/family-members/${m.id}`, { method: 'DELETE' });
        expect((await mine()).length === 0, 'test members left behind');
    });
};
