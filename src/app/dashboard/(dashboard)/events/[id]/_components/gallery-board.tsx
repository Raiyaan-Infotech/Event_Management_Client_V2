"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, CheckSquare, ChevronDown, ChevronRight, Clock, CloudUpload, Copy, Download, Eye,
    EyeOff, Film, Folder, FolderInput, FolderPlus, GripVertical, Image as ImageIcon, Images, Info, LayoutGrid, Link2, List, Lock, Monitor,
    MoreVertical, Music, Pause, Pencil, Play, RotateCcw, Save, Scissors, Search, Settings2, Square, Trash2, Upload, User, Video, VolumeX, X, Zap,
    type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ActionSheet, CharCount, CountTabs, FormField, ModuleHeader, Notice, NumberStepper, Pager, PhotoDropzone,
    SearchBox, SortSelect, StatTile, StatusPill,
} from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import { useDateFormatter } from "@/hooks/use-client-settings";
import { useClientProfile } from "@/hooks/use-client-portal";
import {
    useDeleteGalleryCategories, useDeleteGalleryCategory, useEventGallery, useGalleryBulk, useSaveGalleryCategory, useUpdateGalleryItem,
    useUploadGalleryCover, useUploadGalleryItem, useUploadShort, type GalleryCategory, type GalleryFolderType, type GalleryItem,
} from "@/hooks/use-event-modules";
import { EditMediaDialog, MediaViewer, ShortDialog } from "./gallery-panel";
import { AlbumBuilder, AlbumCards } from "./album-builder";
import { VideoEditor } from "./video-editor";
import { MusicSection, TrimTimeline, clampTrim, t0, useClipPlayer, type LoadedMusic, type Trim } from "./media-edit-parts";
import { VIDEO_EDITOR_ENABLED } from "@/lib/features";
import { useGalleryAlbums, type GalleryAlbum } from "@/hooks/use-gallery-albums";

/**
 * Gallery — Jamal's web design (2026-11-04), phase 1, from the module kit:
 *   · Gallery Overview: Create Folder / Upload Media / Create Album (phase 2),
 *     tiles Images / Videos / Shorts / Folders / Albums + Storage Usage, drop
 *     zone, folder cards (stacked cover, counts per kind, ⋮), Recent Uploads;
 *   · a folder: All / Images / Videos / Shorts, search, sort, grid / list,
 *     multi-select + Bulk Actions (Move / Copy to Folder, Download, Delete), and
 *     a details panel (Details / Actions) for the picked file;
 *   · Upload Media: folder, Images / Videos / Shorts, queue (status, retry,
 *     remove), Upload Media (n); Shorts use the trim + music Upload Short;
 *   · Create / Edit Folder (type, cover, order, notes) and Move / Copy Files.
 * Create Album = album-builder.tsx. Not yet: the Edit Video text editor.
 */

type View = { kind: "overview" } | { kind: "folder"; id: number | null } | { kind: "upload"; folderId?: number; files?: File[] } | { kind: "album"; album: GalleryAlbum | null }
    // Edit Video / Shorts — only reachable when VIDEO_EDITOR_ENABLED (off until a paid server).
    | { kind: "edit"; item: GalleryItem; back: number | null };
type Kind = "image" | "video" | "short";
const kindOf = (i: GalleryItem): Kind => (i.type === "image" ? "image" : i.is_short ? "short" : "video");
const KIND_META: Record<Kind, { label: string; icon: LucideIcon; tone: "primary" | "violet" | "warning" }> = {
    image: { label: "Image", icon: ImageIcon, tone: "primary" },
    video: { label: "Video", icon: Video, tone: "violet" },
    short: { label: "Short", icon: Zap, tone: "warning" },
};
const FOLDER_TYPES: { value: GalleryFolderType; label: string; hint: string; icon: LucideIcon }[] = [
    { value: "images", label: "Images", hint: "Photos only", icon: ImageIcon },
    { value: "videos", label: "Videos", hint: "Videos only", icon: Video },
    { value: "shorts", label: "Shorts", hint: "Short videos (≤ 60 sec)", icon: Zap },
    { value: "mixed", label: "Mixed", hint: "Images, videos and shorts", icon: Images },
];
const takes = (t: GalleryFolderType | undefined, k: Kind) => !t || t === "mixed" || (t === "images" && k === "image") || (t === "videos" && k === "video") || (t === "shorts" && k === "short");
export const bytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const secs = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
const thumbOf = (i: GalleryItem) => mediaUrl(i.thumbnail_url || (i.type === "image" ? i.url : "")) || "";

export function GalleryBoard({ eventId }: { eventId: number }) {
    const [view, setView] = useState<View>({ kind: "overview" });
    const [folderSheet, setFolderSheet] = useState<GalleryCategory | "new" | null>(null);
    // Upload Media "Save as Draft": the queue kept while this page is open (files cannot outlive a reload).
    const [draft, setDraft] = useState<{ folderId: number; queue: Queued[] } | null>(null);
    const query = useEventGallery(eventId);
    const albumsQuery = useGalleryAlbums(eventId);
    const albums = albumsQuery.data?.albums ?? [];
    const items = useMemo(() => query.data?.items ?? [], [query.data]);
    const folders = useMemo(() => query.data?.categories ?? [], [query.data]);

    if (query.isLoading) return <div className="flex flex-col gap-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /></div>;
    if (query.isError || !query.data) return <p className="py-10 text-center text-[13px] text-muted-foreground">Could not load the gallery. Please try again.</p>;

    return (
        <>
            {view.kind === "overview" && (
                <Overview eventId={eventId} items={items} folders={folders} usage={query.data.usage} albums={albums}
                    onOpen={(id) => setView({ kind: "folder", id })} onUpload={(files, folderId) => setView({ kind: "upload", files, folderId })}
                    onFolder={setFolderSheet} onAlbum={(album) => setView({ kind: "album", album })} />
            )}
            {view.kind === "folder" && (
                <FolderView eventId={eventId} items={items} folders={folders} folderId={view.id}
                    onBack={() => setView({ kind: "overview" })} onUpload={(folderId) => setView({ kind: "upload", folderId })}
                    onFolder={setFolderSheet} onOpen={(id) => setView({ kind: "folder", id })}
                    onEditVideo={VIDEO_EDITOR_ENABLED ? (item) => setView({ kind: "edit", item, back: view.id }) : undefined} />
            )}
            {VIDEO_EDITOR_ENABLED && view.kind === "edit" && (
                <VideoEditor eventId={eventId} item={view.item} folderName={folders.find((f) => f.id === view.item.category_id)?.name ?? "Gallery"}
                    onBack={() => setView({ kind: "folder", id: view.back })} onDone={() => setView({ kind: "folder", id: view.back })} />
            )}
            {view.kind === "album" && (
                <AlbumBuilder key={view.album?.id ?? "new"} eventId={eventId} album={view.album} folders={folders}
                    images={items.filter((i) => i.type === "image")} onBack={() => setView({ kind: "overview" })} />
            )}
            {view.kind === "upload" && (
                <UploadView eventId={eventId} folders={folders} initialFolder={view.folderId} initialFiles={view.files} draft={draft} onDraft={setDraft}
                    onGallery={(id) => setView(id === undefined ? { kind: "overview" } : { kind: "folder", id })} onNewFolder={() => setFolderSheet("new")} />
            )}
            {folderSheet && <FolderSheet eventId={eventId} folder={folderSheet === "new" ? null : folderSheet} count={folders.length} onClose={() => setFolderSheet(null)} />}
        </>
    );
}

/* ── Overview ───────────────────────────────────────────────────────────── */

function Overview({
    eventId, items, folders, usage, albums, onOpen, onUpload, onFolder, onAlbum,
}: {
    eventId: number; items: GalleryItem[]; folders: GalleryCategory[]; usage: NonNullable<ReturnType<typeof useEventGallery>["data"]>["usage"];
    onOpen: (id: number | null) => void; onUpload: (files?: File[], folderId?: number) => void; onFolder: (f: GalleryCategory | "new") => void;
    albums: GalleryAlbum[]; onAlbum: (a: GalleryAlbum | null) => void;
}) {
    const fmt = useDateFormatter();
    const remove = useDeleteGalleryCategory(eventId);
    const removeMany = useDeleteGalleryCategories(eventId);
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<"order" | "name" | "items" | "recent">("order");
    const [type, setType] = useState<GalleryFolderType | "all">("all");
    const [grid, setGrid] = useState(true);
    const [deleting, setDeleting] = useState<GalleryCategory | null>(null);
    // Select All + Bulk Actions on folders (design 00, 2026-11-06). The default folder cannot be selected (non-deletable).
    const [sel, setSel] = useState<number[]>([]);
    const [bulkDelete, setBulkDelete] = useState(false);
    const count = (k: Kind) => items.filter((i) => kindOf(i) === k).length;
    const lastUpload = (id: number) => items.filter((i) => i.category_id === id).reduce((m, i) => (String(i.created_at) > m ? String(i.created_at) : m), "");
    const q = search.trim().toLowerCase();
    const shown = folders
        .filter((f) => (!q || `${f.name} ${f.description ?? ""}`.toLowerCase().includes(q)) && (type === "all" || (f.folder_type ?? "mixed") === type))
        .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "items" ? b.item_count - a.item_count
            : sort === "recent" ? lastUpload(b.id).localeCompare(lastUpload(a.id)) : 0));
    const selectable = shown.filter((f) => !f.is_default);
    const allOn = selectable.length > 0 && selectable.every((f) => sel.includes(f.id));
    const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    const picked = folders.filter((f) => sel.includes(f.id));
    const recent = [...items].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const used = usage.storage.used_bytes ?? usage.storage.used_mb * 1024 * 1024;
    const limit = usage.storage.limit_bytes ?? (usage.storage.limit_mb !== null ? usage.storage.limit_mb * 1024 * 1024 : null);
    const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    return (
        <div className="flex flex-col gap-3">
            <ModuleHeader title="Gallery Overview" subtitle="Manage your event photos, videos, shorts and albums in organized folders."
                actions={(
                    <>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => onFolder("new")}><FolderPlus className="size-3.5" /> Create Folder</Button>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => onUpload()}><Upload className="size-3.5" /> Upload Media</Button>
                        <Button size="sm" className="h-8" onClick={() => onAlbum(null)}><Images className="size-3.5" /> Create Album</Button>
                    </>
                )} />

            <div className="grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-2.5">
                <StatTile icon={ImageIcon} value={count("image")} label="Images" tone="primary" />
                <StatTile icon={Video} value={count("video")} label="Videos" tone="violet" />
                <StatTile icon={Zap} value={count("short")} label="Shorts" tone="primary" />
                <StatTile icon={Folder} value={folders.length} label="Folders" tone="amber" />
                <StatTile icon={Images} value={albums.length} label="Albums" tone="violet" />
                <div className="col-span-2 flex flex-col justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2">
                    <p className="flex items-center justify-between text-[12px]">
                        <span className="flex items-center gap-1 font-semibold">Storage Usage <Info className="size-3 text-muted-foreground" /></span>
                        <span className="text-muted-foreground">{bytes(used)}{limit ? ` of ${bytes(limit)} (${pct}%)` : ""}</span>
                    </p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    <p className="text-[11px] text-muted-foreground">{limit ? `${bytes(Math.max(0, limit - used))} available` : "No storage limit on your plan"}</p>
                </div>
            </div>

            {/* Drag & drop upload box removed (Jamal, 2026-11-06) — Upload Media in the header does it. */}

            <div className="flex flex-wrap items-center gap-2">
                <label className={cn("flex h-8 items-center gap-2 rounded-md border border-border px-2.5 text-[12.5px]", selectable.length ? "cursor-pointer" : "opacity-50")}>
                    <Checkbox checked={allOn} disabled={!selectable.length} onCheckedChange={() => setSel(allOn ? [] : selectable.map((f) => f.id))} /> Select All
                </label>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8" disabled={!sel.length}>Bulk Actions{sel.length ? ` (${sel.length})` : ""} <ChevronDown className="size-3.5" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                        {picked.length === 1 && <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => onOpen(picked[0].id)}><Eye className="size-4" /> Open Folder</DropdownMenuItem>}
                        {picked.length === 1 && <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => onUpload(undefined, picked[0].id)}><Upload className="size-4" /> Upload Here</DropdownMenuItem>}
                        {picked.length === 1 && <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => onFolder(picked[0])}><Pencil className="size-4" /> Edit Folder</DropdownMenuItem>}
                        {picked.length === 1 && <DropdownMenuSeparator />}
                        <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setSel([])}><X className="size-4" /> Clear Selection</DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 text-[13px] text-destructive focus:text-destructive" onClick={() => setBulkDelete(true)}><Trash2 className="size-4" /> Delete Folders</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <SearchBox value={search} onChange={setSearch} placeholder="Search folders..." className="w-[240px]" />
                    <SortSelect value={sort} onChange={setSort} className="w-[190px]" options={[{ value: "order", label: "Sort: Display Order" }, { value: "recent", label: "Sort: Recent Activity" }, { value: "name", label: "Sort: Name" }, { value: "items", label: "Sort: Most Items" }]} />
                    <SortSelect<GalleryFolderType | "all"> value={type} onChange={setType} className="w-[150px]"
                        options={[{ value: "all", label: "Filter: All" }, ...FOLDER_TYPES.map((t) => ({ value: t.value, label: `Filter: ${t.label}` }))]} />
                    <GridToggle grid={grid} onChange={setGrid} />
                </div>
            </div>

            {shown.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-8 text-center text-[13px] text-muted-foreground">No folders match.</div>
            ) : grid ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {shown.map((f) => <FolderCard key={f.id} f={f} selected={sel.includes(f.id)} onSelect={f.is_default ? undefined : () => toggle(f.id)}
                        onOpen={() => onOpen(f.id)} onEdit={() => onFolder(f)} onUpload={() => onUpload(undefined, f.id)} onDelete={() => setDeleting(f)} />)}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full text-[12.5px]">
                        <thead><tr className="border-b border-border text-left text-[11.5px] text-foreground/80">
                            <th className="w-8 px-3 py-2" />
                            {["Folder", "Type", "Images", "Videos", "Shorts", "Total", ""].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
                        </tr></thead>
                        <tbody>{shown.map((f) => (
                            <tr key={f.id} className={cn("cursor-pointer border-b border-border last:border-0 hover:bg-muted/30", sel.includes(f.id) && "bg-primary/5")} onClick={() => onOpen(f.id)}>
                                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>{!f.is_default && <Checkbox checked={sel.includes(f.id)} onCheckedChange={() => toggle(f.id)} />}</td>
                                <td className="px-3 py-2 font-semibold">{f.name}{f.is_default && <StatusPill tone="primary" className="ml-2">Default</StatusPill>}</td>
                                <td className="px-3 py-2 capitalize">{f.folder_type ?? "mixed"}</td>
                                <td className="px-3 py-2">{f.counts?.images ?? 0}</td><td className="px-3 py-2">{f.counts?.videos ?? 0}</td>
                                <td className="px-3 py-2">{f.counts?.shorts ?? 0}</td><td className="px-3 py-2">{f.item_count}</td>
                                <td className="px-3 py-2 text-right"><ChevronRight className="ml-auto size-4 text-muted-foreground" /></td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}

            <AlbumCards eventId={eventId} albums={albums} onEdit={(a) => onAlbum(a)} />

            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Upload className="size-4" /></span>
                <div className="shrink-0"><p className="text-[13px] font-semibold">Recent Uploads</p><p className="text-[11px] text-muted-foreground">{recent[0]?.created_at ? `Last: ${fmt(recent[0].created_at)}` : "Nothing uploaded yet"}</p></div>
                <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
                    {recent.slice(0, 7).map((i) => <Thumb key={i.id} item={i} className="h-12 w-16 shrink-0 rounded-md" />)}
                    {recent.length > 7 && <span className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-foreground/80 text-[11px] font-semibold text-background">+{recent.length - 7}<br />more</span>}
                </div>
                <Button variant="link" size="sm" className="shrink-0 text-primary" onClick={() => onOpen(null)}>View All <ChevronRight className="size-3.5" /></Button>
            </div>

            <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Folder?</DialogTitle>
                        <DialogDescription>&ldquo;{deleting?.name}&rdquo; will be removed. Its {deleting?.item_count ?? 0} files move to Gallery — nothing is deleted.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { setSel((s) => s.filter((x) => x !== deleting.id)); setDeleting(null); } })}>Delete Folder</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={bulkDelete} onOpenChange={setBulkDelete}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete {picked.length} folder{picked.length === 1 ? "" : "s"}?</DialogTitle>
                        <DialogDescription>
                            {picked.map((f) => `“${f.name}”`).join(", ")} will be removed. Their {picked.reduce((n, f) => n + f.item_count, 0)} files move to Gallery — nothing is deleted.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkDelete(false)}>Cancel</Button>
                        <Button variant="destructive" disabled={removeMany.isPending} onClick={() => removeMany.mutate(sel, { onSettled: () => { setBulkDelete(false); setSel([]); } })}>Delete Folders</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function GridToggle({ grid, onChange }: { grid: boolean; onChange: (g: boolean) => void }) {
    return (
        <div className="flex overflow-hidden rounded-md border border-border">
            <button type="button" aria-label="Grid view" onClick={() => onChange(true)} className={cn("grid size-8 place-items-center", grid ? "bg-primary text-primary-foreground" : "hover:bg-muted")}><LayoutGrid className="size-4" /></button>
            <button type="button" aria-label="List view" onClick={() => onChange(false)} className={cn("grid size-8 place-items-center", !grid ? "bg-primary text-primary-foreground" : "hover:bg-muted")}><List className="size-4" /></button>
        </div>
    );
}

function Thumb({ item, className }: { item: GalleryItem; className?: string }) {
    const src = thumbOf(item);
    const k = kindOf(item);
    return (
        <span className={cn("relative block overflow-hidden bg-muted", className)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {src ? <img src={src} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-muted-foreground"><Film className="size-5" /></span>}
            {k !== "image" && <Play className="absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 fill-white/90 text-white/90 drop-shadow" />}
        </span>
    );
}

function FolderCard({ f, selected, onSelect, onOpen, onEdit, onUpload, onDelete }: {
    f: GalleryCategory; selected?: boolean; onSelect?: () => void; onOpen: () => void; onEdit: () => void; onUpload: () => void; onDelete: () => void;
}) {
    const c = f.counts ?? { images: 0, videos: 0, shorts: 0 };
    return (
        <div className={cn("flex gap-3 rounded-xl border bg-card p-3 transition hover:border-primary/40", selected ? "border-primary ring-1 ring-primary/30" : f.is_default ? "border-primary/30 bg-primary/[0.03]" : "border-border")}>
            {/* Checkbox (design 00). The default folder has none: it cannot be deleted. */}
            <span className="w-4 shrink-0 pt-0.5">{onSelect && <Checkbox checked={!!selected} onCheckedChange={onSelect} aria-label={`Select ${f.name}`} />}</span>
            <button type="button" onClick={onOpen} className="relative h-[78px] w-[92px] shrink-0">
                <span className="absolute inset-0 translate-x-1.5 -translate-y-1.5 rounded-lg border border-border bg-muted" />
                <span className="absolute inset-0 translate-x-0.5 -translate-y-0.5 rounded-lg border border-border bg-muted/70" />
                <span className="absolute inset-0 overflow-hidden rounded-lg border border-border bg-primary/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {f.cover_url ? <img src={mediaUrl(f.cover_url)} alt="" className="size-full object-cover" /> : <Folder className="m-auto mt-6 size-7 text-primary/60" />}
                </span>
            </button>
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={onOpen} className="min-w-0 text-left">
                        <p className="flex items-center gap-1.5 truncate text-[13.5px] font-bold">{f.name}{f.is_default && <StatusPill tone="primary" className="px-1.5 text-[10px]">Default</StatusPill>}</p>
                        {f.is_default
                            ? <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="size-3" /> Default folder (Non-deletable)</p>
                            : <p className="truncate text-[11px] text-muted-foreground capitalize">{f.folder_type && f.folder_type !== "mixed" ? `${f.folder_type} only` : f.description || "Images, videos and shorts"}</p>}
                    </button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label="Folder actions"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={onOpen} className="gap-2 text-[13px]"><Eye className="size-4" /> Open</DropdownMenuItem>
                            <DropdownMenuItem onClick={onUpload} className="gap-2 text-[13px]"><Upload className="size-4" /> Upload Here</DropdownMenuItem>
                            <DropdownMenuItem onClick={onEdit} className="gap-2 text-[13px]"><Pencil className="size-4" /> Edit Folder</DropdownMenuItem>
                            {!f.is_default && <><DropdownMenuSeparator /><DropdownMenuItem onClick={onDelete} className="gap-2 text-[13px] text-destructive focus:text-destructive"><Trash2 className="size-4" /> Delete Folder</DropdownMenuItem></>}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
                    {([[ImageIcon, c.images, "Images"], [Video, c.videos, "Videos"], [Zap, c.shorts, "Shorts"]] as const).map(([I, n, l]) => (
                        <span key={l} className="flex items-start gap-1"><I className="mt-0.5 size-3.5" /><span><b className="text-[12px] text-foreground">{n}</b><br />{l}</span></span>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ── A folder (or All Media) ────────────────────────────────────────────── */

const PAGE = 24;

function FolderView({
    eventId, items, folders, folderId, onBack, onUpload, onFolder, onOpen, onEditVideo,
}: {
    eventId: number; items: GalleryItem[]; folders: GalleryCategory[]; folderId: number | null;
    onBack: () => void; onUpload: (folderId?: number) => void; onFolder: (f: GalleryCategory) => void; onOpen: (id: number | null) => void;
    /** Set only when VIDEO_EDITOR_ENABLED — otherwise no "Edit Video" anywhere. */
    onEditVideo?: (item: GalleryItem) => void;
}) {
    const fmt = useDateFormatter();
    const bulk = useGalleryBulk(eventId);
    const me = useClientProfile().data;
    const [renaming, setRenaming] = useState<GalleryItem | null>(null);
    // "Uploaded By": every portal / app upload is the host's own account.
    const uploader = (i: GalleryItem) => (!i.uploaded_by ? "—" : i.uploaded_by === me?.id ? me?.name || "You" : "Event host");
    const folder = folderId === null ? null : folders.find((f) => f.id === folderId) ?? null;
    const [tab, setTab] = useState<"all" | Kind>("all");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<"new" | "old" | "name" | "size">("new");
    const [grid, setGrid] = useState(true);
    const [multi, setMulti] = useState(false);
    const [sel, setSel] = useState<number[]>([]);
    const [picked, setPicked] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [moving, setMoving] = useState<{ ids: number[]; copy: boolean } | null>(null);
    const [editing, setEditing] = useState<GalleryItem | null>(null);
    const [viewer, setViewer] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<number[] | null>(null);

    const inFolder = items.filter((i) => folderId === null || i.category_id === folderId);
    const count = (k: Kind) => inFolder.filter((i) => kindOf(i) === k).length;
    const shown = inFolder
        .filter((i) => (tab === "all" || kindOf(i) === tab) && (!search.trim() || `${i.file_name ?? ""} ${i.title ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())))
        .sort((a, b) => sort === "new" ? String(b.created_at).localeCompare(String(a.created_at))
            : sort === "old" ? String(a.created_at).localeCompare(String(b.created_at))
                : sort === "name" ? String(a.file_name ?? a.title).localeCompare(String(b.file_name ?? b.title)) : b.size_bytes - a.size_bytes);
    const current = Math.min(page, Math.max(1, Math.ceil(shown.length / PAGE)));
    const pageItems = shown.slice((current - 1) * PAGE, current * PAGE);
    const pick = items.find((i) => i.id === picked) ?? null;
    // Multi-select click (Jamal's design, 2026-11-06): tick the file AND show it in the details panel;
    // un-ticking the file on show moves the panel to the last ticked one (or closes it).
    const tap = (id: number) => {
        if (!multi) { setPicked(id); return; }
        const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
        setSel(next);
        setPicked(next.includes(id) ? id : picked === id ? next[next.length - 1] ?? null : picked);
    };
    const allOn = pageItems.length > 0 && pageItems.every((i) => sel.includes(i.id));
    const name = (i: GalleryItem) => i.title || i.file_name || `${KIND_META[kindOf(i)].label} #${i.id}`;
    const folderName = (id: number | null) => folders.find((f) => f.id === id)?.name ?? "Gallery";
    const download = (list: GalleryItem[]) => list.forEach((i) => { const a = document.createElement("a"); a.href = mediaUrl(i.url) ?? i.url; a.download = i.file_name || ""; a.target = "_blank"; a.click(); });

    const menu = (i: GalleryItem) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label="File actions" onClick={(e) => e.stopPropagation()}><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setViewer(shown.indexOf(i))}><Eye className="size-4" /> View Full Screen</DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setPicked(i.id)}><Info className="size-4" /> Details</DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setRenaming(i)}><Pencil className="size-4" /> Rename</DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setEditing(i)}><Settings2 className="size-4" /> Edit</DropdownMenuItem>
                {onEditVideo && i.type === "video" && <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => onEditVideo(i)}><Scissors className="size-4" /> Edit Video</DropdownMenuItem>}
                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setMoving({ ids: [i.id], copy: false })}><FolderInput className="size-4" /> Move to Folder</DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setMoving({ ids: [i.id], copy: true })}><Copy className="size-4" /> Copy to Folder</DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => download([i])}><Download className="size-4" /> Download</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-[13px] text-destructive focus:text-destructive" onClick={() => setDeleting([i.id])}><Trash2 className="size-4" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    const iconBtn = (I: LucideIcon, label: string, fn: () => void, danger?: boolean) => (
        <Button size="icon" variant="ghost" className={cn("size-7", danger && "text-destructive hover:text-destructive")} aria-label={label} title={label}
            onClick={(e) => { e.stopPropagation(); fn(); }}><I className="size-3.5" /></Button>
    );
    /** The file table — List View, and (compact) the preview under the grid. */
    const listTable = (rows: GalleryItem[], compact = false) => (
        <div className={cn("overflow-x-auto", !compact && "rounded-xl border border-border bg-card")}>
            <table className="w-full text-[12.5px]">
                <thead><tr className="border-b border-border text-left text-[11.5px] text-foreground/80">
                    {multi && <th className="w-8 px-3 py-2"><Checkbox checked={allOn} onCheckedChange={() => setSel(allOn ? [] : pageItems.map((i) => i.id))} /></th>}
                    {["Media", "File Name", "Type", "Size", "Duration", "Uploaded On", "Uploaded By"].map((h) => <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}
                    <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr></thead>
                <tbody>{rows.map((i) => {
                    const k = KIND_META[kindOf(i)];
                    return (
                        <tr key={i.id} className={cn("cursor-pointer border-b border-border last:border-0 hover:bg-muted/30", (picked === i.id || sel.includes(i.id)) && "bg-primary/5")} onClick={() => tap(i.id)}>
                            {multi && <td className="px-3 py-1.5"><Checkbox checked={sel.includes(i.id)} onCheckedChange={() => tap(i.id)} onClick={(e) => e.stopPropagation()} /></td>}
                            <td className="px-3 py-1.5"><Thumb item={i} className="h-9 w-12 rounded" /></td>
                            <td className="max-w-[220px] truncate px-3 py-1.5 font-medium" title={name(i)}>{name(i)}</td>
                            <td className="px-3 py-1.5"><StatusPill tone={k.tone} icon={k.icon}>{k.label}</StatusPill></td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{bytes(i.size_bytes)}</td>
                            <td className="px-3 py-1.5">{secs(i.duration_seconds) || "—"}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{i.created_at ? fmt(i.created_at, true) : "—"}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{uploader(i)}</td>
                            <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                                <span className="flex items-center justify-end gap-0.5">
                                    {iconBtn(Pencil, "Rename", () => setRenaming(i))}
                                    {iconBtn(Download, "Download", () => download([i]))}
                                    {iconBtn(FolderInput, "Move to Folder", () => setMoving({ ids: [i.id], copy: false }))}
                                    {iconBtn(Trash2, "Delete", () => setDeleting([i.id]), true)}
                                    {!compact && menu(i)}
                                </span>
                            </td>
                        </tr>
                    );
                })}</tbody>
            </table>
        </div>
    );

    return (
        <div className={cn("grid min-w-0 gap-4", pick && "xl:grid-cols-[minmax(0,1fr)_330px]")}>
            <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                        <Button size="icon" variant="outline" className="size-8 shrink-0" onClick={onBack} aria-label="Back to Gallery Overview"><ArrowLeft className="size-4" /></Button>
                        <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><button type="button" onClick={onBack} className="hover:text-primary">Gallery</button> <ChevronRight className="size-3" /> <span className="text-foreground">{folder?.name ?? "All Media"}</span></p>
                            <h3 className="text-[20px] leading-tight font-bold">{folder?.name ?? "All Media"}</h3>
                            <p className="text-[12.5px] text-muted-foreground">{folder?.description || (folder?.is_default ? "Default folder for all event media." : folder ? "" : "Every photo, video and short of this event.")}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {/* Grid View / List View as labelled buttons (design 00 default view). */}
                        <Button size="sm" variant={grid ? "default" : "outline"} className="h-8" onClick={() => setGrid(true)}><LayoutGrid className="size-3.5" /> Grid View</Button>
                        <Button size="sm" variant={!grid ? "default" : "outline"} className="h-8" onClick={() => setGrid(false)}><List className="size-3.5" /> List View</Button>
                        {folder && <Button variant="outline" size="sm" className="h-8" onClick={() => onFolder(folder)}><Pencil className="size-3.5" /> Edit Folder</Button>}
                        <Button size="sm" className="h-8" onClick={() => onUpload(folder?.id)}><Upload className="size-3.5" /> Upload Media</Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <CountTabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} stretch={false}
                        tabs={[{ value: "all", label: "All", count: inFolder.length }, { value: "image", label: "Images", count: count("image"), icon: ImageIcon }, { value: "video", label: "Videos", count: count("video"), icon: Video }, { value: "short", label: "Shorts", count: count("short"), icon: Zap }]} />
                    <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search media in this folder..." className="min-w-[160px]" />
                    <SortSelect value={sort} onChange={setSort} className="w-[170px]" options={[{ value: "new", label: "Sort: Newest" }, { value: "old", label: "Sort: Oldest" }, { value: "name", label: "Sort: Name" }, { value: "size", label: "Sort: Largest" }]} />
                    <Button variant={multi ? "default" : "outline"} size="sm" className="h-8" onClick={() => { setMulti(!multi); setSel([]); }}>{multi ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />} Multi-select</Button>
                    {multi && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8" disabled={!sel.length}>Bulk Actions{sel.length ? ` (${sel.length})` : ""} <ChevronDown className="size-3.5" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setMoving({ ids: sel, copy: false })}><FolderInput className="size-4" /> Move to Folder</DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setMoving({ ids: sel, copy: true })}><Copy className="size-4" /> Copy to Folder</DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => download(items.filter((i) => sel.includes(i.id)))}><Download className="size-4" /> Download</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="gap-2 text-[13px] text-destructive focus:text-destructive" onClick={() => setDeleting(sel)}><Trash2 className="size-4" /> Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>

                <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold">{shown.length.toLocaleString()} Media Items{multi && sel.length > 0 && <span className="ml-2 font-normal text-primary">· {sel.length} selected</span>}</p>
                    {multi && pageItems.length > 0 && (
                        <label className="flex cursor-pointer items-center gap-2 text-[12.5px]"><Checkbox checked={allOn} onCheckedChange={() => setSel(allOn ? [] : pageItems.map((i) => i.id))} /> Select All</label>
                    )}
                </div>
                {pageItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">
                        Nothing here yet. <button type="button" className="font-semibold text-primary" onClick={() => onUpload(folder?.id)}>Upload media</button>
                    </div>
                ) : grid ? (
                    // Fixed small cards (the design's 5-across grid), whatever the item count.
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                        {pageItems.map((i) => {
                            const k = KIND_META[kindOf(i)];
                            const on = sel.includes(i.id);
                            return (
                                <div key={i.id} className={cn("group overflow-hidden rounded-xl border bg-card transition", picked === i.id || on ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40")}>
                                    <button type="button" className="relative block aspect-[4/3] w-full" onClick={() => tap(i.id)} onDoubleClick={() => setViewer(shown.indexOf(i))}>
                                        <Thumb item={i} className="size-full" />
                                        {(multi || on) && <span className={cn("absolute top-1.5 left-1.5 grid size-5 place-items-center rounded border-2 border-white bg-black/30", on && "bg-primary")}>{on && <Check className="size-3 text-white" />}</span>}
                                        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] text-white"><k.icon className="size-3" /> {secs(i.duration_seconds) || k.label}</span>
                                        {!i.show_in_app && <span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Hidden</span>}
                                    </button>
                                    <div className="flex items-start gap-1 px-2.5 py-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[12px] font-semibold" title={name(i)}>{name(i)}</p>
                                            <p className="truncate text-[11px] text-muted-foreground">{bytes(i.size_bytes)}{i.created_at ? ` • ${fmt(i.created_at)}` : ""}</p>
                                        </div>
                                        {menu(i)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : listTable(pageItems)}

                <Pager page={current} pageSize={PAGE} total={shown.length} onPage={setPage} noun="items" />
            </div>

            {pick && (
                <DetailPanel key={pick.id} item={pick} folderName={folderName(pick.category_id)} name={name(pick)} uploader={uploader(pick)}
                    onClose={() => setPicked(null)} onView={() => setViewer(Math.max(0, shown.indexOf(pick)))}
                    onEdit={() => setEditing(pick)} onRename={() => setRenaming(pick)} onMove={() => setMoving({ ids: [pick.id], copy: false })}
                    onCopy={() => setMoving({ ids: [pick.id], copy: true })}
                    onEditVideo={onEditVideo && pick.type === "video" ? () => onEditVideo(pick) : undefined}
                    onDownload={() => download([pick])} onDelete={() => setDeleting([pick.id])} />
            )}
            {renaming && <RenameDialog eventId={eventId} item={renaming} current={name(renaming)} onClose={() => setRenaming(null)} />}

            {moving && <MoveSheet eventId={eventId} items={items.filter((i) => moving.ids.includes(i.id))} folders={folders} copy={moving.copy}
                from={folderId} onClose={() => setMoving(null)} onDone={(to) => { setMoving(null); setSel([]); if (!moving.copy && to !== folderId && folderId !== null) setPicked(null); void onOpen; }} />}
            {editing && <EditMediaDialog eventId={eventId} item={editing} onClose={() => setEditing(null)} />}
            {viewer !== null && shown[viewer] && <MediaViewer items={shown} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
            <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete {deleting?.length === 1 ? "this file" : `${deleting?.length} files`}?</DialogTitle>
                        <DialogDescription>They are removed from the gallery and from the event app. This cannot be undone.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={bulk.isPending} onClick={() => deleting && bulk.mutate({ ids: deleting, action: "delete" }, {
                            onSuccess: () => { setDeleting(null); setSel([]); if (picked && deleting.includes(picked)) setPicked(null); },
                        })}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function DetailPanel({
    item, folderName, name, uploader, onClose, onView, onEdit, onRename, onMove, onCopy, onDownload, onDelete, onEditVideo,
}: {
    item: GalleryItem; folderName: string; name: string; uploader: string; onClose: () => void; onView: () => void;
    onEdit: () => void; onRename: () => void; onMove: () => void; onCopy: () => void; onDownload: () => void; onDelete: () => void;
    /** Only when VIDEO_EDITOR_ENABLED and the file is a video. */
    onEditVideo?: () => void;
}) {
    const fmt = useDateFormatter();
    const update = useUpdateGalleryItem(item.event_id);
    // Details / Actions / Activity / Metadata (design 00 default view, 2026-11-06).
    const [tab, setTab] = useState<"details" | "actions" | "activity" | "metadata">("details");
    // Resolution is read from the file itself once it loads (not stored on the server).
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);
    const k = KIND_META[kindOf(item)];
    const ext = (item.file_name?.split(".").pop() || item.mime_type?.split("/")[1] || "").toUpperCase();
    const resolution = size ? `${size.w} × ${size.h}${size.h >= 2160 ? " (4K)" : size.h >= 1080 ? " (Full HD)" : size.h >= 720 ? " (HD)" : ""}` : null;
    const copy = async (text: string, what: string) => {
        try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); } catch { toast.error("Your browser blocked clipboard access."); }
    };
    const row = (l: string, v: React.ReactNode, I?: LucideIcon) => (
        <div className="grid grid-cols-[96px_1fr] gap-2 py-1 text-[12px]"><span className="text-muted-foreground">{l}</span>
            <span className="flex min-w-0 items-center gap-1.5 break-words font-medium">{I && <I className="size-3.5 shrink-0 text-muted-foreground" />}<span className="min-w-0 break-words">{v || "—"}</span></span></div>
    );
    const act = (I: LucideIcon, l: string, fn: () => void, danger?: boolean) => (
        <button type="button" onClick={fn} className={cn("flex flex-col items-center gap-1 rounded-lg border p-2 text-[11.5px] font-medium hover:bg-muted", danger ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border")}><I className="size-4" /> {l}</button>
    );
    const line = (I: LucideIcon, l: string, fn: () => void, danger?: boolean) => (
        <button type="button" onClick={fn} className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-muted", danger && "text-destructive")}><I className="size-4" /> {l}</button>
    );
    const updated = item.updated_at && item.created_at && String(item.updated_at).slice(0, 16) !== String(item.created_at).slice(0, 16) ? item.updated_at : null;
    return (
        <div className="flex h-fit flex-col overflow-hidden rounded-xl border border-primary/15 bg-card xl:sticky xl:top-4">
            <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><k.icon className="size-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-bold" title={name}>{name}</p><p className="text-[11.5px] text-muted-foreground">{k.label} • {bytes(item.size_bytes)}</p></div>
                <Button size="icon" variant="ghost" className="size-7" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
            </div>
            <div className="p-3">
                {item.type === "video"
                    ? <video src={mediaUrl(item.url)} poster={mediaUrl(item.thumbnail_url) || undefined} controls className="aspect-video w-full rounded-lg bg-black"
                        onLoadedMetadata={(e) => setSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} />
                    : (
                        <button type="button" onClick={onView} className="block aspect-video w-full overflow-hidden rounded-lg bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mediaUrl(item.url)} alt="" className="size-full object-cover" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
                        </button>
                    )}
            </div>
            <div className="flex border-b border-border px-1">
                {(["details", "actions", "activity", "metadata"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)} className={cn("relative flex-1 px-1 py-2 text-[12.5px] capitalize", tab === t ? "font-semibold text-primary" : "text-muted-foreground")}>
                        {t}{tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
                    </button>
                ))}
            </div>
            {tab === "details" && (
                <div className="px-3 py-2">
                    <div className="grid grid-cols-[96px_1fr] gap-2 py-1 text-[12px]">
                        <span className="text-muted-foreground">File Name</span>
                        <span className="flex min-w-0 items-center gap-1 font-medium"><span className="min-w-0 break-words">{item.file_name || "—"}</span>
                            {item.file_name && <button type="button" onClick={() => copy(item.file_name!, "File name")} className="shrink-0 text-muted-foreground hover:text-primary" aria-label="Copy file name"><Copy className="size-3.5" /></button>}</span>
                    </div>
                    {row("Type", `${k.label}${ext ? ` (${ext})` : ""}`, k.icon)}
                    {row("Size", `${bytes(item.size_bytes)} (${item.size_bytes.toLocaleString()} bytes)`)}
                    {item.type === "video" && row("Duration", secs(item.duration_seconds) ? `${secs(item.duration_seconds)} min` : null, Clock)}
                    {row("Resolution", resolution, Monitor)}
                    {row("Uploaded On", item.created_at ? fmt(item.created_at, true) : null, CalendarDays)}
                    {row("Uploaded By", uploader, User)}
                    {row("Location", `Event Media › ${folderName}`, Folder)}
                    {row("In the App", item.show_in_app ? "Shown" : "Hidden", item.show_in_app ? Eye : EyeOff)}
                    {item.description && row("Description", item.description)}
                </div>
            )}
            {tab === "actions" && (
                <div className="flex flex-col p-2">
                    {line(Eye, "View Full Screen", onView)}
                    {line(Pencil, "Rename", onRename)}
                    {line(Settings2, "Edit Details", onEdit)}
                    {onEditVideo && line(Scissors, "Edit Video", onEditVideo)}
                    {line(FolderInput, "Move to Folder", onMove)}
                    {line(Copy, "Copy to Folder", onCopy)}
                    {line(Download, "Download", onDownload)}
                    {line(item.show_in_app ? EyeOff : Eye, item.show_in_app ? "Hide in Event App" : "Show in Event App",
                        () => update.mutate({ id: item.id, data: { show_in_app: !item.show_in_app } }, { onSuccess: () => toast.success(item.show_in_app ? "Hidden in the event app" : "Shown in the event app") }))}
                    {line(Link2, "Copy Link", () => copy(mediaUrl(item.url) ?? item.url, "Link"))}
                    {line(Trash2, "Delete", onDelete, true)}
                </div>
            )}
            {tab === "activity" && (
                <ol className="flex flex-col gap-3 px-4 py-3 text-[12px]">
                    {updated && (
                        <li className="flex gap-2.5"><span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                            <span><b>Last updated</b><br /><span className="text-muted-foreground">{fmt(updated, true)}</span></span></li>
                    )}
                    <li className="flex gap-2.5"><span className="mt-1 size-2 shrink-0 rounded-full bg-success" />
                        <span><b>Uploaded</b> by {uploader} to {folderName}<br /><span className="text-muted-foreground">{item.created_at ? fmt(item.created_at, true) : "—"}</span></span></li>
                    <li className="text-[11px] text-muted-foreground">Only upload and last change are recorded for a file.</li>
                </ol>
            )}
            {tab === "metadata" && (
                <div className="px-3 py-2">
                    {row("File ID", `#${item.id}`)}
                    {row("MIME Type", item.mime_type)}
                    {row("Extension", ext)}
                    {row("Size (bytes)", item.size_bytes.toLocaleString())}
                    {row("Resolution", resolution)}
                    {size && row("Aspect Ratio", (size.w / size.h).toFixed(2))}
                    {item.type === "video" && row("Duration", item.duration_seconds ? `${item.duration_seconds} sec` : null)}
                    {row("Short", item.is_short ? "Yes" : "No")}
                    {row("Title", item.title)}
                    {row("Caption", item.caption)}
                </div>
            )}
            <div className="grid grid-cols-5 gap-1.5 border-t border-border p-3">
                {act(Pencil, "Rename", onRename)}{act(Download, "Download", onDownload)}{act(FolderInput, "Move", onMove)}{act(Settings2, "Edit", onEdit)}{act(Trash2, "Delete", onDelete, true)}
            </div>
        </div>
    );
}

/** Rename = the name shown everywhere (the item's title); the stored file keeps its name. */
function RenameDialog({ eventId, item, current, onClose }: { eventId: number; item: GalleryItem; current: string; onClose: () => void }) {
    const update = useUpdateGalleryItem(eventId);
    const [value, setValue] = useState(current);
    const v = value.trim();
    const save = () => {
        if (!v) { toast.error("Please enter a name."); return; }
        update.mutate({ id: item.id, data: { title: v } }, { onSuccess: () => { toast.success("Renamed"); onClose(); } });
    };
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Rename</DialogTitle>
                    <DialogDescription>The name shown in the gallery and the event app.</DialogDescription>
                </DialogHeader>
                <Input value={value} maxLength={150} autoFocus onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={update.isPending || !v || v === current} onClick={save}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ── Move / Copy Files ──────────────────────────────────────────────────── */

function MoveSheet({
    eventId, items, folders, copy, from, onClose, onDone,
}: { eventId: number; items: GalleryItem[]; folders: GalleryCategory[]; copy: boolean; from: number | null; onClose: () => void; onDone: (to: number) => void }) {
    const bulk = useGalleryBulk(eventId);
    const [search, setSearch] = useState("");
    const [to, setTo] = useState<number | null>(null);
    const n = (k: Kind) => items.filter((i) => kindOf(i) === k).length;
    const summary = [["image", "images"], ["video", "videos"], ["short", "shorts"]].map(([k, w]) => (n(k as Kind) ? `${n(k as Kind)} ${n(k as Kind) === 1 ? w.slice(0, -1) : w}` : "")).filter(Boolean).join(" • ");
    const source = from === null ? null : folders.find((f) => f.id === from);
    const target = folders.find((f) => f.id === to);
    const fits = target ? items.filter((i) => takes(target.folder_type, kindOf(i))).length : items.length;
    const list = folders.filter((f) => (copy || f.id !== from) && (!search.trim() || f.name.toLowerCase().includes(search.trim().toLowerCase())));
    const verb = copy ? "Copy" : "Move";
    return (
        <ActionSheet open onClose={onClose} icon={copy ? Copy : FolderInput} title={`${verb} Files`} subtitle={`${verb} selected media files to another folder.`}
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!to || !fits || bulk.isPending} onClick={() => to && bulk.mutate({ ids: items.map((i) => i.id), action: copy ? "copy" : "move", category_id: to }, { onSuccess: () => onDone(to) })}><Folder className="size-3.5" /> {verb} {fits} {fits === 1 ? "File" : "Files"}</Button></>}>
            <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3">
                <span className="grid size-10 place-items-center rounded-lg bg-card text-primary"><ImageIcon className="size-5" /></span>
                <div><p className="text-[14px] font-bold">{items.length} {items.length === 1 ? "file" : "files"} selected</p><p className="text-[12px] text-muted-foreground">{summary}</p></div>
            </div>
            <p className="text-[14px] font-bold">Select Destination Folder</p>
            <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search folders..." className="h-9 pl-9" /></div>
            <div className="flex flex-col gap-1.5">
                {list.map((f) => (
                    <label key={f.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5", to === f.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                        <Folder className={cn("size-5 shrink-0", f.is_default ? "text-muted-foreground" : "text-amber-500")} />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold">{f.name}</span>
                            <span className="block text-[11px] text-muted-foreground">{f.is_default ? "Default • Cannot be deleted" : f.folder_type && f.folder_type !== "mixed" ? `${f.folder_type} only` : "Mixed"}</span>
                        </span>
                        <span className="text-[12px] text-muted-foreground">{f.item_count} items</span>
                        <input type="radio" name="dest" checked={to === f.id} onChange={() => setTo(f.id)} className="size-4 accent-[var(--primary)]" />
                    </label>
                ))}
            </div>
            {target && (
                <div className="rounded-xl border border-border p-3 text-[12.5px]">
                    <p className="mb-1 text-[13px] font-bold">{verb} Confirmation</p>
                    <p className="flex justify-between py-1"><span className="text-muted-foreground">From (Source Folder)</span><b>{source?.name ?? "Several folders"}</b></p>
                    <p className="flex justify-between py-1"><span className="text-muted-foreground">To (Destination Folder)</span><b className="text-primary">{target.name}</b></p>
                </div>
            )}
            {target && fits < items.length && <Notice tone="warning">{items.length - fits} of these files cannot go into &ldquo;{target.name}&rdquo; ({target.folder_type} only) and will be skipped.</Notice>}
            {target && <Notice tone="info">{fits} {fits === 1 ? "file" : "files"} will be {copy ? "copied" : "moved"} to <b>{target.name}</b>.{copy ? " A copy uses the same file — it does not take more storage." : ""}</Notice>}
        </ActionSheet>
    );
}

/* ── Create / Edit Folder ───────────────────────────────────────────────── */

function FolderSheet({ eventId, folder, count, onClose }: { eventId: number; folder: GalleryCategory | null; count: number; onClose: () => void }) {
    const save = useSaveGalleryCategory(eventId);
    const cover = useUploadGalleryCover(eventId);
    const [name, setName] = useState(folder?.name ?? "");
    const [description, setDescription] = useState(folder?.description ?? "");
    const [image, setImage] = useState<string | null>(folder?.cover_image ?? null);
    const [type, setType] = useState<GalleryFolderType>(folder?.folder_type ?? "mixed");
    const [position, setPosition] = useState(folder ? (folder.sort_order ?? 0) + 1 : count + 1);
    const [notes, setNotes] = useState(folder?.notes ?? "");
    const [tried, setTried] = useState(false);
    const isDefault = !!folder?.is_default;
    const submit = () => {
        setTried(true);
        if (!name.trim()) return toast.error("Please enter a folder name.");
        save.mutate({
            id: folder?.id,
            data: { ...(isDefault ? {} : { name: name.trim(), folder_type: type, position }), description: description.trim() || null, cover_image: image, notes: notes.trim() || null },
        }, { onSuccess: onClose });
    };
    return (
        <ActionSheet open onClose={onClose} icon={FolderPlus} title={folder ? "Edit Folder" : "Create New Folder"} subtitle="Organize your event media by creating a new folder."
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.isPending} onClick={submit}><Folder className="size-3.5" /> Save Folder</Button></>}>
            <FormField label="Folder Name" required>
                <Input value={name} maxLength={120} disabled={isDefault} placeholder="Enter folder name (e.g., Mehndi, Haldi, Highlights)" onChange={(e) => setName(e.target.value)} className={cn("h-9", tried && !name.trim() && "border-destructive")} />
            </FormField>
            <FormField label="Description">
                <Textarea value={description} maxLength={200} rows={2} placeholder="Briefly describe what this folder contains..." onChange={(e) => setDescription(e.target.value)} />
                <CharCount value={description} max={200} />
            </FormField>
            <FormField label="Cover Image">
                <PhotoDropzone value={image} onChange={setImage} aspect={16 / 10} outputSize={1200} recommend={null}
                    uploader={(f) => cover.mutateAsync(f).then((r) => r.url)} />
            </FormField>
            <FormField label="Folder Type" required>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {FOLDER_TYPES.map((t) => (
                        <button key={t.value} type="button" disabled={isDefault} onClick={() => setType(t.value)}
                            className={cn("flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition disabled:opacity-50", type === t.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted")}>
                            <t.icon className="size-5" /><span className="text-[12.5px] font-semibold">{t.label}</span><span className="text-[10.5px] text-muted-foreground">{t.hint}</span>
                        </button>
                    ))}
                </div>
            </FormField>
            {!isDefault && (
                <FormField label="Sort Order" required note="Display order in Gallery — 1 comes first after the default Gallery.">
                    <div className="w-40"><NumberStepper value={position} onChange={setPosition} min={1} max={Math.max(1, count + (folder ? 0 : 1))} /></div>
                </FormField>
            )}
            <FormField label="Notes" hint=" (Optional)">
                <Textarea value={notes} maxLength={500} rows={2} placeholder="Add any additional notes, such as who can upload, event stage, or special instructions..." onChange={(e) => setNotes(e.target.value)} />
                <CharCount value={notes} max={500} />
            </FormField>
            <Notice tone="primary">{type === "mixed" ? "This folder can store images, videos, and shorts." : `This folder stores ${type} only — other files are refused.`}</Notice>
        </ActionSheet>
    );
}

/* ── Upload Media ───────────────────────────────────────────────────────── */

/**
 * One file in the queue. Videos may carry the design's per-row options (2026-11-06): Trim, Mute original
 * audio, background Music and a Cover — sent through `/gallery/shorts` as an ordinary VIDEO (`kind=video`),
 * which the server already cuts / mixes / covers. `invalid` = checked here, never sent.
 */
export type Queued = {
    key: string; file: File; url: string; kind: "image" | "video";
    status: "queued" | "uploading" | "done" | "failed" | "invalid"; error?: string; checked: boolean;
    duration?: number; trim?: { start: number; end: number }; mute?: boolean; music?: LoadedMusic | null; musicStart?: number;
    cover?: File | null; coverUrl?: string;
    /** 0–100 of the file SENT (real, from the upload); 100 = the server is now storing / processing it. */
    progress?: number;
};
const IMAGE_RE = /^image\/(jpeg|png|webp|gif)$/;
const VIDEO_RE = /^video\/(mp4|webm|quicktime)$/;
/** The longest source a trimmed video may be (the server's MAX_SHORT_SOURCE_BYTES). */
const MAX_TRIM_SOURCE = 50 * 1024 * 1024;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const hasOptions = (q: Queued) => !!(q.trim || q.mute || q.music || q.cover);

function UploadView({
    eventId, folders, initialFolder, initialFiles, draft, onDraft, onGallery, onNewFolder,
}: {
    eventId: number; folders: GalleryCategory[]; initialFolder?: number; initialFiles?: File[];
    draft: { folderId: number; queue: Queued[] } | null; onDraft: (d: { folderId: number; queue: Queued[] } | null) => void;
    onGallery: (id?: number) => void; onNewFolder: () => void;
}) {
    const upload = useUploadGalleryItem(eventId);
    const uploadWithOptions = useUploadShort(eventId);
    const usage = useEventGallery(eventId).data?.usage;
    const def = folders.find((f) => f.is_default) ?? folders[0];
    // A saved draft reopens with its folder and files (Save as Draft — kept while this page is open).
    const [folderId, setFolderId] = useState<number>(initialFolder ?? draft?.folderId ?? def?.id ?? 0);
    const folder = folders.find((f) => f.id === folderId) ?? def;
    const kindFor = (f?: GalleryCategory) => (f?.folder_type === "videos" ? "videos" : f?.folder_type === "shorts" ? "shorts" : "images") as "images" | "videos" | "shorts";
    const [kind, setKind] = useState(kindFor(folder));
    const [queue, setQueue] = useState<Queued[]>(() => (initialFiles?.length ? [] : draft?.queue ?? []));
    const [over, setOver] = useState(false);
    const [shortOpen, setShortOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [paused, setPaused] = useState(false);
    const [dragKey, setDragKey] = useState<string | null>(null);
    // The queued video whose "Trim & Music" panel is open.
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const pickRef = useRef<HTMLInputElement>(null);
    const seeded = useRef(false);
    const pauseRef = useRef(false);
    const keepUrls = useRef(false);
    const maxImg = usage?.max_image_bytes ?? 10 * 1024 * 1024;
    const maxVid = usage?.max_video_bytes ?? 100 * 1024 * 1024;

    /** Why this file cannot go into this folder as it is — checked here, so no request is sent. */
    const problem = (q: Queued, f = folder): string | null => {
        if (!takes(f?.folder_type, q.kind)) return `"${f?.name ?? "This folder"}" takes ${f?.folder_type} only — choose another folder for this file.`;
        if (q.kind === "image" && q.file.size > maxImg) return `Larger than ${bytes(maxImg)}.`;
        if (q.kind === "video" && q.file.size > maxVid && !q.trim) return `Larger than ${bytes(maxVid)} — trim it shorter to upload.`;
        if (q.trim && !(q.trim.end > q.trim.start)) return "The end of the trim must be after its start.";
        return null;
    };
    /** Re-check every waiting file (after a folder or option change). */
    const recheck = (list: Queued[], f = folder) => list.map((x): Queued => {
        if (x.status === "done" || x.status === "uploading") return x;
        const msg = problem(x, f);
        if (msg) return { ...x, status: "invalid", error: msg };
        return x.status === "invalid" ? { ...x, status: "queued", error: undefined } : x;
    });

    const pickFolder = (id: number) => {
        setFolderId(id);
        const f = folders.find((x) => x.id === id);
        if (f?.folder_type && f.folder_type !== "mixed") setKind(kindFor(f));
        setQueue((q) => recheck(q, f));
    };

    const add = (files: File[]) => {
        const next: Queued[] = [];
        for (const file of files) {
            const k = IMAGE_RE.test(file.type) ? "image" : VIDEO_RE.test(file.type) ? "video" : null;
            if (!k) { toast.error(`${file.name}: not a JPG, PNG, WEBP, GIF, MP4, WebM or MOV file.`); continue; }
            if (!takes(folder?.folder_type, k)) { toast.error(`${file.name}: "${folder?.name}" takes ${folder?.folder_type} only.`); continue; }
            if (file.size > (k === "image" ? maxImg : MAX_TRIM_SOURCE)) { toast.error(`${file.name} is larger than ${bytes(k === "image" ? maxImg : MAX_TRIM_SOURCE)}.`); continue; }
            const item: Queued = { key: `${file.name}-${file.size}-${Math.random()}`, file, url: URL.createObjectURL(file), kind: k, status: "queued", checked: false };
            const msg = problem(item);
            next.push(msg ? { ...item, status: "invalid", error: msg } : item);
        }
        setQueue((q) => [...q, ...next]);
    };
    // Files dropped on the overview arrive here once.
    useEffect(() => {
        if (seeded.current || !initialFiles?.length) return;
        seeded.current = true;
        const t = setTimeout(() => add(initialFiles), 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Free the previews when leaving — not when they were kept as a draft.
    useEffect(() => () => { if (!keepUrls.current) queue.forEach((q) => { URL.revokeObjectURL(q.url); if (q.coverUrl) URL.revokeObjectURL(q.coverUrl); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (key: string, patch: Partial<Queued>) => setQueue((q) => q.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    /** Change a video's options, then re-check it (a trim can make a too-large video fit). */
    const setOpt = (key: string, patch: Partial<Queued>) => setQueue((q) => recheck(q.map((x) => (x.key === key ? { ...x, ...patch } : x))));

    /** Resolves true when the file was uploaded. */
    const runOne = (q: Queued) => new Promise<boolean>((resolve) => {
        const msg = problem(q);
        if (msg) { set(q.key, { status: "invalid", error: msg }); resolve(false); return; }
        set(q.key, { status: "uploading", error: undefined, progress: 0 });
        const onProgress = (pct: number) => set(q.key, { progress: pct });
        const done = { onSuccess: () => { set(q.key, { status: "done" }); resolve(true); },
            onError: (e: unknown) => { set(q.key, { status: "failed", error: e instanceof Error ? e.message : "Upload failed" }); resolve(false); } };
        if (q.kind === "video" && hasOptions(q)) {
            uploadWithOptions.mutate({
                file: q.file, asVideo: true, title: "", categoryId: folderId, mute: q.mute, music: q.music?.file ?? null, musicStart: q.musicStart, cover: q.cover ?? null,
                trimStart: q.trim?.start, trimEnd: q.trim?.end, onProgress,
            }, done);
        } else {
            upload.mutate({ file: q.file, categoryId: folderId, onProgress }, done);
        }
    });
    const uploadAll = async () => {
        setBusy(true); setPaused(false); pauseRef.current = false;
        let ok = 0, bad = 0, stopped = false;
        // One by one, in the queue's order, as the plan limits are checked per file.
        for (const q of queue.filter((x) => x.status === "queued" || x.status === "failed")) {
            if (pauseRef.current) { stopped = true; break; }
            if (await runOne(q)) ok++; else bad++;
        }
        setBusy(false);
        if (stopped) { toast.message("Upload paused — the rest are waiting. Press Upload Media to carry on."); return; }
        // Everything went up -> open that folder's list (Jamal, 2026-11-06). Any failure keeps the page open to retry.
        if (ok && !bad) {
            onDraft(null);
            toast.success(`${ok} ${ok === 1 ? "file" : "files"} uploaded to "${folder?.name ?? "Gallery"}"`);
            onGallery(folderId);
        }
    };
    // Pause = stop after the file now uploading (a file already on its way cannot be halted half-way).
    const pause = () => { pauseRef.current = true; setPaused(true); };

    /** Move Up / Move Down the ticked files, or drag a row by its handle. */
    const move = (dir: -1 | 1) => setQueue((q) => {
        const a = [...q];
        const order = dir === -1 ? a.map((_, i) => i) : a.map((_, i) => a.length - 1 - i);
        for (const i of order) {
            const j = i + dir;
            if (a[i].checked && j >= 0 && j < a.length && !a[j].checked) [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    });
    const dropOn = (target: string) => {
        if (!dragKey || dragKey === target) return;
        setQueue((q) => {
            const a = [...q];
            const from = a.findIndex((x) => x.key === dragKey);
            const [row] = a.splice(from, 1);
            a.splice(a.findIndex((x) => x.key === target), 0, row);
            return a;
        });
        setDragKey(null);
    };
    const saveDraft = () => {
        const left = queue.filter((x) => x.status !== "done");
        if (!left.length) { toast.message("Nothing to keep — every file is uploaded."); return; }
        keepUrls.current = true;
        onDraft({ folderId, queue: left.map((x) => (x.status === "uploading" ? { ...x, status: "queued" } : x)) });
        toast.success("Draft saved — reopen Upload Media to carry on (kept until this page is closed).");
    };

    const pending = queue.filter((x) => x.status === "queued" || x.status === "failed").length;
    const failed = queue.filter((x) => x.status === "failed").length;
    const checked = queue.filter((x) => x.checked).length;
    const accept = kind === "images" ? "image/jpeg,image/png,image/webp,image/gif" : "video/mp4,video/webm,video/quicktime";

    return (
        <div className="flex flex-col gap-3">
            {/* Back arrow + breadcrumb like the folder page (Jamal, 2026-11-06): back = where Upload was opened from
                (that folder, or the Gallery Overview). */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                    <Button size="icon" variant="outline" className="size-8 shrink-0" onClick={() => onGallery(initialFolder)} aria-label="Back"><ArrowLeft className="size-4" /></Button>
                    <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                            <button type="button" onClick={() => onGallery()} className="hover:text-primary">Gallery</button>
                            {initialFolder !== undefined && <><ChevronRight className="size-3" /><button type="button" onClick={() => onGallery(initialFolder)} className="hover:text-primary">{folders.find((f) => f.id === initialFolder)?.name ?? "Folder"}</button></>}
                            <ChevronRight className="size-3" /> <span className="text-foreground">Upload Media</span>
                        </p>
                        <h3 className="text-[20px] leading-tight font-bold">Upload Media to Gallery</h3>
                        <p className="text-[12.5px] text-muted-foreground">Add photos, videos, and short clips to your event gallery.</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-8" onClick={onNewFolder}><FolderPlus className="size-3.5" /> Create Folder</Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => onGallery(folderId)}><Images className="size-3.5" /> View Gallery</Button>
                </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-end">
                <FormField label="Upload to Folder" required>
                    <Select value={String(folderId)} onValueChange={(v) => pickFolder(Number(v))}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{folders.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}{f.is_default ? " (Default)" : f.folder_type && f.folder_type !== "mixed" ? ` (${f.folder_type} only)` : ""}</SelectItem>)}</SelectContent>
                    </Select>
                </FormField>
                <div className="grid grid-cols-3 gap-2">
                    {([["images", "Images", ImageIcon], ["videos", "Videos", Video], ["shorts", "Shorts", Zap]] as const).map(([v, l, I]) => (
                        <button key={v} type="button" onClick={() => setKind(v)} disabled={!takes(folder?.folder_type, v === "images" ? "image" : v === "videos" ? "video" : "short")}
                            className={cn("flex h-9 items-center justify-center gap-2 rounded-lg border text-[13px] font-semibold transition disabled:opacity-40", kind === v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                            <I className="size-4" /> {l}
                        </button>
                    ))}
                </div>
            </div>

            {kind === "shorts" ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] px-4 py-6 text-center">
                    <Zap className="size-7 text-primary" />
                    <p className="text-[13px]">Shorts are short vertical clips (up to 1 minute). Pick a video, trim it, add background music and a cover.</p>
                    <Button size="sm" onClick={() => setShortOpen(true)}><Upload className="size-3.5" /> Upload a Short</Button>
                </div>
            ) : (
                <>
                    <input ref={pickRef} type="file" multiple accept={accept} className="hidden" onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
                    <button type="button" onClick={() => pickRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                        onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}
                        className={cn("flex flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center transition", over ? "border-primary bg-primary/10" : "border-primary/40 bg-primary/[0.03] hover:bg-primary/5")}>
                        <CloudUpload className="size-7 text-primary" />
                        <span className="text-[13px]">Drag &amp; drop {kind} here, or <span className="font-semibold text-primary">click to browse</span></span>
                        <span className="text-[11px] text-muted-foreground">{kind === "images" ? `JPG, PNG, WEBP, GIF • Max ${bytes(maxImg)} per image` : `MP4, WebM, MOV • Max ${bytes(maxVid)} per video (longer ones: trim them in the queue, source up to ${bytes(MAX_TRIM_SOURCE)})`} • You can upload multiple files at once.</span>
                    </button>
                </>
            )}

            {queue.length > 0 && (
                <div className="rounded-xl border border-border bg-card">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                        <p className="text-[14px] font-bold">Upload Queue <span className="font-normal text-muted-foreground">({queue.length} files)</span></p>
                        <span className="ml-auto flex flex-wrap gap-1.5">
                            <label className="flex items-center gap-1.5 px-1 text-[12px]"><Checkbox checked={checked === queue.length} onCheckedChange={(v) => setQueue((q) => q.map((x) => ({ ...x, checked: v === true })))} /> Select All</label>
                            <Button size="sm" variant="outline" className="h-7" disabled={!checked || busy} onClick={() => move(-1)}><ArrowUp className="size-3.5" /> Move Up</Button>
                            <Button size="sm" variant="outline" className="h-7" disabled={!checked || busy} onClick={() => move(1)}><ArrowDown className="size-3.5" /> Move Down</Button>
                            <Button size="sm" variant="outline" className="h-7 border-destructive/40 text-destructive" disabled={!checked || busy} onClick={() => setQueue((q) => q.filter((x) => !x.checked))}><Trash2 className="size-3.5" /> Remove Selected ({checked})</Button>
                            <Button size="sm" variant="outline" className="h-7" disabled={!failed || busy} onClick={uploadAll}><RotateCcw className="size-3.5" /> Retry Failed ({failed})</Button>
                            <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setQueue((q) => q.filter((x) => x.status !== "done"))}><Check className="size-3.5" /> Clear Completed</Button>
                        </span>
                    </div>
                    <div className="divide-y divide-border">
                        {queue.map((q) => (
                            <Fragment key={q.key}>
                            <div className={cn("flex flex-wrap items-center gap-3 px-3 py-2", dragKey === q.key && "opacity-50", editingKey === q.key && "bg-primary/5")}
                                onDragOver={(e) => { if (dragKey) e.preventDefault(); }} onDrop={() => dropOn(q.key)}>
                                <span draggable={!busy} onDragStart={() => setDragKey(q.key)} onDragEnd={() => setDragKey(null)}
                                    className={cn("text-muted-foreground", busy ? "cursor-not-allowed opacity-40" : "cursor-grab")} title="Drag to reorder"><GripVertical className="size-4" /></span>
                                <Checkbox checked={q.checked} onCheckedChange={(v) => set(q.key, { checked: v === true })} />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {q.kind === "image" ? <img src={q.url} alt="" className="h-10 w-14 rounded object-cover" />
                                    : <video src={q.url} muted className="h-10 w-14 rounded bg-black object-cover"
                                        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && !q.duration) set(q.key, { duration: d }); }} />}
                                <div className="min-w-0 flex-1 basis-[160px]">
                                    <p className="truncate text-[12.5px] font-semibold">{q.file.name}</p>
                                    <p className="text-[11px] text-muted-foreground">{q.file.type.split("/")[1]?.toUpperCase()} • {bytes(q.file.size)}{q.duration ? ` • ${mmss(q.duration)}` : ""}</p>
                                </div>
                                <StatusPill tone={q.kind === "image" ? "primary" : "violet"} icon={q.kind === "image" ? ImageIcon : Video}>{q.kind === "image" ? "Image" : "Video"}</StatusPill>
                                {q.kind === "video" && <VideoOptions q={q} disabled={q.status === "uploading" || q.status === "done"} onEdit={() => setEditingKey(q.key)} />}
                                <div className="w-[170px] text-[12px]">
                                    {q.status === "queued" && <span className="text-muted-foreground">{paused ? "Paused — waiting" : "Ready to upload"}</span>}
                                    {q.status === "uploading" && (() => {
                                        const pct = q.progress ?? 0;
                                        const sending = pct < 100;
                                        return (
                                            <span className="flex flex-col gap-1">
                                                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                                                    <span className={cn("block h-full rounded-full bg-primary transition-[width] duration-200", !sending && "animate-pulse")} style={{ width: `${Math.max(3, pct)}%` }} />
                                                </span>
                                                <span className="text-[11px] text-primary">
                                                    {sending
                                                        ? <>{pct}% • Uploading… <span className="text-muted-foreground">({bytes((q.file.size * pct) / 100)} / {bytes(q.file.size)})</span></>
                                                        : hasOptions(q) ? "100% • Processing on the server…" : "100% • Saving…"}
                                                </span>
                                            </span>
                                        );
                                    })()}
                                    {q.status === "done" && <span className="flex items-center gap-1 text-success"><Check className="size-3.5" /> Uploaded successfully</span>}
                                    {q.status === "failed" && <span className="block text-destructive" title={q.error}><b>Upload failed</b><br /><span className="text-[11px]">{q.error}</span></span>}
                                    {q.status === "invalid" && <span className="block text-destructive" title={q.error}><b>Cannot upload</b><br /><span className="text-[11px]">{q.error}</span></span>}
                                </div>
                                {q.status === "uploading" && <Button size="icon" variant="outline" className="size-7" aria-label="Pause after this file" title="Pause after this file" disabled={paused} onClick={pause}><Pause className="size-3.5" /></Button>}
                                {q.status === "done" && <Button size="icon" variant="outline" className="size-7" aria-label="Preview" title="Preview" onClick={() => window.open(q.url, "_blank")}><Eye className="size-3.5" /></Button>}
                                {q.status === "failed" && <Button size="sm" variant="outline" className="h-7 border-primary/40 text-primary" onClick={() => runOne(q)}><RotateCcw className="size-3" /> Retry</Button>}
                                <Button size="icon" variant="ghost" className="size-7 text-destructive" disabled={q.status === "uploading"} aria-label="Remove" onClick={() => setQueue((x) => x.filter((y) => y.key !== q.key))}><Trash2 className="size-4" /></Button>
                            </div>
                            {/* Trim & Music opens in place, under its own row (Jamal, 2026-11-06 — no slide-in). */}
                            {editingKey === q.key && (
                                <VideoEditPanel q={q} maxBytes={maxVid} onClose={() => setEditingKey(null)}
                                    onApply={(p) => { setOpt(q.key, p); setEditingKey(null); }} />
                            )}
                            </Fragment>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2.5">
                        <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Info className="size-3.5" /> Images (JPG, PNG, WEBP, GIF) • Videos (MP4, WebM, MOV) • Max {bytes(maxImg)} per image, {bytes(maxVid)} per video • Shorts: use the Shorts tab.</p>
                        <span className="ml-auto flex gap-2">
                            <Button variant="outline" disabled={busy} onClick={saveDraft}><Save className="size-3.5" /> Save as Draft</Button>
                            {busy
                                ? <Button variant="outline" disabled={paused} onClick={pause}><Pause className="size-3.5" /> {paused ? "Pausing…" : "Pause"}</Button>
                                : <Button disabled={!pending} onClick={uploadAll}><Upload className="size-3.5" /> Upload Media ({pending})</Button>}
                        </span>
                    </div>
                </div>
            )}

            {shortOpen && folder && (
                <ShortDialog eventId={eventId} category={folder} categories={folders} onClose={() => setShortOpen(false)}
                    onViewGallery={(c) => { setShortOpen(false); onGallery(c?.id); }} />
            )}
        </div>
    );
}

/**
 * A queued video's row: what is set (trim, music, muted, cover) as chips + one "Trim & Music" button —
 * the editing itself happens in VideoEditSheet, in the gallery editor's design (Jamal, 2026-11-06).
 */
function VideoOptions({ q, disabled, onEdit }: { q: Queued; disabled: boolean; onEdit: () => void }) {
    const chip = "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary";
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 border-primary/40 px-2.5 text-[12px] text-primary" disabled={disabled} onClick={onEdit}>
                <Scissors className="size-3.5" /> Trim &amp; Music
            </Button>
            {q.trim && <span className={chip}><Scissors className="size-3" /> {t0(q.trim.start)} – {t0(q.trim.end)}</span>}
            {q.music && <span className={cn(chip, "max-w-[150px]")} title={q.music.file.name}><Music className="size-3 shrink-0" /><span className="truncate">{q.music.file.name}</span></span>}
            {q.mute && !q.music && <span className={chip}><VolumeX className="size-3" /> Muted</span>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {q.coverUrl && <img src={q.coverUrl} alt="Cover" title="Cover" className="h-6 w-9 rounded object-cover ring-1 ring-primary/40" />}
        </div>
    );
}

/** "Trim & Music" for one queued video, in the page under its row: player + Cover, Timeline & Clip Trimming, Music (Background MP3). */
function VideoEditPanel({ q, maxBytes, onClose, onApply }: { q: Queued; maxBytes: number; onClose: () => void; onApply: (p: Partial<Queued>) => void }) {
    const [duration, setDuration] = useState(q.duration ?? 0);
    const [trim, setTrim] = useState<Trim>(q.trim ?? { start: 0, end: q.duration ?? 0 });
    const [mute, setMute] = useState(!!q.mute);
    const [music, setMusic] = useState<LoadedMusic | null>(q.music ?? null);
    const [musicStart, setMusicStart] = useState(q.musicStart ?? 0);
    const [cover, setCover] = useState<{ file: File; url: string } | null>(q.cover && q.coverUrl ? { file: q.cover, url: q.coverUrl } : null);
    const coverRef = useRef<HTMLInputElement>(null);
    const { videoRef, audioRef, time, playing, play, seek, onTimeUpdate, stop } = useClipPlayer(trim, music, musicStart);
    const len = Math.max(0, trim.end - trim.start);
    const whole = duration > 0 && trim.start <= 0.05 && trim.end >= duration - 0.05;
    // A video over the per-file cap must be trimmed; the kept part is estimated from the source's bitrate.
    const estimate = duration ? (q.file.size * len) / duration : q.file.size;
    const tooBig = estimate > maxBytes;

    // Preview the sound as it will be: the song replaces the video's own sound; Mute drops it.
    useEffect(() => { if (videoRef.current) videoRef.current.muted = mute || !!music; }, [mute, music, videoRef]);

    const onMeta = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const d = e.currentTarget.duration;
        if (!Number.isFinite(d)) return;
        setDuration(d);
        setTrim((t) => (t.end > 0 && t.end <= d + 0.05 ? t : { start: 0, end: d }));
    };
    const close = () => { stop(); onClose(); };
    const apply = () => {
        if (tooBig) { toast.error(`The kept part is about ${bytes(estimate)} — trim it to under ${bytes(maxBytes)}.`); return; }
        stop();
        onApply({
            trim: whole ? undefined : trim, mute: music ? false : mute, music, musicStart: music ? musicStart : 0,
            cover: cover?.file ?? null, coverUrl: cover?.url, duration: duration || q.duration,
        });
    };

    return (
        <div className="flex flex-col gap-2.5 border-y border-primary/20 bg-primary/[0.02] px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[15px] font-bold"><Scissors className="size-4 text-primary" /> Trim &amp; Music</p>
                    <p className="truncate text-[12px] text-muted-foreground">{q.file.name} — trim the clip, add background music and a cover.</p>
                </div>
                <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={close} aria-label="Close"><X className="size-4" /></Button>
            </div>

            {/* Live check 1366×768 (Jamal, 2026-11-06): the full-width 16:9 player was ~810×455 and filled the screen.
                Now a 16:9 box 230 px high (≈410 px wide) with the Cover card using the space beside it. */}
            <div className="flex min-w-0 flex-col gap-3 md:flex-row">
                <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-black md:h-[230px] md:w-auto">
                    <video ref={videoRef} src={q.url} className="size-full object-contain" playsInline onLoadedMetadata={onMeta} onTimeUpdate={onTimeUpdate} onEnded={stop} />
                    {music && <audio ref={audioRef} src={music.url} loop />}
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-white">
                        <button type="button" onClick={play} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause className="size-4 fill-white" /> : <Play className="size-4 fill-white" />}</button>
                        <span className="text-[11.5px] tabular-nums">{t0(Math.max(0, time - trim.start))} / {t0(len)}</span>
                        <input type="range" min={trim.start} max={trim.end || 1} step={0.05} value={Math.min(Math.max(time, trim.start), trim.end)}
                            onChange={(e) => seek(Number(e.target.value))} className="h-1 flex-1 accent-primary" aria-label="Seek" />
                    </div>
                </div>

                {/* Cover — beside the player: picture on the left, text + buttons on the right. */}
                <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-border bg-card p-3 text-[12.5px] md:h-[230px]">
                    <p className="flex items-center gap-1.5 text-[14px] font-bold"><ImageIcon className="size-4 text-primary" /> Cover</p>
                    <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setCover({ file: f, url: URL.createObjectURL(f) }); }} />
                    <div className="flex min-w-0 flex-wrap items-start gap-3">
                        <button type="button" onClick={() => coverRef.current?.click()} className="relative aspect-video w-[160px] shrink-0 overflow-hidden rounded-lg border border-dashed border-primary/40 bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {cover ? <img src={cover.url} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[11.5px] text-muted-foreground">First frame</span>}
                        </button>
                        <div className="flex min-w-[150px] flex-1 flex-col gap-2">
                            <p className="text-[12px] text-muted-foreground">The picture shown on the gallery tile. Without one, the video&apos;s first frame is used. JPG, PNG or WEBP.</p>
                            <span className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" className="h-8" onClick={() => coverRef.current?.click()}><Upload className="size-3.5" /> {cover ? "Change" : "Choose"} Cover</Button>
                                {cover && <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => setCover(null)}><X className="size-3.5" /> Remove</Button>}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <TrimTimeline src={q.url} duration={duration} trim={trim} time={time} onSeek={seek}
                onTrim={(t) => { const c = clampTrim(t, duration); setTrim(c); if (time < c.start || time > c.end) seek(c.start); }} />
            {tooBig && (
                <p className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                    <Info className="size-4" /> The kept part is about {bytes(estimate)} — videos can be up to {bytes(maxBytes)}. Trim it shorter.
                </p>
            )}

            <MusicSection music={music} onPick={(m) => { if (music) URL.revokeObjectURL(music.url); setMusic(m); setMusicStart(0); }}
                onRemove={() => { if (music) URL.revokeObjectURL(music.url); setMusic(null); }}
                musicStart={musicStart} onMusicStart={setMusicStart} mute={mute} onMute={setMute} len={len}
                playing={playing} onPlay={play} musicReplacesSound />

            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button onClick={apply}><Check className="size-4" /> Apply</Button>
            </div>
        </div>
    );
}
