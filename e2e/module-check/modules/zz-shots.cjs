// TEMP (not committed): dashboard table at common laptop widths — horizontal scroll check.
module.exports = async (k) => {
    const { page, step, expect } = k;
    const PORTAL = 'https://eventmanagementclientv2.vercel.app';
    for (const w of [1366, 1536, 1920]) {
        await step(`dashboard table @${w}`, async () => {
            await page.setViewportSize({ width: w, height: 900 });
            await page.goto(`${PORTAL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.getByText('Events Overview (All Events)').waitFor({ timeout: 60000 });
            await page.locator('[role="status"]').filter({ hasText: 'Loading...' }).first().waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
            await page.locator('table tbody tr').first().waitFor({ timeout: 30000 });
            await page.waitForTimeout(1500);
            const m = await page.evaluate(() => {
                const t = document.querySelector('table');
                const wrap = t.parentElement;
                const rowH = t.querySelector('tbody tr').getBoundingClientRect().height;
                return { table: Math.round(t.scrollWidth), box: Math.round(wrap.clientWidth), page: document.documentElement.scrollWidth > window.innerWidth, rowH: Math.round(rowH) };
            });
            await page.locator('table').scrollIntoViewIfNeeded();
            await k.shot(`table-${w}`);
            expect(m.table <= m.box + 1 && !m.page, `table ${m.table}px in a ${m.box}px box (page scroll: ${m.page})`);
            return `table ${m.table}px / box ${m.box}px, row ${m.rowH}px`;
        });
    }
};
