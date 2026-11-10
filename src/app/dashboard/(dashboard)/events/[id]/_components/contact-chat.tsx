"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ArrowLeft, CheckCheck, CheckCircle2, Clock, Filter, ImagePlus, Mail, MailOpen, MessageSquare, MessagesSquare, MoreHorizontal,
    Phone, RotateCcw, Send, Smile, Wifi, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { CountTabs, ModuleHeader, Notice, OverviewCard, SearchBox, StatTile, StatusPill } from "@/components/module-kit";
import { cn } from "@/lib/utils";
import type { ClientEvent } from "@/hooks/use-client-events";
import { ChatAvatar, DayPill, Presence, dayStart, listTime, timeOf, useFitHeight } from "./wishes-chat";

/**
 * Contact (Jamal, 2026-11-10) — messages participants send to the event's contact person, in the same
 * chat layout as Wed Wishes: tiles, Conversations on the left, the conversation on the right.
 *
 * FRONTEND ONLY for now ("we discuss the backend later"): the conversations below are SAMPLE DATA kept in
 * the browser. Replies, Resolved / Reopen and Mark as Unread work on screen but are not saved and vanish on
 * reload. When the backend exists, replace SAMPLE + the useState store with a hook (list / send / read /
 * resolve) — the components only read `ContactThread`.
 */

type Message = { id: number; from: "participant" | "organizer"; text: string; photo?: string | null; at: number };
export type ContactThread = {
    key: string;
    name: string;
    photo: string | null;
    side: "bride" | "groom" | null;
    relationship: string | null;
    mobile: string | null;
    online: boolean;
    lastSeen: string | null;
    resolved: boolean;
    unread: number;
    messages: Message[];
};
type Tab = "all" | "unread" | "resolved";
type Status = "all" | "awaiting" | "online";

const SIDE_LABEL = { bride: "Bride Side", groom: "Groom Side" } as const;
const H = 3600_000;

/** Sample conversations, timed relative to now (hours ago). */
function sampleThreads(): ContactThread[] {
    const now = Date.now();
    let id = 1;
    const m = (from: Message["from"], hoursAgo: number, text: string): Message => ({ id: id++, from, text, at: now - hoursAgo * H });
    return [
        {
            key: "s1", name: "Aditi Sharma", photo: null, side: "bride", relationship: "Friend", mobile: "+91 90000 00011",
            online: true, lastSeen: new Date(now - 60_000).toISOString(), resolved: false, unread: 2,
            messages: [
                m("participant", 26, "Hi! Is there parking available at the venue?"),
                m("organizer", 25.5, "Yes, there is free parking behind the hall for about 80 cars. 🚗"),
                m("participant", 0.6, "Great, thanks! One more thing — what time should we arrive for the Nikah?"),
                m("participant", 0.5, "We are coming from Tirunelveli town."),
            ],
        },
        {
            key: "s2", name: "Rohan Verma", photo: null, side: "groom", relationship: "Cousin", mobile: "+91 90000 00012",
            online: false, lastSeen: new Date(now - 3 * H).toISOString(), resolved: false, unread: 1,
            messages: [
                m("participant", 5, "Can I bring my parents along? They were not on the guest list."),
            ],
        },
        {
            key: "s3", name: "Neha Kapoor", photo: null, side: "bride", relationship: "Colleague", mobile: "+91 90000 00013",
            online: false, lastSeen: new Date(now - 20 * H).toISOString(), resolved: true, unread: 0,
            messages: [
                m("participant", 30, "Will there be vegetarian food at the reception?"),
                m("organizer", 29, "Yes, a full vegetarian counter is planned. 🥗"),
                m("participant", 28.8, "Perfect, thank you so much!"),
            ],
        },
        {
            key: "s4", name: "Karan Malhotra", photo: null, side: "groom", relationship: "Friend", mobile: "+91 90000 00014",
            online: true, lastSeen: new Date(now - 30_000).toISOString(), resolved: false, unread: 0,
            messages: [
                m("participant", 8, "Is there a dress code for the reception?"),
                m("organizer", 7.5, "Traditional or semi-formal is perfect. Pastel colours are welcome! 👔"),
            ],
        },
        {
            key: "s5", name: "Rahul Sharma", photo: null, side: "groom", relationship: "Uncle", mobile: "+91 90000 00001",
            online: false, lastSeen: null, resolved: false, unread: 3,
            messages: [
                m("participant", 50, "Hello, I could not open the location link in the app."),
                m("participant", 49.9, "Could you share the venue address here?"),
                m("participant", 2, "Still waiting for the address, please."),
            ],
        },
    ];
}

const EMOJIS = ["🙏", "😊", "❤️", "👍", "🎉", "😂", "🥰", "👏", "🌸", "✨", "📍", "🚗"];
const QUICK_REPLIES = [
    "Thank you! 🙏",
    "Sure, I will check and get back to you.",
    "Please call me if you need anything.",
];

const last = (t: ContactThread) => t.messages[t.messages.length - 1];
const awaiting = (t: ContactThread) => !t.resolved && last(t)?.from === "participant";
const previewOf = (msg?: Message) => (!msg ? "" : `${msg.from === "organizer" ? "You: " : ""}${msg.text || (msg.photo ? "📷 Photo" : "")}`);

export function ContactPanel({ event }: { event: ClientEvent }) {
    const [threads, setThreads] = useState<ContactThread[]>(sampleThreads);
    const [tab, setTab] = useState<Tab>("all");
    const [status, setStatus] = useState<Status>("all");
    const [search, setSearch] = useState("");
    const [picked, setPicked] = useState<string | null>(null);
    const [phoneThread, setPhoneThread] = useState(false);
    const [boxRef, boxHeight] = useFitHeight();

    const update = (key: string, fn: (t: ContactThread) => ContactThread) => setThreads((all) => all.map((t) => (t.key === key ? fn(t) : t)));

    const sorted = useMemo(() => [...threads].sort((a, b) => (last(b)?.at ?? 0) - (last(a)?.at ?? 0)), [threads]);
    const q = search.trim().toLowerCase();
    const filtered = sorted.filter((t) =>
        (status === "all" || (status === "awaiting" && awaiting(t)) || (status === "online" && t.online))
        && (!q || t.name.toLowerCase().includes(q) || t.messages.some((x) => x.text.toLowerCase().includes(q))));
    const open = filtered.filter((t) => !t.resolved);
    const counts = { all: open.length, unread: open.filter((t) => t.unread > 0).length, resolved: filtered.filter((t) => t.resolved).length };
    const shown = tab === "unread" ? open.filter((t) => t.unread > 0) : tab === "resolved" ? filtered.filter((t) => t.resolved) : open;
    const selected = threads.find((t) => t.key === picked) ?? shown[0] ?? null;

    // Opening a conversation reads it — once per opening, so "Mark as Unread" sticks while it stays shown.
    const selectedKey = selected?.key ?? null;
    const [readKey, setReadKey] = useState<string | null>(null);
    if (selectedKey !== readKey) {
        setReadKey(selectedKey);
        if (selectedKey && (selected?.unread ?? 0) > 0) setThreads((all) => all.map((t) => (t.key === selectedKey ? { ...t, unread: 0 } : t)));
    }

    const tiles = {
        total: threads.length,
        unread: threads.reduce((n, t) => n + t.unread, 0),
        awaiting: threads.filter(awaiting).length,
        resolved: threads.filter((t) => t.resolved).length,
        online: threads.filter((t) => t.online).length,
    };
    const statusLabel: Record<Status, string> = { all: "All conversations", awaiting: "Awaiting your reply", online: "Online now" };
    const showView = (nextTab: Tab, nextStatus: Status) => { setTab(nextTab); setStatus(nextStatus); };

    return (
        <div className="flex flex-col gap-4">
            <ModuleHeader
                title="Contact"
                subtitle={`Messages participants send to the contact person of ${event.name}.`}
                actions={<StatusPill tone="warning">Sample data</StatusPill>}
            />
            <Notice tone="warning" title="Preview">
                These are sample conversations to show the design. Replies are not sent or saved yet — the backend comes next.
            </Notice>
            <OverviewCard>
                <StatTile icon={MessagesSquare} value={tiles.total} label="Conversations" active={tab === "all" && status === "all"} onClick={() => showView("all", "all")} />
                <StatTile icon={Mail} value={tiles.unread} label="Unread Messages" tone="primary" active={tab === "unread"} onClick={() => showView("unread", "all")} />
                <StatTile icon={Clock} value={tiles.awaiting} label="Awaiting Reply" tone="warning" active={status === "awaiting"} onClick={() => showView("all", "awaiting")} />
                <StatTile icon={CheckCircle2} value={tiles.resolved} label="Resolved" tone="success" active={tab === "resolved"} onClick={() => showView("resolved", "all")} />
                <StatTile icon={Wifi} value={tiles.online} label="Online Now" tone="violet" active={status === "online"} onClick={() => showView("all", "online")} />
            </OverviewCard>

            <div ref={boxRef} style={{ height: boxHeight }} className="grid min-h-[420px] min-w-0 gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
                {/* ── Conversations ── */}
                <section className={cn("min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card", phoneThread ? "hidden lg:flex" : "flex")}>
                    <div className="flex flex-col gap-2.5 border-b border-border p-3">
                        <p className="text-[14px] font-bold">Conversations ({threads.length})</p>
                        <div className="flex items-center gap-2">
                            <SearchBox value={search} onChange={setSearch} placeholder="Search participant or message..." className="min-w-0" />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="icon" variant="outline" className={cn("size-8 shrink-0", status !== "all" && "border-primary text-primary")} aria-label="Filter">
                                        <Filter className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                    <DropdownMenuLabel className="text-[11.5px] text-muted-foreground">Show</DropdownMenuLabel>
                                    {(Object.keys(statusLabel) as Status[]).map((s) => (
                                        <DropdownMenuItem key={s} onClick={() => setStatus(s)} className={cn("text-[13px]", status === s && "font-semibold text-primary")}>
                                            {statusLabel[s]}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <CountTabs stretch value={tab} onChange={setTab} tabs={[
                            { value: "all", label: "All", count: counts.all },
                            { value: "unread", label: "Unread", count: counts.unread },
                            { value: "resolved", label: "Resolved", count: counts.resolved },
                        ]} />
                        {status !== "all" && (
                            <button type="button" onClick={() => setStatus("all")} className="flex items-center gap-1 self-start rounded-full bg-primary/10 px-2.5 py-0.5 text-[11.5px] font-medium text-primary">
                                {statusLabel[status]} <X className="size-3" />
                            </button>
                        )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {shown.length === 0 ? (
                            <p className="p-6 text-center text-[12px] text-muted-foreground">No conversations match.</p>
                        ) : shown.map((t) => (
                            <button key={t.key} type="button" onClick={() => { setPicked(t.key); setPhoneThread(true); }}
                                className={cn("flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left transition",
                                    selected?.key === t.key ? "bg-primary/10" : "hover:bg-muted/50")}>
                                <ChatAvatar name={t.name} photo={t.photo} size={34} online={t.online} />
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="truncate text-[12.5px] font-bold">{t.name}</span>
                                        <span className={cn("shrink-0 text-[10.5px]", t.unread ? "font-semibold text-primary" : "text-muted-foreground")}>{listTime(last(t)?.at ?? 0)}</span>
                                    </span>
                                    <span className="mt-0.5 flex items-center justify-between gap-2">
                                        <span className={cn("truncate text-[11.5px]", t.unread ? "font-medium text-foreground" : "text-muted-foreground")}>{previewOf(last(t))}</span>
                                        <span className="flex shrink-0 items-center gap-1">
                                            {t.resolved && <CheckCircle2 className="size-3.5 text-success" aria-label="Resolved" />}
                                            {!t.unread && awaiting(t) && <Clock className="size-3.5 text-warning" aria-label="Awaiting reply" />}
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
                        <ContactThreadView
                            key={selected.key}
                            thread={selected}
                            onBack={() => setPhoneThread(false)}
                            onSend={(text, photo) => update(selected.key, (t) => ({
                                ...t,
                                resolved: false,
                                messages: [...t.messages, { id: Date.now(), from: "organizer", text, photo, at: Date.now() }],
                            }))}
                            onResolve={(resolved) => {
                                update(selected.key, (t) => ({ ...t, resolved }));
                                toast.success(resolved ? "Marked as resolved" : "Conversation reopened");
                            }}
                            onUnread={() => {
                                update(selected.key, (t) => ({ ...t, unread: Math.max(1, t.unread) }));
                                setPicked(null);
                                setPhoneThread(false);
                                toast.success("Marked as unread");
                            }}
                        />
                    ) : (
                        <div className="grid flex-1 place-items-center p-6 text-center text-[13px] text-muted-foreground">
                            <span><MessageSquare className="mx-auto mb-2 size-8 text-primary/40" />Pick a conversation to read the messages.</span>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

/* ── One conversation ────────────────────────────────────────────────────── */

function ContactThreadView({ thread, onBack, onSend, onResolve, onUnread }: {
    thread: ContactThread; onBack: () => void;
    onSend: (text: string, photo: string | null) => void; onResolve: (resolved: boolean) => void; onUnread: () => void;
}) {
    const scroller = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [thread.messages.length]);
    const meta = [thread.side ? SIDE_LABEL[thread.side] : null, thread.relationship, "Participant"].filter(Boolean).join(" • ");

    return (
        <>
            <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
                <Button size="icon" variant="ghost" className="size-8 lg:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="size-4" /></Button>
                <ChatAvatar name={thread.name} photo={thread.photo} size={36} online={thread.online} />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold">{thread.name}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        {meta}
                        <Presence online={thread.online} lastSeen={thread.lastSeen} />
                        {thread.resolved && <StatusPill tone="success" icon={CheckCircle2}>Resolved</StatusPill>}
                    </p>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="outline" className="size-9 rounded-full" aria-label="More"><MoreHorizontal className="size-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        {thread.resolved
                            ? <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={() => onResolve(false)}><RotateCcw className="size-4 text-muted-foreground" /> Reopen Conversation</DropdownMenuItem>
                            : <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={() => onResolve(true)}><CheckCircle2 className="size-4 text-muted-foreground" /> Mark as Resolved</DropdownMenuItem>}
                        <DropdownMenuItem className="gap-2.5 py-2 text-[13px]" onClick={onUnread}><MailOpen className="size-4 text-muted-foreground" /> Mark as Unread</DropdownMenuItem>
                        {thread.mobile && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild className="gap-2.5 py-2 text-[13px]">
                                    <a href={`tel:${thread.mobile.replace(/\s/g, "")}`}><Phone className="size-4 text-muted-foreground" /> Call {thread.mobile}</a>
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>

            <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-primary/[0.03] px-4 py-3">
                {thread.messages.map((msg, i) => {
                    const prev = thread.messages[i - 1];
                    const newDay = !prev || dayStart(prev.at) !== dayStart(msg.at);
                    const mine = msg.from === "organizer";
                    return (
                        <div key={msg.id} className="contents">
                            {newDay && <DayPill at={msg.at} />}
                            <div className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                                {!mine && <ChatAvatar name={thread.name} photo={thread.photo} size={28} />}
                                <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 shadow-xs",
                                    mine ? "rounded-br-sm bg-primary/12 text-foreground" : "rounded-bl-sm border border-border bg-card")}>
                                    {msg.photo && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={msg.photo} alt="" className="mb-1.5 max-h-52 rounded-lg object-cover" />
                                    )}
                                    {msg.text && <p className="whitespace-pre-line break-words text-[12.5px] leading-relaxed">{msg.text}</p>}
                                    <p className={cn("mt-1 flex items-center gap-1 text-[10.5px] text-muted-foreground", mine && "justify-end")}>
                                        {timeOf(new Date(msg.at).toISOString())}
                                        {mine && <CheckCheck className="size-3.5 text-primary" />}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <ContactComposer name={thread.name} onSend={onSend} />
        </>
    );
}

function ContactComposer({ name, onSend }: { name: string; onSend: (text: string, photo: string | null) => void }) {
    const [text, setText] = useState("");
    const [photo, setPhoto] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const ready = !!text.trim() || !!photo;
    const send = (value = text) => {
        if (!value.trim() && !photo) return;
        onSend(value.trim(), photo);
        setText("");
        setPhoto(null);
    };
    return (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5">
            <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((r) => (
                    <button key={r} type="button" onClick={() => send(r)}
                        className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11.5px] text-foreground/80 transition hover:border-primary/40 hover:text-primary">
                        {r}
                    </button>
                ))}
            </div>
            {photo && (
                <div className="relative w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo} alt="" className="h-16 rounded-lg object-cover" />
                    <button type="button" onClick={() => setPhoto(null)} className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background" aria-label="Remove photo">
                        <X className="size-3" />
                    </button>
                </div>
            )}
            <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto(URL.createObjectURL(f)); e.target.value = ""; }} />
                <Button size="icon" variant="ghost" className="size-9 shrink-0" onClick={() => fileRef.current?.click()} aria-label="Add photo"><ImagePlus className="size-4.5" /></Button>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-9 shrink-0" aria-label="Emoji"><Smile className="size-4.5" /></Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="grid w-auto grid-cols-6 gap-1 p-2">
                        {EMOJIS.map((e) => (
                            <button key={e} type="button" className="grid size-8 place-items-center rounded-md text-[18px] hover:bg-muted" onClick={() => setText((t) => t + e)}>{e}</button>
                        ))}
                    </PopoverContent>
                </Popover>
                <Textarea value={text} rows={1} maxLength={1000} placeholder={`Reply to ${name.split(" ")[0]}…`}
                    className="max-h-28 min-h-9 flex-1 resize-none py-2 text-[12.5px]"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <Button size="icon" className="size-9 shrink-0 rounded-full" disabled={!ready} onClick={() => send()} aria-label="Send"><Send className="size-4" /></Button>
            </div>
        </div>
    );
}
