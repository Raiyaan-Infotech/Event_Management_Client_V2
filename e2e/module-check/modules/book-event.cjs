// Book Event → Select Plan → Review → Payment (Jamal's Create Event Updated v3, 2026-11-18).
// The QA account is on a used-up plan, so this covers the "must choose a plan" path (no Skip).
// It never clicks Pay with valid details: a saved payment is a ledger row the test could not
// remove. The API refusals below create nothing.
module.exports = async (k) => {
    const { page, step, expect, api } = k;
    const PORTAL = k.PORTAL;
    const DATE = process.env.BOOK_DATE || '2026-12-03';
    let plans = null;
    let paid = null;

    await step('B0. /billing/plans returns the plan limits (backend deployed)', async () => {
        const r = await api('/client/billing/plans');
        expect(r.status === 200, `plans ${r.status}`);
        plans = r.body.data;
        expect(plans.plans.length > 0, 'no plans');
        expect('max_events' in plans.plans[0], 'max_events missing - backend not deployed yet?');
        paid = plans.plans.find((p) => !p.is_current && Number(p.price) > 0);
        expect(paid, 'no paid plan to pick');
        return plans.plans.map((p) => `${p.name} ${p.price} ev=${p.max_events}${p.is_current ? ' (current)' : ''}`).join(' | ');
    });

    await step('B1. checkout refuses bad requests and saves nothing', async () => {
        const out = [];
        const tryIt = async (label, body, want) => {
            const r = await api('/client/billing/checkout', { method: 'POST', body });
            expect(r.status === 400, `${label}: expected 400, got ${r.status} ${JSON.stringify(r.body)}`);
            if (want) expect(String(r.body?.message).includes(want), `${label}: message "${r.body?.message}"`);
            out.push(`${label} -> 400`);
        };
        await tryIt('card number sent', { plan_id: paid.id, method: 'card', card_number: '4242424242424242', card_last4: '4242', holder_name: 'QA' }, 'Card details');
        await tryIt('bad UPI ID', { plan_id: paid.id, method: 'upi', upi_id: 'nope' }, 'valid UPI');
        await tryIt('no method', { plan_id: paid.id }, 'payment method');
        if (plans.current_plan_id) await tryIt('current plan', { plan_id: plans.current_plan_id, method: 'wallet', wallet: 'Paytm' }, 'already on this plan');
        await tryIt('unknown plan', { plan_id: 999999, method: 'wallet', wallet: 'Paytm' }, 'not available');
        const free = plans.plans.find((p) => Number(p.price) <= 0 && !p.is_current);
        if (free) await tryIt('free plan', { plan_id: free.id, method: 'wallet', wallet: 'Paytm' }, 'free');
        return out.join(', ');
    });

    await step('B2. Check Availability: Book Event goes to the Select Plan page', async () => {
        await page.goto(`${PORTAL}/dashboard/events/check-availability`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('heading', { name: 'Check Event Availability' }).waitFor({ timeout: 60000 });
        await page.waitForTimeout(2500);
        const book = page.getByRole('link', { name: /Book Event|Choose a Plan to Book/ });
        if (await book.count()) {
            const href = await book.first().getAttribute('href');
            expect(href && href.startsWith('/dashboard/events/book?start='), `Book link = ${href}`);
            await k.shot('availability');
            return `today: "${(await book.first().innerText()).trim()}" -> ${href}`;
        }
        await k.shot('availability');
        return 'today is not bookable (no open slot) - link checked via the page below';
    });

    await step('B3. Select Plan: used-up plan = "Select Subscription Plan", no Skip, booking summary', async () => {
        await page.goto(`${PORTAL}/dashboard/events/book?start=${DATE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('navigation', { name: 'Booking steps' }).waitFor({ timeout: 60000 });
        await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 60000 });
        const h = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
        const skip = await page.getByRole('link', { name: /Skip for now/ }).count();
        await page.getByText('Booking Summary').waitFor();
        await page.getByText(/Current Plan:/).first().waitFor();
        await page.getByRole('button', { name: `Select ${paid.name} Plan` }).waitFor();
        await k.shot('select-plan');
        expect(h === 'Select Subscription Plan' ? skip === 0 : h === 'Upgrade Your Plan?' && skip > 0, `heading "${h}" with ${skip} Skip buttons`);
        return `${h}; Skip buttons: ${skip}`;
    });

    await step('B4. Review: Proceed waits for the terms tick, then opens Payment', async () => {
        await page.getByRole('button', { name: `Select ${paid.name} Plan` }).click();
        await page.getByRole('heading', { name: 'Review Your Plan Selection' }).waitFor({ timeout: 20000 });
        await page.getByText(`Selected Plan: ${paid.name}`).waitFor();
        await page.getByText('Total Payable').waitFor();
        const proceed = page.getByRole('button', { name: 'Proceed to Payment' });
        expect(await proceed.isDisabled(), 'Proceed should wait for the tick');
        await page.getByRole('checkbox').check();
        await k.shot('review');
        await proceed.click();
        await page.getByRole('heading', { name: 'Complete Your Payment' }).waitFor({ timeout: 20000 });
    });

    await step('B5. Payment: bad UPI ID is stopped in the browser (no request); card fields; summary', async () => {
        let calls = 0;
        page.on('request', (r) => { if (r.url().includes('/billing/checkout')) calls++; });
        await page.getByLabel('UPI ID').fill('nope');
        await page.getByRole('button', { name: /^Pay .* & Continue$/ }).click();
        await page.getByText('Enter a valid UPI ID (e.g. name@okaxis).').waitFor({ timeout: 5000 });
        await page.getByText('Order Summary').waitFor();
        await page.getByText('Billing Contact').waitFor();
        await k.shot('payment-upi-error');
        await page.getByRole('tab', { name: 'Credit/Debit Card' }).click();
        await page.getByLabel('Card number').fill('4111111111111111');
        await page.getByText('Visa', { exact: true }).waitFor();
        await page.getByRole('button', { name: /^Pay .* & Continue$/ }).click();
        await page.getByText('Enter the expiry date as MM / YY.').waitFor({ timeout: 5000 });
        await k.shot('payment-card');
        expect(calls === 0, `checkout was called ${calls} times`);
        await page.getByRole('button', { name: 'Back', exact: true }).click();
        await page.getByRole('heading', { name: 'Review Your Plan Selection' }).waitFor();
        return 'no checkout request sent';
    });

    await step('B6. Create Event with ?plan= on a used-up plan: limit card + "payment details saved" note', async () => {
        await page.goto(`${PORTAL}/dashboard/events/create?start=${DATE}&plan=${paid.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByText('Event limit reached').waitFor({ timeout: 60000 });
        await page.getByText('Your payment details for the new plan are saved.', { exact: false }).waitFor();
        await k.shot('create-limit');
    });
};
