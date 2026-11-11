"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
    ArrowLeft, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, CircleStop, ClipboardCopy, Clock, Copy, Download, ExternalLink,
    Eye, EyeOff, FileText, FolderPlus, Globe, Image as ImageIcon, Info, Layers, Link2, Loader2, Lock, Mail, Pencil, Play, PlayCircle,
    Plus, QrCode, Radio, Share2, Tag, Trash2, Type, UserCheck, Users, type LucideIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faGoogle, faInstagram, faMicrosoft, faWhatsapp, faYoutube, faZoom } from "@fortawesome/free-brands-svg-icons";
import { faCode, faEllipsis, faTowerBroadcast } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import type { ClientEvent } from "@/hooks/use-client-events";
import { useDateFormatter } from "@/hooks/use-client-settings";
import {
    LIVE_PLATFORMS, LIVE_VISIBILITIES, uploadLiveCover, useDeleteLiveStream, useDeleteLiveType, useDuplicateLiveStream, useLiveStream,
    useLiveStreams, useLiveTypes, useSaveLiveStream, useSaveLiveType, useSetLiveStatus, useShareLiveStream,
    type LivePlatform, type LiveStatus, type LiveStream, type LiveStreamType, type LiveVisibility,
} from "@/hooks/use-event-engagement";
import {
    ActionSheet, CharCount, DeletePopup, DetailRow, DetailSection, FormField, ModuleHeader, Notice, NumberStepper, OverviewCard,
    PhotoDropzone, RowActions, SearchBox, StatTile, StatusPill, SwitchField, type Tone,
} from "@/components/module-kit";
import { Empty, PanelLoading, Section } from "./module-ui";

/**
 * Live Streaming (Jamal's "Live Stream Updated" screens, 2026-11-11):
 *   1 Overview — tiles (Total / Active / Scheduled / Ended) + one table per category with the ⋯ menu
 *   2 Create Category — right-side form (name, description, display order, status, default visibility, notes)
 *   3 Create Live Stream — ONE right-side form (3A platform dropdown, 3B visibility dropdown)
 *   4 Review & Create — the form's second step: the details + Publishing Options
 *   5 View Live Stream — player, status, information, viewer numbers (real opens by participants)
 *   6 Share Stream — link, QR, copy / download / WhatsApp / email / participants
 * Nothing is hosted here: a stream is a link on YouTube, Facebook, Zoom … (or an RTMP address).
 * Likes, reactions and live chat from the mockup are not built — the system has no such data.
 */

const PLATFORM_ICON = {
    youtube: faYoutube, facebook: faFacebook, instagram: faInstagram, zoom: faZoom, google_meet: faGoogle, teams: faMicrosoft,
    custom_rtmp: faTowerBroadcast, embedded: faCode, other: faEllipsis,
} as const;
const VISIBILITY_ICON: Record<LiveVisibility, LucideIcon> = {
    public: Globe, participants: Users, guests: Mail, invite_link: Link2, unlisted: EyeOff, private: Lock,
};
const STATUS: Record<LiveStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
    live: { label: "Live", tone: "success", icon: Radio },
    scheduled: { label: "Scheduled", tone: "info", icon: CalendarClock },
    ended: { label: "Ended", tone: "muted", icon: CheckCircle2 },
};
type StatusFilter = "all" | LiveStatus;

const platformOf = (key: string) => LIVE_PLATFORMS.find((p) => p.key === key) ?? LIVE_PLATFORMS[LIVE_PLATFORMS.length - 1];
const visibilityOf = (key: string) => LIVE_VISIBILITIES.find((v) => v.key === key) ?? LIVE_VISIBILITIES[0];
const STREAM_LINK = /^(https?|rtmps?):\/\/\S+$/i;
const isWebLink = (url: string) => /^https?:\/\//i.test(url);

function timeLabel(t: string | null) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h)) return t;
    return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
const copy = (text: string, done = "Link copied") => { void navigator.clipboard?.writeText(text); toast.success(done); };

/** The page a browser can play inside the portal, when the platform has one. */
function embedUrl(s: LiveStream): string | null {
    const u = s.stream_url;
    if (!/^https:\/\//i.test(u)) return null;
    if (s.platform === "youtube") {
        const m = u.match(/(?:[?&]v=|youtu\.be\/|\/live\/|\/embed\/|\/shorts\/)([\w-]{6,})/);
        return m ? `https://www.youtube.com/embed/${m[1]}` : null;
    }
    if (s.platform === "facebook") return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false`;
    if (s.platform === "embedded") return u;
    return null;
}

/** Save the QR drawn inside `#id` as a PNG. */
function downloadQr(id: string, name: string) {
    const svg = document.getElementById(id)?.querySelector("svg");
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
        a.download = `${name}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
    const p = platformOf(platform);
    return <FontAwesomeIcon icon={PLATFORM_ICON[p.key]} className={cn("!size-[14px] shrink-0", className)} style={{ color: p.color }} />;
}
export function PlatformBadge({ platform }: { platform: string }) {
    return <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><PlatformIcon platform={platform} /> {platformOf(platform).short}</span>;
}
function VisibilityLabel({ visibility }: { visibility: string }) {
    const v = visibilityOf(visibility);
    const I = VISIBILITY_ICON[v.key];
    return <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><I className="size-3.5 shrink-0 text-muted-foreground" /> {v.label.replace(" / Organizer Only", "")}</span>;
}
function StatusBadge({ status }: { status: LiveStatus }) {
    const s = STATUS[status];
    return (
        <StatusPill tone={s.tone} icon={status === "live" ? undefined : s.icon}>
            {status === "live" && <span className="size-1.5 animate-pulse rounded-full bg-success" />} {s.label}
        </StatusPill>
    );
}
/** The stream's picture (or its platform logo), with the LIVE flag. */
function Thumb({ stream, className }: { stream: LiveStream; className?: string }) {
    const p = platformOf(stream.platform);
    return (
        <div className={cn("relative shrink-0 overflow-hidden rounded-md bg-muted", className)}>
            {stream.cover_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(stream.cover_image)} alt="" className="size-full object-cover" />
            ) : (
                <div className="grid size-full place-items-center" style={{ backgroundColor: `${p.color}14` }}>
                    <FontAwesomeIcon icon={PLATFORM_ICON[p.key]} className="!size-[18px]" style={{ color: p.color }} />
                </div>
            )}
            {stream.status === "live" && <span className="absolute top-1 left-1 rounded-sm bg-destructive px-1 py-px text-[9px] leading-3 font-bold text-white">LIVE</span>}
        </div>
    );
}

/** A category is active unless explicitly set to false or 0 (defaults to active when unset or missing). */
const isTypeActive = (t?: LiveStreamType | null): boolean =>
    !!t && t.is_active !== false && (t.is_active as unknown) !== 0 && (t.is_active as unknown) !== "0";

export function LivePanel({ event }: { event: ClientEvent }) {
    const fmt = useDateFormatter();
    const typesQuery = useLiveTypes(event.id);
    const streamsQuery = useLiveStreams(event.id);
    const remove = useDeleteLiveStream(event.id);
    const removeType = useDeleteLiveType(event.id);
    const saveType = useSaveLiveType(event.id);
    const setStatus = useSetLiveStatus(event.id);
    const duplicate = useDuplicateLiveStream(event.id);

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<StatusFilter>("all");
    const [editing, setEditing] = useState<LiveStream | { typeId?: number } | null>(null);
    const [editingType, setEditingType] = useState<LiveStreamType | "new" | null>(null);
    const [deleting, setDeleting] = useState<LiveStream | null>(null);
    const [deletingType, setDeletingType] = useState<LiveStreamType | null>(null);
    const [viewingId, setViewingId] = useState<number | null>(null);
    const [sharing, setSharing] = useState<LiveStream | null>(null);
    const [closed, setClosed] = useState<number[]>([]);

    const streams = useMemo(() => streamsQuery.data?.streams ?? [], [streamsQuery.data]);
    const types = typesQuery.data?.types ?? [];
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return streams.filter((s) => (filter === "all" || s.status === filter)
            && (!q || s.title.toLowerCase().includes(q) || (s.type_name ?? "").toLowerCase().includes(q)));
    }, [streams, search, filter]);

    if (typesQuery.isLoading || streamsQuery.isLoading) return <PanelLoading />;
    if (typesQuery.isError || streamsQuery.isError || !typesQuery.data || !streamsQuery.data) {
        return <Section title="Live Streaming"><Empty title="Could not load live streaming">Please try again in a moment.</Empty></Section>;
    }
    const page = typesQuery.data;
    const counts = streamsQuery.data.counts;
    const canEdit = page.can_edit;
    const narrowed = filter !== "all" || !!search.trim();
    const when = (s: LiveStream) => `${fmt(s.stream_date)}, ${timeLabel(s.stream_time)}`;

    const addStream = (typeId?: number) => {
        if (!types.some(isTypeActive)) {
            toast.error(types.length ? "Turn on a category first." : "Create a category first.");
            if (types.length) setEditingType(types[0]);
            else setEditingType("new");
            return;
        }
        setEditing({ typeId });
    };
    const viewing = viewingId ? streams.find((s) => s.id === viewingId) ?? null : null;
    const menuFor = (s: LiveStream) => [
        { label: "View Stream", icon: PlayCircle, onClick: () => setViewingId(s.id) },
        { label: "Edit Stream", icon: Pencil, onClick: () => setEditing(s), hidden: !canEdit },
        { label: "Share Link & QR", icon: Share2, onClick: () => setSharing(s) },
        { label: "Duplicate Stream", icon: Copy, onClick: () => duplicate.mutate(s.id), hidden: !canEdit },
        { label: "Go Live", icon: Radio, onClick: () => setStatus.mutate({ id: s.id, status: "live" }), hidden: !canEdit || s.status === "live", divider: true },
        { label: "End Stream", icon: CircleStop, onClick: () => setStatus.mutate({ id: s.id, status: "ended" }), hidden: !canEdit || s.status !== "live", danger: true, divider: true },
        { label: "Delete Stream", icon: Trash2, onClick: () => setDeleting(s), hidden: !canEdit, danger: true },
    ];

    const sheets = (
        <>
            {editingType && <CategorySheet key={editingType === "new" ? "new" : editingType.id} eventId={event.id} types={types} type={editingType === "new" ? null : editingType} onClose={() => setEditingType(null)} />}
            {editing && (
                <StreamSheet
                    key={"id" in editing ? editing.id : "new"} eventId={event.id} eventName={event.name} types={types}
                    stream={"id" in editing ? editing : null} defaultTypeId={"id" in editing ? undefined : editing.typeId}
                    minDate={page.event_start_date} maxDate={page.event_end_date} dateText={fmt} onClose={() => setEditing(null)}
                />
            )}
            {sharing && <ShareSheet stream={streams.find((s) => s.id === sharing.id) ?? sharing} eventName={event.name} whenText={when(sharing)} canEdit={canEdit} onClose={() => setSharing(null)} />}
            <DeletePopup
                open={!!deleting} onClose={() => setDeleting(null)} busy={remove.isPending}
                title="Delete this live stream?"
                description={<>&quot;{deleting?.title}&quot; will be removed for everyone.</>}
                onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { setDeleting(null); if (viewingId === deleting.id) setViewingId(null); } })}
            />
            <DeletePopup
                open={!!deletingType} onClose={() => setDeletingType(null)} busy={removeType.isPending}
                title={`Delete "${deletingType?.name ?? ""}"?`}
                description={deletingType?.stream_count
                    ? `Its ${deletingType.stream_count} live stream${deletingType.stream_count === 1 ? "" : "s"} will be deleted too.`
                    : "This category has no live streams."}
                onConfirm={() => deletingType && removeType.mutate(deletingType.id, { onSuccess: () => setDeletingType(null) })}
            />
        </>
    );

    if (viewing) {
        return (
            <>
                <StreamView
                    eventId={event.id} stream={viewing} whenText={when(viewing)} canEdit={canEdit} busy={setStatus.isPending}
                    onBack={() => setViewingId(null)} onShare={() => setSharing(viewing)} onEdit={() => setEditing(viewing)}
                    onStatus={(status) => setStatus.mutate({ id: viewing.id, status })}
                />
                {sheets}
            </>
        );
    }

    const groups = [
        ...types.map((t) => ({ type: t as LiveStreamType | null, items: shown.filter((s) => s.type_id === t.id) })),
        { type: null, items: shown.filter((s) => !types.some((t) => t.id === s.type_id)) },
    ].filter((g) => g.items.length > 0 || (g.type && !narrowed));

    return (
        <div className="flex flex-col gap-4">
            <ModuleHeader title="Live Streaming" subtitle="Manage your event live streams, organize by categories, and share with your guests." />
            <OverviewCard>
                <StatTile icon={PlayCircle} value={counts.total} label="Total Streams" active={filter === "all"} onClick={() => setFilter("all")} />
                <StatTile icon={Radio} value={counts.live} label="Active" tone="success" active={filter === "live"} onClick={() => setFilter("live")} />
                <StatTile icon={CalendarClock} value={counts.scheduled} label="Scheduled" tone="amber" active={filter === "scheduled"} onClick={() => setFilter("scheduled")} />
                <StatTile icon={CheckCircle2} value={counts.ended} label="Ended" tone="violet" active={filter === "ended"} onClick={() => setFilter("ended")} />
            </OverviewCard>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[15.5px] font-bold">Live Streams by Category</h4>
                <div className="flex flex-wrap items-center gap-2">
                    <SearchBox value={search} onChange={setSearch} placeholder="Search live streams..." className="min-w-[180px] sm:w-[220px] sm:flex-none" />
                    {canEdit && (
                        <>
                            <Button size="sm" variant="outline" className="h-9 gap-1.5 border-primary/40 text-primary hover:text-primary" onClick={() => setEditingType("new")}><FolderPlus className="size-4" /> Create Category</Button>
                            <Button size="sm" className="h-9 gap-1.5" onClick={() => addStream()}><Plus className="size-4" /> Create Live Stream</Button>
                        </>
                    )}
                </div>
            </div>

            {types.length === 0 && streams.length === 0 ? (
                <Section title="Live Streams">
                    <Empty title="No live streams yet">
                        Create a category (e.g. Wedding Ceremony), then create its live stream — YouTube, Facebook, Instagram, Zoom, Google Meet, Teams or an RTMP address.
                    </Empty>
                </Section>
            ) : groups.length === 0 ? (
                <Section title="Live Streams"><Empty title="No live streams match">Try another status or search.</Empty></Section>
            ) : groups.map((g) => {
                const id = g.type?.id ?? 0;
                const open = !closed.includes(id);
                return (
                    <div key={id} className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
                        <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-3 py-2">
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}
                                onClick={() => setClosed((c) => (open ? [...c, id] : c.filter((x) => x !== id)))}>
                                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", !open && "-rotate-90")} />
                                <Layers className="size-4 shrink-0 text-primary" />
                                <span className="truncate text-[13.5px] font-bold">{g.type?.name ?? "Other"}</span>
                                <span className="shrink-0 text-[12px] text-muted-foreground">({g.items.length} {g.items.length === 1 ? "Stream" : "Streams"})</span>
                                {g.type && !isTypeActive(g.type) && <StatusPill tone="muted">Inactive</StatusPill>}
                            </button>
                            {canEdit && g.type && (
                                <RowActions compact label="Category actions" items={[
                                    { label: "Create Stream Here", icon: Plus, onClick: () => addStream(g.type!.id), hidden: !isTypeActive(g.type) },
                                    {
                                        label: isTypeActive(g.type) ? "Turn Off Category" : "Turn On Category",
                                        icon: isTypeActive(g.type) ? CircleStop : CheckCircle2,
                                        onClick: () => saveType.mutate({ id: g.type!.id, data: { is_active: !isTypeActive(g.type) } }),
                                    },
                                    { label: "Edit Category", icon: Pencil, onClick: () => setEditingType(g.type) },
                                    { label: "Delete Category", icon: Trash2, onClick: () => setDeletingType(g.type), danger: true, divider: true },
                                ]} />
                            )}
                        </div>
                        {open && (g.items.length === 0 ? (
                            <p className="px-4 py-5 text-center text-[12px] text-muted-foreground">No live streams in this category yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[900px] text-left text-[12.5px]">
                                    <thead>
                                        <tr className="border-b border-border text-[11.5px] text-muted-foreground [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
                                            <th>Stream Title</th><th>Category</th><th>Platform</th><th>Visibility</th><th>Scheduled Date &amp; Time</th><th>Status</th><th>Viewers</th><th className="text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {g.items.map((s) => (
                                            <tr key={s.id} className={cn("border-b border-border/60 last:border-0 [&>td]:px-3 [&>td]:py-2", !s.is_enabled && "opacity-70")}>
                                                <td>
                                                    <div className="flex min-w-0 items-center gap-2.5">
                                                        <button type="button" onClick={() => setViewingId(s.id)} aria-label={`View ${s.title}`}><Thumb stream={s} className="h-10 w-[68px]" /></button>
                                                        <div className="min-w-0 max-w-[240px]">
                                                            <button type="button" onClick={() => setViewingId(s.id)} className="block max-w-full truncate text-left text-[12.5px] font-semibold hover:text-primary">{s.title}</button>
                                                            <p className="truncate text-[11px] text-muted-foreground">{s.description || platformOf(s.platform).label}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td><StatusPill tone="primary" className="rounded-md">{s.type_name ?? "—"}</StatusPill></td>
                                                <td><PlatformBadge platform={s.platform} /></td>
                                                <td>
                                                    <VisibilityLabel visibility={s.visibility} />
                                                    {!s.is_enabled && <span className="ml-1.5 text-[11px] text-muted-foreground">(hidden)</span>}
                                                </td>
                                                <td><span className="inline-flex items-center gap-1.5 whitespace-nowrap"><CalendarDays className="size-3.5 text-muted-foreground" /> {when(s)}</span></td>
                                                <td><StatusBadge status={s.status} /></td>
                                                <td>{s.views_count > 0 ? <span className="inline-flex items-center gap-1.5 tabular-nums"><Users className="size-3.5 text-muted-foreground" /> {s.views_count.toLocaleString()}</span> : "—"}</td>
                                                <td className="text-right"><RowActions compact label="Stream actions" items={menuFor(s)} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                );
            })}
            {sheets}
        </div>
    );
}

/* ── 2. Create / Edit Category ───────────────────────────────────────────── */

function CategorySheet({ eventId, types, type, onClose }: { eventId: number; types: LiveStreamType[]; type: LiveStreamType | null; onClose: () => void }) {
    const save = useSaveLiveType(eventId);
    const position = type ? types.findIndex((t) => t.id === type.id) + 1 : types.length + 1;
    const [name, setName] = useState(type?.name ?? "");
    const [description, setDescription] = useState(type?.description ?? "");
    const [order, setOrder] = useState(position);
    const [active, setActive] = useState(type ? isTypeActive(type) : true);
    const [visibility, setVisibility] = useState<LiveVisibility>(type?.default_visibility ?? "public");
    const [notes, setNotes] = useState(type?.notes ?? "");
    const [tried, setTried] = useState(false);

    const submit = () => {
        setTried(true);
        if (!name.trim()) return toast.error("Please enter the category name.");
        save.mutate({
            id: type?.id,
            data: {
                name: name.trim(), description: description.trim() || null, is_active: active, default_visibility: visibility,
                notes: notes.trim() || null, ...(order !== position || !type ? { display_order: order } : {}),
            },
        }, { onSuccess: onClose });
    };

    return (
        <ActionSheet
            open onClose={onClose} icon={FolderPlus} width={480}
            title={type ? "Edit Live Stream Category" : "Create Live Stream Category"}
            subtitle={type ? "Change how this category is shown and used." : "Add a new category to organize your live streams for this event."}
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={save.isPending} onClick={submit}>{save.isPending && <Loader2 className="size-3.5 animate-spin" />} Save Category</Button>
                </>
            )}
        >
            <FormField label="Category Name" required>
                <Input value={name} maxLength={100} placeholder="e.g. Reception Live" onChange={(e) => setName(e.target.value)} className={cn("h-9", tried && !name.trim() && "border-destructive")} />
            </FormField>
            <FormField label="Description">
                <Textarea value={description} maxLength={300} rows={3} placeholder="What this category covers" onChange={(e) => setDescription(e.target.value)} />
                <CharCount value={description} max={300} />
            </FormField>
            <FormField label="Display Order" required note="Position of this category in the list (e.g., 1, 2, 3…)">
                <div className="w-[140px]"><NumberStepper value={order} min={1} max={Math.max(1, type ? types.length : types.length + 1)} onChange={setOrder} /></div>
            </FormField>
            <div className="rounded-lg border border-border p-3">
                <SwitchField id="live-cat-active" label="Category Status" hint={active ? "Active (available for creating and assigning live streams)" : "Inactive (kept with its streams, not offered for new ones)"} checked={active} onChange={setActive} />
            </div>
            <FormField label="Default Visibility" note="Default visibility for new live streams under this category.">
                <VisibilitySelect value={visibility} onChange={setVisibility} label="Default Visibility" />
            </FormField>
            <FormField label="Notes">
                <Textarea value={notes} maxLength={500} rows={3} placeholder="Internal notes for organizers" onChange={(e) => setNotes(e.target.value)} />
                <CharCount value={notes} max={500} />
            </FormField>
        </ActionSheet>
    );
}

/* ── 3 + 4. Create Live Stream → Review & Create ─────────────────────────── */

/** 3B: the six visibility choices, each with its one-line meaning. */
function VisibilitySelect({ value, onChange, label }: { value: LiveVisibility; onChange: (v: LiveVisibility) => void; label: string }) {
    const cur = visibilityOf(value);
    const CurIcon = VISIBILITY_ICON[cur.key];
    return (
        <Select value={value} onValueChange={(v) => onChange(v as LiveVisibility)}>
            <SelectTrigger className="h-9 w-full text-[13px]" aria-label={label}>
                <SelectValue><span className="flex items-center gap-2"><CurIcon className="size-4 text-muted-foreground" /> {cur.label}</span></SelectValue>
            </SelectTrigger>
            <SelectContent>
                {LIVE_VISIBILITIES.map((v) => {
                    const I = VISIBILITY_ICON[v.key];
                    return (
                        <SelectItem key={v.key} value={v.key} textValue={v.label}>
                            <span className="flex items-start gap-2.5 py-0.5">
                                <I className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                <span><span className="block text-[13px] font-semibold">{v.label}</span><span className="block text-[11px] text-muted-foreground">{v.hint}</span></span>
                            </span>
                        </SelectItem>
                    );
                })}
            </SelectContent>
        </Select>
    );
}

function StreamSheet({
    eventId, eventName, types, stream, defaultTypeId, minDate, maxDate, dateText, onClose,
}: {
    eventId: number; eventName: string; types: LiveStreamType[]; stream: LiveStream | null; defaultTypeId?: number;
    minDate: string | null; maxDate: string | null; dateText: (d: string) => string; onClose: () => void;
}) {
    const save = useSaveLiveStream(eventId);
    const offered = types.filter((t) => isTypeActive(t) || t.id === stream?.type_id);
    const firstType = offered.find((t) => t.id === defaultTypeId);
    const [step, setStep] = useState<"form" | "review">("form");
    const [typeId, setTypeId] = useState(String(stream?.type_id ?? firstType?.id ?? ""));
    const [title, setTitle] = useState(stream?.title ?? "");
    const [platform, setPlatform] = useState<LivePlatform | "">(stream?.platform ?? "");
    const [url, setUrl] = useState(stream?.stream_url ?? "");
    const [rtmp, setRtmp] = useState(stream?.rtmp_url ?? "");
    const [visibility, setVisibility] = useState<LiveVisibility>(stream?.visibility ?? firstType?.default_visibility ?? "public");
    const [date, setDate] = useState(stream?.stream_date ?? minDate ?? "");
    const [time, setTime] = useState(stream?.stream_time?.slice(0, 5) ?? "");
    const [endTime, setEndTime] = useState(stream?.end_time?.slice(0, 5) ?? "");
    const [description, setDescription] = useState(stream?.description ?? "");
    const [notes, setNotes] = useState(stream?.notes ?? "");
    const [cover, setCover] = useState<string | null>(stream?.cover_image ?? null);
    const [status, setStatusValue] = useState<LiveStatus>(stream?.set_status ?? "scheduled");
    const [auto, setAuto] = useState(stream?.auto_go_live ?? true);
    const [notify, setNotify] = useState(stream?.notify_participants ?? true);
    const [shown, setShown] = useState(stream?.is_enabled ?? true);
    const [tried, setTried] = useState(false);

    const type = types.find((t) => String(t.id) === typeId) ?? null;
    const pickType = (v: string) => {
        setTypeId(v);
        // A new stream starts with its category's default visibility.
        const t = types.find((x) => String(x.id) === v);
        if (!stream && t) setVisibility(t.default_visibility);
    };
    const bad = (v: string) => tried && !v.trim();

    const review = () => {
        setTried(true);
        if (!typeId || !title.trim() || !platform || !url.trim() || !date || !time || !endTime) return toast.error("Please fill all mandatory fields.");
        if (!STREAM_LINK.test(url.trim())) return toast.error("Please enter a valid link starting with http://, https:// or rtmp://.");
        if (rtmp.trim() && !/^rtmps?:\/\/\S+$/i.test(rtmp.trim())) return toast.error("The RTMP address must start with rtmp:// or rtmps://.");
        setStep("review");
    };
    const submit = () => save.mutate({
        id: stream?.id,
        data: {
            type_id: Number(typeId), title: title.trim(), platform, stream_url: url.trim(), rtmp_url: rtmp.trim() || null, visibility,
            stream_date: date, stream_time: time, end_time: endTime, description: description.trim() || null, notes: notes.trim() || null,
            cover_image: cover, status, auto_go_live: auto, notify_participants: notify, is_enabled: shown,
        },
    }, { onSuccess: onClose });

    const statusNote = status === "live" ? "The stream is marked Live as soon as you save."
        : status === "ended" ? "The stream is marked Ended." : auto ? "The stream will be created in Scheduled status and will go live at the selected start time."
            : "The stream stays Scheduled until you choose Go Live.";
    const doneLabel = stream ? "Save Changes" : status === "live" ? "Create Live Stream" : "Schedule Stream";

    return (
        <ActionSheet
            open onClose={onClose} icon={Radio} width={560}
            title={step === "review" ? "Review Live Stream Details" : stream ? "Edit Live Stream" : "Create Live Stream"}
            subtitle={step === "review" ? "Please review the details below before saving your live stream." : stream ? `Update this live stream of ${eventName}.` : `Add a new live stream for ${eventName}.`}
            footer={step === "form" ? (
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={review}>Review &amp; {stream ? "Save" : "Create"}</Button>
                </>
            ) : (
                <>
                    <Button variant="outline" disabled={save.isPending} onClick={() => setStep("form")}><ArrowLeft className="size-3.5" /> Back</Button>
                    <Button disabled={save.isPending} onClick={submit}>{save.isPending && <Loader2 className="size-3.5 animate-spin" />} {doneLabel}</Button>
                </>
            )}
        >
            {step === "form" ? (
                <>
                    <FormField label="Stream Title" required>
                        <Input value={title} maxLength={100} placeholder="e.g., Main Wedding Ceremony" onChange={(e) => setTitle(e.target.value)} className={cn("h-9", bad(title) && "border-destructive")} />
                    </FormField>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <FormField label="Stream Category" required>
                            <Select value={typeId} onValueChange={pickType}>
                                <SelectTrigger aria-label="Stream Category" className={cn("h-9 w-full text-[13px]", tried && !typeId && "border-destructive")}><SelectValue placeholder="Select stream category" /></SelectTrigger>
                                <SelectContent>{offered.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </FormField>
                        <FormField label="Streaming Platform" required>
                            <Select value={platform} onValueChange={(v) => setPlatform(v as LivePlatform)}>
                                <SelectTrigger aria-label="Streaming Platform" className={cn("h-9 w-full text-[13px]", tried && !platform && "border-destructive")}><SelectValue placeholder="Select platform" /></SelectTrigger>
                                <SelectContent>
                                    {LIVE_PLATFORMS.map((p) => (
                                        <SelectItem key={p.key} value={p.key}><span className="flex items-center gap-2"><PlatformIcon platform={p.key} /> {p.label}</span></SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormField>
                    </div>
                    <FormField label="Stream URL / RTMP" required>
                        <div className="relative">
                            <Link2 className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input value={url} maxLength={500} placeholder="e.g., https://youtube.com/live/abc123 or rtmp://a.rtmp.youtube.com/live2/xyz"
                                onChange={(e) => setUrl(e.target.value)} className={cn("h-9 pl-8", bad(url) && "border-destructive")} />
                        </div>
                    </FormField>
                    <FormField label="RTMP Address (Encoder)" hint=" (Optional)" note="For your streaming software only. Never shown to participants.">
                        <Input value={rtmp} maxLength={500} placeholder="rtmp://a.rtmp.youtube.com/live2" onChange={(e) => setRtmp(e.target.value)} className="h-9" />
                    </FormField>
                    <FormField label="Visibility" required>
                        <VisibilitySelect value={visibility} onChange={setVisibility} label="Visibility" />
                    </FormField>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <FormField label="Scheduled Date" required>
                            <Input type="date" value={date} max={maxDate ?? undefined} onChange={(e) => setDate(e.target.value)} className={cn("h-9", bad(date) && "border-destructive")} />
                        </FormField>
                        <FormField label="Start Time" required>
                            <Input type="time" aria-label="Start Time" value={time} onChange={(e) => setTime(e.target.value)} className={cn("h-9", bad(time) && "border-destructive")} />
                        </FormField>
                        <FormField label="End Time" required>
                            <Input type="time" aria-label="End Time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={cn("h-9", bad(endTime) && "border-destructive")} />
                        </FormField>
                    </div>
                    <FormField label="Thumbnail" hint=" (Optional)">
                        <PhotoDropzone value={cover} onChange={setCover} maxMb={5} aspect={16 / 9} outputSize={1280} recommend="Recommended: 1280 × 720 (16:9)." uploader={(f) => uploadLiveCover(eventId, f)} />
                    </FormField>
                    <FormField label="Description">
                        <Textarea value={description} maxLength={500} rows={3} placeholder="Add a short description for this live stream..." onChange={(e) => setDescription(e.target.value)} />
                        <CharCount value={description} max={500} />
                    </FormField>
                    <FormField label="Organizer Notes" hint=" (Optional)">
                        <Textarea value={notes} maxLength={500} rows={2} placeholder="Internal notes. Participants never see these." onChange={(e) => setNotes(e.target.value)} />
                    </FormField>
                    <FormField label="Status" required>
                        <div className="grid items-center gap-3 sm:grid-cols-[200px_1fr]">
                            <Select value={status} onValueChange={(v) => setStatusValue(v as LiveStatus)}>
                                <SelectTrigger aria-label="Status" className="h-9 w-full text-[13px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="scheduled">Scheduled</SelectItem>
                                    <SelectItem value="live">{stream ? "Live" : "Go Live Now"}</SelectItem>
                                    {stream && <SelectItem value="ended">Ended</SelectItem>}
                                </SelectContent>
                            </Select>
                            <p className="text-[11.5px] text-muted-foreground">{statusNote}</p>
                        </div>
                    </FormField>
                </>
            ) : (
                <>
                    <DetailSection>
                        <ReviewRow icon={Type} label="Stream Title"><span className="font-bold">{title}</span></ReviewRow>
                        <ReviewRow icon={Tag} label="Category"><StatusPill tone="primary" className="rounded-md">{type?.name ?? "—"}</StatusPill></ReviewRow>
                        <ReviewRow icon={PlayCircle} label="Platform"><span className="inline-flex items-center gap-1.5"><PlatformIcon platform={platform} /> {platformOf(platform).label}</span></ReviewRow>
                        <ReviewRow icon={Users} label="Visibility"><VisibilityLabel visibility={visibility} /></ReviewRow>
                        <ReviewRow icon={CalendarDays} label="Scheduled Date">{dateText(date)}</ReviewRow>
                        <ReviewRow icon={Clock} label="Start Time">{timeLabel(time)}</ReviewRow>
                        <ReviewRow icon={Clock} label="End Time">{timeLabel(endTime)}</ReviewRow>
                        <ReviewRow icon={Link2} label="Stream Link / RTMP">
                            <span className="block max-w-[300px] truncate text-primary" title={url}>{url}</span>
                            {rtmp.trim() && <span className="block max-w-[300px] truncate text-[11.5px] text-muted-foreground" title={rtmp}>RTMP (Encoder): {rtmp}</span>}
                        </ReviewRow>
                        <ReviewRow icon={Radio} label="Status"><StatusBadge status={status} /></ReviewRow>
                        {description.trim() && <ReviewRow icon={FileText} label="Description"><span className="whitespace-pre-line">{description}</span></ReviewRow>}
                        {notes.trim() && <ReviewRow icon={FileText} label="Organizer Notes"><span className="whitespace-pre-line">{notes}</span></ReviewRow>}
                    </DetailSection>
                    {cover && (
                        <div>
                            <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold"><ImageIcon className="size-3.5 text-muted-foreground" /> Thumbnail</p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mediaUrl(cover)} alt="" className="aspect-video w-full max-w-[280px] rounded-lg border border-border object-cover" />
                        </div>
                    )}
                    <div className="rounded-lg border border-border">
                        <p className="flex items-center gap-2 border-b border-border bg-primary/5 px-3 py-2 text-[13px] font-bold"><Layers className="size-4 text-primary" /> Publishing Options</p>
                        <div className="flex flex-col gap-3 p-3">
                            <SwitchField id="live-auto" icon={Radio} label="Go Live Automatically" hint="Automatically start the stream at the scheduled time." checked={auto} onChange={setAuto} />
                            <SwitchField id="live-notify" icon={Info} label="Notify Participants" hint="Send an in-app notification to the event's participants." checked={notify} onChange={setNotify} />
                            <SwitchField id="live-shown" icon={Link2} label="Show Stream in Event Page" hint="Display the live stream in the event app for eligible participants." checked={shown} onChange={setShown} />
                        </div>
                    </div>
                    {visibility === "private" && <Notice tone="warning">Private: only organizers see this stream. Participants are not notified.</Notice>}
                </>
            )}
        </ActionSheet>
    );
}

function ReviewRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[150px_1fr] items-start gap-3 py-2 text-[12.5px]">
            <span className="flex items-center gap-2 text-muted-foreground"><Icon className="size-3.5 shrink-0" /> {label}</span>
            <span className="min-w-0 break-words font-medium">{children}</span>
        </div>
    );
}

/* ── 5. View Live Stream ─────────────────────────────────────────────────── */

function StreamView({
    eventId, stream, whenText, canEdit, busy, onBack, onShare, onEdit, onStatus,
}: {
    eventId: number; stream: LiveStream; whenText: string; canEdit: boolean; busy: boolean;
    onBack: () => void; onShare: () => void; onEdit: () => void; onStatus: (s: LiveStatus) => void;
}) {
    const one = useLiveStream(eventId, stream.id);
    const stats = one.data?.stats ?? { total_views: stream.views_count, unique_viewers: 0 };
    const embed = embedUrl(stream);
    const web = isWebLink(stream.stream_url);
    const qrId = `live-view-qr-${stream.id}`;

    return (
        <div className="flex flex-col gap-4">
            <ModuleHeader title="View Live Stream" subtitle="Watch and manage your live stream, and see how many participants opened it." />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <Button size="icon" variant="outline" className="size-9 shrink-0" aria-label="Back to live streams" onClick={onBack}><ArrowLeft className="size-4" /></Button>
                    <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[16px] leading-tight font-bold"><span className="break-words">{stream.title}</span> <StatusBadge status={stream.status} /></p>
                        {stream.description && <p className="truncate text-[12px] text-muted-foreground">{stream.description}</p>}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={onShare}><Share2 className="size-4" /> Share Link</Button>
                    <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => downloadQr(qrId, `live-stream-${stream.id}-qr`)}><QrCode className="size-4" /> Download QR</Button>
                    {canEdit && <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={onEdit}><Pencil className="size-4" /> Edit Stream</Button>}
                    {canEdit && (stream.status === "live"
                        ? <Button size="sm" className="h-9 gap-1.5" disabled={busy} onClick={() => onStatus("ended")}><CircleStop className="size-4" /> End Stream</Button>
                        : <Button size="sm" className="h-9 gap-1.5" disabled={busy} onClick={() => onStatus("live")}><Radio className="size-4" /> Go Live</Button>)}
                </div>
            </div>
            <div id={qrId} className="hidden"><QRCodeSVG value={stream.stream_url} size={170} /></div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="flex min-w-0 flex-col gap-4">
                    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
                        {embed ? (
                            <iframe src={embed} title={stream.title} className="size-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
                        ) : (
                            <>
                                {stream.cover_image
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={mediaUrl(stream.cover_image)} alt="" className="size-full object-cover opacity-80" />
                                    : <div className="grid size-full place-items-center bg-muted"><PlatformIcon platform={stream.platform} className="!size-[44px]" /></div>}
                                <div className="absolute inset-0 grid place-items-center bg-black/30">
                                    {web ? (
                                        <Button asChild size="lg" className="gap-2"><a href={stream.stream_url} target="_blank" rel="noreferrer"><Play className="size-4 fill-current" /> Open on {platformOf(stream.platform).short}</a></Button>
                                    ) : (
                                        <p className="rounded-md bg-black/70 px-3 py-2 text-center text-[12.5px] text-white">RTMP address — play it in your streaming software.</p>
                                    )}
                                </div>
                            </>
                        )}
                        {stream.status === "live" && !embed && <span className="absolute top-2 left-2 flex items-center gap-1 rounded bg-destructive px-2 py-0.5 text-[11px] font-bold text-white"><Radio className="size-3" /> LIVE</span>}
                    </div>

                    <div className="overflow-hidden rounded-lg border border-border bg-card">
                        <p className="flex items-center gap-2 border-b border-border bg-primary/5 px-4 py-2.5 text-[13.5px] font-bold"><Users className="size-4 text-primary" /> Viewer Statistics</p>
                        <div className="grid grid-cols-2 gap-3 p-4">
                            <div className="rounded-lg bg-primary/5 px-4 py-3">
                                <p className="flex items-center gap-2 text-[22px] leading-7 font-bold tabular-nums"><Eye className="size-5 text-primary" /> {stats.total_views.toLocaleString()}</p>
                                <p className="text-[12px] text-muted-foreground">Total Views</p>
                            </div>
                            <div className="rounded-lg bg-primary/5 px-4 py-3">
                                <p className="flex items-center gap-2 text-[22px] leading-7 font-bold tabular-nums"><UserCheck className="size-5 text-primary" /> {stats.unique_viewers.toLocaleString()}</p>
                                <p className="text-[12px] text-muted-foreground">Unique Viewers</p>
                            </div>
                        </div>
                        <p className="border-t border-border px-4 py-2 text-[11.5px] text-muted-foreground">Counted each time a participant opens this stream in the event app.</p>
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                    <DetailSection title="Stream Information" icon={Info}>
                        <DetailRow label="Category"><StatusPill tone="primary" className="rounded-md">{stream.type_name ?? "—"}</StatusPill></DetailRow>
                        <DetailRow label="Platform"><PlatformBadge platform={stream.platform} /></DetailRow>
                        <DetailRow label="Visibility"><VisibilityLabel visibility={stream.visibility} /></DetailRow>
                        <DetailRow label="Start Time">{whenText}</DetailRow>
                        <DetailRow label="End Time">{timeLabel(stream.end_time) || "—"}</DetailRow>
                        <DetailRow label="Host / Source">{platformOf(stream.platform).label}</DetailRow>
                        <DetailRow label="Shown in Event App">{stream.is_enabled ? "Yes" : "No (hidden)"}</DetailRow>
                    </DetailSection>
                    <div className="rounded-lg border border-border bg-card p-4">
                        <p className="mb-2 flex items-center gap-2 text-[14px] font-bold"><Link2 className="size-4 text-primary" /> Stream Link</p>
                        <LinkBox value={stream.stream_url} label="Stream link" openable={web} />
                        {stream.rtmp_url && <><p className="mt-3 mb-1 text-[11.5px] font-semibold text-muted-foreground">RTMP (Encoder)</p><LinkBox value={stream.rtmp_url} label="RTMP address" /></>}
                    </div>
                    {stream.notes && (
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="mb-1 flex items-center gap-2 text-[14px] font-bold"><FileText className="size-4 text-primary" /> Organizer Notes</p>
                            <p className="whitespace-pre-line break-words text-[12.5px] text-foreground/85">{stream.notes}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function LinkBox({ value, label, openable }: { value: string; label: string; openable?: boolean }) {
    return (
        <div className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-primary" title={value}>{value}</span>
            <Button size="icon" variant="ghost" className="size-7" aria-label={`Copy ${label}`} onClick={() => copy(value, `${label} copied`)}><Copy className="size-3.5" /></Button>
            {openable && <Button asChild size="icon" variant="ghost" className="size-7"><a href={value} target="_blank" rel="noreferrer" aria-label={`Open ${label}`}><ExternalLink className="size-3.5" /></a></Button>}
        </div>
    );
}

/* ── 6. Share Stream ─────────────────────────────────────────────────────── */

function ShareSheet({ stream, eventName, whenText, canEdit, onClose }: { stream: LiveStream; eventName: string; whenText: string; canEdit: boolean; onClose: () => void }) {
    const share = useShareLiveStream();
    const qrId = `live-share-qr-${stream.id}`;
    const v = visibilityOf(stream.visibility);
    const VIcon = VISIBILITY_ICON[v.key];
    const text = `Watch "${stream.title}" live (${eventName})\n${whenText}\n${stream.stream_url}`;

    const row = (Icon: LucideIcon | null, title: string, sub: string, onClick: () => void, opts: { fa?: boolean; disabled?: boolean } = {}) => (
        <button type="button" onClick={onClick} disabled={opts.disabled}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/[0.03] disabled:opacity-50">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                {opts.fa ? <FontAwesomeIcon icon={faWhatsapp} className="!size-[17px] text-success" /> : Icon && <Icon className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{title}</span>
                <span className="block text-[11.5px] text-muted-foreground">{sub}</span>
            </span>
            {opts.disabled && share.isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <ChevronDown className="size-4 -rotate-90 text-muted-foreground" />}
        </button>
    );

    return (
        <ActionSheet open onClose={onClose} icon={Share2} width={480} title="Share Stream" subtitle="Share the live stream link or QR code with your guests.">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-primary/[0.03] p-2.5">
                <Thumb stream={stream} className="h-14 w-24" />
                <div className="min-w-0">
                    <p className="text-[11.5px] text-muted-foreground">Stream Title</p>
                    <p className="break-words text-[14px] font-bold">{stream.title}</p>
                </div>
            </div>
            <Notice tone={stream.visibility === "private" ? "warning" : "success"} icon={VIcon} title={`Visibility: ${v.label}`}>{v.hint}.</Notice>
            <FormField label="Stream Link">
                <div className="flex gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border px-2.5 text-[12.5px]">
                        <Link2 className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate" title={stream.stream_url}>{stream.stream_url}</span>
                    </div>
                    <Button variant="outline" className="h-9 shrink-0 gap-1.5 border-primary/40 text-primary hover:text-primary" onClick={() => copy(stream.stream_url)}><Copy className="size-3.5" /> Copy</Button>
                </div>
            </FormField>
            <div className="flex items-center gap-4 rounded-lg border border-primary/15 bg-primary/5 p-3">
                <div id={qrId} className="shrink-0 rounded-lg border border-border bg-white p-2"><QRCodeSVG value={stream.stream_url} size={132} /></div>
                <div>
                    <p className="text-[14px] font-bold">Scan to Watch</p>
                    <p className="text-[12px] text-muted-foreground">Guests can scan this QR code with their phone camera to join the live stream.</p>
                </div>
            </div>
            <p className="text-[13.5px] font-bold">Share Stream</p>
            <div className="grid gap-2">
                {row(ClipboardCopy, "Copy Link", "Copy the stream link to share anywhere", () => copy(stream.stream_url))}
                {row(Download, "Download QR", "Save the QR code as an image (PNG)", () => downloadQr(qrId, `live-stream-${stream.id}-qr`))}
                {row(null, "Share via WhatsApp", "Open WhatsApp and send the stream link", () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank"), { fa: true })}
                {row(Mail, "Share via Email", "Share the stream link with guests via email",
                    () => window.open(`mailto:?subject=${encodeURIComponent(`Live: ${stream.title}`)}&body=${encodeURIComponent(text)}`, "_self"))}
                {canEdit && row(Users, "Share to Participants", "Send an in-app notification to all event participants", () => share.mutate(stream.id), { disabled: share.isPending })}
            </div>
        </ActionSheet>
    );
}
