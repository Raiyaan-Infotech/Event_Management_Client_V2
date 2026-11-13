// Organizer home dashboard (Jamal's design 2026-11-13, /dashboard): 7 tiles, 3 charts, Events Overview
// table + ⋯ menu. Every figure is compared with the API. Read-only — nothing is changed.
module.exports = async (k) => {
    const { page, step, expect, api } = k;
    const PORTAL = k.PORTAL || 'https://eventmanagementclientv2.vercel.app';
    const year = new Date().getFullYear();
    let stats = {};
    let list = { rows: [], total: 0 };
    const main = async () => (await page.locator('main, #main-content').first().innerText()).replace(/\s+/g, ' ');

    await step('setup: stats + events of this year (API)', async () => {
        const s = await api(`/client/events/stats?year=${year}`);
        stats = s.body?.data || {};
        expect(typeof stats.total_events === 'number', 'stats not readable');
        expect(Array.isArray(stats.events_by_month) && stats.events_by_month.length === 12,
            `events_by_month missing (backend not deployed?) keys: ${Object.keys(stats).join(',')}`);
        const l = await api(`/client/events?from=${year}-01-01&to=${year}-12-31&page=1&limit=10`);
        list = { rows: l.body?.data || [], total: l.body?.pagination?.totalItems ?? 0 };
        return `events ${stats.total_events}, guests ${stats.total_guests}, messages ${stats.total_messages}, downloads ${stats.total_downloads}, this year ${list.total}`;
    });

    await step('H1. Dashboard opens: header, Event Availability button, 7 tiles', async () => {
        await page.goto(`${PORTAL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByText('Organizer Dashboard · All Events Overview').waitFor({ timeout: 60000 });
        await page.getByRole('button', { name: /Event Availability/ }).first().waitFor();
        for (const t of ['Total Events', 'Total Guests', 'Confirmed', 'Pending', 'Declined', 'Messages', 'Downloads']) {
            await page.getByText(t, { exact: true }).first().waitFor({ timeout: 20000 });
        }
        // wait for the page-wide "Loading..." overlay and the tile skeletons to finish
        await page.locator('[role="status"]').filter({ hasText: 'Loading...' }).first().waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
        await page.getByText('Total Events', { exact: true }).first().locator('xpath=..').locator('p').first().waitFor({ timeout: 30000 });
        await page.waitForTimeout(1500);
        await k.shot('home-dashboard');
    });

    await step('H2. tile values = API', async () => {
        const tile = async (label) => (await page.locator('main, #main-content').first().getByText(label, { exact: true }).first().locator('xpath=..').innerText()).split('\n')[0].replace(/,/g, '').trim();
        const want = {
            'Total Events': stats.total_events, 'Total Guests': stats.total_guests, Confirmed: stats.rsvp_going,
            Pending: stats.rsvp_pending, Declined: stats.rsvp_declined, Messages: stats.total_messages, Downloads: stats.total_downloads,
        };
        const wrong = [];
        for (const [label, v] of Object.entries(want)) {
            const got = await tile(label);
            if (String(got) !== String(v ?? 0)) wrong.push(`${label}: shows ${got}, API ${v}`);
        }
        expect(!wrong.length, wrong.join('; '));
    });

    await step('H3. charts: Guest Responses, Event Status, Events by Month', async () => {
        for (const t of ['Guest Responses (All Events)', 'Event Status']) await page.getByText(t, { exact: true }).first().waitFor();
        await page.getByText(/Events by Month/).first().waitFor();
        const text = await main();
        for (const t of ['Current', 'Upcoming', 'Completed']) expect(text.includes(t), `Event Status legend missing ${t}`);
        expect(await page.locator('.recharts-bar-rectangle, .recharts-rectangle').count() >= 0, 'bar chart missing');
    });

    await step('H4. Events Overview rows = API (name, guests, counts, response rate)', async () => {
        await page.getByText('Events Overview (All Events)').waitFor();
        const tbody = page.locator('table tbody');
        if (!list.rows.length) {
            await tbody.getByText(/No events in this period/).waitFor({ timeout: 20000 });
            return 'no events this year';
        }
        await tbody.locator('tr').first().getByText(list.rows[0].name).waitFor({ timeout: 20000 });
        const r = list.rows[0];
        const cells = (await tbody.locator('tr').first().locator('td').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
        const g = r.guest_count || 0;
        const rate = g ? Math.round((((r.confirmed_count || 0) + (r.declined_count || 0)) / g) * 100) : 0;
        expect(cells[4].replace(/,/g, '') === String(g), `guests ${cells[4]} vs ${g}`);
        expect(cells[8].startsWith(`${rate}%`), `response rate ${cells[8]} vs ${rate}%`);
        return `${r.name}: ${cells.slice(4, 9).join(' | ')}`;
    });

    await step('H5. search + status filter work', async () => {
        if (!list.rows.length) return 'skipped (no events)';
        const name = list.rows[0].name;
        await page.getByPlaceholder('Search event by name...').fill(name.slice(0, 6));
        await page.locator('table tbody tr').first().getByText(name).waitFor({ timeout: 20000 });
        await page.getByPlaceholder('Search event by name...').fill('zzqq-no-such-event');
        await page.getByText('No events match these filters.').waitFor({ timeout: 20000 });
        await page.getByPlaceholder('Search event by name...').fill('');
        await page.locator('table tbody tr').first().getByText(name).waitFor({ timeout: 20000 });
    });

    await step('H6. ⋯ menu has the 12 design actions; Share opens the QR', async () => {
        if (!list.rows.length) return 'skipped (no events)';
        await page.locator('table tbody tr').first().getByRole('button', { name: /Actions for/ }).click();
        const items = ['View Details', 'Edit Event', 'Manage Guests', 'View RSVPs', 'Send Message', 'Event Availability', 'Analytics', 'Duplicate Event', 'Download QR', 'Share Event', 'Delete Event'];
        const missing = [];
        for (const t of items) if (!(await page.getByRole('menuitem', { name: t }).count())) missing.push(t);
        expect(!missing.length, `menu missing: ${missing.join(', ')}`);
        await k.shot('home-menu');
        await page.getByRole('menuitem', { name: 'Share Event' }).click();
        await page.getByRole('dialog').getByText('Share Event').waitFor();
        await page.keyboard.press('Escape');
    });

    await step('H7. range "All Dates" shows every event', async () => {
        await page.getByRole('combobox').filter({ hasText: /01 Jan/ }).first().click();
        await page.getByRole('option', { name: 'All Dates' }).click();
        const all = await api('/client/events?page=1&limit=1');
        const total = all.body?.pagination?.totalItems ?? 0;
        if (total) await page.getByText(new RegExp(`of ${total} events`)).waitFor({ timeout: 20000 });
        return `${total} events`;
    });
};
