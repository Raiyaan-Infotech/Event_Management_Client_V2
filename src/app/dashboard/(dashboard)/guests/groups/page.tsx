"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faPeopleGroup, faUsers, faCalendarCheck, faLock, faGlobe,
    faSearch, faSliders, faDownload, faPlus,
    faChevronLeft, faChevronRight, faArrowLeft,
    faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
    useGuestGroups, useGuestGroupStats, useDeleteGuestGroup, useExportGuests,
    type GuestGroup,
} from "@/hooks/use-guests";
import { ApiError } from "@/lib/api-client";
import { SignInPrompt } from '@/components/common/sign-in-prompt';
import { useDateFormatter } from '@/hooks/use-client-settings';
import { useEventHref } from "@/lib/event-workspace";
import { GroupSheet } from "./_components/group-sheet";

/**
 * Manage Groups.
 *
 * ── THE TWO COUNTS ARE NOT THE SAME THING ────────────────────────────────────
 * `members_count` is how many guests are in the group. `events_count` is how
 * many DISTINCT events it appears in — computed with COUNT(DISTINCT event_id),
 * because a group with 400 guests at one wedding is used in ONE event, not 400.
 * The design has both columns and they are easy to conflate.
 *
 * Deleting a group UNGROUPS its guests rather than deleting them; the
 * confirmation says how many will be affected before you commit to it.
 */

const PAGE_SIZE = 8;

export default function ManageGroupsPage() {
    const wsHref = useEventHref();
    // Dates follow the client's own Date Format / Time Zone preference.
    const fmt = useDateFormatter();
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [visibility, setVisibility] = useState("all");
    const [page, setPage] = useState(1);
    const [pendingDelete, setPendingDelete] = useState<GuestGroup | null>(null);
    // Add / Edit Group open as the slide-in panel (2026-11-07).
    const [groupSheet, setGroupSheet] = useState<GuestGroup | "new" | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => { setPage(1); }, [debouncedSearch, visibility]);

    const groups = useGuestGroups({
        search: debouncedSearch || undefined,
        visibility,
        page,
        limit: PAGE_SIZE,
    });
    const stats = useGuestGroupStats();
    const remove = useDeleteGuestGroup();
    const exportGuests = useExportGuests();

    const rows = groups.data?.data ?? [];
    const pagination = groups.data?.pagination;
    const totalPages = pagination?.totalPages ?? 1;
    const totalItems = pagination?.totalItems ?? 0;

    const authError = groups.error instanceof ApiError && groups.error.isAuthError;

    const s = stats.data;
    const tiles = [
        { label: "Total Groups", value: s?.total_groups ?? 0, caption: "Across all events", icon: faPeopleGroup, color: "#7C5AED", bg: "bg-[#7C5AED]/10" },
        { label: "Total Members", value: s?.total_members ?? 0, caption: "Across all groups", icon: faUsers, color: "#22C55E", bg: "bg-[#22C55E]/10" },
        { label: "Groups in Use", value: s?.groups_in_use ?? 0, caption: "Groups added to events", icon: faCalendarCheck, color: "#3B82F6", bg: "bg-[#3B82F6]/10" },
        { label: "Private Groups", value: s?.private_groups ?? 0, caption: "Not visible to others", icon: faLock, color: "#F59E0B", bg: "bg-[#F59E0B]/10" },
    ];

    return (
        <div className="flex flex-col gap-3.5">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    {/* Back to the Guests list (Jamal, 2026-11-07). */}
                    <Button asChild variant="outline" size="icon" className="mt-0.5 h-9 w-9 shrink-0 rounded-md"
                        aria-label="Back to Guests" title="Back to Guests">
                        <Link href={wsHref("/dashboard/guests")}>
                            <FontAwesomeIcon icon={faArrowLeft} className="!size-[13px]" />
                        </Link>
                    </Button>
                    <div className="min-w-0">
                        <h1 className="text-[20px] font-bold leading-tight tracking-tight text-foreground">Manage Groups</h1>
                        <p className="mt-1 text-[13.5px] text-muted-foreground">
                            Organize your guests into groups for better management.
                        </p>
                    </div>
                </div>
                {/* Export sits beside Add Guest Group in the header (Jamal, 2026-11-07). */}
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        disabled={exportGuests.isPending}
                        onClick={() => exportGuests.mutate({})}
                        className="h-10 rounded-md border-primary/40 px-4 text-[13px] font-semibold text-primary hover:bg-primary/5 hover:text-primary"
                    >
                        <FontAwesomeIcon icon={faDownload} className="mr-2 !size-[12px]" />
                        Export
                    </Button>
                    <Button className="h-10 rounded-md px-4 text-[13px] font-semibold" onClick={() => setGroupSheet("new")}>
                        <FontAwesomeIcon icon={faPlus} className="mr-2 !size-[12px]" />
                        Add Guest Group
                    </Button>
                </div>
            </div>

            {authError && (
                <Card className="border-warning/40 bg-warning/10 py-0 shadow-none">
                    <CardContent className="flex items-start gap-3 p-3.5">
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

            {/* ── Four tiles ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {tiles.map((tile) => (
                    <Card key={tile.label} className="min-w-0 border border-border py-0 shadow-none">
                        <CardContent className="flex items-center gap-3.5 p-3.5">
                            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", tile.bg)}>
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                    <FontAwesomeIcon
                        icon={faSearch}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 !size-[12px] text-muted-foreground"
                    />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search groups by name or description..."
                        className="h-10 rounded-md pl-9 text-[13px]"
                    />
                </div>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="h-10 shrink-0 rounded-md px-4 text-[13px] font-medium">
                            <FontAwesomeIcon icon={faSliders} className="mr-2 !size-[12px]" />
                            Filters
                            {visibility !== "all" && <Badge className="ml-2 h-4 min-w-4 px-1 text-[10px]">1</Badge>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[240px] p-3.5">
                        <div className="flex flex-col gap-3">
                            <Label className="text-[12px] font-medium">Visibility</Label>
                            <Select value={visibility} onValueChange={setVisibility}>
                                <SelectTrigger className="h-9 rounded-md text-[12.5px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All groups</SelectItem>
                                    <SelectItem value="private">Private</SelectItem>
                                    <SelectItem value="public">Public</SelectItem>
                                </SelectContent>
                            </Select>
                            <Separator />
                            <Button
                                variant="ghost" size="sm" disabled={visibility === "all" && !search}
                                onClick={() => { setVisibility("all"); setSearch(""); }}
                                className="h-8 text-[12px]"
                            >
                                Reset filters
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {/* ── Table ────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-3.5">
                <Card className="min-w-0 gap-0 border border-border p-0 shadow-none">
                    <CardContent className="p-0">
                        {groups.isLoading ? (
                            <div className="divide-y divide-border">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3.5">
                                        <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
                                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                            <Skeleton className="h-3.5 w-1/5" />
                                            <Skeleton className="h-3 w-2/5" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : rows.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-10 text-center">
                                <FontAwesomeIcon icon={faPeopleGroup} className="!size-[26px] text-muted-foreground/40" />
                                <p className="text-[14px] font-semibold text-foreground">No groups yet</p>
                                <p className="max-w-sm text-[13px] text-muted-foreground">
                                    {debouncedSearch || visibility !== "all"
                                        ? "Try a different search or filter."
                                        : "Groups let you message a specific set of guests instead of everyone."}
                                </p>
                                {!debouncedSearch && visibility === "all" && (
                                    <Button size="sm" className="mt-2 h-8 text-[12px]" onClick={() => setGroupSheet("new")}>Add your first group</Button>
                                )}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[820px] border-collapse">
                                    <thead>
                                        <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                                            <th className="py-2 pl-4 text-left font-medium">Group</th>
                                            <th className="py-2 text-left font-medium">Description</th>
                                            <th className="py-2 text-right font-medium">Events</th>
                                            <th className="py-2 text-right font-medium">Members</th>
                                            <th className="py-2 pl-6 text-left font-medium">Visibility</th>
                                            <th className="py-2 text-left font-medium">Created On</th>
                                            <th className="py-2 pr-4 text-right font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((group) => (
                                            <tr key={group.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                                                <td className="py-2 pl-4 pr-3 align-top">
                                                    <div className="flex min-w-0 items-center gap-2.5">
                                                        <span
                                                            className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
                                                            style={{ backgroundColor: `${group.color ?? "#CBD5E1"}1A` }}
                                                        >
                                                            <FontAwesomeIcon
                                                                icon={faPeopleGroup}
                                                                className="!size-[13px]"
                                                                style={{ color: group.color ?? "#64748B" }}
                                                            />
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className="text-[12.5px] font-semibold text-foreground break-words">
                                                                {group.name}
                                                            </p>
                                                            {!!group.is_default && (
                                                                <Badge variant="secondary" className="mt-0.5 rounded text-[9.5px]">
                                                                    Default
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="max-w-[240px] py-2 pr-3 align-top">
                                                    <p className="text-[12px] text-muted-foreground break-words">
                                                        {group.description || "—"}
                                                    </p>
                                                </td>

                                                {/* DISTINCT events, not a member count. */}
                                                <td className="py-2 pr-3 text-right align-top text-[12.5px] font-semibold tabular-nums text-foreground">
                                                    {group.events_count}
                                                </td>
                                                <td className="py-2 pr-3 text-right align-top text-[12.5px] font-semibold tabular-nums text-foreground">
                                                    {group.members_count}
                                                </td>

                                                <td className="py-2 pl-6 pr-3 align-top">
                                                    <Badge
                                                        variant="ghost"
                                                        className={cn(
                                                            "rounded px-2 py-0.5 text-[10.5px] font-semibold",
                                                            group.visibility === "private"
                                                                ? "bg-[#7C5AED]/10 text-[#7C5AED]"
                                                                : "bg-success/15 text-success"
                                                        )}
                                                    >
                                                        <FontAwesomeIcon
                                                            icon={group.visibility === "private" ? faLock : faGlobe}
                                                            className="mr-1 !size-[9px]"
                                                        />
                                                        {group.visibility === "private" ? "Private" : "Public"}
                                                    </Badge>
                                                </td>

                                                <td className="py-2 pr-3 align-top text-[12px] text-muted-foreground">
                                                    {fmt(group.created_at)}
                                                </td>

                                                <td className="py-2 pr-4 align-top">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {/* Edit / Delete in the ⋯ menu (Send Message to Group removed — Jamal, 2026-11-07). */}
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button size="icon" variant="outline" aria-label={`Actions for ${group.name}`}
                                                                    className="size-8 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary">
                                                                    <MoreHorizontal className="size-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-52">
                                                                <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={() => setGroupSheet(group)}>
                                                                    <Pencil className="size-4 text-muted-foreground" /> Edit Group
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem className="gap-2.5 py-2 text-[13px] text-destructive focus:text-destructive"
                                                                    onClick={() => setPendingDelete(group)}>
                                                                    <Trash2 className="size-4 text-destructive" /> Delete Group
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {totalItems > 0 && (
                            <>
                                <Separator />
                                <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-[12.5px] text-muted-foreground">
                                        Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, totalItems)} of{" "}
                                        {totalItems} groups
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <Button variant="outline" size="icon" aria-label="Previous page"
                                            className="h-8 w-8 rounded-md" disabled={page <= 1}
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}>
                                            <FontAwesomeIcon icon={faChevronLeft} className="!size-[11px]" />
                                        </Button>
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 6).map((n) => (
                                            <Button
                                                key={n}
                                                variant={n === page ? "default" : "outline"}
                                                size="icon" aria-label={`Page ${n}`}
                                                aria-current={n === page ? "page" : undefined}
                                                className="h-8 w-8 rounded-md text-[12px]"
                                                onClick={() => setPage(n)}
                                            >
                                                {n}
                                            </Button>
                                        ))}
                                        <Button variant="outline" size="icon" aria-label="Next page"
                                            className="h-8 w-8 rounded-md" disabled={page >= totalPages}
                                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                                            <FontAwesomeIcon icon={faChevronRight} className="!size-[11px]" />
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

            </div>

            {/* ── Delete confirm ──────────────────────────────────────────── */}
            <Dialog open={!!pendingDelete} onOpenChange={(v) => { if (!v && !remove.isPending) setPendingDelete(null); }}>
                <DialogContent className="sm:max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle>Delete group?</DialogTitle>
                        <DialogDescription>
                            {/* Says what actually happens. "Delete" next to a member
                                count reads as though the guests go too. */}
                            &ldquo;{pendingDelete?.name}&rdquo; will be deleted.{" "}
                            {pendingDelete?.members_count
                                ? `Its ${pendingDelete.members_count} guest(s) will be kept and simply ungrouped.`
                                : "It has no members."}
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
                            {remove.isPending ? "Deleting..." : "Delete group"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {groupSheet && <GroupSheet group={groupSheet === "new" ? null : groupSheet} onClose={() => setGroupSheet(null)} />}
        </div>
    );
}

