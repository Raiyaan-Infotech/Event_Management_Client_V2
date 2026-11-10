// Social Links — the standard steps (docs/MODULE_TESTING.md). Copy this file for a new module.
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const URL1 = `https://example.com/${STAMP.toLowerCase()}`;
    const URL2 = `${URL1}-edited`;
    const mine = async () => ((await api(`/client/events/${EVENT}/social-links`)).body?.data?.links || []).filter((l) => (l.url || '').startsWith(URL1));

    await step('1. page loads', async () => {
        await k.openTab('social', /Add Social Link/i);
        await page.getByText('Total Links').first().waitFor();
        await k.shot('page');
    });
    await step('2. loading state', () => k.loadingCheck('social', /Add Social Link/i));

    await step('3. error message (save empty)', async () => {
        await page.getByRole('button', { name: /Add Social Link/i }).first().click();
        await page.getByRole('button', { name: /Save Social Link/i }).click();
        await k.toast('Please fill all mandatory fields');
        await k.shot('error-message');
    });

    await step('4+5. add (saving state)', async () => {
        await page.getByRole('button', { name: /Choose a platform/i }).click();
        const tile = page.locator('[data-radix-popper-content-wrapper] button:not([disabled])').first();
        name = (await tile.innerText()).split('\n')[0].trim();
        await tile.click();
        await page.getByPlaceholder(/^https:\/\//).first().fill(URL1);
        await k.saveAndWatch(/Save Social Link/i, 'saving');
        await k.toast(/Social link added/i);
        await k.panelClosed();
        expect((await mine()).length === 1, 'new link not in the API');
        await page.getByText(URL1).first().waitFor();
        await k.shot('added');
    });

    await step('6. edit', async () => {
        await k.rowMenu(URL1, /Edit Link/i);
        const url = page.getByPlaceholder(/https/).last();
        await url.fill(URL2);
        await page.getByRole('button', { name: /Save Social Link/i }).click();
        await k.toast(/Social link updated/i);
        await k.panelClosed();
        await page.getByText(URL2).first().waitFor();
        expect((await mine())[0]?.url === URL2, 'edit not saved in the API');
    });

    await step('7. view (slide-in panel)', async () => {
        await k.rowMenu(URL2, /View Details/i);
        await page.getByRole('dialog').getByText('Social Link Details').first().waitFor();
        await k.shot('view');
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('8. hide', async () => {
        await k.rowMenu(URL2, /Hide from App/i);
        await k.toast(/Social link updated/i);
        await page.locator('tr').filter({ hasText: URL2 }).getByText('Hidden').first().waitFor();
    });

    await step('9. delete', async () => {
        await k.rowMenu(URL2, /Delete Link/i);
        await k.confirmDelete(/Delete Link/i);
        await k.toast(/deleted|removed/i);
        await k.panelClosed();
        expect((await mine()).length === 0, 'link still in the API');
        await k.shot('deleted');
    });

    await step('10. clean up', async () => {
        for (const l of await mine()) await api(`/client/social-links/${l.id}`, { method: 'DELETE' });
        expect((await mine()).length === 0, 'test links left behind');
    });
};
