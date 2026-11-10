// Media (Gallery) — standard steps on a test FOLDER + one uploaded image (docs/MODULE_TESTING.md).
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const NAME = `${STAMP} Mehndi`;
    const NAME2 = `${NAME} edited`;
    const gallery = async () => (await api(`/client/events/${EVENT}/gallery`)).body?.data || {};
    const folder = async () => ((await gallery()).categories || []).find((c) => (c.name || '').startsWith(NAME));
    const filesIn = async (id) => ((await gallery()).items || []).filter((i) => i.category_id === id);
    const card = (t) => page.locator('div').filter({ hasText: t }).filter({ has: page.getByRole('button', { name: 'Folder actions' }) }).last();
    const folderMenu = async (t, item) => {
        await card(t).getByRole('button', { name: 'Folder actions' }).click();
        await page.getByRole('menuitem', { name: item }).click();
        await page.waitForTimeout(500);
    };

    await step('1. page loads', async () => {
        await k.openTab('gallery', /Create Folder/i);
        await page.getByText('Media Overview').first().waitFor();
        await k.shot('page');
    });
    await step('2. loading state', () => k.loadingCheck('gallery', /Create Folder/i));

    await step('3. error message (save empty folder)', async () => {
        await page.getByRole('button', { name: /Create Folder/i }).first().click();
        await page.getByRole('button', { name: /Save Folder/i }).click();
        await k.toast(/enter a folder name/i);
        await k.shot('error-message');
    });

    await step('4. add folder', async () => {
        await page.getByPlaceholder(/Enter folder name/).fill(NAME);
        await k.saveAndWatch(/Save Folder/i, 'saving');
        await k.toast(/added/i);
        await k.panelClosed();
        expect(!!(await folder()), 'new folder not in the API');
        await card(NAME).waitFor();
        await k.shot('added');
    });

    await step('4b. upload an image into the folder', async () => {
        // A real 400×300 PNG drawn in the page.
        const png = Buffer.from((await page.evaluate(() => {
            const c = document.createElement('canvas'); c.width = 400; c.height = 300;
            const g = c.getContext('2d'); g.fillStyle = '#e91e63'; g.fillRect(0, 0, 400, 300);
            g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText('QA test', 120, 160);
            return c.toDataURL('image/png');
        })).split(',')[1], 'base64');
        await folderMenu(NAME, /Upload Here/);
        await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({ name: 'qa-photo.png', mimeType: 'image/png', buffer: png });
        await page.getByRole('button', { name: /Upload 1 File/i }).click();
        await k.toast(/1 file uploaded/i, 90000);
        await k.panelClosed();
        const f = await folder();
        expect((await filesIn(f.id)).length === 1, 'uploaded image not in the folder (API)');
    });

    // After an upload the app opens that folder — the next steps start there.
    await step('7. view (file Details, inside the folder)', async () => {
        await page.getByRole('button', { name: 'File actions' }).first().waitFor({ timeout: 30000 });
        await page.getByRole('button', { name: 'File actions' }).first().click();
        await page.getByRole('menuitem', { name: /Details/ }).click();
        await page.waitForTimeout(800);
        await k.shot('view');
        // Media's Details is a side panel inside the page (its own design), not a slide-in.
        await page.getByText('File Name').first().waitFor();
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('8. delete the image', async () => {
        await page.getByRole('button', { name: 'File actions' }).first().click();
        await page.getByRole('menuitem', { name: /^Delete$/ }).click();
        await k.confirmDelete();
        await k.toast(/deleted|removed/i);
        await k.panelClosed();
        const f = await folder();
        expect((await filesIn(f.id)).length === 0, 'image still in the API');
    });

    await step('6. edit folder (folder page → Edit Folder)', async () => {
        await page.getByRole('button', { name: /Edit Folder/ }).first().click();
        await page.getByPlaceholder(/Enter folder name/).fill(NAME2);
        await page.getByRole('button', { name: /Save Folder/i }).click();
        await k.toast(/updated/i);
        await k.panelClosed();
        await page.getByRole('heading', { name: NAME2 }).or(page.getByText(NAME2).first()).first().waitFor();
        expect((await folder())?.name === NAME2, 'edit not saved in the API');
    });

    await step('9. delete folder', async () => {
        await page.getByRole('button', { name: /Back to Media Overview/ }).click();
        await page.getByRole('button', { name: /Create Folder/i }).first().waitFor();
        await card(NAME2).waitFor();
        await folderMenu(NAME2, /Delete Folder/);
        await k.confirmDelete();
        await k.toast(/removed|deleted/i);
        await k.panelClosed();
        expect(!(await folder()), 'folder still in the API');
    });

    await step('10. clean up', async () => {
        const f = await folder();
        if (f) {
            for (const i of await filesIn(f.id)) await api(`/client/gallery/${i.id}`, { method: 'DELETE' });
            await api(`/client/gallery/categories/${f.id}`, { method: 'DELETE' });
        }
        expect(!(await folder()), 'test folder left behind');
    });
};
