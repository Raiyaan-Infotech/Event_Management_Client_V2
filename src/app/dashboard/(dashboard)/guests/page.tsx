"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faUsers,
    faCircleCheck,
    faClock,
    faXmark,
    faUserClock,
    faSearch,
    faSliders,
    faDownload,
    faEllipsisVertical,
    faChevronLeft,
    faChevronRight,
    faUserPlus,
    faFileImport,
    faPeopleGroup,
    faPaperPlane,
    faArrowRight,
    faLightbulb,
    faTriangleExclamation,
    faEnvelope,
    faCheck,
    faMinus,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
    useGuests, useGuestStats, useAllGuestGroups, useDeleteGuest,
    useBulkGuests, useExportGuests,
    type Guest, type GuestTab,
} from "@/hooks/use-guests";
import { ApiError } from "@/lib/api-client";
import { useClientEvents } from "@/hooks/use-client-events";
import { GUEST_STATUS_LABELS, type GuestStatus } from "@/hooks/use-guests";
import { SignInPrompt } from '@/components/common/sign-in-prompt';
import { useDateFormatter } from '@/hooks/use-client-settings';

/**
 * Guests — the module's list screen.
 *
 * `/dashboard/guests` had no page and fell through to the `[...slug]`
 * "coming soon" catch-all, which is why the sidebar entry appeared to do
 * nothing.
 *
 * ── GUESTS ARE PER EVENT (V2, 2026-10-31) ───────────────────────────────────
 * Same as the mobile app: pick an event, and its guests show with their status
 * there — Not Invited, Invited, Pending, Confirmed, Declined (computed by the
 * server from the invitation time and the guest's RSVP). New and imported
 * guests go to the selected event (?event= on the Add / Import pages).
 */

const STATUS_ORDER: GuestStatus[] = ["added", "invited", "pending", "confirmed", "declined"];

const TABS: { label: string; value: GuestTab }[] = [
    { label: "All Guests", value: "all" },
    ...STATUS_ORDER.map((st) => ({ label: GUEST_STATUS_LABELS[st], value: st as GuestTab })),
];

const STATUS_PILL: Record<GuestStatus, string> = {
    added: "bg-muted text-muted-foreground",
    invited: "bg-info/15 text-info",
    pending: "bg-warning/15 text-warning",
    confirmed: "bg-success/15 text-success",
    declined: "bg-destructive/10 text-destructive",
};

const PAGE_SIZE = 8;


function initialsOf(name: string | undefined): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function GuestsPage() {
    // Dates follow the client's own Date Format / Time Zone preference.
    const fmt = useDateFormatter();
    const [tab, setTab] = useState<GuestTab>("all");
    // The event whose guests are shown. From ?event= when given, else the first.
    const [eventId, setEventId] = useState<string>("");
    const events = useClientEvents({ status: "all", limit: 100 });
    const eventRows = useMemo(() => events.data?.data ?? [], [events.data]);
    useEffect(() => {
        if (eventId || eventRows.length === 0) return;
        const wanted = new URLSearchParams(window.location.search).get("event");
        const found = eventRows.find((e) => String(e.id) === wanted);
        setEventId(String((found ?? eventRows[0]).id));
    }, [eventRows, eventId]);
    const eventNum = eventId ? Number(eventId) : null;
    const [groupId, setGroupId] = useState("all");
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<number[]>([]);
    const [pendingDelete, setPendingDelete] = useState<Guest | null>(null);
    const [bulkDelete, setBulkDelete] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
        return () => clearTimeout(timer);
    }, [search]);

    // Any filter change resets the page AND the selection — keeping a selection
    // across a filter change means bulk-deleting rows that are no longer on
    // screen, which is the worst possible surprise.
    useEffect(() => { setPage(1); setSelected([]); }, [tab, groupId, debouncedSearch, eventId]);

    const params = useMemo(() => ({
        event_id: eventNum,
        status: tab,
        group_id: groupId === "all" ? null : groupId,
        search: debouncedSearch || undefined,
        page,
        limit: PAGE_SIZE,
    }), [eventNum, tab, groupId, debouncedSearch, page]);

    const guests = useGuests(params);
    const stats = useGuestStats(eventNum);
    const groups = useAllGuestGroups();

    const remove = useDeleteGuest();
    const bulk = useBulkGuests();
    const exportGuests = useExportGuests();

    const rows = guests.data?.data ?? [];
    const pagination = guests.data?.pagination;
    const totalPages = pagination?.totalPages ?? 1;
    const totalItems = pagination?.totalItems ?? 0;

    const authError =
        (guests.error instanceof ApiError && guests.error.isAuthError) ||
        (stats.error instanceof ApiError && stats.error.isAuthError);

    const allOnPageSelected = rows.length > 0 && rows.every((g) => selected.includes(g.id));
    const someSelected = selected.length > 0;

    const toggleAll = () => {
        // Only the CURRENT page — a header checkbox that silently selects 1,248
        // rows across 156 pages is how people delete their guest list by
        // accident.
        setSelected(allOnPageSelected ? [] : rows.map((g) => g.id));
    };

    const toggleOne = (id: number) => {
        setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
    };

    const s = stats.data;
    const count = (st: GuestStatus) => s?.statuses?.[st] ?? 0;
    const tiles = [
        { label: "Total Guests", value: s?.total_guests ?? 0, caption: "In this event", icon: faUsers, color: "#7C5AED", bg: "bg-[#7C5AED]/10" },
        { label: "Invited", value: count("invited"), caption: "Invitation sent", icon: faPaperPlane, color: "#3B82F6", bg: "bg-[#3B82F6]/10" },
        { label: "Pending", value: count("pending"), caption: "Waiting for a reply", icon: faClock, color: "#F59E0B", bg: "bg-[#F59E0B]/10" },
        { label: "Confirmed", value: count("confirmed"), caption: "Joined and said Yes", icon: faUserClock, color: "#22C55E", bg: "bg-[#22C55E]/10" },
        { label: "Declined", value: count("declined"), caption: "Said No", icon: faPeopleGroup, color: "#EF4444", bg: "bg-[#EF4444]/10" },
    ];
    const withEvent = (href: string) => (eventId ? `${href}?event=${eventId}` : href);

    const activeFilters = groupId !== "all" ? 1 : 0;

    return (
        <div className="flex flex-col gap-5">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">Guests</h1>
                    <p className="mt-1 text-[13.5px] text-muted-foreground">
                        Guests are added to one event, and their status follows the invitation and their RSVP.
                    </p>
                </div>
                {/* The event whose guests are shown — as in the app. */}
                <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[12.5px] font-medium text-muted-foreground">Event</span>
                    <Select value={eventId} onValueChange={setEventId} disabled={eventRows.length === 0}>
                        <SelectTrigger className="h-10 w-full rounded-md text-[13px] lg:w-[260px]">
                            <SelectValue placeholder={events.isLoading ? "Loading events..." : "No events yet"} />
                        </SelectTrigger>
                        <SelectContent>
                            {eventRows.map((e) => (
                                <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {!events.isLoading && eventRows.length === 0 && (
                <Card className="border border-border py-0 shadow-none">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <p className="text-[13px] text-muted-foreground">Guests belong to an event. Create an event first.</p>
                        <Button asChild size="sm" className="h-8 text-[12px]">
                            <Link href="/dashboard/events/create">Create Event</Link>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {authError && (
                <Card className="border-warning/40 bg-warning/10 py-0 shadow-none">
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

            {/* ── Five tiles ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                {tiles.map((tile) => (
                    <Card key={tile.label} className="min-w-0 border border-border py-0 shadow-none">
                        <CardContent className="flex items-center gap-3.5 p-4">
                            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", tile.bg)}>
                                <FontAwesomeIcon icon={tile.icon} className="!size-[15px]" style={{ color: tile.color }} />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[12.5px] font-medium text-muted-foreground break-words">{tile.label}</p>
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

            {/* ── Filter bar ──────────────────────────────────────────────── */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger className="h-10 w-full rounded-md text-[13px] lg:w-[180px]">
                        <SelectValue placeholder="All Groups" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Groups</SelectItem>
                        {/* A real filter, not a blank — "0" means group_id IS NULL. */}
                        <SelectItem value="0">Ungrouped</SelectItem>
                        {(groups.data ?? []).map((g) => (
                            <SelectItem key={g.id} value={String(g.id)}>
                                {g.name} ({g.members_count})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="relative min-w-0 flex-1">
                    <FontAwesomeIcon
                        icon={faSearch}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 !size-[12px] text-muted-foreground"
                    />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search guests by name, email or phone..."
                        className="h-10 rounded-md pl-9 text-[13px]"
                    />
                </div>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="h-10 shrink-0 rounded-md px-4 text-[13px] font-medium">
                            <FontAwesomeIcon icon={faSliders} className="mr-2 !size-[12px]" />
                            Filters
                            {activeFilters > 0 && (
                                <Badge className="ml-2 h-4 min-w-4 px-1 text-[10px]">{activeFilters}</Badge>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[240px] p-4">
                        <div className="flex flex-col gap-3">
                            <Label className="text-[12px] font-medium">Active filters</Label>
                            <p className="text-[11.5px] text-muted-foreground">
                                {activeFilters === 0
                                    ? "Showing every guest on your account."
                                    : "The group filter is applied above."}
                            </p>
                            <Separator />
                            <Button
                                variant="ghost" size="sm"
                                disabled={activeFilters === 0 && !search}
                                onClick={() => { setGroupId("all"); setSearch(""); }}
                                className="h-8 text-[12px]"
                            >
                                Reset filters
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>

                <Button
                    variant="outline"
                    disabled={exportGuests.isPending || totalItems === 0}
                    onClick={() => exportGuests.mutate(params)}
                    className="h-10 shrink-0 rounded-md border-primary/40 px-4 text-[13px] font-semibold text-primary hover:bg-primary/5 hover:text-primary"
                >
                    <FontAwesomeIcon icon={faDownload} className="mr-2 !size-[12px]" />
                    {exportGuests.isPending ? "Exporting..." : "Export"}
                </Button>
            </div>

            {/* ── Table + rail ────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_264px]">
                <Card className="min-w-0 gap-0 border border-border p-0 shadow-none">
                    <Tabs value={tab} onValueChange={(v) => setTab(v as GuestTab)}>
                        <div className="overflow-x-auto border-b border-border px-2">
                            <TabsList variant="line" className="h-auto gap-0 p-0">
                                {TABS.map((t) => (
                                    <TabsTrigger
                                        key={t.value}
                                        value={t.value}
                                        className="h-auto rounded-none px-4 py-3 text-[13px] data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:after:bg-primary data-[state=active]:after:opacity-100"
                                    >
                                        {t.label}
                                        {s ? ` (${t.value === "all" ? s.total_guests ?? 0 : count(t.value as GuestStatus)})` : ""}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </div>
                    </Tabs>

                    {/* Bulk bar — only present when something is selected, so it
                        never takes space it has no use for. */}
                    {someSelected && (
                        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-4 py-2.5">
                            <span className="text-[12.5px] font-semibold text-foreground">
                                {selected.length} selected
                            </span>
                            <Separator orientation="vertical" className="h-4" />
                            <Select
                                onValueChange={(v) => bulk.mutate(
                                    { guest_ids: selected, action: "group", value: v === "none" ? null : v },
                                    { onSuccess: () => setSelected([]) }
                                )}
                            >
                                <SelectTrigger className="h-8 w-[150px] rounded-md text-[12px]">
                                    <SelectValue placeholder="Move to group" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Ungrouped</SelectItem>
                                    {(groups.data ?? []).map((g) => (
                                        <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                variant="ghost" size="sm"
                                onClick={() => bulk.mutate(
                                    { guest_ids: selected, action: "invite" },
                                    { onSuccess: () => setSelected([]) }
                                )}
                                className="h-8 text-[12px] text-primary hover:text-primary"
                            >
                                Mark as Invited
                            </Button>
                            <Button
                                variant="ghost" size="sm"
                                onClick={() => setBulkDelete(true)}
                                className="h-8 text-[12px] text-destructive hover:text-destructive"
                            >
                                Delete
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setSelected([])} className="h-8 text-[12px]">
                                Clear
                            </Button>
                        </div>
                    )}

                    <CardContent className="p-0">
                        {guests.isLoading ? (
                            <div className="divide-y divide-border">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-3 p-4">
                                        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                            <Skeleton className="h-3.5 w-1/4" />
                                            <Skeleton className="h-3 w-1/3" />
                                        </div>
                                        <Skeleton className="h-6 w-20 shrink-0" />
                                    </div>
                                ))}
                            </div>
                        ) : guests.isError && !authError ? (
                            <div className="flex flex-col items-center gap-2 py-16 text-center">
                                <FontAwesomeIcon icon={faTriangleExclamation} className="!size-[26px] text-warning/60" />
                                <p className="text-[14px] font-semibold text-foreground">Could not load your guests</p>
                                <p className="text-[13px] text-muted-foreground">
                                    {guests.error instanceof Error ? guests.error.message : "Unknown error."}
                                </p>
                                <Button variant="outline" size="sm" className="mt-2 h-8 text-[12px]" onClick={() => guests.refetch()}>
                                    Try again
                                </Button>
                            </div>
                        ) : rows.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-16 text-center">
                                <FontAwesomeIcon icon={faUsers} className="!size-[26px] text-muted-foreground/40" />
                                <p className="text-[14px] font-semibold text-foreground">No guests here</p>
                                <p className="max-w-sm text-[13px] text-muted-foreground">
                                    {debouncedSearch || activeFilters > 0
                                        ? "Try a different search or filter."
                                        : tab === "all"
                                            ? "Add your first guest, or import a list from a CSV."
                                            : "Nothing in this tab yet."}
                                </p>
                                {!debouncedSearch && activeFilters === 0 && tab === "all" && (
                                    <div className="mt-2 flex flex-wrap justify-center gap-2">
                                        <Button asChild size="sm" className="h-8 text-[12px]">
                                            <Link href={withEvent("/dashboard/guests/add")}>Add Guest</Link>
                                        </Button>
                                        <Button asChild variant="outline" size="sm" className="h-8 text-[12px]">
                                            <Link href={withEvent("/dashboard/guests/import")}>Import Guests</Link>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[860px] border-collapse">
                                    <thead>
                                        <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                                            <th className="w-10 py-3 pl-4">
                                                <Checkbox
                                                    checked={allOnPageSelected}
                                                    onCheckedChange={toggleAll}
                                                    aria-label="Select all guests on this page"
                                                />
                                            </th>
                                            <th className="py-3 text-left font-medium">Guest</th>
                                            <th className="py-3 text-left font-medium">Group</th>
                                            <th className="py-3 text-left font-medium">Status</th>
                                            <th className="py-3 text-left font-medium">Added On</th>
                                            <th className="py-3 pr-4 text-right font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((guest) => {
                                            return (
                                                <tr key={guest.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                                                    <td className="py-3 pl-4 align-top">
                                                        <Checkbox
                                                            checked={selected.includes(guest.id)}
                                                            onCheckedChange={() => toggleOne(guest.id)}
                                                            aria-label={`Select ${guest.name}`}
                                                        />
                                                    </td>

                                                    <td className="py-3 pr-3 align-top">
                                                        <div className="flex min-w-0 items-center gap-2.5">
                                                            <Avatar className="h-9 w-9 shrink-0">
                                                                <AvatarFallback className="bg-primary/10 text-[11px] font-bold text-primary">
                                                                    {initialsOf(guest.name)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="min-w-0">
                                                                {/*
                                                                  The NAME goes to the PERSON,
                                                                  matching the RSVP list and the
                                                                  group members table. Edit guest
                                                                  stays in the row menu — the
                                                                  form is a different question
                                                                  from the profile.

                                                                  break-words, never truncate.
                                                                */}
                                                                <Link
                                                                    href={`/dashboard/guests/${guest.id}/profile`}
                                                                    title={`View ${guest.name}'s profile`}
                                                                    className="block py-1.5 text-[12.5px] font-semibold text-foreground break-words hover:text-primary hover:underline"
                                                                >
                                                                    {guest.name}
                                                                </Link>
                                                                <p className="text-[11px] text-muted-foreground break-all">
                                                                    {guest.email}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="py-3 pr-3 align-top">
                                                        {guest.group ? (
                                                            <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground">
                                                                <span
                                                                    className="h-2 w-2 shrink-0 rounded-full"
                                                                    style={{ background: guest.group.color ?? "#CBD5E1" }}
                                                                />
                                                                {guest.group.name}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[12px] text-muted-foreground">—</span>
                                                        )}
                                                    </td>

                                                    <td className="py-3 pr-3 align-top">
                                                        {guest.status ? (
                                                            <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", STATUS_PILL[guest.status])}>
                                                                {GUEST_STATUS_LABELS[guest.status]}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[12px] text-muted-foreground">—</span>
                                                        )}
                                                    </td>

                                                    <td className="py-3 pr-3 align-top text-[12px] text-muted-foreground">
                                                        {fmt(guest.created_at)}
                                                    </td>

                                                    <td className="py-3 pr-4 align-top">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button
                                                                        variant="ghost" size="icon"
                                                                        aria-label={`Actions for ${guest.name}`}
                                                                        className="h-8 w-8 rounded-md text-muted-foreground"
                                                                    >
                                                                        <FontAwesomeIcon icon={faEllipsisVertical} className="!size-[12px]" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="w-[180px]">
                                                                    <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                                                                        {guest.name}
                                                                    </DropdownMenuLabel>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem asChild className="text-[12.5px]">
                                                                        <Link href={`/dashboard/guests/${guest.id}/profile`}>View profile</Link>
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem asChild className="text-[12.5px]">
                                                                        <Link href={`/dashboard/guests/${guest.id}`}>Edit guest</Link>
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="text-[12.5px] text-destructive focus:text-destructive"
                                                                        onClick={() => setPendingDelete(guest)}
                                                                    >
                                                                        Remove
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>

                                                            <Button
                                                                asChild variant="ghost" size="icon"
                                                                aria-label={`Message ${guest.name}`}
                                                                className="h-8 w-8 rounded-md text-muted-foreground"
                                                            >
                                                                <Link href={`/dashboard/messages/send?guest=${guest.id}&from=guests`}>
                                                                    <FontAwesomeIcon icon={faEnvelope} className="!size-[12px]" />
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {totalItems > 0 && (
                            <>
                                <Separator />
                                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-[12.5px] text-muted-foreground">
                                        Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, totalItems)} of{" "}
                                        {totalItems.toLocaleString()} guests
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            variant="outline" size="icon" aria-label="Previous page"
                                            className="h-8 w-8 rounded-md"
                                            disabled={page <= 1}
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        >
                                            <FontAwesomeIcon icon={faChevronLeft} className="!size-[11px]" />
                                        </Button>
                                        {/* A window, not every page — 156 buttons is not a
                                            pagination control, it is a wall. */}
                                        {pageWindow(page, totalPages).map((n, i) =>
                                            n === null ? (
                                                <span key={`gap-${i}`} className="px-1 text-[12px] text-muted-foreground">…</span>
                                            ) : (
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
                                            )
                                        )}
                                        <Button
                                            variant="outline" size="icon" aria-label="Next page"
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

                {/* ── Right rail ──────────────────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-5">
                    <Card className="border border-border py-0 shadow-none">
                        <CardContent className="p-4">
                            <p className="mb-3 text-[13px] font-bold text-foreground">Quick Actions</p>
                            <ul className="flex flex-col">
                                {[
                                    { label: "Add Guest", href: withEvent("/dashboard/guests/add"), icon: faUserPlus },
                                    { label: "Import Guests", href: withEvent("/dashboard/guests/import"), icon: faFileImport },
                                    { label: "Manage Groups", href: "/dashboard/guests/groups", icon: faPeopleGroup },
                                    { label: "Send Message to Guests", href: "/dashboard/messages/send", icon: faPaperPlane },
                                ].map((action) => (
                                    <li key={action.label}>
                                        <Link
                                            href={action.href}
                                            className="flex items-center gap-2.5 rounded-md px-2 py-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                                        >
                                            <FontAwesomeIcon icon={action.icon} className="!size-[12px] shrink-0 text-primary" />
                                            <span className="min-w-0 flex-1 break-words">{action.label}</span>
                                            <FontAwesomeIcon icon={faArrowRight} className="!size-[10px] shrink-0 text-muted-foreground" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>

                    <Card className="border border-border py-0 shadow-none">
                        <CardContent className="p-4">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <p className="text-[13px] font-bold text-foreground">Guest Groups</p>
                                <Link
                                    href="/dashboard/guests/groups/add"
                                    className="shrink-0 text-[11.5px] font-semibold text-primary hover:underline"
                                >
                                    + Add Group
                                </Link>
                            </div>

                            {groups.isLoading ? (
                                <div className="flex flex-col gap-2.5">
                                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
                                </div>
                            ) : (groups.data ?? []).length === 0 ? (
                                <p className="py-3 text-[12px] text-muted-foreground">
                                    No groups yet. Groups let you message a specific set of guests.
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-2.5">
                                    {(groups.data ?? []).slice(0, 5).map((group) => (
                                        <li key={group.id}>
                                            <button
                                                type="button"
                                                onClick={() => setGroupId(String(group.id))}
                                                className="flex w-full min-w-0 items-center gap-2.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/50"
                                            >
                                                <span
                                                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
                                                    style={{ backgroundColor: `${group.color ?? "#CBD5E1"}1A` }}
                                                >
                                                    <FontAwesomeIcon
                                                        icon={faPeopleGroup}
                                                        className="!size-[11px]"
                                                        style={{ color: group.color ?? "#64748B" }}
                                                    />
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                                                    {group.name}
                                                </span>
                                                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                                    {group.members_count} Guests
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <Separator className="my-3" />
                            <Link
                                href="/dashboard/guests/groups"
                                className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline"
                            >
                                View All Groups
                                <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                            </Link>
                        </CardContent>
                    </Card>

                    <Card className="border-primary/20 bg-primary/5 py-0 shadow-none">
                        <CardContent className="p-4">
                            <div className="mb-2 flex items-center gap-2">
                                <FontAwesomeIcon icon={faLightbulb} className="!size-[12px] text-primary" />
                                <p className="text-[12.5px] font-bold text-primary">Pro Tip</p>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                                Create groups to easily manage and send messages to specific sets of guests.
                            </p>
                            <Link
                                href="/dashboard/guests/groups/add"
                                className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline"
                            >
                                Create a group
                                <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                            </Link>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* ── Delete one ──────────────────────────────────────────────── */}
            <Dialog open={!!pendingDelete} onOpenChange={(v) => { if (!v && !remove.isPending) setPendingDelete(null); }}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Remove guest?</DialogTitle>
                        <DialogDescription>
                            {pendingDelete?.name} will be removed from your guest list.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" className="h-10 rounded-md text-[13px]" disabled={remove.isPending}
                            onClick={() => setPendingDelete(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive" className="h-10 rounded-md text-[13px] font-semibold"
                            disabled={remove.isPending}
                            onClick={() => {
                                if (!pendingDelete) return;
                                remove.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) });
                            }}
                        >
                            {remove.isPending ? "Removing..." : "Remove"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Delete many ─────────────────────────────────────────────── */}
            <Dialog open={bulkDelete} onOpenChange={(v) => { if (!v && !bulk.isPending) setBulkDelete(v); }}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Remove {selected.length} guests?</DialogTitle>
                        <DialogDescription>
                            They will be removed from your guest list. This cannot be undone from here.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" className="h-10 rounded-md text-[13px]" disabled={bulk.isPending}
                            onClick={() => setBulkDelete(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive" className="h-10 rounded-md text-[13px] font-semibold"
                            disabled={bulk.isPending}
                            onClick={() => bulk.mutate(
                                { guest_ids: selected, action: "delete" },
                                { onSettled: () => { setBulkDelete(false); setSelected([]); } }
                            )}
                        >
                            {bulk.isPending ? "Removing..." : `Remove ${selected.length}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/**
 * A windowed page list: 1 … 4 5 6 … 156.
 *
 * `null` is a gap. Rendering every page is fine at 3 and absurd at 156, which
 * is exactly the count the design's own mock shows.
 */
function pageWindow(current: number, total: number): (number | null)[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const out: (number | null)[] = [1];
    const from = Math.max(2, current - 1);
    const to = Math.min(total - 1, current + 1);

    if (from > 2) out.push(null);
    for (let i = from; i <= to; i += 1) out.push(i);
    if (to < total - 1) out.push(null);
    out.push(total);

    return out;
}
