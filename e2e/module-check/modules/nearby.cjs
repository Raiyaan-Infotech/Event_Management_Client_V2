// Near By — standard steps + Google suggestions (docs/MODULE_TESTING.md).
// Add = pick Google suggestions (no free form), so "error message" = Save stays disabled with nothing picked.
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const NAME2 = `${STAMP} edited place`;
    let before = new Set();
    let saved = [];
    const places = async () => (await api(`/client/events/${EVENT}/nearby-places`)).body?.data?.places || [];
    const fresh = async () => (await places()).filter((p) => !before.has(p.id));

    await step('1. page loads', async () => {
        before = new Set((await places()).map((p) => p.id));
        await k.openTab('nearby', /Add Nearby Place/i);
        await page.getByText('Total Places').first().waitFor();
        await k.shot('page');
    });
    await step('2. loading state', () => k.loadingCheck('nearby', /Add Nearby Place/i));

    await step('3. nothing picked → Save disabled', async () => {
        await page.getByRole('button', { name: /Add Nearby Place/i }).first().click();
        await page.getByText(/\d+ results|No places found|could not|not set|not found/i).first().waitFor({ timeout: 60000 });
        expect(await page.getByRole('button', { name: /Save Nearby Places/i }).isDisabled(), 'Save is enabled with nothing picked');
        expect(await page.getByText(/\d+ results/).count() > 0, `no Google suggestions: ${await page.getByRole('dialog').innerText().catch(() => '')}`.slice(0, 200));
        await k.shot('suggestions');
    });

    await step('4+5. add 2 places (saving state)', async () => {
        const adds = page.getByRole('button', { name: /^\s*Add\s*$/ });
        expect(await adds.count() >= 2, 'fewer than 2 suggestions to add');
        await adds.nth(0).click();
        await adds.nth(0).click();
        await page.getByText(/Selected Nearby Places \(2\)/).waitFor();
        await k.saveAndWatch(/Save Nearby Places/i, 'saving');
        await k.toast(/nearby places added/i);
        await k.panelClosed();
        saved = await fresh();
        expect(saved.length === 2, `expected 2 saved places, API has ${saved.length}`);
        await page.getByText(saved[0].name).first().waitFor();
        await k.shot('added');
    });

    await step('extra: saved place shows "Added" in suggestions', async () => {
        await page.getByRole('button', { name: /Add Nearby Place/i }).first().click();
        await page.getByText(/\d+ results/).first().waitFor({ timeout: 60000 });
        expect(await page.getByRole('dialog').getByText('Added', { exact: true }).count() >= 2, 'saved places not marked "Added"');
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('6. edit', async () => {
        await k.rowMenu(saved[0].name, /Edit Place/i);
        await page.getByRole('dialog').locator('input').first().fill(NAME2);
        await page.getByRole('button', { name: /Save Changes/i }).click();
        await k.toast(/Nearby place updated/i);
        await k.panelClosed();
        await page.getByText(NAME2).first().waitFor();
    });

    await step('7. view (slide-in panel)', async () => {
        await k.rowMenu(NAME2, /View Details/i);
        await page.getByRole('dialog').getByText('Place Details').first().waitFor();
        await k.shot('view');
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('8. hide', async () => {
        await k.rowMenu(NAME2, /Hide from App/i);
        await k.toast(/Nearby place updated/i);
        await page.locator('tr').filter({ hasText: NAME2 }).getByText('Hidden').first().waitFor();
    });

    await step('9. delete', async () => {
        await k.rowMenu(NAME2, /Delete Place/i);
        await k.confirmDelete(/Delete Place/i);
        await k.toast(/Nearby place deleted/i);
        await k.panelClosed();
        expect(!(await places()).some((p) => p.id === saved[0].id), 'place still in the API');
        await k.shot('deleted');
    });

    await step('10. clean up', async () => {
        for (const p of await fresh()) await api(`/client/nearby-places/${p.id}`, { method: 'DELETE' });
        expect((await fresh()).length === 0, 'test places left behind');
    });
};
