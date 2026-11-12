// Media — the parts the standard media.cjs check does not cover (Jamal, 2026-11-12):
// several images at once, Create Video (sidebar), Create Short (sidebar), Rename, Download,
// Move to Folder, Multi-select (Copy + bulk Delete), Create Album (images + MP3) → Play → Edit → Delete.
// Works in two test folders (QA-… Media A / B) made through the API; everything is removed at the end.
const path = require('path');

const FIX = path.join(__dirname, '..', 'fixtures');

module.exports = async (k) => {
    const { page, step, expect, api, STAMP, EVENT } = k;
    const A = `${STAMP} Media A`;
    const B = `${STAMP} Media B`;
    const RENAMED = `${STAMP} Renamed`;
    const SHORT = `${STAMP} Short`;
    const ALBUM = `${STAMP} Album`;
    const ALBUM2 = `${ALBUM} edited`;
    const INTRO = `${STAMP} intro text`;
    // The name qa-1.png shows under after E4 (its old name when Rename did not save, so later steps still run).
    let IMG1 = 'qa-1.png';

    const gallery = async () => (await api(`/client/events/${EVENT}/gallery`)).body?.data || {};
    const folderOf = async (name) => ((await gallery()).categories || []).find((c) => c.name === name);
    const filesIn = async (name) => {
        const g = await gallery();
        const f = (g.categories || []).find((c) => c.name === name);
        return f ? (g.items || []).filter((i) => i.category_id === f.id) : [];
    };
    const albums = async () => ((await api(`/client/events/${EVENT}/gallery/albums`)).body?.data?.albums || []).filter((a) => (a.name || '').startsWith(STAMP));

    const base = () => page.url().split('?')[0];
    const goCreate = async (what) => {
        await page.goto(`${base()}?tab=gallery&create=${what}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    };
    const folderCard = (t) => page.locator('div').filter({ hasText: t }).filter({ has: page.getByRole('button', { name: 'Folder actions' }) }).last();
    const folderMenu = async (t, item) => {
        await folderCard(t).getByRole('button', { name: 'Folder actions' }).click();
        await page.getByRole('menuitem', { name: item }).click();
        await page.waitForTimeout(500);
    };
    const overview = async () => {
        await k.openTab('gallery', /Create Folder/i);
        await page.getByText('Media Overview').first().waitFor();
    };
    const openFolder = async (t) => {
        await overview();
        await folderMenu(t, /^Open$/);
        await page.getByRole('heading', { name: t }).waitFor();
    };
    const fileCard = (t) => page.locator('div.group').filter({ hasText: t }).first();
    const fileMenu = async (t, item) => {
        await fileCard(t).getByRole('button', { name: 'File actions' }).click();
        await page.getByRole('menuitem', { name: item }).click();
        await page.waitForTimeout(500);
    };
    /** Picks a folder in the open panel's folder select (by its name). */
    const pickFolderIn = async (scope, name) => {
        await scope.getByRole('combobox').first().click();
        await page.getByRole('option', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
        await page.waitForTimeout(300);
    };
    const pngs = async (n) => Promise.all(Array.from({ length: n }, async (_, i) => ({
        name: `qa-${i + 1}.png`, mimeType: 'image/png',
        buffer: Buffer.from((await page.evaluate((idx) => {
            const c = document.createElement('canvas'); c.width = 640; c.height = 360;
            const g = c.getContext('2d'); g.fillStyle = ['#e91e63', '#3f51b5', '#009688'][idx % 3]; g.fillRect(0, 0, 640, 360);
            g.fillStyle = '#fff'; g.font = 'bold 56px sans-serif'; g.fillText(`QA photo ${idx + 1}`, 140, 200);
            return c.toDataURL('image/png');
        }, i)).split(',')[1], 'base64'),
    })));

    await step('setup: two test folders (API)', async () => {
        for (const name of [A, B]) {
            const r = await api(`/client/events/${EVENT}/gallery/categories`, { method: 'POST', body: JSON.stringify({ name, folder_type: 'mixed' }) });
            expect(r.status < 300, `folder ${name}: ${r.status} ${JSON.stringify(r.body?.message)}`);
        }
        expect(!!(await folderOf(A)) && !!(await folderOf(B)), 'test folders not in the API');
    });

    await step('E1. upload 3 images at once (Upload Here)', async () => {
        await overview();
        await folderMenu(A, /Upload Here/);
        const panel = page.getByRole('dialog');
        await panel.locator('input[type="file"]').setInputFiles(await pngs(3));
        await panel.getByText('Selected Files (3)').waitFor();
        await k.shot('upload-3-images');
        await page.getByRole('button', { name: /Upload 3 Files/i }).click();
        await k.toast(/3 files uploaded/i, 120000);
        await k.panelClosed();
        const imgs = (await filesIn(A)).filter((i) => i.type === 'image');
        expect(imgs.length === 3, `expected 3 images in the folder (API), got ${imgs.length}`);
    });

    await step('E2. Create Video (sidebar → Upload Media on Video)', async () => {
        await goCreate('video');
        const panel = page.getByRole('dialog');
        await panel.getByText('Upload Media').first().waitFor({ timeout: 60000 });
        await pickFolderIn(panel, A);
        await panel.locator('input[type="file"]').setInputFiles(path.join(FIX, 'qa-video.mp4'));
        await panel.getByText('qa-video.mp4').waitFor();
        await k.shot('create-video');
        await page.getByRole('button', { name: /Upload 1 File/i }).click();
        await k.toast(/1 file uploaded/i, 240000);
        await k.panelClosed();
        const vids = (await filesIn(A)).filter((i) => i.type === 'video' && !i.is_short);
        expect(vids.length === 1, `video not in the folder (API): ${vids.length}`);
        await fileCard('qa-video.mp4').waitFor({ timeout: 30000 });
        await k.shot('video-in-folder');
    });

    await step('E3. Create Short (sidebar → Upload Short)', async () => {
        await goCreate('short');
        const dlg = page.getByRole('dialog');
        await dlg.getByText('Upload Short').first().waitFor({ timeout: 60000 });
        // Empty submit first: the error message.
        await dlg.getByRole('button', { name: /^Upload Short$/ }).click();
        await k.toast(/choose a video and enter a title/i);
        await dlg.locator('input[type="file"][accept^="video"]').setInputFiles(path.join(FIX, 'qa-short.mp4'));
        await dlg.getByText('Trim Short').waitFor({ timeout: 30000 });
        await dlg.getByPlaceholder('Enter a title').fill(SHORT);
        // The Album select is the dialog's only combobox.
        await pickFolderIn(dlg, A);
        await k.shot('create-short');
        // The QA plan allows 2 videos (shorts count). With the test video in, a full plan must say so.
        const used = ((await gallery()).items || []).filter((i) => i.type === 'video').length;
        if (used >= 2) {
            await dlg.getByRole('button', { name: /^Upload Short$/ }).click();
            await k.toast(/limit of \d+ videos/i, 120000);
            await k.shot('short-plan-limit');
            k.note('E3a. plan limit message shown (videos full)', true);
            // Free one slot: remove the test video (E2 already checked it), then upload again.
            for (const v of (await filesIn(A)).filter((i) => i.type === 'video' && !i.is_short)) await api(`/client/gallery/${v.id}`, { method: 'DELETE' });
        }
        await dlg.getByRole('button', { name: /^Upload Short$/ }).click();
        await page.getByText('Upload Successful').waitFor({ timeout: 240000 });
        await k.shot('short-uploaded');
        await page.getByRole('button', { name: 'View Media' }).click();
        await page.getByRole('heading', { name: A }).waitFor();
        const shorts = (await filesIn(A)).filter((i) => i.is_short);
        expect(shorts.length === 1 && shorts[0].title === SHORT, `short not in the folder (API): ${JSON.stringify(shorts.map((s) => s.title))}`);
    });

    await step('E4. Rename a file', async () => {
        await fileMenu('qa-1.png', /^Rename$/);
        const dlg = page.getByRole('dialog');
        await dlg.getByRole('textbox').fill(RENAMED);
        await dlg.getByRole('button', { name: 'Save' }).click();
        await k.toast(/Renamed/);
        await k.panelClosed();
        const saved = (await filesIn(A)).some((i) => i.title === RENAMED);
        if (saved) IMG1 = RENAMED;
        expect(saved, 'Rename said "Renamed" but the new name is not saved (API title still empty)');
        await fileCard(RENAMED).waitFor();
    });

    await step('E5. Download a file', async () => {
        // Download opens the file (another site) in a new tab, or saves it - either counts.
        const dl = page.waitForEvent('download', { timeout: 20000 }).then((d) => d.url()).catch(() => null);
        const tab = page.context().waitForEvent('page', { timeout: 20000 }).then(async (p) => { await p.waitForLoadState('domcontentloaded').catch(() => null); const u = p.url(); await p.close().catch(() => null); return u; }).catch(() => null);
        await fileMenu(IMG1, /^Download$/);
        const url = await Promise.any([dl, tab].map((x) => x.then((u) => u || Promise.reject(new Error('none'))))).catch(() => null);
        expect(!!url, 'nothing was downloaded or opened');
        const head = await page.context().request.get(url).catch(() => null);
        expect(head && head.ok(), `the file link does not load (${head ? head.status() : 'no answer'})`);
    });

    await step('E6. Move to Folder (one file → folder B)', async () => {
        await fileMenu('qa-2.png', /^Move to Folder$/);
        const sheet = page.getByRole('dialog');
        await sheet.locator('label').filter({ hasText: B }).click();
        await k.shot('move-sheet');
        await sheet.getByRole('button', { name: /Move 1 File/ }).click();
        await k.panelClosed();
        await page.waitForTimeout(1500);
        const inB = await filesIn(B);
        expect(inB.length === 1 && inB[0].file_name === 'qa-2.png', `file not moved to B (API): ${inB.length}`);
        expect(!(await filesIn(A)).some((i) => i.file_name === 'qa-2.png' && !i.title), 'file still in A');
    });

    await step('E6b. View Full Screen (open, Next, close)', async () => {
        await fileMenu(IMG1, /View Full Screen/);
        const dlg = page.getByRole('dialog');
        await dlg.getByText(/^\d+ of 3/).waitFor();
        const first = await dlg.getByText(/^\d+ of 3/).textContent();
        await dlg.locator('img, video').first().waitFor();
        await k.shot('full-screen');
        const next = dlg.getByRole('button', { name: 'Next' });
        const prev = dlg.getByRole('button', { name: 'Previous' });
        await ((await next.count()) ? next : prev).click();
        await page.waitForTimeout(500);
        const second = await dlg.getByText(/^\d+ of 3/).textContent();
        expect(first !== second, `Next / Previous did not change the picture (${first})`);
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    const SHORT2 = `${SHORT} edited`;
    await step('E6c. Edit Details (short: title, description, Show in Event App off)', async () => {
        await fileMenu(SHORT, /^Edit$/);
        const dlg = page.getByRole('dialog');
        await dlg.getByText('Edit Media').waitFor();
        await dlg.getByRole('textbox').first().fill(SHORT2);
        await dlg.locator('textarea').fill('QA description');
        await dlg.getByRole('switch').click();
        await k.shot('edit-details');
        await dlg.getByRole('button', { name: 'Save' }).click();
        await k.toast(/Media updated/);
        await k.panelClosed();
        const s = (await filesIn(A)).find((i) => i.is_short);
        expect(s && s.title === SHORT2 && s.description === 'QA description' && s.show_in_app === false,
            `edit not saved: ${JSON.stringify({ title: s?.title, description: s?.description, show: s?.show_in_app })}`);
        await fileCard(SHORT2).getByText('Hidden').waitFor();
    });

    await step('E6d. Hide / Show in Event App (details panel → Actions)', async () => {
        await fileCard(IMG1).locator('button').first().click(); // opens the details panel
        await page.getByRole('button', { name: /^actions$/i }).click();
        await page.getByRole('button', { name: 'Hide in Event App' }).click();
        await k.toast(/Hidden in the event app/);
        const img = async () => (await filesIn(A)).find((i) => (i.title || i.file_name) === IMG1);
        expect((await img())?.show_in_app === false, 'hide not saved in the API');
        await fileCard(IMG1).getByText('Hidden').waitFor();
        await k.shot('hidden-in-app');
        await page.getByRole('button', { name: 'Show in Event App' }).click();
        await k.toast(/Shown in the event app/);
        expect((await img())?.show_in_app === true, 'show not saved in the API');
        // Close the details panel (its own close button; the cards stay).
        await page.locator('div.rounded-xl').filter({ has: page.getByRole('button', { name: /^actions$/i }) }).getByRole('button', { name: 'Close' }).first().click();
        await page.waitForTimeout(400);
    });

    await step('E7. Multi-select → Copy to folder B (plan photo limit checked)', async () => {
        await page.getByRole('button', { name: /Multi-select/ }).click();
        await fileCard(IMG1).locator('button').first().click();
        await fileCard('qa-3.png').locator('button').first().click();
        await page.getByText('2 selected').waitFor();
        await k.shot('multi-select');
        const copyTo = async (n) => {
            await page.getByRole('button', { name: `Bulk Actions (${n})` }).click();
            await page.getByRole('menuitem', { name: /Copy to Folder/ }).click();
            const sheet = page.getByRole('dialog');
            await sheet.locator('label').filter({ hasText: B }).click();
            await sheet.getByRole('button', { name: n === 1 ? 'Copy 1 File' : `Copy ${n} Files` }).click();
        };
        // A copy counts as a new photo. When 2 copies would pass the plan's photo limit, the refusal must say so.
        const photos = (await gallery()).usage?.photos || {};
        if (photos.limit && photos.used + 2 > photos.limit) {
            await copyTo(2);
            await k.toast(/go over your plan|limit/i);
            await k.shot('copy-plan-limit');
            k.note(`E7a. copy over the photo limit refused with a message (${photos.used}/${photos.limit})`, true);
            await page.keyboard.press('Escape');
            await k.panelClosed();
            await fileCard('qa-3.png').locator('button').first().click(); // keep 1 selected
            await page.getByText('1 selected').waitFor();
            await copyTo(1);
        } else {
            await copyTo(2);
        }
        await k.panelClosed();
        await page.waitForTimeout(1500);
        const inB = (await filesIn(B)).length;
        expect(inB === 2 || inB === 3, `the copy did not reach folder B (B holds ${inB})`);
        expect((await filesIn(A)).length === 3, `A should still hold 3 files (2 images + short), got ${(await filesIn(A)).length}`);
    });

    await step('E8. Multi-select → Select All → bulk Delete (folder B)', async () => {
        const n = (await filesIn(B)).length;
        await openFolder(B);
        await page.getByRole('button', { name: /Multi-select/ }).click();
        await page.locator('label').filter({ hasText: 'Select All' }).click();
        await page.getByText(`${n} selected`).waitFor();
        await page.getByRole('button', { name: `Bulk Actions (${n})` }).click();
        await page.getByRole('menuitem', { name: /^Delete$/ }).click();
        await k.confirmDelete();
        await k.panelClosed();
        await page.waitForTimeout(1500);
        expect((await filesIn(B)).length === 0, 'files still in B (API)');
        expect((await filesIn(A)).length === 3, 'deleting the copies touched folder A');
    });

    await step('E9. Create Album — error message (Save with nothing)', async () => {
        await goCreate('album');
        await page.getByRole('heading', { name: 'Create Album' }).waitFor({ timeout: 60000 });
        await page.getByRole('button', { name: /Save Album/ }).click();
        await k.toast(/enter the album name/i);
        await k.shot('album-error');
    });

    await step('E10. Create Album — 2 images + MP3 → Save', async () => {
        await page.getByRole('button', { name: /Add Images/ }).first().click();
        const dlg = page.getByRole('dialog');
        await pickFolderIn(dlg, A);
        const tiles = dlg.locator('button:has(img)');
        await tiles.first().waitFor();
        const n = await tiles.count();
        expect(n === 2, `the picker should show A's 2 images, shows ${n}`);
        for (let i = 0; i < n; i++) await tiles.nth(i).click();
        await dlg.getByRole('button', { name: /Add 2 Images/ }).click();
        await k.panelClosed();
        await page.getByText('Album Slides (2)').waitFor();
        await page.getByPlaceholder(/QA Test Wedding – Highlights|e\.g\./).first().fill(ALBUM);
        // Intro on, Intro Text empty: the album NAME must not play as the intro (Jamal, 2026-11-12).
        await page.waitForTimeout(600);
        expect((await page.getByText(ALBUM, { exact: true }).count()) === 0, 'the album name shows in the preview as the intro while Intro Text is empty');
        expect((await page.getByText('No text yet').count()) === 1, 'the summary does not say the intro has no text');
        await k.shot('album-intro-empty');
        await page.getByRole('button', { name: /Save Album/ }).click();
        await k.toast(/enter the intro text/i);
        // Typed intro text = exactly what the preview shows.
        await page.locator('textarea[placeholder^="QA Test Wedding"]').fill(INTRO);
        await page.getByText(INTRO, { exact: true }).first().waitFor();
        await k.shot('album-intro-text');
        await page.locator('#album-music').click();
        await page.locator('input[type="file"][accept*="audio"]').setInputFiles(path.join(FIX, 'qa-music.mp3'));
        await page.getByText('qa-music.mp3').first().waitFor({ timeout: 60000 });
        await k.shot('album-builder');
        await page.getByRole('button', { name: /Save Album/ }).click();
        await k.toast(/Album saved/i, 60000);
        await page.getByText('Media Overview').first().waitFor();
        const list = await albums();
        expect(list.length === 1 && list[0].name === ALBUM, `album not in the API: ${JSON.stringify(list.map((a) => a.name))}`);
        expect(list[0].intro_text === INTRO, `intro text saved wrong: ${JSON.stringify(list[0].intro_text)}`);
        expect(list[0].slide_count === 2 && list[0].music_enabled, `album saved wrong: ${list[0].slide_count} slides, music ${list[0].music_enabled}`);
    });

    const albumCard = (t) => page.locator('div.rounded-xl').filter({ hasText: t }).filter({ has: page.getByRole('button', { name: 'Album actions' }) }).last();

    await step('E11. Play the album', async () => {
        await page.getByRole('button', { name: `Play ${ALBUM}` }).click();
        await page.getByRole('dialog').waitFor();
        await page.waitForTimeout(2500);
        await k.shot('album-play');
        await page.keyboard.press('Escape');
        await k.panelClosed();
    });

    await step('E12. Edit the album (rename)', async () => {
        await albumCard(ALBUM).getByRole('button', { name: 'Album actions' }).click();
        await page.getByRole('menuitem', { name: /Edit Album/ }).click();
        await page.getByRole('heading', { name: 'Edit Album' }).waitFor();
        await page.getByPlaceholder(/QA Test Wedding – Highlights|e\.g\./).first().fill(ALBUM2);
        await page.getByRole('button', { name: /Save Album/ }).click();
        await k.toast(/Album saved/i, 60000);
        await page.getByText('Media Overview').first().waitFor();
        expect((await albums())[0]?.name === ALBUM2, 'album rename not saved in the API');
    });

    await step('E12b. Delete the cover photo from Media → album cover still loads', async () => {
        const a = (await albums())[0];
        const coverItem = (await filesIn(A)).find((i) => i.url === a.cover_image);
        expect(!!coverItem, 'the album cover is not one of the folder photos (test set-up)');
        await api(`/client/gallery/${coverItem.id}`, { method: 'DELETE' });
        const after = (await albums())[0];
        expect(after.slide_count === 1, `the deleted photo should drop out of the slides (${after.slide_count})`);
        const r = await page.context().request.get(after.cover_url).catch(() => null);
        expect(r && r.ok(), `album cover is broken after its photo was deleted (${r ? r.status() : 'no answer'})`);
    });

    await step('E13. Delete the album', async () => {
        await albumCard(ALBUM2).getByRole('button', { name: 'Album actions' }).click();
        await page.getByRole('menuitem', { name: /^Delete$/ }).click();
        await page.getByRole('dialog').getByText('Delete Album?').waitFor();
        await k.shot('album-delete');
        await page.getByRole('button', { name: 'Delete Album' }).click();
        await k.toast(/Album deleted/i);
        await k.panelClosed();
        expect((await albums()).length === 0, 'album still in the API');
        expect((await filesIn(A)).filter((i) => i.type === 'image').length === 1, 'deleting the album removed its photos');
    });

    await step('E14. clean up', async () => {
        for (const a of await albums()) await api(`/client/gallery/albums/${a.id}`, { method: 'DELETE' });
        for (const name of [A, B]) {
            for (const i of await filesIn(name)) await api(`/client/gallery/${i.id}`, { method: 'DELETE' });
            const f = await folderOf(name);
            if (f) await api(`/client/gallery/categories/${f.id}`, { method: 'DELETE' });
        }
        expect(!(await folderOf(A)) && !(await folderOf(B)) && (await albums()).length === 0, 'test data left behind');
    });
};
