// Wed Wishes — the chat flow on a sample conversation (docs/MODULE_TESTING.md). "Add" = an organizer reply;
// replies have Hide / Delete (no edit). Also opens Participant Details and the Settings page.
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const TEXT = `${STAMP} thank you for your wishes!`;
    const PERSON = 'Aditi Sharma';
    const replies = async () => ((await api(`/client/events/${EVENT}/wishes`)).body?.data?.wishes || [])
        .flatMap((w) => w.replies || []).filter((r) => (r.message || '').startsWith(STAMP));
    const bubble = () => page.locator('div.group').filter({ hasText: TEXT }).last();

    await step('1. page loads (tiles + conversations)', async () => {
        await k.openTab('wishes', /Post Wish/i);
        await page.getByText('Total Wishes').first().waitFor({ timeout: 60000 });
        await page.getByText(/Conversations \(\d+\)/).first().waitFor({ timeout: 60000 });
        await k.shot('page');
    });
    await step('2. loading state', async () => {
        await k.slow({ reads: 2500 });
        await page.reload({ waitUntil: 'domcontentloaded' });
        const seen = await page.getByText('Loading...', { exact: true }).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
        if (seen) await k.shot('loading');
        await k.slow({ reads: 0 });
        await page.getByText(/Conversations \(\d+\)/).first().waitFor({ timeout: 60000 });
        expect(seen, 'no "Loading..." loader while the page data was loading');
    });

    await step('3. empty message → Send disabled', async () => {
        await page.locator('section').first().getByText(PERSON).first().click();
        await page.getByRole('button', { name: 'Send' }).waitFor();
        expect(await page.getByRole('button', { name: 'Send' }).isDisabled(), 'Send is enabled with an empty message');
    });

    await step('4. add (organizer reply) + saving state', async () => {
        await page.locator('textarea').last().fill(TEXT);
        await k.slow({ writes: 4000 });
        await page.getByRole('button', { name: 'Send' }).click();
        const saving = await page.getByText('Saving...', { exact: true }).first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
        const sendBusy = await page.getByRole('button', { name: 'Send' }).isDisabled();
        if (saving) await k.shot('saving');
        await k.slow({ writes: 0 });
        k.note('5. saving state (loader + Send disabled)', saving && sendBusy, [!saving && 'no "Saving..." loader', !sendBusy && 'Send not disabled while sending'].filter(Boolean).join('; '));
        await bubble().waitFor({ timeout: 30000 });
        expect((await replies()).length === 1, 'reply not in the API');
        await k.shot('added');
    });

    await step('6. edit — n/a (replies have Hide / Delete only)', async () => {});

    await step('7. view (Participant Details)', async () => {
        await page.getByRole('button', { name: 'More' }).first().click();
        await page.getByRole('menuitem', { name: /Participant Details/ }).click();
        await page.getByRole('dialog').first().waitFor();
        await page.waitForTimeout(800);
        await k.shot('view');
        k.note('7b. details is a slide-in panel', await k.isSlideIn(), 'Participant Details is not a slide-in panel');
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('8. hide the reply', async () => {
        await bubble().hover();
        await bubble().getByRole('button', { name: 'Reply actions' }).click();
        await page.getByRole('menuitem', { name: /Hide Reply/ }).click();
        await k.toast(/Reply hidden/i);
        await bubble().getByText('Hidden').first().waitFor();
    });

    await step('9. delete the reply', async () => {
        await bubble().hover();
        await bubble().getByRole('button', { name: 'Reply actions' }).click();
        await page.getByRole('menuitem', { name: /Delete Reply/ }).click();
        await k.confirmDelete();
        await k.panelClosed();
        await page.waitForTimeout(1500);
        expect((await replies()).length === 0, 'reply still in the API');
    });

    await step('extra: Settings page opens and returns', async () => {
        await page.getByRole('button', { name: /Wishes Settings/ }).first().click();
        await page.getByText(/Wish Visibility|Participant Display/).first().waitFor({ timeout: 30000 });
        await k.shot('settings');
        await page.getByRole('button', { name: /Back to Wishes/ }).click();
        await page.getByText(/Conversations \(\d+\)/).first().waitFor({ timeout: 30000 });
    });

    await step('10. clean up', async () => {
        for (const r of await replies()) await api(`/client/wish-comments/${r.id}`, { method: 'DELETE' });
        expect((await replies()).length === 0, 'test replies left behind');
    });
};
