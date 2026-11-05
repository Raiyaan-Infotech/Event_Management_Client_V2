"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";

/**
 * Keeps the event's pages INSIDE the event workspace (`/event/:id`, the tab
 * "View Event" opens). Jamal, 2026-11-05: Manage Groups, Add Guest, Import,
 * RSVP details, Edit Event… opened the normal dashboard instead.
 *
 * The pages are shared with the dashboard and link to `/dashboard/...`.
 * `useEventHref()` gives a `to(href)` that, inside the workspace, turns those
 * links into their `/event/:id/...` copies (and adds `event=<id>` so the page
 * knows the event). Outside the workspace it returns the link unchanged.
 * Billing, My Events, Templates and other account pages stay in the dashboard.
 */

/** Dashboard pages that have a copy under /event/:id/… */
const SUB_PAGES = /^\/dashboard\/(guests\/(add|import|groups)|guests\/\d+|rsvps\/\d+|participants\/(add|\d+)|messages\/send)(\/|$|\?)/;
/** Dashboard lists that are a section (?tab=) of the workspace. */
const LISTS: Record<string, string> = {
    "/dashboard/guests": "guests",
    "/dashboard/rsvps": "rsvps",
    "/dashboard/participants": "participants",
    "/dashboard/messages": "messages",
};

/** The event id when `pathname` is inside the workspace, else null. */
export function workspaceEventId(pathname: string | null): number | null {
    const m = pathname?.match(/^\/event\/(\d+)(\/|$)/);
    return m ? Number(m[1]) : null;
}

function withQuery(path: string, query: URLSearchParams) {
    const q = query.toString();
    return q ? `${path}?${q}` : path;
}

/** `href` as it should be inside the workspace of event `eventId`. */
export function toWorkspaceHref(href: string, eventId: number): string {
    if (!href.startsWith("/dashboard")) return href;
    const [path, search = ""] = href.split("?");
    const query = new URLSearchParams(search);

    // /dashboard/events/:id[/guests|rsvps|participants|edit…]
    const ev = path.match(/^\/dashboard\/events\/(\d+)(\/.*)?$/);
    if (ev) {
        const rest = ev[2] ?? "";
        const tab = rest.match(/^\/(guests|rsvps|participants)\/?$/);
        if (tab) { query.set("tab", tab[1]); return withQuery(`/event/${ev[1]}`, query); }
        return withQuery(`/event/${ev[1]}${rest}`, query);
    }

    const list = LISTS[path.replace(/\/$/, "")];
    if (list) {
        query.set("tab", list);
        query.delete("event");
        return withQuery(`/event/${eventId}`, query);
    }

    if (SUB_PAGES.test(path)) {
        if (!query.has("event") && !query.has("event_id")) query.set("event", String(eventId));
        return withQuery(`/event/${eventId}${path.slice("/dashboard".length)}`, query);
    }
    return href;
}

/** `to(href)` — see the note at the top. */
export function useEventHref() {
    const eventId = workspaceEventId(usePathname());
    return useCallback((href: string) => (eventId ? toWorkspaceHref(href, eventId) : href), [eventId]);
}

/** The dashboard path a workspace path stands for (for the plan gate). */
export function dashboardPathFor(pathname: string): string {
    const m = pathname.match(/^\/event\/(\d+)(\/.*)?$/);
    if (!m) return pathname;
    return m[2] ? `/dashboard${m[2]}` : `/dashboard/events/${m[1]}`;
}
