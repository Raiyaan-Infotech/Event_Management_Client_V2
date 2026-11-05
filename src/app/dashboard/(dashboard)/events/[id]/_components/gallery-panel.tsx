"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ArrowLeft, ArrowRightLeft, CheckCircle2, ChevronLeft, ChevronRight, Crop, Download, Eye, Film, GripVertical, ImagePlus,
    LayoutGrid, List, Loader2, Maximize2, MoreVertical, Music, Pencil, Play, Plus, Search, SquareCheck, Trash2, Upload, Video, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import { ImageCropDialog } from "@/components/common/image-crop-dialog";
import {
    useDeleteGalleryCategory, useDeleteGalleryItem, useEventGallery, useReorderGallery, useReplaceGalleryCover,
    useSaveGalleryCategory, useUpdateGalleryItem, useUploadGalleryCover, useUploadGalleryItem, useUploadShort,
    type GalleryCategory, type GalleryItem, type GalleryUsage,
} from "@/hooks/use-event-modules";
import { Empty, FieldError, PanelLoading, Section, SwitchRow } from "./module-ui";

/**
 * Gallery — the SAME as the V1 app's organizer Gallery (Jamal, 2026-11-03):
 *
 *   Gallery Categories: search, a list / cards switch, a row per category
 *   (cover, name, item count, ⋮ = Edit / Delete — none on the built-in
 *   "Gallery"), Add Category under the list (Name *, Description, Cover Image,
 *   Display Order). A tap opens the category.
 *
 *   One category's media: back, name over its item count, a grid / list
 *   toggle. A tap on a tile opens the actions: View Full Screen, Edit Media
 *   (Show in Event App; a video's Title, Description, Change Cover), Move to
 *   Another Category, Reorder Media, Download, Remove from Gallery. "Select"
 *   picks several (Cancel · N items selected · Select All · Remove). Upload
 *   Media at the bottom (several photos and videos, Crop for photos, the
 *   plan's counts checked first) and Upload Short.
 *
 * No "Plan limits" card — the app shows what is left only when uploading.
 */

const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
const SHORT_MAX_SECONDS = 60;
const SHORT_MAX_BYTES = 10 * 1024 * 1024;
/** A longer video may be sent to be TRIMMED on the server (the cut must fit SHORT_MAX_BYTES). */
const SHORT_SOURCE_MAX_BYTES = 50 * 1024 * 1024;
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** What is left on the plan for this event (Infinity = unlimited). */
function leftOf(usage: GalleryUsage) {
    return {
        photos: usage.photos.limit === null ? Infinity : Math.max(0, usage.photos.limit - usage.photos.used),
        videos: usage.videos.limit === null ? Infinity : Math.max(0, usage.videos.limit - usage.videos.used),
        bytes: usage.storage.limit_bytes === null || usage.storage.limit_bytes === undefined
            ? Infinity
            : usage.storage.limit_bytes - (usage.storage.used_bytes ?? 0),
    };
}

export function GalleryPanel({ eventId }: { eventId: number }) {
    const [open, setOpen] = useState<GalleryCategory | null>(null);
    return open
        ? <CategoryMedia eventId={eventId} category={open} onBack={() => setOpen(null)} onCategory={setOpen} />
        : <CategoryList eventId={eventId} onOpen={setOpen} />;
}

/* ── Gallery Categories ─────────────────────────────────────────────────── */

function CategoryList({ eventId, onOpen }: { eventId: number; onOpen: (c: GalleryCategory) => void }) {
    const query = useEventGallery(eventId);
    const removeCategory = useDeleteGalleryCategory(eventId);
    const [search, setSearch] = useState("");
    const [cards, setCards] = useState(false);
    const [editing, setEditing] = useState<GalleryCategory | "new" | null>(null);
    const [deleting, setDeleting] = useState<GalleryCategory | null>(null);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Gallery"><Empty title="Could not load the gallery">Please try again in a moment.</Empty></Section>;
    }
    const { categories } = query.data;
    const q = search.trim().toLowerCase();
    const shown = categories.filter((c) => !q || c.name.toLowerCase().includes(q));

    const menu = (c: GalleryCategory) => !c.is_default && (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Actions" onClick={(e) => e.stopPropagation()}>
                    <MoreVertical className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => setEditing(c)}><Pencil className="size-3.5" /> Edit</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(c)}>
                    <Trash2 className="size-3.5" /> Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
    const cover = (c: GalleryCategory, cls: string) => (
        <div className={cn("grid shrink-0 place-items-center overflow-hidden bg-muted text-muted-foreground", cls)}>
            {c.cover_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={mediaUrl(c.cover_url)} alt="" className="h-full w-full object-cover" />
                : <ImagePlus className="size-5" />}
        </div>
    );
    const count = (c: GalleryCategory) => `${c.item_count} ${c.item_count === 1 ? "item" : "items"}`;

    return (
        <div className="flex flex-col gap-5">
            <Section title="Gallery Categories">
                <div className="mb-3 flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories" className="h-9 pl-8 text-[13px]" />
                    </div>
                    <ViewToggle grid={cards} onChange={setCards} />
                </div>

                {shown.length === 0 ? (
                    <Empty title={categories.length ? "No categories match" : "No categories yet"} />
                ) : cards ? (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {shown.map((c) => (
                            <li key={c.id} onClick={() => onOpen(c)} className="cursor-pointer overflow-hidden rounded-lg border border-border hover:border-primary/40">
                                {cover(c, "aspect-square w-full")}
                                <div className="flex items-center gap-1 p-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[13px] font-semibold">{c.name}</p>
                                        <p className="text-[11.5px] text-muted-foreground">{count(c)}</p>
                                    </div>
                                    {menu(c)}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {shown.map((c) => (
                            <li key={c.id} onClick={() => onOpen(c)} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-2.5 hover:border-primary/40">
                                {cover(c, "size-14 rounded-md")}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-semibold">{c.name}</p>
                                    <p className="text-[12px] text-muted-foreground">{count(c)}</p>
                                </div>
                                {menu(c)}
                            </li>
                        ))}
                    </ul>
                )}

                <Button className="mt-4 w-full" variant="outline" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add Category</Button>
            </Section>

            {editing && (
                <CategoryDialog
                    key={editing === "new" ? "new" : editing.id}
                    eventId={eventId}
                    category={editing === "new" ? null : editing}
                    categories={categories}
                    onClose={() => setEditing(null)}
                />
            )}

            <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete &quot;{deleting?.name}&quot;?</DialogTitle>
                        <DialogDescription>Its photos and videos are not deleted — they move to Gallery.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={removeCategory.isPending}
                            onClick={() => deleting && removeCategory.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ViewToggle({ grid, onChange }: { grid: boolean; onChange: (grid: boolean) => void }) {
    return (
        <div className="flex shrink-0 rounded-md border border-border p-0.5">
            <button type="button" aria-label="List" onClick={() => onChange(false)}
                className={cn("grid size-8 place-items-center rounded", !grid ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                <List className="size-4" />
            </button>
            <button type="button" aria-label="Grid" onClick={() => onChange(true)}
                className={cn("grid size-8 place-items-center rounded", grid ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                <LayoutGrid className="size-4" />
            </button>
        </div>
    );
}

function CategoryDialog({
    eventId, category, categories, onClose,
}: { eventId: number; category: GalleryCategory | null; categories: GalleryCategory[]; onClose: () => void }) {
    const save = useSaveGalleryCategory(eventId);
    const uploadCover = useUploadGalleryCover(eventId);
    const coverRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(category?.name ?? "");
    const [description, setDescription] = useState(category?.description ?? "");
    const [cover, setCover] = useState<string | null>(category?.cover_image ?? null);
    // Display Order = a position in the list, 1 = first (the built-in Gallery always leads).
    const current = category ? categories.findIndex((c) => c.id === category.id) + 1 : categories.length + 1;
    const [order, setOrder] = useState(String(current));
    const [tried, setTried] = useState(false);
    const [done, setDone] = useState(false);

    const pickCover = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { toast.error("Images must be 5 MB or smaller."); return; }
        const res = await uploadCover.mutateAsync(file).catch(() => null);
        if (res?.url) setCover(res.url);
    };

    const submit = () => {
        setTried(true);
        if (!name.trim()) { toast.error("Please fill all mandatory fields."); return; }
        const position = Number(order);
        save.mutate(
            {
                id: category?.id,
                data: {
                    name: name.trim(), description: description.trim() || null, cover_image: cover,
                    ...(category?.is_default ? {} : { position: Number.isFinite(position) && position >= 1 ? position : null }),
                },
            },
            { onSuccess: () => setDone(true) },
        );
    };

    if (done) {
        return (
            <Dialog open onOpenChange={(o) => !o && onClose()}>
                <DialogContent className="sm:max-w-md">
                    <div className="flex flex-col items-center gap-3 py-4 text-center">
                        <CheckCircle2 className="size-16 text-success" />
                        <DialogTitle className="text-[18px]">{category ? "Category Updated Successfully!" : "Category Added Successfully!"}</DialogTitle>
                        <DialogDescription className="sr-only">Saved</DialogDescription>
                        <Button className="mt-2 w-full" onClick={onClose}>Back to Categories</Button>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{category ? "Edit Gallery Category" : "Add Gallery Category"}</DialogTitle>
                    <DialogDescription className="sr-only">Category</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Name <span className="text-destructive">*</span></Label>
                        <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={cn(tried && !name.trim() && "border-destructive")} />
                        <FieldError show={tried && !name.trim()} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Description</Label>
                        <Textarea value={description} maxLength={200} rows={2} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Cover Image</Label>
                        <div className="flex items-center gap-3">
                            <button
                                type="button" onClick={() => coverRef.current?.click()} disabled={uploadCover.isPending}
                                className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted text-muted-foreground"
                                aria-label="Choose cover image"
                            >
                                {cover
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={mediaUrl(cover)} alt="" className="h-full w-full object-cover" />
                                    : <ImagePlus className="size-6" />}
                            </button>
                            <div className="flex flex-col items-start gap-1">
                                <Button type="button" size="sm" variant="outline" disabled={uploadCover.isPending} onClick={() => coverRef.current?.click()}>
                                    {uploadCover.isPending ? "Uploading…" : "Choose Image"}
                                </Button>
                                {cover && (
                                    <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setCover(null)}>
                                        <X className="size-3.5" /> Remove
                                    </Button>
                                )}
                            </div>
                            <input
                                ref={coverRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp"
                                onChange={(e) => { void pickCover(e.target.files?.[0]); e.target.value = ""; }}
                            />
                        </div>
                    </div>
                    {!category?.is_default && (
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Display Order</Label>
                            <Input type="number" min={2} max={categories.length + (category ? 0 : 1)} value={order}
                                onChange={(e) => setOrder(e.target.value)} className="max-w-[120px]" />
                            <p className="text-[11.5px] text-muted-foreground">Its place in the list (Gallery is always first).</p>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={save.isPending} onClick={submit}>{category ? "Update" : "Add Category"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ── One category's media ───────────────────────────────────────────────── */

function CategoryMedia({
    eventId, category, onBack, onCategory,
}: {
    eventId: number; category: GalleryCategory; onBack: () => void; onCategory: (c: GalleryCategory) => void;
}) {
    const query = useEventGallery(eventId, category.is_default ? 0 : category.id);
    const removeItem = useDeleteGalleryItem(eventId);
    const reorder = useReorderGallery(eventId);
    const [grid, setGrid] = useState(true);
    const [acting, setActing] = useState<GalleryItem | null>(null);
    const [viewing, setViewing] = useState<number | null>(null);
    const [editing, setEditing] = useState<GalleryItem | null>(null);
    const [moving, setMoving] = useState<GalleryItem | null>(null);
    const [removing, setRemoving] = useState<GalleryItem[] | null>(null);
    const [selected, setSelected] = useState<Set<number> | null>(null); // null = not selecting
    const [order, setOrder] = useState<number[] | null>(null); // non-null = reordering
    const [dragId, setDragId] = useState<number | null>(null);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [shortOpen, setShortOpen] = useState(false);

    const items = useMemo(() => query.data?.items ?? [], [query.data]);
    const categories = query.data?.categories ?? [];
    const live = categories.find((c) => c.id === category.id) ?? category;

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title={category.name}><Empty title="Could not load this category">Please try again in a moment.</Empty></Section>;
    }
    const { usage } = query.data;
    const shown = order ? order.map((id) => items.find((i) => i.id === id)).filter((i): i is GalleryItem => !!i) : items;

    const toggle = (id: number) => setSelected((s) => {
        const next = new Set(s ?? []);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const dropOn = (target: number) => {
        if (!order || dragId === null || dragId === target) return setDragId(null);
        const ids = [...order];
        ids.splice(ids.indexOf(target), 0, ids.splice(ids.indexOf(dragId), 1)[0]);
        setOrder(ids);
        setDragId(null);
    };
    const removeMany = async (list: GalleryItem[]) => {
        for (const it of list) {
            try { await removeItem.mutateAsync(it.id); } catch { break; }
        }
        setRemoving(null);
        setSelected(null);
    };

    const thumb = (item: GalleryItem, cls: string) => (
        <div className={cn("relative overflow-hidden bg-muted", cls)}>
            {item.type === "image" || item.thumbnail_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={mediaUrl(item.thumbnail_url || item.url)} alt="" className={cn("h-full w-full object-cover", !item.show_in_app && "opacity-50")} />
                : <span className="grid h-full w-full place-items-center text-muted-foreground"><Video className="size-6" /></span>}
            {item.type === "video" && (
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                    <span className="grid size-8 place-items-center rounded-full bg-black/55 text-white"><Play className="ml-0.5 size-4" /></span>
                </span>
            )}
        </div>
    );

    return (
        <div className="flex flex-col gap-5">
            <div className="min-w-0 rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center gap-2">
                    <Button size="icon" variant="ghost" className="size-8" aria-label="Back" onClick={onBack}><ArrowLeft className="size-4" /></Button>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold">{live.name}</p>
                        <p className="text-[12px] text-muted-foreground">{items.length} {items.length === 1 ? "item" : "items"}</p>
                    </div>
                    <ViewToggle grid={grid} onChange={setGrid} />
                </div>

                {selected && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-[12.5px]">
                        <button type="button" className="font-medium text-primary" onClick={() => setSelected(null)}>Cancel</button>
                        <span className="flex-1 text-center font-semibold">{selected.size} items selected</span>
                        <button type="button" className="font-medium text-primary" onClick={() => setSelected(new Set(items.map((i) => i.id)))}>Select All</button>
                        <Button size="sm" variant="destructive" className="h-7" disabled={!selected.size}
                            onClick={() => setRemoving(items.filter((i) => selected.has(i.id)))}>
                            <Trash2 className="size-3.5" /> Remove
                        </Button>
                    </div>
                )}
                {order && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-[12.5px]">
                        <span className="flex-1 font-medium">Drag the items into the order you want.</span>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setOrder(null)}>Cancel</Button>
                        <Button size="sm" className="h-7" disabled={reorder.isPending}
                            onClick={() => reorder.mutate(order, { onSuccess: () => { setOrder(null); toast.success("Order saved"); } })}>
                            Save Order
                        </Button>
                    </div>
                )}

                {items.length === 0 ? (
                    <Empty title="No photos or videos here yet">
                        Click Upload Media to add some. Photos up to {mb(usage.max_image_bytes)} MB, videos up to {mb(usage.max_video_bytes)} MB.
                    </Empty>
                ) : (
                    <ul className={cn(grid ? "grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" : "flex flex-col gap-2")}>
                        {shown.map((item, index) => {
                            const ticked = selected?.has(item.id) ?? false;
                            return (
                                <li
                                    key={item.id}
                                    draggable={!!order}
                                    onDragStart={() => setDragId(item.id)}
                                    onDragOver={(e) => order && e.preventDefault()}
                                    onDrop={() => dropOn(item.id)}
                                    onClick={() => (selected ? toggle(item.id) : order ? undefined : setActing(item))}
                                    className={cn(
                                        "relative cursor-pointer overflow-hidden rounded-md border border-border",
                                        !grid && "flex items-center gap-3 p-2",
                                        ticked && "ring-2 ring-primary",
                                        dragId === item.id && "opacity-50",
                                    )}
                                >
                                    {thumb(item, grid ? "aspect-square w-full" : "size-14 shrink-0 rounded")}
                                    {!grid && (
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-medium">{item.title || item.file_name || (item.type === "video" ? "Video" : "Photo")}</p>
                                            <p className="text-[11.5px] text-muted-foreground">
                                                {item.is_short ? "Short" : item.type === "video" ? "Video" : "Photo"} · {mb(item.size_bytes)} MB{!item.show_in_app ? " · Hidden" : ""}
                                            </p>
                                        </div>
                                    )}
                                    {selected && (
                                        <span className={cn("absolute bottom-1.5 right-1.5 grid size-5 place-items-center rounded border-2 border-white bg-black/30", ticked && "bg-primary")}>
                                            {ticked && <SquareCheck className="size-3.5 text-white" />}
                                        </span>
                                    )}
                                    {order && <GripVertical className="absolute left-1 top-1 size-4 rounded bg-black/40 text-white" />}
                                    {grid && !item.show_in_app && !selected && (
                                        <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[10px] text-white">Hidden</span>
                                    )}
                                    <span className="sr-only">{index + 1}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {!selected && !order && (
                    <div className="mt-4 flex justify-center gap-2">
                        <Button onClick={() => setUploadOpen(true)}><Upload className="size-3.5" /> Upload Media</Button>
                        <Button variant="outline" onClick={() => setShortOpen(true)}><Film className="size-3.5" /> Upload Short</Button>
                    </div>
                )}
            </div>

            {/* The tap menu — as the app's action sheet. */}
            {acting && (
                <Dialog open onOpenChange={(o) => !o && setActing(null)}>
                    <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                            <DialogTitle>{acting.title || (acting.type === "video" ? "Video" : "Photo")}</DialogTitle>
                            <DialogDescription className="sr-only">Actions</DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col">
                            {[
                                { icon: Maximize2, label: "View Full Screen", run: () => setViewing(items.findIndex((i) => i.id === acting.id)) },
                                { icon: Pencil, label: "Edit Media", run: () => setEditing(acting) },
                                { icon: ArrowRightLeft, label: "Move to Another Category", run: () => setMoving(acting) },
                                { icon: GripVertical, label: "Reorder Media", run: () => setOrder(items.map((i) => i.id)) },
                                { icon: SquareCheck, label: "Select", run: () => setSelected(new Set([acting.id])) },
                                { icon: Download, label: "Download", run: () => window.open(mediaUrl(acting.url), "_blank") },
                                { icon: Trash2, label: "Remove from Gallery", run: () => setRemoving([acting]), danger: true },
                            ].map((a) => (
                                <button key={a.label} type="button" onClick={() => { setActing(null); a.run(); }}
                                    className={cn("flex items-center gap-3 rounded-md px-2 py-2.5 text-left text-[13px] hover:bg-muted", a.danger && "text-destructive")}>
                                    <a.icon className="size-4" /> {a.label}
                                </button>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {viewing !== null && items[viewing] && (
                <MediaViewer key={items[viewing].id} items={items} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
            )}
            {editing && <EditMediaDialog key={editing.id} eventId={eventId} item={items.find((i) => i.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
            {moving && (
                <MoveDialog eventId={eventId} item={moving} categories={categories} current={live}
                    onClose={() => setMoving(null)} />
            )}
            {uploadOpen && <UploadDialog eventId={eventId} category={live} usage={usage} onClose={() => setUploadOpen(false)} />}
            {shortOpen && (
                <ShortDialog eventId={eventId} category={live} categories={categories} onClose={() => setShortOpen(false)}
                    onViewGallery={(c) => { setShortOpen(false); if (c && c.id !== live.id) onCategory(c); }} />
            )}

            <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove from Gallery?</DialogTitle>
                        <DialogDescription>
                            {removing && removing.length > 1 ? `${removing.length} items are` : "This item is"} deleted from the gallery and the file removed. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={removeItem.isPending} onClick={() => removing && void removeMany(removing)}>Remove</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** View Full Screen: the whole photo, or the video playing; ‹ › and the arrow keys. */
export function MediaViewer({
    items, index, onIndex, onClose,
}: { items: GalleryItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
    const item = items[index];
    const go = (by: -1 | 1) => {
        const to = index + by;
        if (to >= 0 && to < items.length) onIndex(to);
    };
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent
                className="max-w-4xl gap-3 p-4 sm:max-w-4xl"
                onKeyDown={(e) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); }}
            >
                <DialogHeader>
                    <DialogTitle className="text-[13px]">{index + 1} of {items.length}{item.title ? ` · ${item.title}` : ""}</DialogTitle>
                    <DialogDescription className="sr-only">Full-size view of this gallery item.</DialogDescription>
                </DialogHeader>
                <div className="relative grid min-h-[240px] place-items-center overflow-hidden rounded-md bg-black">
                    {item.type === "video"
                        ? <video src={mediaUrl(item.url)} poster={mediaUrl(item.thumbnail_url) ?? undefined} controls autoPlay playsInline className="max-h-[75vh] w-auto max-w-full" />
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={mediaUrl(item.url)} alt="" className="max-h-[75vh] w-auto max-w-full object-contain" />}
                    {index > 0 && (
                        <Button size="icon" variant="secondary" className="absolute left-2 top-1/2 size-9 -translate-y-1/2 rounded-full" aria-label="Previous" onClick={() => go(-1)}>
                            <ChevronLeft className="size-5" />
                        </Button>
                    )}
                    {index < items.length - 1 && (
                        <Button size="icon" variant="secondary" className="absolute right-2 top-1/2 size-9 -translate-y-1/2 rounded-full" aria-label="Next" onClick={() => go(1)}>
                            <ChevronRight className="size-5" />
                        </Button>
                    )}
                </div>
                {item.description && <p className="text-[12.5px] text-muted-foreground">{item.description}</p>}
            </DialogContent>
        </Dialog>
    );
}

/** Edit Media: Show in Event App; a video's / short's Title, Description and Change Cover. */
export function EditMediaDialog({ eventId, item, onClose }: { eventId: number; item: GalleryItem; onClose: () => void }) {
    const update = useUpdateGalleryItem(eventId);
    const replaceCover = useReplaceGalleryCover(eventId);
    const coverRef = useRef<HTMLInputElement>(null);
    const [show, setShow] = useState(item.show_in_app);
    const [title, setTitle] = useState(item.title ?? "");
    const [description, setDescription] = useState(item.description ?? "");
    const isVideo = item.type === "video";

    const save = () => {
        if (isVideo && item.is_short && !title.trim()) return toast.error("Please enter a title for the short.");
        update.mutate(
            { id: item.id, data: { show_in_app: show, ...(isVideo ? { title: title.trim() || null, description: description.trim() || null } : {}) } },
            { onSuccess: () => { toast.success("Media updated"); onClose(); } },
        );
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Media</DialogTitle>
                    <DialogDescription className="sr-only">Edit</DialogDescription>
                </DialogHeader>
                <div className="relative mx-auto aspect-video w-full max-w-[320px] overflow-hidden rounded-md bg-muted">
                    {item.type === "image" || item.thumbnail_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={mediaUrl(item.thumbnail_url || item.url)} alt="" className="h-full w-full object-cover" />
                        : <span className="grid h-full place-items-center text-muted-foreground"><Video className="size-8" /></span>}
                </div>
                {isVideo && (
                    <>
                        <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) replaceCover.mutate({ id: item.id, file: f }); }} />
                        <Button variant="outline" size="sm" className="mx-auto" disabled={replaceCover.isPending} onClick={() => coverRef.current?.click()}>
                            {replaceCover.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />} Change Cover
                        </Button>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Title {item.is_short && <span className="text-destructive">*</span>}</Label>
                            <Input value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Description</Label>
                            <Textarea value={description} maxLength={500} rows={2} onChange={(e) => setDescription(e.target.value)} />
                        </div>
                    </>
                )}
                <div className="rounded-lg border border-border px-3">
                    <SwitchRow id={`media-show-${item.id}`} label="Show in Event App" hint="Off: guests do not see it" checked={show} onChange={setShow} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={update.isPending} onClick={save}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MoveDialog({
    eventId, item, categories, current, onClose,
}: { eventId: number; item: GalleryItem; categories: GalleryCategory[]; current: GalleryCategory; onClose: () => void }) {
    const update = useUpdateGalleryItem(eventId);
    const others = categories.filter((c) => c.id !== current.id);
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Move to Another Category</DialogTitle>
                    <DialogDescription className="sr-only">Choose a category</DialogDescription>
                </DialogHeader>
                {others.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">There is no other category yet. Add one first.</p>
                ) : (
                    <div className="flex flex-col gap-1">
                        {others.map((c) => (
                            <button key={c.id} type="button" disabled={update.isPending}
                                onClick={() => update.mutate({ id: item.id, data: { category_id: c.id } }, {
                                    onSuccess: () => { toast.success(`Moved to ${c.name}`); onClose(); },
                                })}
                                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-left text-[13px] hover:bg-muted">
                                <span>{c.name}</span>
                                <span className="text-[11.5px] text-muted-foreground">{c.item_count}</span>
                            </button>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

/* ── Upload Media ───────────────────────────────────────────────────────── */

type Picked = { key: string; file: File; url: string; cropped: boolean };

function UploadDialog({
    eventId, category, usage, onClose,
}: { eventId: number; category: GalleryCategory; usage: GalleryUsage; onClose: () => void }) {
    const upload = useUploadGalleryItem(eventId);
    const fileRef = useRef<HTMLInputElement>(null);
    const [picks, setPicks] = useState<Picked[]>([]);
    const [cropping, setCropping] = useState<{ pick: Picked; aspect: number } | null>(null);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const left = leftOf(usage);

    // Every preview URL made here is freed once, when the dialog closes.
    const urls = useRef<string[]>([]);
    const preview = (file: File) => {
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        return url;
    };
    useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

    const add = (files: FileList | null) => {
        if (!files?.length) return;
        setPicks((p) => [...p, ...Array.from(files).map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, url: preview(file), cropped: false }))]);
    };
    const startCrop = (pick: Picked) => {
        const img = new Image();
        img.onload = () => setCropping({ pick, aspect: img.naturalWidth / img.naturalHeight || 1 });
        img.src = pick.url;
    };

    const refuse = (file: File, l: { photos: number; videos: number; bytes: number }) => {
        const isVideo = file.type.startsWith("video/");
        const cap = isVideo ? usage.max_video_bytes : usage.max_image_bytes;
        if (file.size > cap) return `${file.name}: ${isVideo ? "videos" : "photos"} must be ${mb(cap)} MB or smaller (this is ${mb(file.size)} MB).`;
        if (isVideo ? l.videos <= 0 : l.photos <= 0) {
            const limit = isVideo ? usage.videos.limit : usage.photos.limit;
            return `This event has reached its limit of ${limit} ${isVideo ? "video" : "photo"}${limit === 1 ? "" : "s"}. Please upgrade your plan to add more.`;
        }
        if (file.size > l.bytes) return `Not enough storage left for ${file.name} (${mb(Math.max(0, l.bytes))} MB left on your plan).`;
        return null;
    };

    const start = async () => {
        if (!picks.length) return;
        setBusy(true);
        const l = { ...left };
        let done = 0;
        for (const p of picks) {
            const reason = refuse(p.file, l);
            if (reason) { toast.error(reason); break; }
            try {
                await upload.mutateAsync({ file: p.file, categoryId: category.is_default ? undefined : category.id });
            } catch {
                break; // The hook showed the server's reason; the ones before are saved.
            }
            done += 1;
            setProgress(done);
            if (p.file.type.startsWith("video/")) l.videos -= 1; else l.photos -= 1;
            l.bytes -= p.file.size;
        }
        setBusy(false);
        if (done > 0) toast.success(done === 1 ? "Uploaded" : `${done} files uploaded`);
        if (done === picks.length) onClose();
        else setPicks((p) => p.slice(done));
    };

    const fmtLeft = (n: number) => (n === Infinity ? "Unlimited" : String(n));

    return (
        <>
            <Dialog open={!cropping} onOpenChange={(o) => !o && !busy && !cropping && onClose()}>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Upload Media</DialogTitle>
                        <DialogDescription>
                            Into {category.name} · {fmtLeft(left.photos)} photos and {fmtLeft(left.videos)} videos left on your plan.
                        </DialogDescription>
                    </DialogHeader>
                    <input ref={fileRef} type="file" multiple className="hidden"
                        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
                    {picks.length === 0 ? (
                        <button type="button" onClick={() => fileRef.current?.click()}
                            className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted">
                            <ImagePlus className="size-6" /> <span className="text-[12.5px]">Choose photos and videos</span>
                        </button>
                    ) : (
                        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {picks.map((p) => (
                                <li key={p.key} className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
                                    {p.file.type.startsWith("video/")
                                        ? <video src={p.url} muted className="h-full w-full object-cover" />
                                        // eslint-disable-next-line @next/next/no-img-element
                                        : <img src={p.url} alt="" className="h-full w-full object-cover" />}
                                    {p.cropped && <span className="absolute left-1 top-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">Modified</span>}
                                    <div className="absolute right-1 top-1 flex gap-1">
                                        {p.file.type.startsWith("image/") && !busy && (
                                            <button type="button" aria-label="Crop" onClick={() => startCrop(p)}
                                                className="grid size-6 place-items-center rounded-full bg-black/60 text-white"><Crop className="size-3" /></button>
                                        )}
                                        {!busy && (
                                            <button type="button" aria-label="Remove" onClick={() => setPicks((all) => all.filter((x) => x.key !== p.key))}
                                                className="grid size-6 place-items-center rounded-full bg-black/60 text-white"><X className="size-3" /></button>
                                        )}
                                    </div>
                                </li>
                            ))}
                            {!busy && (
                                <li>
                                    <button type="button" onClick={() => fileRef.current?.click()}
                                        className="grid aspect-square w-full place-items-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted">
                                        <Plus className="size-5" />
                                    </button>
                                </li>
                            )}
                        </ul>
                    )}
                    <DialogFooter>
                        <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
                        <Button disabled={busy || !picks.length} onClick={() => void start()}>
                            {busy ? <><Loader2 className="size-3.5 animate-spin" /> Uploading {progress + 1} of {picks.length}…</> : <><Upload className="size-3.5" /> Upload{picks.length ? ` (${picks.length})` : ""}</>}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {cropping && (
                <ImageCropDialog
                    file={cropping.pick.file}
                    open
                    aspect={cropping.aspect}
                    shape="rect"
                    outputSize={2048}
                    title="Crop Image"
                    onOpenChange={(o) => !o && setCropping(null)}
                    onCropped={(file) => {
                        // A cropped photo replaces its original.
                        setPicks((all) => all.map((x) => (x.key === cropping.pick.key
                            ? { ...x, file, url: preview(file), cropped: true } : x)));
                        setCropping(null);
                    }}
                />
            )}
        </>
    );
}

/* ── Upload Short ───────────────────────────────────────────────────────── */

export function ShortDialog({
    eventId, category, categories, onClose, onViewGallery,
}: {
    eventId: number; category: GalleryCategory; categories: GalleryCategory[];
    onClose: () => void; onViewGallery: (c: GalleryCategory | null) => void;
}) {
    const upload = useUploadShort(eventId);
    const videoRef = useRef<HTMLInputElement>(null);
    const musicRef = useRef<HTMLInputElement>(null);
    const coverRef = useRef<HTMLInputElement>(null);
    const [video, setVideo] = useState<{ file: File; url: string; seconds: number } | null>(null);
    /** The part kept, in seconds of the original (as the app's Trim Short). */
    const [trim, setTrim] = useState<[number, number]>([0, 0]);
    const previewRef = useRef<HTMLVideoElement>(null);
    const [mute, setMute] = useState(false);
    const [music, setMusic] = useState<File | null>(null);
    const [musicStart, setMusicStart] = useState("0");
    const [cover, setCover] = useState<{ file: File; url: string } | null>(null);
    const [albumId, setAlbumId] = useState(String(category.id));
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [tried, setTried] = useState(false);
    const [done, setDone] = useState(false);

    const pickVideo = (file: File | undefined) => {
        if (!file) return;
        if (file.size > SHORT_SOURCE_MAX_BYTES) return toast.error(`Please choose a video of ${mb(SHORT_SOURCE_MAX_BYTES)} MB or smaller. This file is ${mb(file.size)} MB.`);
        const url = URL.createObjectURL(file);
        const probe = document.createElement("video");
        probe.preload = "metadata";
        probe.onloadedmetadata = () => {
            // Shorts are vertical, as the server checks.
            if (probe.videoWidth && probe.videoHeight && probe.videoWidth > probe.videoHeight) {
                URL.revokeObjectURL(url);
                toast.error("Shorts must be a vertical (portrait) video.");
                return;
            }
            const seconds = Math.round(probe.duration || 0);
            setVideo({ file, url, seconds });
            // Up to a minute is kept; a longer video starts with its first minute.
            setTrim([0, Math.min(seconds, SHORT_MAX_SECONDS)]);
        };
        probe.onerror = () => toast.error("That video could not be read. Please choose an MP4, WebM or MOV video.");
        probe.src = url;
    };

    const reset = () => {
        setVideo(null); setTrim([0, 0]); setMute(false); setMusic(null); setMusicStart("0"); setCover(null);
        setTitle(""); setDescription(""); setTried(false); setDone(false);
    };

    const submit = () => {
        setTried(true);
        if (!video || !title.trim()) return toast.error("Please choose a video and enter a title.");
        const album = categories.find((c) => String(c.id) === albumId);
        const [from, to] = trim;
        if (to - from > SHORT_MAX_SECONDS + 0.5) return toast.error("A short can be up to 1 minute. Please choose a shorter part.");
        const trimmed = from > 0 || to < video.seconds;
        if (!trimmed && video.file.size > SHORT_MAX_BYTES) {
            return toast.error(`Shorts must be ${mb(SHORT_MAX_BYTES)} MB or smaller. Trim it to a shorter part.`);
        }
        upload.mutate({
            file: video.file, music, musicStart: Number(musicStart) || 0, mute, cover: cover?.file ?? null,
            trimStart: trimmed ? from : undefined, trimEnd: trimmed ? to : undefined,
            title: title.trim(), description: description.trim() || undefined,
            categoryId: album && !album.is_default ? album.id : undefined,
        }, { onSuccess: () => setDone(true) });
    };

    if (done) {
        const album = categories.find((c) => String(c.id) === albumId) ?? null;
        return (
            <Dialog open onOpenChange={(o) => !o && onClose()}>
                <DialogContent className="sm:max-w-md">
                    <div className="flex flex-col items-center gap-3 py-4 text-center">
                        <CheckCircle2 className="size-16 text-success" />
                        <DialogTitle className="text-[18px]">Upload Successful</DialogTitle>
                        <DialogDescription>Your short has been added to {album?.name ?? "the gallery"}.</DialogDescription>
                        <div className="mt-2 grid w-full gap-2">
                            <Button onClick={() => onViewGallery(album)}>View Gallery</Button>
                            <Button variant="outline" onClick={reset}>Upload More</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open onOpenChange={(o) => !o && !upload.isPending && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Upload Short</DialogTitle>
                    <DialogDescription>A video of up to 1 minute ({mb(SHORT_MAX_BYTES)} MB).</DialogDescription>
                </DialogHeader>
                <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
                    onChange={(e) => { pickVideo(e.target.files?.[0]); e.target.value = ""; }} />
                {video ? (
                    <div className="flex flex-col gap-2">
                        <video
                            ref={previewRef} src={video.url} controls muted={mute || !!music}
                            className="mx-auto max-h-[300px] rounded-lg bg-black"
                            // The preview plays only the kept part, in a loop.
                            onLoadedMetadata={(e) => { e.currentTarget.currentTime = trim[0]; }}
                            onTimeUpdate={(e) => {
                                const v = e.currentTarget;
                                if (v.currentTime < trim[0] || v.currentTime > trim[1]) v.currentTime = trim[0];
                            }}
                        />
                        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                            <span>{clock(video.seconds)} · {mb(video.file.size)} MB</span>
                            <button type="button" className="text-primary" onClick={() => videoRef.current?.click()}>Change Video</button>
                        </div>
                        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[13px] font-medium">Trim Short</p>
                                <span className={cn("text-[12px] font-semibold", trim[1] - trim[0] > SHORT_MAX_SECONDS ? "text-destructive" : "text-primary")}>
                                    {clock(trim[0])} – {clock(trim[1])} · {Math.round(trim[1] - trim[0])}s kept
                                </span>
                            </div>
                            <TrimBar
                                duration={video.seconds} value={trim} maxLen={SHORT_MAX_SECONDS}
                                onChange={(v) => { setTrim(v); if (previewRef.current) previewRef.current.currentTime = v[0]; }}
                            />
                            <p className="text-[11.5px] text-muted-foreground">Up to 1 minute. Drag the handles to choose the part to keep.</p>
                        </div>
                        <label className="flex items-center gap-2 text-[12.5px]">
                            <Checkbox checked={mute} disabled={!!music} onCheckedChange={(v) => setMute(v === true)} /> Remove Audio
                        </label>
                    </div>
                ) : (
                    <button type="button" onClick={() => videoRef.current?.click()}
                        className={cn("flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted", tried && !video && "border-destructive")}>
                        <Film className="size-6" /> <span className="text-[12.5px]">Pick a video</span>
                    </button>
                )}

                <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                    <p className="text-[13px] font-medium">Add Background Music</p>
                    <p className="text-[11.5px] text-muted-foreground">Optional. It replaces the clip&apos;s own sound.</p>
                    <input ref={musicRef} type="file" accept="audio/*" className="hidden"
                        onChange={(e) => { setMusic(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                    <div className="flex items-center gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => musicRef.current?.click()}><Music className="size-3.5" /> {music ? "Change Music" : "Choose Music"}</Button>
                        {music && <span className="min-w-0 flex-1 truncate text-[12px]">{music.name}</span>}
                        {music && <Button size="icon" variant="ghost" className="size-7" aria-label="Remove music" onClick={() => setMusic(null)}><X className="size-3.5" /></Button>}
                    </div>
                    {music && (
                        <div className="flex items-center gap-2 text-[12px]">
                            <Label className="text-[12px]">Music starts at (seconds)</Label>
                            <Input type="number" min={0} max={3600} value={musicStart} onChange={(e) => setMusicStart(e.target.value)} className="h-8 w-24" />
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Cover</Label>
                    <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setCover({ file: f, url: URL.createObjectURL(f) }); }} />
                    <div className="flex items-center gap-3">
                        <div className="grid h-16 w-12 place-items-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {cover ? <img src={cover.url} alt="" className="h-full w-full object-cover" /> : <Eye className="size-4" />}
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => coverRef.current?.click()}>{cover ? "Edit Cover" : "Choose Cover"}</Button>
                        {cover && <Button type="button" size="sm" variant="ghost" onClick={() => setCover(null)}>Use first frame</Button>}
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Album</Label>
                    <Select value={albumId} onValueChange={setAlbumId}>
                        <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Title <span className="text-destructive">*</span></Label>
                    <Input value={title} maxLength={150} placeholder="Enter a title" onChange={(e) => setTitle(e.target.value)} className={cn(tried && !title.trim() && "border-destructive")} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Description</Label>
                    <Textarea value={description} maxLength={500} rows={2} placeholder="Say something about this short" onChange={(e) => setDescription(e.target.value)} />
                </div>
                <DialogFooter>
                    <Button variant="outline" disabled={upload.isPending} onClick={onClose}>Cancel</Button>
                    <Button disabled={upload.isPending} onClick={submit}>
                        {upload.isPending ? <><Loader2 className="size-3.5 animate-spin" /> Uploading…</> : "Upload Short"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * The trim bar: a strip over the whole video with the kept part marked; drag
 * either handle (at most `maxLen` seconds — moving one end past it pulls the
 * other along, as the app's trim).
 */
function TrimBar({
    duration, value, maxLen, onChange,
}: { duration: number; value: [number, number]; maxLen: number; onChange: (v: [number, number]) => void }) {
    const [from, to] = value;
    const pct = (s: number) => (duration > 0 ? (s / duration) * 100 : 0);
    const setFrom = (v: number) => {
        const f = Math.min(Math.max(0, v), to - 1);
        onChange([f, to - f > maxLen ? f + maxLen : to]);
    };
    const setTo = (v: number) => {
        const t = Math.max(Math.min(duration, v), from + 1);
        onChange([t - from > maxLen ? t - maxLen : from, t]);
    };
    return (
        <div className="relative h-10">
            <div className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-md bg-muted" />
            <div
                className="absolute top-1/2 h-8 -translate-y-1/2 rounded-md border-2 border-primary bg-primary/15"
                style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }}
            />
            <input
                type="range" min={0} max={duration} step={1} value={from} aria-label="Trim start"
                onChange={(e) => setFrom(Number(e.target.value))}
                className="trim-handle pointer-events-none absolute inset-0 h-10 w-full appearance-none bg-transparent"
            />
            <input
                type="range" min={0} max={duration} step={1} value={to} aria-label="Trim end"
                onChange={(e) => setTo(Number(e.target.value))}
                className="trim-handle pointer-events-none absolute inset-0 h-10 w-full appearance-none bg-transparent"
            />
        </div>
    );
}
