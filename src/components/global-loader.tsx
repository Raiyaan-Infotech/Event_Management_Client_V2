"use client";

import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { PageLoader } from "@/components/common/page-loader";

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

export function GlobalLoader() {
    // Only a FIRST load (a query with no data yet). A background refresh of data
    // already on screen — reconnect, a socket update, a stale refetch — stays
    // silent: covering a filled page with "Loading..." for it read as the page
    // reloading by itself (coming back to the tab, Jamal 2026-11-02).
    const fetching = useIsFetching({ predicate: (q) => q.state.data === undefined });
    const mutating = useIsMutating();
    const busy = fetching + mutating > 0;

    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!busy) {
            setVisible(false);
            return;
        }
        const t = setTimeout(() => setVisible(true), DELAY_MS);
        // Clearing on cleanup is what makes the delay work: a request that
        // finishes inside the window unmounts the timer before it ever fires.
        return () => clearTimeout(t);
    }, [busy]);

    // A mutation is a deliberate action, so name it — "Saving..." over a form
    // the user just submitted is more informative than a generic spinner.
    return <PageLoader open={visible} text={mutating > 0 ? "Saving..." : "Loading..."} />;
}
