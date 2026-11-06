"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, CheckCircle2, Clock, Gauge, Plus, Search, User, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    CountTabs, ListCard, ModuleHeader, OverviewCard, Pager, PersonCell, RowActions, SearchBox, SortSelect, StatTile, Toolbar,
} from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { useDateFormatter } from "@/hooks/use-client-settings";
import { useClientEvent } from "@/hooks/use-client-events";
import { useGuests, useParticipantCapacity } from "@/hooks/use-guests";
import { useEventParticipants, useSaveParticipant, type ParticipantRow } from "@/hooks/use-event-participants";
import {
    AccessPill, InvitePill, LinkedPill, ParticipantSheet, RsvpPill, accessOf, participantMenu, type PAction,
} from "./participant-actions";
import { useEventHref } from "@/lib/event-workspace";

/**
 * Event Participants — Jamal's web design (2026-11-04), from the module kit:
 * tiles Total / Active / Pending Access / Blocked; tabs All / Active / Pending /
 * Blocked / Hidden; search + Sort by Joined On; the Participant List (photo,
 * relationship, linked guest, mobile, invite / RSVP / access status, joined on,
 * ⋯ = View / Edit / Send Invitation / View RSVP Response / Block / Hide /
 * Delete — slide-in panels). Add Participant: from Guest or Manually.
 * Block = no event features in the app and no re-join; Hide = out of this list
 * and the app directory (clientParticipant.service, 2026-11-04).
 */
type Tab = "all" | "active" | "pending" | "blocked" | "hidden";
type Sort = "joined_desc" | "joined_asc" | "name_asc" | "name_desc";
const PAGE = 10;
const SORTS: { value: Sort; label: string }[] = [
    { value: "joined_desc", label: "Sort by: Joined On (Newest)" },
    { value: "joined_asc", label: "Sort by: Joined On (Oldest)" },
    { value: "name_asc", label: "Sort by: Name (A – Z)" },
    { value: "name_desc", label: "Sort by: Name (Z – A)" },
];
const last10 = (v?: string | null) => String(v ?? "").replace(/\D/g, "").slice(-10);
const inTab = (p: ParticipantRow, t: Tab) => (t === "hidden" ? !!p.is_hidden : !p.is_hidden && (t === "all" || accessOf(p) === t));
const SORT_FN: Record<Sort, (a: ParticipantRow, b: ParticipantRow) => number> = {
    joined_desc: (a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id,
    joined_asc: (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id,
    name_asc: (a, b) => a.name.localeCompare(b.name),
    name_desc: (a, b) => b.name.localeCompare(a.name),
};

export function ParticipantsView({ eventId }: { eventId: number }) {
    const wsHref = useEventHref();
    const router = useRouter();
    const fmt = useDateFormatter();
    const list = useEventParticipants(eventId);
    const capacity = useParticipantCapacity(eventId);
    const save = useSaveParticipant();
    const eventName = useClientEvent(eventId).data?.name;
    const [tab, setTab] = useState<Tab>("all");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<Sort>("joined_desc");
    const [page, setPage] = useState(1);
    const [act, setAct] = useState<{ a: PAction; id: number } | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [pickGuest, setPickGuest] = useState(false);

    const rows = useMemo(() => list.data ?? [], [list.data]);
    const count = (t: Tab) => rows.filter((p) => inTab(p, t)).length;
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows
            .filter((p) => inTab(p, tab) && (!q || [p.name, p.email, p.mobile, p.relationship].some((v) => String(v ?? "").toLowerCase().includes(q))))
            .sort(SORT_FN[sort]);
    }, [rows, tab, search, sort]);
    const current = Math.min(page, Math.max(1, Math.ceil(shown.length / PAGE)));
    const pageRows = shown.slice((current - 1) * PAGE, current * PAGE);
    const full = !!capacity.data?.full;
    const selected = act ? rows.find((p) => p.id === act.id) ?? null : null;

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <ModuleHeader
                title="Event Participants"
                subtitle="Manage participant access, invitation status, and event engagement."
                actions={<Button size="sm" className="h-8" onClick={() => setAddOpen(true)} disabled={full}><Plus className="size-3.5" /> Add Participant</Button>}
            />
            <OverviewCard>
                <StatTile icon={Users} value={count("all")} label="Total Participants" tone="primary" />
                <StatTile icon={CheckCircle2} value={count("active")} label="Active" tone="success" />
                <StatTile icon={Clock} value={count("pending")} label="Pending Access" tone="warning" />
                <StatTile icon={Ban} value={count("blocked")} label="Blocked" tone="danger" />
                {/* The plan's participant limit as a tile (was a line above the card — Jamal, 2026-11-06). */}
                {capacity.data?.limit != null && (
                    <StatTile icon={Gauge} value={`${capacity.data.used} / ${capacity.data.limit}`} label="Plan Limit" tone={full ? "danger" : "violet"}
                        caption={full ? "Limit reached — upgrade your plan" : `${Math.max(0, capacity.data.limit - capacity.data.used)} places left`} />
                )}
            </OverviewCard>

            <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                    <CountTabs<Tab> value={tab} onChange={(v) => { setTab(v); setPage(1); }} stretch={false}
                        tabs={[
                            { value: "all", label: "All Participants", count: count("all") },
                            { value: "active", label: "Active", count: count("active") },
                            { value: "pending", label: "Pending", count: count("pending") },
                            { value: "blocked", label: "Blocked", count: count("blocked") },
                            { value: "hidden", label: "Hidden", count: count("hidden") },
                        ]} />
                </div>
                <Toolbar>
                    <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search participants..." className="min-w-[180px]" />
                    <SortSelect value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORTS} className="w-[220px]" />
                </Toolbar>
            </div>

            <ListCard icon={Users} title="Participant List" count={shown.length}>
                {list.isLoading ? (
                    <div className="flex flex-col gap-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
                ) : pageRows.length === 0 ? (
                    <div className="py-10 text-center">
                        <p className="text-[14px] font-semibold">No participants here</p>
                        <p className="text-[12.5px] text-muted-foreground">{rows.length ? "Try another tab or search." : "People appear here when they join with the invitation QR, or when you add them."}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[12px]">
                            <thead>
                                <tr className="border-b border-border bg-primary/[0.03] text-[11.5px] font-semibold text-foreground/80">
                                    {/* Fit view: under xl, Relationship + Mobile fold under the name and Joined On hides. */}
                                    {[["Participant Name", ""], ["Relationship", "hidden xl:table-cell"], ["Linked Guest", ""], ["Mobile Number", "hidden xl:table-cell"],
                                        ["Invite Status", ""], ["RSVP Status", ""], ["Access Status", ""], ["Joined On", "hidden 2xl:table-cell"]].map(([h, c], i) => (
                                        <th key={h} className={cn("py-2.5 pr-2 text-left font-semibold whitespace-nowrap", i === 0 && "pl-3", c)}>{h}</th>
                                    ))}
                                    <th className="py-2.5 pr-4 text-right font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.map((p) => (
                                    <tr key={p.id} className={cn("border-b border-border last:border-0 hover:bg-muted/30", act?.id === p.id && "bg-primary/5")}>
                                        <td className="py-1.5 pr-2 pl-3">
                                            <PersonCell name={p.name} photo={p.photo} onClick={() => setAct({ a: "view", id: p.id })}
                                                sub={<span className="xl:hidden">{[p.relationship, p.mobile ? `${p.dial_code || "+91"} ${p.mobile}` : null].filter(Boolean).join(" · ")}</span>} />
                                        </td>
                                        <td className="hidden py-1.5 pr-2 xl:table-cell">{p.relationship || "—"}</td>
                                        <td className="py-1.5 pr-2"><LinkedPill p={p} /></td>
                                        <td className="hidden py-1.5 pr-2 whitespace-nowrap xl:table-cell">{p.mobile ? `${p.dial_code || "+91"} ${p.mobile}` : "—"}</td>
                                        <td className="py-1.5 pr-2"><InvitePill p={p} /></td>
                                        <td className="py-1.5 pr-2"><RsvpPill p={p} /></td>
                                        <td className="py-1.5 pr-2"><AccessPill p={p} /></td>
                                        <td className="hidden py-1.5 pr-2 whitespace-nowrap 2xl:table-cell">{p.created_at ? fmt(p.created_at) : "—"}</td>
                                        <td className="py-2 pr-4">
                                            <div className="flex items-center justify-end gap-1">
                                                <RowActions label={`Actions for ${p.name}`} items={participantMenu(p, (a) => setAct({ a, id: p.id }),
                                                    () => save.mutate({ id: p.id, data: { is_hidden: false } as never }))} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </ListCard>

            <Pager page={current} pageSize={PAGE} total={shown.length} onPage={setPage} noun="participants" />

            <ParticipantSheet action={act?.a ?? null} p={selected} eventId={eventId}
                onClose={() => setAct(null)} onSwitch={(a) => setAct((x) => (x ? { ...x, a } : x))} />

            {/* Add Participant: from Guest or Manually (the app's sheet) */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Add Participant</DialogTitle>
                        <DialogDescription>{eventName ? `To ${eventName}` : "Choose how to add"}</DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2">
                        <button type="button" onClick={() => { setAddOpen(false); setPickGuest(true); }}
                            className="flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5">
                            <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><UserPlus className="size-4" /></span>
                            <span><span className="block text-[13px] font-semibold">Add from Guest</span>
                                <span className="block text-[11.5px] text-muted-foreground">Pick one of this event&apos;s guests</span></span>
                        </button>
                        <button type="button" onClick={() => { setAddOpen(false); router.push(wsHref(`/dashboard/participants/add?event=${eventId}`)); }}
                            className="flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5">
                            <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><User className="size-4" /></span>
                            <span><span className="block text-[13px] font-semibold">Add Manually</span>
                                <span className="block text-[11.5px] text-muted-foreground">Enter the participant&apos;s details</span></span>
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {pickGuest && (
                <SelectGuestDialog
                    eventId={eventId}
                    taken={new Set(rows.map((r) => last10(r.mobile)).filter(Boolean))}
                    onClose={() => setPickGuest(false)}
                    onPick={(guestId) => router.push(wsHref(`/dashboard/participants/add?event=${eventId}&guest=${guestId}`))}
                />
            )}
        </div>
    );
}

/** Add from Guest: this event's guests; one already a participant shows "Added". */
function SelectGuestDialog({ eventId, taken, onClose, onPick }: {
    eventId: number;
    taken: Set<string>;
    onClose: () => void;
    onPick: (guestId: number) => void;
}) {
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [chosen, setChosen] = useState<number | null>(null);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);
    const guests = useGuests({ event_id: eventId, search: debounced || undefined, limit: 100 });
    const rows = guests.data?.data ?? [];

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle>Add from Guest</DialogTitle>
                    <DialogDescription>Choose a guest — their details fill the participant form.</DialogDescription>
                </DialogHeader>
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guests..." className="h-9 pl-8 text-[13px]" />
                </div>
                <div className="flex max-h-[340px] flex-col gap-1 overflow-y-auto">
                    {guests.isLoading ? (
                        Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-md" />)
                    ) : rows.length === 0 ? (
                        <p className="py-6 text-center text-[12.5px] text-muted-foreground">No guests on this event yet.</p>
                    ) : rows.map((g) => {
                        const added = taken.has(last10(g.mobile));
                        const on = chosen === g.id;
                        return (
                            <button
                                key={g.id} type="button" disabled={added} onClick={() => setChosen(g.id)}
                                className={cn(
                                    "flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors",
                                    on ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/60",
                                    added && "opacity-60",
                                )}
                            >
                                <Avatar className="size-8"><AvatarFallback className="text-[11px]">{g.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12.5px] font-semibold">{g.name}</span>
                                    <span className="block text-[11px] text-muted-foreground">{g.mobile ? `${g.dial_code ?? ""} ${g.mobile}`.trim() : "—"}</span>
                                </span>
                                {added ? (
                                    <span className="text-[11px] font-semibold text-muted-foreground">Added</span>
                                ) : (
                                    <span className={cn("grid size-5 place-items-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                                        {on ? <Check className="size-3" /> : null}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={!chosen} onClick={() => chosen && onPick(chosen)}>Continue</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
