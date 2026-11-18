// Per-event plans (Jamal's "Create Event updated v4", 2026-11-19).
// Run with a FRESH account (QA_ENV_FILE pointing at its login): it starts in the zero state, books
// a date on the Free plan, sees the initial state, creates the event from the booking (by API, to
// keep the run short) and sees the "ready to manage" state. The caller deletes the account after.
module.exports = async (k) => {
    const { page, step, expect, api } = k;
    const PORTAL = k.PORTAL;
    let date = process.env.BOOK_DATE || null;
    let booking = null;

    const tile = async (label) => {
        const card = page.locator('div', { has: page.getByText(label, { exact: true }) }).filter({ hasText: /\d/ }).last();
        return (await card.innerText()).replace(label, '').trim();
    };

    await step('P0. Find an open date on the live calendar', async () => {
        if (date) return date;
        const t = new Date(); t.setDate(t.getDate() + 7);
        const from = t.toISOString().slice(0, 10);
        t.setDate(t.getDate() + 60);
        const r = await api(`/client/availability?from=${from}&to=${t.toISOString().slice(0, 10)}`);
        expect(r.status === 200, `availability ${r.status}`);
        date = r.body.data.days.find((d) => ['available', 'low'].includes(d.status))?.date;
        expect(date, 'no open date in the next two months');
        return date;
    });

    await step('P1. Zero state: "No Event Date Booked Yet", tiles at 0, no plan in the top bar', async () => {
        await page.goto(`${PORTAL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByText('No Event Date Booked Yet').waitFor({ timeout: 60000 });
        await page.getByText('Welcome to Event Invite!', { exact: false }).waitFor();
        await page.getByText('Getting Started').waitFor();
        await page.getByText('No activity yet').waitFor();
        expect((await tile('Total Booked Dates')) === '0', `booked = ${await tile('Total Booked Dates')}`);
        const header = await page.locator('header').innerText();
        expect(!/No plan assigned|\bFree\b|Basic|Standard|Premium/.test(header), `top bar shows a plan: ${header.replace(/\s+/g, ' ')}`);
        await k.shot('zero-state');
        return 'zero state ok';
    });

    await step('P2. Create Event without a booking asks to book a date first', async () => {
        await page.goto(`${PORTAL}/dashboard/events/create`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByText('Book your event date first').waitFor({ timeout: 60000 });
        await page.getByRole('link', { name: 'Check Event Availability' }).waitFor();
    });

    await step('P3. Book page: "Choose a Plan for This Event", Free is bookable, no Skip', async () => {
        await page.goto(`${PORTAL}/dashboard/events/book?start=${date}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('heading', { name: 'Choose a Plan for This Event' }).waitFor({ timeout: 60000 });
        expect(!(await page.getByRole('link', { name: /Skip for now/ }).count()), 'Skip still shown');
        const free = page.getByRole('button', { name: /^Book with / });
        expect(await free.count() > 0, 'no free plan button');
        await k.shot('choose-plan');
        return `${await free.first().innerText()}; paid buttons: ${await page.getByRole('button', { name: /^Select .* Plan$/ }).count()}`;
    });

    await step('P4. Book with the Free plan -> "Event Date Booked" -> Create Event Now link', async () => {
        await page.getByRole('button', { name: /^Book with / }).first().click();
        await page.getByText('Event Date Booked', { exact: true }).waitFor({ timeout: 30000 });
        await page.getByText('Slot Reserved').first().waitFor();
        const href = await page.getByRole('link', { name: 'Create Event Now' }).getAttribute('href');
        const m = /booking=(\d+)/.exec(href || '');
        expect(m, `Create link = ${href}`);
        const r = await api(`/client/bookings/${m[1]}`);
        expect(r.status === 200 && r.body.data.status === 'reserved' && r.body.data.payment_status === 'free', `booking ${JSON.stringify(r.body?.data)}`);
        booking = r.body.data;
        await k.shot('date-booked');
        return `booking ${booking.id} ${booking.plan.name} on ${booking.start_date}`;
    });

    await step('P5. Initial state: "Event Date Allotted — Create Your Event Now", 1 booked date, details popup', async () => {
        await page.goto(`${PORTAL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByText('Event Date Allotted — Create Your Event Now').waitFor({ timeout: 60000 });
        await page.getByText('Your event date is reserved!', { exact: false }).waitFor();
        await page.getByText('Your booking slot is secured.').waitFor();
        await page.getByText('Event date booked successfully').waitFor();
        expect((await tile('Total Booked Dates')) === '1', `booked = ${await tile('Total Booked Dates')}`);
        await page.getByRole('button', { name: 'View Booking Details' }).click();
        await page.getByRole('dialog').getByText(booking.plan.name).first().waitFor();
        await k.shot('initial-state');
        await page.keyboard.press('Escape');
    });

    await step('P6. Create Event from the booking: Booking Confirmed strip, dates locked', async () => {
        await page.goto(`${PORTAL}/dashboard/events/create?booking=${booking.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByText('Booking Confirmed').waitFor({ timeout: 60000 });
        await page.getByText('Reserved Event Date').waitFor();
        await page.getByRole('radiogroup', { name: 'Event Category' }).waitFor();
        await k.shot('create-from-booking');
    });

    await step('P7. Save the event with booking_id (API): booking turns used, plan is the booking plan', async () => {
        const o = await api(`/client/event-options?booking_id=${booking.id}`);
        expect(o.status === 200 && o.body.data.plan, `options ${o.status} ${o.body?.data?.reason}`);
        const cat = o.body.data.categories[0]?.id;
        expect(cat, 'no category on the booking plan');
        const wrong = await api('/client/events', { method: 'POST', body: { name: 'QA wrong date', event_category_id: cat, start_date: '2030-01-01', end_date: '2030-01-01', start_time: '10:00', end_time: '12:00', status: 'draft', booking_id: booking.id } });
        expect(wrong.status === 400, `wrong date accepted: ${wrong.status}`);
        const r = await api('/client/events', { method: 'POST', body: { name: 'QA Booking Test', event_category_id: cat, start_date: booking.start_date, end_date: booking.start_date, start_time: '10:00', end_time: '12:00', status: 'draft', booking_id: booking.id } });
        expect(r.status === 201 || r.status === 200, `create ${r.status} ${r.body?.message}`);
        const ev = r.body.data.event ?? r.body.data;
        const b = await api(`/client/bookings/${booking.id}`);
        expect(b.body.data.status === 'used' && b.body.data.event_id === ev.id, `booking after = ${JSON.stringify(b.body.data)}`);
        const again = await api('/client/events', { method: 'POST', body: { name: 'QA again', event_category_id: cat, start_date: booking.start_date, end_date: booking.start_date, start_time: '10:00', end_time: '12:00', status: 'draft', booking_id: booking.id } });
        expect(again.status === 400, `reused booking: ${again.status}`);
        return `event ${ev.id} plan ${ev.subscription_plan_id ?? ev.plan?.id}; wrong date + reuse refused`;
    });

    await step('P8. After state: "Your event is ready to manage!", draft 1', async () => {
        await page.goto(`${PORTAL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByText('Your event is ready to manage!', { exact: false }).waitFor({ timeout: 60000 });
        expect((await tile('Draft Events')) === '1', `draft = ${await tile('Draft Events')}`);
        expect(!(await page.getByText('Pending Setup: Create Your New Event').count()), 'pending card still shown');
        await k.shot('after-state');
    });
};
