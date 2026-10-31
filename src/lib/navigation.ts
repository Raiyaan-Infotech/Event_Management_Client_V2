import {
    faHouse,
    faCalendarDays,
    faLayerGroup,
    faUsers,
    faUserPlus,
    faFileImport,
    faPeopleGroup,
    faSquareCheck,
    faBell,
    faPaperPlane,
    faEnvelope,
    faChartColumn,
    faCreditCard,
    faGear,
    faListUl,
    faWandMagicSparkles,
    faClockRotateLeft,
    faSliders,
    faListCheck,
} from "@fortawesome/free-solid-svg-icons"

/**
 * Client portal sidebar.
 *
 * Mostly flat — a client manages a handful of areas, and the collapsible groups
 * the template shipped with were one click of ceremony per item. Only an entry
 * with real children gets a chevron.
 *
 * ── THE GUEST MODULE ─────────────────────────────────────────────────────────
 * Every guest screen breadcrumbs from **Guests** in the designs
 * (`Guests > Add Guest`, `Guests > Manage Groups`, `Guests > Import Guests`,
 * `Guests > Send Message`, `Guests > Messages`), so the routes nest the same
 * way and the sidebar mirrors it. A nav that disagrees with the breadcrumb
 * leaves people unable to tell where they are.
 *
 * Messages keeps its own top-level entry as well as the breadcrumb parent,
 * because it is a destination in its own right — the Analytics cards link
 * straight to `/dashboard/messages` and `/dashboard/rsvps`.
 *
 * Children are listed most-used first, not alphabetically: "All Guests" is what
 * someone wants nine times out of ten, and Import is the rare one.
 *
 * > **`url` must be the real route.** `isActive()` in AppSidebar resolves the
 * > highlight by longest-prefix match over THIS list, so an entry pointing at a
 * > path that does not exist silently steals the highlight from one that does.
 *
 * ── `ready` ──────────────────────────────────────────────────────────────────
 * `false` means the page is not built yet, and the sidebar renders it disabled
 * with a Soon chip rather than as a link to the `[...slug]` "coming soon"
 * placeholder. A nav item that navigates to a dead end is worse than one that
 * says it is not ready — the first looks broken, the second is honest.
 *
 * Flip it to `true` as each page lands. Nothing else needs changing.
 *
 * ── `section` — THE PLAN DECIDES ─────────────────────────────────────────────
 * An entry with a `section` slug shows ONLY when the client's plan grants that
 * menu on the website (`/client/event-options` → `menus` slugs + `portal_sections`).
 * `PlanSectionGate` applies the same rule to the page itself, so a typed URL
 * cannot reach a section the sidebar hides. Entries without `section` —
 * Dashboard, My Events, Templates, Notifications, Notification Templates,
 * Analytics, Billing, Settings — always show.
 *
 * The slugs are `event_menus` rows in the admin's Menu Management: `rsvp` is the
 * existing event menu; the rest are 'portal' group rows created by
 * `apply-portal-section-menus.js`. Rename one here and there together.
 */
export const navMain = [
    { title: "Dashboard", url: "/dashboard", icon: faHouse, items: [] },
    { title: "My Events", url: "/dashboard/events", icon: faCalendarDays, items: [] },
    { title: "Templates", url: "/dashboard/templates", icon: faLayerGroup, items: [] },
    // Splash Screens removed from the web (2026-10-31) — it lives in the mobile app only.
    {
        title: "Guests",
        url: "/dashboard/guests",
        icon: faUsers,
        section: "guests",
        items: [
            { title: "All Guests", url: "/dashboard/guests", icon: faListUl, ready: true },
            { title: "Add Guest", url: "/dashboard/guests/add", icon: faUserPlus, ready: true },
            { title: "Guest Groups", url: "/dashboard/guests/groups", icon: faPeopleGroup, ready: true },
            { title: "Import Guests", url: "/dashboard/guests/import", icon: faFileImport, ready: true },
        ],
    },
    {
        title: "Messages",
        url: "/dashboard/messages",
        icon: faEnvelope,
        section: "messages",
        items: [
            { title: "All Messages", url: "/dashboard/messages", icon: faListUl, ready: true },
            { title: "Send Message", url: "/dashboard/messages/send", icon: faPaperPlane, ready: true },
            /*
              Push lives under Messages rather than beside the top-level
              "Notifications" entry, which is a different thing entirely: that
              one is the client's OWN inbox, this one sends to guests. Naming
              them apart matters — "Notifications" and "Push Notifications" are
              two screens a person will otherwise open interchangeably.
            */
            { title: "Push Notifications", url: "/dashboard/messages/notifications", icon: faBell, ready: true },
            { title: "Notification History", url: "/dashboard/messages/notifications/history", icon: faClockRotateLeft, ready: true },
        ],
    },
    { title: "RSVPs", url: "/dashboard/rsvps", icon: faSquareCheck, section: "rsvp", items: [] },
    // Per event, as in the app (2026-10-31).
    { title: "Agenda", url: "/dashboard/agenda", icon: faListCheck, items: [] },
    { title: "Notifications", url: "/dashboard/notifications", icon: faBell, items: [] },
    /*
      Per-event on/off control over the ADMIN's notification templates — a
      different thing from Messages > Push Notifications, which composes and
      sends an ad-hoc message. This one toggles which of the catalogue's
      templates apply to one specific event. Kept top-level rather than
      nested under Messages: it was invisible three levels deep, and the
      supplied mockups show it as its own destination.
    */
    // Always shown — not a plan menu.
    { title: "Notification Templates", url: "/dashboard/messages/notification-templates", icon: faSliders, items: [] },
    // Always shown — Analytics is not a plan menu.
    { title: "Analytics", url: "/dashboard/analytics", icon: faChartColumn, items: [] },
    // "Integrations" was removed: it linked to /dashboard/integrations, which
    // has no page and fell through to the "coming soon" catch-all.
    { title: "Billing", url: "/dashboard/billing", icon: faCreditCard, items: [] },
    { title: "Settings", url: "/dashboard/settings", icon: faGear, items: [] },
]

/**
 * Every section slug the plan grants on the website: event menu slugs (e.g.
 * `rsvp`) plus portal section slugs (e.g. `guests`).
 */
export function grantedSections(options?: { menus?: { slug: string }[]; portal_sections?: string[] } | null) {
    return new Set<string>([
        ...(options?.menus ?? []).map((m) => m.slug),
        ...(options?.portal_sections ?? []),
    ])
}

/**
 * The gated sidebar entry a path belongs to, or null when the path is not gated.
 *
 * Longest URL wins — among ALL entries, gated or not — so
 * `/dashboard/messages/notification-templates/5` belongs to Notification
 * Templates, not to Messages, whose URL is also a prefix of it. Notification
 * Templates is always shown, so it must not inherit Messages' plan gate.
 */
export function sectionForPath(pathname: string) {
    const owner = navMain
        .filter((i) => pathname === i.url || pathname.startsWith(`${i.url}/`))
        .sort((a, b) => b.url.length - a.url.length)[0]
    return owner?.section ? { title: owner.title, slug: owner.section as string } : null
}

/**
 * Icons for the guest sub-pages, used by the Quick Actions cards.
 *
 * The SIDEBAR now carries its own `icon` on each sub-item — it used to render
 * them as text only, which is what made its sub-menus read as a cramped block
 * next to the admin panel's. These stay because the Quick Actions cards pick
 * from them independently.
 */
export const guestActionIcons = {
    add: faUserPlus,
    groups: faPeopleGroup,
    import: faFileImport,
    send: faPaperPlane,
}

/**
 * The sample module, kept reachable while the client screens are built out.
 * Remove this once it is no longer the reference implementation.
 */
export const navDev = [
    { title: "Event Categories", url: "/dashboard/event-categories", icon: faLayerGroup, items: [] },
]
