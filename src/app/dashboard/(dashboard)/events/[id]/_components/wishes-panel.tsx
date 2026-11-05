"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    Ban, Check, Eye, EyeOff, Flag, Heart, ImagePlus, Loader2, MessageSquare, MoreVertical, Pencil, Plus, Search, Settings,
    ShieldCheck, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import type { ClientEvent } from "@/hooks/use-client-events";
import {
    useBlockWishWriter, useCreateWish, useDeleteWish, useEventWishes, useMessageWishWriter, useSaveWishFilter,
    useSaveWishSettings, useUpdateWish, useWishFilter,
    type Wish, type WishAudience, type WishFilter, type WishSettings,
} from "@/hooks/use-event-engagement";
import { Empty, PanelLoading, Section, SettingsShell, SwitchRow } from "./module-ui";

/**
 * Wed Wishes — the organizer's "Wed Wishes Management", as the app (V1, Jamal's
 * mockup 2026-10-16): tiles (Total, Visible, Hidden, Blocked participants,
 * Flagged), All / Visible / Hidden tabs, search, a ⋮ on every post (Hide / Show,
 * Mark as Reviewed, Message, Block, Edit, Delete), ⚙ Settings (what
 * participants may do + the content filter) and + New Post. Under a post: the
 * ❤ count only. Same endpoints as the app.
 */

const AUDIENCE: Record<WishAudience, string> = { groom: "To Groom", bride: "To Bride", both: "To Both" };
const MAX_MESSAGE = 500;

function timeAgo(iso: string | null) {
    if (!iso) return "";
    const at = new Date(iso);
    const mins = Math.floor((Date.now() - at.getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    if (mins < 10080) return `${Math.floor(mins / 1440)}d ago`;
    return at.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

type Tab = "all" | "visible" | "hidden";

export function WishesPanel({ event }: { event: ClientEvent }) {
    const query = useEventWishes(event.id);
    const [tab, setTab] = useState<Tab>("all");
    const [flaggedOnly, setFlaggedOnly] = useState(false);
    const [search, setSearch] = useState("");
    const [newPost, setNewPost] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [editing, setEditing] = useState<Wish | null>(null);
    const [messaging, setMessaging] = useState<Wish | null>(null);
    const [deleting, setDeleting] = useState<Wish | null>(null);
    const [opened, setOpened] = useState<Wish | null>(null);

    const wishes = useMemo(() => query.data?.wishes ?? [], [query.data]);
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return wishes.filter((w) =>
            (tab === "all" || (tab === "visible" ? w.status === "visible" : w.status !== "visible"))
            && (!flaggedOnly || w.is_flagged)
            && (!q || w.guest_name.toLowerCase().includes(q) || w.message.toLowerCase().includes(q)));
    }, [wishes, tab, flaggedOnly, search]);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Wed Wishes"><Empty title="Could not load the wishes">Please try again in a moment.</Empty></Section>;
    }
    const page = query.data;
    const c = page.counts ?? { all: wishes.length, visible: 0, hidden: 0, blocked: 0, blocked_users: 0, flagged: 0 };

    const tiles = [
        { label: "Total Wishes", value: c.all, tone: "text-foreground", onClick: () => { setTab("all"); setFlaggedOnly(false); } },
        { label: "Visible", value: c.visible, tone: "text-success", onClick: () => { setTab("visible"); setFlaggedOnly(false); } },
        { label: "Hidden", value: c.hidden + c.blocked, tone: "text-warning", onClick: () => { setTab("hidden"); setFlaggedOnly(false); } },
        { label: "Blocked participants", value: c.blocked_users, tone: "text-destructive" },
        { label: "Flagged", value: c.flagged, tone: "text-destructive", onClick: () => { setTab("all"); setFlaggedOnly(true); } },
    ];

    return (
        <div className="flex flex-col gap-5">
            <Section
                title="Wed Wishes Management"
                action={page.can_manage && (
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}><Settings className="size-3.5" /> Settings</Button>
                        <Button size="sm" onClick={() => setNewPost(true)}><Plus className="size-3.5" /> New Post</Button>
                    </div>
                )}
            >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {tiles.map((t) => (
                        <button
                            key={t.label} type="button" disabled={!t.onClick} onClick={t.onClick}
                            className={cn(
                                "rounded-lg border border-border px-3 py-2.5 text-left transition",
                                t.onClick && "hover:border-primary/40 hover:bg-primary/5",
                                t.label === "Flagged" && flaggedOnly && "border-destructive/50 bg-destructive/5",
                            )}
                        >
                            <p className={cn("text-[20px] font-bold leading-none", t.tone)}>{t.value}</p>
                            <p className="mt-1 text-[11.5px] text-muted-foreground">{t.label}</p>
                        </button>
                    ))}
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex gap-1 rounded-lg bg-muted p-1">
                        {(["all", "visible", "hidden"] as Tab[]).map((t) => (
                            <button
                                key={t} type="button"
                                onClick={() => { setTab(t); setFlaggedOnly(false); }}
                                className={cn(
                                    "rounded-md px-3 py-1 text-[12.5px] font-medium capitalize transition",
                                    tab === t && !flaggedOnly ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {t} ({t === "all" ? c.all : t === "visible" ? c.visible : c.hidden + c.blocked})
                            </button>
                        ))}
                        {flaggedOnly && (
                            <span className="flex items-center gap-1 rounded-md bg-card px-3 py-1 text-[12.5px] font-medium text-destructive shadow-sm">
                                <Flag className="size-3" /> Flagged ({c.flagged})
                                <button type="button" aria-label="Clear" onClick={() => setFlaggedOnly(false)}><X className="size-3" /></button>
                            </span>
                        )}
                    </div>
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or message" className="h-9 pl-8 text-[13px]" />
                    </div>
                </div>

                {wishes.length === 0 ? (
                    <Empty title="No wishes yet">Wishes your guests post in the event app appear here. You can also add an Organizer Post.</Empty>
                ) : shown.length === 0 ? (
                    <Empty title="No wishes match" />
                ) : (
                    <ul className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {shown.map((w) => (
                            <WishCard
                                key={w.id} wish={w} eventId={event.id} canManage={page.can_manage}
                                onOpen={() => setOpened(w)} onEdit={() => setEditing(w)}
                                onMessage={() => setMessaging(w)} onDelete={() => setDeleting(w)}
                            />
                        ))}
                    </ul>
                )}
            </Section>

            {newPost && <PostDialog eventId={event.id} onClose={() => setNewPost(false)} />}
            {editing && <PostDialog key={editing.id} eventId={event.id} wish={editing} onClose={() => setEditing(null)} />}
            {settingsOpen && <WishSettingsDialog eventId={event.id} settings={page.settings} onClose={() => setSettingsOpen(false)} />}
            {messaging && <MessageDialog eventId={event.id} wish={messaging} onClose={() => setMessaging(null)} />}
            {opened && <WishViewDialog wish={opened} onClose={() => setOpened(null)} />}
            <DeleteWishDialog eventId={event.id} wish={deleting} onClose={() => setDeleting(null)} />
        </div>
    );
}

function Avatar({ wish, size = 36 }: { wish: Wish; size?: number }) {
    if (wish.avatar) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={mediaUrl(wish.avatar)} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
    }
    return (
        <span className="grid shrink-0 place-items-center rounded-full bg-primary/10 text-[13px] font-bold text-primary" style={{ width: size, height: size }}>
            {(wish.guest_name || "?").trim().charAt(0).toUpperCase()}
        </span>
    );
}

function WishMedia({ wish, full = false }: { wish: Wish; full?: boolean }) {
    if (wish.post_type === "video" && wish.video_url) {
        return (
            <video
                src={mediaUrl(wish.video_url)} poster={mediaUrl(wish.thumbnail_url) ?? undefined} controls preload="none"
                className={cn("w-full rounded-lg bg-black object-contain", full ? "max-h-[60vh]" : "aspect-video")}
            />
        );
    }
    const src = full ? (wish.photo ?? wish.thumbnail_url) : (wish.thumbnail_url ?? wish.photo);
    if (wish.post_type === "image" && src) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={mediaUrl(src)} alt="" className={cn("w-full rounded-lg object-cover", full ? "max-h-[60vh] object-contain" : "aspect-video")} />;
    }
    return null;
}

function WishCard({
    wish, eventId, canManage, onOpen, onEdit, onMessage, onDelete,
}: {
    wish: Wish; eventId: number; canManage: boolean;
    onOpen: () => void; onEdit: () => void; onMessage: () => void; onDelete: () => void;
}) {
    const update = useUpdateWish(eventId);
    const block = useBlockWishWriter(eventId);
    const fromParticipant = !wish.added_by_organizer && wish.participant_id !== null;

    return (
        <li className={cn("flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-3", wish.status !== "visible" && "bg-muted/30")}>
            <div className="flex items-start gap-2.5">
                <Avatar wish={wish} />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{wish.guest_name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>{timeAgo(wish.created_at)}</span>
                        <span className="rounded-full bg-primary/10 px-1.5 py-px font-medium text-primary">{AUDIENCE[wish.audience]}</span>
                        {wish.added_by_organizer && <span className="rounded-full bg-muted px-1.5 py-px font-medium">Organizer Post</span>}
                    </div>
                </div>
                {(canManage || wish.can_edit || wish.can_delete) && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Actions"><MoreVertical className="size-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            {canManage && (wish.is_hidden ? (
                                <DropdownMenuItem onClick={() => update.mutate({ id: wish.id, data: { show_in_app: true }, done: "Wish is visible again" })}>
                                    <Eye className="size-3.5" /> Show to participants
                                </DropdownMenuItem>
                            ) : (
                                <>
                                    <DropdownMenuItem onClick={() => update.mutate({ id: wish.id, data: { show_in_app: false }, done: "Wish hidden" })}>
                                        <EyeOff className="size-3.5" /> Hide from participants
                                    </DropdownMenuItem>
                                    {fromParticipant && (
                                        <DropdownMenuItem onClick={() => update.mutate({ id: wish.id, data: { show_in_app: false, all_from_writer: true }, done: "All wishes from this participant hidden" })}>
                                            <EyeOff className="size-3.5" /> Hide all from this participant
                                        </DropdownMenuItem>
                                    )}
                                </>
                            ))}
                            {canManage && wish.is_flagged && (
                                <DropdownMenuItem onClick={() => update.mutate({ id: wish.id, data: { reviewed: true }, done: "Marked as reviewed" })}>
                                    <ShieldCheck className="size-3.5" /> Mark as Reviewed
                                </DropdownMenuItem>
                            )}
                            {canManage && fromParticipant && (
                                <DropdownMenuItem onClick={onMessage}><MessageSquare className="size-3.5" /> Message participant</DropdownMenuItem>
                            )}
                            {canManage && fromParticipant && (
                                <DropdownMenuItem onClick={() => block.mutate({ id: wish.id, blocked: !wish.author_blocked })}>
                                    {wish.author_blocked ? <Check className="size-3.5" /> : <Ban className="size-3.5" />}
                                    {wish.author_blocked ? "Unblock participant" : "Block from Wed Wishes"}
                                </DropdownMenuItem>
                            )}
                            {wish.can_edit && <DropdownMenuItem onClick={onEdit}><Pencil className="size-3.5" /> Edit</DropdownMenuItem>}
                            {wish.can_delete && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                                        <Trash2 className="size-3.5" /> Delete
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            {(wish.status !== "visible" || wish.is_flagged) && (
                <div className="flex flex-wrap gap-1.5">
                    {wish.status === "hidden" && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10.5px] font-semibold text-warning">Hidden</span>}
                    {wish.status === "blocked" && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10.5px] font-semibold text-destructive">Blocked participant</span>}
                    {wish.is_flagged && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10.5px] font-semibold text-destructive">
                            <Flag className="size-2.5" /> Flagged
                        </span>
                    )}
                </div>
            )}

            <button type="button" onClick={onOpen} className="flex flex-col gap-2 text-left">
                {wish.message && <p className="line-clamp-4 whitespace-pre-line break-words text-[12.5px] text-foreground/90">{wish.message}</p>}
                <WishMedia wish={wish} />
            </button>

            <p className="mt-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Heart className={cn("size-3.5", wish.like_count > 0 && "fill-destructive text-destructive")} /> {wish.like_count}
            </p>
        </li>
    );
}

function WishViewDialog({ wish, onClose }: { wish: Wish; onClose: () => void }) {
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <div className="flex items-center gap-2.5">
                        <Avatar wish={wish} size={40} />
                        <div className="min-w-0 text-left">
                            <DialogTitle className="truncate">{wish.guest_name}</DialogTitle>
                            <DialogDescription>{AUDIENCE[wish.audience]} · {timeAgo(wish.created_at)}{wish.mobile ? ` · ${wish.mobile}` : ""}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                {wish.message && <p className="whitespace-pre-line break-words text-[13px]">{wish.message}</p>}
                <WishMedia wish={wish} full />
                <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <Heart className="size-3.5" /> {wish.like_count} {wish.like_count === 1 ? "like" : "likes"}
                </p>
            </DialogContent>
        </Dialog>
    );
}

/** New Organizer Post, or edit a post's text / audience. */
function PostDialog({ eventId, wish, onClose }: { eventId: number; wish?: Wish; onClose: () => void }) {
    const create = useCreateWish(eventId);
    const update = useUpdateWish(eventId);
    const [name, setName] = useState("");
    const [audience, setAudience] = useState<WishAudience>(wish?.audience ?? "both");
    const [message, setMessage] = useState(wish?.message ?? "");
    const [file, setFile] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    const busy = create.isPending || update.isPending;

    const submit = () => {
        if (!message.trim() && !file) {
            toast.error("Please write a message or add a photo / video.");
            return;
        }
        if (wish) {
            update.mutate({ id: wish.id, data: { message: message.trim(), audience }, done: "Post updated" }, { onSuccess: onClose });
        } else {
            create.mutate({ message: message.trim(), audience, guestName: name.trim() || undefined, file }, { onSuccess: onClose });
        }
    };

    return (
        <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{wish ? "Edit Post" : "New Post"}</DialogTitle>
                    <DialogDescription>{wish ? "Change the message or who it is for." : "An Organizer Post shows in the Wed Wishes feed for every guest."}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    {!wish && (
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Posted as (optional)</Label>
                            <Input value={name} maxLength={100} placeholder="Your name (default)" onChange={(e) => setName(e.target.value)} />
                        </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Wish To</Label>
                        <Select value={audience} onValueChange={(v) => setAudience(v as WishAudience)}>
                            <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {(Object.keys(AUDIENCE) as WishAudience[]).map((a) => <SelectItem key={a} value={a}>{AUDIENCE[a]}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Message</Label>
                        <Textarea value={message} maxLength={MAX_MESSAGE} rows={4} onChange={(e) => setMessage(e.target.value)} placeholder="Write your wishes…" />
                        <p className="text-right text-[11px] text-muted-foreground">{message.length}/{MAX_MESSAGE}</p>
                    </div>
                    {!wish && (
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Photo or Video (optional)</Label>
                            <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                            {file && preview ? (
                                <div className="relative">
                                    {file.type.startsWith("video/")
                                        ? <video src={preview} controls className="aspect-video w-full rounded-lg bg-black" />
                                        // eslint-disable-next-line @next/next/no-img-element
                                        : <img src={preview} alt="" className="aspect-video w-full rounded-lg object-cover" />}
                                    <Button size="icon" variant="secondary" className="absolute right-2 top-2 size-7" aria-label="Remove" onClick={() => setFile(null)}><X className="size-3.5" /></Button>
                                </div>
                            ) : (
                                <Button type="button" variant="outline" className="h-20 border-dashed" onClick={() => fileRef.current?.click()}>
                                    <ImagePlus className="size-4" /> Add Photo / Video
                                </Button>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
                    <Button disabled={busy} onClick={submit}>
                        {busy && <Loader2 className="size-3.5 animate-spin" />}
                        {wish ? "Save Changes" : "Post"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MessageDialog({ eventId, wish, onClose }: { eventId: number; wish: Wish; onClose: () => void }) {
    const send = useMessageWishWriter(eventId);
    const [message, setMessage] = useState("");
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Message {wish.guest_name}</DialogTitle>
                    <DialogDescription>Sent once as an app notification to this participant only.</DialogDescription>
                </DialogHeader>
                <Textarea value={message} maxLength={500} rows={4} onChange={(e) => setMessage(e.target.value)} placeholder="Write your message…" />
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                        disabled={send.isPending || !message.trim() || wish.participant_id === null}
                        onClick={() => wish.participant_id !== null && send.mutate({ participantId: wish.participant_id, message: message.trim() }, { onSuccess: onClose })}
                    >
                        Send
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DeleteWishDialog({ eventId, wish, onClose }: { eventId: number; wish: Wish | null; onClose: () => void }) {
    const remove = useDeleteWish(eventId);
    return (
        <Dialog open={!!wish} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete this wish?</DialogTitle>
                    <DialogDescription>The post by {wish?.guest_name} and its likes will be removed for everyone.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" disabled={remove.isPending} onClick={() => wish && remove.mutate(wish.id, { onSuccess: onClose })}>Delete</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

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
