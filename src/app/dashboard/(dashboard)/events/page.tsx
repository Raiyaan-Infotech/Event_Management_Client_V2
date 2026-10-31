"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCalendarDays,
    faPaperPlane,
    faClock,
    faCircleCheck,
    faUsers,
    faSearch,
    faLocationDot,
    faChevronLeft,
    faChevronRight,
    faTriangleExclamation,
    faQrcode,
    faArrowRight,
    faPen,
    faCopy,
    faShareNodes,
    faTrash,
    faCircle,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
    useDuplicateEvent,
    type ClientEvent,
    type DerivedStatus,
} from "@/hooks/use-client-events";
import { ApiError } from "@/lib/api-client";
import { SignInPrompt } from '@/components/common/sign-in-prompt';

/**
 * My Events — Jamal's V2 design (2026-10-31): full-width stat tiles, status
 * tabs with counts, and one card per event with its pre-event setup progress
 * and the actions View / Edit / Duplicate / Share / Delete.
 *
 *   tiles + tab counts   GET /client/events/stats   (guests = participants)
 *   rows                 GET /client/events          tab + category + sort + search
 *   category filter      GET /client/event-options   the plan-scoped categories
 *
 * ── PRE-EVENT SETUP IS DERIVED, NOT STORED ───────────────────────────────────
 * "7 of 10" is counted from what the event row already holds (see SETUP_STEPS),
 * so it moves on its own as the host fills things in — nothing to tick by hand.
 *
 * The design's mockup had an empty box after the progress panel; it is not
 * reproduced: the details column takes the free width instead.
 */

const TABS = [
    { label: "All Events", value: "all", stat: "total_events" },
    { label: "Upcoming", value: "upcoming", stat: "upcoming_events" },
    { label: "Live", value: "live", stat: "live_events" },
    { label: "Completed", value: "past", stat: "past_events" },
    { label: "Drafts", value: "draft", stat: "draft_events" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const STATUS_BADGE: Record<DerivedStatus, string> = {
    live: "bg-info/15 text-info",
    upcoming: "bg-success/15 text-success",
    past: "bg-muted text-muted-foreground",
    draft: "bg-warning/15 text-warning",
    cancelled: "bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<DerivedStatus, string> = {
    live: "Live",
    upcoming: "Published",
    past: "Completed",
    draft: "Draft",
    cancelled: "Cancelled",
};

const SORT_OPTIONS = [
    { value: "created_desc", label: "Latest" },
    { value: "date_asc", label: "Event date — soonest" },
    { value: "date_desc", label: "Event date — latest" },
    { value: "name_asc", label: "Name — A to Z" },
    { value: "name_desc", label: "Name — Z to A" },
] as const;

const PAGE_SIZE = 5;

/** The ten pre-event setup steps, each read straight off the event row. */
const SETUP_STEPS: { label: string; done: (e: ClientEvent) => boolean }[] = [
    { label: "Event category", done: (e) => !!e.event_category_id },
    { label: "Event name, date & time", done: (e) => !!e.name && !!e.start_date && !!e.start_time },
    { label: "Venue", done: (e) => !!e.venue_name },
    { label: "Mobile app home template", done: (e) => !!e.home_screen_template_id },
    { label: "App menus", done: (e) => (e.menu_ids?.length ?? 0) > 0 },
    { label: "Invitation design", done: (e) => !!e.theme_id },
    { label: "Cover image", done: (e) => !!(e.cover_image || e.custom_image) },
    { label: "Contact person", done: (e) => !!e.contact_phone },
    { label: "Guests added", done: (e) => (e.guest_count ?? 0) > 0 },
    { label: "Published", done: (e) => e.status !== "draft" },
];

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

export default function MyEventsPage() {
    return (
        <Suspense
            fallback={
                <div className="flex flex-col gap-5">
                    <div>
                        <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">My Events</h1>
                        <p className="mt-1 text-[13.5px] text-muted-foreground">
                            Create and manage your events. Track progress and set up all the features.
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
    const router = useRouter();
    // The top bar's search box navigates here with ?search= (initial value only).
    const searchParams = useSearchParams();
    const initialSearch = searchParams.get("search") ?? "";

    const [tab, setTab] = useState<TabValue>("all");
    const [category, setCategory] = useState("all");
    const [sort, setSort] = useState<string>("created_desc");
    const [search, setSearch] = useState(initialSearch);
    const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
    const [page, setPage] = useState(1);
    const [pendingDelete, setPendingDelete] = useState<ClientEvent | null>(null);
    const [shareFor, setShareFor] = useState<ClientEvent | null>(null);

    // Debounced: a request per keystroke would race.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
        return () => clearTimeout(timer);
    }, [search]);
    useEffect(() => { setSearch(initialSearch); }, [initialSearch]);
    // Any filter change goes back to page 1.
    useEffect(() => { setPage(1); }, [tab, category, sort, debouncedSearch]);

    const stats = useDashboardStats();
    const options = useEventOptions();
    const events = useClientEvents({
        status: tab,
        category_id: category === "all" ? null : Number(category),
        sort,
        search: debouncedSearch || undefined,
        page,
        limit: PAGE_SIZE,
    });

    const remove = useDeleteEvent();
    const duplicate = useDuplicateEvent((copy) => router.push(`/dashboard/events/${copy.id}/edit`));

    const rows = events.data?.data ?? [];
    const pagination = events.data?.pagination;
    const totalPages = pagination?.totalPages ?? 1;
    const totalItems = pagination?.totalItems ?? 0;

    const authError =
        (events.error instanceof ApiError && events.error.isAuthError) ||
        (stats.error instanceof ApiError && stats.error.isAuthError);

    const tiles = useMemo(() => {
        const s = stats.data;
        return [
            { label: "Total Events", value: s?.total_events ?? 0, caption: "All time", icon: faCalendarDays, tint: "text-primary", bg: "bg-primary/10" },
            { label: "Published", value: s?.published_events ?? 0, caption: "Live & scheduled", icon: faPaperPlane, tint: "text-success", bg: "bg-success/10" },
            { label: "Upcoming", value: s?.upcoming_next_30_days ?? 0, caption: "Next 30 days", icon: faClock, tint: "text-warning", bg: "bg-warning/10" },
            { label: "Completed", value: s?.past_events ?? 0, caption: "Past events", icon: faCircleCheck, tint: "text-foreground/70", bg: "bg-muted" },
            { label: "Total Guests", value: s?.total_guests ?? 0, caption: "Across all events", icon: faUsers, tint: "text-info", bg: "bg-info/10" },
        ];
    }, [stats.data]);

    const tabCount = (stat: (typeof TABS)[number]["stat"]) => {
        const value = (stats.data as Record<string, unknown> | undefined)?.[stat];
        return typeof value === "number" ? value : null;
    };

    const categoryRows = options.data?.categories ?? [];

    return (
        <div className="flex flex-col gap-5">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">My Events</h1>
                    <p className="mt-1 text-[13.5px] text-muted-foreground">
                        Create and manage your events. Track progress and set up all the features.
                    </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative min-w-0 sm:w-[230px]">
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
                    {/* "All Events" — the client's own plan-scoped categories. */}
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-10 w-full rounded-md text-[13px] sm:w-[150px]">
                            <SelectValue placeholder="All Events" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Events</SelectItem>
                            {categoryRows.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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

            {/* ── Stats ───────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
                                    <p className="text-[22px] font-bold leading-tight tabular-nums text-foreground">
                                        {tile.value.toLocaleString()}
                                    </p>
                                )}
                                <p className="text-[11px] text-muted-foreground">{tile.caption}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* ── Tabs + sort ─────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 border-b border-border sm:flex-row sm:items-end sm:justify-between">
                <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="min-w-0">
                    <div className="overflow-x-auto">
                        <TabsList variant="line" className="h-auto gap-0 p-0">
                            {TABS.map((t) => {
                                const count = tabCount(t.stat);
                                return (
                                    <TabsTrigger
                                        key={t.value}
                                        value={t.value}
                                        className="h-auto rounded-none px-4 py-3 text-[13px] data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:after:bg-primary data-[state=active]:after:opacity-100"
                                    >
                                        {t.label}
                                        {count !== null ? ` (${count})` : ""}
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>
                    </div>
                </Tabs>
                <div className="flex shrink-0 items-center gap-2 pb-2">
                    <span className="text-[12px] text-muted-foreground">Sort by</span>
                    <Select value={sort} onValueChange={setSort}>
                        <SelectTrigger className="h-9 w-[170px] rounded-md text-[12.5px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {SORT_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* ── Event cards ─────────────────────────────────────────────── */}
            {events.isLoading ? (
                <div className="flex flex-col gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-[136px] w-full rounded-xl" />
                    ))}
                </div>
            ) : events.isError && !authError ? (
                <Card className="border border-border shadow-none">
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
                <Card className="border border-border shadow-none">
                    <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                        <FontAwesomeIcon icon={faCalendarDays} className="!size-[26px] text-muted-foreground/40" />
                        <p className="text-[14px] font-semibold text-foreground">No events here</p>
                        <p className="text-[13px] text-muted-foreground">
                            {debouncedSearch || category !== "all"
                                ? "Try a different search or filter."
                                : tab === "all"
                                    ? "Create your first event to get started."
                                    : "Nothing in this tab yet."}
                        </p>
                        {!debouncedSearch && category === "all" && tab === "all" && (
                            <Button asChild size="sm" className="mt-2 h-8 text-[12px]">
                                <Link href="/dashboard/events/create">Create New Event</Link>
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <ul className="flex flex-col gap-3">
                    {rows.map((event) => (
                        <EventRow
                            key={event.id}
                            event={event}
                            duplicating={duplicate.isPending && duplicate.variables === event.id}
                            onDuplicate={() => duplicate.mutate(event.id)}
                            onShare={() => setShareFor(event)}
                            onDelete={() => setPendingDelete(event)}
                        />
                    ))}
                </ul>
            )}

            {/* ── Pagination ──────────────────────────────────────────────── */}
            {totalItems > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[12.5px] text-muted-foreground">
                        Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, totalItems)} of {totalItems} events
                    </p>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="outline" size="icon" aria-label="Previous page" className="h-8 w-8 rounded-md"
                                disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                                variant="outline" size="icon" aria-label="Next page" className="h-8 w-8 rounded-md"
                                disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            >
                                <FontAwesomeIcon icon={faChevronRight} className="!size-[11px]" />
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Share (QR) ──────────────────────────────────────────────── */}
            <Dialog open={!!shareFor} onOpenChange={(v) => { if (!v) setShareFor(null); }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FontAwesomeIcon icon={faQrcode} className="!size-[14px] text-primary" />
                            Share Event
                        </DialogTitle>
                        <DialogDescription className="break-words">
                            Guests scan this code in the Event Invite app to open &ldquo;{shareFor?.name}&rdquo;.
                            It stays the same when you edit the event.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-center py-2">
                        <EventQr token={shareFor?.qr_token} qrStyle={shareFor?.qr_style} eventName={shareFor?.name} size={200} />
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
                                // onSettled: a failed delete must close the dialog too.
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

// ── One event card ──────────────────────────────────────────────────────────

function EventRow({
    event,
    duplicating,
    onDuplicate,
    onShare,
    onDelete,
}: {
    event: ClientEvent;
    duplicating: boolean;
    onDuplicate: () => void;
    onShare: () => void;
    onDelete: () => void;
}) {
    const steps = SETUP_STEPS.map((s) => ({ label: s.label, done: s.done(event) }));
    const done = steps.filter((s) => s.done).length;
    const percent = Math.round((done / steps.length) * 100);
    const complete = done === steps.length;
    const guests = event.guest_count ?? 0;
    const confirmed = event.confirmed_count ?? 0;

    return (
        <li className="grid min-w-0 grid-cols-1 items-center gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-[96px_minmax(0,1fr)] xl:grid-cols-[96px_minmax(0,1fr)_minmax(250px,300px)_124px]">
            <EventThumbnail
                themeId={event.theme_id}
                customImage={eventCustomImage(event)}
                name={event.name}
                primaryColor={event.primary_color}
                className="h-[104px] w-[96px] rounded-lg"
            />

            {/* Details */}
            <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14.5px] font-bold leading-snug text-foreground break-words">{event.name}</h3>
                    <Badge
                        variant="ghost"
                        className={cn("rounded px-2 py-0.5 text-[10.5px] font-semibold", STATUS_BADGE[event.derived_status])}
                    >
                        {STATUS_LABELS[event.derived_status]}
                    </Badge>
                </div>
                <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <FontAwesomeIcon icon={faCalendarDays} className="!size-[11px] shrink-0" />
                    <span className="break-words">{formatWhen(event.start_date, event.start_time)}</span>
                </p>
                <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <FontAwesomeIcon icon={faLocationDot} className="!size-[11px] shrink-0" />
                    <span className="break-words">{event.venue_name || "Venue not set"}</span>
                </p>
                <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <FontAwesomeIcon icon={faUsers} className="!size-[11px] shrink-0" />
                    <span>
                        {guests.toLocaleString()} Guest{guests === 1 ? "" : "s"} ({confirmed.toLocaleString()} Confirmed)
                    </span>
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {event.category?.name ? (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {event.category.name}
                        </span>
                    ) : null}
                    <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                        {event.privacy}
                    </span>
                </div>
            </div>

            {/* Pre-event setup */}
            <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3 md:col-span-2 xl:col-span-1">
                <ProgressRing percent={percent} complete={complete} />
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-foreground">{done} of {steps.length}</p>
                    <p className="text-[11.5px] text-muted-foreground">Pre-Event Setup Completed</p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn("h-full rounded-full", complete ? "bg-success" : "bg-primary")}
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                    <Popover>
                        <PopoverTrigger asChild>
                            <button type="button" className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
                                View Setup Details
                                <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[260px] p-3">
                            <p className="mb-2 text-[12.5px] font-bold text-foreground">Pre-Event Setup</p>
                            <ul className="flex flex-col gap-1.5">
                                {steps.map((s) => (
                                    <li key={s.label} className="flex items-center gap-2 text-[12px]">
                                        <FontAwesomeIcon
                                            icon={s.done ? faCircleCheck : faCircle}
                                            className={cn("!size-[12px] shrink-0", s.done ? "text-success" : "text-muted-foreground/30")}
                                        />
                                        <span className={s.done ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                                    </li>
                                ))}
                            </ul>
                            {!complete && (
                                <>
                                    <Separator className="my-2.5" />
                                    <Button asChild size="sm" className="h-8 w-full text-[12px]">
                                        <Link href={`/dashboard/events/${event.id}/edit`}>Continue setup</Link>
                                    </Button>
                                </>
                            )}
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 md:col-span-2 xl:col-span-1 xl:grid-cols-1">
                <Button asChild variant="outline" size="sm" className="h-7 justify-start border-primary/50 text-[12px] font-semibold text-primary hover:bg-primary/5 hover:text-primary">
                    <Link href={`/dashboard/events/${event.id}`}>
                        <FontAwesomeIcon icon={faArrowRight} className="!size-[10px]" />
                        View Event
                    </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-7 justify-start text-[12px]">
                    <Link href={`/dashboard/events/${event.id}/edit`}>
                        <FontAwesomeIcon icon={faPen} className="!size-[10px]" />
                        Edit Event
                    </Link>
                </Button>
                <Button variant="outline" size="sm" className="h-7 justify-start text-[12px]" disabled={duplicating} onClick={onDuplicate}>
                    <FontAwesomeIcon icon={faCopy} className="!size-[10px]" />
                    {duplicating ? "Duplicating..." : "Duplicate"}
                </Button>
                <Button variant="outline" size="sm" className="h-7 justify-start text-[12px]" onClick={onShare}>
                    <FontAwesomeIcon icon={faShareNodes} className="!size-[10px]" />
                    Share
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 justify-start text-[12px] text-destructive hover:bg-destructive/5 hover:text-destructive"
                    onClick={onDelete}
                >
                    <FontAwesomeIcon icon={faTrash} className="!size-[10px]" />
                    Delete
                </Button>
            </div>
        </li>
    );
}

function ProgressRing({ percent, complete }: { percent: number; complete: boolean }) {
    const r = 26;
    const c = 2 * Math.PI * r;
    return (
        <div className="relative h-[64px] w-[64px] shrink-0">
            <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
                <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
                <circle
                    cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
                    className={complete ? "stroke-success" : "stroke-primary"}
                    strokeDasharray={c}
                    strokeDashoffset={c - (c * percent) / 100}
                />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-[13px] font-bold text-foreground">{percent}%</span>
        </div>
    );
}
