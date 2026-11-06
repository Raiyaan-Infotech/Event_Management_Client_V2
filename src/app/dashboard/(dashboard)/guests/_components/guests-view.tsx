"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Download, FileUp, Mail, UserPlus, Users, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    CountTabs, ListCard, ModuleHeader, OverviewCard, Pager, PersonCell, RowActions, SearchBox, SortSelect, StatTile, StatusPill, Toolbar,
} from "@/components/module-kit";
import { SignInPrompt } from "@/components/common/sign-in-prompt";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useExportGuests, useGuestGroups, useGuests, useGuestStats, type Guest, type GuestListParams } from "@/hooks/use-guests";
import { GuestActionSheet, StatusPillFor, guestMenu, type GuestAction } from "./guest-actions";
import { useEventHref } from "@/lib/event-workspace";

/**
 * Event Guests — the MOBILE APP's guest list (Jamal, 2026-11-06: "like the app, remove what the app
 * does not have"): All + one tab per guest group, search, sort; rows = photo, name, mobile, group,
 * status; ⋯ = View / Edit / Send Invitation / View RSVP Response / Delete.
 * Add Guest = the app's form (Full Name, Mobile, Group, Email, Note) and Edit = the app's Edit Guest,
 * both the GuestForm page. Removed (not in the app): Relationship, Family Side (Bride / Groom),
 * Invite Count, App Visibility, VIP, Hide, Guest Type, the design's Add Guest panel.
 */

type Sort = NonNullable<GuestListParams["sort"]>;
const PAGE = 10;
const SORTS: { value: Sort; label: string }[] = [
    { value: "name_asc", label: "Sort by Name (A – Z)" },
    { value: "name_desc", label: "Sort by Name (Z – A)" },
    { value: "recent", label: "Sort by Recently Added" },
    { value: "oldest", label: "Sort by Oldest First" },
];

export function GuestsView({ eventId }: { eventId: number }) {
    const wsHref = useEventHref();
    // "all" or a group id — the app's group pills.
    const [tab, setTab] = useState<string>("all");
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [sort, setSort] = useState<Sort>("name_asc");
    const [page, setPage] = useState(1);
    const [action, setAction] = useState<{ a: GuestAction; g: Guest } | null>(null);

    useEffect(() => {
        const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    const params = useMemo<GuestListParams>(() => ({
        event_id: eventId, search: debounced || undefined, sort, page, limit: PAGE,
        ...(tab !== "all" ? { group_id: tab } : {}),
    }), [eventId, debounced, sort, page, tab]);

    const guests = useGuests(params);
    const stats = useGuestStats(eventId);
    const groups = useGuestGroups({ limit: 100 }).data?.data ?? [];
    const exportGuests = useExportGuests();

    const rows = guests.data?.data ?? [];
    const total = guests.data?.pagination?.totalItems ?? 0;
    const s = stats.data;
    const st = (k: "added" | "invited" | "pending" | "confirmed" | "declined") => s?.statuses?.[k] ?? 0;
    const all = s?.total_guests ?? 0;
    const authError = (guests.error instanceof ApiError && guests.error.isAuthError) || (stats.error instanceof ApiError && stats.error.isAuthError);

    // Selected guest kept fresh after a save (the list refetches).
    const current = action ? (rows.find((g) => g.id === action.g.id) ?? action.g) : null;
    const open = (a: GuestAction, g: Guest) => setAction({ a, g });

    return (
        <div className="flex flex-col gap-4">
            <ModuleHeader
                title="Event Guests"
                subtitle="Manage your guest list, groups and invitations."
                actions={(
                    <>
                        <Button asChild variant="outline" size="sm"><Link href={wsHref(`/dashboard/guests/import?event=${eventId}`)}><FileUp className="size-3.5" /> Import</Link></Button>
                        <Button variant="outline" size="sm" disabled={exportGuests.isPending || all === 0} onClick={() => exportGuests.mutate({ event_id: eventId })}>
                            <Download className="size-3.5" /> {exportGuests.isPending ? "Exporting…" : "Export"}
                        </Button>
                        <Button asChild variant="outline" size="sm"><Link href={wsHref("/dashboard/guests/groups")}><UsersRound className="size-3.5" /> Manage Groups</Link></Button>
                        <Button asChild size="sm"><Link href={wsHref(`/dashboard/guests/add?event=${eventId}${tab !== "all" ? `&group=${tab}` : ""}`)}><UserPlus className="size-3.5" /> Add Guest</Link></Button>
                    </>
                )}
            />

            {authError && (
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-[12.5px]">
                    <p className="font-semibold">You are not signed in</p>
                    <p className="text-muted-foreground">Your session has ended. Sign in again to carry on.</p>
                    <SignInPrompt className="mt-2.5" />
                </div>
            )}

            <OverviewCard title="Guest Overview" icon={Users}>
                <StatTile icon={Users} value={all} label="Total Guests" tone="primary" />
                <StatTile icon={Mail} value={all - st("added")} label="Invited" tone="violet" />
                <StatTile icon={CheckCircle2} value={st("confirmed")} label="Confirmed" tone="success" />
                <StatTile icon={Clock} value={st("invited") + st("pending")} label="Pending RSVP" tone="warning" />
            </OverviewCard>

            {/* All + the guest groups — the app's pills (tap = filter). */}
            <CountTabs<string>
                value={tab} onChange={(v) => { setTab(v); setPage(1); }} stretch={false}
                tabs={[
                    { value: "all", label: "All", count: all },
                    ...groups.map((g) => ({ value: String(g.id), label: g.name })),
                ]}
            />

            <Toolbar>
                <SearchBox value={search} onChange={setSearch} placeholder="Search guests by name or mobile..." />
                <SortSelect value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORTS} />
            </Toolbar>

            <ListCard icon={Users} title="Guest List" count={total} note="Showing all guests for this event.">
                {guests.isLoading ? (
                    <div className="flex flex-col gap-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
                ) : guests.isError && !authError ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                        <p className="text-[14px] font-semibold">Could not load your guests</p>
                        <Button variant="outline" size="sm" onClick={() => guests.refetch()}>Try again</Button>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-1 py-10 text-center">
                        <p className="text-[14px] font-semibold">No guests here</p>
                        <p className="text-[13px] text-muted-foreground">{debounced || tab !== "all" ? "Try another group or search." : "Add your first guest with Add Guest."}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[12.5px]">
                            <thead>
                                <tr className="border-b border-border text-[11.5px] font-semibold text-foreground/80">
                                    <th className="py-2 pr-2 pl-3 text-left font-semibold">Guest Name</th>
                                    <th className="py-2 pr-2 text-left font-semibold">Mobile Number</th>
                                    <th className="py-2 pr-2 text-left font-semibold">Group</th>
                                    <th className="py-2 pr-2 text-left font-semibold">Status</th>
                                    <th className="py-2 pr-3 text-center font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((g) => (
                                    <tr key={g.id} className={cn("border-b border-border last:border-0 hover:bg-muted/30", current?.id === g.id && "bg-primary/5")}>
                                        <td className="py-1.5 pr-2 pl-3"><PersonCell name={g.name} photo={g.photo} onClick={() => open("view", g)} sub={g.email || undefined} /></td>
                                        <td className="py-1.5 pr-2 whitespace-nowrap">{g.mobile ? `${g.dial_code || ""} ${g.mobile}`.trim() : "—"}</td>
                                        <td className="py-1.5 pr-2">{g.group?.name ? <StatusPill tone="plain">{g.group.name}</StatusPill> : "—"}</td>
                                        <td className="py-1.5 pr-2"><StatusPillFor status={g.status} /></td>
                                        <td className="py-1.5 pr-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <RowActions label={`Actions for ${g.name}`} items={guestMenu(g, (x) => open(x, g))} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </ListCard>

            <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} noun="guests" />

            <GuestActionSheet
                action={action?.a ?? null} guest={current} eventId={eventId}
                onClose={() => setAction(null)}
                onSwitch={(a) => setAction((x) => (x ? { ...x, a } : x))}
            />
        </div>
    );
}
