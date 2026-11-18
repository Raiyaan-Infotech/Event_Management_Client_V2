// 2026-11-18: the event's Invitation page = 4-step Invitations flow (Jamal's Template designs).
// Creates ONE QA guest + group on the event, shares to it (WhatsApp now + Email scheduled), resends,
// removes, then deletes every row it made and the guest/group. The event's design is saved unchanged.
module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const P = k.PORTAL;
    const GUEST = `${STAMP} Invite Guest`;
    const MOBILE = `9${String(Date.now()).slice(-9)}`;
    let event = {};
    let guestId = null;
    let groupId = null;
    const go = async (s) => {
        await page.goto(`${P}/event/${EVENT}?tab=invitation&step=${s}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await (s === 4 ? page.locator('[data-stat="Invitations Sent"]') : page.getByText(`STEP ${s} OF 3`)).waitFor({ timeout: 90000 });
        await page.waitForTimeout(1200);
    };
    const rows = async () => (await api(`/client/invitation-sends?event_id=${EVENT}&limit=100`)).body?.data;

    await step('setup: event + QA group + QA guest on the event (API)', async () => {
        const e = await api(`/client/events/${EVENT}`);
        event = e.body?.data?.event || e.body?.data || {};
        expect(event.name && event.theme_id, `event has no template (${e.status})`);
        const g = await api('/client/guests/groups', { method: 'POST', body: JSON.stringify({ name: `${STAMP} Invite Group` }) });
        groupId = g.body?.data?.group?.id ?? g.body?.data?.id;
        expect(groupId, `group not created (${g.status} ${JSON.stringify(g.body?.message)})`);
        const c = await api('/client/guests', { method: 'POST', body: JSON.stringify({ event_id: EVENT, group_id: groupId, first_name: GUEST, dial_code: '+91', mobile: MOBILE, email: 'qa-invite@example.com' }) });
        guestId = c.body?.data?.guest?.id ?? c.body?.data?.id;
        expect(guestId, `guest not created (${c.status} ${JSON.stringify(c.body?.message)})`);
        return `event "${event.name}" (${event.theme_id}), guest #${guestId}, group #${groupId}`;
    });

    await step('A1. Backend: audience lists the event guests + the QA group', async () => {
        const a = await api(`/client/invitation-sends/audience?event_id=${EVENT}`);
        expect(a.status === 200, `audience ${a.status} ${JSON.stringify(a.body?.message)}`);
        const d = a.body?.data;
        expect(d.guests.some((g) => g.id === guestId), 'QA guest not in audience');
        expect(d.groups.some((g) => g.id === groupId && g.guest_count >= 1), 'QA group not in audience');
        return `${d.guests.length} guests, ${d.groups.length} groups`;
    });

    await step('F1. Sidebar → Invitation opens the flow (designed event → Track step)', async () => {
        await page.goto(`${P}/event/${EVENT}?tab=invitation`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.locator('[data-stat="Invitations Sent"]').waitFor({ timeout: 90000 });
        // The list is its own page: no step bar, no STEP badge.
        expect(await page.getByRole('navigation', { name: 'Invitation steps' }).count() === 0 && await page.getByText(/STEP \d OF/).count() === 0, 'step bar / badge shown on the list');
        expect(await page.locator('[data-invitation-flow]').getByText(/RSVP/i).count() === 0, 'RSVP text on the Track page');
        await page.waitForTimeout(1200);
        await k.shot('flow-track-start');
        // Overview card's Edit → back to step 1
        await page.getByRole('button', { name: 'Edit invitation' }).click();
        await page.getByText('STEP 1 OF 3').waitFor({ timeout: 15000 });
    });

    await step('T1. Step 1 Choose Template: grid, style chips, Selected Template, Customize', async () => {
        await go(1);
        await page.getByText('Browse Invitation Templates').waitFor();
        const tiles = page.locator('button[data-template]');
        expect(await tiles.count() > 0, 'no template tiles');
        const current = page.locator(`button[data-template="${event.theme_id}"]`);
        expect(await current.getAttribute('aria-pressed') === 'true', 'saved template not selected');
        await page.getByText('Selected Template', { exact: true }).waitFor();
        const other = tiles.filter({ hasNot: page.locator(`[data-template="${event.theme_id}"]`) }).first();
        if (await tiles.count() > 1) {
            await page.locator('button[data-template]').nth(await current.evaluate((el) => [...el.parentElement.children].indexOf(el)) === 0 ? 1 : 0).click();
            await page.waitForTimeout(400);
            await current.click(); // back to the saved one, so the event is not changed
        }
        void other;
        await k.shot('flow-step1');
        await page.getByRole('button', { name: 'Customize This Template' }).click();
        await page.getByText('STEP 2 OF 3').waitFor({ timeout: 15000 });
        return `${await tiles.count()} templates`;
    });

    await step('C1. Step 2 Customize: tabs, read-only event details, preview, save checklist', async () => {
        await page.getByText('Edit Template Properties').waitFor();
        await page.getByText('Event Details', { exact: true }).waitFor();
        await page.getByRole('link', { name: 'Edit in Event Info' }).waitFor();
        expect(await page.locator('[data-preview] [data-invitation-card]').count() === 1, 'live preview card missing');
        for (const t of ['Design', 'Media', 'QR & Access', 'Content']) {
            await page.getByRole('tab', { name: t }).click();
            await page.waitForTimeout(250);
        }
        expect(await page.getByText('Save Checklist').count() === 0 && await page.getByText('Selected Design', { exact: true }).count() === 0, 'side cards still shown');
        expect(await page.locator('[data-invitation-flow]').getByText(/RSVP/i).count() === 0, 'RSVP shown in the invitation form');
        await k.shot('flow-step2');
    });

    await step('C2. Save & Continue saves the design + the invitation image, opens step 3', async () => {
        const before = event.invitation_image;
        await page.getByRole('button', { name: 'Save & Continue' }).click();
        await page.getByText('STEP 3 OF 3').waitFor({ timeout: 60000 });
        await page.waitForTimeout(6000);
        const e = await api(`/client/events/${EVENT}`);
        const after = (e.body?.data?.event || e.body?.data || {});
        expect(after.theme_id === event.theme_id, `template changed to ${after.theme_id}`);
        return `invitation image ${after.invitation_image && after.invitation_image !== before ? 'refreshed' : 'NOT refreshed'}`;
    });

    await step('S1. Step 3: pick the QA guest (By Individuals), WhatsApp, Send → saved', async () => {
        await page.getByText('Select Guests', { exact: true }).waitFor();
        await page.getByRole('radio', { name: 'By Individuals' }).click();
        await page.getByPlaceholder('Search by name, mobile or email...').fill(STAMP);
        const row = page.locator(`tr[data-guest="${GUEST}"]`);
        await row.waitFor({ timeout: 20000 });
        await row.getByRole('checkbox').click();
        await page.getByText('1 Guest Selected').first().waitFor();
        await page.getByRole('radio', { name: /WhatsApp/ }).click();
        // Placeholders list: all 19, bride / groom names, each with a copy button.
        await page.getByRole('button', { name: 'Placeholders' }).click();
        const items = page.locator('[data-placeholder]');
        await items.first().waitFor();
        const tokens = await items.evaluateAll((els) => els.map((el) => el.getAttribute('data-placeholder')));
        expect(tokens.length === 19 && tokens.includes('{bride_name}') && tokens.includes('{groom_name}') && !tokens.some((x) => x.includes('host_')), `placeholders ${tokens.join(' ')}`);
        expect(await page.getByRole('button', { name: /^Copy \{/ }).count() === 19, 'copy buttons missing');
        await k.shot('flow-step3-placeholders');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Preview Message' }).click();
        const dlg = page.locator('[data-slot="dialog-content"][data-state="open"]').last();
        await dlg.waitFor();
        const text = await dlg.textContent();
        expect(text.includes(event.name), 'preview does not name the event');
        expect(!/\{[a-z_]+\}/.test(text), `preview has an unfilled placeholder: ${text.match(/\{[a-z_]+\}/)?.[0]}`);
        await k.shot('flow-step3-preview');
        await page.keyboard.press('Escape');
        await page.locator('[data-slot="dialog-overlay"]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => null);
        await k.shot('flow-step3');
        await page.getByRole('button', { name: 'Send Invitation' }).click();
        await page.getByText('Invitation Sent Successfully!').waitFor({ timeout: 30000 });
        await k.shot('flow-sent');
        const d = await rows();
        const mine = (d?.rows || []).filter((r) => r.guest?.id === guestId);
        expect(mine.length === 1 && mine[0].status === 'recorded' && mine[0].channel === 'whatsapp', `rows ${JSON.stringify(mine.map((r) => [r.status, r.channel]))}`);
        const g = await api(`/client/guests/${guestId}`);
        const saved = g.body?.data?.guest || g.body?.data || {};
        expect(!!saved.invited_at, 'guest not stamped invited');
    });

    await step('S2. Send Another → Email, scheduled tomorrow → "Invitation Scheduled!"', async () => {
        await page.getByRole('button', { name: 'Send Another Invitation' }).click();
        await page.getByRole('radio', { name: 'By Individuals' }).click();
        await page.getByPlaceholder('Search by name, mobile or email...').fill(STAMP);
        await page.locator(`tr[data-guest="${GUEST}"]`).getByRole('checkbox').click();
        await page.getByRole('radio', { name: /Email/ }).click();
        await page.getByLabel('Email subject').waitFor();
        await page.getByLabel('Schedule for later').click();
        const t = new Date(Date.now() + 86400000);
        await page.getByLabel('Schedule date').fill(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`);
        await page.getByRole('button', { name: 'Schedule Invitation' }).click();
        await page.getByText('Invitation Scheduled!').waitFor({ timeout: 30000 });
        const d = await rows();
        const mine = (d?.rows || []).filter((r) => r.guest?.id === guestId && r.channel === 'email');
        expect(mine.length === 1 && mine[0].status === 'scheduled', `email rows ${JSON.stringify(mine.map((r) => r.status))}`);
    });

    await step('R1. Step 4: cards + table show the QA rows, no RSVP; filter by Email', async () => {
        // "Return to Dashboard" = the invitation list (Track step), not the portal dashboard.
        await page.getByRole('button', { name: 'Return to Dashboard' }).click();
        await page.locator('[data-stat="Invitations Sent"]').waitFor({ timeout: 15000 });
        expect(page.url().includes('tab=invitation'), `went to ${page.url()}`);
        await page.locator(`tr[data-row="${GUEST}"]`).first().waitFor({ timeout: 30000 });
        expect(await page.locator(`tr[data-row="${GUEST}"]`).count() === 2, 'expected 2 rows for the QA guest');
        for (const c of ['Invitations Sent', 'Delivered', 'Joined in App', 'Scheduled']) await page.locator(`[data-stat="${c}"]`).waitFor();
        expect(await page.locator('[data-invitation-flow]').getByText(/RSVP/i).count() === 0, 'RSVP shown on Track');
        await k.shot('flow-step4');
        // Live can take a few seconds per filter change (global loader) — wait for the count to settle.
        const settle = async (n) => {
            for (let i = 0; i < 40; i++) {
                if (await page.locator(`tr[data-row="${GUEST}"]`).count() === n && !(await page.getByText('Loading...').count())) return true;
                await page.waitForTimeout(500);
            }
            return false;
        };
        await page.getByRole('combobox', { name: 'Channel' }).click();
        await page.getByRole('option', { name: 'Email' }).click();
        expect(await settle(1), 'Email filter did not narrow to 1 row');
        await page.getByRole('combobox', { name: 'Channel' }).click();
        await page.getByRole('option', { name: 'Channel: All' }).click();
        expect(await settle(2), 'Channel: All did not bring back 2 rows');
    });

    await step('R2. Row actions: Resend adds a row; Remove (centre popup) removes one', async () => {
        const row = page.locator(`tr[data-row="${GUEST}"]`).filter({ hasText: 'WhatsApp' }).first();
        await row.getByRole('button', { name: /Actions for/ }).click();
        await page.getByRole('menuitem', { name: 'Resend Invitation' }).click();
        await k.toast('Invitation sent again.');
        await page.waitForTimeout(1500);
        let mine = ((await rows())?.rows || []).filter((r) => r.guest?.id === guestId);
        expect(mine.length === 3, `after resend ${mine.length} rows`);
        await page.locator(`tr[data-row="${GUEST}"]`).first().getByRole('button', { name: /Actions for/ }).click();
        await page.getByRole('menuitem', { name: 'Remove Recipient' }).click();
        const dlg = page.locator('[data-slot="dialog-content"][data-state="open"]').last();
        await dlg.getByText('Remove Recipient').waitFor();
        await k.shot('flow-remove-popup');
        await dlg.getByRole('button', { name: 'Remove' }).click();
        await k.toast('Recipient removed.');
        await page.waitForTimeout(1500);
        mine = ((await rows())?.rows || []).filter((r) => r.guest?.id === guestId);
        expect(mine.length === 2, `after remove ${mine.length} rows`);
    });

    await step('B1. Send Invitation from Guests / Share popup (bulk invite) also shows on Track', async () => {
        const before = ((await rows())?.rows || []).filter((r) => r.guest?.id === guestId).length;
        const b = await api('/client/guests/bulk', { method: 'POST', body: JSON.stringify({ guest_ids: [guestId], action: 'invite', value: { channels: ['whatsapp', 'email', 'in_app'], message: `${STAMP} from Guests` } }) });
        expect(b.status === 200, `bulk invite ${b.status} ${JSON.stringify(b.body?.message)}`);
        const mine = ((await rows())?.rows || []).filter((r) => r.guest?.id === guestId);
        expect(mine.length === before + 2, `expected +2 rows (WhatsApp + Email, not In-App), got ${mine.length - before}`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-stat="Invitations Sent"]').waitFor({ timeout: 90000 });
        await page.locator(`tr[data-row="${GUEST}"]`).nth(before + 1).waitFor({ timeout: 30000 });
        await page.getByRole('button', { name: 'Export' }).waitFor();
        await k.shot('flow-track-after-guests-invite');
        return `${before} → ${mine.length} rows`;
    });

    await step('clean up: remove the QA rows, guest and group', async () => {
        const mine = ((await rows())?.rows || []).filter((r) => r.guest?.id === guestId);
        for (const r of mine) await api(`/client/invitation-sends/${r.id}`, { method: 'DELETE' });
        if (guestId) await api(`/client/guests/${guestId}`, { method: 'DELETE' });
        if (groupId) await api(`/client/guests/groups/${groupId}`, { method: 'DELETE' });
        const left = ((await rows())?.rows || []).filter((r) => r.guest?.id === guestId).length;
        expect(left === 0, `${left} QA rows left`);
        return `${mine.length} rows, guest, group removed`;
    });
};
