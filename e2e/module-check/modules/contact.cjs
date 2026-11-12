// Contact Messages (Jamal's 8 screens, 2026-11-11) — the standard steps (docs/MODULE_TESTING.md), adapted:
// "add" = New Message to a participant, "edit" = reply (text + photo), "hide" = resolve / block,
// "delete" = Remove Conversation (the design's slide-in with a reason). Removing keeps the messages
// (no hard delete exists), so the test chat stays on the server as "removed".
const path = require('path');
const fs = require('fs');
const os = require('os');

module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const TEXT = `${STAMP} hello from the event team`;
    const REPLY = `${STAMP} second reply`;
    const PHOTO_REPLY = `${STAMP} photo reply`;
    let who = null;
    let chatId = null;
    const base = `/client/events/${EVENT}/contact-chats`;
    const chat = async () => ((await api(base)).body?.data?.chats || []).find((c) => c.id === chatId) || null;
    const panel = () => page.locator('[data-slot="sheet-content"][data-state="open"]').last();
    const menu = async (item) => {
        await page.getByRole('button', { name: 'Conversation actions' }).click();
        await page.getByRole('menuitem', { name: item }).first().click();
        await page.waitForTimeout(400);
    };

    await step('1. page loads', async () => {
        await k.openTab('contact', /New Message/i);
        await page.getByText('Contact Messages').first().waitFor();
        await page.getByText('Total Inquiries').first().waitFor();
        await k.shot('page');
    });
    await step('2. loading state', () => k.loadingCheck('contact', /New Message/i));

    // Participants' own messages (seeded by Event_Management_Admin_Backend/src/database/seeders/contact-chats-demo.seeder.js).
    await step('2b. inbox from participants (tiles, unread, awaiting, blocked)', async () => {
        const inbox = (await api(base)).body?.data;
        const unread = inbox?.chats.find((c) => c.unread > 0 && c.status === 'open');
        if (!inbox || !unread) {
            k.note('2b. seeded participant messages present', false, 'no participant messages on this event — run contact-chats-demo.seeder.js first');
            return;
        }
        const tile = async (label) => Number((await page.locator('button').filter({ hasText: label }).first().innerText()).match(/\d+/)?.[0]);
        expect(await tile('Total Inquiries') === inbox.stats.total_inquiries, 'Total Inquiries tile differs from the API');
        expect(await tile('Awaiting Reply') === inbox.stats.awaiting, 'Awaiting Reply tile differs from the API');
        expect(await tile('Blocked') === inbox.stats.blocked, 'Blocked tile differs from the API');
        // Opening an unread conversation reads it.
        await page.locator('section button').filter({ hasText: unread.participant.name }).first().click();
        await page.getByText(unread.last_message.slice(0, 30)).first().waitFor();
        await k.shot('inbox-unread-opened');
        await page.waitForTimeout(1500);
        const after = (await api(base)).body.data.chats.find((c) => c.id === unread.id);
        expect(after.unread === 0, 'opening the conversation did not clear its unread count');
        // Awaiting Reply tile → only conversations waiting for an answer.
        await page.locator('button').filter({ hasText: 'Awaiting Reply' }).first().click();
        await page.getByText('Awaiting reply', { exact: true }).first().waitFor();
        await k.shot('inbox-awaiting');
        // Blocked tile → the blocked conversation and its banner.
        const blocked = inbox.chats.find((c) => c.status === 'blocked');
        if (blocked) {
            await page.locator('button').filter({ hasText: 'Blocked' }).first().click();
            await page.locator('section button').filter({ hasText: blocked.participant.name }).first().click();
            await page.getByText(/They cannot send new messages/).first().waitFor();
            await k.shot('inbox-blocked');
        }
        await k.openTab('contact', /New Message/i);
    });

    await step('3. error message (Send stays off until To + Message)', async () => {
        const people = (await api(`${base}/recipients`)).body?.data?.participants || [];
        who = people.find((p) => !p.chat_id) || people[0];
        expect(who, 'event has no app participants to write to');
        await page.getByRole('button', { name: /New Message/i }).first().click();
        expect(await k.isSlideIn(), 'New Message is not a slide-in panel');
        expect(await panel().getByRole('button', { name: /Send Message/i }).isDisabled(), 'Send Message is enabled with nothing filled');
        await k.shot('new-message-empty');
    });

    await step('4. add (New Message)', async () => {
        // Multi-select: Select all → "Send to N", then back to just the test participant.
        const people = (await api(`${base}/recipients`)).body?.data?.participants || [];
        await panel().getByPlaceholder('Type your message...').fill(TEXT);
        if (people.length > 1) {
            await panel().getByRole('checkbox', { name: 'Select all participants' }).click();
            await panel().getByRole('button', { name: `Send to ${people.length}` }).waitFor();
            await k.shot('new-message-multi');
            await panel().getByRole('checkbox', { name: 'Select all participants' }).click();
        }
        await panel().getByRole('checkbox', { name: who.name, exact: true }).click();
        expect(await panel().getByRole('button', { name: /^Send Message$/ }).isEnabled(), 'Send stays off after picking a participant');
        await k.saveAndWatch(/Send Message/i, 'saving');
        await k.toast(/Message sent/i);
        await k.panelClosed();
        await page.getByText(TEXT).first().waitFor();
        const list = (await api(base)).body?.data?.chats || [];
        chatId = list.find((c) => c.participant.client_id === who.client_id)?.id;
        expect(chatId, 'new chat not in the API');
        await k.shot('added');
    });

    await step('6. edit (reply from the box + photo from Reply panel)', async () => {
        const box = page.getByPlaceholder('Reply as Event Contact Person...');
        await box.fill(REPLY);
        await box.press('Enter');
        await page.getByText(REPLY).first().waitFor();
        await menu(/Reply to Participant/);
        await panel().getByText('Reply to Participant').first().waitFor();
        const png = path.join(os.tmpdir(), `${STAMP}.png`);
        fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
        await panel().locator('[data-testid="contact-photo-input"]').setInputFiles(png);
        await panel().locator('textarea').fill(PHOTO_REPLY);
        await k.shot('reply-panel');
        await panel().getByRole('button', { name: /Send Reply/i }).click();
        await k.toast(/Reply sent/i);
        await k.panelClosed();
        await page.getByText(PHOTO_REPLY).first().waitFor();
        const msgs = (await api(`${base}/${chatId}/messages`)).body?.data?.messages || [];
        expect(msgs.some((m) => m.body === PHOTO_REPLY && m.photo), 'photo reply not saved with its photo');
        expect(msgs.some((m) => m.body === REPLY), 'box reply not saved');
        fs.unlinkSync(png);
    });

    // Replying to = a dropdown of the participant's messages; the pick is saved and shown as a quote.
    await step('6b. reply quoting a participant message (Replying to)', async () => {
        const inbox = (await api(base)).body?.data;
        const target = inbox?.chats.find((c) => c.status === 'open' && c.id !== chatId && c.inquiries > 0);
        if (!target) { k.note('6b. a participant conversation to quote', false, 'no open participant conversation — run contact-chats-demo.seeder.js'); return; }
        const theirs = ((await api(`${base}/${target.id}/messages`)).body?.data?.messages || []).filter((m) => m.side === 'participant');
        const older = theirs[0];
        await page.locator('section button').filter({ hasText: target.participant.name }).first().click();
        await page.waitForTimeout(800);
        await menu(/Reply to Participant/);
        await panel().getByRole('combobox', { name: 'Replying to' }).click();
        await page.getByRole('option').filter({ hasText: older.body.slice(0, 25) }).first().click();
        const QUOTE_REPLY = `${STAMP} quoted reply`;
        await panel().locator('textarea').fill(QUOTE_REPLY);
        await k.shot('reply-quote-panel');
        await panel().getByRole('button', { name: /Send Reply/i }).click();
        await k.toast(/Reply sent/i);
        await k.panelClosed();
        await page.getByText(QUOTE_REPLY).first().waitFor();
        await k.shot('reply-quote-bubble');
        const saved = ((await api(`${base}/${target.id}/messages`)).body?.data?.messages || []).find((m) => m.body === QUOTE_REPLY);
        expect(saved?.reply_to?.id === older.id, 'the picked message was not saved as the quote');
        // Back to the test's own conversation for the steps below.
        await page.locator('section button').filter({ hasText: who.name }).first().click();
        await page.getByText(TEXT).first().waitFor();
    });

    await step('7. view (Participant + Contact Person slide-ins)', async () => {
        await menu(/View Participant Details/);
        expect(await k.isSlideIn(), 'Participant Details is not a slide-in');
        await panel().getByText('Inquiry Summary').first().waitFor();
        await k.shot('participant-details');
        await panel().getByRole('button', { name: /^Activity$/ }).click();
        await page.keyboard.press('Escape');
        await k.panelClosed();
        await page.getByRole('button', { name: /^Contact Person$/ }).first().click();
        await panel().getByText('Contact Performance').first().waitFor();
        await k.shot('contact-person');
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('8. hide (Mark as Resolved → Reopen)', async () => {
        await menu(/Mark as Resolved/);
        await panel().getByText('Resolve this conversation?').first().waitFor();
        await k.shot('resolve');
        await panel().getByRole('button', { name: /Mark Resolved/i }).click();
        await k.toast(/marked as resolved/i);
        await k.panelClosed();
        expect((await chat())?.status === 'resolved', 'not resolved in the API');
        await menu(/Reopen Conversation/);
        await panel().getByRole('button', { name: /^Reopen$/ }).click();
        await k.toast(/reopened/i);
        await k.panelClosed();
        expect((await chat())?.status === 'open', 'not reopened in the API');
    });

    await step('8b. block (reason required) → unblock', async () => {
        await menu(/Block Participant/);
        const blockBtn = panel().getByRole('button', { name: /Block Participant/i });
        expect(await blockBtn.isDisabled(), 'Block is enabled without a reason');
        await panel().getByRole('combobox').first().click();
        await page.getByRole('option').first().click();
        await k.shot('block');
        await blockBtn.click();
        await k.toast(/Participant blocked/i);
        await k.panelClosed();
        await page.getByText(/Blocked (until the event ends|permanently)/).first().waitFor();
        expect((await chat())?.status === 'blocked', 'not blocked in the API');
        await menu(/Unblock Participant/);
        await panel().getByRole('button', { name: /^Unblock$/ }).click();
        await k.toast(/unblocked/i);
        await k.panelClosed();
        expect((await chat())?.status === 'open', 'not unblocked in the API');
    });

    await step('9. delete (Remove Conversation)', async () => {
        await menu(/Remove Conversation/);
        await panel().getByText('Remove this conversation?').first().waitFor();
        await panel().locator('textarea').fill(`${STAMP} test clean-up`);
        await k.shot('remove');
        await panel().getByRole('button', { name: /Remove Conversation/i }).click();
        await k.toast(/Conversation removed/i);
        await k.panelClosed();
        expect(!(await chat()), 'removed chat still in the inbox');
        await k.shot('removed');
    });
};
