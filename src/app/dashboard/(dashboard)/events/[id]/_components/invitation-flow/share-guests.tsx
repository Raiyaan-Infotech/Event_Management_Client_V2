"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    Bold, Braces, CalendarDays, Check, ChevronDown, Clock, Download, Eye, FileText, Filter, Home, Italic, Link2, List,
    ListOrdered, Loader2, Mail, Plus, Redo2, Search, Send, Smile, Strikethrough, Undo2, Users, UserRound,
} from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ClientEvent } from "@/hooks/use-client-events";
import {
    useInvitationAudience, useSendInvitation,
    type AudienceGuest, type InviteChannel, type SendInvitationResult,
} from "@/hooks/use-invitation-sends";
import { hostsOf, initials, prettyDate, prettyTime } from "./shared";

/**
 * Step 3 — Share Invitation with Guests (designs 03_1, 03_2, 03_3&4).
 * Guests by group and/or one by one, WhatsApp or Email, the message (with
 * placeholders), optional schedule. Send SAVES the invitation per guest in the
 * database (Jamal, 2026-11-18) — nothing is delivered until a WhatsApp / email
 * provider is connected, and the screen says so.
 */

const MAX_CHARS = 500;
const PLACEHOLDERS = [
    { token: "{guest_name}", label: "Guest name" },
    { token: "{event_name}", label: "Event name" },
    { token: "{couple_names}", label: "Couple / host names" },
    { token: "{event_date}", label: "Event date" },
    { token: "{event_time}", label: "Event time" },
    { token: "{venue}", label: "Venue" },
    { token: "{invitation_link}", label: "Invitation link" },
];
const EMOJI = ["🌸", "💕", "💐", "🎉", "✨", "💍", "🙏", "😊", "❤️", "🕌", "🎊", "🌙"];

const defaultMessage = (channel: InviteChannel) => channel === "email"
    ? "Dear {guest_name},\nYou are warmly invited to {event_name} of {couple_names} on {event_date} at {event_time}, at {venue}.\nPlease join us and bless the couple with your gracious presence. 💕\n{invitation_link}"
    : "Hello {guest_name}! 🌸\nYou are warmly invited to {event_name} of {couple_names} on {event_date} at {event_time}, at {venue}.\nPlease join us and bless the couple. 💕\n{invitation_link}";

/** The message as one guest would read it. */
export const renderInvite = (text: string, event: ClientEvent, guestName: string, link: string) =>
    text
        .replaceAll("{guest_name}", guestName || "Guest")
        .replaceAll("{event_name}", event.name || "")
        .replaceAll("{couple_names}", hostsOf(event) || event.name || "")
        .replaceAll("{event_date}", prettyDate(event.start_date))
        .replaceAll("{event_time}", prettyTime(event.start_time))
        .replaceAll("{venue}", [event.venue_name, event.venue_address].filter(Boolean).join(", "))
        .replaceAll("{invitation_link}", link);

const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Draft { channel: InviteChannel; subject: string; message: string; groups: number[]; guests: number[] }
const draftKey = (eventId: number) => `invite-draft:${eventId}`;
const readDraft = (eventId: number): Draft | null => {
    try { const raw = window.localStorage.getItem(draftKey(eventId)); return raw ? (JSON.parse(raw) as Draft) : null; } catch { return null; }
};

export function ShareGuests({
    event, link, onSent,
}: { event: ClientEvent; link: string; onSent: (r: SendInvitationResult) => void }) {
    const audience = useInvitationAudience(event.id);
    const draft = useMemo(() => (typeof window !== "undefined" ? readDraft(event.id) : null), [event.id]);
    const [mode, setMode] = useState<"group" | "individual">("group");
    const [groups, setGroups] = useState<Set<number>>(new Set(draft?.groups ?? []));
    const [picked, setPicked] = useState<Set<number>>(new Set(draft?.guests ?? []));
    const [search, setSearch] = useState("");
    const [groupFilter, setGroupFilter] = useState<string>("all");
    const [channel, setChannel] = useState<InviteChannel>(draft?.channel ?? "whatsapp");
    const [subject, setSubject] = useState(draft?.subject ?? `Invitation to ${event.name}`);
    const [message, setMessage] = useState(draft?.message ?? defaultMessage(draft?.channel ?? "whatsapp"));
    const [schedule, setSchedule] = useState(false);
    const [date, setDate] = useState(todayISO());
    const [time, setTime] = useState("10:00");
    const [preview, setPreview] = useState(false);
    const box = useRef<HTMLTextAreaElement>(null);
    const send = useSendInvitation(onSent);

    const guests = useMemo(() => audience.data?.guests ?? [], [audience.data]);
    const allGroups = audience.data?.groups ?? [];

    /** Everyone the selection reaches: picked groups + picked individuals. */
    const selectedIds = useMemo(() => {
        const ids = new Set<number>(picked);
        for (const g of guests) if (g.group && groups.has(g.group.id)) ids.add(g.id);
        return ids;
    }, [guests, groups, picked]);
    const reachableFor = (g: AudienceGuest) => (channel === "email" ? !!g.email : !!(g.whatsapp || g.mobile));
    const selectedGuests = guests.filter((g) => selectedIds.has(g.id));
    const willReach = selectedGuests.filter(reachableFor).length;

    const groupRows = allGroups.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()));
    const guestRows = guests.filter((g) => {
        const q = search.trim().toLowerCase();
        const okQ = !q || `${g.name} ${g.mobile ?? ""} ${g.email ?? ""}`.toLowerCase().includes(q);
        const okG = groupFilter === "all" || (groupFilter === "none" ? !g.group : String(g.group?.id) === groupFilter);
        return okQ && okG;
    });

    const toggleSet = (set: Set<number>, id: number, on: boolean) => {
        const next = new Set(set);
        if (on) next.add(id); else next.delete(id);
        return next;
    };

    /* ── message editing ── */
    const insert = (before: string, after = "", fallback = "") => {
        const el = box.current;
        if (!el) return;
        const { selectionStart: s, selectionEnd: e, value } = el;
        const sel = value.slice(s, e) || fallback;
        const next = `${value.slice(0, s)}${before}${sel}${after}${value.slice(e)}`.slice(0, MAX_CHARS);
        setMessage(next);
        requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
    };
    const linePrefix = (numbered: boolean) => {
        const el = box.current;
        if (!el) return;
        const { selectionStart: s, selectionEnd: e, value } = el;
        const start = value.lastIndexOf("\n", s - 1) + 1;
        const block = value.slice(start, e).split("\n").map((l, i) => `${numbered ? `${i + 1}. ` : "• "}${l}`).join("\n");
        setMessage(`${value.slice(0, start)}${block}${value.slice(e)}`.slice(0, MAX_CHARS));
        requestAnimationFrame(() => el.focus());
    };
    const history = (cmd: "undo" | "redo") => {
        box.current?.focus();
        // The textarea keeps its own undo stack; execCommand reaches it.
        document.execCommand(cmd);
    };

    const switchChannel = (c: InviteChannel) => {
        if (c === channel) return;
        // Swap to the other channel's default only while the message is still a default.
        if (message === defaultMessage(channel)) setMessage(defaultMessage(c));
        setChannel(c);
    };

    const saveDraft = () => {
        try {
            window.localStorage.setItem(draftKey(event.id), JSON.stringify({ channel, subject, message, groups: [...groups], guests: [...picked] } satisfies Draft));
            toast.success("Draft saved on this device.");
        } catch {
            toast.error("Could not save the draft in this browser.");
        }
    };

    const submit = () => {
        if (!selectedIds.size) { toast.error("Choose at least one group or guest."); return; }
        if (!message.trim()) { toast.error("Please write the invitation message."); return; }
        if (channel === "email" && !subject.trim()) { toast.error("Please enter the email subject."); return; }
        let scheduled_at: string | undefined;
        if (schedule) {
            const when = new Date(`${date}T${time}`);
            if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) { toast.error("Choose a date and time in the future."); return; }
            scheduled_at = when.toISOString();
        }
        send.mutate({
            event_id: event.id,
            channel,
            group_ids: [...groups],
            guest_ids: [...picked],
            subject: channel === "email" ? subject.trim() : undefined,
            message: message.trim(),
            scheduled_at,
        }, {
            onSuccess: () => { try { window.localStorage.removeItem(draftKey(event.id)); } catch { /* ignore */ } },
        });
    };

    const sample = selectedGuests[0]?.name ?? guests[0]?.name ?? "Guest";

    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            {/* ── Select Guests ────────────────────────────────────────── */}
            <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Users className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[17px] font-bold text-foreground">Select Guests</h2>
                        <p className="text-[12.5px] text-muted-foreground">Choose guests by Group or Individuals, or a combination of both.</p>
                    </div>
                    <span className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[12px] font-bold text-primary" data-selected-count>
                        {selectedIds.size} Guest{selectedIds.size === 1 ? "" : "s"} Selected
                    </span>
                </div>

                <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Select guests by">
                    {([["group", "By Group"], ["individual", "By Individuals"]] as const).map(([v, label]) => (
                        <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => { setMode(v); setSearch(""); }}
                            className={cn("flex h-10 items-center gap-2.5 rounded-lg border px-4 text-[13px] font-semibold transition",
                                mode === v ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-muted")}>
                            <span className={cn("grid size-4 place-items-center rounded-full border-2", mode === v ? "border-primary" : "border-muted-foreground/50")}>
                                {mode === v && <span className="size-2 rounded-full bg-primary" />}
                            </span>
                            {label}
                        </button>
                    ))}
                </div>

                <div className="rounded-xl border border-border p-4">
                    <div className="mb-3 flex flex-wrap items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            {mode === "group" ? <Users className="size-5" /> : <UserRound className="size-5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[14.5px] font-bold text-foreground">{mode === "group" ? "Select Groups" : "Select Individuals"}</p>
                            <p className="text-[12px] text-muted-foreground">{mode === "group" ? "Choose one or more groups to invite." : "Choose specific guests from your guest list."}</p>
                        </div>
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11.5px] font-semibold text-primary">
                            {mode === "group" ? `${groups.size} Group${groups.size === 1 ? "" : "s"} Selected` : `${picked.size} Guest${picked.size === 1 ? "" : "s"} Selected`}
                        </span>
                    </div>

                    <div className="mb-3 flex gap-2">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9 text-[12.5px]"
                                placeholder={mode === "group" ? "Search groups..." : "Search by name, mobile or email..."} />
                        </div>
                        {mode === "individual" && (
                            <Select value={groupFilter} onValueChange={setGroupFilter}>
                                <SelectTrigger className="h-9 w-[150px] text-[12.5px]" aria-label="Filter by group"><Filter className="size-3.5" /><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All groups</SelectItem>
                                    {allGroups.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                                    <SelectItem value="none">No group</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {audience.isLoading ? (
                        <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                    ) : guests.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border py-10 text-center">
                            <p className="text-[13px] font-semibold text-foreground">No guests on this event yet</p>
                            <p className="mt-1 text-[12px] text-muted-foreground">Add guests in the Guests menu, then come back to share.</p>
                        </div>
                    ) : mode === "group" ? (
                        <div className="overflow-hidden rounded-lg border border-border">
                            <table className="w-full text-[12.5px]">
                                <thead className="bg-muted/40 text-left text-[11.5px] font-semibold text-muted-foreground">
                                    <tr>
                                        <th className="w-10 px-3 py-2">
                                            <Checkbox aria-label="Select all groups" checked={groupRows.length > 0 && groupRows.every((g) => groups.has(g.id))}
                                                onCheckedChange={(v) => setGroups(v === true ? new Set([...groups, ...groupRows.map((g) => g.id)]) : new Set([...groups].filter((id) => !groupRows.some((g) => g.id === id))))} />
                                        </th>
                                        <th className="px-2 py-2">Group Name</th>
                                        <th className="px-3 py-2 text-right">Total Guests</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupRows.length === 0 ? (
                                        <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">{allGroups.length ? "No groups match." : "No groups on this event's guests. Use By Individuals."}</td></tr>
                                    ) : groupRows.map((g) => (
                                        <tr key={g.id} className="border-t border-border" data-group={g.name}>
                                            <td className="px-3 py-2"><Checkbox aria-label={`Select ${g.name}`} checked={groups.has(g.id)} onCheckedChange={(v) => setGroups(toggleSet(groups, g.id, v === true))} /></td>
                                            <td className="px-2 py-2">
                                                <span className="flex items-center gap-2.5 font-semibold text-foreground">
                                                    <span className="grid size-7 place-items-center rounded-full" style={{ backgroundColor: `${g.color || "#E91E63"}22`, color: g.color || "#E91E63" }}><Users className="size-3.5" /></span>
                                                    {g.name}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold">{g.guest_count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
                            <table className="w-full text-[12.5px]">
                                <thead className="sticky top-0 bg-muted/60 text-left text-[11.5px] font-semibold text-muted-foreground backdrop-blur">
                                    <tr>
                                        <th className="w-10 px-3 py-2">
                                            <Checkbox aria-label="Select all guests" checked={guestRows.length > 0 && guestRows.every((g) => picked.has(g.id))}
                                                onCheckedChange={(v) => setPicked(v === true ? new Set([...picked, ...guestRows.map((g) => g.id)]) : new Set([...picked].filter((id) => !guestRows.some((g) => g.id === id))))} />
                                        </th>
                                        <th className="px-2 py-2">Guest Name</th>
                                        <th className="px-2 py-2">Contact</th>
                                        <th className="px-2 py-2">Group</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {guestRows.length === 0 ? (
                                        <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No guests match.</td></tr>
                                    ) : guestRows.map((g) => (
                                        <tr key={g.id} className={cn("border-t border-border", !reachableFor(g) && "opacity-60")} data-guest={g.name}>
                                            <td className="px-3 py-2"><Checkbox aria-label={`Select ${g.name}`} checked={picked.has(g.id) || (!!g.group && groups.has(g.group.id))} disabled={!!g.group && groups.has(g.group.id)}
                                                onCheckedChange={(v) => setPicked(toggleSet(picked, g.id, v === true))} /></td>
                                            <td className="px-2 py-2">
                                                <span className="flex items-center gap-2 font-semibold text-foreground">
                                                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[10.5px] font-bold text-primary">{initials(g.name)}</span>
                                                    <span className="truncate">{g.name}</span>
                                                </span>
                                            </td>
                                            <td className="px-2 py-2 text-muted-foreground">
                                                {channel === "email" ? (
                                                    <span className="flex items-center gap-1.5"><Mail className="size-3.5" />{g.email || "No email"}</span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5"><FontAwesomeIcon icon={faWhatsapp} className="!size-3.5 text-emerald-500" />{[g.dial_code, g.whatsapp || g.mobile].filter(Boolean).join(" ") || "No number"}</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-2">
                                                {g.group ? <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${g.group.color || "#2457D6"}1A`, color: g.group.color || "#2457D6" }}>{g.group.name}</span> : <span className="text-muted-foreground">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                {selectedIds.size > 0 && willReach < selectedIds.size && (
                    <p className="text-[11.5px] text-amber-600">
                        {selectedIds.size - willReach} selected guest{selectedIds.size - willReach === 1 ? " has" : "s have"} no {channel === "email" ? "email address" : "mobile number"} and will be skipped.
                    </p>
                )}
            </section>

            {/* ── Channel + message ────────────────────────────────────── */}
            <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5">
                <div>
                    <p className="mb-2 text-[15px] font-bold text-foreground">Select Sharing Channel <span className="text-destructive">*</span></p>
                    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Sharing channel">
                        {([
                            { v: "whatsapp", title: "WhatsApp", text: "Send instantly via WhatsApp", icon: <FontAwesomeIcon icon={faWhatsapp} className="!size-6 text-emerald-500" />, tint: "bg-emerald-50 dark:bg-emerald-500/10" },
                            { v: "email", title: "Email", text: "Send a formatted invitation via email", icon: <Mail className="size-6 text-sky-600" />, tint: "bg-sky-50 dark:bg-sky-500/10" },
                        ] as const).map((c) => (
                            <button key={c.v} type="button" role="radio" aria-checked={channel === c.v} onClick={() => switchChannel(c.v)}
                                className={cn("relative flex items-center gap-3 rounded-xl border p-3 text-left transition",
                                    channel === c.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                                <span className={cn("grid size-11 shrink-0 place-items-center rounded-lg", c.tint)}>{c.icon}</span>
                                <span className="min-w-0">
                                    <span className="block text-[14px] font-bold text-foreground">{c.title}</span>
                                    <span className="block text-[11.5px] text-muted-foreground">{c.text}</span>
                                </span>
                                <span className={cn("absolute right-3 top-3 grid size-5 place-items-center rounded-full border-2", channel === c.v ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                                    {channel === c.v && <Check className="size-3" />}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {channel === "email" && (
                    <div>
                        <p className="mb-1.5 text-[14px] font-bold text-foreground">Email Subject <span className="text-destructive">*</span></p>
                        <Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className="h-10 text-[13px]" aria-label="Email subject" />
                    </div>
                )}

                <div>
                    <p className="mb-1.5 text-[14px] font-bold text-foreground">{channel === "email" ? "Email Invitation Message" : "Invitation Message"} <span className="text-destructive">*</span></p>
                    <div className="overflow-hidden rounded-xl border border-primary/40">
                        <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-2 py-1.5">
                            <Tool label="Undo" onClick={() => history("undo")}><Undo2 className="size-4" /></Tool>
                            <Tool label="Redo" onClick={() => history("redo")}><Redo2 className="size-4" /></Tool>
                            <span className="mx-1 h-5 w-px bg-border" />
                            <Tool label="Bold" onClick={() => insert("*", "*", "bold")}><Bold className="size-4" /></Tool>
                            <Tool label="Italic" onClick={() => insert("_", "_", "italic")}><Italic className="size-4" /></Tool>
                            <Tool label="Strikethrough" onClick={() => insert("~", "~", "text")}><Strikethrough className="size-4" /></Tool>
                            <span className="mx-1 h-5 w-px bg-border" />
                            <Tool label="Bulleted list" onClick={() => linePrefix(false)}><List className="size-4" /></Tool>
                            <Tool label="Numbered list" onClick={() => linePrefix(true)}><ListOrdered className="size-4" /></Tool>
                            <Tool label="Insert invitation link" onClick={() => insert("{invitation_link}")}><Link2 className="size-4" /></Tool>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button type="button" aria-label="Emoji" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><Smile className="size-4" /></button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="grid w-48 grid-cols-6 gap-1 p-2">
                                    {EMOJI.map((e) => (
                                        <button key={e} type="button" className="grid size-7 place-items-center rounded hover:bg-muted" onClick={() => insert(e)}>{e}</button>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <span className="mx-1 h-5 w-px bg-border" />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button type="button" className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-foreground hover:bg-muted">
                                        <Braces className="size-4" />Placeholders<ChevronDown className="size-3.5" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {PLACEHOLDERS.map((p) => (
                                        <DropdownMenuItem key={p.token} onClick={() => insert(p.token)} className="text-[12.5px]">
                                            <span className="font-mono text-primary">{p.token}</span><span className="ml-2 text-muted-foreground">{p.label}</span>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <textarea ref={box} value={message} maxLength={MAX_CHARS} onChange={(e) => setMessage(e.target.value)} rows={7}
                            aria-label="Invitation message" className="block w-full resize-y bg-transparent px-4 py-3 text-[13.5px] leading-relaxed outline-none" />
                        <div className="border-t border-border bg-muted/20 px-4 py-1.5 text-right text-[11.5px] text-muted-foreground">
                            Characters: {message.length} / {MAX_CHARS}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex h-10 items-center gap-2.5 rounded-lg border border-border px-3 text-[13px] font-semibold">
                        <CalendarDays className="size-4 text-primary" />Schedule for Later
                        <Switch checked={schedule} onCheckedChange={setSchedule} aria-label="Schedule for later" />
                    </label>
                    <label className={cn("flex h-10 items-center gap-2 rounded-lg border border-border px-3", !schedule && "opacity-50")}>
                        <CalendarDays className="size-4 text-muted-foreground" />
                        <input type="date" value={date} min={todayISO()} disabled={!schedule} onChange={(e) => setDate(e.target.value)} className="bg-transparent text-[13px] outline-none" aria-label="Schedule date" />
                    </label>
                    <label className={cn("flex h-10 items-center gap-2 rounded-lg border border-border px-3", !schedule && "opacity-50")}>
                        <Clock className="size-4 text-muted-foreground" />
                        <input type="time" value={time} disabled={!schedule} onChange={(e) => setTime(e.target.value)} className="bg-transparent text-[13px] outline-none" aria-label="Schedule time" />
                    </label>
                </div>

                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    WhatsApp and email sending are not connected yet. Your invitation is saved for each guest and goes out once they are.
                </p>

                <div className="mt-auto flex flex-wrap gap-2.5 border-t border-border pt-4">
                    <Button variant="outline" className="h-10 text-[13px]" onClick={() => setPreview(true)}>
                        <Eye className="size-4" />{channel === "email" ? "Preview Email" : "Preview Message"}
                    </Button>
                    <Button variant="outline" className="h-10 text-[13px]" onClick={saveDraft}><Download className="size-4" />Save Draft</Button>
                    <Button className="ml-auto h-10 px-5 text-[13px] font-semibold" disabled={send.isPending || !selectedIds.size} onClick={submit}>
                        {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                        {send.isPending ? "Sending..." : schedule ? "Schedule Invitation" : "Send Invitation"}
                    </Button>
                </div>
            </section>

            <Dialog open={preview} onOpenChange={setPreview}>
                <DialogContent className="sm:max-w-md">
                    <DialogTitle className="text-[15px]">{channel === "email" ? "Email preview" : "WhatsApp preview"}</DialogTitle>
                    <DialogDescription className="text-[12px]">As {sample} would read it.</DialogDescription>
                    {channel === "email" && <p className="text-[13px]"><span className="text-muted-foreground">Subject: </span><span className="font-semibold">{subject}</span></p>}
                    <div className={cn("whitespace-pre-wrap rounded-xl p-3 text-[13px] leading-relaxed", channel === "whatsapp" ? "bg-[#DCF8C6] text-neutral-900" : "border border-border bg-muted/30")}>
                        {renderInvite(message, event, sample, link)}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Tool({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" aria-label={label} title={label} onClick={onClick}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            {children}
        </button>
    );
}

/** After Send (design 04_0): what was saved, and where to go next. */
export function SentScreen({
    result, onAnother, onView,
}: { result: SendInvitationResult; onAnother: () => void; onView: () => void }) {
    // The server always returns one of the two (sent_at now, or scheduled_at).
    const when = new Date(result.scheduled_at ?? result.sent_at ?? "");
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const h = when.getHours();
    const scheduled = result.status === "scheduled";
    return (
        <section className="flex flex-col items-center gap-5 rounded-xl border border-border bg-gradient-to-b from-card to-primary/5 px-5 py-10 text-center">
            <div className="relative">
                <span className="grid size-28 place-items-center rounded-3xl bg-primary text-primary-foreground shadow-lg"><Mail className="size-14" /></span>
                <span className="absolute -right-3 -top-3 grid size-11 place-items-center rounded-full bg-emerald-500 text-white shadow"><Check className="size-6" /></span>
            </div>
            <div>
                <h2 className="text-[26px] font-bold text-foreground">{scheduled ? "Invitation Scheduled!" : "Invitation Sent Successfully!"}</h2>
                <p className="mt-1 text-[14px] text-muted-foreground">
                    {scheduled ? "Your invitation is scheduled for the selected guests." : "Your event invitation has been saved for the selected guests."}
                </p>
                <p className="mx-auto mt-2 max-w-lg text-[12px] text-amber-700 dark:text-amber-300">
                    WhatsApp and email are not connected yet — it reaches the guests once they are.
                </p>
            </div>
            <div className="grid w-full max-w-3xl grid-cols-2 gap-4 rounded-xl border border-primary/20 bg-card p-4 text-left md:grid-cols-4">
                <Stat icon={<Users className="size-6" />} label="Recipients" value={`${result.recipients} Guest${result.recipients === 1 ? "" : "s"}`} />
                <Stat icon={<Send className="size-6" />} label="Delivery Channel" value={result.channel === "email" ? "Email" : "WhatsApp"} />
                <Stat icon={<CalendarDays className="size-6" />} label={scheduled ? "Scheduled For" : "Sent On"} value={`${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`} />
                <Stat icon={<Clock className="size-6" />} label={scheduled ? "At" : "Sent At"} value={`${String(h % 12 || 12).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`} />
            </div>
            <div className="flex flex-wrap justify-center gap-3">
                <Button variant="outline" className="h-11 px-5 text-[13.5px]" asChild><Link href="/dashboard"><Home className="size-4" />Return to Dashboard</Link></Button>
                <Button variant="outline" className="h-11 px-5 text-[13.5px]" onClick={onAnother}><Plus className="size-4" />Send Another Invitation</Button>
                <Button className="h-11 px-6 text-[13.5px] font-semibold" onClick={onView}><FileText className="size-4" />View Invitations</Button>
            </div>
        </section>
    );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className="text-primary">{icon}</span>
            <span>
                <span className="block text-[12px] text-muted-foreground">{label}</span>
                <span className="block text-[16px] font-bold text-foreground">{value}</span>
            </span>
        </div>
    );
}
