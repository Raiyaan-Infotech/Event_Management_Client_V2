"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ArrowDown, ArrowUp, CalendarDays, Clock, Copy, ExternalLink, FolderPlus, Loader2, Mail, Pencil, Plus, Power, QrCode, Search,
    Radio, Share2, Trash2, Upload, X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faGoogle, faInstagram, faWhatsapp, faYoutube, faZoom } from "@fortawesome/free-brands-svg-icons";
import { faTowerBroadcast } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import type { ClientEvent } from "@/hooks/use-client-events";
import { useDateFormatter } from "@/hooks/use-client-settings";
import {
    LIVE_PLATFORMS, uploadLiveCover, useDeleteLiveStream, useDeleteLiveType, useLiveStreams, useLiveTypes,
    useReorderLiveTypes, useSaveLiveStream, useSaveLiveType,
    type LivePlatform, type LiveStream, type LiveStreamType,
} from "@/hooks/use-event-engagement";
import { ActionSheet, DeletePopup } from "@/components/module-kit";
import { Empty, FieldError, PanelLoading, Section, SwitchRow } from "./module-ui";

/**
 * Live Streaming — as the app's Live Streaming screen (V1, Jamal 2026-10-21):
 * every stream of the event at once, grouped under its category, with Total /
 * Live Enabled / Disabled tiles, a search box and a category filter,
 * + Add Category (the categories list) and + Add Live Stream. Each stream has
 * its enable switch, Edit and Delete. Same endpoints as the app.
 */

const PLATFORM_ICON = {
    youtube: faYoutube, facebook: faFacebook, instagram: faInstagram, zoom: faZoom, google_meet: faGoogle, other: faTowerBroadcast,
} as const;

const platformOf = (key: string) => LIVE_PLATFORMS.find((p) => p.key === key) ?? LIVE_PLATFORMS[5];

function timeLabel(t: string) {
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h)) return t;
    return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function PlatformBadge({ platform }: { platform: string }) {
    const p = platformOf(platform);
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${p.color}14`, color: p.color }}>
            <FontAwesomeIcon icon={PLATFORM_ICON[p.key]} className="!size-[11px]" />
            {p.label}
        </span>
    );
}

export function LivePanel({ event }: { event: ClientEvent }) {
    const fmt = useDateFormatter();
    const typesQuery = useLiveTypes(event.id);
    const streamsQuery = useLiveStreams(event.id);
    const save = useSaveLiveStream(event.id);
    const remove = useDeleteLiveStream(event.id);

    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [editing, setEditing] = useState<LiveStream | "new" | null>(null);
    const [deleting, setDeleting] = useState<LiveStream | null>(null);
    const [categoriesOpen, setCategoriesOpen] = useState(false);
    const [viewing, setViewing] = useState<LiveStream | null>(null);
    const [sharing, setSharing] = useState<LiveStream | null>(null);

    const streams = useMemo(() => streamsQuery.data?.streams ?? [], [streamsQuery.data]);
    const types = typesQuery.data?.types ?? [];

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return streams.filter((s) =>
            (typeFilter === "all" || String(s.type_id) === typeFilter)
            && (!q || s.title.toLowerCase().includes(q) || (s.type_name ?? "").toLowerCase().includes(q)));
    }, [streams, search, typeFilter]);

    if (typesQuery.isLoading || streamsQuery.isLoading) return <PanelLoading />;
    if (typesQuery.isError || streamsQuery.isError || !typesQuery.data || !streamsQuery.data) {
        return <Section title="Live Streaming"><Empty title="Could not load live streaming">Please try again in a moment.</Empty></Section>;
    }
    const page = typesQuery.data;
    const counts = streamsQuery.data.counts;
    const canEdit = page.can_edit;

    // Grouped under their category, in the categories' order.
    const groups = types
        .map((t) => ({ type: t, items: shown.filter((s) => s.type_id === t.id) }))
        .filter((g) => g.items.length > 0);
    const loose = shown.filter((s) => !types.some((t) => t.id === s.type_id));

    const addStream = () => {
        if (types.length === 0) {
            toast.error("Add a category first.");
            setCategoriesOpen(true);
            return;
        }
        setEditing("new");
    };

    return (
        <div className="flex flex-col gap-5">
            <Section
                title="Live Streaming"
                action={canEdit && (
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setCategoriesOpen(true)}><FolderPlus className="size-3.5" /> Add Category</Button>
                        <Button size="sm" onClick={addStream}><Plus className="size-3.5" /> Add Live Stream</Button>
                    </div>
                )}
            >
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { label: "Total Streams", value: counts.total, tone: "text-foreground" },
                        { label: "Live Enabled", value: counts.enabled, tone: "text-success" },
                        { label: "Disabled", value: counts.disabled, tone: "text-muted-foreground" },
                    ].map((t) => (
                        <div key={t.label} className="rounded-lg border border-border px-3 py-2.5">
                            <p className={cn("text-[20px] font-bold leading-none", t.tone)}>{t.value}</p>
                            <p className="mt-1 text-[11.5px] text-muted-foreground">{t.label}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search live streams" className="h-9 pl-8 text-[13px]" />
                    </div>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="h-9 w-full text-[13px] sm:w-[200px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {types.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                {streams.length === 0 ? (
                    <Empty title="No live streams yet">
                        Add a category (e.g. Wedding Ceremony), then add its live stream link — YouTube, Facebook, Instagram, Zoom or Google Meet.
                    </Empty>
                ) : shown.length === 0 ? (
                    <Empty title="No live streams match" />
                ) : (
                    <div className="mt-4 flex flex-col gap-5">
                        {[...groups, ...(loose.length ? [{ type: null as LiveStreamType | null, items: loose }] : [])].map((g) => (
                            <div key={g.type?.id ?? "none"}>
                                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {g.type?.name ?? "Other"} <span className="font-normal normal-case">({g.items.length})</span>
                                </p>
                                <ul className="grid gap-2 lg:grid-cols-2">
                                    {g.items.map((s) => (
                                        <li key={s.id} className={cn("flex min-w-0 gap-3 rounded-lg border border-border p-2.5", !s.is_enabled && "opacity-70")}>
                                            <div className="h-[72px] w-[110px] shrink-0 cursor-pointer overflow-hidden rounded-md bg-muted" onClick={() => setViewing(s)}>
                                                {s.cover_image ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={mediaUrl(s.cover_image)} alt="" className="h-full w-full object-cover" />
                                                ) : (
                                                    <div className="grid h-full w-full place-items-center" style={{ backgroundColor: `${platformOf(s.platform).color}12` }}>
                                                        <FontAwesomeIcon icon={PLATFORM_ICON[platformOf(s.platform).key]} className="!size-[22px]" style={{ color: platformOf(s.platform).color }} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-2">
                                                    <button type="button" onClick={() => setViewing(s)} className="line-clamp-2 break-words text-left text-[13px] font-semibold hover:text-primary">{s.title}</button>
                                                    {canEdit && (
                                                        <Switch
                                                            checked={s.is_enabled}
                                                            disabled={save.isPending}
                                                            onCheckedChange={(v) => save.mutate(
                                                                { id: s.id, data: { is_enabled: v }, quiet: true },
                                                                { onSuccess: () => toast.success(v ? "Live stream enabled" : "Live stream disabled") },
                                                            )}
                                                            aria-label="Enabled"
                                                        />
                                                    )}
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted-foreground">
                                                    <PlatformBadge platform={s.platform} />
                                                    <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{fmt(s.stream_date)}</span>
                                                    <span className="inline-flex items-center gap-1"><Clock className="size-3" />{timeLabel(s.stream_time)}</span>
                                                </div>
                                                <div className="mt-1 flex items-center gap-1">
                                                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[12px] text-primary">
                                                        <a href={s.stream_url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Watch</a>
                                                    </Button>
                                                    {canEdit && (
                                                        <>
                                                            <Button size="icon" variant="ghost" className="size-7" aria-label="Edit" onClick={() => setEditing(s)}><Pencil className="size-3.5" /></Button>
                                                            <Button size="icon" variant="ghost" className="size-7 text-destructive" aria-label="Delete" onClick={() => setDeleting(s)}><Trash2 className="size-3.5" /></Button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {categoriesOpen && <CategoriesDialog eventId={event.id} types={types} onClose={() => setCategoriesOpen(false)} />}

            {viewing && (() => {
                const s = streams.find((x) => x.id === viewing.id) ?? viewing;
                return (
                    <StreamDetailsDialog
                        stream={s} canEdit={canEdit} busy={save.isPending} dateText={fmt(s.stream_date)}
                        onClose={() => setViewing(null)}
                        onEdit={() => { setViewing(null); setEditing(s); }}
                        onShare={() => setSharing(s)}
                        onToggle={() => save.mutate(
                            { id: s.id, data: { is_enabled: !s.is_enabled }, quiet: true },
                            { onSuccess: () => toast.success(s.is_enabled ? "Live stream disabled" : "Live stream enabled") },
                        )}
                    />
                );
            })()}
            {sharing && <ShareStreamDialog stream={sharing} eventName={event.name} dateText={fmt(sharing.stream_date)} onClose={() => setSharing(null)} />}

            {editing && (
                <StreamDialog
                    key={editing === "new" ? "new" : editing.id}
                    eventId={event.id}
                    types={types}
                    stream={editing === "new" ? null : editing}
                    defaultTypeId={typeFilter !== "all" ? Number(typeFilter) : types[0]?.id}
                    minDate={page.event_start_date}
                    maxDate={page.event_end_date}
                    onClose={() => setEditing(null)}
                />
            )}

            <DeletePopup
                open={!!deleting} onClose={() => setDeleting(null)} busy={remove.isPending}
                title="Delete this live stream?"
                description={<>&quot;{deleting?.title}&quot; will be removed for everyone.</>}
                onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
            />
        </div>
    );
}

/** The categories list (the app's Stream Types): add, rename, delete, order. */
function CategoriesDialog({ eventId, types, onClose }: { eventId: number; types: LiveStreamType[]; onClose: () => void }) {
    const saveType = useSaveLiveType(eventId);
    const removeType = useDeleteLiveType(eventId);
    const reorder = useReorderLiveTypes(eventId);
    const [editing, setEditing] = useState<LiveStreamType | "new" | null>(types.length === 0 ? "new" : null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [deleting, setDeleting] = useState<LiveStreamType | null>(null);

    const startEdit = (t: LiveStreamType | "new") => {
        setEditing(t);
        setName(t === "new" ? "" : t.name);
        setDescription(t === "new" ? "" : t.description ?? "");
    };
    const submit = () => {
        if (!name.trim()) return toast.error("Please enter the category name.");
        saveType.mutate(
            { id: editing === "new" || !editing ? undefined : editing.id, name: name.trim(), description: description.trim() || null },
            { onSuccess: () => setEditing(null) },
        );
    };
    const move = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= types.length) return;
        const ids = types.map((t) => t.id);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        reorder.mutate(ids);
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Live Stream Categories</DialogTitle>
                    <DialogDescription>e.g. Wedding Ceremony, Reception. Guests see streams grouped under these.</DialogDescription>
                </DialogHeader>

                {editing ? (
                    <div className="grid gap-3 rounded-lg border border-border p-3">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Category Name <span className="text-destructive">*</span></Label>
                            <Input value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Description (optional)</Label>
                            <Textarea value={description} maxLength={300} rows={2} onChange={(e) => setDescription(e.target.value)} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                            <Button size="sm" disabled={saveType.isPending} onClick={submit}>{editing === "new" ? "Add Category" : "Save"}</Button>
                        </div>
                    </div>
                ) : (
                    <Button size="sm" variant="outline" className="w-fit" onClick={() => startEdit("new")}><Plus className="size-3.5" /> New Category</Button>
                )}

                <ul className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
                    {types.map((t, i) => (
                        <li key={t.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
                            {/* A category's cover = its first stream's cover (as the app). */}
                            <div className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                                {t.cover_url
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={mediaUrl(t.cover_url)} alt="" className="h-full w-full object-cover" />
                                    : <FontAwesomeIcon icon={faTowerBroadcast} className="!size-[14px] text-muted-foreground" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-semibold">{t.name}</p>
                                <p className="text-[11.5px] text-muted-foreground">{t.stream_count} stream{t.stream_count === 1 ? "" : "s"} · {t.enabled_count} enabled</p>
                            </div>
                            <Button size="icon" variant="ghost" className="size-7" aria-label="Move up" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="size-7" aria-label="Move down" disabled={i === types.length - 1 || reorder.isPending} onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="size-7" aria-label="Edit" onClick={() => startEdit(t)}><Pencil className="size-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="size-7 text-destructive" aria-label="Delete" onClick={() => setDeleting(t)}><Trash2 className="size-3.5" /></Button>
                        </li>
                    ))}
                </ul>

                {deleting && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[12.5px]">
                        <p className="font-semibold">Delete &quot;{deleting.name}&quot;?</p>
                        <p className="mt-0.5 text-muted-foreground">
                            {deleting.stream_count > 0
                                ? `Its ${deleting.stream_count} live stream${deleting.stream_count === 1 ? "" : "s"} will be deleted too.`
                                : "This category has no live streams."}
                        </p>
                        <div className="mt-2 flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
                            <Button size="sm" variant="destructive" disabled={removeType.isPending}
                                onClick={() => removeType.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>Delete</Button>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Done</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function StreamDialog({
    eventId, types, stream, defaultTypeId, minDate, maxDate, onClose,
}: {
    eventId: number; types: LiveStreamType[]; stream: LiveStream | null; defaultTypeId?: number;
    minDate: string | null; maxDate: string | null; onClose: () => void;
}) {
    const save = useSaveLiveStream(eventId);
    const [typeId, setTypeId] = useState(String(stream?.type_id ?? defaultTypeId ?? ""));
    const [title, setTitle] = useState(stream?.title ?? "");
    const [platform, setPlatform] = useState<LivePlatform>(stream?.platform ?? "youtube");
    const [url, setUrl] = useState(stream?.stream_url ?? "");
    const [date, setDate] = useState(stream?.stream_date ?? minDate ?? "");
    const [time, setTime] = useState(stream?.stream_time?.slice(0, 5) ?? "");
    const [description, setDescription] = useState(stream?.description ?? "");
    const [cover, setCover] = useState<string | null>(stream?.cover_image ?? null);
    const [enabled, setEnabled] = useState(stream?.is_enabled ?? true);
    const [uploading, setUploading] = useState(false);
    const [tried, setTried] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const pickCover = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) return toast.error("Please choose an image.");
        if (file.size > 2 * 1024 * 1024) return toast.error("The cover image must be 2 MB or smaller.");
        setUploading(true);
        try {
            setCover(await uploadLiveCover(eventId, file));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not upload the image");
        } finally {
            setUploading(false);
        }
    };

    const submit = () => {
        setTried(true);
        if (!typeId || !title.trim() || !url.trim() || !date || !time) {
            toast.error("Please fill all mandatory fields.");
            return;
        }
        if (!/^https?:\/\//i.test(url.trim())) {
            toast.error("Please enter a valid link starting with http:// or https://.");
            return;
        }
        save.mutate({
            id: stream?.id,
            data: {
                type_id: Number(typeId), title: title.trim(), platform, stream_url: url.trim(),
                stream_date: date, stream_time: time, description: description.trim() || null,
                cover_image: cover, is_enabled: enabled,
            },
        }, { onSuccess: onClose });
    };

    const bad = (v: string) => tried && !v.trim();

    return (
        // A slide-in panel like every module's form (Jamal, 2026-11-11 module checklist).
        <ActionSheet
            open onClose={onClose} icon={Radio} width={540}
            title={stream ? "Edit Live Stream" : "Add Live Stream"}
            subtitle={minDate && maxDate ? `The date must fall within the event (${minDate} – ${maxDate}).` : "Guests open this link to watch."}
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={save.isPending || uploading} onClick={submit}>
                        {save.isPending && <Loader2 className="size-3.5 animate-spin" />} {stream ? "Save Changes" : "Add Live Stream"}
                    </Button>
                </>
            )}
        >
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label className="text-[12.5px]">Cover Image (optional)</Label>
                        <div className="flex items-center gap-3">
                            <div className="h-[72px] w-[120px] shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                                {cover ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={mediaUrl(cover)} alt="" className="h-full w-full object-cover" />
                                ) : <div className="grid h-full place-items-center text-[11px] text-muted-foreground">No image</div>}
                            </div>
                            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickCover(e.target.files?.[0]); e.target.value = ""; }} />
                            <div className="flex flex-col gap-1.5">
                                <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                                    {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                                    {cover ? "Change" : "Upload"}
                                </Button>
                                {cover && <Button type="button" size="sm" variant="ghost" onClick={() => setCover(null)}><X className="size-3.5" /> Remove</Button>}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Category <span className="text-destructive">*</span></Label>
                        <Select value={typeId} onValueChange={setTypeId}>
                            <SelectTrigger className={cn("h-9 text-[13px]", tried && !typeId && "border-destructive")}><SelectValue placeholder="Choose a category" /></SelectTrigger>
                            <SelectContent>{types.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <FieldError show={tried && !typeId} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Platform <span className="text-destructive">*</span></Label>
                        <Select value={platform} onValueChange={(v) => setPlatform(v as LivePlatform)}>
                            <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{LIVE_PLATFORMS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label className="text-[12.5px]">Title <span className="text-destructive">*</span></Label>
                        <Input value={title} maxLength={150} placeholder="e.g. Wedding Ceremony Live" onChange={(e) => setTitle(e.target.value)} className={cn(bad(title) && "border-destructive")} />
                        <FieldError show={bad(title)} />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label className="text-[12.5px]">Live Stream Link <span className="text-destructive">*</span></Label>
                        <Input value={url} maxLength={500} placeholder="https://" onChange={(e) => setUrl(e.target.value)} className={cn(bad(url) && "border-destructive")} />
                        <FieldError show={bad(url)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Date <span className="text-destructive">*</span></Label>
                        <Input type="date" value={date} min={minDate ?? undefined} max={maxDate ?? undefined} onChange={(e) => setDate(e.target.value)} className={cn(bad(date) && "border-destructive")} />
                        <FieldError show={bad(date)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Time <span className="text-destructive">*</span></Label>
                        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={cn(bad(time) && "border-destructive")} />
                        <FieldError show={bad(time)} />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label className="text-[12.5px]">Description (optional)</Label>
                        <Textarea value={description} maxLength={500} rows={2} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="rounded-lg border border-border px-3 sm:col-span-2">
                        <SwitchRow id="ls-enabled" label="Enable Live Stream" hint="Guests see it in the event app" checked={enabled} onChange={setEnabled} />
                    </div>
                </div>
        </ActionSheet>
    );
}

/** Live Stream Details — as the app: Watch Live, Edit, Share, Disable / Enable. */
function StreamDetailsDialog({
    stream, canEdit, busy, dateText, onClose, onEdit, onShare, onToggle,
}: {
    stream: LiveStream; canEdit: boolean; busy: boolean; dateText: string;
    onClose: () => void; onEdit: () => void; onShare: () => void; onToggle: () => void;
}) {
    const p = platformOf(stream.platform);
    return (
        <ActionSheet open onClose={onClose} icon={Radio} title="Live Stream Details" subtitle={stream.title} width={520}>
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                    {stream.cover_image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={mediaUrl(stream.cover_image)} alt="" className="h-full w-full object-cover" />
                        : <div className="grid h-full place-items-center" style={{ backgroundColor: `${p.color}12` }}>
                            <FontAwesomeIcon icon={PLATFORM_ICON[p.key]} className="!size-[40px]" style={{ color: p.color }} />
                        </div>}
                    {stream.is_enabled && (
                        <span className="absolute left-2 top-2 rounded bg-destructive px-2 py-0.5 text-[10.5px] font-bold text-white">LIVE</span>
                    )}
                </div>
                <div>
                    <p className="break-words text-[16px] font-bold">{stream.title}</p>
                    {stream.type_name && <p className="text-[12px] text-muted-foreground">{stream.type_name}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                    <PlatformBadge platform={stream.platform} />
                    <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{dateText}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{timeLabel(stream.stream_time)}</span>
                    {!stream.is_enabled && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">Disabled</span>}
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-primary">{stream.stream_url}</span>
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Copy link"
                        onClick={() => { void navigator.clipboard?.writeText(stream.stream_url); toast.success("Link copied"); }}>
                        <Copy className="size-3.5" />
                    </Button>
                </div>
                {stream.description && <p className="whitespace-pre-line break-words text-[12.5px] text-foreground/85">{stream.description}</p>}
                <Button asChild><a href={stream.stream_url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Watch Live</a></Button>
                {canEdit && (
                    <div className="grid grid-cols-3 gap-2">
                        <Button variant="outline" onClick={onEdit}><Pencil className="size-3.5" /> Edit</Button>
                        <Button variant="outline" onClick={onShare}><Share2 className="size-3.5" /> Share</Button>
                        <Button variant="outline" disabled={busy} onClick={onToggle}>
                            <Power className="size-3.5" /> {stream.is_enabled ? "Disable" : "Enable"}
                        </Button>
                    </div>
                )}
        </ActionSheet>
    );
}

/** Share Live Stream — as the app: QR code, Copy Link, WhatsApp, Email, Share QR Code. */
function ShareStreamDialog({
    stream, eventName, dateText, onClose,
}: { stream: LiveStream; eventName: string; dateText: string; onClose: () => void }) {
    const qrId = `live-qr-${stream.id}`;
    const text = `Watch "${stream.title}" live (${eventName})\n${dateText}, ${timeLabel(stream.stream_time)}\n${stream.stream_url}`;

    const downloadQr = () => {
        const svg = document.getElementById(qrId)?.querySelector("svg");
        if (!svg) return;
        const data = new XMLSerializer().serializeToString(svg);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 600;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, 600, 600);
            ctx.drawImage(img, 40, 40, 520, 520);
            const a = document.createElement("a");
            a.download = `live-stream-${stream.id}-qr.png`;
            a.href = canvas.toDataURL("image/png");
            a.click();
        };
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
    };

    const row = (icon: React.ReactNode, title: string, sub: string, onClick: () => void) => (
        <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:bg-muted">
            <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">{icon}</span>
            <span className="min-w-0">
                <span className="block text-[13px] font-medium">{title}</span>
                <span className="block text-[11.5px] text-muted-foreground">{sub}</span>
            </span>
        </button>
    );

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Share Live Stream</DialogTitle>
                    <DialogDescription>{stream.title}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-2">
                    <div id={qrId} className="rounded-lg border border-border bg-white p-3">
                        <QRCodeSVG value={stream.stream_url} size={170} />
                    </div>
                    <p className="text-[12px] text-muted-foreground">Scan to open the live stream</p>
                </div>
                <div className="grid gap-2">
                    {row(<Copy className="size-4" />, "Copy Link", "Copy live stream link",
                        () => { void navigator.clipboard?.writeText(stream.stream_url); toast.success("Link copied"); })}
                    {row(<FontAwesomeIcon icon={faWhatsapp} className="!size-4" />, "Share via WhatsApp", "Share with your guests",
                        () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank"))}
                    {row(<Mail className="size-4" />, "Share via Email", "Send invitation via email",
                        () => window.open(`mailto:?subject=${encodeURIComponent(`Live: ${stream.title}`)}&body=${encodeURIComponent(text)}`, "_self"))}
                    {row(<QrCode className="size-4" />, "Share QR Code", "Let guests scan to open", downloadQr)}
                </div>
            </DialogContent>
        </Dialog>
    );
}
