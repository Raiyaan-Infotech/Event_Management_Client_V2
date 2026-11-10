"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ArrowLeft, Check, CheckCircle2, Clock, Eye, EyeOff, Filter, Heart, ImagePlus, Loader2, Mail, MessageSquare, Pencil, Plus, Settings,
    Trash2, TriangleAlert, Video, X, Ban, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    ActionSheet, CharCount, DetailRow, DetailSection, FormField, FormPanel, ModuleHeader, Notice, OverviewCard, StatTile, StatusPill, type RowAction,
} from "@/components/module-kit";
import type { Tone } from "@/components/module-kit/tones";
import type { ClientEvent } from "@/hooks/use-client-events";
import {
    useBlockWishWriter, useCreateWish, useDeleteWish, useEventWishes, useSaveWishFilter, useSaveWishSettings, useUpdateWish, useWishFilter, type BlockReason, type Wish, type WishAudience, type WishFilter, type WishSettings, type WordAction,
} from "@/hooks/use-event-engagement";
import { Empty, PanelLoading, Section, SettingsShell, SwitchRow } from "./module-ui";
import { WishesChat, type ChatPanel, type ChatView } from "./wishes-chat";
import { ApproveWish, EditWish, ManageComments, PersonCard, SendNotification, ViewWish, WishPanelsProvider, useWishPanels } from "./wish-panels";
import { useEventParticipants } from "@/hooks/use-event-participants";
import { useEventOptions } from "@/hooks/use-client-portal";
import { useSetMenuShown } from "@/hooks/use-event-modules";
import { cn } from "@/lib/utils";

/**
 * Since 2026-11-09 the page is Jamal's CHAT design (wishes-chat.tsx): conversations per participant
 * instead of the Wishes List table. View / Edit / Approve & Publish / Manage Comments / Send In-App
 * Notification are in wish-panels.tsx (Jamal's panel designs); Block, Blocked Words, Post Wish and
 * Delete are below.
 *
 * Wed Wishes Monitor — Jamal's web design (Wishes_Monitor_Action_Flows, 2026-11-07):
 * header (Wishes Settings · Post Wish), tiles (Total · Published · Pending Review ·
 * Hidden · Total Likes), search + Wish Type / Recipient / Date, tabs, the Wishes
 * List table with a ⋯ menu per row, and every action as a panel on the right:
 * View · Edit (organizer posts only — the server never lets the organizer reword a
 * participant's wish) · Moderate · Send In-App Message · Block · Delete · Post a Wish
 * · Blocked Words. Wishes Settings is its own page (two cards).
 * "Pending" = caught by the blocked-words filter, not reviewed yet (the server has no
 * other approval step). Since 2026-11-09 also: Manage Comments, the Reported tab, block reason + note,
 * and a per-word action in Blocked Words (replace / hold for review / hide) — all on the server.
 */

const AUDIENCE_LONG: Record<WishAudience, string> = { both: "Both (Bride & Groom)", bride: "Bride", groom: "Groom" };
const MAX_MESSAGE = 500;

type Tab = "all" | "published" | "pending" | "hidden" | "blocked" | "reported";
const REASON_LABEL: Record<BlockReason, string> = {
    inappropriate: "Inappropriate or offensive content", spam: "Spam / repeated posts", harassment: "Harassment of other participants", other: "Other",
};
const ACTION_META: Record<WordAction, { label: string; tone: Tone }> = {
    replace: { label: "Replace", tone: "success" }, hold: { label: "Hold for Review", tone: "warning" }, hide: { label: "Hide", tone: "danger" },
};
const reported = (w: Wish) => (w.report_count ?? 0) > 0;
const tabOf = (w: Wish): Tab => (w.status === "blocked" ? "blocked" : w.is_flagged ? "pending" : w.status === "hidden" ? "hidden" : "published");
const fromParticipant = (w: Wish) => !w.added_by_organizer && w.participant_id !== null;
type Panel =
    | { kind: "view" | "edit" | "moderate" | "message" | "block" | "delete" | "comments"; wish: Wish }
    | { kind: "words" };

export function WishesPanel({ event }: { event: ClientEvent }) {
    const query = useEventWishes(event.id);
    const participants = useEventParticipants(event.id);
    const update = useUpdateWish(event.id);
    const [view, setView] = useState<ChatView>({ tab: "all", status: "all" });
    const [panel, setPanel] = useState<Panel | null>(null);
    const [settingsPage, setSettingsPage] = useState(false);
    const [posting, setPosting] = useState(false);

    const wishes = useMemo(() => query.data?.wishes ?? [], [query.data]);
    // The open panel always shows the latest copy of its wish (the list refetches after a change).
    const live = (w: Wish) => wishes.find((x) => x.id === w.id) ?? w;

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Wed Wishes"><Empty title="Could not load the wishes">Please try again in a moment.</Empty></Section>;
    }
    const data = query.data;
    const all = { total: wishes.length, published: 0, pending: 0, hidden: 0, likes: 0 };
    wishes.forEach((w) => {
        const t = tabOf(w);
        if (t === "published") all.published += 1;
        if (t === "pending") all.pending += 1;
        if (t === "hidden" || t === "blocked") all.hidden += 1;
        all.likes += w.like_count;
    });

    const open = (p: Panel) => setPanel(p);
    const close = () => setPanel(null);
    /** The ⋯ on a wish bubble (the design's list; Block is in the conversation header). */
    const actionsFor = (w: Wish): RowAction[] => [
        { label: "View Wish", icon: Eye, onClick: () => open({ kind: "view", wish: w }) },
        { label: "Edit Wish", icon: Pencil, onClick: () => open({ kind: "edit", wish: w }), hidden: !w.can_edit },
        { label: "Approve / Publish", icon: Check, onClick: () => open({ kind: "moderate", wish: w }), hidden: !data.can_manage || (tabOf(w) === "published" && !reported(w)) },
        w.is_hidden
            ? { label: "Show Wish", icon: Eye, onClick: () => update.mutate({ id: w.id, data: { show_in_app: true }, done: "Wish is visible again" }), hidden: !data.can_manage || w.status === "blocked" }
            : { label: "Hide Wish", icon: EyeOff, onClick: () => update.mutate({ id: w.id, data: { show_in_app: false }, done: "Wish hidden" }), hidden: !data.can_manage },
        { label: "Send In-App Message", icon: Mail, onClick: () => open({ kind: "message", wish: w }), hidden: !data.can_manage || !fromParticipant(w) },
        { label: `Manage Comments${w.comment_count ? ` (${w.comment_count})` : ""}`, icon: MessageSquare, onClick: () => open({ kind: "comments", wish: w }), hidden: !data.can_manage },
        { label: "Delete Wish", icon: Trash2, onClick: () => open({ kind: "delete", wish: w }), danger: true, divider: true, hidden: !w.can_delete },
    ];
    const fromChat = (kind: ChatPanel, w: Wish) => open({ kind, wish: w });
    const showChat = (v: ChatView) => { setSettingsPage(false); setView(v); };

    const header = (
        <ModuleHeader
            title={settingsPage ? "Wishes Settings" : "Wed Wishes"}
            subtitle={settingsPage ? "What participants can do in Wed Wishes, and how wishes are moderated." : "View, manage and moderate participant wishes, images and videos."}
            actions={data.can_manage && (
                <>
                    {settingsPage
                        ? <Button variant="outline" size="sm" onClick={() => setSettingsPage(false)}><ArrowLeft className="size-3.5" /> Back to Wishes</Button>
                        : <Button variant="outline" size="sm" className="border-primary/40 text-primary hover:bg-primary/5 hover:text-primary" onClick={() => { close(); setSettingsPage(true); }}><Settings className="size-3.5" /> Wishes Settings</Button>}
                    <Button variant="outline" size="sm" onClick={() => { setSettingsPage(false); open({ kind: "words" }); }}><Filter className="size-3.5" /> Blocked Words</Button>
                    <Button size="sm" onClick={() => { setSettingsPage(false); close(); setPosting(true); }}><Plus className="size-3.5" /> Post Wish</Button>
                </>
            )}
        />
    );
    // Tiles narrow the conversations (Pending / Hidden Wishes → the filter).
    const tiles = (
        <OverviewCard>
            <StatTile icon={Heart} value={all.total} label="Total Wishes" active={!settingsPage && view.tab === "all" && view.status === "all"} onClick={() => showChat({ tab: "all", status: "all" })} />
            <StatTile icon={CheckCircle2} value={all.published} label="Published" tone="success" />
            <StatTile icon={Clock} value={all.pending} label="Pending Review" tone="warning" active={!settingsPage && view.status === "pending"} onClick={() => showChat({ tab: "all", status: "pending" })} />
            <StatTile icon={EyeOff} value={all.hidden} label="Hidden Wishes" tone="danger" active={!settingsPage && view.status === "hidden_wishes"} onClick={() => showChat({ tab: "all", status: "hidden_wishes" })} />
            <StatTile icon={Heart} value={all.likes} label="Total Likes" tone="violet" />
        </OverviewCard>
    );

    return (
        <WishPanelsProvider eventName={event.name} participants={participants.data}>
        <div className="flex flex-col gap-4">
            {header}
            {tiles}
            {settingsPage
                ? <WishesSettingsPage event={event} settings={data.settings} onDone={() => setSettingsPage(false)} />
                : <WishesChat event={event} data={data} wishes={wishes} view={view} onView={setView} bubbleActions={actionsFor} onPanel={fromChat} />}
            {/* Every action panel slides in from the right ("canvas"); Delete is a centred pop-up. */}
            {panel && (
                <>
                    {panel.kind === "view" && <ViewWish eventId={event.id} wish={live(panel.wish)} onClose={close} onEdit={() => open({ kind: "edit", wish: panel.wish })} onComments={() => open({ kind: "comments", wish: panel.wish })} />}
                    {panel.kind === "comments" && <ManageComments key={panel.wish.id} eventId={event.id} wish={live(panel.wish)} onClose={close} />}
                    {panel.kind === "edit" && <EditWish key={panel.wish.id} eventId={event.id} wish={live(panel.wish)} onClose={close} />}
                    {panel.kind === "moderate" && <ApproveWish key={panel.wish.id} eventId={event.id} wish={live(panel.wish)} onClose={close} />}
                    {panel.kind === "message" && <SendNotification key={panel.wish.id} eventId={event.id} wish={live(panel.wish)} onClose={close} />}
                    {panel.kind === "block" && <BlockWriter key={panel.wish.id} eventId={event.id} wish={live(panel.wish)} onClose={close} />}
                    {panel.kind === "delete" && <DeleteWish eventId={event.id} wish={live(panel.wish)} onClose={close} />}
                    {panel.kind === "words" && <BlockedWords eventId={event.id} onClose={close} />}
                </>
            )}
            {posting && <PostWish eventId={event.id} eventName={event.name} onClose={() => setPosting(false)} />}
        </div>
        </WishPanelsProvider>
    );
}

/* ── Block / Unblock (Jamal's design, 2026-11-10) ────────────────────────── */

const BLOCK_NOTE_MAX = 300;
const ACCESS_PILL: Record<string, { label: string; tone: Tone }> = {
    active: { label: "Active", tone: "success" }, pending: { label: "Pending", tone: "warning" }, blocked: { label: "Blocked", tone: "danger" },
};

/**
 * Block Participant: who, a warning, Reason for Block * (dropdown), Note (optional, 300) → Block.
 * Unblock: who, why they were blocked, → Unblock. Nothing else (Jamal: "remove the unwanted things").
 */
function BlockWriter({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const block = useBlockWishWriter(eventId);
    const { people } = useWishPanels();
    const [reason, setReason] = useState<BlockReason | "">("");
    const [note, setNote] = useState("");
    const unblock = wish.author_blocked;
    const p = wish.participant_id ? people.get(wish.participant_id) : undefined;
    const access = unblock ? ACCESS_PILL.blocked : p ? ACCESS_PILL[p.access ?? (p.has_joined ? "active" : "pending")] : null;
    const run = () => {
        if (!unblock && !reason) { toast.error("Please choose a reason for the block."); return; }
        block.mutate({ id: wish.id, blocked: !unblock, ...(unblock ? {} : { reason: reason as BlockReason, note: note.trim() }) }, { onSuccess: onClose });
    };
    return (
        <ActionSheet open onClose={onClose} icon={unblock ? UserCheck : Ban} tone={unblock ? "success" : "danger"} title={unblock ? "Unblock Participant" : "Block Participant"}
            footer={<>
                <Button variant="outline" disabled={block.isPending} onClick={onClose}>Cancel</Button>
                <Button disabled={block.isPending || (!unblock && !reason)} onClick={run}>
                    {block.isPending ? <Loader2 className="size-3.5 animate-spin" /> : unblock ? <UserCheck className="size-3.5" /> : <Ban className="size-3.5" />}
                    {unblock ? "Unblock Participant" : "Block Participant"}
                </Button>
            </>}>
            <PersonCard wish={wish} right={access ? <StatusPill tone={access.tone}>{access.label}</StatusPill> : undefined} />
            {unblock ? (
                <>
                    {wish.author_block?.reason && (
                        <DetailSection title="Why they were blocked">
                            <DetailRow label="Reason">{REASON_LABEL[wish.author_block.reason]}</DetailRow>
                            {wish.author_block.note && <DetailRow label="Note">{wish.author_block.note}</DetailRow>}
                        </DetailSection>
                    )}
                    <p className="text-[12.5px] text-muted-foreground">{wish.guest_name} will be able to post wishes and interact in this event again.</p>
                </>
            ) : (
                <>
                    <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/[0.06] p-3 text-[12.5px]">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                        <span>This participant will no longer be able to post wishes or interact in this event.</span>
                    </div>
                    <FormField label="Reason for Block" required>
                        <Select value={reason} onValueChange={(v) => setReason(v as BlockReason)}>
                            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Select a reason" /></SelectTrigger>
                            <SelectContent>{(Object.keys(REASON_LABEL) as BlockReason[]).map((r) => <SelectItem key={r} value={r}>{REASON_LABEL[r]}</SelectItem>)}</SelectContent>
                        </Select>
                    </FormField>
                    <FormField label="Note" hint=" (Optional)">
                        <Textarea value={note} maxLength={BLOCK_NOTE_MAX} rows={4} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for your records..." />
                        <p className="text-right text-[11.5px] text-muted-foreground">{Array.from(note).length} / {BLOCK_NOTE_MAX}</p>
                    </FormField>
                </>
            )}
        </ActionSheet>
    );
}

/* ── Delete ──────────────────────────────────────────────────────────────── */

function DeleteWish({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const remove = useDeleteWish(eventId);
    // A centred confirm pop-up, the same as Delete in Family / Agenda / Media (Jamal, 2026-11-09).
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete Wish?</DialogTitle>
                    <DialogDescription>
                        The wish from {wish.guest_name} will be deleted for everyone, with its likes and comments. This can&apos;t be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" disabled={remove.isPending} onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(wish.id, { onSuccess: onClose })}>
                        {remove.isPending && <Loader2 className="size-3.5 animate-spin" />} Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ── Post a Wish (organizer) ─────────────────────────────────────────────── */

function PostWish({ eventId, eventName, onClose }: { eventId: number; eventName: string; onClose: () => void }) {
    const create = useCreateWish(eventId);
    const update = useUpdateWish(eventId);
    const [name, setName] = useState("");
    const [audience, setAudience] = useState<WishAudience>("both");
    const [message, setMessage] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [publish, setPublish] = useState(true);
    const imageRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLInputElement>(null);
    const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    const busy = create.isPending || update.isPending;

    const pick = (f: File | undefined, video: boolean) => {
        if (!f) return;
        if (video ? f.size > 25 * 1024 * 1024 : f.size > 2 * 1024 * 1024) { toast.error(video ? "The video must be 25 MB or smaller." : "The image must be 2 MB or smaller."); return; }
        setFile(f);
    };
    const submit = async () => {
        if (!message.trim()) { toast.error("Please write a message."); return; }
        try {
            const res = await create.mutateAsync({ message: message.trim(), audience, guestName: name.trim() || undefined, file });
            // "Publish Immediately" off = posted hidden, to show later from the list.
            if (!publish && res?.wish?.id) await update.mutateAsync({ id: res.wish.id, data: { show_in_app: false } });
            onClose();
        } catch { /* the hooks showed the error */ }
    };
    const box = "flex flex-col items-center gap-0.5 rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] px-3 py-3 text-center transition hover:bg-primary/5";

    return (
        <FormPanel sheet={{ open: true, onClose }} icon={Heart} title="Post a Wish" subtitle="Publish a greeting as the event organizer."
            footer={<>
                <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
                <Button disabled={busy} onClick={submit}>{busy && <Loader2 className="size-3.5 animate-spin" />} {publish ? "Publish Wish" : "Save Hidden"}</Button>
            </>}>
            <p className="text-[13.5px] font-bold text-primary">Organizer Wish</p>
            <FormField label="Post As">
                <Input value={name} maxLength={100} placeholder={`Organizer — ${eventName}`} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="Wish Recipient" required>
                <Select value={audience} onValueChange={(v) => setAudience(v as WishAudience)}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(AUDIENCE_LONG) as WishAudience[]).map((a) => <SelectItem key={a} value={a}>{AUDIENCE_LONG[a]}</SelectItem>)}</SelectContent>
                </Select>
            </FormField>
            <FormField label="Message" required>
                <Textarea value={message} maxLength={MAX_MESSAGE} rows={4} onChange={(e) => setMessage(e.target.value)} placeholder="Thank you to our family and friends for being part of this special day!" />
                <CharCount value={message} max={MAX_MESSAGE} />
            </FormField>
            <p className="text-[13.5px] font-bold text-primary">Attach Media (Optional)</p>
            <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0], false); e.target.value = ""; }} />
            <input ref={videoRef} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => { pick(e.target.files?.[0], true); e.target.value = ""; }} />
            {file && preview ? (
                <div className="relative">
                    {file.type.startsWith("video/")
                        ? <video src={preview} controls className="aspect-video w-full rounded-xl bg-black" />
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={preview} alt="" className="max-h-[240px] w-full rounded-xl object-contain" />}
                    <Button size="icon" variant="secondary" className="absolute top-2 right-2 size-7" aria-label="Remove" onClick={() => setFile(null)}><X className="size-3.5" /></Button>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={box} onClick={() => imageRef.current?.click()}>
                        <ImagePlus className="size-5 text-primary" /><span className="text-[13px] font-semibold">Upload Image</span><span className="text-[11px] text-muted-foreground">JPG, PNG (Max 2MB)</span>
                    </button>
                    <button type="button" className={box} onClick={() => videoRef.current?.click()}>
                        <Video className="size-5 text-primary" /><span className="text-[13px] font-semibold">Upload Video</span><span className="text-[11px] text-muted-foreground">MP4 (Max 25MB)</span>
                    </button>
                </div>
            )}
            <Notice tone="info">Only organizers can upload video wishes. Participants may post text or images.</Notice>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <span className="text-[13px]">Publish Immediately</span>
                <Switch checked={publish} onCheckedChange={setPublish} aria-label="Publish immediately" />
            </div>
        </FormPanel>
    );
}

/* ── Blocked Words & Auto Filter ─────────────────────────────────────────── */

function BlockedWords({ eventId, onClose }: { eventId: number; onClose: () => void }) {
    const query = useWishFilter(eventId);
    const save = useSaveWishFilter(eventId);
    const [draft, setDraft] = useState<WishFilter | null>(null);
    const [word, setWord] = useState("");
    const [replace, setReplace] = useState("****");
    const [action, setAction] = useState<WordAction>("replace");
    const f = draft ?? query.data ?? { enabled: false, words: [], auto_hide: true, notify: true };
    const setF = (patch: Partial<WishFilter>) => setDraft({ ...f, ...patch });
    const add = () => {
        const w = word.trim();
        if (!w) { toast.error("Please enter a word or phrase."); return; }
        if (f.words.some((x) => x.word.toLowerCase() === w.toLowerCase())) { toast.error("That word is already in the list."); return; }
        setF({ words: [...f.words, { word: w, replace: replace.trim() || "****", action }] });
        setWord("");
    };
    return (
        <ActionSheet open onClose={onClose} icon={Filter} title="Blocked Words & Auto Filter" subtitle="Automatically detect and replace unwanted content."
            footer={<>
                <Button variant="outline" disabled={save.isPending} onClick={onClose}>Cancel</Button>
                <Button disabled={save.isPending || !draft} onClick={() => draft && save.mutate(draft, { onSuccess: onClose })}>{save.isPending && <Loader2 className="size-3.5 animate-spin" />} Save Rules</Button>
            </>}>
            <p className="text-[13.5px] font-bold text-primary">Automated Moderation</p>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <span className="text-[13px]">Enable Blocked Words Filter</span>
                <Switch checked={f.enabled} disabled={query.isLoading} onCheckedChange={(v) => setF({ enabled: v })} aria-label="Enable blocked words filter" />
            </div>
            <FormField label="Word or Phrase" required>
                <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Enter an unwanted phrase"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
            </FormField>
            <div className="grid grid-cols-2 gap-2">
                <FormField label="Action When Detected" required>
                    <Select value={action} onValueChange={(v) => setAction(v as WordAction)}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="replace">Replace only</SelectItem>
                            <SelectItem value="hold">Hold for Review</SelectItem>
                            <SelectItem value="hide">Hide</SelectItem>
                        </SelectContent>
                    </Select>
                </FormField>
                <FormField label="Replace With" required>
                    <Input value={replace} maxLength={40} onChange={(e) => setReplace(e.target.value)} placeholder="****" />
                </FormField>
            </div>
            <Button onClick={add}><Plus className="size-3.5" /> Add Word</Button>
            <p className="text-[13.5px] font-bold text-primary">Blocked Words ({f.words.length})</p>
            <div className="rounded-xl border border-border bg-card">
                {f.words.length === 0 ? <p className="px-3 py-4 text-center text-[12.5px] text-muted-foreground">No blocked words yet.</p> : (
                    <ul className="divide-y divide-border">
                        {f.words.map((w) => (
                            <li key={w.word} className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
                                <span className="min-w-0 flex-1 truncate">{w.word}</span>
                                <span className="text-[11px] text-muted-foreground">→ {w.replace}</span>
                                <StatusPill tone={w.action ? ACTION_META[w.action].tone : "warning"}>{w.action ? ACTION_META[w.action].label : (f.auto_hide ? "Hold for Review" : "Flag")}</StatusPill>
                                <button type="button" aria-label={`Remove ${w.word}`} className="text-muted-foreground hover:text-destructive"
                                    onClick={() => setF({ words: f.words.filter((x) => x.word !== w.word) })}><X className="size-4" /></button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <Notice tone="info">Filtering applies to new wishes and comments. “Hold for Review” shows a wish as Pending until you approve or hide it; “Hide” hides it straight away.</Notice>
        </ActionSheet>
    );
}

/* ── Wishes Settings page ────────────────────────────────────────────────── */

function ToggleRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <span className="min-w-0">
                <span className="block text-[13px]">{label}</span>
                {hint && <span className="block text-[11.5px] text-muted-foreground">{hint}</span>}
            </span>
            <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
        </div>
    );
}

/**
 * Jamal's Wishes Settings mockup (2026-11-10): Wish Visibility & Publishing · Moderation & Privacy, plus a
 * Participant Display card (what other participants see about the writer). Switches that are not in the
 * mockup (Allow New Wishes, Wish Details Screen, Show Wish Photo / Video, Allow Comments, Hold Flagged
 * Wishes, Notify of Flagged Wishes) are no longer shown — their saved values are kept as they are.
 */
function WishesSettingsPage({ event, settings, onDone }: { event: ClientEvent; settings: WishSettings; onDone: () => void }) {
    const eventId = event.id;
    const saveSettings = useSaveWishSettings(eventId);
    const filterQuery = useWishFilter(eventId);
    const saveFilter = useSaveWishFilter(eventId);
    const options = useEventOptions();
    const menuIds = useMemo(() => event.menu_ids ?? [], [event.menu_ids]);
    const setMenu = useSetMenuShown(eventId, menuIds);
    // "Enable Wed Wishes Menu" = the Wishes menu in the event's menu_ids (a Default menu is always on).
    const wishMenu = options.data?.menus.find((m) => m.slug === "wishes") ?? null;
    const menuDefault = !!wishMenu && !!Number(wishMenu.is_default);
    const menuSaved = !!wishMenu && (menuDefault || menuIds.includes(wishMenu.id));
    const [menuOn, setMenuOn] = useState<boolean | null>(null);
    const menuShown = menuOn ?? menuSaved;
    // Older backends do not send the 2026-11-10 keys: start them as the server would.
    const [s, setS] = useState<WishSettings>({
        allow_text: true, allow_video: settings.allow_photo, relationship: true, side: true, audience: true,
        notify_new: false, hide_blocked: false, ...settings,
    });
    const [filter, setFilter] = useState<WishFilter | null>(null);
    const f = filter ?? filterQuery.data ?? { enabled: false, words: [], auto_hide: true, notify: true };
    const set = (k: keyof WishSettings) => (v: boolean) => setS((p) => ({ ...p, [k]: v }));
    const on = (k: keyof WishSettings) => s[k] !== false;
    const busy = saveSettings.isPending || saveFilter.isPending || setMenu.isPending;
    const save = async () => {
        try {
            await saveSettings.mutateAsync(s);
            if (filter) await saveFilter.mutateAsync(filter);
            if (wishMenu && !menuDefault && menuOn !== null && menuOn !== menuSaved) await setMenu.mutateAsync({ menuId: wishMenu.id, show: menuOn });
            onDone();
        } catch { /* the hooks showed the error */ }
    };
    const card = "flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4";
    const heading = "text-[15px] font-bold";
    return (
        <>
            <div className="grid gap-4 lg:grid-cols-2">
                <div className={card}>
                    <p className={heading}>Wish Visibility &amp; Publishing</p>
                    <ToggleRow label="Enable Wed Wishes Menu"
                        hint={!wishMenu ? (options.isLoading ? undefined : "Wed Wishes is not in your plan") : menuDefault ? "Always on — Wed Wishes is a default menu" : "Show Wed Wishes in the event app"}
                        checked={menuShown} disabled={!wishMenu || menuDefault} onChange={setMenuOn} />
                    <ToggleRow label="Allow Text Wishes" checked={on("allow_text")} onChange={set("allow_text")} />
                    <ToggleRow label="Allow Image Wishes" checked={on("allow_photo")} onChange={set("allow_photo")} />
                    <ToggleRow label="Allow Video Wishes" checked={on("allow_video")} onChange={set("allow_video")} />
                    <ToggleRow label="Show Likes" checked={on("show_likes")} onChange={set("show_likes")} />
                </div>
                <div className={card}>
                    <p className={heading}>Moderation &amp; Privacy</p>
                    <ToggleRow label="Filter Blocked Words" checked={f.enabled} disabled={filterQuery.isLoading} onChange={(v) => setFilter({ ...f, enabled: v })} />
                    <ToggleRow label="Notify Organizer of New Wishes" checked={!!s.notify_new} onChange={set("notify_new")} />
                    <ToggleRow label="Hide Wishes for Blocked Participants" checked={!!s.hide_blocked} onChange={set("hide_blocked")} />
                    {!on("allow_video") && (
                        <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-[12px] text-primary">
                            Participant video uploading is disabled. Organizer video posting is permitted.
                        </p>
                    )}
                </div>
                <div className={cn(card, "lg:col-span-2")}>
                    <div>
                        <p className={heading}>Participant Display</p>
                        <p className="text-[12px] text-muted-foreground">What other participants see about the person who wrote a wish.</p>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                        <ToggleRow label="Show Profile Photo" checked={on("profile_photo")} onChange={set("profile_photo")} />
                        <ToggleRow label="Show Name" hint="Off = shown as “Guest”" checked={on("name")} onChange={set("name")} />
                        <ToggleRow label="Show Relationship" checked={on("relationship")} onChange={set("relationship")} />
                        <ToggleRow label="Show Bride / Groom Side" checked={on("side")} onChange={set("side")} />
                        <ToggleRow label="Show Wish To" hint="Bride / Groom / Both" checked={on("audience")} onChange={set("audience")} />
                        <ToggleRow label="Show Time" checked={on("time")} onChange={set("time")} />
                    </div>
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={onDone}>Cancel</Button>
                <Button disabled={busy} onClick={save}>{busy && <Loader2 className="size-3.5 animate-spin" />} Save Wishes Settings</Button>
            </div>
        </>
    );
}

/* ── Menu Settings card (kept: the event's App Menu → Wish Settings) ─────── */

/** ⚙ — what participants may do and see, plus the content filter. */
function WishSettingsDialog({ eventId, settings, onClose, inline }: { eventId: number; settings: WishSettings; onClose: () => void; inline?: boolean }) {
    const saveSettings = useSaveWishSettings(eventId);
    const filterQuery = useWishFilter(eventId);
    const saveFilter = useSaveWishFilter(eventId);
    const [s, setS] = useState<WishSettings>(settings);
    const [filter, setFilter] = useState<WishFilter | null>(null);
    const [word, setWord] = useState("");
    const [replace, setReplace] = useState("");

    const f = filter ?? filterQuery.data ?? { enabled: false, words: [], auto_hide: true, notify: true };
    const setF = (patch: Partial<WishFilter>) => setFilter({ ...f, ...patch });
    const set = (k: keyof WishSettings) => (v: boolean) => setS((p) => ({ ...p, [k]: v }));

    const addWord = () => {
        const w = word.trim();
        if (!w) return;
        if (f.words.some((x) => x.word.toLowerCase() === w.toLowerCase())) return toast.error("That word is already in the list.");
        setF({ words: [...f.words, { word: w, replace: replace.trim() || "***" }] });
        setWord("");
        setReplace("");
    };

    const save = async () => {
        try {
            await saveSettings.mutateAsync(s);
            if (filter) await saveFilter.mutateAsync(filter);
            onClose();
        } catch {
            /* the hooks already showed the error */
        }
    };
    const busy = saveSettings.isPending || saveFilter.isPending;

    return (
        <SettingsShell inline={inline} title="Wish Settings" description="What participants can do and see in Wed Wishes."
            onClose={onClose} busy={busy} className="max-h-[92vh] overflow-y-auto sm:max-w-lg"
            footer={<>
                {!inline && <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>}
                <Button disabled={busy} onClick={save}>{busy && <Loader2 className="size-3.5 animate-spin" />} Save</Button>
            </>}>

                <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Participants</p>
                    <div className="divide-y divide-border">
                        <SwitchRow id="ws-new" label="Allow new wishes" hint="Participants can post" checked={s.allow_new} onChange={set("allow_new")} />
                        <SwitchRow id="ws-photo" label="Allow photo / video" hint="Participants can add an image or a video" checked={s.allow_photo} onChange={set("allow_photo")} />
                        <SwitchRow id="ws-details" label="Wish details screen" hint="Participants can open a post in full" checked={s.details_screen} onChange={set("details_screen")} />
                    </div>
                </div>
                <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Show to participants</p>
                    <div className="divide-y divide-border">
                        <SwitchRow id="ws-name" label="Name" hint="Always shown" checked disabled onChange={() => undefined} />
                        <SwitchRow id="ws-avatar" label="Profile photo" checked={s.profile_photo} onChange={set("profile_photo")} />
                        <SwitchRow id="ws-media" label="Wish photo / video" checked={s.wish_photo} onChange={set("wish_photo")} />
                        <SwitchRow id="ws-time" label="Time" checked={s.time} onChange={set("time")} />
                    </div>
                </div>

                <div className="rounded-lg border border-border p-3">
                    <SwitchRow id="wf-on" label="Content Filter" hint="Replace blocked words in new wishes" checked={f.enabled}
                        disabled={filterQuery.isLoading} onChange={(v) => setF({ enabled: v })} />
                    {f.enabled && (
                        <div className="mt-1 flex flex-col gap-2">
                            <div className="flex gap-2">
                                <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Blocked word or phrase" className="h-8 text-[12.5px]"
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWord(); } }} />
                                <Input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replace with (***)" className="h-8 w-[130px] text-[12.5px]" />
                                <Button size="sm" variant="outline" className="h-8" onClick={addWord}><Plus className="size-3.5" /></Button>
                            </div>
                            {f.words.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {f.words.map((w) => (
                                        <span key={w.word} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11.5px]">
                                            {w.word} → {w.replace}
                                            <button type="button" aria-label={`Remove ${w.word}`} onClick={() => setF({ words: f.words.filter((x) => x.word !== w.word) })}>
                                                <X className="size-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <SwitchRow id="wf-hide" label="Auto-hide flagged wishes" hint="Hidden until you review them" checked={f.auto_hide} onChange={(v) => setF({ auto_hide: v })} />
                            <SwitchRow id="wf-notify" label="Notify me" hint="When a wish is flagged" checked={f.notify} onChange={(v) => setF({ notify: v })} />
                        </div>
                    )}
                </div>

        </SettingsShell>
    );
}

/** Wish Settings as a card — the event's Menu Settings page. */
export function WishSettingsCard({ eventId }: { eventId: number }) {
    const query = useEventWishes(eventId);
    if (query.isLoading) return <Section title="Wish Settings"><PanelLoading /></Section>;
    if (!query.data) return <Section title="Wish Settings"><Empty title="Could not load the wish settings" /></Section>;
    return <WishSettingsDialog inline eventId={eventId} settings={query.data.settings} onClose={() => undefined} />;
}
