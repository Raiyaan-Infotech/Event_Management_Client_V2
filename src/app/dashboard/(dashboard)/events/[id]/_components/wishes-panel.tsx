"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ArrowLeft, Ban, Check, CheckCircle2, Clock, Eye, EyeOff, Filter, Flag, Heart, ImagePlus, Loader2, Mail, MessageSquare, Pencil, Plus,
    Send, Settings, ShieldAlert, ShieldCheck, Trash2, Upload, Video, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    ActionSheet, CharCount, CountTabs, DetailRow, DetailSection, FormField, FormPanel, ListCard, ModuleHeader, Notice, OverviewCard,
    Pager, PersonAvatar, PersonSummary, RowActions, SearchBox, SortSelect, StatTile, StatusPill, Toolbar, type RowAction,
} from "@/components/module-kit";
import type { Tone } from "@/components/module-kit/tones";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import type { ClientEvent } from "@/hooks/use-client-events";
import {
    useBlockWishWriter, useCreateWish, useDeleteWish, useEventWishes, useMessageWishWriter, useReplaceWishMedia, useSaveWishFilter,
    useSaveWishSettings, useUpdateWish, useWishCommentActions, useWishComments, useWishFilter, useWishReports,
    type BlockReason, type Wish, type WishAudience, type WishComment, type WishFilter, type WishSettings, type WordAction,
} from "@/hooks/use-event-engagement";
import { Empty, PanelLoading, Section, SettingsShell, SwitchRow } from "./module-ui";

/**
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

const AUDIENCE: Record<WishAudience, string> = { both: "Both", bride: "Bride", groom: "Groom" };
const AUDIENCE_LONG: Record<WishAudience, string> = { both: "Both (Bride & Groom)", bride: "Bride", groom: "Groom" };
const TYPE_LABEL = { text: "Text", image: "Image", video: "Video" } as const;
const MAX_MESSAGE = 500;
const PAGE_SIZE = 10;

type Tab = "all" | "published" | "pending" | "hidden" | "blocked" | "reported";
const REASON_LABEL: Record<BlockReason, string> = {
    inappropriate: "Inappropriate or offensive content", spam: "Spam / repeated posts", harassment: "Harassment of other participants", other: "Other",
};
const ACTION_META: Record<WordAction, { label: string; tone: Tone }> = {
    replace: { label: "Replace", tone: "success" }, hold: { label: "Hold for Review", tone: "warning" }, hide: { label: "Hide", tone: "danger" },
};
const reported = (w: Wish) => (w.report_count ?? 0) > 0;
type Status = { label: string; tone: Tone };
const statusOf = (w: Wish): Status =>
    w.status === "blocked" ? { label: "Blocked", tone: "danger" }
        : w.is_flagged ? { label: "Pending", tone: "warning" }
            : w.status === "hidden" ? { label: "Hidden", tone: "violet" }
                : { label: "Published", tone: "success" };
const tabOf = (w: Wish): Tab => (w.status === "blocked" ? "blocked" : w.is_flagged ? "pending" : w.status === "hidden" ? "hidden" : "published");
const fromParticipant = (w: Wish) => !w.added_by_organizer && w.participant_id !== null;
const whoOf = (w: Wish) => (w.added_by_organizer ? "Organizer" : "Participant");
const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—");
const dateTimeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

/** Start of a Date filter choice, in ms ("all" = 0). */
function startOf(v: "all" | "today" | "7" | "30") {
    if (v === "all") return 0;
    const now = new Date();
    return v === "today" ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() : now.getTime() - Number(v) * 86400000;
}

type Panel =
    | { kind: "view" | "edit" | "moderate" | "message" | "block" | "delete" | "comments"; wish: Wish }
    | { kind: "words" };

export function WishesPanel({ event }: { event: ClientEvent }) {
    const query = useEventWishes(event.id);
    const update = useUpdateWish(event.id);
    const [tab, setTab] = useState<Tab>("all");
    const [search, setSearch] = useState("");
    const [type, setType] = useState<"all" | Wish["post_type"]>("all");
    const [recipient, setRecipient] = useState<"all" | WishAudience>("all");
    const [when, setWhen] = useState<"all" | "today" | "7" | "30">("all");
    // The Date filter's start, worked out when it is picked (not during render).
    const [since, setSince] = useState(0);
    const pickWhen = (v: typeof when) => {
        setWhen(v);
        setSince(startOf(v));
        setPage(1);
    };
    const [page, setPage] = useState(1);
    const [panel, setPanel] = useState<Panel | null>(null);
    const [settingsPage, setSettingsPage] = useState(false);
    const [posting, setPosting] = useState(false);

    const wishes = useMemo(() => query.data?.wishes ?? [], [query.data]);
    // The open panel always shows the latest copy of its wish (the list refetches after a change).
    const live = (w: Wish) => wishes.find((x) => x.id === w.id) ?? w;

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return wishes.filter((w) =>
            (type === "all" || w.post_type === type)
            && (recipient === "all" || w.audience === recipient)
            && (!since || (w.created_at && new Date(w.created_at).getTime() >= since))
            && (!q || w.guest_name.toLowerCase().includes(q) || w.message.toLowerCase().includes(q)));
    }, [wishes, search, type, recipient, since]);
    const counts = useMemo(() => {
        const c: Record<Tab, number> = { all: filtered.length, published: 0, pending: 0, hidden: 0, blocked: 0, reported: 0 };
        filtered.forEach((w) => { c[tabOf(w)] += 1; if (reported(w)) c.reported += 1; });
        return c;
    }, [filtered]);
    const shown = tab === "all" ? filtered : tab === "reported" ? filtered.filter(reported) : filtered.filter((w) => tabOf(w) === tab);
    const rows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
    const actionsFor = (w: Wish): RowAction[] => [
        { label: "View Wish", icon: Eye, onClick: () => open({ kind: "view", wish: w }) },
        { label: "Edit Wish", icon: Pencil, onClick: () => open({ kind: "edit", wish: w }), hidden: !w.can_edit },
        { label: "Approve / Publish", icon: Check, onClick: () => open({ kind: "moderate", wish: w }), hidden: !data.can_manage || (tabOf(w) === "published" && !reported(w)) },
        w.is_hidden
            ? { label: "Show Wish", icon: Eye, onClick: () => update.mutate({ id: w.id, data: { show_in_app: true }, done: "Wish is visible again" }), hidden: !data.can_manage || w.status === "blocked" }
            : { label: "Hide Wish", icon: EyeOff, onClick: () => update.mutate({ id: w.id, data: { show_in_app: false }, done: "Wish hidden" }), hidden: !data.can_manage },
        { label: "Send In-App Message", icon: Mail, onClick: () => open({ kind: "message", wish: w }), hidden: !data.can_manage || !fromParticipant(w) },
        { label: w.author_blocked ? "Unblock Participant" : "Block Participant", icon: Ban, onClick: () => open({ kind: "block", wish: w }), hidden: !data.can_manage || !fromParticipant(w) },
        { label: `Manage Comments${w.comment_count ? ` (${w.comment_count})` : ""}`, icon: MessageSquare, onClick: () => open({ kind: "comments", wish: w }), hidden: !data.can_manage },
        { label: "Delete Wish", icon: Trash2, onClick: () => open({ kind: "delete", wish: w }), danger: true, divider: true, hidden: !w.can_delete },
    ];

    const header = (
        <ModuleHeader
            title={settingsPage ? "Wishes Settings" : "Wed Wishes Monitor"}
            subtitle={settingsPage ? "What participants can do in Wed Wishes, and how wishes are moderated." : "Monitor, organize, and moderate wedding wishes from event participants."}
            actions={data.can_manage && (
                <>
                    {settingsPage
                        ? <Button variant="outline" size="sm" onClick={() => setSettingsPage(false)}><ArrowLeft className="size-3.5" /> Back to Wishes</Button>
                        : <Button variant="outline" size="sm" className="border-primary/40 text-primary hover:bg-primary/5 hover:text-primary" onClick={() => { close(); setSettingsPage(true); }}><Settings className="size-3.5" /> Wishes Settings</Button>}
                    <Button size="sm" onClick={() => { setSettingsPage(false); close(); setPosting(true); }}><Plus className="size-3.5" /> Post Wish</Button>
                </>
            )}
        />
    );
    const tiles = (
        <OverviewCard>
            <StatTile icon={Heart} value={all.total} label="Total Wishes" active={tab === "all"} onClick={() => { setSettingsPage(false); setTab("all"); setPage(1); }} />
            <StatTile icon={CheckCircle2} value={all.published} label="Published" tone="success" active={tab === "published"} onClick={() => { setSettingsPage(false); setTab("published"); setPage(1); }} />
            <StatTile icon={Clock} value={all.pending} label="Pending Review" tone="warning" active={tab === "pending"} onClick={() => { setSettingsPage(false); setTab("pending"); setPage(1); }} />
            <StatTile icon={EyeOff} value={all.hidden} label="Hidden Wishes" tone="danger" active={tab === "hidden"} onClick={() => { setSettingsPage(false); setTab("hidden"); setPage(1); }} />
            <StatTile icon={Heart} value={all.likes} label="Total Likes" tone="violet" />
        </OverviewCard>
    );

    if (settingsPage) {
        return (
            <div className="flex flex-col gap-4">
                {header}
                {tiles}
                <WishesSettingsPage eventId={event.id} settings={data.settings} onDone={() => setSettingsPage(false)} onWords={() => { setSettingsPage(false); open({ kind: "words" }); }} />
            </div>
        );
    }

    const list = (
        <>
            <Toolbar>
                <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by participant or message..." />
                <SortSelect className="w-[150px]" value={type} onChange={(v) => { setType(v); setPage(1); }}
                    options={[{ value: "all", label: "Wish Type: All" }, { value: "text", label: "Text" }, { value: "image", label: "Image" }, { value: "video", label: "Video" }]} />
                <SortSelect className="w-[150px]" value={recipient} onChange={(v) => { setRecipient(v); setPage(1); }}
                    options={[{ value: "all", label: "Recipient: All" }, { value: "both", label: "To Both" }, { value: "bride", label: "To Bride" }, { value: "groom", label: "To Groom" }]} />
                <SortSelect className="w-[140px]" value={when} onChange={pickWhen}
                    options={[{ value: "all", label: "Date: All" }, { value: "today", label: "Today" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }]} />
            </Toolbar>
            <CountTabs stretch={false} value={tab} onChange={(v) => { setTab(v); setPage(1); }} tabs={[
                { value: "all", label: "All Wishes", count: counts.all },
                { value: "published", label: "Published", count: counts.published },
                { value: "pending", label: "Pending", count: counts.pending },
                { value: "hidden", label: "Hidden", count: counts.hidden },
                { value: "blocked", label: "Blocked", count: counts.blocked },
                { value: "reported", label: "Reported", count: counts.reported },
            ]} />
            <ListCard title="Wishes List" icon={Heart} note="Participants can post text and images; the organizer can also post videos.">
                {wishes.length === 0 ? (
                    <Empty title="No wishes yet">Wishes your guests post in the event app appear here. You can also post a wish as the organizer.</Empty>
                ) : rows.length === 0 ? (
                    <Empty title="No wishes match" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-[12.5px]">
                            <thead>
                                <tr className="border-b border-border text-left text-[11.5px] text-muted-foreground">
                                    <th className="px-3 py-2 font-semibold">Participant</th>
                                    <th className="px-3 py-2 font-semibold">Wish / Message</th>
                                    <th className="px-3 py-2 font-semibold">Type</th>
                                    <th className="px-3 py-2 font-semibold">Status</th>
                                    <th className="px-3 py-2 font-semibold">Likes</th>
                                    <th className="px-3 py-2 font-semibold">Posted On</th>
                                    <th className="px-3 py-2 text-right font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {rows.map((w) => {
                                    const st = statusOf(w);
                                    const picked = panel && "wish" in panel && panel.wish.id === w.id;
                                    return (
                                        <tr key={w.id} className={cn("align-middle transition", picked ? "bg-primary/5" : "hover:bg-muted/40")}>
                                            <td className="px-3 py-2.5">
                                                <button type="button" onClick={() => open({ kind: "view", wish: w })} className="flex min-w-[140px] items-center gap-2 text-left">
                                                    <PersonAvatar name={w.guest_name} photo={w.avatar} size={34} rounded="full" />
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-semibold" title={w.guest_name}>{w.guest_name}</span>
                                                        <span className="block text-[11px] text-muted-foreground">{whoOf(w)}</span>
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="max-w-[280px] px-3 py-2.5">
                                                <p className="line-clamp-2 break-words">{w.message || <span className="text-muted-foreground">({TYPE_LABEL[w.post_type]} only)</span>}</p>
                                                <p className="text-[11px] text-muted-foreground">To: {AUDIENCE[w.audience]}</p>
                                            </td>
                                            <td className="px-3 py-2.5"><StatusPill tone="primary">{TYPE_LABEL[w.post_type]}</StatusPill></td>
                                            <td className="px-3 py-2.5">
                                                <span className="flex flex-wrap gap-1">
                                                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                                                    {reported(w) && <StatusPill tone="danger" icon={Flag}>Reported ({w.report_count})</StatusPill>}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap"><Heart className="mr-1 inline size-3 fill-current text-primary" />{w.like_count}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">{dateOf(w.created_at)}</td>
                                            <td className="px-3 py-2.5 text-right"><RowActions items={actionsFor(w)} compact /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {shown.length > 0 && <div className="border-t border-border px-3 py-2.5"><Pager page={page} pageSize={PAGE_SIZE} total={shown.length} onPage={setPage} noun="wishes" /></div>}
            </ListCard>
        </>
    );

    return (
        <div className="flex flex-col gap-4">
            {header}
            {tiles}
            <div className="flex min-w-0 flex-col gap-3">{list}</div>
            {/* Every action panel slides in from the right ("canvas"), uniform with Guests / Family (Jamal, 2026-11-09). */}
            {panel && (
                <>
                    {panel.kind === "view" && <ViewWish eventId={event.id} wish={live(panel.wish)} onClose={close} onEdit={() => open({ kind: "edit", wish: panel.wish })} onComments={() => open({ kind: "comments", wish: panel.wish })} />}
                    {panel.kind === "comments" && <ManageComments key={panel.wish.id} eventId={event.id} wish={live(panel.wish)} settings={data.settings} onClose={close} />}
                    {panel.kind === "edit" && <EditWish key={panel.wish.id} eventId={event.id} wish={live(panel.wish)} onClose={close} />}
                    {panel.kind === "moderate" && <ModerateWish key={panel.wish.id} eventId={event.id} wish={live(panel.wish)} onClose={close} />}
                    {panel.kind === "message" && <MessageWish key={panel.wish.id} eventId={event.id} wish={live(panel.wish)} onClose={close} />}
                    {panel.kind === "block" && <BlockWriter key={panel.wish.id} eventId={event.id} wish={live(panel.wish)} onClose={close} />}
                    {panel.kind === "delete" && <DeleteWish eventId={event.id} wish={live(panel.wish)} onClose={close} />}
                    {panel.kind === "words" && <BlockedWords eventId={event.id} onClose={close} />}
                </>
            )}
            {posting && <PostWish eventId={event.id} eventName={event.name} onClose={() => setPosting(false)} />}
        </div>
    );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function WishMedia({ wish }: { wish: Wish }) {
    if (wish.post_type === "video" && wish.video_url) {
        return <video src={mediaUrl(wish.video_url)} poster={mediaUrl(wish.thumbnail_url) ?? undefined} controls preload="none" className="aspect-video w-full rounded-xl bg-black object-contain" />;
    }
    const src = wish.photo ?? wish.thumbnail_url;
    // eslint-disable-next-line @next/next/no-img-element
    if (wish.post_type === "image" && src) return <img src={mediaUrl(src)} alt="" className="max-h-[320px] w-full rounded-xl object-contain" />;
    return null;
}

/** The pink card with the message — what a text wish looks like. */
function MessageCard({ text }: { text: string }) {
    return (
        <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/15 px-5 py-6 text-center font-serif text-[16px] leading-relaxed whitespace-pre-line break-words text-primary/90">
            {text}
        </div>
    );
}

function Who({ wish }: { wish: Wish }) {
    const st = statusOf(wish);
    return (
        <PersonSummary name={wish.guest_name} photo={wish.avatar}
            pills={<><StatusPill tone="primary">{whoOf(wish)}</StatusPill><StatusPill tone={st.tone}>{st.label}</StatusPill></>} />
    );
}

/* ── View ────────────────────────────────────────────────────────────────── */

function ViewWish({ eventId, wish, onClose, onEdit, onComments }: { eventId: number; wish: Wish; onClose: () => void; onEdit: () => void; onComments: () => void }) {
    const comments = useWishComments(eventId, wish.id);
    const reports = useWishReports(eventId, wish.id, reported(wish));
    const update = useUpdateWish(eventId);
    const latest = (comments.data ?? []).filter((c) => !c.is_hidden).slice(-3).reverse();
    return (
        <ActionSheet open onClose={onClose} icon={Eye} title="View Wish" subtitle="Review the wish, media and reactions."
            footer={<>
                <Button variant="outline" onClick={onClose}>Close</Button>
                {wish.can_edit ? <Button onClick={onEdit}><Pencil className="size-3.5" /> Edit Wish</Button> : <span />}
            </>}>
            <Who wish={wish} />
            {wish.post_type === "text" ? <MessageCard text={wish.message} /> : <><WishMedia wish={wish} />{wish.message && <p className="whitespace-pre-line break-words text-[13px]">{wish.message}</p>}</>}
            <p className="text-[13.5px] font-bold text-primary">Wish Details</p>
            <DetailSection>
                <DetailRow label="Wish Type">{TYPE_LABEL[wish.post_type]}</DetailRow>
                <DetailRow label="Wishes To">{AUDIENCE_LONG[wish.audience]}</DetailRow>
                <DetailRow label="Status">{statusOf(wish).label}</DetailRow>
                <DetailRow label="Likes">{String(wish.like_count)}</DetailRow>
                {wish.mobile && <DetailRow label="Mobile">{wish.mobile}</DetailRow>}
                <DetailRow label="Posted On">{dateTimeOf(wish.created_at)}</DetailRow>
            </DetailSection>
            {wish.is_flagged && <Notice tone="warning">A blocked word was found in this wish. Approve it to publish, or hide it.</Notice>}
            {reported(wish) && (
                <>
                    <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-destructive"><Flag className="size-4" /> Reports ({wish.report_count})</p>
                    <div className="divide-y divide-border rounded-xl border border-destructive/30 bg-destructive/5">
                        {(reports.data ?? []).map((r) => (
                            <div key={r.id} className="px-3 py-2 text-[12.5px]">
                                <p className="font-semibold">{r.reporter_name} <span className="font-normal text-muted-foreground">· {REASON_LABEL[r.reason] ?? r.reason}</span></p>
                                {r.note && <p className="text-muted-foreground">{r.note}</p>}
                            </div>
                        ))}
                    </div>
                    <Button variant="outline" size="sm" disabled={update.isPending}
                        onClick={() => update.mutate({ id: wish.id, data: { dismiss_reports: true }, done: "Reports dismissed" })}>
                        <Check className="size-3.5" /> Dismiss Reports
                    </Button>
                </>
            )}
            <div className="flex items-center justify-between">
                <p className="text-[13.5px] font-bold text-primary">Latest Comments</p>
                <button type="button" onClick={onComments} className="text-[12px] font-semibold text-primary hover:underline">Manage ({wish.comment_count ?? 0})</button>
            </div>
            {latest.length === 0
                ? <p className="text-[12.5px] text-muted-foreground">No comments yet.</p>
                : <div className="divide-y divide-border">{latest.map((c) => (
                    <div key={c.id} className="py-2 text-[12.5px]"><p className="font-semibold">{c.guest_name}</p><p className="break-words">{c.message}</p></div>
                ))}</div>}
        </ActionSheet>
    );
}

/* ── Edit (organizer's own post) ─────────────────────────────────────────── */

function EditWish({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const update = useUpdateWish(eventId);
    const replace = useReplaceWishMedia(eventId);
    const [audience, setAudience] = useState<WishAudience>(wish.audience);
    const [message, setMessage] = useState(wish.message);
    const [file, setFile] = useState<File | null>(null);
    const [removeMedia, setRemoveMedia] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    const busy = update.isPending || replace.isPending;
    const hasMedia = wish.post_type !== "text" && !removeMedia;

    const save = async () => {
        if (!message.trim() && !file && !hasMedia) { toast.error("Please write a message or keep a photo / video."); return; }
        try {
            await update.mutateAsync({ id: wish.id, data: { message: message.trim(), audience, ...(removeMedia && !file ? { post_type: "text" } : {}) } });
            if (file) await replace.mutateAsync({ id: wish.id, file });
            toast.success("Wish updated");
            onClose();
        } catch { /* the hooks showed the error */ }
    };

    return (
        <ActionSheet open onClose={onClose} icon={Pencil} title="Edit Wish" subtitle="Modify the message or the attached photo / video."
            footer={<>
                <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
                <Button disabled={busy} onClick={save}>{busy && <Loader2 className="size-3.5 animate-spin" />} Update Wish</Button>
            </>}>
            <Who wish={wish} />
            <FormField label="Wishes To" required>
                <Select value={audience} onValueChange={(v) => setAudience(v as WishAudience)}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(AUDIENCE_LONG) as WishAudience[]).map((a) => <SelectItem key={a} value={a}>{AUDIENCE_LONG[a]}</SelectItem>)}</SelectContent>
                </Select>
            </FormField>
            <FormField label="Wish Message" required>
                <Textarea value={message} maxLength={MAX_MESSAGE} rows={4} onChange={(e) => setMessage(e.target.value)} />
                <CharCount value={message} max={MAX_MESSAGE} />
            </FormField>
            <FormField label="Attached Media" hint=" (Optional)">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setFile(f); setRemoveMedia(false); } }} />
                {file && preview ? (
                    file.type.startsWith("video/")
                        ? <video src={preview} controls className="aspect-video w-full rounded-xl bg-black" />
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={preview} alt="" className="max-h-[260px] w-full rounded-xl object-contain" />
                ) : hasMedia ? <WishMedia wish={wish} /> : null}
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-3.5" /> {hasMedia || file ? "Replace" : "Add Photo / Video"}</Button>
                    {(hasMedia || file) && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setFile(null); setRemoveMedia(wish.post_type !== "text"); }}><Trash2 className="size-3.5" /> Remove</Button>}
                </div>
            </FormField>
            <Notice tone="info">Participants see the change in the app straight away.</Notice>
        </ActionSheet>
    );
}

/* ── Moderate ────────────────────────────────────────────────────────────── */

type Decision = "approve" | "keep" | "hide" | "reject";
function ModerateWish({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const update = useUpdateWish(eventId);
    const remove = useDeleteWish(eventId);
    const [decision, setDecision] = useState<Decision>("approve");
    const busy = update.isPending || remove.isPending;
    const options: { value: Decision; label: string; hint?: string }[] = [
        { value: "approve", label: "Approve and Publish" },
        { value: "keep", label: "Keep Pending" },
        { value: "hide", label: "Hide This Wish" },
        { value: "reject", label: "Reject Wish", hint: "Deletes it for everyone" },
    ];
    const save = () => {
        if (decision === "keep") { onClose(); return; }
        if (decision === "reject") { remove.mutate(wish.id, { onSuccess: onClose }); return; }
        update.mutate(
            { id: wish.id, data: decision === "approve" ? { show_in_app: true, reviewed: true, dismiss_reports: true } : { show_in_app: false, reviewed: true }, done: decision === "approve" ? "Wish published" : "Wish hidden" },
            { onSuccess: onClose },
        );
    };
    return (
        <ActionSheet open onClose={onClose} icon={ShieldCheck} title="Moderate Wish" subtitle="Approve, hide or reject the selected wish."
            footer={<>
                <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
                <Button disabled={busy} variant={decision === "reject" ? "destructive" : "default"} onClick={save}>{busy && <Loader2 className="size-3.5 animate-spin" />} Update Status</Button>
            </>}>
            <Who wish={wish} />
            <p className="text-[13.5px] font-bold text-primary">Review Wish</p>
            <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[14px] break-words">“{wish.message || `${TYPE_LABEL[wish.post_type]} wish`}”</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{TYPE_LABEL[wish.post_type]} Wish · To: {AUDIENCE[wish.audience]} · {wish.like_count} Likes</p>
            </div>
            {wish.post_type !== "text" && <WishMedia wish={wish} />}
            <p className="text-[13.5px] font-bold text-primary">Moderation Decision <span className="text-destructive">*</span></p>
            <div className="flex flex-col gap-2">
                {options.map((o) => (
                    <label key={o.value} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] transition",
                        decision === o.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                        <input type="radio" name="decision" checked={decision === o.value} onChange={() => setDecision(o.value)} className="size-4 accent-[var(--primary)]" />
                        <span className="flex-1">{o.label}</span>
                        {o.hint && <span className="text-[11px] text-muted-foreground">{o.hint}</span>}
                    </label>
                ))}
            </div>
            <Notice tone="info">Published wishes are visible in the participant app; hidden wishes stay in your records.</Notice>
        </ActionSheet>
    );
}

/* ── Send In-App Message ─────────────────────────────────────────────────── */

const TEMPLATES = [
    "Thank you for your lovely wishes and support. 😊",
    "Thank you for your kind words — they mean a lot to us! 🙏",
    "Please keep your wishes kind and respectful for everyone.",
];
function MessageWish({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const send = useMessageWishWriter(eventId);
    const [message, setMessage] = useState("");
    return (
        <ActionSheet open onClose={onClose} icon={Send} title="Send In-App Message" subtitle="Send a private message to this participant."
            footer={<>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button disabled={send.isPending || !message.trim() || wish.participant_id === null}
                    onClick={() => wish.participant_id !== null && send.mutate({ participantId: wish.participant_id, message: message.trim() }, { onSuccess: onClose })}>
                    <Send className="size-3.5" /> Send Message
                </Button>
            </>}>
            <FormField label="To Participant">
                <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
                    <PersonAvatar name={wish.guest_name} photo={wish.avatar} size={26} rounded="full" />
                    <span className="text-[13px] font-semibold">{wish.guest_name}</span>
                </div>
            </FormField>
            <FormField label="Quick Templates">
                <Select value="" onValueChange={(v) => setMessage(v)}>
                    <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Select a template" /></SelectTrigger>
                    <SelectContent>{TEMPLATES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
            </FormField>
            <FormField label="Message" required>
                <Textarea value={message} maxLength={MAX_MESSAGE} rows={5} onChange={(e) => setMessage(e.target.value)} placeholder="Write your message…" />
                <CharCount value={message} max={MAX_MESSAGE} />
            </FormField>
            <Notice tone="info">This message is sent only to {wish.guest_name}, as an in-app notification.</Notice>
        </ActionSheet>
    );
}

/* ── Block / Unblock ─────────────────────────────────────────────────────── */

function BlockWriter({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const block = useBlockWishWriter(eventId);
    const update = useUpdateWish(eventId);
    const [hideAll, setHideAll] = useState(true);
    const [reason, setReason] = useState<BlockReason>("inappropriate");
    const [note, setNote] = useState("");
    const unblock = wish.author_blocked;
    const busy = block.isPending || update.isPending;
    const run = async () => {
        try {
            await block.mutateAsync({ id: wish.id, blocked: !unblock, ...(unblock ? {} : { reason, note: note.trim() }) });
            if (!unblock && hideAll) await update.mutateAsync({ id: wish.id, data: { show_in_app: false, all_from_writer: true } });
            onClose();
        } catch { /* the hooks showed the error */ }
    };
    return (
        <ActionSheet open onClose={onClose} icon={Ban} tone="danger" title={unblock ? "Unblock Participant" : "Block Participant"}
            subtitle={unblock ? "Let this participant use Wed Wishes again." : "Restrict access to the Wed Wishes menu only."}
            footer={<>
                <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
                <Button variant={unblock ? "default" : "destructive"} disabled={busy} onClick={run}>
                    {busy && <Loader2 className="size-3.5 animate-spin" />} {unblock ? "Unblock Participant" : "Block Participant"}
                </Button>
            </>}>
            <Who wish={wish} />
            {unblock ? (
                <>
                    {wish.author_block?.reason && (
                        <DetailSection title="Why they were blocked">
                            <DetailRow label="Reason">{REASON_LABEL[wish.author_block.reason]}</DetailRow>
                            {wish.author_block.note && <DetailRow label="Internal Note">{wish.author_block.note}</DetailRow>}
                        </DetailSection>
                    )}
                    <Notice tone="info">{wish.guest_name} will be able to view, post and like in Wed Wishes again. Wishes you hid stay hidden until you show them.</Notice>
                </>
            ) : (
                <>
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[12.5px] text-destructive">
                        <p className="flex items-center gap-1.5 font-semibold"><ShieldAlert className="size-3.5" /> Blocking access to Wed Wishes</p>
                        <p className="mt-1">The participant will be unable to post, comment or like in Wed Wishes.</p>
                    </div>
                    <p className="text-[13.5px] font-bold text-primary">Block Reason <span className="text-destructive">*</span></p>
                    <div className="flex flex-col gap-2">
                        {(Object.keys(REASON_LABEL) as BlockReason[]).map((r) => (
                            <label key={r} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] transition",
                                reason === r ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
                                <input type="radio" name="block-reason" checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-[var(--primary)]" />
                                {REASON_LABEL[r]}
                            </label>
                        ))}
                    </div>
                    <FormField label="Internal Note" hint=" (Optional)">
                        <Textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="Only you see this note." />
                    </FormField>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                        <span className="text-[13px]">Hide their existing wishes</span>
                        <Switch checked={hideAll} onCheckedChange={setHideAll} aria-label="Hide their existing wishes" />
                    </div>
                    <Notice tone="info">The participant&apos;s profile and other event access are unchanged.</Notice>
                </>
            )}
        </ActionSheet>
    );
}

/* ── Manage Comments ─────────────────────────────────────────────────────── */

function ManageComments({ eventId, wish, settings, onClose }: { eventId: number; wish: Wish; settings: WishSettings; onClose: () => void }) {
    const comments = useWishComments(eventId, wish.id);
    const act = useWishCommentActions(eventId);
    const saveSettings = useSaveWishSettings(eventId);
    const filterQuery = useWishFilter(eventId);
    const saveFilter = useSaveWishFilter(eventId);
    const [allow, setAllow] = useState(settings.allow_comments ?? true);
    const [filterOn, setFilterOn] = useState<boolean | null>(null);
    const [text, setText] = useState("");
    const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
    const filterEnabled = filterOn ?? filterQuery.data?.enabled ?? false;
    const busy = saveSettings.isPending || saveFilter.isPending;
    const pill = (c: WishComment): { label: string; tone: Tone } => (c.is_flagged ? { label: "Flagged", tone: "warning" } : c.is_hidden ? { label: "Hidden", tone: "violet" } : { label: "Visible", tone: "success" });
    const save = async () => {
        try {
            if (allow !== (settings.allow_comments ?? true)) await saveSettings.mutateAsync({ ...settings, allow_comments: allow });
            if (filterOn !== null && filterQuery.data && filterOn !== filterQuery.data.enabled) await saveFilter.mutateAsync({ ...filterQuery.data, enabled: filterOn });
            onClose();
        } catch { /* the hooks showed the error */ }
    };
    const link = "text-[12px] font-medium text-primary hover:underline disabled:opacity-40";
    return (
        <ActionSheet open onClose={onClose} icon={MessageSquare} title="Manage Comments" subtitle="Review replies and moderate unwanted comments."
            footer={<>
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button disabled={busy} onClick={save}>{busy && <Loader2 className="size-3.5 animate-spin" />} Save Settings</Button>
            </>}>
            <Who wish={wish} />
            <p className="text-[13.5px] font-bold text-primary">Comment Moderation</p>
            {comments.isLoading ? <p className="text-[12.5px] text-muted-foreground">Loading…</p>
                : (comments.data ?? []).length === 0 ? <p className="rounded-xl border border-border px-3 py-4 text-center text-[12.5px] text-muted-foreground">No comments on this wish yet.</p>
                    : (
                        <div className="divide-y divide-border rounded-xl border border-border bg-card">
                            {(comments.data ?? []).map((c) => {
                                const st = pill(c);
                                return (
                                    <div key={c.id} className="flex flex-col gap-1 px-3 py-2.5 text-[12.5px]">
                                        <p className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">{c.guest_name}</span><StatusPill tone={st.tone}>{st.label}</StatusPill>
                                            {c.added_by_organizer && <StatusPill tone="primary">Organizer</StatusPill>}</p>
                                        {editing?.id === c.id ? (
                                            <div className="flex flex-col gap-1.5">
                                                <Textarea value={editing.text} maxLength={500} rows={2} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} />
                                                <span className="flex justify-end gap-2">
                                                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                                                    <Button size="sm" disabled={!editing.text.trim() || act.update.isPending}
                                                        onClick={() => act.update.mutate({ id: c.id, data: { message: editing.text.trim() }, done: "Comment updated" }, { onSuccess: () => setEditing(null) })}>Save</Button>
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="min-w-0 break-words">{c.message}</p>
                                                <span className="flex shrink-0 gap-2.5">
                                                    {c.can_edit && <button type="button" className={link} onClick={() => setEditing({ id: c.id, text: c.message })}>Edit</button>}
                                                    {c.is_hidden || c.is_flagged
                                                        ? <button type="button" className={link} disabled={act.update.isPending} onClick={() => act.update.mutate({ id: c.id, data: { show_in_app: true }, done: "Comment visible" })}>Show</button>
                                                        : <button type="button" className={link} disabled={act.update.isPending} onClick={() => act.update.mutate({ id: c.id, data: { show_in_app: false }, done: "Comment hidden" })}>Hide</button>}
                                                    <button type="button" className={cn(link, "text-destructive")} disabled={act.remove.isPending} onClick={() => act.remove.mutate(c.id)}>Delete</button>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
            <div className="flex gap-2">
                <Input value={text} maxLength={500} placeholder="Reply as the organizer…" onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) act.add.mutate({ wishId: wish.id, message: text.trim() }, { onSuccess: () => setText("") }); }} />
                <Button disabled={!text.trim() || act.add.isPending} onClick={() => act.add.mutate({ wishId: wish.id, message: text.trim() }, { onSuccess: () => setText("") })}><Send className="size-3.5" /></Button>
            </div>
            <p className="text-[13.5px] font-bold text-primary">Comment Controls</p>
            <ToggleRow label="Allow New Comments" checked={allow} onChange={setAllow} />
            <ToggleRow label="Automatically Filter Unwanted Words" checked={filterEnabled} disabled={filterQuery.isLoading} onChange={setFilterOn} />
            <Notice tone="info">You can edit your own comments, and hide or remove any comment without deleting the original wish.</Notice>
        </ActionSheet>
    );
}

/* ── Delete ──────────────────────────────────────────────────────────────── */

function DeleteWish({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const remove = useDeleteWish(eventId);
    return (
        <ActionSheet open onClose={onClose} icon={Trash2} tone="danger" title="Remove Wish" subtitle="Delete this wish from the event."
            footer={<>
                <Button variant="outline" disabled={remove.isPending} onClick={onClose}>Cancel</Button>
                <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(wish.id, { onSuccess: onClose })}><Trash2 className="size-3.5" /> Remove Wish</Button>
            </>}>
            <div className="flex flex-col items-center gap-2 py-2 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive"><Trash2 className="size-6" /></span>
                <p className="text-[16px] font-bold">Are you sure you want to remove this wish?</p>
                <p className="text-[12.5px] text-muted-foreground">It is deleted for everyone, with its likes, and can&apos;t be brought back.</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                <PersonAvatar name={wish.guest_name} photo={wish.avatar} size={40} rounded="full" />
                <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{wish.guest_name}</p>
                    <p className="text-[11.5px] text-muted-foreground">Wish Type: {TYPE_LABEL[wish.post_type]} · Posted: {dateTimeOf(wish.created_at)}</p>
                </div>
            </div>
        </ActionSheet>
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

function WishesSettingsPage({ eventId, settings, onDone, onWords }: { eventId: number; settings: WishSettings; onDone: () => void; onWords: () => void }) {
    const saveSettings = useSaveWishSettings(eventId);
    const filterQuery = useWishFilter(eventId);
    const saveFilter = useSaveWishFilter(eventId);
    const [s, setS] = useState<WishSettings>(settings);
    const [filter, setFilter] = useState<WishFilter | null>(null);
    const f = filter ?? filterQuery.data ?? { enabled: false, words: [], auto_hide: true, notify: true };
    const setF = (patch: Partial<WishFilter>) => setFilter({ ...f, ...patch });
    const set = (k: keyof WishSettings) => (v: boolean) => setS((p) => ({ ...p, [k]: v }));
    const busy = saveSettings.isPending || saveFilter.isPending;
    const save = async () => {
        try {
            await saveSettings.mutateAsync(s);
            if (filter) await saveFilter.mutateAsync(filter);
            onDone();
        } catch { /* the hooks showed the error */ }
    };
    const card = "flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4";
    return (
        <>
            <div className="grid gap-4 lg:grid-cols-2">
                <div className={card}>
                    <p className="text-[15px] font-bold">Wish Visibility &amp; Publishing</p>
                    <ToggleRow label="Allow New Wishes" hint="Participants can post wishes" checked={s.allow_new} onChange={set("allow_new")} />
                    <ToggleRow label="Allow Image Wishes" hint="Participants can add a photo" checked={s.allow_photo} onChange={set("allow_photo")} />
                    <ToggleRow label="Wish Details Screen" hint="Participants can open a wish in full" checked={s.details_screen} onChange={set("details_screen")} />
                    <ToggleRow label="Show Profile Photo" checked={s.profile_photo} onChange={set("profile_photo")} />
                    <ToggleRow label="Show Wish Photo / Video" checked={s.wish_photo} onChange={set("wish_photo")} />
                    <ToggleRow label="Show Time" checked={s.time} onChange={set("time")} />
                    <ToggleRow label="Allow Comments" hint="Participants can comment on wishes" checked={s.allow_comments ?? true} onChange={set("allow_comments")} />
                    <ToggleRow label="Show Likes" hint="Participants see like counts" checked={s.show_likes ?? true} onChange={set("show_likes")} />
                </div>
                <div className={card}>
                    <p className="text-[15px] font-bold">Moderation &amp; Privacy</p>
                    <ToggleRow label="Filter Blocked Words" checked={f.enabled} disabled={filterQuery.isLoading} onChange={(v) => setF({ enabled: v })} />
                    <ToggleRow label="Hold Flagged Wishes for Review" hint="Hidden until you approve them" checked={f.auto_hide} onChange={(v) => setF({ auto_hide: v })} />
                    <ToggleRow label="Notify Organizer of Flagged Wishes" checked={f.notify} onChange={(v) => setF({ notify: v })} />
                    <Button variant="outline" className="justify-start border-primary/40 text-primary hover:bg-primary/5 hover:text-primary" onClick={onWords}>
                        <ShieldCheck className="size-4" /> Manage Blocked Words ({f.words.length})
                    </Button>
                    <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-[12px] text-primary">
                        Participant video uploading is disabled. Organizer video posting is permitted.
                    </p>
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
