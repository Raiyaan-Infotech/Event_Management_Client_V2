"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft, Ban, Bot, CheckCheck, CheckCircle2, Clock, Eye, Filter, ImagePlus, Info, Link2, Loader2, MessageCircle,
    MessageSquare, MoreHorizontal, Plus, RotateCcw, Send, ShieldBan, Trash2, User, UserRound, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    ActionSheet, CountTabs, DetailRow, DetailSection, FormField, ModuleHeader, OverviewCard, SearchBox, StatTile, StatusPill,
    type Tone,
} from "@/components/module-kit";
import {
    useContactDetails, useContactInbox, useContactMessages, useContactRecipients, useSendContactMessage, useSetContactStatus,
    useStartContactChat, type ContactChatRow, type ContactChatStatus, type ContactInbox, type ContactMessage,
} from "@/hooks/use-event-engagement";
import { useDateFormatter } from "@/hooks/use-client-settings";
import { mediaUrl } from "@/lib/media-url";
import { useEventHref } from "@/lib/event-workspace";
import { cn } from "@/lib/utils";
import type { ClientEvent } from "@/hooks/use-client-events";
import { ChatAvatar, DayPill, Presence, dayStart, listTime, timeOf, useFitHeight } from "./wishes-chat";
import { Empty, PanelLoading, Section } from "./module-ui";

/**
 * Contact Messages (Jamal's 8 screens, 2026-11-11: EventInvite_Contact_Person_All_8_Screens).
 *
 * Participants write to the event's contact person from the mobile app (Event → Contact Person → Chat);
 * the owner answers here, as the contact person (the participant sees the contact person's name).
 * Inbox · conversation · right column (Designated Contact Person, Selected Participant, Conversation Actions),
 * and the slide-in panels: Reply, Mark as Resolved, Block, Remove, Contact Person Details, Participant
 * Details, New Message. An INQUIRY = one question round (a message after Resolved starts a new one).
 */

type Tab = "all" | "open" | "resolved" | "blocked";
type Narrow = "all" | "awaiting" | "online" | "bride" | "groom";
type Panel = "reply" | "resolve" | "block" | "remove" | "contact" | "participant" | "inquiries" | "new" | null;

const SIDE_LABEL = { bride: "Bride Side", groom: "Groom Side" } as const;
const NARROW_LABEL: Record<Narrow, string> = {
    all: "All conversations", awaiting: "Awaiting reply", online: "Online now", bride: "Bride Side", groom: "Groom Side",
};
const STATUS_PILL: Record<ContactChatStatus, { label: string; tone: Tone }> = {
    open: { label: "Open", tone: "warning" },
    resolved: { label: "Resolved", tone: "success" },
    blocked: { label: "Blocked", tone: "danger" },
    removed: { label: "Removed", tone: "muted" },
};
const EMOJIS = ["🙏", "😊", "❤️", "👍", "🎉", "😂", "🥰", "👏", "🌸", "✨", "📍", "🚗"];
const QUICK_REPLIES = ["Thank you! 🙏", "Sure, I will check and get back to you.", "Please call me if you need anything."];

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
const sideOf = (c: { participant: { side: "bride" | "groom" | null } }) => (c.participant.side ? SIDE_LABEL[c.participant.side] : null);
const inquiriesLabel = (n: number) => `${n} ${n === 1 ? "inquiry" : "inquiries"}`;
const avgReply = (m: number | null) => (m === null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

export function ContactPanel({ event }: { event: ClientEvent }) {
    const inbox = useContactInbox(event.id);
    if (inbox.isLoading) return <PanelLoading />;
    if (inbox.isError || !inbox.data) {
        return <Section title="Contact Messages"><Empty title="Could not load the contact messages">Please try again in a moment.</Empty></Section>;
    }
    return <ContactInboxView event={event} data={inbox.data} />;
}

function ContactInboxView({ event, data }: { event: ClientEvent; data: ContactInbox }) {
    const [tab, setTab] = useState<Tab>("all");
    const [narrow, setNarrow] = useState<Narrow>("all");
    const [search, setSearch] = useState("");
    const [picked, setPicked] = useState<number | null>(null);
    const [phoneThread, setPhoneThread] = useState(false);
    const [panel, setPanel] = useState<Panel>(null);
    const [boxRef, boxHeight] = useFitHeight();

    const q = search.trim().toLowerCase();
    const matches = data.chats.filter((c) =>
        (narrow === "all" || (narrow === "awaiting" && c.awaiting) || (narrow === "online" && c.participant.online)
            || (narrow === c.participant.side))
        && (!q || c.participant.name.toLowerCase().includes(q) || (c.last_message ?? "").toLowerCase().includes(q)));
    const byTab = (t: Tab) => matches.filter((c) => (t === "all" ? c.status !== "blocked" : c.status === t));
    const shown = byTab(tab);
    const selected = data.chats.find((c) => c.id === picked) ?? shown[0] ?? null;

    const pick = (id: number) => { setPicked(id); setPhoneThread(true); };
    const showView = (t: Tab, n: Narrow = "all") => { setTab(t); setNarrow(n); };
    const close = () => setPanel(null);

    return (
        <div className="flex flex-col gap-4">
            <ModuleHeader
                title="Contact Messages"
                subtitle="Manage participant inquiries and replies through your designated event contact person."
                actions={(
                    <>
                        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setPanel("contact")}><UserRound className="size-4" /> Contact Person</Button>
                        <Button size="sm" className="h-9 gap-1.5" onClick={() => setPanel("new")}><Send className="size-4" /> New Message</Button>
                    </>
                )}
            />
            <OverviewCard>
                <StatTile icon={MessageCircle} value={data.stats.total_inquiries} label="Total Inquiries" active={tab === "all" && narrow === "all"} onClick={() => showView("all")} />
                <StatTile icon={MessageSquare} value={data.stats.open} label="Open Conversations" tone="amber" active={tab === "open" && narrow === "all"} onClick={() => showView("open")} />
                <StatTile icon={Clock} value={data.stats.awaiting} label="Awaiting Reply" tone="violet" active={narrow === "awaiting"} onClick={() => showView("all", "awaiting")} />
                <StatTile icon={CheckCircle2} value={data.stats.resolved} label="Resolved" tone="success" active={tab === "resolved"} onClick={() => showView("resolved")} />
                <StatTile icon={Ban} value={data.stats.blocked} label="Blocked" tone="danger" active={tab === "blocked"} onClick={() => showView("blocked")} />
            </OverviewCard>

            <div ref={boxRef} style={{ height: boxHeight }}
                className="grid min-h-[420px] min-w-0 gap-4 lg:grid-cols-[minmax(270px,320px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(270px,320px)_minmax(0,1fr)_300px]">
                {/* ── Contact Conversations ── */}
                <section className={cn("min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card", phoneThread ? "hidden lg:flex" : "flex")}>
                    <div className="flex flex-col gap-2.5 border-b border-border p-3">
                        <p className="text-[14px] font-bold">Contact Conversations ({data.counts.all})</p>
                        <div className="flex items-center gap-2">
                            <SearchBox value={search} onChange={setSearch} placeholder="Search participant..." className="min-w-0" />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="icon" variant="outline" className={cn("size-8 shrink-0", narrow !== "all" && "border-primary text-primary")} aria-label="Filter">
                                        <Filter className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuLabel className="text-[11.5px] text-muted-foreground">Show</DropdownMenuLabel>
                                    {(Object.keys(NARROW_LABEL) as Narrow[]).map((n) => (
                                        <DropdownMenuItem key={n} onClick={() => setNarrow(n)} className={cn("text-[13px]", narrow === n && "font-semibold text-primary")}>
                                            {NARROW_LABEL[n]}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <CountTabs stretch value={tab === "blocked" ? "all" : tab} onChange={(t) => setTab(t)} tabs={[
                            { value: "all", label: "All", count: byTab("all").length },
                            { value: "open", label: "Open", count: byTab("open").length },
                            { value: "resolved", label: "Resolved", count: byTab("resolved").length },
                        ]} />
                        {(narrow !== "all" || tab === "blocked") && (
                            <div className="flex flex-wrap gap-1.5">
                                {tab === "blocked" && (
                                    <button type="button" onClick={() => setTab("all")} className="flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11.5px] font-medium text-destructive">
                                        Blocked ({byTab("blocked").length}) <X className="size-3" />
                                    </button>
                                )}
                                {narrow !== "all" && (
                                    <button type="button" onClick={() => setNarrow("all")} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11.5px] font-medium text-primary">
                                        {NARROW_LABEL[narrow]} <X className="size-3" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {shown.length === 0 ? (
                            <p className="p-6 text-center text-[12px] text-muted-foreground">
                                {data.chats.length === 0
                                    ? "No messages yet. When a participant writes to the contact person from the app, it shows here."
                                    : "No conversations match."}
                            </p>
                        ) : shown.map((c) => (
                            <button key={c.id} type="button" onClick={() => pick(c.id)}
                                className={cn("flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left transition",
                                    selected?.id === c.id ? "bg-primary/10" : "hover:bg-muted/50")}>
                                <ChatAvatar name={c.participant.name} photo={c.participant.photo} size={36} online={c.participant.online} />
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="truncate text-[12.5px] font-bold">{c.participant.name}</span>
                                        <span className={cn("shrink-0 text-[10.5px]", c.unread ? "font-semibold text-primary" : "text-muted-foreground")}>{listTime(ms(c.last_message_at))}</span>
                                    </span>
                                    <span className="mt-0.5 flex items-center justify-between gap-2">
                                        <span className={cn("truncate text-[11.5px]", c.unread ? "font-medium text-foreground" : "text-muted-foreground")}>{c.last_message || "—"}</span>
                                        <span className="flex shrink-0 items-center gap-1">
                                            {c.status === "resolved" && <CheckCircle2 className="size-3.5 text-success" aria-label="Resolved" />}
                                            {c.status === "blocked" && <Ban className="size-3.5 text-destructive" aria-label="Blocked" />}
                                            {!c.unread && c.awaiting && <Clock className="size-3.5 text-warning" aria-label="Awaiting reply" />}
                                            {c.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{c.unread}</span>}
                                        </span>
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                    {shown.length > 0 && (
                        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                            Showing {shown.length} of {data.counts.all + data.counts.blocked} conversations
                        </p>
                    )}
                </section>

                {/* ── The conversation ── */}
                <section className={cn("min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card", phoneThread ? "flex" : "hidden lg:flex")}>
                    {selected ? (
                        <ConversationView
                            key={selected.id}
                            eventId={event.id}
                            chat={selected}
                            contactName={data.contact.name}
                            onBack={() => setPhoneThread(false)}
                            onPanel={setPanel}
                        />
                    ) : (
                        <div className="grid flex-1 place-items-center p-6 text-center text-[13px] text-muted-foreground">
                            <span><MessageSquare className="mx-auto mb-2 size-8 text-primary/40" />Pick a conversation to read the messages.</span>
                        </div>
                    )}
                </section>

                {/* ── Right column ── */}
                <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto 2xl:flex">
                    <ContactPersonCard data={data} onOpen={() => setPanel("contact")} />
                    {selected && (
                        <>
                            <DetailSection title="Selected Participant">
                                <DetailRow label="Full Name">{selected.participant.name}</DetailRow>
                                <DetailRow label="Relationship">{sideOf(selected) ?? selected.participant.relationship}</DetailRow>
                                <DetailRow label="Inquiries">{String(selected.inquiries)}</DetailRow>
                                <DetailRow label="Current Status"><StatusPill tone={STATUS_PILL[selected.status].tone}>{STATUS_PILL[selected.status].label}</StatusPill></DetailRow>
                            </DetailSection>
                            <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
                                <p className="mb-1 text-[14px] font-bold">Conversation Actions</p>
                                <Button className="gap-1.5" onClick={() => setPanel("reply")}><Send className="size-4" /> Reply to Participant</Button>
                                {selected.status === "resolved"
                                    ? <Button variant="outline" className="gap-1.5" onClick={() => setPanel("resolve")}><RotateCcw className="size-4" /> Reopen Conversation</Button>
                                    : <Button variant="outline" className="gap-1.5" onClick={() => setPanel("resolve")} disabled={selected.status === "blocked"}><CheckCircle2 className="size-4" /> Mark as Resolved</Button>}
                                <Button variant="outline" className="gap-1.5" onClick={() => setPanel("participant")}><User className="size-4" /> View Participant Details</Button>
                            </div>
                        </>
                    )}
                </aside>
            </div>

            {/* ── Panels ── */}
            {selected && (
                <>
                    <ReplySheet open={panel === "reply"} onClose={close} eventId={event.id} chat={selected} />
                    {selected.status === "resolved"
                        ? <ReopenSheet open={panel === "resolve"} onClose={close} eventId={event.id} chat={selected} />
                        : <ResolveSheet open={panel === "resolve"} onClose={close} eventId={event.id} chat={selected} types={data.options.resolution_types} />}
                    {selected.status === "blocked"
                        ? <UnblockSheet open={panel === "block"} onClose={close} eventId={event.id} chat={selected} />
                        : <BlockSheet open={panel === "block"} onClose={close} eventId={event.id} chat={selected} reasons={data.options.block_reasons} />}
                    <RemoveSheet open={panel === "remove"} onClose={close} eventId={event.id} chat={selected} onDone={() => { setPicked(null); setPhoneThread(false); }} />
                    <ParticipantSheet open={panel === "participant" || panel === "inquiries"} startTab={panel === "inquiries" ? "inquiries" : "profile"}
                        onClose={close} eventId={event.id} chat={selected} onReply={() => setPanel("reply")} />
                </>
            )}
            <ContactPersonSheet open={panel === "contact"} onClose={close} event={event} data={data} />
            <NewMessageSheet open={panel === "new"} onClose={close} eventId={event.id} onSent={(chatId) => { setTab("all"); setNarrow("all"); pick(chatId); }} />
        </div>
    );
}

/* ── Right column: Designated Contact Person ─────────────────────────────── */

function ContactPersonCard({ data, onOpen }: { data: ContactInbox; onOpen: () => void }) {
    const c = data.contact;
    return (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-[14px] font-bold"><UserRound className="size-4 text-primary" /> Designated Contact Person</p>
            <button type="button" onClick={onOpen} className="flex items-center gap-3 rounded-lg border border-border bg-primary/[0.04] p-3 text-left transition hover:border-primary/40">
                <ChatAvatar name={c.name ?? "Contact Person"} photo={c.photo} size={40} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{c.name || "Not set yet"}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{c.designation || "Primary Event Contact"}</span>
                </span>
                <StatusPill tone={c.online ? "success" : "muted"}>{c.online ? "Active" : "Away"}</StatusPill>
            </button>
            <p className="text-[11.5px] text-muted-foreground">All participant inquiries are routed to this single contact person for the event.</p>
            <DetailSection title="Contact Details">
                <DetailRow label="Communication">In-App Messages</DetailRow>
                <DetailRow label="Role">Contact Person</DetailRow>
                <DetailRow label="Response Status"><StatusPill tone={c.online ? "success" : "muted"}>{c.online ? "Available" : "Away"}</StatusPill></DetailRow>
            </DetailSection>
        </div>
    );
}

/* ── One conversation ────────────────────────────────────────────────────── */

function ConversationView({ eventId, chat, contactName, onBack, onPanel }: {
    eventId: number; chat: ContactChatRow; contactName: string | null; onBack: () => void; onPanel: (p: Panel) => void;
}) {
    const query = useContactMessages(eventId, chat.id);
    const messages = query.data?.messages ?? [];
    const scroller = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages.length]);
    const meta = [sideOf(chat) ?? chat.participant.relationship, "Participant"].filter(Boolean).join(" · ");
    const pill = STATUS_PILL[chat.status];
    const blocked = chat.status === "blocked";

    return (
        <>
            <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
                <Button size="icon" variant="ghost" className="size-8 lg:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="size-4" /></Button>
                <ChatAvatar name={chat.participant.name} photo={chat.participant.photo} size={38} online={chat.participant.online} />
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[14px] font-bold">{chat.participant.name} <StatusPill tone={pill.tone}>{pill.label}</StatusPill></p>
                    <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        {meta}
                        <Presence online={chat.participant.online} lastSeen={chat.participant.last_seen_at} />
                    </p>
                </div>
                <Button size="icon" variant="outline" className="size-9 rounded-full" aria-label="Participant details" onClick={() => onPanel("participant")}><Info className="size-4" /></Button>
                <Button size="icon" variant="outline" className={cn("size-9 rounded-full", blocked ? "text-destructive" : "text-primary")} aria-label={blocked ? "Unblock participant" : "Block participant"} onClick={() => onPanel("block")}>
                    <ShieldBan className="size-4" />
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="outline" className="size-9 rounded-full" aria-label="Conversation actions"><MoreHorizontal className="size-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={() => onPanel("inquiries")}><Eye className="size-4 text-muted-foreground" /> View Inquiry</DropdownMenuItem>
                        <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={() => onPanel("reply")}><Send className="size-4 text-muted-foreground" /> Reply to Participant</DropdownMenuItem>
                        {chat.status === "resolved"
                            ? <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={() => onPanel("resolve")}><RotateCcw className="size-4 text-muted-foreground" /> Reopen Conversation</DropdownMenuItem>
                            : <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" disabled={blocked} onClick={() => onPanel("resolve")}><CheckCircle2 className="size-4 text-muted-foreground" /> Mark as Resolved</DropdownMenuItem>}
                        <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={() => onPanel("participant")}><User className="size-4 text-muted-foreground" /> View Participant Details</DropdownMenuItem>
                        <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={() => onPanel("block")}><Ban className="size-4 text-muted-foreground" /> {blocked ? "Unblock Participant" : "Block Participant"}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2.5 py-2 text-[13px] text-destructive focus:text-destructive" onClick={() => onPanel("remove")}><Trash2 className="size-4 text-destructive" /> Remove Conversation</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>

            <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-primary/[0.03] px-4 py-3">
                {query.isLoading ? (
                    <div className="grid flex-1 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
                ) : query.isError ? (
                    <p className="m-auto text-[12.5px] text-muted-foreground">Could not load this conversation. Please try again.</p>
                ) : messages.map((m, i) => {
                    const prev = messages[i - 1];
                    const at = ms(m.created_at);
                    const newDay = !prev || dayStart(ms(prev.created_at)) !== dayStart(at);
                    return (
                        <div key={m.id} className="contents">
                            {newDay && <DayPill at={at} />}
                            <Bubble m={m} participant={chat.participant} contactName={contactName} />
                        </div>
                    );
                })}
            </div>

            {blocked && (
                <p className="flex items-center gap-1.5 border-t border-destructive/20 bg-destructive/5 px-4 py-2 text-[11.5px] text-destructive">
                    <Ban className="size-3.5" /> Blocked {chat.block?.duration === "permanent" ? "permanently" : "until the event ends"}
                    {chat.block?.reason ? ` — ${chat.block.reason}` : ""}. They cannot send new messages.
                </p>
            )}
            <Composer eventId={eventId} chatId={chat.id} />
        </>
    );
}

function Bubble({ m, participant, contactName }: { m: ContactMessage; participant: ContactChatRow["participant"]; contactName: string | null }) {
    const team = m.side === "team";
    const name = team ? contactName || "Contact Person" : participant.name;
    return (
        <div className={cn("flex items-end gap-2", team && "flex-row-reverse")}>
            {team
                ? <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{m.is_auto ? <Bot className="size-3.5" /> : "CP"}</span>
                : <ChatAvatar name={name} photo={participant.photo} size={28} />}
            <div className={cn("max-w-[75%] rounded-lg px-3 py-2 shadow-xs",
                team ? "rounded-br-sm bg-primary/12 text-foreground" : "rounded-bl-sm border border-border bg-card")}>
                {m.is_auto && <p className="mb-0.5 text-[10.5px] font-semibold text-primary">Automatic message</p>}
                {m.reply_to && <Quote q={m.reply_to} />}
                {m.photo && (
                    <a href={mediaUrl(m.photo)} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaUrl(m.photo)} alt="" className="mb-1.5 max-h-56 rounded-lg object-cover" />
                    </a>
                )}
                {m.body && <p className="whitespace-pre-line break-words text-[12.5px] leading-relaxed">{m.body}</p>}
                <p className={cn("mt-1 flex items-center gap-1 text-[10.5px] text-muted-foreground", team && "justify-end")}>
                    {timeOf(m.created_at)}
                    {team && <CheckCheck className="size-3.5 text-primary" />}
                </p>
            </div>
        </div>
    );
}

/** Replying to: the quoted participant message above a team reply. */
function Quote({ q }: { q: NonNullable<ContactMessage["reply_to"]> }) {
    return (
        <div className="mb-1.5 rounded-lg border-l-[3px] border-primary bg-card/70 px-2 py-1">
            <p className="text-[10.5px] font-semibold text-primary">{q.sender_name || "Participant"}</p>
            <p className="line-clamp-2 text-[11.5px] text-muted-foreground">{q.body || (q.photo ? "📷 Photo" : "")}</p>
        </div>
    );
}

/** A picked photo with its preview URL (freed when replaced / cleared). */
function usePhoto() {
    const [photo, setPhotoState] = useState<{ file: File; url: string } | null>(null);
    const set = (file: File | null) => setPhotoState((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return file ? { file, url: URL.createObjectURL(file) } : null;
    });
    return [photo, set] as const;
}

function PhotoPreview({ url, onClear }: { url: string; onClear: () => void }) {
    return (
        <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-16 rounded-lg object-cover" />
            <button type="button" onClick={onClear} className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background" aria-label="Remove photo">
                <X className="size-3" />
            </button>
        </div>
    );
}

/** The hidden image input behind "Add photo" (JPG / PNG / WEBP). */
function PhotoInput({ inputRef, onPick }: { inputRef: React.RefObject<HTMLInputElement | null>; onPick: (f: File) => void }) {
    return (
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="contact-photo-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
    );
}

function Composer({ eventId, chatId }: { eventId: number; chatId: number }) {
    const send = useSendContactMessage(eventId);
    const [text, setText] = useState("");
    const [photo, setPhoto] = usePhoto();
    const fileRef = useRef<HTMLInputElement>(null);
    const submit = (value = text) => {
        if ((!value.trim() && !photo) || send.isPending) return;
        send.mutate({ chatId, body: value.trim(), photo: photo?.file ?? null }, {
            onSuccess: () => { setText(""); setPhoto(null); },
        });
    };
    return (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5">
            {photo && <PhotoPreview url={photo.url} onClear={() => setPhoto(null)} />}
            <div className="flex items-end gap-2">
                <PhotoInput inputRef={fileRef} onPick={setPhoto} />
                <Popover>
                    <PopoverTrigger asChild>
                        <Button size="icon" variant="outline" className="size-9 shrink-0 rounded-full text-primary" aria-label="Quick replies and emoji"><Plus className="size-4.5" /></Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="flex w-72 flex-col gap-2 p-2.5">
                        <p className="text-[11px] font-semibold text-muted-foreground">Quick replies</p>
                        {QUICK_REPLIES.map((r) => (
                            <button key={r} type="button" onClick={() => submit(r)}
                                className="rounded-lg border border-border px-2.5 py-1.5 text-left text-[12px] transition hover:border-primary/40 hover:text-primary">{r}</button>
                        ))}
                        <p className="text-[11px] font-semibold text-muted-foreground">Emoji</p>
                        <div className="grid grid-cols-6 gap-1">
                            {EMOJIS.map((e) => (
                                <button key={e} type="button" className="grid size-8 place-items-center rounded-md text-[18px] hover:bg-muted" onClick={() => setText((t) => t + e)}>{e}</button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
                <Textarea value={text} rows={1} maxLength={2000} placeholder="Reply as Event Contact Person..."
                    className="max-h-28 min-h-9 flex-1 resize-none py-2 text-[12.5px]"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
                <Button size="icon" variant="ghost" className="size-9 shrink-0" onClick={() => fileRef.current?.click()} aria-label="Add photo"><ImagePlus className="size-4.5" /></Button>
                <Button size="icon" className="size-9 shrink-0 rounded-full" disabled={(!text.trim() && !photo) || send.isPending} onClick={() => submit()} aria-label="Send">
                    {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
            </div>
        </div>
    );
}

/* ── Panels ──────────────────────────────────────────────────────────────── */

/** The participant line at the top of every panel: avatar, name, "Bride Side · 3 inquiries", status. */
function ParticipantCard({ chat }: { chat: ContactChatRow }) {
    const blocked = chat.status === "blocked";
    return (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-primary/[0.04] p-3">
            <ChatAvatar name={chat.participant.name} photo={chat.participant.photo} size={42} />
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold">{chat.participant.name}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">{[sideOf(chat) ?? chat.participant.relationship, inquiriesLabel(chat.inquiries)].filter(Boolean).join(" · ")}</p>
            </div>
            <StatusPill tone={blocked ? "danger" : "success"}>{blocked ? "Blocked" : "Active"}</StatusPill>
        </div>
    );
}

/** Big round icon + question + one line (Mark as Resolved / Remove). */
function Lead({ icon: Icon, tone, title, children }: { icon: typeof CheckCircle2; tone: "success" | "danger"; title: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-2 py-1 text-center">
            <span className={cn("grid size-14 place-items-center rounded-lg", tone === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                <Icon className="size-6" />
            </span>
            <p className="text-[16px] font-bold">{title}</p>
            <p className="max-w-[360px] text-[12px] text-muted-foreground">{children}</p>
        </div>
    );
}

/** A selectable card (radio or tick look): "Notify participant", "Until Event Ends". */
function OptionCard({ checked, onClick, title, hint, tone = "primary" }: { checked: boolean; onClick: () => void; title: string; hint: string; tone?: "primary" | "danger" }) {
    return (
        <button type="button" onClick={onClick}
            className={cn("flex w-full items-start gap-3 rounded-lg border p-3 text-left transition",
                checked ? (tone === "danger" ? "border-destructive/50 bg-destructive/5" : "border-primary/50 bg-primary/5") : "border-border hover:border-primary/30")}>
            <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2", checked ? "border-primary" : "border-muted-foreground/40")}>
                {checked && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold">{title}</span>
                <span className="block text-[11px] text-muted-foreground">{hint}</span>
            </span>
        </button>
    );
}

function Note({ tone = "primary", icon: Icon = Info, children }: { tone?: "primary" | "danger"; icon?: typeof Info; children: React.ReactNode }) {
    return (
        <p className={cn("flex gap-2 rounded-lg border p-3 text-[11.5px]",
            tone === "danger" ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-primary/15 bg-primary/5 text-muted-foreground")}>
            <Icon className="mt-0.5 size-3.5 shrink-0" /> <span>{children}</span>
        </p>
    );
}

const Busy = ({ on }: { on: boolean }) => (on ? <Loader2 className="size-4 animate-spin" /> : null);

function ReplySheet({ open, onClose, eventId, chat }: { open: boolean; onClose: () => void; eventId: number; chat: ContactChatRow }) {
    const send = useSendContactMessage(eventId);
    const messages = useContactMessages(eventId, open ? chat.id : null);
    const [text, setText] = useState("");
    const [photo, setPhoto] = usePhoto();
    const fileRef = useRef<HTMLInputElement>(null);
    // Replying to: the participant's messages, newest first; the newest is picked until another is chosen.
    const theirs = [...(messages.data?.messages ?? [])].reverse().filter((m) => m.side === "participant");
    const [pickedQuote, setPickedQuote] = useState<string | null>(null);
    const quote = theirs.find((m) => String(m.id) === pickedQuote) ?? theirs[0] ?? null;
    const first = chat.participant.name.split(" ")[0];
    const close = () => { setText(""); setPhoto(null); setPickedQuote(null); onClose(); };
    const label = (m: ContactMessage) => `${(m.body || "📷 Photo").slice(0, 55)}${m.body.length > 55 ? "…" : ""} · ${listTime(ms(m.created_at))}`;
    return (
        <ActionSheet open={open} onClose={close} width={460} title="Reply to Participant" subtitle="Send an in-app response to this contact inquiry."
            footer={(
                <>
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    <Button disabled={(!text.trim() && !photo) || send.isPending}
                        onClick={() => send.mutate({ chatId: chat.id, body: text.trim(), photo: photo?.file ?? null, replyTo: quote?.id ?? null, toast: true }, { onSuccess: close })}>
                        <Busy on={send.isPending} /> Send Reply
                    </Button>
                </>
            )}>
            <ParticipantCard chat={chat} />
            <FormField label="To" required><Input readOnly value={`${chat.participant.name} (Participant)`} className="bg-muted/30" /></FormField>
            <FormField label="Replying to" note={quote ? "Shown as a quote above your reply, in the portal and in the app." : undefined}>
                {theirs.length ? (
                    <Select value={quote ? String(quote.id) : undefined} onValueChange={setPickedQuote}>
                        <SelectTrigger className="w-full" aria-label="Replying to"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-w-[420px]">
                            {theirs.map((m) => <SelectItem key={m.id} value={String(m.id)} className="text-[12.5px]">{label(m)}</SelectItem>)}
                        </SelectContent>
                    </Select>
                ) : (
                    <Input readOnly className="bg-muted/30" value={messages.isLoading ? "Loading…" : "New message (the participant has not written yet)"} />
                )}
            </FormField>
            <FormField label="Message" required>
                <Textarea value={text} rows={6} maxLength={2000} placeholder={`Hi ${first},`} onChange={(e) => setText(e.target.value)} />
            </FormField>
            <div className="flex items-center gap-2">
                <PhotoInput inputRef={fileRef} onPick={setPhoto} />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> Add Photo</Button>
                {photo && <PhotoPreview url={photo.url} onClear={() => setPhoto(null)} />}
            </div>
            <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold"><Eye className="size-4" /> Message Preview</p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">Your reply will appear in {first}&apos;s Contact conversation inside the Event Invite app.</p>
            </div>
            <Note>Replies are sent as in-app messages by the event&apos;s designated Contact Person.</Note>
        </ActionSheet>
    );
}

function ResolveSheet({ open, onClose, eventId, chat, types }: { open: boolean; onClose: () => void; eventId: number; chat: ContactChatRow; types: string[] }) {
    const set = useSetContactStatus(eventId);
    const [type, setType] = useState(types[0] ?? "Question answered");
    const [note, setNote] = useState("");
    const [notify, setNotify] = useState(true);
    const close = () => { setNote(""); setNotify(true); onClose(); };
    return (
        <ActionSheet open={open} onClose={close} width={460} title="Mark as Resolved" subtitle="Close this inquiry while keeping its message history."
            footer={(
                <>
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    <Button disabled={set.isPending} onClick={() => set.mutate({ chatId: chat.id, input: { status: "resolved", resolution_type: type, note: note.trim(), notify } }, { onSuccess: close })}>
                        <Busy on={set.isPending} /> Mark Resolved
                    </Button>
                </>
            )}>
            <Lead icon={CheckCircle2} tone="success" title="Resolve this conversation?">
                Mark the current inquiry as completed. You can reopen the conversation if the participant needs more help.
            </Lead>
            <ParticipantCard chat={chat} />
            <FormField label="Resolution Type">
                <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
            </FormField>
            <FormField label="Internal Note" hint=" (Optional)">
                <Textarea value={note} rows={4} maxLength={500} placeholder="Only you can see this note." onChange={(e) => setNote(e.target.value)} />
            </FormField>
            <OptionCard checked={notify} onClick={() => setNotify(!notify)} title="Notify participant" hint="Send a brief confirmation that their inquiry was resolved." />
        </ActionSheet>
    );
}

function ReopenSheet({ open, onClose, eventId, chat }: { open: boolean; onClose: () => void; eventId: number; chat: ContactChatRow }) {
    const set = useSetContactStatus(eventId);
    return (
        <ActionSheet open={open} onClose={onClose} width={460} title="Reopen Conversation" subtitle="Bring this inquiry back to Open."
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={set.isPending} onClick={() => set.mutate({ chatId: chat.id, input: { status: "open" } }, { onSuccess: onClose })}>
                        <Busy on={set.isPending} /> Reopen
                    </Button>
                </>
            )}>
            <ParticipantCard chat={chat} />
            <Note>The last inquiry goes back to Open. A new message from the participant also reopens it on its own.</Note>
        </ActionSheet>
    );
}

function BlockSheet({ open, onClose, eventId, chat, reasons }: { open: boolean; onClose: () => void; eventId: number; chat: ContactChatRow; reasons: string[] }) {
    const set = useSetContactStatus(eventId);
    const [reason, setReason] = useState("");
    const [note, setNote] = useState("");
    const [duration, setDuration] = useState<"event_end" | "permanent">("event_end");
    const close = () => { setReason(""); setNote(""); setDuration("event_end"); onClose(); };
    return (
        <ActionSheet open={open} onClose={close} width={460} title="Block Participant" subtitle="Restrict this participant from contacting the event team."
            footer={(
                <>
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    <Button variant="destructive" disabled={!reason || set.isPending}
                        onClick={() => set.mutate({ chatId: chat.id, input: { status: "blocked", reason, note: note.trim(), duration } }, { onSuccess: close })}>
                        <Busy on={set.isPending} /> Block Participant
                    </Button>
                </>
            )}>
            <ParticipantCard chat={chat} />
            <Note tone="danger" icon={Ban}>
                <b>This participant will be unable to send further contact inquiries for this event.</b> Existing messages remain available for organizer review.
            </Note>
            <FormField label="Reason for Block" required>
                <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select a reason" /></SelectTrigger>
                    <SelectContent>{reasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
            </FormField>
            <FormField label="Internal Note" hint=" (Optional)">
                <Textarea value={note} rows={4} maxLength={500} placeholder="Add moderation notes..." onChange={(e) => setNote(e.target.value)} />
            </FormField>
            <FormField label="Block Duration">
                <div className="flex flex-col gap-2">
                    <OptionCard checked={duration === "event_end"} onClick={() => setDuration("event_end")} title="Until Event Ends" hint="Access restriction ends when the event closes." />
                    <OptionCard checked={duration === "permanent"} onClick={() => setDuration("permanent")} title="Permanent" hint="Block this participant for this event indefinitely." />
                </div>
            </FormField>
        </ActionSheet>
    );
}

function UnblockSheet({ open, onClose, eventId, chat }: { open: boolean; onClose: () => void; eventId: number; chat: ContactChatRow }) {
    const set = useSetContactStatus(eventId);
    const fmt = useDateFormatter();
    const b = chat.block;
    return (
        <ActionSheet open={open} onClose={onClose} width={460} title="Unblock Participant" subtitle="Let this participant contact the event team again."
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={set.isPending} onClick={() => set.mutate({ chatId: chat.id, input: { status: "open" }, done: "Participant unblocked" }, { onSuccess: onClose })}>
                        <Busy on={set.isPending} /> Unblock
                    </Button>
                </>
            )}>
            <ParticipantCard chat={chat} />
            <DetailSection title="Block Details">
                <DetailRow label="Reason">{b?.reason}</DetailRow>
                <DetailRow label="Duration">{b?.duration === "permanent" ? "Permanent" : "Until event ends"}</DetailRow>
                <DetailRow label="Blocked On">{b?.at ? fmt(b.at, true) : null}</DetailRow>
                {b?.note && <DetailRow label="Internal Note">{b.note}</DetailRow>}
            </DetailSection>
        </ActionSheet>
    );
}

function RemoveSheet({ open, onClose, eventId, chat, onDone }: { open: boolean; onClose: () => void; eventId: number; chat: ContactChatRow; onDone: () => void }) {
    const set = useSetContactStatus(eventId);
    const [reason, setReason] = useState("");
    const [notify, setNotify] = useState(false);
    const close = () => { setReason(""); setNotify(false); onClose(); };
    return (
        <ActionSheet open={open} onClose={close} width={460} title="Remove Conversation" subtitle="Confirm this conversation-level action."
            footer={(
                <>
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    <Button variant="destructive" disabled={set.isPending}
                        onClick={() => set.mutate({ chatId: chat.id, input: { status: "removed", reason: reason.trim(), notify } }, { onSuccess: () => { close(); onDone(); } })}>
                        <Busy on={set.isPending} /> Remove Conversation
                    </Button>
                </>
            )}>
            <Lead icon={Trash2} tone="danger" title="Remove this conversation?">
                This will remove {chat.participant.name}&apos;s inquiry thread from the active Contact inbox. Their event registration and RSVP will not be affected.
            </Lead>
            <ParticipantCard chat={chat} />
            <Note tone="danger">
                Messages are kept. If {chat.participant.name.split(" ")[0]} writes again, the conversation comes back to the inbox. This does not delete the participant account.
            </Note>
            <FormField label="Reason" hint=" (Optional)">
                <Textarea value={reason} rows={4} maxLength={500} placeholder="Add a reason for removing this conversation..." onChange={(e) => setReason(e.target.value)} />
            </FormField>
            <OptionCard checked={notify} onClick={() => setNotify(!notify)} title="Send a closure notification" hint="Inform the participant that this conversation is closed." />
        </ActionSheet>
    );
}

/** Tabs inside a details panel (Contact Profile · Permissions · Activity). */
function SheetTabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
    return (
        <div className="flex gap-5 border-b border-border">
            {tabs.map((t) => (
                <button key={t.value} type="button" onClick={() => onChange(t.value)}
                    className={cn("-mb-px border-b-2 pb-2 text-[12.5px] font-medium transition",
                        value === t.value ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                    {t.label}
                </button>
            ))}
        </div>
    );
}

function ContactPersonSheet({ open, onClose, event, data }: { open: boolean; onClose: () => void; event: ClientEvent; data: ContactInbox }) {
    const router = useRouter();
    const wsHref = useEventHref();
    const [tab, setTab] = useState<"profile" | "permissions" | "activity">("profile");
    const c = data.contact;
    const p = data.performance;
    const permissions = (
        <DetailSection title="Communication Permissions">
            <DetailRow label="View contact inquiries"><StatusPill tone="success">Enabled</StatusPill></DetailRow>
            <DetailRow label="Reply to participants"><StatusPill tone="success">Enabled</StatusPill></DetailRow>
            <DetailRow label="Access other event modules">Not granted</DetailRow>
        </DetailSection>
    );
    const performance = (
        <DetailSection title="Contact Performance">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-2">
                {[
                    ["Total Inquiries", p.total_inquiries], ["Resolved", p.resolved],
                    ["Avg. Reply Time", avgReply(p.avg_reply_minutes)], ["Awaiting Reply", p.awaiting],
                ].map(([label, value]) => (
                    <div key={label}>
                        <p className="text-[11px] text-muted-foreground">{label}</p>
                        <p className="text-[16px] font-bold tabular-nums">{value}</p>
                    </div>
                ))}
            </div>
        </DetailSection>
    );
    return (
        <ActionSheet open={open} onClose={onClose} width={460} title="Contact Person Details" subtitle="View the single assigned event contact and their communication access."
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => { onClose(); router.push(wsHref(`/dashboard/events/${event.id}?tab=settings&set=contact`)); }}>Edit Contact Person</Button>
                </>
            )}>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-primary/[0.04] p-3">
                <ChatAvatar name={c.name ?? "Contact Person"} photo={c.photo} size={46} />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">{c.name || "Not set yet"}</p>
                    <p className="truncate text-[11.5px] text-muted-foreground">Single designated Contact Person</p>
                </div>
                <StatusPill tone={c.online ? "success" : "muted"}>{c.online ? "Active" : "Away"}</StatusPill>
            </div>
            <SheetTabs value={tab} onChange={setTab} tabs={[
                { value: "profile", label: "Contact Profile" }, { value: "permissions", label: "Permissions" }, { value: "activity", label: "Activity" },
            ]} />
            {tab === "profile" && (
                <>
                    <DetailSection title="Basic Information">
                        <DetailRow label="Contact Name">{c.name}</DetailRow>
                        <DetailRow label="Event">{event.name}</DetailRow>
                        <DetailRow label="Relationship">{c.designation || "Event Team"}</DetailRow>
                        <DetailRow label="Phone">{c.phone}</DetailRow>
                        <DetailRow label="Email">{c.email}</DetailRow>
                    </DetailSection>
                    {permissions}
                    {performance}
                </>
            )}
            {tab === "permissions" && permissions}
            {tab === "activity" && performance}
            {!c.name && <Note>No contact person is set for this event yet. Participants then see the event owner. Use Edit Contact Person to add one.</Note>}
            <Note>Only one Contact Person is assigned to this event at a time. Changing the assignment requires organizer permission.</Note>
        </ActionSheet>
    );
}

function ParticipantSheet({ open, onClose, eventId, chat, startTab, onReply }: {
    open: boolean; onClose: () => void; eventId: number; chat: ContactChatRow; startTab: "profile" | "inquiries"; onReply: () => void;
}) {
    const query = useContactDetails(eventId, open ? chat.id : null);
    const fmt = useDateFormatter();
    const [tab, setTab] = useState<"profile" | "inquiries" | "activity">(startTab);
    const [shownFor, setShownFor] = useState(startTab);
    if (shownFor !== startTab) { setShownFor(startTab); setTab(startTab); }
    const d = query.data;
    const tonePill = (label: string | null | undefined, good: string[]) => (label ? <StatusPill tone={good.includes(label) ? "success" : "muted"}>{label}</StatusPill> : null);
    return (
        <ActionSheet open={open} onClose={onClose} width={460} title="Participant Details" subtitle="Review the participant's event and contact information."
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={onReply}>Reply to Participant</Button>
                </>
            )}>
            <ParticipantCard chat={chat} />
            <SheetTabs value={tab} onChange={setTab} tabs={[
                { value: "profile", label: "Profile" }, { value: "inquiries", label: `Inquiries (${chat.inquiries})` }, { value: "activity", label: "Activity" },
            ]} />
            {query.isLoading ? <PanelLoading /> : query.isError || !d ? (
                <Empty title="Could not load the details">Please try again in a moment.</Empty>
            ) : tab === "profile" ? (
                <>
                    <DetailSection title="Participant Details">
                        <DetailRow label="Name">{d.participant.name}</DetailRow>
                        <DetailRow label="Relationship">{[d.participant.side ? SIDE_LABEL[d.participant.side] : null, d.participant.relationship].filter(Boolean).join(" · ")}</DetailRow>
                        <DetailRow label="Mobile">{d.participant.mobile}</DetailRow>
                        <DetailRow label="Invitation Status">{tonePill(d.participant.invitation_status, ["Invited", "Accepted"])}</DetailRow>
                        <DetailRow label="RSVP">{tonePill(d.participant.rsvp, ["Attending"])}</DetailRow>
                        <DetailRow label="Contact Status">
                            <StatusPill tone={STATUS_PILL[d.chat.status].tone}>{d.chat.status === "open" ? "Open Inquiry" : STATUS_PILL[d.chat.status].label}</StatusPill>
                        </DetailRow>
                    </DetailSection>
                    <DetailSection title="Inquiry Summary">
                        <DetailRow label="Total Messages">{String(d.summary.total_messages)}</DetailRow>
                        <DetailRow label="Inquiries">{String(d.summary.inquiries)}</DetailRow>
                        <DetailRow label="Last Contacted">{d.summary.last_contacted ? fmt(d.summary.last_contacted) : null}</DetailRow>
                        <DetailRow label="Assigned Contact">{d.summary.assigned_contact}</DetailRow>
                    </DetailSection>
                </>
            ) : tab === "inquiries" ? (
                d.inquiries.length === 0 ? <Empty title="No inquiries yet">The participant has not asked a question yet.</Empty> : (
                    <div className="flex flex-col gap-2">
                        {d.inquiries.map((i, n) => (
                            <div key={i.id} className="rounded-lg border border-border p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[12px] font-bold">Inquiry {d.inquiries.length - n}</p>
                                    <StatusPill tone={i.resolved_at ? (i.resolution_type === "Conversation removed" ? "muted" : "success") : "warning"}>
                                        {i.resolved_at ? (i.resolution_type === "Conversation removed" ? "Removed" : "Resolved") : "Open"}
                                    </StatusPill>
                                </div>
                                <p className="mt-1 line-clamp-2 text-[12px]">{i.first_message || "Photo"}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    Opened {fmt(i.opened_at, true)}{i.resolved_at ? ` · Closed ${fmt(i.resolved_at, true)}` : ""}
                                </p>
                                {i.resolution_type && i.resolution_type !== "Conversation removed" && <p className="mt-1 text-[11px] text-success">{i.resolution_type}</p>}
                                {i.resolution_note && <p className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">Note: {i.resolution_note}</p>}
                            </div>
                        ))}
                    </div>
                )
            ) : (
                d.activity.length === 0 ? <Empty title="No activity yet" /> : (
                    <ol className="flex flex-col gap-3 border-l border-border pl-4">
                        {d.activity.map((a, n) => (
                            <li key={n} className="relative">
                                <span className={cn("absolute top-1 -left-[21px] size-2.5 rounded-full",
                                    a.kind === "resolved" ? "bg-success" : a.kind === "blocked" || a.kind === "removed" ? "bg-destructive" : "bg-primary")} />
                                <p className="text-[12px] font-medium">{a.text}</p>
                                <p className="text-[11px] text-muted-foreground">{fmt(a.at, true)}</p>
                            </li>
                        ))}
                    </ol>
                )
            )}
            <Note icon={Link2}>Contact communication is managed separately from Wed Wishes and general participant chat.</Note>
        </ActionSheet>
    );
}

function NewMessageSheet({ open, onClose, eventId, onSent }: { open: boolean; onClose: () => void; eventId: number; onSent: (chatId: number) => void }) {
    const people = useContactRecipients(eventId, open);
    const start = useStartContactChat(eventId);
    // Several participants at once (Jamal, 2026-11-11): each gets the message in their own Contact conversation.
    const [who, setWho] = useState<number[]>([]);
    const [find, setFind] = useState("");
    const [text, setText] = useState("");
    const [photo, setPhoto] = usePhoto();
    const fileRef = useRef<HTMLInputElement>(null);
    const list = useMemo(() => {
        const f = find.trim().toLowerCase();
        return (people.data ?? []).filter((p) => !f || p.name.toLowerCase().includes(f));
    }, [people.data, find]);
    const chosen = (people.data ?? []).filter((p) => who.includes(p.client_id));
    const allShown = list.length > 0 && list.every((p) => who.includes(p.client_id));
    const toggle = (id: number) => setWho((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
    const toggleShown = () => setWho((w) => {
        const ids = list.map((p) => p.client_id);
        return allShown ? w.filter((x) => !ids.includes(x)) : [...new Set([...w, ...ids])];
    });
    const close = () => { setWho([]); setFind(""); setText(""); setPhoto(null); onClose(); };
    const label = who.length > 1 ? `Send to ${who.length}` : "Send Message";
    return (
        <ActionSheet open={open} onClose={close} width={460} title="New Message" subtitle="Write to one or more participants of this event. Each gets it in their own Contact conversation in the app."
            footer={(
                <>
                    <Button variant="outline" disabled={start.isPending} onClick={close}>Cancel</Button>
                    <Button disabled={!who.length || (!text.trim() && !photo) || start.isPending}
                        onClick={() => start.mutate({ participantIds: who, body: text.trim(), photo: photo?.file ?? null }, {
                            onSuccess: (r) => { close(); onSent(r.chatIds[0]); },
                        })}>
                        <Busy on={start.isPending} /> {label}
                    </Button>
                </>
            )}>
            <FormField label="To" required>
                <div className="flex flex-col gap-2">
                    {chosen.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {chosen.map((p) => (
                                <span key={p.client_id} className="inline-flex max-w-[200px] items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 py-0.5 pr-1 pl-1 text-[12px] font-semibold">
                                    <ChatAvatar name={p.name} photo={p.photo} size={20} />
                                    <span className="truncate">{p.name}</span>
                                    <button type="button" onClick={() => toggle(p.client_id)} className="grid size-4 place-items-center rounded-sm text-muted-foreground hover:text-destructive" aria-label={`Remove ${p.name}`}>
                                        <X className="size-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <SearchBox value={find} onChange={setFind} placeholder="Search participant..." />
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                        {people.isLoading ? <PanelLoading /> : people.isError ? (
                            <p className="p-4 text-center text-[12px] text-muted-foreground">Could not load the participants.</p>
                        ) : list.length === 0 ? (
                            <p className="p-4 text-center text-[12px] text-muted-foreground">
                                {people.data?.length ? "No participants match." : "No participants use the app for this event yet."}
                            </p>
                        ) : (
                            <>
                                <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-3 border-b border-border bg-muted px-3 py-2 text-[12px] font-semibold">
                                    <Checkbox checked={allShown} onCheckedChange={toggleShown} aria-label="Select all participants" />
                                    <span className="flex-1">{find.trim() ? "Select all shown" : "Select all"} ({list.length})</span>
                                    <span className="text-[11px] font-medium text-primary">{who.length} selected</span>
                                </label>
                                {list.map((p) => {
                                    const on = who.includes(p.client_id);
                                    return (
                                        <label key={p.client_id}
                                            className={cn("flex w-full cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2 text-left last:border-0 hover:bg-muted/50", on && "bg-primary/5")}>
                                            <Checkbox checked={on} onCheckedChange={() => toggle(p.client_id)} aria-label={p.name} />
                                            <ChatAvatar name={p.name} photo={p.photo} size={30} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[12.5px] font-semibold">{p.name}</span>
                                                <span className="block truncate text-[11px] text-muted-foreground">{[p.side ? SIDE_LABEL[p.side] : null, p.relationship].filter(Boolean).join(" · ") || "Participant"}</span>
                                            </span>
                                            {p.chat_id && <StatusPill tone="muted">Has chat</StatusPill>}
                                        </label>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
            </FormField>
            <FormField label="Message" required>
                <Textarea value={text} rows={6} maxLength={2000} placeholder="Type your message..." onChange={(e) => setText(e.target.value)} />
            </FormField>
            <div className="flex items-center gap-2">
                <PhotoInput inputRef={fileRef} onPick={setPhoto} />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> Add Photo</Button>
                {photo && <PhotoPreview url={photo.url} onClear={() => setPhoto(null)} />}
            </div>
            <Note>Sent as an in-app message from the event&apos;s designated Contact Person.</Note>
        </ActionSheet>
    );
}
