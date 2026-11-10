#!/usr/bin/env node
// Module checks (docs/MODULE_TESTING.md).
//
//   node e2e/module-check/run.cjs nearby               live, QA account, event #37
//   node e2e/module-check/run.cjs downloads --local    local portal :3005 + backend :5001 (already running)
//   node e2e/module-check/run.cjs all                  every file in modules/
//   options: --event <id>   --headed
//
// Screenshots + report.json → Documents\EventInvite_Portal_Test\<date>_<module>\
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { makeKit, readEnvFile } = require('./lib.cjs');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const MODULES_DIR = path.join(__dirname, 'modules');
const available = fs.readdirSync(MODULES_DIR).filter((f) => f.endsWith('.cjs')).map((f) => f.replace(/\.cjs$/, ''));
const wanted = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--event');

if (!wanted || (wanted !== 'all' && !available.includes(wanted))) {
    console.log(`Usage: npm run test:module -- <${available.join(' | ')} | all> [--local] [--event <id>] [--headed]`);
    process.exit(wanted ? 1 : 0);
}

const LOCAL = flag('--local');
const PORTAL = LOCAL ? 'http://localhost:3005' : 'https://eventmanagementclientv2.vercel.app';
const API = LOCAL ? 'http://localhost:5001/api/v1' : 'https://event-management-admin-backend-v2.onrender.com/api/v1';
const qa = readEnvFile(process.env.QA_ENV_FILE || 'D:/Jamal/Eveninvit_2/Event_Management_Admin_Backend/.env.qa-test');
const EMAIL = LOCAL ? process.env.E2E_EMAIL : qa.QA_EMAIL;
const PASSWORD = LOCAL ? process.env.E2E_PASSWORD : qa.QA_PASSWORD;
const EVENT = Number(opt('--event', LOCAL ? process.env.E2E_EVENT || 0 : 37));

if (!EMAIL || !PASSWORD || !EVENT) {
    console.log(LOCAL
        ? 'Local run needs E2E_EMAIL, E2E_PASSWORD and E2E_EVENT (or --event <id>) for a local client who owns that event.'
        : 'Live run needs the QA login in Event_Management_Admin_Backend/.env.qa-test (QA_EMAIL / QA_PASSWORD).');
    process.exit(1);
}

// The local date (India), not UTC — a morning run must not land in yesterday's folder.
const now = new Date();
const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const docs = path.join(os.homedir(), 'Documents', 'EventInvite_Portal_Test');

(async () => {
    const list = wanted === 'all' ? available : [wanted];
    let failed = 0;
    for (const name of list) {
        const OUT = path.join(docs, `${day}_${name}${LOCAL ? '_local' : ''}`);
        fs.mkdirSync(OUT, { recursive: true });
        // A fresh run: old screenshots (e.g. a FAIL from an earlier run) must not linger.
        for (const f of fs.readdirSync(OUT)) if (/\.(png|json)$/.test(f)) fs.unlinkSync(path.join(OUT, f));
        const STAMP = `QA-${Date.now().toString(36)}`;
        const report = { module: name, target: LOCAL ? 'local' : 'live', portal: PORTAL, event: EVENT, started: new Date().toISOString(), steps: [] };
        console.log(`\n▶ ${name}  (${report.target}, event #${EVENT})`);

        const browser = await chromium.launch({ headless: !flag('--headed') });
        const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
        const page = await ctx.newPage();
        const kit = makeKit({ page, ctx, PORTAL, API, EVENT, OUT, STAMP, report });

        await kit.step('sign in', async () => {
            const r = await kit.api('/public/website-clients/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
            kit.expect(r.status === 200, `login ${r.status} ${JSON.stringify(r.body?.message)}`);
        });
        if (report.steps[0].ok) {
            try {
                await require(path.join(MODULES_DIR, `${name}.cjs`))(kit);
            } catch (e) {
                report.steps.push({ step: 'module check crashed', ok: false, error: String(e.message).slice(0, 240) });
                console.log('  ✗ module check crashed —', e.message);
            }
        }
        await kit.step('no page errors / API 5xx', async () => kit.expect(kit.errors.length === 0, kit.errors.slice(0, 5).join(' | ')));
        await browser.close();

        report.passed = report.steps.filter((s) => s.ok).length;
        report.failed = report.steps.length - report.passed;
        failed += report.failed;
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
        console.log(`  ${report.passed} passed, ${report.failed} failed → ${OUT}`);
    }
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
