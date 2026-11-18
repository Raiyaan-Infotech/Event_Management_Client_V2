// Book Event on a FREE plan with events left: "Upgrade Your Plan?" + Skip (Jamal, 2026-11-18).
// Run with a fresh free account (QA_ENV_FILE pointing at its login). Creates no event.
module.exports = async (k) => {
    const { page, step, expect, api } = k;
    const PORTAL = k.PORTAL;
    const DATE = process.env.BOOK_DATE || '2026-12-03';

    await step('K1. The account is on a free plan with events left', async () => {
        const r = await api('/client/billing/plans');
        expect(r.status === 200, `plans ${r.status}`);
        const cur = r.body.data.plans.find((p) => p.is_current);
        expect(cur && Number(cur.price) <= 0, `current plan = ${cur?.name} ${cur?.price}`);
        const o = await api('/client/event-options');
        const used = o.body.data.events_used; const max = o.body.data.plan?.max_events;
        expect(max == null || used < max, `events ${used} of ${max}`);
        return `${cur.name}, events ${used} of ${max ?? 'unlimited'}`;
    });

    await step('K2. Check Availability today: button is "Book Event" (not the limit one)', async () => {
        await page.goto(`${PORTAL}/dashboard/events/check-availability`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('heading', { name: 'Check Event Availability' }).waitFor({ timeout: 60000 });
        await page.waitForTimeout(2500);
        expect(!(await page.getByText('Event limit reached.', { exact: false }).count()), 'limit banner shown');
        const book = page.getByRole('link', { name: 'Book Event' });
        await k.shot('availability');
        return (await book.count()) ? `Book Event -> ${await book.first().getAttribute('href')}` : 'today not bookable (no open slot)';
    });

    await step('K3. Book page = "Upgrade Your Plan?" with Skip buttons and the plans', async () => {
        await page.goto(`${PORTAL}/dashboard/events/book?start=${DATE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('heading', { name: 'Upgrade Your Plan?' }).waitFor({ timeout: 60000 });
        const skips = page.getByRole('link', { name: /Skip for now/ });
        expect((await skips.count()) === 2, `${await skips.count()} Skip buttons`);
        const href = await skips.first().getAttribute('href');
        expect(href === `/dashboard/events/create?start=${DATE}`, `Skip -> ${href}`);
        await page.getByRole('link', { name: /^Continue with / }).waitFor();
        expect(await page.getByRole('button', { name: /^Select .* Plan$/ }).count() > 0, 'no paid plan buttons');
        await k.shot('upgrade-offer');
        return `${await skips.first().innerText()} -> ${href}`;
    });

    await step('K4. Skip -> Create Event step 1: Booking Confirmed strip + category cards', async () => {
        await page.getByRole('link', { name: /Skip for now/ }).first().click();
        await page.waitForURL(/\/dashboard\/events\/create/, { timeout: 30000 });
        await page.getByText('Booking Confirmed').waitFor({ timeout: 60000 });
        await page.getByText('Reserved Event Date').waitFor();
        await page.getByRole('radiogroup', { name: 'Event Category' }).waitFor();
        const cards = await page.getByRole('radio').count();
        expect(cards > 0, 'no category cards');
        await page.getByRole('radio').first().click();
        expect((await page.getByRole('radio').first().getAttribute('aria-checked')) === 'true', 'card not selected');
        await k.shot('create-category');
        return `${cards} category cards`;
    });
};
