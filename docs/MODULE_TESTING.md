# Module testing — the checklist every new module passes

When a module is built or changed (Social Links, Downloads, Near By, …), it is tested in a **real browser** against
this list **when Jamal asks** ("test the module", `/test-module <name>`). The result is screenshots + a short pass /
fail report, never "it type-checks".

## The short command

| Say / type | What runs |
|---|---|
| `/test-module nearby` | the Near By checks on **live**, as the QA test account |
| `/test-module downloads --local` | the Downloads checks on **local** (portal :3005 + backend :5001 must already be running) |
| `/test-module all` | every module that has a check file |

Same thing from a terminal, in `event_client_single`:

```
npm run test:module -- nearby
npm run test:module -- downloads --local
npm run test:module -- all
```

Modules with a check file today: `social-links`, `downloads`, `nearby` (`e2e/module-check/modules/`).

## What every module must pass

| # | Check | What "pass" means |
|---|---|---|
| 1 | **Page loads** | The page opens from the event sidebar; header, tiles and list (or the empty state) show; no page errors. |
| 2 | **Loading state** | While the page's data is loading, the loader ("Loading...") covers the main content — not the sidebar / top bar. |
| 3 | **Error message** | Saving the Add form empty shows the red error message ("Please fill all mandatory fields.") and the fields turn red; nothing is saved. |
| 4 | **Add** | Fill the form → Save → success message → the new item is in the list (and in the API). |
| 5 | **Saving state** | While saving with the panel open: the **Save button shows its spinner and is disabled**, and the **"Saving..." loader covers everything except the sidebar** (top bar, page and the whole panel). |
| 6 | **Edit** | Row ⋯ → Edit → change a field → Save → success message → the list shows the new value. |
| 7 | **View** | Row ⋯ → View Details opens in the **slide-in panel** (not a popup) with the item's details. |
| 8 | **Show / Hide** (where the module has it) | Row ⋯ → Hide → status pill changes to Hidden, the tiles' counts change. |
| 9 | **Delete** | Row ⋯ → Delete → the delete panel (tick "I understand…") → success message → the item is gone. |
| 10 | **Clean up** | Everything the test created is deleted again (the test marks it with a `QA-…` stamp). |
| 11 | **No errors** | No page errors and no API 5xx during the run. |

Module-specific extras are listed in each check file (e.g. Near By: Google suggestions load, already-added places
show "Added"; Downloads: file upload + file type detected).

## How the check works

- Signs in through the website's login API (live: the QA account from the git-ignored
  `Event_Management_Admin_Backend/.env.qa-test`; local: `E2E_EMAIL` / `E2E_PASSWORD`).
- Live tests run on the QA account's event **#37 "QA Test Wedding"** (change with `--event <id>`).
- Every save is **held for 4 seconds** on purpose, so the saving state (check 5) can be seen and photographed.
- Screenshots + `report.json` go to `Documents\EventInvite_Portal_Test\<date>_<module>\`.

## Adding a new module to the checks

Copy `e2e/module-check/modules/social-links.cjs` to `modules/<name>.cjs`, change the tab, the button names and the
form fields, keep the same steps (1–11). `run.cjs` finds it by file name.
