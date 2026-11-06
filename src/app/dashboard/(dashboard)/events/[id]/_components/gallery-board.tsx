"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ArrowLeft, Check, CheckSquare, ChevronDown, ChevronRight, CloudUpload, Copy, Download, Eye, Film, Folder, FolderInput,
    FolderPlus, Image as ImageIcon, Images, Info, LayoutGrid, List, Lock, MoreVertical, Pencil, Play, RotateCcw, Search,
    Square, Trash2, Upload, Video, X, Zap, type LucideIcon,
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
    SearchBox, SortSelect, StatTile, StatusPill, Toolbar,
} from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import { useDateFormatter } from "@/hooks/use-client-settings";
import {
    useDeleteGalleryCategory, useEventGallery, useGalleryBulk, useSaveGalleryCategory, useUploadGalleryCover,
    useUploadGalleryItem, type GalleryCategory, type GalleryFolderType, type GalleryItem,
} from "@/hooks/use-event-modules";
import { EditMediaDialog, MediaViewer, ShortDialog } from "./gallery-panel";
import { AlbumBuilder, AlbumCards } from "./album-builder";
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

type View = { kind: "overview" } | { kind: "folder"; id: number | null } | { kind: "upload"; folderId?: number; files?: File[] } | { kind: "album"; album: GalleryAlbum | null };
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
                    onFolder={setFolderSheet} onOpen={(id) => setView({ kind: "folder", id })} />
            )}
            {view.kind === "album" && (
                <AlbumBuilder key={view.album?.id ?? "new"} eventId={eventId} album={view.album} folders={folders}
                    images={items.filter((i) => i.type === "image")} onBack={() => setView({ kind: "overview" })} />
            )}
            {view.kind === "upload" && (
                <UploadView eventId={eventId} folders={folders} initialFolder={view.folderId} initialFiles={view.files}
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
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<"order" | "name" | "items">("order");
    const [grid, setGrid] = useState(true);
    const [deleting, setDeleting] = useState<GalleryCategory | null>(null);
    const count = (k: Kind) => items.filter((i) => kindOf(i) === k).length;
    const shown = folders
        .filter((f) => !search.trim() || f.name.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "items" ? b.item_count - a.item_count : 0));
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

            <Toolbar>
                <SearchBox value={search} onChange={setSearch} placeholder="Search folders..." className="max-w-[320px]" />
                <SortSelect value={sort} onChange={setSort} className="w-[190px]" options={[{ value: "order", label: "Sort: Display Order" }, { value: "name", label: "Sort: Name" }, { value: "items", label: "Sort: Most Items" }]} />
                <GridToggle grid={grid} onChange={setGrid} />
            </Toolbar>

            {grid ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {shown.map((f) => <FolderCard key={f.id} f={f} onOpen={() => onOpen(f.id)} onEdit={() => onFolder(f)} onUpload={() => onUpload(undefined, f.id)} onDelete={() => setDeleting(f)} />)}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full text-[12.5px]">
                        <thead><tr className="border-b border-border text-left text-[11.5px] text-foreground/80">
                            {["Folder", "Type", "Images", "Videos", "Shorts", "Total", ""].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
                        </tr></thead>
                        <tbody>{shown.map((f) => (
                            <tr key={f.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30" onClick={() => onOpen(f.id)}>
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
                        <Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>Delete Folder</Button>
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

function FolderCard({ f, onOpen, onEdit, onUpload, onDelete }: { f: GalleryCategory; onOpen: () => void; onEdit: () => void; onUpload: () => void; onDelete: () => void }) {
    const c = f.counts ?? { images: 0, videos: 0, shorts: 0 };
    return (
        <div className={cn("flex gap-3 rounded-xl border bg-card p-3 transition hover:border-primary/40", f.is_default ? "border-primary/30 bg-primary/[0.03]" : "border-border")}>
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
    eventId, items, folders, folderId, onBack, onUpload, onFolder, onOpen,
}: {
    eventId: number; items: GalleryItem[]; folders: GalleryCategory[]; folderId: number | null;
    onBack: () => void; onUpload: (folderId?: number) => void; onFolder: (f: GalleryCategory) => void; onOpen: (id: number | null) => void;
}) {
    const fmt = useDateFormatter();
    const bulk = useGalleryBulk(eventId);
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
                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setEditing(i)}><Pencil className="size-4" /> Edit</DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setMoving({ ids: [i.id], copy: false })}><FolderInput className="size-4" /> Move to Folder</DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setMoving({ ids: [i.id], copy: true })}><Copy className="size-4" /> Copy to Folder</DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => download([i])}><Download className="size-4" /> Download</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-[13px] text-destructive focus:text-destructive" onClick={() => setDeleting([i.id])}><Trash2 className="size-4" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
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
                        <GridToggle grid={grid} onChange={setGrid} />
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
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-border bg-card">
                        <table className="w-full text-[12.5px]">
                            <thead><tr className="border-b border-border text-left text-[11.5px] text-foreground/80">
                                {multi && <th className="w-8 px-3 py-2"><Checkbox checked={allOn} onCheckedChange={() => setSel(allOn ? [] : pageItems.map((i) => i.id))} /></th>}
                                {["Media", "File Name", "Type", "Size", "Duration", "Uploaded On", ""].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
                            </tr></thead>
                            <tbody>{pageItems.map((i) => {
                                const k = KIND_META[kindOf(i)];
                                return (
                                    <tr key={i.id} className={cn("cursor-pointer border-b border-border last:border-0 hover:bg-muted/30", picked === i.id && "bg-primary/5")} onClick={() => tap(i.id)}>
                                        {multi && <td className="px-3 py-1.5"><Checkbox checked={sel.includes(i.id)} onCheckedChange={() => tap(i.id)} onClick={(e) => e.stopPropagation()} /></td>}
                                        <td className="px-3 py-1.5"><Thumb item={i} className="h-9 w-12 rounded" /></td>
                                        <td className="max-w-[220px] truncate px-3 py-1.5 font-medium">{name(i)}</td>
                                        <td className="px-3 py-1.5"><StatusPill tone={k.tone} icon={k.icon}>{k.label}</StatusPill></td>
                                        <td className="px-3 py-1.5">{bytes(i.size_bytes)}</td>
                                        <td className="px-3 py-1.5">{secs(i.duration_seconds) || "—"}</td>
                                        <td className="px-3 py-1.5 whitespace-nowrap">{i.created_at ? fmt(i.created_at, true) : "—"}</td>
                                        <td className="px-3 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>{menu(i)}</td>
                                    </tr>
                                );
                            })}</tbody>
                        </table>
                    </div>
                )}
                <Pager page={current} pageSize={PAGE} total={shown.length} onPage={setPage} noun="items" />
            </div>

            {pick && (
                <DetailPanel item={pick} folderName={folderName(pick.category_id)} name={name(pick)}
                    onClose={() => setPicked(null)} onView={() => setViewer(Math.max(0, shown.indexOf(pick)))}
                    onEdit={() => setEditing(pick)} onMove={() => setMoving({ ids: [pick.id], copy: false })}
                    onDownload={() => download([pick])} onDelete={() => setDeleting([pick.id])} />
            )}

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
    item, folderName, name, onClose, onView, onEdit, onMove, onDownload, onDelete,
}: {
    item: GalleryItem; folderName: string; name: string; onClose: () => void; onView: () => void;
    onEdit: () => void; onMove: () => void; onDownload: () => void; onDelete: () => void;
}) {
    const fmt = useDateFormatter();
    const [tab, setTab] = useState<"details" | "actions">("details");
    const k = KIND_META[kindOf(item)];
    const row = (l: string, v: React.ReactNode) => <div className="grid grid-cols-[96px_1fr] gap-2 py-1 text-[12px]"><span className="text-muted-foreground">{l}</span><span className="min-w-0 break-words font-medium">{v || "—"}</span></div>;
    const act = (I: LucideIcon, l: string, fn: () => void, danger?: boolean) => (
        <button type="button" onClick={fn} className={cn("flex flex-col items-center gap-1 rounded-lg border p-2 text-[11.5px] font-medium hover:bg-muted", danger ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border")}><I className="size-4" /> {l}</button>
    );
    return (
        <div className="flex h-fit flex-col overflow-hidden rounded-xl border border-primary/15 bg-card xl:sticky xl:top-4">
            <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><k.icon className="size-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-bold" title={name}>{name}</p><p className="text-[11.5px] text-muted-foreground">{k.label} • {bytes(item.size_bytes)}</p></div>
                <Button size="icon" variant="ghost" className="size-7" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
            </div>
            <div className="p-3">
                {item.type === "video"
                     
                    ? <video src={mediaUrl(item.url)} poster={mediaUrl(item.thumbnail_url) || undefined} controls className="aspect-video w-full rounded-lg bg-black" />
                    : <button type="button" onClick={onView} className="block w-full"><Thumb item={item} className="aspect-video w-full rounded-lg" /></button>}
            </div>
            <div className="flex border-b border-border px-3">
                {(["details", "actions"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)} className={cn("relative px-3 py-2 text-[12.5px] capitalize", tab === t ? "font-semibold text-primary" : "text-muted-foreground")}>
                        {t}{tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
                    </button>
                ))}
            </div>
            {tab === "details" ? (
                <div className="px-3 py-2">
                    {row("File Name", item.file_name)}
                    {row("Type", `${k.label}${item.type === "video" ? " (MP4)" : ""}`)}
                    {row("Size", `${bytes(item.size_bytes)} (${item.size_bytes.toLocaleString()} bytes)`)}
                    {item.type === "video" && row("Duration", secs(item.duration_seconds) || "—")}
                    {row("Uploaded On", item.created_at ? fmt(item.created_at, true) : null)}
                    {row("Location", `Event Media › ${folderName}`)}
                    {row("In the App", item.show_in_app ? "Shown" : "Hidden")}
                    {item.description && row("Description", item.description)}
                </div>
            ) : <p className="px-3 py-2 text-[12px] text-muted-foreground">Choose an action below.</p>}
            <div className="grid grid-cols-5 gap-1.5 border-t border-border p-3">
                {act(Pencil, "Edit", onEdit)}{act(Download, "Download", onDownload)}{act(FolderInput, "Move", onMove)}{act(Eye, "View", onView)}{act(Trash2, "Delete", onDelete, true)}
            </div>
        </div>
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

type Queued = { key: string; file: File; url: string; kind: "image" | "video"; status: "queued" | "uploading" | "done" | "failed"; error?: string; checked: boolean };
const IMAGE_RE = /^image\/(jpeg|png|webp|gif)$/;
const VIDEO_RE = /^video\/(mp4|webm|quicktime)$/;

function UploadView({
    eventId, folders, initialFolder, initialFiles, onGallery, onNewFolder,
}: { eventId: number; folders: GalleryCategory[]; initialFolder?: number; initialFiles?: File[]; onGallery: (id?: number) => void; onNewFolder: () => void }) {
    const upload = useUploadGalleryItem(eventId);
    const usage = useEventGallery(eventId).data?.usage;
    const def = folders.find((f) => f.is_default) ?? folders[0];
    const [folderId, setFolderId] = useState<number>(initialFolder ?? def?.id ?? 0);
    const folder = folders.find((f) => f.id === folderId) ?? def;
    const [kind, setKind] = useState<"images" | "videos" | "shorts">(folder?.folder_type === "videos" ? "videos" : folder?.folder_type === "shorts" ? "shorts" : "images");
    const [queue, setQueue] = useState<Queued[]>([]);
    const [over, setOver] = useState(false);
    const [shortOpen, setShortOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const pickRef = useRef<HTMLInputElement>(null);
    const seeded = useRef(false);

    const add = (files: File[]) => {
        const maxImg = usage?.max_image_bytes ?? 10 * 1024 * 1024;
        const maxVid = usage?.max_video_bytes ?? 100 * 1024 * 1024;
        const next: Queued[] = [];
        for (const file of files) {
            const k = IMAGE_RE.test(file.type) ? "image" : VIDEO_RE.test(file.type) ? "video" : null;
            if (!k) { toast.error(`${file.name}: not a JPG, PNG, WEBP, GIF, MP4, WebM or MOV file.`); continue; }
            if (!takes(folder?.folder_type, k)) { toast.error(`${file.name}: "${folder?.name}" takes ${folder?.folder_type} only.`); continue; }
            if (file.size > (k === "image" ? maxImg : maxVid)) { toast.error(`${file.name} is larger than ${bytes(k === "image" ? maxImg : maxVid)}.`); continue; }
            next.push({ key: `${file.name}-${file.size}-${Math.random()}`, file, url: URL.createObjectURL(file), kind: k, status: "queued", checked: false });
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
    useEffect(() => () => queue.forEach((q) => URL.revokeObjectURL(q.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (key: string, patch: Partial<Queued>) => setQueue((q) => q.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    const runOne = (q: Queued) => new Promise<void>((resolve) => {
        set(q.key, { status: "uploading", error: undefined });
        upload.mutate({ file: q.file, categoryId: folderId }, {
            onSuccess: () => { set(q.key, { status: "done" }); resolve(); },
            onError: (e) => { set(q.key, { status: "failed", error: e instanceof Error ? e.message : "Upload failed" }); resolve(); },
        });
    });
    const uploadAll = async () => {
        setBusy(true);
        for (const q of queue.filter((x) => x.status === "queued" || x.status === "failed")) await runOne(q); // one by one, as the plan limits are checked per file
        setBusy(false);
    };
    const pending = queue.filter((x) => x.status === "queued" || x.status === "failed").length;
    const failed = queue.filter((x) => x.status === "failed").length;
    const checked = queue.filter((x) => x.checked).length;
    const accept = kind === "images" ? "image/jpeg,image/png,image/webp,image/gif" : "video/mp4,video/webm,video/quicktime";

    return (
        <div className="flex flex-col gap-3">
            <ModuleHeader title="Upload Media to Gallery" subtitle="Add photos, videos, and short clips to your event gallery."
                actions={<><Button variant="outline" size="sm" className="h-8" onClick={onNewFolder}><FolderPlus className="size-3.5" /> Create Folder</Button><Button variant="outline" size="sm" className="h-8" onClick={() => onGallery(folderId)}><Images className="size-3.5" /> View Gallery</Button></>} />

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-end">
                <FormField label="Upload to Folder" required>
                    <Select value={String(folderId)} onValueChange={(v) => setFolderId(Number(v))}>
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
                        <span className="text-[11px] text-muted-foreground">{kind === "images" ? `JPG, PNG, WEBP, GIF • Max ${bytes(usage?.max_image_bytes ?? 10485760)} per image` : `MP4, WebM, MOV • Max ${bytes(usage?.max_video_bytes ?? 104857600)} per video`} • You can upload multiple files at once.</span>
                    </button>
                </>
            )}

            {queue.length > 0 && (
                <div className="rounded-xl border border-border bg-card">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                        <p className="text-[14px] font-bold">Upload Queue <span className="font-normal text-muted-foreground">({queue.length} files)</span></p>
                        <span className="ml-auto flex flex-wrap gap-1.5">
                            <label className="flex items-center gap-1.5 px-1 text-[12px]"><Checkbox checked={checked === queue.length} onCheckedChange={(v) => setQueue((q) => q.map((x) => ({ ...x, checked: v === true })))} /> Select All</label>
                            <Button size="sm" variant="outline" className="h-7 border-destructive/40 text-destructive" disabled={!checked || busy} onClick={() => setQueue((q) => q.filter((x) => !x.checked))}><Trash2 className="size-3.5" /> Remove Selected ({checked})</Button>
                            <Button size="sm" variant="outline" className="h-7" disabled={!failed || busy} onClick={uploadAll}><RotateCcw className="size-3.5" /> Retry Failed ({failed})</Button>
                            <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setQueue((q) => q.filter((x) => x.status !== "done"))}><Check className="size-3.5" /> Clear Completed</Button>
                        </span>
                    </div>
                    <div className="divide-y divide-border">
                        {queue.map((q) => (
                            <div key={q.key} className="flex items-center gap-3 px-3 py-2">
                                <Checkbox checked={q.checked} onCheckedChange={(v) => set(q.key, { checked: v === true })} />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {q.kind === "image" ? <img src={q.url} alt="" className="h-10 w-14 rounded object-cover" /> : <video src={q.url} muted className="h-10 w-14 rounded bg-black object-cover" />}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[12.5px] font-semibold">{q.file.name}</p>
                                    <p className="text-[11px] text-muted-foreground">{q.file.type.split("/")[1]?.toUpperCase()} • {bytes(q.file.size)}</p>
                                </div>
                                <StatusPill tone={q.kind === "image" ? "primary" : "violet"} icon={q.kind === "image" ? ImageIcon : Video}>{q.kind === "image" ? "Image" : "Video"}</StatusPill>
                                <div className="w-[170px] text-[12px]">
                                    {q.status === "queued" && <span className="text-muted-foreground">Ready to upload</span>}
                                    {q.status === "uploading" && <span className="flex flex-col gap-1"><span className="text-primary">Uploading…</span><span className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full w-2/3 animate-pulse rounded-full bg-primary" /></span></span>}
                                    {q.status === "done" && <span className="flex items-center gap-1 text-success"><Check className="size-3.5" /> Uploaded successfully</span>}
                                    {q.status === "failed" && <span className="block text-destructive" title={q.error}><b>Upload failed</b><br /><span className="text-[11px]">{q.error}</span></span>}
                                </div>
                                {q.status === "failed" && <Button size="sm" variant="outline" className="h-7 border-primary/40 text-primary" onClick={() => runOne(q)}><RotateCcw className="size-3" /> Retry</Button>}
                                <Button size="icon" variant="ghost" className="size-7 text-destructive" disabled={q.status === "uploading"} aria-label="Remove" onClick={() => setQueue((x) => x.filter((y) => y.key !== q.key))}><Trash2 className="size-4" /></Button>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2.5">
                        <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Info className="size-3.5" /> Images (JPG, PNG, WEBP, GIF) • Videos (MP4, WebM, MOV) • To trim a video or add music, use the Shorts tab.</p>
                        <Button className="ml-auto" disabled={!pending || busy} onClick={uploadAll}><Upload className="size-3.5" /> {busy ? "Uploading…" : `Upload Media (${pending})`}</Button>
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

