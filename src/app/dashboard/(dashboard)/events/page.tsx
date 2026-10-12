"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCalendarDays,
    faPaperPlane,
    faClock,
    faCircleCheck,
    faUsers,
    faSearch,
    faSliders,
    faLocationDot,
    faEllipsisVertical,
    faChevronLeft,
    faChevronRight,
    faPlus,
    faFileImport,
    faSquareCheck,
    faLayerGroup,
    faArrowRight,
    faChartPie,
    faTriangleExclamation,
    faQrcode,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EventThumbnail } from "@/components/common/event-thumbnail";
import { eventCustomImage } from "@/lib/event-templates";
import { EventQr } from "@/components/common/event-qr";
import { useEventOptions } from "@/hooks/use-client-portal";
import {
    useClientEvents,
    useDashboardStats,
    useDeleteEvent,
    type ClientEvent,
    type DerivedStatus,
} from "@/hooks/use-client-events";
import { ApiError } from "@/lib/api-client";
import { SignInPrompt } from '@/components/common/sign-in-prompt';

/**
 * My Events — the sidebar's "My Events" destination.
 *
 * This route had no page at all: `/dashboard/events` fell through to the
 * `[...slug]` "coming soon" catch-all, which is why created events appeared
 * nowhere. Everything below reads the API.
 *
 *   tiles    GET /client/events/stats     counts derived server-side
 *   rows     GET /client/events           tab + category + privacy + sort + search
 *   rail     GET /client/events?status=upcoming&limit=3
 *   filter   GET /client/event-options    the client's plan-scoped categories
 *
 * ── BUILT FROM THE COMPONENT LIBRARY ─────────────────────────────────────────
 * Tabs, Badge, Separator, Popover, Select, Card, Dialog and DropdownMenu are all
 * the shared `components/ui` primitives. The first cut of this screen hand-rolled
 * the tabs as bordered <button>s and the status chips as <span>s, which drifted
 * from the rest of the app the moment a token changed. Anything genuinely new
 * (the invitation artwork) is a component in `components/common`, not inline JSX.
 *
 * ── FIVE STATES, THREE OF WHICH ARE DERIVED ──────────────────────────────────
 * Only `draft` and `cancelled` are stored. `live`, `upcoming` and `past` come
 * from the event's dates on the server, so an event goes live when it starts and
 * completes when it ends with nothing to flip. "Completed" is this UI's word for
 * `past`.
 *
 * ── WHAT IS HONESTLY EMPTY ───────────────────────────────────────────────────
 * Going / Pending / Declined, Total Guests, and the Event Performance donut all
 * need a guest module, and there is not one. The API answers 0 with
 * `guests_available: false` beside it, and each of those places prints `--`
 * rather than a 0 that reads as "nobody replied". They light up on their own the
 * day that module lands.
 */

const TABS = [
    { label: "All Events", value: "all" },
    { label: "Upcoming", value: "upcoming" },
    { label: "Live", value: "live" },
    { label: "Completed", value: "past" },
    { label: "Drafts", value: "draft" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

/** Badge variant + tint per state. `Badge` supplies the shape and typography. */
const STATUS_BADGE: Record<DerivedStatus, string> = {
    live: "bg-destructive/10 text-destructive",
    upcoming: "bg-warning/15 text-warning",
    past: "bg-success/15 text-success",
    draft: "bg-muted text-muted-foreground",
    cancelled: "bg-foreground/10 text-foreground/70",
};

const STATUS_LABELS: Record<DerivedStatus, string> = {
    live: "Live",
    upcoming: "Upcoming",
    past: "Completed",
    draft: "Draft",
    cancelled: "Cancelled",
};

const SORT_OPTIONS = [
    { value: "default", label: "Default for this tab" },
    { value: "date_desc", label: "Event date — newest first" },
    { value: "date_asc", label: "Event date — soonest first" },
    { value: "name_asc", label: "Name — A to Z" },
    { value: "name_desc", label: "Name — Z to A" },
    { value: "created_desc", label: "Recently created" },
] as const;

const PRIVACY_OPTIONS = [
    { value: "all", label: "All privacy" },
    { value: "private", label: "Private" },
    { value: "public", label: "Public" },
    { value: "unlisted", label: "Unlisted" },
] as const;

const PAGE_SIZE = 5;

/** "25 May 2025, 07:00 PM" from the stored DATE + TIME pair. */
function formatWhen(date: string | null, time: string | null): string {
    if (!date) return "--";

    const [y, m, d] = date.split("-").map(Number);
    // Built from parts, never `new Date("2026-05-25")` — that parses as UTC and
    // shows the previous day for anyone behind it.
    const local = new Date(y, (m || 1) - 1, d || 1);
    const stamp = `${String(local.getDate()).padStart(2, "0")} ${local.toLocaleString("en", {
        month: "short",
    })} ${local.getFullYear()}`;

    if (!time) return stamp;

    const [hh, mm] = time.split(":").map(Number);
    const suffix = hh >= 12 ? "PM" : "AM";
    const hour12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${stamp}, ${String(hour12).padStart(2, "0")}:${String(mm ?? 0).padStart(2, "0")} ${suffix}`;
}

/** The MAY / 25 chip in the Upcoming Events rail. */
function dateChip(date: string | null): { month: string; day: string } {
    if (!date) return { month: "--", day: "--" };
    const [y, m, d] = date.split("-").map(Number);
    const local = new Date(y, (m || 1) - 1, d || 1);
    return {
        month: local.toLocaleString("en", { month: "short" }).toUpperCase(),
        day: String(local.getDate()).padStart(2, "0"),
    };
}

/**
 * `useSearchParams` opts a route out of static prerendering unless it sits
 * behind a Suspense boundary, so the page is a thin shell around the real
 * component. The fallback matches the loaded header, which keeps the top of the
 * page from jumping as the boundary resolves.
 */
export default function MyEventsPage() {
    return (
        <Suspense
            fallback={
                <div className="flex flex-col gap-5">
                    <div>
                        <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">My Events</h1>
                        <p className="mt-1 text-[13.5px] text-muted-foreground">
                            Manage and track all your events in one place.
                        </p>
                    </div>
                    <Skeleton className="h-[92px] w-full rounded-xl" />
                    <Skeleton className="h-[320px] w-full rounded-xl" />
                </div>
            }
        >
            <MyEventsContent />
        </Suspense>
    );
}

function MyEventsContent() {
    // The top bar's search box navigates here with ?search=. Read as the INITIAL
    // value only: making it the source of truth would push a history entry per
    // keystroke and fight the debounce below.
    const searchParams = useSearchParams();
    const initialSearch = searchParams.get("search") ?? "";

    const [tab, setTab] = useState<TabValue>("all");
    const [category, setCategory] = useState("all");
    const [privacy, setPrivacy] = useState("all");
    const [sort, setSort] = useState("default");
    const [search, setSearch] = useState(initialSearch);
    const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
    const [page, setPage] = useState(1);
    const [pendingDelete, setPendingDelete] = useState<ClientEvent | null>(null);
    const [qrFor, setQrFor] = useState<ClientEvent | null>(null);

    // The search box hits the server, so it is debounced — a request per
    // keystroke would put six in flight for one word and let them race.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
        return () => clearTimeout(timer);
    }, [search]);

    // Searching again from the top bar while already on this page changes the
    // URL but not the component, so the initial state would go stale and the
    // box would keep showing the previous term.
    useEffect(() => { setSearch(initialSearch); }, [initialSearch]);

    // Any filter change resets to page 1, or filtering while on page 3 of a
    // longer list lands on an empty page that reads as "no events".
    useEffect(() => { setPage(1); }, [tab, category, privacy, sort, debouncedSearch]);

    const stats = useDashboardStats();
    const options = useEventOptions();
    const events = useClientEvents({
        status: tab,
        category_id: category === "all" ? null : Number(category),
        privacy: privacy === "all" ? undefined : privacy,
        sort: sort === "default" ? undefined : sort,
        search: debouncedSearch || undefined,
        page,
        limit: PAGE_SIZE,
    });
    // The rail is its own query, not a slice of the table: the table shows
    // whatever tab the user picked, and "what's next" must not change with it.
    const upcoming = useClientEvents({ status: "upcoming", limit: 3 });

    const remove = useDeleteEvent();

    const rows = events.data?.data ?? [];
    const pagination = events.data?.pagination;
    const totalPages = pagination?.totalPages ?? 1;
    const totalItems = pagination?.totalItems ?? 0;

    const authError =
        (events.error instanceof ApiError && events.error.isAuthError) ||
        (stats.error instanceof ApiError && stats.error.isAuthError);

    const guestsAvailable = stats.data?.guests_available ?? false;
    const activeFilters = (privacy !== "all" ? 1 : 0) + (sort !== "default" ? 1 : 0);

    const tiles = useMemo(() => {
        const s = stats.data;
        return [
            { label: "Total Events", value: s?.total_events ?? 0, caption: "All time", icon: faCalendarDays, tint: "text-primary", bg: "bg-primary/10", muted: false },
            { label: "Published", value: s?.published_events ?? 0, caption: "Live & scheduled", icon: faPaperPlane, tint: "text-success", bg: "bg-success/10", muted: false },
            { label: "Upcoming", value: s?.upcoming_next_30_days ?? 0, caption: "Next 30 days", icon: faClock, tint: "text-warning", bg: "bg-warning/10", muted: false },
            { label: "Completed", value: s?.past_events ?? 0, caption: "Past events", icon: faCircleCheck, tint: "text-accent", bg: "bg-accent/10", muted: false },
            {
                label: "Total Guests",
                value: s?.total_guests ?? 0,
                // Says which kind of zero this is. See the header comment.
                caption: s && !guestsAvailable ? "Not available yet" : "Across all events",
                icon: faUsers,
                tint: "text-info",
                bg: "bg-info/10",
                muted: !!s && !guestsAvailable,
            },
        ];
    }, [stats.data, guestsAvailable]);

    const categoryRows = options.data?.categories ?? [];

    return (
        <div className="flex flex-col gap-5">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">My Events</h1>
                    <p className="mt-1 text-[13.5px] text-muted-foreground">
                        Manage and track all your events in one place.
                    </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {/* The design's "All Events" dropdown, wired to the client's own
                        plan-scoped categories. It filters by category rather than by
                        status, so it does not duplicate the tabs below it. */}
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-10 w-full rounded-md text-[13px] sm:w-[160px]">
                            <SelectValue placeholder="All Events" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Events</SelectItem>
                            {categoryRows.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="relative min-w-0 sm:w-[210px]">
                        <FontAwesomeIcon
                            icon={faSearch}
                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 !size-[12px] text-muted-foreground"
                        />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search events..."
                            className="h-10 rounded-md pl-9 text-[13px]"
                        />
                    </div>

                    {/* Filter — a real Popover, not a decorative button. Privacy and
                        sort both go to the server; the badge shows how many are on,
                        so an active filter is never invisible behind a closed menu. */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className="h-10 shrink-0 rounded-md px-4 text-[13px] font-medium"
                            >
                                <FontAwesomeIcon icon={faSliders} className="mr-2 !size-[12px]" />
                                Filter
                                {activeFilters > 0 && (
                                    <Badge className="ml-2 h-4 min-w-4 px-1 text-[10px]">{activeFilters}</Badge>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-[250px] p-4">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                    <Label className="text-[12px] font-medium">Privacy</Label>
                                    <Select value={privacy} onValueChange={setPrivacy}>
                                        <SelectTrigger className="h-9 rounded-md text-[12.5px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PRIVACY_OPTIONS.map((o) => (
                                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-[12px] font-medium">Sort by</Label>
                                    <Select value={sort} onValueChange={setSort}>
                                        <SelectTrigger className="h-9 rounded-md text-[12.5px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {SORT_OPTIONS.map((o) => (
                                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Separator />

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={activeFilters === 0}
                                    onClick={() => { setPrivacy("all"); setSort("default"); }}
                                    className="h-8 text-[12px]"
                                >
                                    Reset filters
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {authError && (
                <Card className="border-warning/40 bg-warning/10 shadow-none py-0">
                    <CardContent className="flex items-start gap-3 p-4">
                        <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 !size-[13px] shrink-0 text-warning" />
                        <div>
                            <p className="text-[12.5px] font-semibold text-foreground">You are not signed in</p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                Your session has ended. Sign in again to carry on.
                            </p>
                            <SignInPrompt className="mt-2.5" />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/*
              Two columns for the whole screen, NOT stats-then-columns. In the
              design the Quick Actions card sits level with the stat tiles, which
              only happens if the rail is a sibling of the stats rather than
              something stacked underneath them.
            */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_264px]">
                <div className="flex min-w-0 flex-col gap-5">
                    {/* ── Stats ───────────────────────────────────────────── */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                        {tiles.map((tile) => (
                            <Card key={tile.label} className="border border-border shadow-none py-0">
                                <CardContent className="flex items-center gap-3.5 p-4">
                                    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", tile.bg)}>
                                        <FontAwesomeIcon icon={tile.icon} className={cn("!size-[15px]", tile.tint)} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[12.5px] font-medium text-muted-foreground">{tile.label}</p>
                                        {stats.isLoading ? (
                                            <Skeleton className="my-1 h-6 w-12" />
                                        ) : (
                                            // tabular-nums so the five figures align down the row
                                            <p
                                                className={cn(
                                                    "text-[22px] font-bold leading-tight tabular-nums",
                                                    tile.muted ? "text-muted-foreground/50" : "text-foreground"
                                                )}
                                            >
                                                {tile.value.toLocaleString()}
                                            </p>
                                        )}
                                        <p className="text-[11px] text-muted-foreground">{tile.caption}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* ── Event list ──────────────────────────────────────── */}
                    <Card className="min-w-0 gap-0 border border-border p-0 shadow-none">
                        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
                            <div className="overflow-x-auto border-b border-border px-2">
                                <TabsList variant="line" className="h-auto gap-0 p-0">
                                    {TABS.map((t) => (
                                        <TabsTrigger
                                            key={t.value}
                                            value={t.value}
                                            className="h-auto rounded-none px-4 py-3 text-[13px] data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:after:bg-primary data-[state=active]:after:opacity-100"
                                        >
                                            {t.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </div>
                        </Tabs>

                        <CardContent className="p-0">
                            {events.isLoading ? (
                                <div className="divide-y divide-border">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <div key={i} className="flex items-center gap-4 p-4">
                                            <Skeleton className="h-[74px] w-[104px] shrink-0 rounded-md" />
                                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                                                <Skeleton className="h-4 w-1/3" />
                                                <Skeleton className="h-3 w-1/2" />
                                                <Skeleton className="h-3 w-2/5" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : events.isError && !authError ? (
                                <div className="flex flex-col items-center gap-2 py-16 text-center">
                                    <FontAwesomeIcon icon={faTriangleExclamation} className="!size-[26px] text-warning/60" />
                                    <p className="text-[14px] font-semibold text-foreground">Could not load your events</p>
                                    <p className="text-[13px] text-muted-foreground">
                                        {events.error instanceof Error ? events.error.message : "Unknown error."}
                                    </p>
                                    <Button variant="outline" size="sm" className="mt-2 h-8 text-[12px]" onClick={() => events.refetch()}>
                                        Try again
                                    </Button>
                                </div>
                            ) : rows.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-16 text-center">
                                    <FontAwesomeIcon icon={faCalendarDays} className="!size-[26px] text-muted-foreground/40" />
                                    <p className="text-[14px] font-semibold text-foreground">No events here</p>
                                    <p className="text-[13px] text-muted-foreground">
                                        {debouncedSearch || category !== "all" || activeFilters > 0
                                            ? "Try a different search or filter."
                                            : tab === "all"
                                                ? "Create your first event to get started."
                                                : "Nothing in this tab yet."}
                                    </p>
                                    {!debouncedSearch && category === "all" && activeFilters === 0 && tab === "all" && (
                                        <Button asChild size="sm" className="mt-2 h-8 text-[12px]">
                                            <Link href="/dashboard/events/create">Create New Event</Link>
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <ul className="divide-y divide-border">
                                    {rows.map((event) => (
                                        <li key={event.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                                            <EventThumbnail
                                                themeId={event.theme_id}
                                                customImage={eventCustomImage(event)}
                                                name={event.name}
                                                primaryColor={event.primary_color}
                                                className="h-[74px] w-[104px]"
                                            />

                                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {/* break-words, never truncate — a long
                                                        name must wrap, not clip mid-word. */}
                                                    <h3 className="text-[14.5px] font-bold leading-snug text-foreground break-words">
                                                        {event.name}
                                                    </h3>
                                                    <Badge
                                                        variant="ghost"
                                                        className={cn("rounded px-2 py-0.5 text-[10.5px] font-semibold", STATUS_BADGE[event.derived_status])}
                                                    >
                                                        {STATUS_LABELS[event.derived_status]}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                                                    <FontAwesomeIcon icon={faCalendarDays} className="!size-[11px] shrink-0" />
                                                    <span className="break-words">
                                                        {formatWhen(event.start_date, event.start_time)}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                                                    <FontAwesomeIcon icon={faLocationDot} className="!size-[11px] shrink-0" />
                                                    {/* No venue field on the wizard yet, so this
                                                        reads "--", exactly as the design's own
                                                        draft row does. */}
                                                    <span className="break-words">{event.venue_name || "--"}</span>
                                                </div>

                                                <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                                                    <FontAwesomeIcon icon={faUsers} className="!size-[11px] shrink-0" />
                                                    <span>{guestsAvailable ? "0 Guests" : "-- Guests"}</span>
                                                </div>
                                            </div>

                                            {/* RSVP columns. Every figure is a dash until a
                                                guest module exists — a 0 here would read as
                                                "nobody replied", a different claim. */}
                                            <div className="flex shrink-0 items-start gap-5 lg:gap-7">
                                                {(["Going", "Pending", "Declined"] as const).map((label) => (
                                                    <div key={label} className="w-[56px] text-center">
                                                        <p className="text-[15px] font-bold leading-none tabular-nums text-muted-foreground/50">
                                                            --
                                                        </p>
                                                        <p className="mt-1.5 text-[11px] text-muted-foreground">{label}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Actions: the overflow menu sits above the
                                                button, right-aligned, as in the design. */}
                                            <div className="flex shrink-0 items-center gap-2 lg:w-[132px] lg:flex-col lg:items-end lg:gap-2.5">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            size="icon"
                                                            aria-label={`Actions for ${event.name}`}
                                                            className="h-8 w-8 rounded-md text-muted-foreground"
                                                        >
                                                            <FontAwesomeIcon icon={faEllipsisVertical} className="!size-[12px]" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-[170px]">
                                                        <DropdownMenuItem asChild className="text-[12.5px]">
                                                            <Link href={`/dashboard/events/${event.id}`}>View details</Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="text-[12.5px]" onClick={() => setQrFor(event)}>
                                                            Show QR code
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-[12.5px] text-destructive focus:text-destructive"
                                                            onClick={() => setPendingDelete(event)}
                                                        >
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>

                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 rounded-md border-primary/40 px-3 text-[12px] font-semibold text-primary hover:bg-primary/5 hover:text-primary"
                                                >
                                                    <Link href={`/dashboard/events/${event.id}`}>
                                                        {event.status === "draft" ? "Continue Editing" : "View Details"}
                                                    </Link>
                                                </Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {/* Pagination — server-driven, so the page buttons come
                                from the response rather than a hardcoded pair. */}
                            {totalItems > 0 && (
                                <>
                                    <Separator />
                                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-[12.5px] text-muted-foreground">
                                            Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, totalItems)} of{" "}
                                            {totalItems} events
                                        </p>
                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                aria-label="Previous page"
                                                className="h-8 w-8 rounded-md"
                                                disabled={page <= 1}
                                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            >
                                                <FontAwesomeIcon icon={faChevronLeft} className="!size-[11px]" />
                                            </Button>
                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                                                <Button
                                                    key={n}
                                                    variant={n === page ? "default" : "outline"}
                                                    size="icon"
                                                    aria-label={`Page ${n}`}
                                                    aria-current={n === page ? "page" : undefined}
                                                    className="h-8 w-8 rounded-md text-[12px]"
                                                    onClick={() => setPage(n)}
                                                >
                                                    {n}
                                                </Button>
                                            ))}
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                aria-label="Next page"
                                                className="h-8 w-8 rounded-md"
                                                disabled={page >= totalPages}
                                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                            >
                                                <FontAwesomeIcon icon={faChevronRight} className="!size-[11px]" />
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── Right rail ──────────────────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-5">
                    {/* Quick Actions. Only the first one exists; the other three are
                        shown disabled rather than linked, because sending someone
                        from a "Quick Action" to a coming-soon page is worse than
                        showing them it is not ready. */}
                    <Card className="border border-border shadow-none py-0">
                        <CardContent className="p-4">
                            <p className="mb-3 text-[13px] font-bold text-foreground">Quick Actions</p>
                            <ul className="flex flex-col">
                                <li>
                                    <Link
                                        href="/dashboard/events/create"
                                        className="flex items-center gap-2.5 rounded-md px-2 py-2.5 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/5"
                                    >
                                        <FontAwesomeIcon icon={faPlus} className="!size-[12px] shrink-0" />
                                        <span className="min-w-0 flex-1 break-words">Create New Event</span>
                                        <FontAwesomeIcon icon={faArrowRight} className="!size-[10px] shrink-0" />
                                    </Link>
                                </li>
                                {[
                                    { label: "Import Guests", icon: faFileImport },
                                    { label: "View RSVP Responses", icon: faSquareCheck },
                                    { label: "Browse Templates", icon: faLayerGroup },
                                ].map((action) => (
                                    <li key={action.label}>
                                        <div
                                            aria-disabled
                                            title="Not available yet"
                                            className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-2.5 text-[12.5px] text-muted-foreground/60"
                                        >
                                            <FontAwesomeIcon icon={action.icon} className="!size-[12px] shrink-0" />
                                            <span className="min-w-0 flex-1 break-words">{action.label}</span>
                                            <Badge variant="secondary" className="shrink-0 rounded px-1.5 py-0 text-[9px] font-semibold uppercase">
                                                Soon
                                            </Badge>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>

                    {/* Upcoming Events — real rows, soonest first. */}
                    <Card className="border border-border shadow-none py-0">
                        <CardContent className="p-4">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <p className="text-[13px] font-bold text-foreground">Upcoming Events</p>
                                <button
                                    onClick={() => { setTab("upcoming"); setCategory("all"); setSearch(""); }}
                                    className="shrink-0 text-[11.5px] font-semibold text-primary hover:underline"
                                >
                                    View All
                                </button>
                            </div>

                            {upcoming.isLoading ? (
                                <div className="flex flex-col gap-3">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <Skeleton key={i} className="h-12 w-full rounded-md" />
                                    ))}
                                </div>
                            ) : (upcoming.data?.data ?? []).length === 0 ? (
                                <p className="py-4 text-[12px] text-muted-foreground">Nothing scheduled yet.</p>
                            ) : (
                                <ul className="flex flex-col gap-3">
                                    {(upcoming.data?.data ?? []).map((event) => {
                                        const chip = dateChip(event.start_date);
                                        return (
                                            <li key={event.id} className="flex min-w-0 items-start gap-2.5">
                                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 leading-none">
                                                    <span className="text-[8.5px] font-bold uppercase text-primary">{chip.month}</span>
                                                    <span className="text-[13px] font-bold tabular-nums text-primary">{chip.day}</span>
                                                </span>
                                                <Link href={`/dashboard/events/${event.id}`} className="group min-w-0 flex-1">
                                                    <p className="text-[12.5px] font-semibold text-foreground break-words group-hover:text-primary">
                                                        {event.name}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground break-words">
                                                        {formatWhen(event.start_date, event.start_time)}
                                                    </p>
                                                    {event.venue_name && (
                                                        <p className="text-[11px] text-muted-foreground break-words">
                                                            {event.venue_name}
                                                        </p>
                                                    )}
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </CardContent>
                    </Card>

                    {/* Event Performance. The design's donut needs RSVP data, and
                        there is none — so this states that plainly instead of
                        drawing a chart of zeroes, which would look like real data
                        reporting that every guest declined. */}
                    <Card className="border border-border shadow-none py-0">
                        <CardContent className="p-4">
                            <p className="text-[13px] font-bold text-foreground">
                                Event Performance <span className="font-normal text-muted-foreground">(All Time)</span>
                            </p>

                            <div className="flex flex-col items-center gap-2 py-6 text-center">
                                <span className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                                    <FontAwesomeIcon icon={faChartPie} className="!size-[18px] text-muted-foreground/50" />
                                </span>
                                <p className="text-[12px] font-semibold text-foreground">No RSVP data yet</p>
                                <p className="text-[11px] text-muted-foreground break-words">
                                    Going, pending and declined counts appear here once guest responses are available.
                                </p>
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between pt-3">
                                <span className="text-[11.5px] text-muted-foreground">Total Responses</span>
                                <span className="text-[13px] font-bold tabular-nums text-muted-foreground/50">
                                    {stats.data?.rsvps_received ?? 0}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* ── QR dialog ───────────────────────────────────────────────── */}
            <Dialog open={!!qrFor} onOpenChange={(v) => { if (!v) setQrFor(null); }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FontAwesomeIcon icon={faQrcode} className="!size-[14px] text-primary" />
                            Event QR Code
                        </DialogTitle>
                        <DialogDescription className="break-words">
                            &ldquo;{qrFor?.name}&rdquo; &mdash; the code carries only your event&apos;s
                            encrypted id, so only this app can read it back — and it stays the same when you edit the event.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-center py-2">
                        <EventQr token={qrFor?.qr_token} qrStyle={qrFor?.qr_style} eventName={qrFor?.name} size={200} />
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Delete confirm ──────────────────────────────────────────── */}
            <Dialog
                open={!!pendingDelete}
                onOpenChange={(v) => { if (!v && !remove.isPending) setPendingDelete(null); }}
            >
                <DialogContent className="sm:max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle>Delete event?</DialogTitle>
                        <DialogDescription>
                            &ldquo;{pendingDelete?.name}&rdquo; will be removed from your events, and its
                            QR code will stop working.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            className="h-10 rounded-md text-[13px] font-medium"
                            disabled={remove.isPending}
                            onClick={() => setPendingDelete(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            className="h-10 rounded-md text-[13px] font-semibold"
                            disabled={remove.isPending}
                            onClick={() => {
                                if (!pendingDelete) return;
                                // onSettled, not onSuccess — a failed delete must
                                // close the dialog too, or the error toast lands
                                // behind a modal that will not go away.
                                remove.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) });
                            }}
                        >
                            {remove.isPending ? "Deleting..." : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
