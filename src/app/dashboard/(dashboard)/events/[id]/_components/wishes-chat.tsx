"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    Activity, ArrowLeft, CalendarDays, Check, CheckCheck, CheckSquare, Copy, Crown, ExternalLink, Eye, EyeOff, Filter,
    Heart, Image as ImageIcon, ImagePlus, Info, LayoutGrid, List, Loader2, Mail, MapPin, MessageSquare, MoreHorizontal, Pencil,
    Phone, Play, PlayCircle, Reply, Send, Smile, Trash2, UserCheck, UserRound, Users, UserX, Video, X,
} from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEventHref } from "@/lib/event-workspace";
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
    useCreateWish, useHideWishThread, useMarkWishThreadRead, useWishCommentActions, useWishCommentsMany, type Wish, type WishComment, type WishesPage,
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
export type ChatStatus = "all" | "pending" | "reported" | "blocked" | "hidden_wishes";
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
    /** Hide Chat: out of the main inbox, listed under Hidden. */
    chatHidden: boolean;
    hideNote: string | null;
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
            chatHidden: info?.[key]?.hidden ?? false,
            hideNote: info?.[key]?.hide_note ?? null,
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

/**
 * The chat's height = what is left of the screen below its top (Jamal: "fit that view" — no page
 * scroll to reach the message box). Worked out on load and on resize; 420 px at the least.
 */
function useFitHeight() {
    const ref = useRef<HTMLDivElement>(null);
    const [value, setValue] = useState<number | undefined>(undefined);
    useEffect(() => {
        const fit = () => {
            const el = ref.current;
            if (!el) return;
            // Top of the box as if the page were scrolled to the top (the window or the dashboard's own scroller).
            let scrolled = window.scrollY;
            for (let p = el.parentElement; p; p = p.parentElement) scrolled += p.scrollTop;
            const top = el.getBoundingClientRect().top + scrolled;
            setValue(Math.max(420, Math.floor(window.innerHeight - top - 16)));
        };
        fit();
        window.addEventListener("resize", fit);
        return () => window.removeEventListener("resize", fit);
    }, []);
    return [ref, value] as const;
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
    const [hiding, setHiding] = useState(false);
    const [boxRef, boxHeight] = useFitHeight();
    const participants = useEventParticipants(event.id);
    const byId = useMemo(() => new Map((participants.data ?? []).map((p) => [p.id, p])), [participants.data]);

    const threads = useMemo(() => buildThreads(wishes, data.threads), [wishes, data.threads]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return threads.filter((t) =>
            (view.status === "all"
                || (view.status === "pending" && t.pending > 0)
                || (view.status === "reported" && t.reported > 0)
                || (view.status === "blocked" && t.blocked)
                || (view.status === "hidden_wishes" && t.hidden > 0))
            && (!q || t.name.toLowerCase().includes(q) || t.wishes.some((w) => w.message.toLowerCase().includes(q))));
    }, [threads, search, view.status]);
    // All = the main inbox; Hidden = chats moved out with Hide Chat.
    const inbox = filtered.filter((t) => !t.chatHidden);
    const counts = { all: inbox.length, unread: inbox.filter((t) => t.unread > 0).length, hidden: filtered.filter((t) => t.chatHidden).length };
    const shown = view.tab === "unread" ? inbox.filter((t) => t.unread > 0) : view.tab === "hidden" ? filtered.filter((t) => t.chatHidden) : inbox;
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

    const statusLabel: Record<ChatStatus, string> = {
        all: "All conversations", pending: "Pending review", reported: "Reported", blocked: "Blocked participants", hidden_wishes: "Has hidden wishes",
    };

    return (
        <div ref={boxRef} style={{ height: boxHeight }}
            className="grid min-h-[420px] min-w-0 gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
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
                            className={cn("flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left transition",
                                selected?.key === t.key ? "bg-primary/10" : "hover:bg-muted/50")}>
                            <ChatAvatar name={t.name} photo={t.avatar} size={38} online={t.online} />
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
                        onHide={() => setHiding(true)}
                    />
                ) : (
                    <div className="grid flex-1 place-items-center p-6 text-center text-[13px] text-muted-foreground">
                        <span><MessageSquare className="mx-auto mb-2 size-8 text-primary/40" />Pick a conversation to read the wishes.</span>
                    </div>
                )}
            </section>

            {details && selected && !selected.isOrg && (
                <ParticipantDetails eventId={event.id} thread={selected} participant={participant} loading={participants.isLoading}
                    bubbleActions={bubbleActions}
                    onClose={() => setDetails(false)}
                    onMessage={() => { setDetails(false); onPanel("message", latestOf(selected)); }}
                    onOpen={onPanel}
                    onHide={() => setHiding(true)}
                    onBlock={() => onPanel("block", latestOf(selected))}
                    onRemove={() => setRemoving(true)} />
            )}
            {hiding && selected && (
                <HideChat eventId={event.id} thread={selected} side={sideOf(participant)} access={participant?.access ?? null} onClose={() => setHiding(false)} />
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

function ThreadView({ eventId, thread, participant, bubbleActions, onPanel, onBack, onDetails, onRemove, onHide }: {
    eventId: number; thread: Thread; participant?: ParticipantRow;
    bubbleActions: (w: Wish) => RowAction[]; onPanel: (kind: ChatPanel, w: Wish) => void;
    onBack: () => void; onDetails: () => void; onRemove: () => void; onHide: () => void;
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
            <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
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
                        {thread.chatHidden && <StatusPill tone="violet" icon={EyeOff}>Hidden chat</StatusPill>}
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
                                <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={onHide}>
                                    {thread.chatHidden ? <><Eye className="size-4 text-muted-foreground" /> Move to Inbox</> : <><EyeOff className="size-4 text-muted-foreground" /> Hide Chat</>}
                                </DropdownMenuItem>
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

/* ── Hide Chat (Jamal's design, 2026-11-09) ──────────────────────────────── */

const MAX_HIDE_NOTE = 250;
function HideChat({ eventId, thread, side, access, onClose }: {
    eventId: number; thread: Thread; side: string | null; access: string | null; onClose: () => void;
}) {
    const hide = useHideWishThread(eventId);
    const [note, setNote] = useState("");
    const restoring = thread.chatHidden;
    const run = () => hide.mutate({ thread: thread.key, hidden: !restoring, note: note.trim() || undefined }, { onSuccess: onClose });
    const pill = access ? ACCESS[access] : null;
    return (
        <ActionSheet open onClose={onClose} large icon={restoring ? Eye : EyeOff} title={restoring ? "Move to Inbox" : "Hide Chat"} width={520}
            subtitle={restoring
                ? "The chat goes back to the active conversation list."
                : "The chat will be hidden from the active list but can be restored later from Hidden conversations."}
            footer={<>
                <Button variant="outline" disabled={hide.isPending} onClick={onClose}>Cancel</Button>
                <Button disabled={hide.isPending} onClick={run}>{hide.isPending && <Loader2 className="size-3.5 animate-spin" />} {restoring ? "Move to Inbox" : "Hide Chat"}</Button>
            </>}>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <PersonAvatar name={thread.name} photo={thread.avatar} size={44} rounded="full" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">{thread.name}</p>
                    <p className="text-[12px] text-muted-foreground">{thread.isOrg ? "Your posts as the organizer" : side ?? "Participant"}</p>
                </div>
                {pill && <StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
            </div>
            {restoring ? (
                thread.hideNote
                    ? <DetailSection title="Why it was hidden"><DetailRow label="Note">{thread.hideNote}</DetailRow></DetailSection>
                    : null
            ) : (
                <>
                    <p className="text-[15px] font-bold">Choose Action</p>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-primary bg-primary/5 p-4">
                        <input type="radio" checked readOnly className="mt-0.5 size-4 accent-[var(--primary)]" />
                        <span>
                            <span className="block text-[14px] font-semibold">Hide from main inbox</span>
                            <span className="block text-[12.5px] text-muted-foreground">Remove this chat from the active conversation list. The wishes stay as they are for everyone.</span>
                        </span>
                    </label>
                    <div>
                        <p className="mb-1.5 text-[13.5px] font-semibold">Note <span className="font-normal text-muted-foreground">(Optional)</span></p>
                        <Textarea value={note} maxLength={MAX_HIDE_NOTE} rows={4} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (e.g., reason for hiding)..." />
                        <p className="mt-1 text-right text-[11.5px] text-muted-foreground">{Array.from(note).length}/{MAX_HIDE_NOTE}</p>
                    </div>
                </>
            )}
        </ActionSheet>
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
type KindFilter = "all" | Wish["post_type"];
type MediaFilter = "all" | "image" | "video";
type CommentFilter = "all" | "visible" | "hidden";
const KIND_META: Record<Wish["post_type"], { label: string; icon: typeof Heart }> = {
    text: { label: "Text Wish", icon: MessageSquare }, image: { label: "Image Wish", icon: ImageIcon }, video: { label: "Video Wish", icon: Video },
};
const wishStatus = (w: Wish): { label: string; tone: Tone } =>
    w.status === "blocked" ? { label: "Blocked", tone: "danger" }
        : w.is_flagged ? { label: "Pending", tone: "warning" }
            : w.status === "hidden" ? { label: "Hidden", tone: "violet" }
                : { label: "Published", tone: "success" };
const AUDIENCE_SHORT = { both: "Both", bride: "Bride", groom: "Groom" } as const;
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const mmss = (s: number | null) => (s ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : null);

/** Small rounded chips: "All (2)  Images (1)  Videos (1)". */
function Chips<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
    return (
        <div className="flex flex-wrap gap-2">
            {items.map((i) => (
                <button key={i.value} type="button" onClick={() => onChange(i.value)}
                    className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold transition",
                        value === i.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
                    {i.label}
                </button>
            ))}
        </div>
    );
}

/** A section card with an icon title and an optional button on the right. */
function DCard({ title, icon: Icon, action, children }: { title: string; icon: typeof Heart; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[15px] font-bold"><Icon className="size-[18px] text-primary" /> {title}</p>
                {action}
            </div>
            {children}
        </div>
    );
}

function DRow({ icon: Icon, label, children }: { icon: typeof Heart; label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[18px_minmax(110px,40%)_1fr] items-center gap-2 border-b border-border/70 py-2 text-[12.5px] last:border-0">
            <Icon className="size-4 text-muted-foreground" />
            <span className="font-medium text-muted-foreground">{label}</span>
            <span className="min-w-0 break-words font-medium">{children || "—"}</span>
        </div>
    );
}

const pinkOutline = "h-7 border-primary/40 px-2.5 text-[12px] text-primary hover:bg-primary/5 hover:text-primary";

function ParticipantDetails({ eventId, thread, participant: p, loading, bubbleActions, onClose, onMessage, onOpen, onHide, onBlock, onRemove }: {
    eventId: number; thread: Thread; participant?: ParticipantRow; loading: boolean;
    bubbleActions: (w: Wish) => RowAction[];
    onClose: () => void; onMessage: () => void; onOpen: (kind: ChatPanel, w: Wish) => void;
    onHide: () => void; onBlock: () => void; onRemove: () => void;
}) {
    const wsHref = useEventHref();
    const [tab, setTab] = useState<DetailTab>("profile");
    const [kind, setKind] = useState<KindFilter>("all");
    const [mediaKind, setMediaKind] = useState<MediaFilter>("all");
    const [grid, setGrid] = useState(false);
    const [commentKind, setCommentKind] = useState<CommentFilter>("all");
    const wishesNew = useMemo(() => [...thread.wishes].reverse(), [thread.wishes]);
    const media = wishesNew.filter((w) => w.post_type !== "text");
    const wishIds = useMemo(() => thread.wishes.map((w) => w.id), [thread.wishes]);
    const all = useWishCommentsMany(eventId, wishIds);
    const act = useWishCommentActions(eventId);
    const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
    const comments = useMemo(() => thread.wishes
        .flatMap((w) => (all.byWish.get(w.id) ?? []).map((c) => ({ c, w })))
        .sort((a, b) => ms(b.c.created_at) - ms(a.c.created_at)), [thread.wishes, all.byWish]);
    const commentCount = all.isLoading ? thread.wishes.reduce((n, w) => n + (w.comment_count ?? 0), 0) : comments.length;
    const theirComments = comments.filter(({ c }) => !c.added_by_organizer && c.author_client_id != null && `c:${c.author_client_id}` === thread.key).length;

    const access = p ? ACCESS[p.access ?? (p.has_joined ? "active" : "pending")] : null;
    const rsvp = p ? RSVP[p.response_type ?? "none"] ?? RSVP.none : null;
    const invited = !!p && (p.invite_status === "invited" || !!p.invited_at);
    const copy = (v: string) => { void navigator.clipboard?.writeText(v).then(() => toast.success("Copied")); };
    const name = p?.full_name || p?.name || thread.name;
    const side = sideOf(p);
    const open = (w: Wish) => { onClose(); onOpen("view", w); };
    const published = thread.wishes.filter((w) => wishStatus(w).label === "Published").length;
    const shownWishes = kind === "all" ? wishesNew : wishesNew.filter((w) => w.post_type === kind);
    const shownMedia = mediaKind === "all" ? media : media.filter((w) => w.post_type === mediaKind);
    const shownComments = commentKind === "all" ? comments : comments.filter(({ c }) => (commentKind === "hidden" ? c.is_hidden : !c.is_hidden));
    const kindOf = (w: Wish) => (w.post_type === "video" ? "video" : w.post_type === "image" ? "photo" : "text");

    return (
        <ActionSheet open onClose={onClose} large title="Participant Details" width={560}>
            {/* Header: photo, name, Active, side, Send Message · call · mail · ⋯ */}
            <div className="flex items-center gap-4">
                <ChatAvatar name={name} photo={p?.photo ?? thread.avatar} size={84} online={thread.online} />
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                        <span className="break-words text-[22px] leading-tight font-bold">{name}</span>
                        {access && <StatusPill tone={access.tone}>{access.label}</StatusPill>}
                    </p>
                    <p className="text-[13px] text-muted-foreground">{side ?? "Participant"}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {thread.participantId && (
                            <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={onMessage}><MessageSquare className="size-3.5" /> Send Message</Button>
                        )}
                        {p?.mobile && <Button asChild size="icon" variant="outline" className="size-8 rounded-full"><a href={`tel:${p.mobile}`} aria-label="Call"><Phone className="size-3.5" /></a></Button>}
                        {p?.email && <Button asChild size="icon" variant="outline" className="size-8 rounded-full"><a href={`mailto:${p.email}`} aria-label="Email"><Mail className="size-3.5" /></a></Button>}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="outline" className="size-8 rounded-full" aria-label="More"><MoreHorizontal className="size-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem className="gap-2.5 text-[13px]" onClick={() => { onClose(); onHide(); }}>
                                    {thread.chatHidden ? <><Eye className="size-4 text-muted-foreground" /> Move to Inbox</> : <><EyeOff className="size-4 text-muted-foreground" /> Hide Chat</>}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2.5 text-[13px]" onClick={() => { onClose(); onBlock(); }}>
                                    {thread.blocked ? <><UserCheck className="size-4 text-muted-foreground" /> Unblock Participant</> : <><UserX className="size-4 text-muted-foreground" /> Block Participant</>}
                                </DropdownMenuItem>
                                {thread.participantId && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="gap-2.5 text-[13px] text-destructive focus:text-destructive" onClick={() => { onClose(); onRemove(); }}>
                                            <Trash2 className="size-4 text-destructive" /> Remove Participant
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            {/* Tabs (underlined) */}
            <div className="-mx-6 flex border-b border-border px-6">
                {([["profile", "Profile"], ["wishes", `Wishes (${thread.wishes.length})`], ["media", `Media (${media.length})`], ["comments", `Comments (${commentCount})`]] as [DetailTab, string][]).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setTab(v)}
                        className={cn("-mb-px flex-1 border-b-2 px-2 py-2.5 text-[13px] font-semibold whitespace-nowrap transition",
                            tab === v ? "border-primary text-primary" : "border-transparent text-foreground/80 hover:text-primary")}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Profile ── */}
            {tab === "profile" && (
                <>
                    {!p && !loading && <Notice tone="warning">This person is no longer a participant of this event. Their wishes stay until you hide or delete them.</Notice>}
                    {p && (
                        <>
                            <DCard title="Basic Details" icon={Users}
                                action={<Button asChild size="sm" variant="outline" className={pinkOutline}><Link href={wsHref(`/dashboard/participants/${p.id}/edit`)}><Pencil className="size-3" /> Edit</Link></Button>}>
                                <DRow icon={UserRound} label="Full Name">{name}</DRow>
                                <DRow icon={Phone} label="Mobile Number">
                                    {p.mobile ? <span className="inline-flex items-center gap-1.5">{[p.dial_code, p.mobile].filter(Boolean).join(" ")}<button type="button" onClick={() => copy(p.mobile!)} aria-label="Copy mobile"><Copy className="size-3.5 text-muted-foreground" /></button></span> : null}
                                </DRow>
                                <DRow icon={Mail} label="Email Address">
                                    {p.email ? <span className="inline-flex items-center gap-1.5 break-all">{p.email}<button type="button" onClick={() => copy(p.email!)} aria-label="Copy email"><Copy className="size-3.5 text-muted-foreground" /></button></span> : null}
                                </DRow>
                                <DRow icon={Users} label="Relationship">{p.relationship || side}</DRow>
                                <DRow icon={MapPin} label="City">{[p.city, p.state].filter(Boolean).join(", ")}</DRow>
                            </DCard>
                            <DCard title="Event Participation" icon={CalendarDays}>
                                <DRow icon={Mail} label="Invitation Status"><StatusPill tone={invited ? "success" : "warning"} icon={invited ? Check : undefined}>{invited ? "Invited" : "Pending"}</StatusPill></DRow>
                                <DRow icon={CheckSquare} label="RSVP Status">{rsvp && <StatusPill tone={rsvp.tone} icon={rsvp.tone === "success" ? Check : undefined}>{rsvp.label}</StatusPill>}</DRow>
                                <DRow icon={CalendarDays} label="Joined Date">{p.created_at ? shortDate(p.created_at) : null}</DRow>
                            </DCard>
                        </>
                    )}
                    <DCard title="Activity Summary" icon={Activity}>
                        <div className="grid grid-cols-3 gap-2.5">
                            {[
                                { icon: MessageSquare, value: theirComments, label: "Messages" },
                                { icon: Heart, value: thread.likes, label: "Likes" },
                                { icon: Heart, value: thread.wishes.length, label: "Wishes" },
                            ].map((s) => (
                                <div key={s.label} className="flex flex-col items-center gap-0.5 rounded-xl bg-primary/[0.06] px-2 py-3 text-center">
                                    <s.icon className="size-5 text-primary" />
                                    <span className="text-[22px] leading-7 font-bold">{s.value}</span>
                                    <span className="text-[11.5px] text-muted-foreground">{s.label}</span>
                                </div>
                            ))}
                        </div>
                    </DCard>
                </>
            )}

            {/* ── Wishes ── */}
            {tab === "wishes" && (
                <DCard title={`Wishes (${thread.wishes.length})`} icon={Heart}
                    action={(
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" className={pinkOutline}><Filter className="size-3" /> {kind === "all" ? "Filter" : KIND_META[kind].label}</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                                {(["all", "text", "image", "video"] as KindFilter[]).map((k) => (
                                    <DropdownMenuItem key={k} className={cn("text-[13px]", kind === k && "font-semibold text-primary")} onClick={() => setKind(k)}>
                                        {k === "all" ? "All wishes" : KIND_META[k].label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}>
                    <div className="-mt-1 mb-3 flex items-center justify-between gap-2">
                        <StatusPill tone="success" icon={Check}>{published} Published</StatusPill>
                        <span className="text-[11.5px] text-muted-foreground">Text · Image · Video</span>
                    </div>
                    {shownWishes.length === 0 ? <p className="py-4 text-center text-[12.5px] text-muted-foreground">No wishes of this type.</p> : (
                        <div className="flex flex-col gap-3">
                            {shownWishes.map((w) => {
                                const meta = KIND_META[w.post_type];
                                const st = wishStatus(w);
                                const thumb = w.thumbnail_url ?? w.photo;
                                return (
                                    <div key={w.id} className="rounded-xl border border-border p-3">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-primary"><meta.icon className="size-3.5" /> {meta.label}</span>
                                            <span className="flex items-center gap-1.5">
                                                <StatusPill tone={st.tone}>{st.label}</StatusPill>
                                                <RowActions items={bubbleActions(w).map((a) => ({ ...a, onClick: () => { onClose(); a.onClick(); } }))} compact label="Wish actions" />
                                            </span>
                                        </div>
                                        {w.post_type === "text" ? (
                                            <>
                                                <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-[13px] break-words">{w.message}</p>
                                                <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                                                    <span className="flex items-center gap-1"><CalendarDays className="size-3.5" /> {shortDate(w.created_at)}</span>
                                                    <span className="flex items-center gap-1"><Heart className="size-3 fill-current text-primary" /> {w.like_count} Likes</span>
                                                    <Button size="sm" variant="outline" className={pinkOutline} onClick={() => open(w)}>View</Button>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex gap-3">
                                                <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    {thumb && <img src={mediaUrl(thumb)} alt="" className="size-full object-cover" />}
                                                    {w.post_type === "video" && <span className="absolute inset-0 grid place-items-center"><PlayCircle className="size-8 text-white drop-shadow" /></span>}
                                                    {mmss(w.duration_seconds) && <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10px] text-white">{mmss(w.duration_seconds)}</span>}
                                                </div>
                                                <div className="flex min-w-0 flex-1 flex-col">
                                                    <p className="line-clamp-2 text-[13px] font-semibold break-words">{w.message || (w.post_type === "video" ? "Video" : "Photo")}</p>
                                                    <p className="text-[11px] text-muted-foreground">{shortDate(w.created_at)}</p>
                                                    <p className="mt-0.5 flex items-center gap-2 text-[11.5px]">
                                                        {mmss(w.duration_seconds) && <span className="flex items-center gap-0.5 text-primary"><Play className="size-3 fill-current" /> {mmss(w.duration_seconds)}</span>}
                                                        <span className="flex items-center gap-1 text-primary"><Heart className="size-3 fill-current" /> {w.like_count} Likes</span>
                                                    </p>
                                                    <div className="mt-auto flex items-center justify-between pt-1.5">
                                                        <span className="text-[11.5px] text-muted-foreground">To: {AUDIENCE_SHORT[w.audience]}</span>
                                                        <Button size="sm" variant="outline" className={pinkOutline} onClick={() => open(w)}>View</Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </DCard>
            )}

            {/* ── Media ── */}
            {tab === "media" && (
                <DCard title={`Media (${media.length})`} icon={ImageIcon}
                    action={<Button size="sm" variant="outline" className={pinkOutline} onClick={() => setGrid((g) => !g)}>{grid ? <><List className="size-3" /> List View</> : <><LayoutGrid className="size-3" /> Grid View</>}</Button>}>
                    <div className="mb-3">
                        <Chips value={mediaKind} onChange={setMediaKind} items={[
                            { value: "all", label: `All (${media.length})` },
                            { value: "image", label: `Images (${media.filter((w) => w.post_type === "image").length})` },
                            { value: "video", label: `Videos (${media.filter((w) => w.post_type === "video").length})` },
                        ]} />
                    </div>
                    {shownMedia.length === 0 ? <p className="py-4 text-center text-[12.5px] text-muted-foreground">No photos or videos.</p> : (
                        <div className={cn("gap-3", grid ? "grid grid-cols-2" : "flex flex-col")}>
                            {shownMedia.map((w) => {
                                const st = wishStatus(w);
                                const thumb = w.thumbnail_url ?? w.photo;
                                const video = w.post_type === "video";
                                return (
                                    <div key={w.id} className="overflow-hidden rounded-xl border border-border p-2.5">
                                        <button type="button" onClick={() => open(w)} className={cn("relative block w-full overflow-hidden rounded-lg bg-muted", grid ? "aspect-square" : "aspect-[16/7]")}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            {thumb && <img src={mediaUrl(thumb)} alt="" className="size-full object-cover" />}
                                            {video && <span className="absolute inset-0 grid place-items-center"><PlayCircle className="size-12 text-white drop-shadow" /></span>}
                                            {mmss(w.duration_seconds) && <span className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 text-[11px] text-white">{mmss(w.duration_seconds)}</span>}
                                        </button>
                                        <div className="px-1 pt-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold">
                                                    {video ? <Video className="size-3.5 shrink-0" /> : <ImageIcon className="size-3.5 shrink-0" />}
                                                    <span className="truncate">{w.message || (video ? "Video" : "Photo")}</span>
                                                </p>
                                                {!grid && <StatusPill tone={st.tone}>{st.label}</StatusPill>}
                                            </div>
                                            <p className="text-[11.5px] text-muted-foreground">Uploaded {shortDate(w.created_at)}</p>
                                            <div className="mt-1.5 flex items-center justify-between gap-2">
                                                <span className="flex items-center gap-1 text-[12px]"><Heart className="size-3 fill-current text-primary" /> {w.like_count} Likes</span>
                                                <Button size="sm" variant="outline" className={pinkOutline} onClick={() => open(w)}>
                                                    <ExternalLink className="size-3" /> {video ? "Watch Video" : "View Media"}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <p className="mt-3 text-[11.5px] text-muted-foreground">Media displayed here was shared in Wed Wishes by this participant.</p>
                </DCard>
            )}

            {/* ── Comments (everyone's comments on this participant's wishes) ── */}
            {tab === "comments" && (
                <DCard title={`Comments (${commentCount})`} icon={MessageSquare}>
                    <div className="mb-3">
                        <Chips value={commentKind} onChange={setCommentKind} items={[
                            { value: "all", label: `All (${comments.length})` },
                            { value: "visible", label: `Visible (${comments.filter(({ c }) => !c.is_hidden).length})` },
                            { value: "hidden", label: `Hidden (${comments.filter(({ c }) => c.is_hidden).length})` },
                        ]} />
                    </div>
                    {all.isLoading ? <p className="py-4 text-center text-[12.5px] text-muted-foreground">Loading…</p>
                        : shownComments.length === 0 ? <p className="py-4 text-center text-[12.5px] text-muted-foreground">No comments here.</p> : (
                            <div className="flex flex-col gap-2.5">
                                {shownComments.map(({ c, w }) => (
                                    <div key={c.id} className="flex gap-3 rounded-xl border border-border p-3">
                                        <PersonAvatar name={c.added_by_organizer ? "Event Organizer" : c.guest_name} size={34} rounded="full" />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-[13px] font-bold">{c.added_by_organizer ? "Event Organizer" : c.guest_name}</p>
                                                <span className="shrink-0 text-[11px] text-muted-foreground">{c.created_at ? new Date(c.created_at).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : ""}</span>
                                            </div>
                                            {editing?.id === c.id ? (
                                                <div className="mt-1 flex flex-col gap-1.5">
                                                    <Textarea value={editing.text} maxLength={500} rows={2} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} />
                                                    <span className="flex justify-end gap-2">
                                                        <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(null)}>Cancel</Button>
                                                        <Button size="sm" className="h-7" disabled={!editing.text.trim() || act.update.isPending}
                                                            onClick={() => act.update.mutate({ id: c.id, data: { message: editing.text.trim() }, done: "Comment updated" }, { onSuccess: () => setEditing(null) })}>Save</Button>
                                                    </span>
                                                </div>
                                            ) : (
                                                <p className="text-[12.5px] break-words">{c.message || "📷 Photo"}</p>
                                            )}
                                            <div className="mt-1.5 flex items-end justify-between gap-2">
                                                <span className="flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground">
                                                    {w.post_type === "video" ? <Video className="size-3 shrink-0" /> : w.post_type === "image" ? <ImageIcon className="size-3 shrink-0" /> : <MessageSquare className="size-3 shrink-0" />}
                                                    <span className="truncate">On {thread.name.split(" ")[0]}&apos;s {kindOf(w)} wish</span>
                                                </span>
                                                <span className="flex shrink-0 flex-col items-end gap-1.5">
                                                    <StatusPill tone={c.is_hidden ? "amber" : "success"}>{c.is_hidden ? "Hidden" : "Visible"}</StatusPill>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button size="sm" variant="outline" className="h-7 px-2.5 text-[12px]"><MoreHorizontal className="size-3.5" /> Actions</Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-44">
                                                            {c.can_edit && (
                                                                <DropdownMenuItem className="gap-2.5 text-[13px]" onClick={() => setEditing({ id: c.id, text: c.message })}><Pencil className="size-4 text-muted-foreground" /> Edit Message</DropdownMenuItem>
                                                            )}
                                                            {c.is_hidden
                                                                ? <DropdownMenuItem className="gap-2.5 text-[13px]" onClick={() => act.update.mutate({ id: c.id, data: { show_in_app: true }, done: "Comment visible" })}><Eye className="size-4 text-muted-foreground" /> Show Message</DropdownMenuItem>
                                                                : <DropdownMenuItem className="gap-2.5 text-[13px]" onClick={() => act.update.mutate({ id: c.id, data: { show_in_app: false, reviewed: true }, done: "Comment hidden" })}><EyeOff className="size-4 text-muted-foreground" /> Hide Message</DropdownMenuItem>}
                                                            {c.can_delete && (
                                                                <DropdownMenuItem className="gap-2.5 text-[13px] text-destructive focus:text-destructive" onClick={() => act.remove.mutate(c.id)}><Trash2 className="size-4 text-destructive" /> Delete Message</DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                </DCard>
            )}
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
