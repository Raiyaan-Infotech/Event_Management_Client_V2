---
name: test-module
description: Browser-test a client-portal module (Social Links, Downloads, Near By, …) against the module checklist in docs/MODULE_TESTING.md — add, edit, view, hide, delete, loading state, error message, saving state (button spinner + "Saving..." loader). Use when Jamal says "/test-module <name>", "test the module", "browser test <module>" or "check <module> live".
---

# Test a module in the browser

The checklist is `docs/MODULE_TESTING.md` (in this repo). Run it ONLY when asked.

## Run

From `D:\Jamal\Eveninvit_2\event_client_single`:

```
npm run test:module -- <module>            # live (Vercel + Render), QA account, event #37
npm run test:module -- <module> --local    # local; portal :3005 + backend :5001 must already run;
                                           # needs E2E_EMAIL / E2E_PASSWORD / E2E_EVENT
npm run test:module -- all
```

`<module>` = a file name in `e2e/module-check/modules/` (`social-links`, `downloads`, `nearby`, `agenda`, `family`, `live`, `media`, `wishes`). If the module asked
for has no file yet, write one first by copying `modules/social-links.cjs` (same 11 steps: page loads, loading state,
error message, add + saving state, edit, view, hide, delete, clean up, no errors) and adjust the tab, buttons and
fields to that module's page.

Default target is **live**. Never add `--local` unless asked or the change is not pushed yet (then say so and ask).

## Report back

1. Read `report.json` and the screenshots in `Documents\EventInvite_Portal_Test\<date>_<module>\`.
2. Look at the `saving` and `FAIL_*` screenshots yourself before reporting.
3. Send the key screenshots with SendUserFile (`saving`, `added`, `view`, any `FAIL_*`).
4. Reply short: pass / fail count, then one line per failed step with the cause, then what was cleaned up.
   A failure in the check script itself (selector changed) is fixed in the script and re-run, not reported as an
   app bug.

## Rules

- The QA login lives in `Event_Management_Admin_Backend/.env.qa-test` (git-ignored). Never print it or copy it into
  a tracked file.
- Everything the run creates carries a `QA-…` stamp and is deleted by the run's clean-up step; confirm it is gone.
