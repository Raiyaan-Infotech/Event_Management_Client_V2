"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { MAIN_CONTENT_ID, PageLoader } from "@/components/common/page-loader";

/**
 * ── GLOBAL LOADING RULE ──────────────────────────────────────────────────────
 * Every screen shows a loader, and no page has to remember to add one.
 *
 * This watches TanStack Query itself: if ANY query is fetching or ANY mutation
 * is in flight, the overlay shows. Because every screen fetches through the
 * shared hooks, a new page is covered the moment it is written — there is no
 * per-page wiring to forget, which is exactly how pages ended up shipping
 * without a loader before.
 *
 * Route transitions (the gap before a page's code even runs) are covered
 * separately by loading.tsx in the dashboard route group. Between the two,
 * nothing is uncovered.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Wait this long before showing anything.
 *
 * Without it, a cached or sub-100ms response makes the overlay flash on and off
 * — which reads as a glitch and is worse than no loader at all. Anything slower
 * than this is a wait the user should be told about.
 */
const DELAY_MS = 180;

/** The top-most open dialog / slide-in panel, if any. */
const topDialog = () => {
    const open = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
    return open.length ? open[open.length - 1] : null;
};

export function GlobalLoader() {
    // Only a FIRST load (a query with no data yet). A background refresh of data
    // already on screen — reconnect, a socket update, a stale refetch — stays
    // silent: covering a filled page with "Loading..." for it read as the page
    // reloading by itself (coming back to the tab, Jamal 2026-11-02).
    // The session check (`['client','me']`) is skipped: ClientAuthGate shows its own
    // loader for it, and both at once drew a loader over a loader (Jamal, 2026-11-06).
    const fetching = useIsFetching({
        predicate: (q) => q.state.data === undefined && !(q.queryKey[0] === "client" && q.queryKey[1] === "me"),
    });
    const mutating = useIsMutating();
    const busy = fetching + mutating > 0;

    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!busy) return;
        const t = setTimeout(() => setVisible(true), DELAY_MS);
        // Clearing on cleanup is what makes the delay work: a request that
        // finishes inside the window unmounts the timer before it ever fires.
        // Hiding here too: cleanup runs when `busy` turns false.
        return () => { clearTimeout(t); setVisible(false); };
    }, [busy]);

    // A mutation is a deliberate action, so name it — "Saving..." over a form
    // the user just submitted is more informative than a generic spinner.
    const text = mutating > 0 ? "Saving..." : "Loading...";
    if (!visible) return null;
    const main = document.getElementById(MAIN_CONTENT_ID);
    // A dialog / slide-in panel is open (Add Social Link, Wishes panels, …): ONE loader covers the main
    // content AND the panel together, full height to the bottom of the window — but never the top bar
    // or the sidebar (Jamal, 2026-11-10). It starts at the content's scroll box (just under the top bar,
    // right of the sidebar) and is placed above the panel.
    if (topDialog()) {
        const area = (main?.parentElement ?? main)?.getBoundingClientRect();
        const box = { top: Math.max(area?.top ?? 0, 0), left: Math.max(area?.left ?? 0, 0), right: 0, bottom: 0 };
        return createPortal(
            // pointer-events-none: a click on it would count as "outside the panel" and close it mid-save.
            <div className="pointer-events-none fixed z-[60]" style={box}><PageLoader text={text} className="grid place-items-center" /></div>,
            document.body,
        );
    }
    // Otherwise only the main content, not the sidebar / top bar (Jamal, 2026-11-05).
    // Looked up each time it shows: the dashboard and the event workspace have their own box.
    return main ? createPortal(<PageLoader text={text} />, main) : <PageLoader fullScreen text={text} />;
}
