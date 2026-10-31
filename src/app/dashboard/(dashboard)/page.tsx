"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCalendarDays,
    faUsers,
    faSquareCheck,
    faClock,
    faPlus,
    faSearch,
    faLocationDot,
    faEllipsisVertical,
    faChevronLeft,
    faChevronRight,
    faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useClientProfile } from "@/hooks/use-client-portal";
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
 * Client dashboard — every number and every card on this page comes from the
 * API. Nothing here is a constant any more.
 *
 *   greeting   GET /client/me            the signed-in client's own name
 *   tiles      GET /client/events/stats  counts derived server-side
 *   grid       GET /client/events        paginated, tab-filtered, searchable
 *
 * This is the summary view. The full list, with the five-state tabs and the
 * category filter, is /dashboard/events.
 *
 * TWO THINGS THAT LOOK LIKE PLACEHOLDERS AND ARE NOT:
 *
 *  1. Guests and RSVPs really are 0. There is no guest module in this system
 *     yet, so the API reports 0 with `guests_available: false` beside it — and
 *     the tiles say "Not available yet" rather than implying nobody has
 *     replied. A tile silently showing 0 cannot be told apart from a tile whose
 *     honest answer is 0; the flag is what makes the difference visible.
 *
 *  2. The card artwork is a theme gradient, not a missing image. Events carry a
 *     `theme_id` chosen in the wizard and no artwork upload exists yet.
 *
 * FILTERING AND PAGING ARE SERVER-SIDE. The old version filtered a six-row
 * constant in the browser; doing that against a paginated endpoint would filter
 * only the page you happen to be on.
 */

const TABS = [
    { label: "All Events", value: "all" },
    { label: "Upcoming", value: "upcoming" },
    // An event that has started is `live`, not `upcoming`. Without this tab it
    // would show under "All Events" and nowhere else.
    { label: "Live", value: "live" },
    { label: "Past", value: "past" },
    { label: "Drafts", value: "draft" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const STATUS_STYLES: Record<DerivedStatus, string> = {
    live: "bg-destructive/10 text-destructive",
    upcoming: "bg-success/15 text-success",
    past: "bg-foreground/70 text-background",
    draft: "bg-warning/20 text-warning",
    cancelled: "bg-destructive/15 text-destructive",
};

const STATUS_LABELS: Record<DerivedStatus, string> = {
    live: "Live",
    upcoming: "Upcoming",
    past: "Past",
    draft: "Draft",
    cancelled: "Cancelled",
};

const PAGE_SIZE = 6;

/** "25 May 2025, 07:00 PM" from the stored DATE + TIME pair. */
function formatWhen(date: string | null, time: string | null): string {
    if (!date) return "Date not set";

    const [y, m, d] = date.split("-").map(Number);
    // Built from parts, never `new Date("2026-05-25")` — that parses as UTC and
    // shows the previous day for anyone behind it.
    const local = new Date(y, (m || 1) - 1, d || 1);
    const day = String(local.getDate()).padStart(2, "0");
    const month = local.toLocaleString("en", { month: "short" });
    const stamp = `${day} ${month} ${local.getFullYear()}`;

    if (!time) return stamp;

    const [hh, mm] = time.split(":").map(Number);
    const suffix = hh >= 12 ? "PM" : "AM";
    const hour12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${stamp}, ${String(hour12).padStart(2, "0")}:${String(mm ?? 0).padStart(2, "0")} ${suffix}`;
}

export default function DashboardPage() {
    const [tab, setTab] = useState<TabValue>("all");
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);

    // The search box hits the server, so it is debounced — a request per
    // keystroke would put six in flight for one word and let them race.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
        return () => clearTimeout(timer);
    }, [search]);

    // Changing the filter must reset to page 1, or filtering while on page 3 of
    // a longer list lands on an empty page that reads as "no events".
    useEffect(() => { setPage(1); }, [tab, debouncedSearch]);

    const profile = useClientProfile();
    const stats = useDashboardStats();
    const events = useClientEvents({
        status: tab,
        search: debouncedSearch || undefined,
        page,
        limit: PAGE_SIZE,
    });

    const remove = useDeleteEvent();
    // Never delete straight from a menu click. Same pattern as the
    // event-categories module, and the reason is the same: the dropdown item is
    // two pixels from "View details".
    const [pendingDelete, setPendingDelete] = useState<ClientEvent | null>(null);

    const rows = events.data?.data ?? [];
    const pagination = events.data?.pagination;
    const totalPages = pagination?.totalPages ?? 1;
    const totalItems = pagination?.totalItems ?? 0;

    const authError =
        (events.error instanceof ApiError && events.error.isAuthError) ||
        (stats.error instanceof ApiError && stats.error.isAuthError);

    const firstName = profile.data?.name?.trim().split(/\s+/)[0];

    const tiles = useMemo(() => {
        const s = stats.data;
        return [
            {
                label: "Total Events",
                value: s?.total_events ?? 0,
                caption: "All time",
                icon: faCalendarDays,
                tint: "text-primary",
                bg: "bg-primary/10",
                unavailable: false,
            },
            {
                label: "Total Guests",
                value: s?.total_guests ?? 0,
                // Says which kind of zero this is. See the header comment.
                caption: s && !s.guests_available ? "Not available yet" : "All events",
                icon: faUsers,
                tint: "text-accent",
                bg: "bg-accent/10",
                unavailable: !!s && !s.guests_available,
            },
            {
                label: "RSVPs Received",
                value: s?.rsvps_received ?? 0,
                // Received = every Yes and No answer; the caption says how many were Yes.
                caption: s && !s.guests_available ? "Not available yet" : `${(s?.rsvp_going ?? 0).toLocaleString()} accepted`,
                icon: faSquareCheck,
                tint: "text-info",
                bg: "bg-info/10",
                unavailable: !!s && !s.guests_available,
            },
            {
                label: "Upcoming Events",
                value: s?.upcoming_next_30_days ?? 0,
                caption: "Next 30 days",
                icon: faClock,
                tint: "text-warning",
                bg: "bg-warning/10",
                unavailable: false,
            },
        ];
    }, [stats.data]);

    return (
        <div className="flex flex-col gap-6">
            {/* Greeting */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
                        {profile.isLoading ? (
                            <Skeleton className="h-7 w-[260px]" />
                        ) : (
                            <>
                                Welcome back{firstName ? `, ${firstName}` : ""}! <span aria-hidden>👋</span>
                            </>
                        )}
                    </h1>
                    <p className="mt-1 text-[13.5px] text-muted-foreground">
                        Here&rsquo;s what&rsquo;s happening with your events.
                    </p>
                </div>
                <Button asChild className="h-10 shrink-0 rounded-md px-4 text-[13px] font-semibold">
                    <Link href="/dashboard/events/create">
                        <FontAwesomeIcon icon={faPlus} className="mr-2 !size-[12px]" />
                        Create New Event
                    </Link>
                </Button>
            </div>

            {/* A 401 is the likely failure here: this panel has no login of its
                own and relies on a cookie set elsewhere. Naming it beats showing
                four empty tiles. */}
            {authError && (
                <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 !size-[13px] shrink-0 text-warning" />
                    <div>
                        <p className="text-[12.5px] font-semibold text-foreground">You are not signed in</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            Your session has ended. Sign in again to carry on.
                        </p>
                        <SignInPrompt className="mt-2.5" />
                    </div>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {tiles.map((tile) => (
                    <Card key={tile.label} className="border border-border shadow-none py-0">
                        <CardContent className="flex items-center gap-4 p-5">
                            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-md", tile.bg)}>
                                <FontAwesomeIcon icon={tile.icon} className={cn("!size-[16px]", tile.tint)} />
                            </span>
                            <div className="min-w-0">
                                {stats.isLoading ? (
                                    <Skeleton className="h-6 w-12" />
                                ) : (
                                    // tabular-nums so the four figures align down the row
                                    <p
                                        className={cn(
                                            "text-[24px] font-bold leading-none tabular-nums",
                                            tile.unavailable ? "text-muted-foreground/50" : "text-foreground"
                                        )}
                                    >
                                        {tile.value}
                                    </p>
                                )}
                                <p className="mt-1.5 text-[13px] font-medium text-foreground">{tile.label}</p>
                                <p className="text-[11.5px] text-muted-foreground">{tile.caption}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Tabs + search */}
            <div className="flex flex-col gap-3 border-b border-border pb-0 lg:flex-row lg:items-center lg:justify-between">
                {/* The shared Tabs primitive, not hand-rolled <button>s. The
                    first cut re-implemented the underline and the active colour
                    inline, which drifts from the rest of the app the moment a
                    token changes. */}
                <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="-mb-px overflow-x-auto">
                    <TabsList variant="line" className="h-auto gap-0 p-0">
                        {TABS.map((t) => (
                            <TabsTrigger
                                key={t.value}
                                value={t.value}
                                className="h-auto rounded-none px-4 py-2.5 text-[13px] data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:after:bg-primary data-[state=active]:after:opacity-100"
                            >
                                {t.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                <div className="flex items-center gap-2 pb-3">
                    <div className="relative min-w-0 flex-1 lg:w-[240px] lg:flex-none">
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
                </div>
            </div>

            {/* Event grid */}
            {events.isLoading ? (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i} className="overflow-hidden border border-border p-0 shadow-none">
                            <Skeleton className="aspect-[16/10] w-full rounded-none" />
                            <div className="flex flex-col gap-2.5 p-4">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/2" />
                                <Skeleton className="h-3 w-2/3" />
                            </div>
                        </Card>
                    ))}
                </div>
            ) : events.isError && !authError ? (
                <Card className="border border-border shadow-none py-0">
                    <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                        <FontAwesomeIcon icon={faTriangleExclamation} className="!size-[26px] text-warning/60" />
                        <p className="text-[14px] font-semibold text-foreground">Could not load your events</p>
                        <p className="text-[13px] text-muted-foreground">
                            {events.error instanceof Error ? events.error.message : "Unknown error."}
                        </p>
                        <Button variant="outline" size="sm" className="mt-2 h-8 text-[12px]" onClick={() => events.refetch()}>
                            Try again
                        </Button>
                    </CardContent>
                </Card>
            ) : rows.length === 0 ? (
                <Card className="border border-border shadow-none py-0">
                    <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                        <FontAwesomeIcon icon={faCalendarDays} className="!size-[26px] text-muted-foreground/40" />
                        <p className="text-[14px] font-semibold text-foreground">No events here</p>
                        <p className="text-[13px] text-muted-foreground">
                            {debouncedSearch
                                ? "Try a different search term."
                                : tab === "all"
                                    ? "Create your first event to get started."
                                    : "Nothing in this tab yet."}
                        </p>
                        {!debouncedSearch && tab === "all" && (
                            <Button asChild size="sm" className="mt-2 h-8 text-[12px]">
                                <Link href="/dashboard/events/create">Create New Event</Link>
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {rows.map((event: ClientEvent) => (
                        <Card
                            key={event.id}
                            className="overflow-hidden border border-border p-0 shadow-none transition-shadow hover:shadow-md"
                        >
                            {/* The event's own invitation artwork, drawn from its
                                theme. Shared with the My Events rows, so the two
                                screens cannot disagree about what an event looks
                                like — and the component picks light or dark ink,
                                which is what stopped the dark themes rendering as
                                blank rectangles. */}
                            <div className="relative">
                                <EventThumbnail
                                    themeId={event.theme_id}
                                    customImage={eventCustomImage(event)}
                                    name={event.name}
                                    primaryColor={event.primary_color}
                                    className="aspect-[16/10] w-full rounded-none border-0"
                                />
                                <Badge
                                    variant="ghost"
                                    className={cn(
                                        "absolute left-3 top-3 rounded px-2 py-1 text-[10.5px] font-semibold",
                                        STATUS_STYLES[event.derived_status]
                                    )}
                                >
                                    {STATUS_LABELS[event.derived_status]}
                                </Badge>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            aria-label={`Actions for ${event.name}`}
                                            className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/40"
                                        >
                                            <FontAwesomeIcon icon={faEllipsisVertical} className="!size-[12px]" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-[160px]">
                                        <DropdownMenuItem asChild className="text-[12.5px]">
                                            <Link href={`/dashboard/events/${event.id}`}>View details</Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="text-[12.5px] text-destructive focus:text-destructive"
                                            onClick={() => setPendingDelete(event)}
                                        >
                                            Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            <div className="flex flex-col gap-2.5 p-4">
                                {/* break-words, never truncate — a long event name must
                                    wrap rather than clip mid-word. */}
                                <h3 className="text-[14.5px] font-bold leading-snug text-foreground break-words">
                                    {event.name}
                                </h3>

                                <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                                    <FontAwesomeIcon icon={faCalendarDays} className="!size-[11px] shrink-0" />
                                    <span className="break-words">
                                        {formatWhen(event.start_date, event.start_time)}
                                    </span>
                                </div>

                                {/* The wizard does not collect a venue yet, so the
                                    row is hidden rather than printing a dash. */}
                                {event.venue_name && (
                                    <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                                        <FontAwesomeIcon icon={faLocationDot} className="!size-[11px] shrink-0" />
                                        <span className="break-words">{event.venue_name}</span>
                                    </div>
                                )}

                                <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
                                    <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
                                        {event.category?.name && (
                                            <Badge variant="secondary" className="max-w-[100px] truncate rounded text-[11px]">
                                                {event.category.name}
                                            </Badge>
                                        )}
                                    </div>
                                    <Button
                                        asChild
                                        variant="outline"
                                        size="sm"
                                        className="h-8 shrink-0 rounded-md border-primary/40 px-3 text-[12px] font-semibold text-primary hover:bg-primary/5 hover:text-primary"
                                    >
                                        <Link href={`/dashboard/events/${event.id}`}>
                                            {event.status === "draft" ? "Continue Editing" : "View Details"}
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Pagination — server-driven, so the page buttons come from the
                response rather than from a hardcoded pair. */}
            {totalItems > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            )}

            {/* Delete confirm. The QR code already issued for this event stops
                resolving once the row is gone, so this is worth a second look
                even though the delete is soft. */}
            <Dialog open={!!pendingDelete} onOpenChange={(v) => { if (!v && !remove.isPending) setPendingDelete(null); }}>
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
