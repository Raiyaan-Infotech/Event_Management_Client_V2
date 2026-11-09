"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    Bell, Check, ChevronDown, Eye, EyeOff, Flag, Heart, ImagePlus, Info, Loader2, MessageSquare, Pencil, RefreshCw, Send,
    Smartphone, Trash2, Upload, Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionSheet, CharCount, FormField, Notice, PersonAvatar, StatusPill } from "@/components/module-kit";
import type { Tone } from "@/components/module-kit/tones";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import type { ParticipantRow } from "@/hooks/use-event-participants";
import {
    useMessageWishWriter, useReplaceWishMedia, useUpdateWish, useWishCommentActions, useWishComments, useWishReports,
    type BlockReason, type Wish, type WishAudience, type WishComment,
} from "@/hooks/use-event-engagement";

/**
 * The Wed Wishes action panels in Jamal's designs (2026-11-09): View Wish, Edit Wish, Approve &
 * Publish, Manage Comments and Send In-App Notification. All slide in from the right ("canvas")
 * with the "<EVENT> · WED WISHES" line above a large title.
 */

/* ── Shared ──────────────────────────────────────────────────────────────── */

type Ctx = { eyebrow: string; people: Map<number, ParticipantRow> };
const WishPanelsContext = createContext<Ctx>({ eyebrow: "Wed Wishes", people: new Map() });

/** Gives every panel the event name (for the pink line) and the participants (for "Bride Side"). */
export function WishPanelsProvider({ eventName, participants, children }: { eventName: string; participants?: ParticipantRow[]; children: React.ReactNode }) {
    const value = useMemo<Ctx>(() => ({
        eyebrow: `${eventName} · Wed Wishes`,
        people: new Map((participants ?? []).map((p) => [p.id, p])),
    }), [eventName, participants]);
    return <WishPanelsContext.Provider value={value}>{children}</WishPanelsContext.Provider>;
}
export const useWishPanels = () => useContext(WishPanelsContext);

const SIDE = { bride: "Bride Side", groom: "Groom Side" } as const;
/** "Bride Side · Participant" (or "Event Organizer"). */
export function useWhoLine(wish: Wish) {
    const { people } = useWishPanels();
    if (wish.added_by_organizer) return "Event Organizer";
    const p = wish.participant_id ? people.get(wish.participant_id) : undefined;
    const side = p?.side ? SIDE[p.side] : p?.rsvp_side ? SIDE[p.rsvp_side] : null;
    return [side, "Participant"].filter(Boolean).join(" • ");
}

const AUDIENCE: Record<WishAudience, string> = { both: "Both", bride: "Bride", groom: "Groom" };
const AUDIENCE_LONG: Record<WishAudience, string> = { both: "Both (Bride & Groom)", bride: "Bride", groom: "Groom" };
const TYPE_WISH = { text: "Text Wish", image: "Image Wish", video: "Video Wish" } as const;
const MAX_MESSAGE = 500;
const REASON_LABEL: Record<BlockReason, string> = {
    inappropriate: "Inappropriate or offensive content", spam: "Spam / repeated posts", harassment: "Harassment of other participants", other: "Other",
};

export const statusOf = (w: Wish): { label: string; tone: Tone } =>
    w.status === "blocked" ? { label: "Blocked", tone: "danger" }
        : w.is_flagged ? { label: "Pending Review", tone: "warning" }
            : w.status === "hidden" ? { label: "Hidden", tone: "violet" }
                : { label: "Published", tone: "success" };
const reported = (w: Wish) => (w.report_count ?? 0) > 0;
const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const dateOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—");
const sizeOf = (bytes?: number | null) => (!bytes ? null : bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const extOf = (url?: string | null) => (url?.split("?")[0].split(".").pop() || "").toUpperCase().slice(0, 4);

/** The pink card at the top of every panel: photo, name, "Bride Side • Participant", status. */
export function PersonCard({ wish, sub, right, children }: { wish: Wish; sub?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode }) {
    const who = useWhoLine(wish);
    return (
        <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/[0.04] to-primary/[0.09] p-3">
            <div className="flex items-center gap-2.5">
                <PersonAvatar name={wish.guest_name} photo={wish.avatar} size={36} rounded="full" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold">{wish.guest_name}</p>
                    <p className="text-[11.5px] text-muted-foreground">{sub ?? who}</p>
                </div>
                {right}
            </div>
            {children}
        </div>
    );
}

/** A white card with a small bold heading (Wish Details, Attached Media, Engagement & Status). */
function Card({ title, icon: Icon, children, className }: { title?: string; icon?: typeof Heart; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("rounded-xl border border-border bg-card p-3", className)}>
            {title && <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">{Icon && <Icon className="size-3.5 text-primary" />} {title}</p>}
            {children}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-1 text-[12.5px]">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-semibold">{children}</span>
        </div>
    );
}

function WishMedia({ wish, className }: { wish: Wish; className?: string }) {
    if (wish.post_type === "video" && wish.video_url) {
        return <video src={mediaUrl(wish.video_url)} poster={mediaUrl(wish.thumbnail_url) ?? undefined} controls preload="none" className={cn("aspect-video w-full rounded-xl bg-black object-contain", className)} />;
    }
    const src = wish.photo ?? wish.thumbnail_url;
    // eslint-disable-next-line @next/next/no-img-element
    if (wish.post_type === "image" && src) return <img src={mediaUrl(src)} alt="" className={cn("max-h-[300px] w-full rounded-xl object-cover", className)} />;
    return null;
}

/* ── View Wish ───────────────────────────────────────────────────────────── */

export function ViewWish({ eventId, wish, onClose, onEdit, onComments }: { eventId: number; wish: Wish; onClose: () => void; onEdit: () => void; onComments: () => void }) {
    const { eyebrow } = useWishPanels();
    const comments = useWishComments(eventId, wish.id);
    const reports = useWishReports(eventId, wish.id, reported(wish));
    const update = useUpdateWish(eventId);
    const latest = (comments.data ?? []).filter((c) => !c.is_hidden).slice(-3).reverse();
    const st = statusOf(wish);
    const media = wish.post_type !== "text";
    return (
        <ActionSheet open onClose={onClose} eyebrow={eyebrow} title="View Wish" subtitle="Read the selected wedding wish and its moderation history." width={520}
            footer={<>
                <Button variant="outline" onClick={onClose}>Close</Button>
                {wish.can_edit
                    ? <Button onClick={onEdit}><Pencil className="size-3.5" /> Edit Wish</Button>
                    : <Button onClick={onComments}><MessageSquare className="size-3.5" /> Manage Comments</Button>}
            </>}>
            <PersonCard wish={wish} right={<StatusPill tone={st.tone}>{st.label}</StatusPill>} />
            <Card title="Wish Details" icon={Heart}>
                {wish.message
                    ? <p className="whitespace-pre-line break-words text-[13.5px] font-medium leading-relaxed">{wish.message}</p>
                    : <p className="text-[13px] text-muted-foreground">No message — {wish.post_type} only.</p>}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap gap-1.5">
                        <StatusPill tone="primary">{TYPE_WISH[wish.post_type]}</StatusPill>
                        {wish.edited_by_organizer && <StatusPill tone="amber" icon={Pencil}>Edited by organizer</StatusPill>}
                    </span>
                    <span className="text-[11.5px] text-muted-foreground">Posted {dateTime(wish.created_at)}</span>
                </div>
            </Card>
            {media && (
                <Card title="Attached Media" icon={wish.post_type === "video" ? Video : ImagePlus}>
                    <WishMedia wish={wish} />
                    <p className="mt-2 text-[12px] text-muted-foreground">
                        {[wish.post_type === "video" ? "Video" : "Image", sizeOf(wish.size_bytes), extOf(wish.video_url ?? wish.photo)].filter(Boolean).join(" • ")}
                    </p>
                </Card>
            )}
            <Card title="Engagement & Status">
                <div className="divide-y divide-border">
                    <Row label="Recipient">{AUDIENCE[wish.audience]}</Row>
                    <Row label="Likes"><span className="inline-flex items-center gap-1"><Heart className="size-3.5 fill-current text-primary" />{wish.like_count}</span></Row>
                    <Row label="Comments">{wish.comment_count ?? 0}</Row>
                    <Row label="Status"><StatusPill tone={st.tone}>{st.label}</StatusPill></Row>
                    {reported(wish) && <Row label="Reports"><span className="text-destructive">{wish.report_count}</span></Row>}
                </div>
            </Card>
            {reported(wish) && (
                <Card title={`Reports (${wish.report_count})`} icon={Flag} className="border-destructive/30 bg-destructive/[0.03]">
                    <div className="divide-y divide-border">
                        {(reports.data ?? []).map((r) => (
                            <div key={r.id} className="py-2 text-[12.5px]">
                                <p className="font-semibold">{r.reporter_name} <span className="font-normal text-muted-foreground">· {REASON_LABEL[r.reason] ?? r.reason}</span></p>
                                {r.note && <p className="text-muted-foreground">{r.note}</p>}
                            </div>
                        ))}
                    </div>
                    <Button variant="outline" size="sm" className="mt-2" disabled={update.isPending}
                        onClick={() => update.mutate({ id: wish.id, data: { dismiss_reports: true }, done: "Reports dismissed" })}>
                        <Check className="size-3.5" /> Dismiss Reports
                    </Button>
                </Card>
            )}
            <Card>
                <div className="mb-1 flex items-center justify-between">
                    <p className="text-[13px] font-bold">Latest Comments</p>
                    <button type="button" onClick={onComments} className="text-[12px] font-semibold text-primary hover:underline">Manage ({wish.comment_count ?? 0})</button>
                </div>
                {latest.length === 0
                    ? <p className="text-[12.5px] text-muted-foreground">No comments yet.</p>
                    : <div className="divide-y divide-border">{latest.map((c) => (
                        <div key={c.id} className="py-2 text-[12.5px]"><p className="font-semibold">{c.guest_name}</p><p className="break-words">{c.message || "📷 Photo"}</p></div>
                    ))}</div>}
            </Card>
        </ActionSheet>
    );
}

/* ── Edit Wish (the organizer's own post — the server never rewords a participant's wish) ── */

type Kind = Wish["post_type"];
const KIND_LABEL: Record<Kind, string> = { text: "Text", image: "Text with Image", video: "Text with Video" };

export function EditWish({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const { eyebrow } = useWishPanels();
    const update = useUpdateWish(eventId);
    const replace = useReplaceWishMedia(eventId);
    const [kind, setKind] = useState<Kind>(wish.post_type);
    const [audience, setAudience] = useState<WishAudience>(wish.audience);
    const [message, setMessage] = useState(wish.message);
    const [file, setFile] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    const busy = update.isPending || replace.isPending;
    const keepsOld = kind !== "text" && kind === wish.post_type && !file;
    const st = statusOf(wish);
    const accept = kind === "video" ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp";

    const pick = (f: File | undefined) => {
        if (!f) return;
        const video = f.type.startsWith("video/");
        if (video !== (kind === "video")) { toast.error(kind === "video" ? "Please choose a video." : "Please choose an image."); return; }
        if (video ? f.size > 25 * 1024 * 1024 : f.size > 2 * 1024 * 1024) { toast.error(video ? "The video must be 25 MB or smaller." : "The image must be 2 MB or smaller."); return; }
        setFile(f);
    };
    const save = async () => {
        if (kind === "text" && !message.trim()) { toast.error("Please write a message."); return; }
        if (kind !== "text" && !keepsOld && !file) { toast.error(kind === "video" ? "Please choose a video." : "Please choose an image."); return; }
        try {
            await update.mutateAsync({ id: wish.id, data: { message: message.trim(), audience, ...(kind === "text" && wish.post_type !== "text" ? { post_type: "text" } : {}) } });
            if (file) await replace.mutateAsync({ id: wish.id, file });
            toast.success("Wish updated");
            onClose();
        } catch { /* the hooks showed the error */ }
    };

    return (
        <ActionSheet open onClose={onClose} eyebrow={eyebrow} title="Edit Wish" subtitle={wish.added_by_organizer ? "Modify your post — participants see the change in the app straight away." : "Correct this participant's wish — the change shows in the app straight away."} width={520}
            footer={<>
                <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
                <Button disabled={busy} onClick={save}>{busy && <Loader2 className="size-3.5 animate-spin" />} Save Changes</Button>
            </>}>
            <PersonCard wish={wish} right={<StatusPill tone={st.tone}>{st.label}</StatusPill>} />
            <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Wish Type">
                    <Select value={kind} onValueChange={(v) => { setKind(v as Kind); setFile(null); }}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(KIND_LABEL) as Kind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}</SelectContent>
                    </Select>
                </FormField>
                <FormField label="Wishes To">
                    <Select value={audience} onValueChange={(v) => setAudience(v as WishAudience)}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(AUDIENCE_LONG) as WishAudience[]).map((a) => <SelectItem key={a} value={a}>{AUDIENCE_LONG[a]}</SelectItem>)}</SelectContent>
                    </Select>
                </FormField>
            </div>
            <FormField label="Wish Message" required={kind === "text"}>
                <Textarea value={message} maxLength={MAX_MESSAGE} rows={4} onChange={(e) => setMessage(e.target.value)} />
                <CharCount value={message} max={MAX_MESSAGE} />
            </FormField>
            {kind !== "text" && (
                <FormField label={keepsOld ? `Current ${kind === "video" ? "Video" : "Image"}` : kind === "video" ? "Video" : "Image"}>
                    <input ref={fileRef} type="file" accept={accept} hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                    {keepsOld || (file && preview) ? (
                        <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                            <div className="h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
                                {file && preview
                                    ? (file.type.startsWith("video/")
                                        ? <video src={preview} className="size-full object-cover" muted />
                                        // eslint-disable-next-line @next/next/no-img-element
                                        : <img src={preview} alt="" className="size-full object-cover" />)
                                    // eslint-disable-next-line @next/next/no-img-element
                                    : (wish.thumbnail_url || wish.photo) ? <img src={mediaUrl(wish.thumbnail_url ?? wish.photo)} alt="" className="size-full object-cover" /> : null}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13.5px] font-semibold">{file ? file.name : kind === "video" ? "Video" : "Image"}</p>
                                <p className="text-[12px] text-muted-foreground">
                                    {[sizeOf(file ? file.size : wish.size_bytes), file ? file.type.split("/")[1]?.toUpperCase() : extOf(wish.video_url ?? wish.photo)].filter(Boolean).join(" • ")}
                                </p>
                                <Button size="sm" variant="outline" className="mt-1.5 h-7 border-primary/40 text-[12px] text-primary hover:text-primary" onClick={() => fileRef.current?.click()}>
                                    <RefreshCw className="size-3" /> Replace {kind === "video" ? "Video" : "Image"}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <button type="button" onClick={() => fileRef.current?.click()}
                            className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] px-3 py-5 text-center transition hover:bg-primary/5">
                            <Upload className="size-5 text-primary" />
                            <span className="text-[13px] font-semibold">Upload {kind === "video" ? "Video" : "Image"}</span>
                            <span className="text-[11px] text-muted-foreground">{kind === "video" ? "MP4 (Max 25MB)" : "JPG, PNG (Max 2MB)"}</span>
                        </button>
                    )}
                </FormField>
            )}
            {kind === "text" && wish.post_type !== "text" && <Notice tone="warning">Saving as Text removes the attached {wish.post_type}.</Notice>}
            {!wish.added_by_organizer && (
                <Notice tone="info">This is {wish.guest_name}&apos;s wish. It keeps their name, and everyone sees an &quot;Edited by organizer&quot; label on it.</Notice>
            )}
        </ActionSheet>
    );
}

/* ── Approve & Publish ───────────────────────────────────────────────────── */

export function ApproveWish({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const { eyebrow } = useWishPanels();
    const update = useUpdateWish(eventId);
    const who = useWhoLine(wish);
    const st = statusOf(wish);
    const approve = () => update.mutate(
        { id: wish.id, data: { show_in_app: true, reviewed: true, dismiss_reports: true }, done: "Wish published" },
        { onSuccess: onClose },
    );
    return (
        <ActionSheet open onClose={onClose} eyebrow={eyebrow} title="Approve & Publish Wish" subtitle="Review a pending wish before it becomes visible to guests." width={520}
            footer={<>
                <Button variant="outline" disabled={update.isPending} onClick={onClose}>Cancel</Button>
                <Button disabled={update.isPending} onClick={approve}>{update.isPending && <Loader2 className="size-3.5 animate-spin" />} Approve &amp; Publish</Button>
            </>}>
            <span className="grid size-11 place-items-center rounded-xl bg-success/10 text-success"><Check className="size-6" /></span>
            <PersonCard wish={wish} sub={`${who} • Submitted ${dateOnly(wish.created_at)}`}>
                <div className="mt-3 border-t border-primary/15 pt-3">
                    {wish.message && <p className="whitespace-pre-line break-words text-[14px]">{wish.message}</p>}
                    {wish.post_type !== "text" && <WishMedia wish={wish} className="mt-2 max-h-[220px]" />}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <StatusPill tone="primary">{TYPE_WISH[wish.post_type]}</StatusPill>
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
                        {reported(wish) && <StatusPill tone="danger" icon={Flag}>Reported ({wish.report_count})</StatusPill>}
                    </div>
                </div>
            </PersonCard>
            <div className="rounded-xl border border-success/30 bg-success/[0.06] p-3">
                <p className="mb-1.5 text-[13px] font-bold text-success">What happens when you publish?</p>
                <ul className="flex flex-col gap-0.5 text-[12.5px]">
                    {["Visible to permitted event participants", "Appears in the Wed Wishes feed", "Participants can like and comment", "Organizer can hide the wish later",
                        ...(reported(wish) ? ["Its reports are cleared"] : [])].map((t) => (
                        <li key={t} className="flex items-center gap-2"><Check className="size-3.5 text-success" /> {t}</li>
                    ))}
                </ul>
            </div>
            <div className="divide-y divide-border">
                <Row label="Recipient">{AUDIENCE[wish.audience]}</Row>
                <Row label="Approval status"><StatusPill tone="warning">{st.label === "Pending Review" ? "Pending" : st.label} → Published</StatusPill></Row>
            </div>
            <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-[12.5px] text-muted-foreground">Only publish posts that meet your event&apos;s content guidelines.</p>
        </ActionSheet>
    );
}

/* ── Manage Comments ─────────────────────────────────────────────────────── */

type CommentTab = "all" | "published" | "pending" | "hidden";
const commentState = (c: WishComment): { tab: CommentTab; label: string; tone: Tone } =>
    c.is_flagged ? { tab: "pending", label: "Pending", tone: "warning" }
        : c.is_hidden ? { tab: "hidden", label: "Hidden", tone: "violet" }
            : { tab: "published", label: "Published", tone: "success" };

export function ManageComments({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const { eyebrow } = useWishPanels();
    const comments = useWishComments(eventId, wish.id);
    const act = useWishCommentActions(eventId);
    const update = useUpdateWish(eventId);
    const [tab, setTab] = useState<CommentTab>("all");
    const [allow, setAllow] = useState(wish.allow_comments ?? true);
    const list = comments.data ?? [];
    const count = (t: CommentTab) => (t === "all" ? list.length : list.filter((c) => commentState(c).tab === t).length);
    const shown = tab === "all" ? list : list.filter((c) => commentState(c).tab === tab);
    const st = statusOf(wish);
    const changed = allow !== (wish.allow_comments ?? true);
    const save = () => {
        if (!changed) { onClose(); return; }
        update.mutate({ id: wish.id, data: { allow_comments: allow }, done: allow ? "Comments opened on this wish" : "Comments closed on this wish" }, { onSuccess: onClose });
    };
    const small = "h-7 px-2.5 text-[12px]";
    return (
        <ActionSheet open onClose={onClose} eyebrow={eyebrow} title="Manage Comments" subtitle="Review and moderate comments on this wedding wish." width={520}
            footer={<>
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button disabled={update.isPending} onClick={save}>{update.isPending && <Loader2 className="size-3.5 animate-spin" />} Save Settings</Button>
            </>}>
            <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/[0.04] to-primary/[0.09] p-3">
                <div className="flex items-center gap-2.5">
                    <PersonAvatar name={wish.guest_name} photo={wish.avatar} size={36} rounded="full" />
                    <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-bold">{wish.guest_name}&apos;s Wish</p>
                        <p className="line-clamp-2 break-words text-[12.5px] text-muted-foreground">{wish.message || TYPE_WISH[wish.post_type]}</p>
                    </div>
                </div>
                <div className="mt-3 flex gap-1.5 border-t border-primary/15 pt-3">
                    <StatusPill tone="primary">{list.length || wish.comment_count || 0} Comments</StatusPill>
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {(["all", "published", "pending", "hidden"] as CommentTab[]).filter((t) => t !== "hidden" || count("hidden") > 0).map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)}
                        className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold capitalize transition",
                            tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
                        {t === "all" ? "All" : t} ({count(t)})
                    </button>
                ))}
            </div>
            {comments.isLoading ? <p className="text-[12.5px] text-muted-foreground">Loading…</p>
                : shown.length === 0 ? <p className="rounded-xl border border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">{list.length ? "No comments here." : "No comments on this wish yet."}</p>
                    : (
                        <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
                            {shown.map((c) => {
                                const s = commentState(c);
                                return (
                                    <div key={c.id} className="flex gap-3 py-3.5">
                                        <PersonAvatar name={c.added_by_organizer ? "Event Organizer" : c.guest_name} size={34} rounded="full" />
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-[13px] font-bold">{c.guest_name}</span>
                                                {c.added_by_organizer && <StatusPill tone="primary">Organizer</StatusPill>}
                                                <StatusPill tone={s.tone}>{s.label}</StatusPill>
                                            </p>
                                            <p className="text-[11.5px] text-muted-foreground">{dateTime(c.created_at).replace(",", " •")}</p>
                                            {c.message && <p className="mt-1 break-words text-[13px]">{c.message}</p>}
                                            {c.photo && (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={mediaUrl(c.photo)} alt="" className="mt-1.5 max-h-40 rounded-lg object-cover" />
                                            )}
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {c.is_flagged && (
                                                    <Button size="sm" variant="outline" className={cn(small, "text-success hover:text-success")} disabled={act.update.isPending}
                                                        onClick={() => act.update.mutate({ id: c.id, data: { show_in_app: true }, done: "Comment approved" })}>Approve</Button>
                                                )}
                                                {c.is_hidden && !c.is_flagged
                                                    ? <Button size="sm" variant="outline" className={small} disabled={act.update.isPending} onClick={() => act.update.mutate({ id: c.id, data: { show_in_app: true }, done: "Comment visible" })}><Eye className="size-3" /> Show</Button>
                                                    : <Button size="sm" variant="outline" className={small} disabled={act.update.isPending} onClick={() => act.update.mutate({ id: c.id, data: { show_in_app: false, reviewed: true }, done: "Comment hidden" })}><EyeOff className="size-3" /> Hide</Button>}
                                                <Button size="sm" variant="outline" className={cn(small, "text-destructive hover:text-destructive")} disabled={act.remove.isPending} onClick={() => act.remove.mutate(c.id)}>
                                                    <Trash2 className="size-3" /> Delete
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-950/20">
                <div>
                    <p className="text-[13px] font-semibold">Allow new comments on this wish</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">Turn off to close comments while keeping published replies visible.</p>
                </div>
                <Switch checked={allow} onCheckedChange={setAllow} aria-label="Allow new comments on this wish" />
            </div>
        </ActionSheet>
    );
}

/* ── Send In-App Notification ────────────────────────────────────────────── */

const MAX_SUBJECT = 100;
export function SendNotification({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const send = useMessageWishWriter(eventId);
    const who = useWhoLine(wish);
    const first = wish.guest_name.split(" ")[0];
    const [subject, setSubject] = useState("A Special Message for You");
    const [message, setMessage] = useState(`Hi ${first},\n\nThank you so much for your lovely wishes! 💖\nYour message truly made our day more special.\n\n– Event Organizer`);
    const ready = !!subject.trim() && !!message.trim() && wish.participant_id !== null;
    return (
        <ActionSheet open onClose={onClose} large icon={Bell} title="Send In-App Notification" subtitle="Send a private in-app message to a participant." width={520}
            footer={<>
                <Button variant="outline" disabled={send.isPending} onClick={onClose}>Cancel</Button>
                <Button disabled={send.isPending || !ready}
                    onClick={() => wish.participant_id !== null && send.mutate({ participantId: wish.participant_id, title: subject.trim(), message: message.trim() }, { onSuccess: onClose })}>
                    {send.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send Notification
                </Button>
            </>}>
            <FormField label="Recipient" required>
                <div className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2">
                    <PersonAvatar name={wish.guest_name} photo={wish.avatar} size={30} rounded="full" />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{wish.guest_name}</span>
                        <span className="block text-[12px] text-muted-foreground">{who.replace(" • Participant", "")}</span>
                    </span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                </div>
            </FormField>
            <FormField label="Channel">
                <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                    <Smartphone className="size-4 text-primary" />
                    <span className="flex-1 text-[13px] font-semibold">In-App</span>
                    <StatusPill tone="success" icon={Check}>In-App Notification</StatusPill>
                    <span title="Shown in the participant's notifications in the event app."><Info className="size-4 text-muted-foreground" /></span>
                </div>
            </FormField>
            <FormField label="Subject" required>
                <Input value={subject} maxLength={MAX_SUBJECT} onChange={(e) => setSubject(e.target.value)} className="h-9" />
                <CharCount value={subject} max={MAX_SUBJECT} />
            </FormField>
            <FormField label="Message" required>
                <Textarea value={message} maxLength={MAX_MESSAGE} rows={5} onChange={(e) => setMessage(e.target.value)} />
                <CharCount value={message} max={MAX_MESSAGE} />
            </FormField>
            <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold"><Eye className="size-3.5" /> Live Preview</p>
                <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Bell className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                        <p className="flex items-start justify-between gap-2">
                            <span className="break-words text-[13px] font-bold">{subject.trim() || "Subject"}</span>
                            <span className="shrink-0 text-[11.5px] text-muted-foreground">now</span>
                        </p>
                        <p className="mt-1 whitespace-pre-line break-words text-[12px] text-foreground/80">{message.trim() || "Your message…"}</p>
                    </div>
                </div>
            </div>
        </ActionSheet>
    );
}
