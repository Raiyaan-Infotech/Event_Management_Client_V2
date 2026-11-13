// Check Event Availability v2 — Single / Multi Date Event + Contact Support (Jamal's designs 2026-11-13).
// Needs a live temp config: 1–15 Dec 2026, 3/day, 10 Dec fully booked, 11 Dec disabled.
// PHASE=request  → multi-date 9–12 Dec → Contact Support (call back) → ticket; then single 10 Dec → email.
// PHASE=approved → after the super admin approved the call-back ticket: 9–12 Dec now continues.
// Ticket numbers are written to TICKETS_FILE for the admin step.
const fs = require('fs');
module.exports = async (k) => {
    const { page, step, expect } = k;
    const PORTAL = k.PORTAL || 'https://eventmanagementclientv2.vercel.app';
    const PHASE = process.env.PHASE || 'request';
    const TICKETS = process.env.TICKETS_FILE;
    const cell = (n) => page.locator('div.grid.grid-cols-7 > button').filter({ has: page.locator(`span:text-is("${n}")`) }).first();
    const goDecember = async () => {
        await page.goto(`${PORTAL}/dashboard/events/check-availability`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByRole('heading', { name: 'Check Event Availability' }).waitFor({ timeout: 60000 });
        for (let i = 0; i < 12 && !(await page.getByText('December 2026').count()); i++) {
            await page.getByRole('button', { name: 'Next month' }).click();
            await page.waitForTimeout(300);
        }
        await cell(1).waitFor({ timeout: 30000 });
    };
    const pickRange = async (a, b) => {
        await page.getByRole('button', { name: /Multi Date Event/ }).click();
        await cell(a).click();
        await cell(b).click();
        await page.getByText('Date-wise Availability').waitFor({ timeout: 20000 });
        await page.waitForTimeout(1500);
    };

    if (PHASE === 'request') {
        await step('S1. Multi Date Event 9–12 Dec → Partially Available, Continue disabled, Contact Support', async () => {
            await goDecember();
            await pickRange(9, 12);
            await page.getByText('Partially Available').waitFor({ timeout: 20000 });
            await page.getByText('One or more selected dates are not available.', { exact: false }).waitFor();
            expect(await page.getByRole('button', { name: /Continue with 4 Dates/ }).isDisabled(), 'Continue should be disabled');
            await k.shot('multi-partial');
        });

        await step('S2. Contact Support → Request a Call Back (prefilled) → submit → ticket', async () => {
            await page.getByRole('button', { name: 'Contact Support' }).click();
            await page.getByText('Contact Support Team').waitFor();
            await page.getByText('10 Dec 2026 — Fully Booked').first().waitFor();
            await k.shot('support-call');
            const mobile = page.locator('input').filter({ has: page.locator('xpath=self::*') }).nth(0);
            void mobile;
            const mob = page.getByText('Mobile Number').locator('xpath=../..').locator('input');
            if (!(await mob.inputValue())) await mob.fill('+91 90000 00000');
            const msg = page.locator('textarea').first();
            await msg.fill(`QA TEST — please ignore. ${await msg.inputValue()}`.slice(0, 500));
            await page.getByRole('button', { name: 'Submit Call Request' }).click();
            await page.getByText('Support Request Submitted').waitFor({ timeout: 30000 });
            const t = (await page.getByText(/Ticket ID:/).innerText()).replace(/.*Ticket ID:\s*/, '').trim();
            fs.writeFileSync(TICKETS, JSON.stringify({ call: t }));
            await k.shot('support-submitted');
            return t;
        });

        await step('S3. Single Date Event 10 Dec (full) → Contact Support → Email Support → ticket', async () => {
            await goDecember();
            await page.getByRole('button', { name: /Single Date Event/ }).click();
            await cell(10).click();
            await page.getByRole('button', { name: 'Date Not Available' }).waitFor({ timeout: 20000 });
            await page.getByRole('button', { name: 'Contact Support' }).click();
            await page.getByRole('button', { name: 'Email Support', exact: true }).click();
            await page.getByText('Send your request to our Support Team.').waitFor();
            const msg = page.locator('textarea').first();
            await msg.fill(`QA TEST — please ignore. ${await msg.inputValue()}`.slice(0, 500));
            await k.shot('support-email');
            await page.getByRole('button', { name: 'Send Email Request' }).click();
            await page.getByText('Support Request Submitted').waitFor({ timeout: 30000 });
            const t = (await page.getByText(/Ticket ID:/).innerText()).replace(/.*Ticket ID:\s*/, '').trim();
            const prev = JSON.parse(fs.readFileSync(TICKETS, 'utf8'));
            fs.writeFileSync(TICKETS, JSON.stringify({ ...prev, email: t }));
            return t;
        });

        await step('S4. Single Date Event, open date 3 Dec → Book Event', async () => {
            await goDecember();
            await page.getByRole('button', { name: /Single Date Event/ }).click();
            await cell(3).click();
            await page.getByRole('link', { name: 'Book Event' }).waitFor({ timeout: 20000 });
        });
    } else {
        await step('A1. after approval: 9–12 Dec all available → Continue with 4 Dates enabled', async () => {
            await goDecember();
            await pickRange(9, 12);
            await page.getByRole('link', { name: /Continue with 4 Dates/ }).waitFor({ timeout: 20000 });
            await k.shot('after-approval');
            await page.getByRole('link', { name: /Continue with 4 Dates/ }).click();
            await page.waitForURL(/start=2026-12-09&end=2026-12-12/, { timeout: 30000 });
        });
    }
};
