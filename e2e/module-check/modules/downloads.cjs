// Downloads — standard steps + file upload / type detection (docs/MODULE_TESTING.md).
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const TITLE = `${STAMP} Brochure`;
    const TITLE2 = `${TITLE} edited`;
    const mine = async () => ((await api(`/client/events/${EVENT}/downloads`)).body?.data?.downloads || []).filter((d) => d.title.startsWith(TITLE));
    // A tiny real PDF.
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

    await step('1. page loads', async () => {
        await k.openTab('downloads', /Add Download/i);
        await page.getByText('Total Files').first().waitFor();
        await k.shot('page');
    });
    await step('2. loading state', () => k.loadingCheck('downloads', /Add Download/i));

    await step('3. error message (save empty)', async () => {
        await page.getByRole('button', { name: /Add Download/i }).first().click();
        await page.getByRole('button', { name: /Save Download/i }).click();
        await k.toast('Please fill all mandatory fields');
        await k.shot('error-message');
    });

    await step('4. upload file (type detected)', async () => {
        await page.locator('input[type="file"]').setInputFiles({ name: 'qa-brochure.pdf', mimeType: 'application/pdf', buffer: pdf });
        await page.getByText('qa-brochure.pdf').first().waitFor({ timeout: 60000 });
        const type = await page.locator('input[readonly]').first().inputValue();
        expect(/PDF/.test(type), `file type not detected (${type})`);
    });

    await step('4+5. add (saving state)', async () => {
        await page.getByPlaceholder(/Wedding Invitation PDF/i).fill(TITLE);
        await page.getByRole('dialog').getByRole('button', { name: /^Invitation/ }).first().click();
        await k.saveAndWatch(/Save Download/i, 'saving');
        await k.toast(/Download added/i);
        await k.panelClosed();
        expect((await mine()).length === 1, 'new download not in the API');
        await page.getByText(TITLE).first().waitFor();
        await k.shot('added');
    });

    await step('6. edit', async () => {
        await k.rowMenu(TITLE, /Edit Download/i);
        await page.getByPlaceholder(/Wedding Invitation PDF/i).fill(TITLE2);
        await page.getByRole('button', { name: /Save Download/i }).click();
        await k.toast(/Download updated/i);
        await k.panelClosed();
        await page.getByText(TITLE2).first().waitFor();
        expect((await mine())[0]?.title === TITLE2, 'edit not saved in the API');
    });

    await step('7. view (slide-in panel)', async () => {
        await k.rowMenu(TITLE2, /View Details/i);
        await page.getByRole('dialog').getByText('Download Details').first().waitFor();
        await k.shot('view');
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('8. hide', async () => {
        await k.rowMenu(TITLE2, /Hide from App/i);
        await k.toast(/Download updated/i);
        await page.locator('tr').filter({ hasText: TITLE2 }).getByText('Hidden').first().waitFor();
    });

    await step('9. delete', async () => {
        await k.rowMenu(TITLE2, /Delete Download/i);
        await k.confirmDelete(/Delete Download/i);
        await k.toast(/Download deleted/i);
        await k.panelClosed();
        expect((await mine()).length === 0, 'download still in the API');
        await k.shot('deleted');
    });

    await step('10. clean up', async () => {
        for (const d of await mine()) await api(`/client/downloads/${d.id}`, { method: 'DELETE' });
        expect((await mine()).length === 0, 'test downloads left behind');
    });
};
