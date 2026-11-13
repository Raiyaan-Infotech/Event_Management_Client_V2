// Check Event Availability calendar (Jamal's design Organizer\02_1 / 02_2, 2026-11-13).
// Needs a live config for Dec 2026 (1–15 Dec, 3/day, 10 Dec fully booked, 11 Dec disabled) — created
// and removed around this run by the super admin. Read-only for the client: Book Event only opens the form.
module.exports = async (k) => {
    const { page, step, expect, api } = k;
    const PORTAL = k.PORTAL || 'https://eventmanagementclientv2.vercel.app';
    let days = [];
    const cell = (n) => page.locator('div.grid.grid-cols-7 > button').filter({ has: page.locator(`span:text-is("${n}")`) }).first();
    const goDecember = async () => {
        await page.goto(`${PORTAL}/dashboard/events/check-availability`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('heading', { name: 'Check Event Availability' }).waitFor({ timeout: 60000 });
        for (let i = 0; i < 12 && !(await page.getByText('December 2026').count()); i++) {
            await page.getByRole('button', { name: 'Next month' }).click();
            await page.waitForTimeout(300);
        }
        await page.getByText('December 2026').waitFor();
        await cell(1).waitFor({ timeout: 30000 });
    };

    await step('setup: calendar API (Dec 2026)', async () => {
        const r = await api('/client/availability?from=2026-12-01&to=2026-12-31');
        days = r.body?.data?.days || [];
        const d1 = days.find((d) => d.date === '2026-12-01');
        expect(d1 && d1.status !== 'not_configured', 'Dec 2026 is not configured — temp config missing or backend not deployed');
        expect(Array.isArray(d1.my_events), 'my_events missing (backend not deployed?)');
        return `1 Dec: ${d1.status} max ${d1.daily_max} booked ${d1.booked} bal ${d1.balance}`;
    });

    await step('C1. dashboard Event Availability button opens the calendar', async () => {
        await page.goto(`${PORTAL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('link', { name: /Event Availability/ }).first().click();
        await page.waitForURL(/check-availability/, { timeout: 30000 });
    });

    await step('C2. December: configured days show C/B; 10 Dec Fully Booked; 11 Dec Disabled; 16+ hidden', async () => {
        await goDecember();
        await k.shot('calendar-december');
        const d1 = days.find((d) => d.date === '2026-12-01');
        await cell(1).getByText(`C: ${d1.booked}`).waitFor();
        await cell(1).getByText(`B: ${d1.balance}`).waitFor();
        await cell(10).getByText('Fully Booked').waitFor();
        await cell(11).getByText('Disabled').waitFor();
        expect(!(await cell(20).count()), '20 Dec (not configured) is shown — should be hidden');
    });

    await step('C3. Single Date: pick 3 Dec → card + Book Event → form with the date filled', async () => {
        await cell(3).click();
        await page.getByText('03 Dec 2026 (Thu)').waitFor();
        await page.getByText('Available', { exact: true }).last().waitFor();
        await k.shot('single-selected');
        await page.getByRole('link', { name: 'Book Event' }).click();
        await page.waitForURL(/events\/create\?start=2026-12-03/, { timeout: 30000 });
        return page.url().split('/dashboard')[1];
    });

    await step('C4. Fully booked day: Date Not Available + message', async () => {
        await goDecember();
        await cell(10).click();
        await page.getByRole('button', { name: 'Date Not Available' }).waitFor();
        await page.getByText(/10 Dec 2026 is fully booked/).waitFor();
        await k.shot('full-selected');
    });

    await step('C5. Multiple Dates: 2–5 Dec → range card → Book Event carries start + end', async () => {
        await page.getByRole('button', { name: 'Multiple Dates' }).click();
        await cell(2).click();
        await page.getByRole('button', { name: 'Select Last Date' }).waitFor();
        await cell(5).click();
        await page.getByText('02 Dec 2026 – 05 Dec 2026').waitFor();
        await k.shot('range-selected');
        await page.getByRole('link', { name: 'Book Event' }).click();
        await page.waitForURL(/start=2026-12-02&end=2026-12-05/, { timeout: 30000 });
    });

    await step('C6. range crossing a full day (8–12 Dec) is refused', async () => {
        await goDecember();
        await page.getByRole('button', { name: 'Multiple Dates' }).click();
        await cell(8).click();
        await cell(12).click();
        await page.getByRole('button', { name: 'Date Not Available' }).waitFor({ timeout: 20000 });
        await page.getByText(/10 Dec 2026 is fully booked/).waitFor();
    });
};
