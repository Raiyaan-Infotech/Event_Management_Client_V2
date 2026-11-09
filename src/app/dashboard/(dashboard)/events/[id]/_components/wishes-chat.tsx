"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ArrowLeft, BarChart3, CalendarDays, CheckCheck, Copy, Crown, Eye, EyeOff, Filter, Heart, ImagePlus, Info, Loader2, Mail,
    MessageSquare, MoreHorizontal, Phone, Reply, Send, Smile, Trash2, UserCheck, UserRound, UserX, X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
    ActionSheet, CountTabs, DetailRow, DetailSection, Notice, PersonAvatar, RowActions, SearchBox, StatusPill, type RowAction,
} from "@/components/module-kit";
import type { Tone } from "@/components/module-kit/tones";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import type { ClientEvent } from "@/hooks/use-client-events";
import { useEventParticipants, useRemoveParticipant, type ParticipantRow } from "@/hooks/use-event-participants";
import {
    useCreateWish, useMarkWishThreadRead, useWishCommentActions, type Wish, type WishComment, type WishesPage,
} from "@/hooks/use-event-engagement";

/**
 * Wed Wishes as conversations — Jamal's chat design (2026-11-09), the organizer's view on the web.
 * Left: one conversation per participant (+ "Event Organizer" for the organizer's own posts), with
 * All / Unread / Hidden and a filter. Middle: that person's wishes, oldest first, as chat bubbles,
 * with the organizer's replies on the right. A reply is a PUBLIC comment on the wish (Jamal: everyone
 * sees it). Each wish keeps its ⋯ (View, Edit, Approve / Publish, Hide, Send In-App Message, Manage
 * Comments, Delete). Participant Details opens on the right. The mobile app has its own participant view.
 */

export type ChatTab = "all" | "unread" | "hidden";
export type ChatStatus = "all" | "pending" | "reported" | "blocked";
export type ChatView = { tab: ChatTab; status: ChatStatus };
export type ChatPanel = "view" | "block" | "message" | "comments";

const ORG = "org";
const MAX_REPLY = 500;
const EMOJIS = ["❤️", "😍", "🥰", "😊", "🙏", "🎉", "🥳", "💐", "🌸", "💍", "👰", "🤵", "✨", "💖", "💕", "👏", "😂", "🤗", "🌹", "🎊", "💫", "👍", "😇", "💝"];

type Thread = {
    key: string;
    isOrg: boolean;
    name: string;
    avatar: string | null;
    participantId: number | null;
    /** Oldest first. */
    wishes: Wish[];
    lastAt: number;
    preview: string;
    unread: number;
    online: boolean;
    hidden: number;
    pending: number;
    reported: number;
    blocked: boolean;
    likes: number;
};

const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "");
const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
const dayStart = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** "10:24 AM" today, "Yesterday", else "02 Nov". */
function listTime(t: number) {
    if (!t) return "";
    const today = dayStart(Date.now());
    if (t >= today) return new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (t >= today - 86400000) return "Yesterday";
    return new Date(t).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

/** The pill between days: "Today, 10 Nov 2026". */
function dayLabel(t: number) {
    const full = new Date(t).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    const today = dayStart(Date.now());
    if (t >= today) return `Today, ${full}`;
    if (t >= today - 86400000) return `Yesterday, ${full}`;
    return full;
}

const previewOf = (w: Wish) => w.message || (w.post_type === "video" ? "🎥 Video" : w.post_type === "image" ? "📷 Photo" : "");
const replyPreview = (r: WishComment) => r.message || (r.photo ? "📷 Photo" : "");
const keyOf = (w: Wish) => w.thread_key ?? (w.added_by_organizer ? ORG : `p:${w.participant_id ?? w.guest_name}`);

function buildThreads(wishes: Wish[], info: WishesPage["threads"]): Thread[] {
    const groups = new Map<string, Wish[]>();
    for (const w of wishes) {
        const k = keyOf(w);
        const list = groups.get(k);
        if (list) list.push(w); else groups.set(k, [w]);
    }
    return [...groups.entries()].map(([key, list]) => {
        const asc = [...list].sort((a, b) => ms(a.created_at) - ms(b.created_at) || a.id - b.id);
        const latest = asc[asc.length - 1];
        const isOrg = key === ORG;
        // The newest thing said, wish or reply.
        let lastAt = ms(latest.created_at);
        let preview = previewOf(latest);
        for (const w of asc) {
            for (const r of w.replies ?? []) {
                const at = ms(r.created_at);
                if (at >= lastAt) { lastAt = at; preview = `${r.added_by_organizer && !isOrg ? "You: " : ""}${replyPreview(r)}`; }
            }
        }
        const withPhoto = [...asc].reverse().find((w) => w.avatar);
        return {
            key,
            isOrg,
            name: isOrg ? "Event Organizer" : latest.guest_name,
            avatar: withPhoto?.avatar ?? null,
            participantId: [...asc].reverse().find((w) => w.participant_id)?.participant_id ?? null,
            wishes: asc,
            lastAt,
            preview,
            unread: info?.[key]?.unread ?? 0,
            online: info?.[key]?.online ?? false,
            hidden: asc.filter((w) => w.status !== "visible").length,
            pending: asc.filter((w) => w.is_flagged).length,
            reported: asc.filter((w) => (w.report_count ?? 0) > 0).length,
            blocked: asc.some((w) => w.author_blocked),
            likes: asc.reduce((n, w) => n + w.like_count, 0),
        };
    }).sort((a, b) => b.lastAt - a.lastAt);
}

const SIDE_LABEL = { bride: "Bride Side", groom: "Groom Side" } as const;
const sideOf = (p?: ParticipantRow) => (p?.side ? SIDE_LABEL[p.side] : p?.rsvp_side ? SIDE_LABEL[p.rsvp_side] : null);

/** Avatar with the green Online dot. */
function ChatAvatar({ name, photo, size, online }: { name: string; photo: string | null; size: number; online?: boolean }) {
    return (
        <span className="relative shrink-0">
            <PersonAvatar name={name} photo={photo} size={size} rounded="full" />
            {online && <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-card bg-success" aria-label="Online" />}
        </span>
    );
}

export function WishesChat({ event, data, wishes, view, onView, bubbleActions, onPanel }: {
    event: ClientEvent;
    data: WishesPage;
    wishes: Wish[];
    view: ChatView;
    onView: (v: ChatView) => void;
    /** The ⋯ menu of one wish bubble (from the Wishes page, so the panels stay shared). */
    bubbleActions: (w: Wish) => RowAction[];
    onPanel: (kind: ChatPanel, w: Wish) => void;
}) {
    const [search, setSearch] = useState("");
    const [picked, setPicked] = useState<string | null>(null);
    /** Phones: the list OR the conversation. */
    const [phoneThread, setPhoneThread] = useState(false);
    const [details, setDetails] = useState(false);
    const [removing, setRemoving] = useState(false);
    const participants = useEventParticipants(event.id);
    const byId = useMemo(() => new Map((participants.data ?? []).map((p) => [p.id, p])), [participants.data]);

    const threads = useMemo(() => buildThreads(wishes, data.threads), [wishes, data.threads]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return threads.filter((t) =>
            (view.status === "all"
                || (view.status === "pending" && t.pending > 0)
                || (view.status === "reported" && t.reported > 0)
                || (view.status === "blocked" && t.blocked))
            && (!q || t.name.toLowerCase().includes(q) || t.wishes.some((w) => w.message.toLowerCase().includes(q))));
    }, [threads, search, view.status]);
    const counts = { all: filtered.length, unread: filtered.filter((t) => t.unread > 0).length, hidden: filtered.filter((t) => t.hidden > 0).length };
    const shown = view.tab === "unread" ? filtered.filter((t) => t.unread > 0) : view.tab === "hidden" ? filtered.filter((t) => t.hidden > 0) : filtered;
    const selected = threads.find((t) => t.key === picked) ?? shown[0] ?? null;
    const participant = selected?.participantId ? byId.get(selected.participantId) : undefined;
    const latestOf = (t: Thread) => t.wishes[t.wishes.length - 1];

    // Opening a conversation reads it (and again when something new arrives while it is open).
    const { mutate: markRead } = useMarkWishThreadRead(event.id);
    const selectedKey = selected?.key ?? null;
    const unreadOpen = selected?.unread ?? 0;
    useEffect(() => {
        if (selectedKey && unreadOpen > 0 && (selectedKey === ORG || selectedKey.startsWith("c:"))) markRead(selectedKey);
    }, [selectedKey, unreadOpen, markRead]);

    const statusLabel: Record<ChatStatus, string> = { all: "All conversations", pending: "Pending review", reported: "Reported", blocked: "Blocked participants" };

    return (
        <div className="grid h-[calc(100vh-200px)] min-h-[560px] min-w-0 gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            {/* ── Conversations ── */}
            <section className={cn("min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card", phoneThread ? "hidden lg:flex" : "flex")}>
                <div className="flex flex-col gap-2.5 border-b border-border p-3">
                    <p className="text-[16px] font-bold">Conversations ({threads.length})</p>
                    <div className="flex items-center gap-2">
                        <SearchBox value={search} onChange={setSearch} placeholder="Search participant or message..." className="min-w-0" />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="outline" className={cn("size-8 shrink-0", view.status !== "all" && "border-primary text-primary")} aria-label="Filter">
                                    <Filter className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel className="text-[11.5px] text-muted-foreground">Show</DropdownMenuLabel>
                                {(Object.keys(statusLabel) as ChatStatus[]).map((s) => (
                                    <DropdownMenuItem key={s} onClick={() => onView({ ...view, status: s })} className={cn("text-[13px]", view.status === s && "font-semibold text-primary")}>
                                        {statusLabel[s]}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <CountTabs stretch value={view.tab} onChange={(tab) => onView({ ...view, tab })} tabs={[
                        { value: "all", label: "All", count: counts.all },
                        { value: "unread", label: "Unread", count: counts.unread },
                        { value: "hidden", label: "Hidden", count: counts.hidden },
                    ]} />
                    {view.status !== "all" && (
                        <button type="button" onClick={() => onView({ ...view, status: "all" })} className="flex items-center gap-1 self-start rounded-full bg-primary/10 px-2.5 py-0.5 text-[11.5px] font-medium text-primary">
                            {statusLabel[view.status]} <X className="size-3" />
                        </button>
                    )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {threads.length === 0 ? (
                        <p className="p-6 text-center text-[12.5px] text-muted-foreground">No wishes yet. Wishes your guests post in the event app appear here.</p>
                    ) : shown.length === 0 ? (
                        <p className="p-6 text-center text-[12.5px] text-muted-foreground">No conversations match.</p>
                    ) : shown.map((t) => (
                        <button key={t.key} type="button" onClick={() => { setPicked(t.key); setPhoneThread(true); }}
                            className={cn("flex w-full items-center gap-3 border-b border-border/60 px-3 py-3 text-left transition",
                                selected?.key === t.key ? "bg-primary/10" : "hover:bg-muted/50")}>
                            <ChatAvatar name={t.name} photo={t.avatar} size={42} online={t.online} />
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-1 truncate text-[13.5px] font-bold">
                                        {t.isOrg && <Crown className="size-3.5 shrink-0 text-amber-500" />}
                                        <span className="truncate">{t.name}</span>
                                    </span>
                                    <span className={cn("shrink-0 text-[11px]", t.unread ? "font-semibold text-primary" : "text-muted-foreground")}>{listTime(t.lastAt)}</span>
                                </span>
                                <span className="mt-0.5 flex items-center justify-between gap-2">
                                    <span className={cn("truncate text-[12.5px]", t.unread ? "font-medium text-foreground" : "text-muted-foreground")}>{t.preview}</span>
                                    <span className="flex shrink-0 items-center gap-1">
                                        {t.blocked && <UserX className="size-3.5 text-destructive" aria-label="Blocked" />}
                                        {t.hidden > 0 && <EyeOff className="size-3.5 text-muted-foreground" aria-label="Has hidden wishes" />}
                                        {t.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{t.unread}</span>}
                                    </span>
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            </section>

            {/* ── The conversation ── */}
            <section className={cn("min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card", phoneThread ? "flex" : "hidden lg:flex")}>
                {selected ? (
                    <ThreadView
                        key={selected.key}
                        eventId={event.id}
                        thread={selected}
                        participant={participant}
                        bubbleActions={bubbleActions}
                        onPanel={onPanel}
                        onBack={() => setPhoneThread(false)}
                        onDetails={() => setDetails(true)}
                        onRemove={() => setRemoving(true)}
                    />
                ) : (
                    <div className="grid flex-1 place-items-center p-6 text-center text-[13px] text-muted-foreground">
                        <span><MessageSquare className="mx-auto mb-2 size-8 text-primary/40" />Pick a conversation to read the wishes.</span>
                    </div>
                )}
            </section>

            {details && selected && !selected.isOrg && (
                <ParticipantDetails thread={selected} participant={participant} loading={participants.isLoading}
                    onClose={() => setDetails(false)}
                    onMessage={() => { setDetails(false); onPanel("message", latestOf(selected)); }} />
            )}
            {removing && selected?.participantId && (
                <RemoveParticipant eventId={event.id} participantId={selected.participantId} name={selected.name} onClose={() => setRemoving(false)} />
            )}
        </div>
    );
}

/* ── One conversation ────────────────────────────────────────────────────── */

/** `day` = draw the date pill above it; `quote` = the reply is not right after its wish. */
type Item = ({ kind: "wish"; wish: Wish } | { kind: "reply"; reply: WishComment; wish: Wish; quote: Wish | null }) & { at: number; day: boolean };

function ThreadView({ eventId, thread, participant, bubbleActions, onPanel, onBack, onDetails, onRemove }: {
    eventId: number; thread: Thread; participant?: ParticipantRow;
    bubbleActions: (w: Wish) => RowAction[]; onPanel: (kind: ChatPanel, w: Wish) => void;
    onBack: () => void; onDetails: () => void; onRemove: () => void;
}) {
    const [replyTo, setReplyTo] = useState<Wish | null>(null);
    const scroller = useRef<HTMLDivElement>(null);
    const latest = thread.wishes[thread.wishes.length - 1];
    const items = useMemo<Item[]>(() => {
        const raw = thread.wishes
            .flatMap((w) => [
                { kind: "wish" as const, at: ms(w.created_at), wish: w },
                ...(w.replies ?? []).map((r) => ({ kind: "reply" as const, at: ms(r.created_at), reply: r, wish: w })),
            ])
            .sort((a, b) => a.at - b.at);
        return raw.map((it, i): Item => {
            const prev = raw[i - 1];
            const newDay = !prev || dayStart(prev.at) !== dayStart(it.at);
            if (it.kind === "wish") return { ...it, day: newDay };
            // No quote when the reply sits right under its wish (or under another reply to it).
            return { ...it, day: newDay, quote: prev && prev.wish.id === it.wish.id ? null : it.wish };
        });
    }, [thread.wishes]);

    // Newest at the bottom, in view.
    useEffect(() => {
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [items.length]);

    const side = sideOf(participant);

    return (
        <>
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Button size="icon" variant="ghost" className="size-8 lg:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="size-4" /></Button>
                <ChatAvatar name={thread.name} photo={thread.avatar} size={42} online={thread.online} />
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[16px] font-bold">
                        {thread.isOrg && <Crown className="size-4 text-amber-500" />} {thread.name}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                        {thread.isOrg ? "Your posts as the organizer" : <>{[side, "Participant"].filter(Boolean).join(" • ")}</>}
                        {thread.online && <span className="flex items-center gap-1 font-semibold text-success"><span className="size-2 rounded-full bg-success" /> Online</span>}
                        {thread.blocked && <StatusPill tone="danger" icon={UserX}>Blocked</StatusPill>}
                    </p>
                </div>
                {!thread.isOrg && (
                    <div className="flex items-center gap-2">
                        <Button size="icon" variant="outline" className="size-9 rounded-full" onClick={onDetails} aria-label="Participant details" title="Participant Details">
                            <Info className="size-4" />
                        </Button>
                        <Button size="icon" variant="outline" className={cn("size-9 rounded-full", thread.blocked ? "text-success" : "border-primary/30 bg-primary/5 text-primary hover:text-primary")}
                            onClick={() => onPanel("block", latest)} aria-label={thread.blocked ? "Unblock participant" : "Block participant"} title={thread.blocked ? "Unblock Participant" : "Block Participant"}>
                            {thread.blocked ? <UserCheck className="size-4" /> : <UserX className="size-4" />}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="outline" className="size-9 rounded-full" aria-label="More"><MoreHorizontal className="size-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={onDetails}><UserRound className="size-4 text-muted-foreground" /> Participant Details</DropdownMenuItem>
                                {thread.participantId && (
                                    <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={() => onPanel("message", latest)}><Mail className="size-4 text-muted-foreground" /> Send In-App Message</DropdownMenuItem>
                                )}
                                {thread.participantId && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="gap-2.5 py-2 text-[13px] text-destructive focus:text-destructive" onClick={onRemove}>
                                            <Trash2 className="size-4 text-destructive" /> Remove Participant
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </header>

            <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-primary/[0.03] px-4 py-4">
                {items.map((it) => {
                    const sep = it.day ? <DayPill at={it.at} /> : null;
                    if (it.kind === "wish") {
                        return (
                            <div key={`w-${it.wish.id}`} className="contents">
                                {sep}
                                <WishBubble wish={it.wish} mine={thread.isOrg} actions={bubbleActions(it.wish)}
                                    onReply={() => setReplyTo(it.wish)} onOpen={() => onPanel("view", it.wish)} onComments={() => onPanel("comments", it.wish)} />
                            </div>
                        );
                    }
                    return (
                        <div key={`r-${it.reply.id}`} className="contents">
                            {sep}
                            <ReplyBubble eventId={eventId} reply={it.reply} quote={it.quote} name={thread.name} photo={thread.avatar} />
                        </div>
                    );
                })}
            </div>

            <Composer eventId={eventId} thread={thread} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />
        </>
    );
}

function DayPill({ at }: { at: number }) {
    return (
        <div className="flex justify-center py-1">
            <span className="rounded-full border border-border bg-card px-3 py-1 text-[11.5px] font-semibold text-muted-foreground shadow-xs">{dayLabel(at)}</span>
        </div>
    );
}

const STATUS_PILL = (w: Wish): { label: string; tone: Tone } | null =>
    w.status === "blocked" ? { label: "Blocked", tone: "danger" }
        : w.is_flagged ? { label: "Pending Review", tone: "warning" }
            : w.status === "hidden" ? { label: "Hidden", tone: "violet" }
                : null;

function WishMediaThumb({ wish, onOpen }: { wish: Wish; onOpen: () => void }) {
    if (wish.post_type === "video" && wish.video_url) {
        return (
            <div className="relative w-full max-w-[320px] overflow-hidden rounded-xl bg-black">
                <video src={mediaUrl(wish.video_url)} poster={mediaUrl(wish.thumbnail_url) ?? undefined} controls preload="none" className="aspect-video w-full object-contain" />
                {wish.duration_seconds ? (
                    <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        {Math.floor(wish.duration_seconds / 60)}:{String(wish.duration_seconds % 60).padStart(2, "0")}
                    </span>
                ) : null}
            </div>
        );
    }
    const src = wish.photo ?? wish.thumbnail_url;
    if (wish.post_type === "image" && src) {
        return (
            <button type="button" onClick={onOpen} className="block overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(src)} alt="" className="max-h-[240px] w-auto max-w-full rounded-xl object-cover transition hover:opacity-90" />
            </button>
        );
    }
    return null;
}

function WishBubble({ wish, mine, actions, onReply, onOpen, onComments }: {
    wish: Wish; mine: boolean; actions: RowAction[]; onReply: () => void; onOpen: () => void; onComments: () => void;
}) {
    const pill = STATUS_PILL(wish);
    const reported = (wish.report_count ?? 0) > 0;
    return (
        <div className={cn("group flex items-start gap-2", mine && "flex-row-reverse")}>
            {mine
                ? <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-[12px] font-bold text-primary"><Crown className="size-4 text-amber-500" /></span>
                : <PersonAvatar name={wish.guest_name} photo={wish.avatar} size={36} rounded="full" />}
            <div className={cn("flex max-w-[78%] min-w-0 flex-col gap-2 rounded-2xl border px-3.5 py-2.5 shadow-xs",
                mine ? "rounded-tr-sm border-primary/20 bg-primary/10" : "rounded-tl-sm border-border bg-card",
                wish.status !== "visible" && "opacity-75")}>
                {mine && <p className="flex items-center gap-1 text-[12px] font-bold text-primary"><Crown className="size-3.5 text-amber-500" /> {wish.guest_name}</p>}
                {(pill || reported || wish.audience !== "both") && (
                    <span className="flex flex-wrap gap-1">
                        {wish.audience !== "both" && <StatusPill tone="primary">To {wish.audience === "bride" ? "Bride" : "Groom"}</StatusPill>}
                        {pill && <StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
                        {reported && <StatusPill tone="danger">Reported ({wish.report_count})</StatusPill>}
                    </span>
                )}
                <WishMediaThumb wish={wish} onOpen={onOpen} />
                {wish.message && <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed">{wish.message}</p>}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="text-[11px] text-muted-foreground">{timeOf(wish.created_at)}</span>
                    <span className="flex items-center gap-2">
                        <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11.5px] font-semibold text-primary">
                            <Heart className="size-3 fill-current" /> {wish.like_count}
                        </span>
                        {(wish.comment_count ?? 0) > 0 && (
                            <button type="button" onClick={onComments} className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-primary" title="Manage Comments">
                                <MessageSquare className="size-3" /> {wish.comment_count}
                            </button>
                        )}
                        <button type="button" onClick={onReply} className="flex items-center gap-1 text-[12px] font-semibold text-foreground/80 hover:text-primary">
                            <Reply className="size-3.5" /> Reply
                        </button>
                    </span>
                </div>
            </div>
            <div className="pt-1 opacity-100 transition lg:opacity-60 lg:group-hover:opacity-100">
                <RowActions items={actions} compact label="Wish actions" />
            </div>
        </div>
    );
}

function ReplyBubble({ eventId, reply, quote, name, photo }: { eventId: number; reply: WishComment; quote: Wish | null; name: string; photo: string | null }) {
    const act = useWishCommentActions(eventId);
    const [deleting, setDeleting] = useState(false);
    const byOrganizer = reply.added_by_organizer;
    const items: RowAction[] = [
        reply.is_hidden
            ? { label: "Show Reply", icon: Eye, onClick: () => act.update.mutate({ id: reply.id, data: { show_in_app: true }, done: "Reply is visible again" }) }
            : { label: "Hide Reply", icon: EyeOff, onClick: () => act.update.mutate({ id: reply.id, data: { show_in_app: false }, done: "Reply hidden" }) },
        { label: "Delete Reply", icon: Trash2, onClick: () => setDeleting(true), danger: true, divider: true, hidden: !reply.can_delete },
    ];
    return (
        <div className={cn("group flex items-start gap-2", byOrganizer && "flex-row-reverse")}>
            {byOrganizer
                ? <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">EV</span>
                : <PersonAvatar name={name} photo={photo} size={36} rounded="full" />}
            <div className={cn("flex max-w-[70%] min-w-0 flex-col gap-1.5 rounded-2xl border px-3.5 py-2.5 shadow-xs",
                byOrganizer ? "rounded-tr-sm border-primary/20 bg-primary/10" : "rounded-tl-sm border-border bg-card",
                reply.is_hidden && "opacity-70")}>
                {byOrganizer && <p className="flex items-center gap-1 text-[12px] font-bold text-primary"><Crown className="size-3.5 text-amber-500" /> Event Organizer</p>}
                {quote && (
                    <p className="line-clamp-2 border-l-2 border-primary/40 pl-2 text-[11.5px] text-muted-foreground">
                        <Reply className="mr-1 inline size-3" />{previewOf(quote)}
                    </p>
                )}
                {reply.is_hidden && <span><StatusPill tone="violet">Hidden</StatusPill></span>}
                {reply.photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(reply.photo)} alt="" className="max-h-[220px] w-auto max-w-full rounded-xl object-cover" />
                )}
                {reply.message && <p className="whitespace-pre-line break-words text-[13.5px]">{reply.message}</p>}
                <span className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                    {timeOf(reply.created_at)} {byOrganizer && <CheckCheck className="size-3.5 text-primary" />}
                </span>
            </div>
            <div className="pt-1 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
                <RowActions items={items} compact label="Reply actions" />
            </div>
            <Dialog open={deleting} onOpenChange={setDeleting}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Reply?</DialogTitle>
                        <DialogDescription>This reply will be deleted for everyone. This can&apos;t be undone.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleting(false)}>Cancel</Button>
                        <Button variant="destructive" disabled={act.remove.isPending} onClick={() => act.remove.mutate(reply.id, { onSuccess: () => setDeleting(false) })}>
                            {act.remove.isPending && <Loader2 className="size-3.5 animate-spin" />} Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* ── Message box ─────────────────────────────────────────────────────────── */

function Composer({ eventId, thread, replyTo, onClearReply }: { eventId: number; thread: Thread; replyTo: Wish | null; onClearReply: () => void }) {
    const act = useWishCommentActions(eventId);
    const create = useCreateWish(eventId);
    const [text, setText] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
    const busy = act.add.isPending || create.isPending;
    // A participant's conversation: the reply goes under the picked wish, else their latest.
    const target = replyTo ?? thread.wishes[thread.wishes.length - 1];

    const pick = (f: File | undefined) => {
        if (!f) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) { toast.error("Please choose a JPG, PNG or WEBP image."); return; }
        if (f.size > 2 * 1024 * 1024) { toast.error("The image must be 2 MB or smaller."); return; }
        setFile(f);
    };
    const send = async () => {
        const message = text.trim();
        if (!message && !file) return;
        try {
            if (thread.isOrg) await create.mutateAsync({ message, audience: "both", file });
            else await act.add.mutateAsync({ wishId: target.id, message, file, quiet: true });
            setText("");
            setFile(null);
            onClearReply();
        } catch { /* the hooks showed the error */ }
    };

    return (
        <div className="border-t border-border bg-card px-3 py-3">
            {(replyTo || file) && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    {replyTo && !thread.isOrg && (
                        <span className="flex min-w-0 max-w-full items-center gap-2 rounded-lg border-l-2 border-primary bg-primary/5 px-2.5 py-1 text-[12px]">
                            <Reply className="size-3.5 shrink-0 text-primary" />
                            <span className="truncate">Replying to: {previewOf(replyTo)}</span>
                            <button type="button" onClick={onClearReply} aria-label="Cancel reply"><X className="size-3.5" /></button>
                        </span>
                    )}
                    {file && preview && (
                        <span className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={preview} alt="" className="size-14 rounded-lg object-cover" />
                            <button type="button" onClick={() => setFile(null)} aria-label="Remove photo"
                                className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background"><X className="size-3" /></button>
                        </span>
                    )}
                </div>
            )}
            <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                <Button size="icon" variant="ghost" className="size-9 shrink-0" onClick={() => fileRef.current?.click()} aria-label="Add a photo" title="Photo"><ImagePlus className="size-5" /></Button>
                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                    <PopoverTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-9 shrink-0" aria-label="Emoji" title="Emoji"><Smile className="size-5" /></Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="grid w-auto grid-cols-8 gap-1 p-2">
                        {EMOJIS.map((e) => (
                            <button key={e} type="button" className="grid size-8 place-items-center rounded-md text-[18px] hover:bg-muted"
                                onClick={() => { setText((t) => (Array.from(t).length < MAX_REPLY ? t + e : t)); setEmojiOpen(false); inputRef.current?.focus(); }}>
                                {e}
                            </button>
                        ))}
                    </PopoverContent>
                </Popover>
                <Textarea ref={inputRef} value={text} rows={1} maxLength={MAX_REPLY} disabled={busy}
                    placeholder={thread.isOrg ? "Post a wish as the organizer..." : "Type a message..."}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                    className="max-h-32 min-h-10 flex-1 resize-none rounded-xl py-2.5 !text-[13.5px]" />
                <Button size="icon" className="size-10 shrink-0 rounded-full" disabled={busy || (!text.trim() && !file)} onClick={() => void send()} aria-label="Send">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
            </div>
            {!thread.isOrg && <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">Replies are public — everyone at the event sees them under the wish.</p>}
        </div>
    );
}

/* ── Participant Details ─────────────────────────────────────────────────── */

const RSVP: Record<string, { label: string; tone: Tone }> = {
    yes: { label: "Attending", tone: "success" }, no: { label: "Not Attending", tone: "danger" },
    maybe: { label: "Maybe", tone: "warning" }, none: { label: "Awaiting Reply", tone: "muted" },
};
const ACCESS: Record<string, { label: string; tone: Tone }> = {
    active: { label: "Active", tone: "success" }, pending: { label: "Pending", tone: "warning" }, blocked: { label: "Blocked", tone: "danger" },
};

type DetailTab = "profile" | "wishes" | "media" | "comments";

function ParticipantDetails({ thread, participant: p, loading, onClose, onMessage }: {
    thread: Thread; participant?: ParticipantRow; loading: boolean; onClose: () => void; onMessage: () => void;
}) {
    const [tab, setTab] = useState<DetailTab>("profile");
    const media = thread.wishes.filter((w) => w.post_type !== "text");
    const theirReplies = thread.wishes.flatMap((w) => (w.replies ?? []).filter((r) => !r.added_by_organizer).map((r) => ({ r, w })));
    const access = p ? ACCESS[p.access ?? (p.has_joined ? "active" : "pending")] : null;
    const rsvp = p ? RSVP[p.response_type ?? "none"] ?? RSVP.none : null;
    const copy = (v: string) => { void navigator.clipboard?.writeText(v).then(() => toast.success("Copied")); };
    const joined = p?.created_at ? new Date(p.created_at).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : null;
    const name = p?.full_name || p?.name || thread.name;

    return (
        <ActionSheet open onClose={onClose} icon={UserRound} title="Participant Details" subtitle="Who wrote these wishes, and how they take part." width={540}>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
                <ChatAvatar name={name} photo={p?.photo ?? thread.avatar} size={72} online={thread.online} />
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[19px] font-bold">
                        <span className="break-words">{name}</span>
                        {access && <StatusPill tone={access.tone}>{access.label}</StatusPill>}
                    </p>
                    <p className="text-[12.5px] text-muted-foreground">{sideOf(p) ?? "Participant"}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {thread.participantId && <Button size="sm" variant="outline" onClick={onMessage}><MessageSquare className="size-3.5" /> Send Message</Button>}
                        {p?.mobile && <Button asChild size="icon" variant="outline" className="size-8"><a href={`tel:${p.mobile}`} aria-label="Call"><Phone className="size-3.5" /></a></Button>}
                        {p?.email && <Button asChild size="icon" variant="outline" className="size-8"><a href={`mailto:${p.email}`} aria-label="Email"><Mail className="size-3.5" /></a></Button>}
                    </div>
                </div>
            </div>

            <CountTabs stretch value={tab} onChange={setTab} tabs={[
                { value: "profile", label: "Profile" },
                { value: "wishes", label: "Wishes", count: thread.wishes.length },
                { value: "media", label: "Media", count: media.length },
                { value: "comments", label: "Comments", count: theirReplies.length },
            ]} />

            {tab === "profile" && (
                <>
                    {!p && !loading && <Notice tone="warning">This person is no longer a participant of this event. Their wishes stay until you hide or delete them.</Notice>}
                    {p && (
                        <>
                            <DetailSection title="Basic Details" icon={UserRound}>
                                <DetailRow label="Full Name">{name}</DetailRow>
                                <DetailRow label="Mobile Number">
                                    {p.mobile ? <span className="inline-flex items-center gap-1.5">{p.mobile}<button type="button" onClick={() => copy(p.mobile!)} aria-label="Copy mobile"><Copy className="size-3.5 text-muted-foreground" /></button></span> : null}
                                </DetailRow>
                                <DetailRow label="Email Address">
                                    {p.email ? <span className="inline-flex items-center gap-1.5 break-all">{p.email}<button type="button" onClick={() => copy(p.email!)} aria-label="Copy email"><Copy className="size-3.5 text-muted-foreground" /></button></span> : null}
                                </DetailRow>
                                <DetailRow label="Relationship">{p.relationship || sideOf(p)}</DetailRow>
                                <DetailRow label="City">{[p.city, p.state].filter(Boolean).join(", ")}</DetailRow>
                            </DetailSection>
                            <DetailSection title="Event Participation" icon={CalendarDays}>
                                <DetailRow label="Invitation Status">
                                    <StatusPill tone={p.invite_status === "invited" || p.invited_at ? "success" : "warning"}>{p.invite_status === "invited" || p.invited_at ? "Invited" : "Pending"}</StatusPill>
                                </DetailRow>
                                <DetailRow label="RSVP Status">{rsvp && <StatusPill tone={rsvp.tone}>{rsvp.label}</StatusPill>}</DetailRow>
                                <DetailRow label="Joined Date">{joined}</DetailRow>
                            </DetailSection>
                        </>
                    )}
                    <div className="rounded-xl border border-border bg-card p-4">
                        <p className="mb-3 flex items-center gap-2 text-[14px] font-bold"><BarChart3 className="size-4 text-primary" /> Activity Summary</p>
                        <div className="grid grid-cols-3 gap-2.5">
                            {[
                                { icon: MessageSquare, value: theirReplies.length, label: "Messages" },
                                { icon: Heart, value: thread.likes, label: "Likes Received" },
                                { icon: Heart, value: thread.wishes.length, label: "Wishes" },
                            ].map((s) => (
                                <div key={s.label} className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2.5">
                                    <s.icon className="size-5 shrink-0 text-primary" />
                                    <span><span className="block text-[17px] leading-5 font-bold">{s.value}</span><span className="text-[11px] text-muted-foreground">{s.label}</span></span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {tab === "wishes" && (
                <div className="flex flex-col gap-2">
                    {[...thread.wishes].reverse().map((w) => {
                        const pill = STATUS_PILL(w);
                        return (
                            <div key={w.id} className="rounded-xl border border-border bg-card p-3 text-[12.5px]">
                                <p className="line-clamp-3 break-words">{previewOf(w)}</p>
                                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                                    {new Date(ms(w.created_at)).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                                    <span className="flex items-center gap-1"><Heart className="size-3 fill-current text-primary" />{w.like_count}</span>
                                    <StatusPill tone={pill?.tone ?? "success"}>{pill?.label ?? "Published"}</StatusPill>
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}

            {tab === "media" && (media.length === 0
                ? <p className="text-[12.5px] text-muted-foreground">No photos or videos.</p>
                : (
                    <div className="grid grid-cols-3 gap-2">
                        {media.map((w) => {
                            const src = w.thumbnail_url ?? w.photo;
                            return (
                                <div key={w.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                                    {src
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img src={mediaUrl(src)} alt="" className="size-full object-cover" />
                                        : null}
                                    {w.post_type === "video" && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">Video</span>}
                                </div>
                            );
                        })}
                    </div>
                ))}

            {tab === "comments" && (theirReplies.length === 0
                ? <p className="text-[12.5px] text-muted-foreground">No replies from them yet.</p>
                : (
                    <div className="divide-y divide-border rounded-xl border border-border bg-card">
                        {theirReplies.map(({ r, w }) => (
                            <div key={r.id} className="px-3 py-2 text-[12.5px]">
                                <p className="break-words">{r.message || "📷 Photo"}</p>
                                <p className="text-[11px] text-muted-foreground">On: {previewOf(w).slice(0, 60)} · {timeOf(r.created_at)}</p>
                            </div>
                        ))}
                    </div>
                ))}
        </ActionSheet>
    );
}

function RemoveParticipant({ eventId, participantId, name, onClose }: { eventId: number; participantId: number; name: string; onClose: () => void }) {
    const remove = useRemoveParticipant();
    const qc = useQueryClient();
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Remove Participant?</DialogTitle>
                    <DialogDescription>
                        {name} will be removed from this event and lose access to it in the app. Their wishes stay until you hide or delete them.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" disabled={remove.isPending} onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" disabled={remove.isPending}
                        onClick={() => remove.mutate(participantId, {
                            onSuccess: () => {
                                qc.invalidateQueries({ queryKey: ["client", "event-module", eventId, "wishes"], refetchType: "all" });
                                onClose();
                            },
                        })}>
                        {remove.isPending && <Loader2 className="size-3.5 animate-spin" />} Remove
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
