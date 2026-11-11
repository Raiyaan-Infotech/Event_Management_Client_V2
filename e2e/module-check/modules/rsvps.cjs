// RSVPs — the RSVP actions on a test guest (docs/MODULE_TESTING.md). RSVP rows are guests: the test makes one
// (and a group if the event has none) through the API, works its RSVP, and removes both again.
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const NAME = `${STAMP} Rsvp Guest`;
    const MOBILE = `8${String(Date.now()).slice(-9)}`;
    let guestId = null;
    let madeGroup = null;
    const row = async () => ((await api(`/client/events/${EVENT}/rsvp-board?search=${encodeURIComponent(STAMP)}&limit=50&show_uninvited=1`)).body?.data?.rows || [])
        .find((r) => (r.name || '').startsWith(NAME));
    // A new guest is "Not Invited" until the organizer answers for them — shown by the Status filter.
    const statusFilter = async (label) => {
        await page.getByRole('combobox').filter({ hasText: /^Status:|Not Invited|Confirmed|Pending|Declined/ }).first().click();
        await page.getByRole('option', { name: label }).click();
        await page.waitForTimeout(800);
    };
    const hiddenRow = async () => ((await api(`/client/events/${EVENT}/rsvp-board?tab=hidden&search=${encodeURIComponent(STAMP)}&limit=50`)).body?.data?.rows || [])
        .find((r) => (r.name || '').startsWith(NAME));
    const menu = async (item) => {
        await page.getByRole('button', { name: `Actions for ${NAME}` }).first().click();
        await page.getByRole('menuitem', { name: item }).click();
        await page.waitForTimeout(500);
    };

    await step('0. a test guest to answer for', async () => {
        let groups = (await api('/client/guests/groups/all')).body?.data?.groups || [];
        if (!groups.length) {
            const c = await api('/client/guests/groups', { method: 'POST', body: JSON.stringify({ name: `${STAMP} Friends` }) });
            madeGroup = c.body?.data?.group?.id ?? c.body?.data?.id ?? null;
            groups = [{ id: madeGroup }];
        }
        const g = await api('/client/guests', { method: 'POST', body: JSON.stringify({ event_id: EVENT, first_name: NAME, last_name: null, mobile: MOBILE, dial_code: '+91', group_id: Number(groups[0].id) }) });
        guestId = g.body?.data?.guest?.id ?? g.body?.data?.id ?? null;
        expect(g.status < 300 && guestId, `could not add the test guest (${g.status} ${JSON.stringify(g.body?.message)})`);
        // An organizer answer makes the guest "invited", so it is in the normal list.
        const a = await api(`/client/rsvp-board/${guestId}`, { method: 'PUT', body: JSON.stringify({ response: 'maybe', attending_count: 1 }) });
        expect(a.status < 300, `could not set a first answer (${a.status} ${JSON.stringify(a.body?.message)})`);
    });

    await step('1. page loads', async () => {
        await k.openTab('rsvps', /Send Reminder/i);
        await page.getByText('RSVP Responses').first().waitFor();
        await page.getByPlaceholder(/Search by guest name/).fill(STAMP);
        await page.getByRole('button', { name: `Actions for ${NAME}` }).first().waitFor({ timeout: 30000 });
        await k.shot('page');
    });
    await step('2. loading state', async () => {
        await k.loadingCheck('rsvps', /Send Reminder/i);
        await page.getByPlaceholder(/Search by guest name/).fill(STAMP);
        await page.getByRole('button', { name: `Actions for ${NAME}` }).first().waitFor({ timeout: 30000 });
    });

    await step('3. error message (empty note)', async () => {
        await menu(/Add Note/);
        await page.getByRole('button', { name: /Save Note/ }).click();
        await k.toast(/write the note/i);
        await k.shot('error-message');
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('4. update RSVP: Mark as Confirmed (saving state)', async () => {
        await menu(/Mark as Confirmed/);
        await page.getByRole('dialog').getByText('Update RSVP Status').first().waitFor();
        await k.saveAndWatch(/Mark as Confirmed/, 'saving');
        await k.toast(/Marked as Confirmed/i);
        await k.panelClosed();
        expect((await row())?.rsvp?.state === 'confirmed', `state not confirmed in the API (${(await row())?.rsvp?.state})`);
        await k.shot('confirmed');
    });

    await step('6. edit: Mark as Declined', async () => {
        await menu(/Mark as Declined/);
        await page.getByRole('button', { name: /Mark as Declined/ }).last().click();
        await k.toast(/Marked as Declined/i);
        await k.panelClosed();
        expect((await row())?.rsvp?.state === 'declined', 'state not declined in the API');
    });

    await step('7. view (View Response)', async () => {
        await menu(/View Response/);
        await page.getByRole('dialog').getByText('View RSVP Response').first().waitFor();
        await k.shot('view');
        k.note('7b. view is a slide-in panel', await k.isSlideIn(), 'View Response is not a slide-in panel');
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('8. hide (Hide Response)', async () => {
        await menu(/Hide Response/);
        // The tick starts ticked (design) — only tick it when it is not.
        const box = page.locator('[role="dialog"][data-state="open"] button[role="checkbox"]').last();
        if ((await box.getAttribute('data-state')) !== 'checked') await box.click();
        await page.getByRole('button', { name: /^Hide Response$/ }).last().click();
        await k.toast(/Response hidden/i);
        await k.panelClosed();
        await page.waitForTimeout(1500);
        expect((await hiddenRow())?.rsvp?.hidden === true, 'response not hidden in the API');
    });

    await step('9. delete (Delete Response)', async () => {
        // A hidden response is only in the Hidden tab.
        await page.getByRole('tab', { name: /Hidden/ }).or(page.getByRole('button', { name: /^Hidden/ })).first().click().catch(() => null);
        await page.getByRole('button', { name: `Actions for ${NAME}` }).first().waitFor({ timeout: 30000 });
        await menu(/^Delete$/);
        const dialog = page.getByRole('dialog');
        await k.shot('delete-confirm');
        const popup = (await page.locator('[data-slot="dialog-content"][data-state="open"]').count()) > 0;
        const tick = dialog.getByRole('checkbox');
        if (await tick.count()) await tick.click();
        const btn = dialog.getByRole('button', { name: /Delete Response/ });
        await k.slow({ writes: 2500 });
        await btn.click();
        await page.waitForTimeout(400);
        const spin = await btn.locator('.animate-spin').count().catch(() => 0);
        await k.slow({ writes: 0 });
        k.note('9b. delete = centre popup + spinner', popup && spin > 0, [!popup && 'delete opened a slide-in panel, not the centre popup', !spin && 'Delete button shows no spinner while deleting'].filter(Boolean).join('; '));
        await k.toast(/Response deleted/i);
        await k.panelClosed();
        const r = (await row()) || (await hiddenRow());
        expect(!r || r.rsvp?.state !== 'declined', 'response not cleared in the API');
    });

    await step('10. clean up', async () => {
        if (guestId) await api(`/client/guests/${guestId}`, { method: 'DELETE' });
        if (madeGroup) await api(`/client/guests/groups/${madeGroup}`, { method: 'DELETE' });
        expect(!(await row()) && !(await hiddenRow()), 'test guest left behind');
    });
};
