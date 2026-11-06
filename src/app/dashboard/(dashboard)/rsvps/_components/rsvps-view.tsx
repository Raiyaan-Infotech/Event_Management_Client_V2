"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    CalendarDays, CheckCircle2, ChevronDown, CircleHelp, Clock, Download, Eye, EyeOff, Info, Mail, MessageCircle,
    Send, Smartphone, Star, User, Users, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    ActionSheet, CountTabs, ListCard, ModuleHeader, OverviewCard, Pager, PersonCell, RowActions, SearchBox, SortSelect,
    StarBadge, StatTile, StatusPill, TONE_TEXT, Toolbar,
} from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { useDateFormatter } from "@/hooks/use-client-settings";
import { useClientEvent } from "@/hooks/use-client-events";
import type { Guest } from "@/hooks/use-guests";
import {
    fetchRsvpBoardAll, useHideRsvp, useRsvpBoard, type RsvpAnswer, type RsvpBoardParams, type RsvpRow,
    type RsvpSort, type RsvpState, type RsvpTab,
} from "@/hooks/use-rsvp-board";
import { GuestActionSheet, sideLabel, type GuestAction } from "../../guests/_components/guest-actions";
import {
    RsvpActionSheet, SOURCE_LABEL, STATE_META, StatePill, reminderText, responseType, rsvpMenu, type RsvpAction,
} from "./rsvp-actions";

/**
 * RSVP Responses — Jamal's web design (2026-11-04), from the module kit:
 * six tiles (Total Invited, Responded, Confirmed, Pending, Declined, Maybe),
 * Export / Send Reminder / "show not-invited", search + Status / Side / Source /
 * Sort / Date, tabs, the Response List and, on the right, RSVP Summary (donut),
 * Invitation Channel Breakdown, Recent Activity and Guest Response Notes.
 * One row per event guest (clientRsvpBoard.service).
 */

const PAGE = 10;
const SORTS: { value: RsvpSort; label: string }[] = [
    { value: "response_desc", label: "Sort: Response Date ↓" },
    { value: "response_asc", label: "Sort: Response Date ↑" },
    { value: "name_asc", label: "Sort: Name (A – Z)" },
    { value: "name_desc", label: "Sort: Name (Z – A)" },
];
const GUEST_STATUS: Record<RsvpState, Guest["status"]> = { confirmed: "confirmed", pending: "pending", declined: "declined", maybe: "pending", not_invited: "added" };

export function RsvpsView({ eventId }: { eventId: number }) {
    const fmt = useDateFormatter();
    const [tab, setTab] = useState<RsvpTab>("all");
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [status, setStatus] = useState<RsvpState | "">("");
    const [side, setSide] = useState<"bride" | "groom" | "">("");
    const [source, setSource] = useState("");
    const [sort, setSort] = useState<RsvpSort>("response_desc");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [showUninvited, setShowUninvited] = useState(false);
    const [page, setPage] = useState(1);
    const [act, setAct] = useState<{ a: RsvpAction; r: RsvpRow; target?: RsvpAnswer | "pending" } | null>(null);
    const [guestAct, setGuestAct] = useState<{ a: GuestAction; r: RsvpRow } | null>(null);
    const [bulkOpen, setBulkOpen] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);
    const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

    const params = useMemo<RsvpBoardParams>(() => ({
        tab, status, side, source, search: debounced, sort, from, to, show_uninvited: showUninvited, page, limit: PAGE,
    }), [tab, status, side, source, debounced, sort, from, to, showUninvited, page]);
    const board = useRsvpBoard(eventId, params);
    const hide = useHideRsvp();
    const d = board.data;
    const s = d?.stats;
    const rows = d?.rows ?? [];

    const asGuest = (r: RsvpRow): Guest => ({ ...r, status: GUEST_STATUS[r.rsvp.state] });
    const fresh = (r: RsvpRow) => rows.find((x) => x.id === r.id) ?? r;

    const exportCsv = async () => {
        try {
            const all = await fetchRsvpBoardAll(eventId, params);
            const head = ["Guest Name", "Relationship", "Side", "Invite Count", "RSVP Status", "Response Type", "Attending Count", "Meal Preference", "Response Date", "Source", "Mobile", "Email"];
            const lines = all.rows.map((r) => [r.name, r.relationship ?? "", sideLabel(r.side), r.invite_count ?? 1, STATE_META[r.rsvp.state].label, responseType(r),
                r.rsvp.attending_count ?? "", r.rsvp.meal_preference ?? "", r.rsvp.responded_at ? fmt(r.rsvp.responded_at, true) : "",
                r.rsvp.source ? SOURCE_LABEL[r.rsvp.source] ?? r.rsvp.source : "", `${r.dial_code ?? ""} ${r.mobile ?? ""}`.trim(), r.email ?? ""]);
            const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            a.download = `rsvp-responses-${eventId}.csv`;
            a.click();
        } catch {
            toast.error("Could not export the responses.");
        }
    };

    const tabs: { value: RsvpTab; label: string; icon?: typeof Star }[] = [
        { value: "all", label: "All Responses" },
        { value: "confirmed", label: "Confirmed", icon: CheckCircle2 },
        { value: "pending", label: "Pending", icon: Clock },
        { value: "declined", label: "Declined", icon: XCircle },
        { value: "bride", label: "Bride Side", icon: Star },
        { value: "groom", label: "Groom Side", icon: User },
        { value: "vip", label: "VIP", icon: Star },
        { value: "hidden", label: "Hidden", icon: EyeOff },
    ];

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-3">
                <ModuleHeader title="RSVP Responses" subtitle="Track attendance confirmations, pending responses, guest counts, and follow-up actions." />

                <OverviewCard columns={6}>
                    <StatTile icon={Mail} value={s?.invited ?? 0} label="Total Invited" tone="violet" />
                    <StatTile icon={Users} value={s?.responded ?? 0} label="Responded" caption={`${s?.responded_pct ?? 0}% response rate`} tone="primary" />
                    <StatTile icon={CheckCircle2} value={s?.confirmed ?? 0} label="Confirmed" caption={`${s?.confirmed_pct ?? 0}% of invited`} tone="success" />
                    <StatTile icon={Clock} value={s?.pending ?? 0} label="Pending" caption={`${s?.pending_pct ?? 0}% of invited`} tone="warning" />
                    <StatTile icon={XCircle} value={s?.declined ?? 0} label="Declined" caption={`${s?.declined_pct ?? 0}% of invited`} tone="danger" />
                    <StatTile icon={CircleHelp} value={s?.maybe ?? 0} label="Maybe / Not Attending" caption={`${s?.maybe_pct ?? 0}% of invited`} tone="violet" />
                </OverviewCard>

                {/* Channels · Recent Activity · Notes — one full-width row (RSVP Summary is on the event Dashboard). */}
                <RsvpRail board={d} onOpen={(id) => { const r = rows.find((x) => x.id === id); if (r) setAct({ a: "response", r }); }} />

                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8" onClick={exportCsv} disabled={!d?.pagination.totalItems}><Download className="size-3.5" /> Export</Button>
                    <Button size="sm" className="h-8" onClick={() => setBulkOpen(true)} disabled={!s?.pending}><Send className="size-3.5" /> Send Reminder</Button>
                    <label className="ml-auto flex items-center gap-2 text-[12.5px] text-muted-foreground">
                        <Info className="size-3.5" /> Show guests not invited yet ({s?.not_invited ?? 0})
                        <Switch checked={showUninvited} onCheckedChange={reset(setShowUninvited)} />
                    </label>
                </div>

                <Toolbar>
                    <SearchBox value={search} onChange={setSearch} placeholder="Search by guest name, phone, or email..." className="min-w-[180px]" />
                    <SortSelect<RsvpState | "all"> value={status || "all"} onChange={reset((v) => setStatus(v === "all" ? "" : v))} className="w-[140px]"
                        options={[{ value: "all", label: "Status: All" }, ...(["confirmed", "pending", "declined", "maybe", "not_invited"] as RsvpState[]).map((v) => ({ value: v, label: STATE_META[v].label }))]} />
                    <SortSelect<"all" | "bride" | "groom"> value={side || "all"} onChange={reset((v) => setSide(v === "all" ? "" : v))} className="w-[130px]"
                        options={[{ value: "all", label: "Side: All" }, { value: "bride", label: "Bride Side" }, { value: "groom", label: "Groom Side" }]} />
                    <SortSelect value={source || "all"} onChange={reset((v: string) => setSource(v === "all" ? "" : v))} className="w-[140px]"
                        options={[{ value: "all", label: "Source: All" }, { value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }, { value: "in_app", label: "In-App" }, { value: "qr", label: "QR Scan" }]} />
                    <SortSelect value={sort} onChange={reset(setSort)} options={SORTS} className="w-[190px]" />
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className={cn("h-8 text-[12.5px]", (from || to) && "border-primary text-primary")}>
                                <CalendarDays className="size-3.5" /> Date: {from || to ? `${from || "…"} – ${to || "…"}` : "All"} <ChevronDown className="size-3.5" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="flex w-64 flex-col gap-2 p-3 text-[12.5px]">
                            <p className="font-semibold">Response date</p>
                            <label className="flex flex-col gap-1">From<Input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className="h-8" /></label>
                            <label className="flex flex-col gap-1">To<Input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} className="h-8" /></label>
                            <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); setPage(1); }}>Clear dates</Button>
                        </PopoverContent>
                    </Popover>
                </Toolbar>

                <CountTabs<RsvpTab> value={tab} onChange={reset(setTab)} stretch={false}
                    tabs={tabs.map((t) => ({ ...t, count: d?.tabs?.[t.value] ?? 0 }))} />

                <ListCard icon={Users} title="Response List" note="Guests can respond for multiple invitees (e.g., family members, +1s).">
                    {board.isLoading ? (
                        <div className="flex flex-col gap-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
                    ) : board.isError ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center">
                            <p className="text-[14px] font-semibold">Could not load the responses</p>
                            <Button variant="outline" size="sm" onClick={() => board.refetch()}>Try again</Button>
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="py-10 text-center">
                            <p className="text-[14px] font-semibold">No responses here</p>
                            <p className="text-[12.5px] text-muted-foreground">{tab === "all" && !debounced ? "Invite guests from the Guests tab — their answers appear here." : "Try another tab, filter or search."}</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            {/* Fits the card (Jamal, 2026-11-05): no forced min width, small type, short headings, tight cells.
                                The scroll stays only as a fallback on very narrow screens. */}
                            <table className="w-full border-collapse text-[11.5px] [&_td]:pr-2 [&_th]:pr-2 [&_td_span.rounded-full]:px-1.5 [&_td_span.rounded-full]:text-[10.5px]">
                                <thead>
                                    <tr className="border-b border-border text-[10.5px] font-semibold text-foreground/80">
                                        {[
                                            ["Guest", "Guest Name"], ["Relation", "Relationship"], ["Side", "Side"], ["Invites", "Invite Count"],
                                            ["RSVP", "RSVP Status"], ["Response", "Response Type"], ["Attending", "Attending Count"],
                                            ["Meal", "Meal Preference"], ["Responded", "Response Date"], ["Source / App", "Source / App Visibility"],
                                        ].map(([h, full], i) => (
                                            <th key={h} title={full} className={cn("py-2 text-left font-semibold whitespace-nowrap", i === 0 && "pl-3", i === 6 && "text-center")}>{h}</th>
                                        ))}
                                        <th className="py-2 pr-3 text-right font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.id} className={cn("border-b border-border last:border-0 hover:bg-muted/30", act?.r.id === r.id && "bg-primary/5")}>
                                            <td className="py-1.5 pl-3">
                                                <PersonCell name={r.name} photo={r.photo} onClick={() => setAct({ a: "response", r })}
                                                    badge={r.is_vip ? <StarBadge>{r.vip_label && r.vip_label.length <= 12 ? r.vip_label : "VIP"}</StarBadge> : undefined} />
                                            </td>
                                            <td className="py-1.5">{r.relationship || "—"}</td>
                                            <td className="py-1.5">{r.side ? <StatusPill tone={r.side === "bride" ? "primary" : "violet"}>{sideLabel(r.side)}</StatusPill> : "—"}</td>
                                            <td className="py-1.5"><span className="inline-flex items-center gap-1"><Users className="size-3 text-muted-foreground" /> {r.invite_count ?? 1}</span></td>
                                            <td className="py-1.5"><StatePill state={r.rsvp.state} /></td>
                                            <td className="py-1.5"><StatusPill tone="plain">{responseType(r)}</StatusPill></td>
                                            <td className="py-1.5 text-center">{r.rsvp.attending_count ?? "—"}</td>
                                            <td className="max-w-[110px] py-1.5">{r.rsvp.meal_preference || "—"}</td>
                                            <td className="py-1.5 whitespace-nowrap">{r.rsvp.responded_at ? <>{fmt(r.rsvp.responded_at)}<br /><span className="text-muted-foreground">{new Date(r.rsvp.responded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></> : "—"}</td>
                                            <td className="py-1.5">
                                                <span className="flex flex-col items-start gap-0.5">
                                                    <span className="inline-flex items-center gap-1 whitespace-nowrap">{sourceIcon(r.rsvp.source)} {r.rsvp.source ? SOURCE_LABEL[r.rsvp.source] ?? r.rsvp.source : "—"}</span>
                                                    {r.is_visible === false ? <StatusPill tone="muted" icon={EyeOff}>Hidden</StatusPill> : <StatusPill tone="success" icon={Eye}>Visible</StatusPill>}
                                                </span>
                                            </td>
                                            <td className="py-1.5 pr-3 text-right">
                                                <RowActions compact label={`Actions for ${r.name}`} items={rsvpMenu(r,
                                                    (a, target) => setAct({ a, r, target }),
                                                    (a) => setGuestAct({ a, r }),
                                                    () => hide.mutate({ guestId: r.id, hidden: false }))} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </ListCard>

                <Pager page={page} pageSize={PAGE} total={d?.pagination.totalItems ?? 0} onPage={setPage} noun="responses" />
            </div>


            <RsvpActionSheet
                action={act?.a ?? null} row={act ? fresh(act.r) : null} eventId={eventId} target={act?.target}
                onClose={() => setAct(null)} onEditGuest={() => { if (act) { setGuestAct({ a: "edit", r: act.r }); setAct(null); } }}
            />
            <GuestActionSheet
                action={guestAct?.a ?? null} guest={guestAct ? asGuest(fresh(guestAct.r)) : null} eventId={eventId}
                onClose={() => setGuestAct(null)} onSwitch={(a) => setGuestAct((x) => (x ? { ...x, a } : x))}
            />
            {bulkOpen && <BulkReminder eventId={eventId} onClose={() => setBulkOpen(false)} onOne={(r) => { setBulkOpen(false); setAct({ a: "reminder", r }); }} />}
        </div>
    );
}

function sourceIcon(src: string | null) {
    const c = "size-3.5 text-muted-foreground";
    if (src === "whatsapp") return <MessageCircle className={cn(c, "text-success")} />;
    if (src === "email") return <Mail className={c} />;
    return <Smartphone className={c} />;
}

/** Invitation Channel Breakdown, Recent Activity, Guest Response Notes (RSVP Summary moved to the event Dashboard, 2026-11-06). */
function RsvpRail({ board, onOpen }: { board?: ReturnType<typeof useRsvpBoard>["data"]; onOpen: (guestId: number) => void }) {
    const s = board?.stats;
    const ch = board?.channels;
    const card = "rounded-xl border border-primary/15 bg-card";
    const head = "flex items-center justify-between gap-2 border-b border-primary/15 bg-primary/5 px-3.5 py-2.5 text-[14px] font-bold text-primary";
    // "Now" read once when the column mounts — fine for "10 min ago" labels.
    const [now] = useState(() => Date.now());
    const ago = (iso: string) => {
        const m = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60000));
        return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} d ago`;
    };
    return (
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className={card}>
                <p className={head}><span className="flex items-center gap-2"><Send className="size-4" /> Invitation Channel Breakdown</span></p>
                <div className="flex flex-col gap-3 p-3.5">
                    {([["whatsapp", "WhatsApp", MessageCircle], ["email", "Email", Mail], ["in_app", "In-App", Smartphone]] as const).map(([k, label, Icon]) => {
                        const n = ch?.[k] ?? 0;
                        const w = s?.invited ? Math.round((n / s.invited) * 100) : 0;
                        return (
                            <div key={k} className="flex items-center gap-2.5">
                                <Icon className={cn("size-4 shrink-0", k === "whatsapp" ? "text-success" : "text-muted-foreground")} />
                                <div className="min-w-0 flex-1">
                                    <p className="flex justify-between text-[12px]"><span className="font-semibold">{label}</span><span><b>{n}</b> <span className="text-muted-foreground">({w}%)</span></span></p>
                                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${w}%` }} /></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className={card}>
                <p className={head}><span className="flex items-center gap-2"><Clock className="size-4" /> Recent Activity</span></p>
                <div className="flex flex-col gap-2.5 p-3.5">
                    {(board?.recent ?? []).length === 0 ? <p className="text-[12px] text-muted-foreground">No responses yet.</p> : board!.recent.map((x) => {
                        const m = STATE_META[x.state];
                        const verb = x.state === "confirmed" ? (x.attending_count && x.attending_count > 1 ? `confirmed for ${x.attending_count} invitees.` : "confirmed their attendance.")
                            : x.state === "declined" ? "declined the invitation." : x.state === "maybe" ? "marked Maybe." : "is pending a response.";
                        return (
                            <button key={`${x.guest_id}-${x.at}`} type="button" onClick={() => onOpen(x.guest_id)} className="flex items-start gap-2 text-left text-[12px]">
                                <m.icon className={cn("mt-0.5 size-3.5 shrink-0", TONE_TEXT[m.tone])} />
                                <span className="min-w-0 flex-1"><b>{x.name}</b> {verb}</span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">{ago(x.at)}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className={card}>
                <p className={head}><span className="flex items-center gap-2"><Info className="size-4" /> Guest Response Notes</span></p>
                <ul className="list-disc px-3.5 py-3 pl-8 text-[12px] text-foreground/80">
                    <li>Guests can respond for multiple invitees (e.g., spouse, family, +1).</li>
                    <li>Use &ldquo;Send Reminder&rdquo; to follow up with pending guests.</li>
                </ul>
            </div>
        </div>
    );
}

/** Send Reminder (top button): the pending guests, one WhatsApp tap each (a browser opens one chat at a time). */
function BulkReminder({ eventId, onClose, onOne }: { eventId: number; onClose: () => void; onOne: (r: RsvpRow) => void }) {
    const fmt = useDateFormatter();
    const event = useClientEvent(eventId).data;
    const list = useRsvpBoard(eventId, { tab: "pending", limit: 200, sort: "name_asc" });
    const info = { name: event?.name, when: event?.start_date ? fmt(event.start_date) : "", where: event?.venue_name ?? "" };
    const rows = list.data?.rows ?? [];
    return (
        <ActionSheet open onClose={onClose} icon={Send} title="Send Reminder" subtitle={`${rows.length} guests have not responded yet`}
            footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button disabled={!rows[0]} onClick={() => rows[0] && onOne(rows[0])}>Start with {rows[0]?.name.split(/\s+/)[0] ?? "first"}</Button></>}>
            <p className="text-[12.5px] text-muted-foreground">Tap WhatsApp to open each guest&apos;s chat with the reminder ready, or Customise to change the message and channels.</p>
            {list.isLoading ? <Skeleton className="h-20 w-full" /> : rows.map((r) => {
                const phone = `${r.dial_code || "+91"}${r.mobile ?? ""}`.replace(/\D/g, "");
                return (
                    <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                        <PersonCell name={r.name} photo={r.photo} sub={[r.relationship, sideLabel(r.side)].filter((x) => x && x !== "—").join(" · ")} />
                        <span className="ml-auto flex shrink-0 gap-1.5">
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11.5px]" onClick={() => onOne(r)}>Customise</Button>
                            <Button size="sm" className="h-7 bg-success px-2 text-[11.5px] text-white hover:bg-success/90" disabled={!r.mobile}
                                onClick={() => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(reminderText("standard", r.name.split(/\s+/)[0], info))}`, "_blank")}>
                                <MessageCircle className="size-3" /> WhatsApp
                            </Button>
                        </span>
                    </div>
                );
            })}
            {!list.isLoading && rows.length === 0 && <p className="text-[12.5px]">Everyone invited has responded. 🎉</p>}
        </ActionSheet>
    );
}
