"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
    ChevronLeft, ChevronRight, Download, Eye, EyeOff, ImagePlus, Pencil, Play, Plus, Trash2, Upload, Video, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import {
    useDeleteGalleryCategory, useDeleteGalleryItem, useEventGallery, useReorderGallery, useSaveGalleryCategory,
    useUpdateGalleryItem, useUploadGalleryCover, useUploadGalleryItem,
    type GalleryCategory, type GalleryItem, type GalleryUsage,
} from "@/hooks/use-event-modules";
import { Empty, FieldError, PanelLoading, Section } from "./module-ui";

/**
 * Gallery — the event's photos and videos, managed the way the app does it
 * (it replaces the old "Photo uploads are not part of this portal" note).
 *
 * ── THE LIMITS ARE THE PLAN'S, ENFORCED BY THE SERVER ───────────────────────
 * Photos and videos per event, and the account's storage, come from the plan;
 * a photo is at most 2 MB and a video 5 MB. The bars below only report them —
 * the server refuses an upload that goes over and says why.
 *
 * ── CATEGORIES ──────────────────────────────────────────────────────────────
 * Every event has a built-in "Gallery" category (cannot be renamed or deleted).
 * An upload with no category lands in it; deleting a category moves its photos
 * there.
 */

const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

export function GalleryPanel({ eventId }: { eventId: number }) {
    // undefined = everything.
    const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
    const query = useEventGallery(eventId, categoryId);
    const upload = useUploadGalleryItem(eventId);
    const update = useUpdateGalleryItem(eventId);
    const removeItem = useDeleteGalleryItem(eventId);
    const removeCategory = useDeleteGalleryCategory(eventId);
    const fileRef = useRef<HTMLInputElement>(null);
    const [editingCategory, setEditingCategory] = useState<GalleryCategory | "new" | null>(null);
    const [deletingItem, setDeletingItem] = useState<GalleryItem | null>(null);
    const [deletingCategory, setDeletingCategory] = useState<GalleryCategory | null>(null);
    const [uploading, setUploading] = useState(false);
    const reorder = useReorderGallery(eventId);
    /** Index into the shown items of the one open in the viewer; null = closed. */
    const [viewing, setViewing] = useState<number | null>(null);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Gallery"><Empty title="Could not load the gallery">Please try again in a moment.</Empty></Section>;
    }
    const { items, categories, usage } = query.data;
    const defaultCategory = categories.find((c) => c.is_default);

    /** Swap an item with its neighbour and save the order of what is shown. */
    const move = (index: number, by: -1 | 1) => {
        const ids = items.map((i) => i.id);
        const to = index + by;
        if (to < 0 || to >= ids.length) return;
        [ids[index], ids[to]] = [ids[to], ids[index]];
        reorder.mutate(ids);
    };

    const photosLeft = usage.photos.limit === null ? Infinity : Math.max(0, usage.photos.limit - usage.photos.used);
    const videosLeft = usage.videos.limit === null ? Infinity : Math.max(0, usage.videos.limit - usage.videos.used);
    const allFull = photosLeft === 0 && videosLeft === 0;

    /**
     * Checked HERE before anything is sent (the app does the same): the plan's
     * photo / video count, the per-file cap and the storage left. The server
     * still checks each upload — this only spares a refused round trip.
     */
    const refuse = (file: File, left: { photos: number; videos: number; bytes: number }): string | null => {
        const isVideo = file.type.startsWith("video/");
        const cap = isVideo ? usage.max_video_bytes : usage.max_image_bytes;
        if (file.size > cap) {
            return `${file.name}: ${isVideo ? "videos" : "photos"} must be ${mb(cap)} MB or smaller (this is ${mb(file.size)} MB).`;
        }
        if (isVideo ? left.videos <= 0 : left.photos <= 0) {
            const limit = isVideo ? usage.videos.limit : usage.photos.limit;
            return `This event has reached its limit of ${limit} ${isVideo ? "video" : "photo"}${limit === 1 ? "" : "s"}. Please upgrade your plan to add more.`;
        }
        if (file.size > left.bytes) {
            return `Not enough storage left for ${file.name} (${mb(Math.max(0, left.bytes))} MB left on your plan).`;
        }
        return null;
    };

    const uploadFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        setUploading(true);
        let done = 0;
        const left = {
            photos: photosLeft,
            videos: videosLeft,
            bytes: usage.storage.limit_bytes === null || usage.storage.limit_bytes === undefined
                ? Infinity
                : usage.storage.limit_bytes - (usage.storage.used_bytes ?? 0),
        };
        // One at a time: each is checked against the plan's limits as it lands.
        for (const file of Array.from(files)) {
            const reason = refuse(file, left);
            if (reason) { toast.error(reason); continue; }
            try {
                await upload.mutateAsync({
                    file,
                    // The open category; "All" files into the built-in Gallery.
                    categoryId: categoryId !== undefined && categoryId > 0 ? categoryId : undefined,
                });
                done += 1;
                if (file.type.startsWith("video/")) left.videos -= 1; else left.photos -= 1;
                left.bytes -= file.size;
            } catch {
                break; // The hook already showed the server's reason.
            }
        }
        setUploading(false);
        if (done > 0) toast.success(done === 1 ? "Uploaded" : `${done} files uploaded`);
    };

    return (
        <div className="flex flex-col gap-5">
            <UsageCard usage={usage} />

            <Section
                title="Gallery"
                action={
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditingCategory("new")}><Plus className="size-3.5" /> Add Category</Button>
                        <Button
                            size="sm" disabled={uploading || allFull}
                            title={allFull ? "This event has used all its photos and videos. Upgrade your plan to add more." : undefined}
                            onClick={() => fileRef.current?.click()}
                        >
                            <Upload className="size-3.5" /> {uploading ? "Uploading…" : allFull ? "Limit Reached" : "Upload"}
                        </Button>
                        <input
                            ref={fileRef} type="file" multiple className="hidden"
                            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                            onChange={(e) => { void uploadFiles(e.target.files); e.target.value = ""; }}
                        />
                    </div>
                }
            >
                <div className="mb-3 flex flex-wrap gap-2">
                    <Chip active={categoryId === undefined} onClick={() => setCategoryId(undefined)}>
                        All ({categories.reduce((n, c) => n + c.item_count, 0)})
                    </Chip>
                    {categories.map((c) => (
                        <span key={c.id} className="inline-flex items-center gap-0.5">
                            <Chip active={categoryId === (c.is_default ? 0 : c.id)} onClick={() => setCategoryId(c.is_default ? 0 : c.id)}>
                                {c.name} ({c.item_count})
                            </Chip>
                            {!c.is_default && (
                                <>
                                    <Button size="icon" variant="ghost" className="size-7" aria-label={`Rename ${c.name}`} onClick={() => setEditingCategory(c)}>
                                        <Pencil className="size-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="size-7 text-destructive" aria-label={`Delete ${c.name}`} onClick={() => setDeletingCategory(c)}>
                                        <Trash2 className="size-3" />
                                    </Button>
                                </>
                            )}
                        </span>
                    ))}
                </div>

                {items.length === 0 ? (
                    <Empty title="No photos or videos here yet">
                        Click Upload to add some. Photos up to {mb(usage.max_image_bytes)} MB, videos up to {mb(usage.max_video_bytes)} MB.
                    </Empty>
                ) : (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {items.map((item, index) => (
                            <li key={item.id} className="overflow-hidden rounded-lg border border-border">
                                <div className="relative aspect-square bg-muted">
                                    {/* Click = the viewer (full photo / video player). */}
                                    <button
                                        type="button" className="block h-full w-full" aria-label={item.type === "video" ? "Play video" : "View photo"}
                                        onClick={() => setViewing(index)}
                                    >
                                        {item.type === "image" || item.thumbnail_url ? (
                                            // A video shows its first-frame poster — never the
                                            // video itself, which a grid would download per tile.
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={mediaUrl(item.thumbnail_url || item.url)} alt={item.caption ?? ""} className={cn("h-full w-full object-cover", !item.show_in_app && "opacity-50")} />
                                        ) : (
                                            <span className={cn("grid h-full w-full place-items-center text-muted-foreground", !item.show_in_app && "opacity-50")}>
                                                <Video className="size-8" />
                                            </span>
                                        )}
                                        {item.type === "video" && (
                                            <span className="pointer-events-none absolute inset-0 grid place-items-center">
                                                <span className="grid size-10 place-items-center rounded-full bg-black/55 text-white"><Play className="ml-0.5 size-5" /></span>
                                            </span>
                                        )}
                                    </button>
                                    <div className="absolute top-1.5 right-1.5 flex gap-1">
                                        <Button
                                            size="icon" variant="secondary" className="size-7"
                                            aria-label={item.show_in_app ? "Hide from the event app" : "Show in the event app"}
                                            onClick={() => update.mutate({ id: item.id, data: { show_in_app: !item.show_in_app } })}
                                        >
                                            {item.show_in_app ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                                        </Button>
                                        <Button size="icon" variant="secondary" className="size-7 text-destructive" aria-label="Delete" onClick={() => setDeletingItem(item)}>
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 p-2">
                                    {/* Order inside this view; the server keeps other
                                        categories' slots where they were. */}
                                    <Button
                                        size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Move earlier"
                                        disabled={index === 0 || reorder.isPending}
                                        onClick={() => move(index, -1)}
                                    >
                                        <ChevronLeft className="size-4" />
                                    </Button>
                                    <Select
                                        value={String(item.category_id ?? defaultCategory?.id ?? "")}
                                        onValueChange={(v) => update.mutate({ id: item.id, data: { category_id: Number(v) } })}
                                    >
                                        <SelectTrigger className="h-8 min-w-0 flex-1 text-[11.5px]"><SelectValue placeholder="Move to…" /></SelectTrigger>
                                        <SelectContent>
                                            {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Move later"
                                        disabled={index === items.length - 1 || reorder.isPending}
                                        onClick={() => move(index, 1)}
                                    >
                                        <ChevronRight className="size-4" />
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Section>

            {viewing !== null && items[viewing] && (
                <MediaViewer
                    key={items[viewing].id}
                    eventId={eventId}
                    items={items}
                    index={viewing}
                    onIndex={setViewing}
                    onClose={() => setViewing(null)}
                />
            )}

            {editingCategory && (
                <CategoryDialog
                    key={editingCategory === "new" ? "new" : editingCategory.id}
                    eventId={eventId}
                    category={editingCategory === "new" ? null : editingCategory}
                    onClose={() => setEditingCategory(null)}
                />
            )}

            <Dialog open={!!deletingItem} onOpenChange={(o) => !o && setDeletingItem(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove this {deletingItem?.type}?</DialogTitle>
                        <DialogDescription>It is deleted from the gallery and its file removed. This cannot be undone.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingItem(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={removeItem.isPending} onClick={() => deletingItem && removeItem.mutate(deletingItem.id, { onSuccess: () => setDeletingItem(null) })}>
                            Remove
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deletingCategory} onOpenChange={(o) => !o && setDeletingCategory(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete &quot;{deletingCategory?.name}&quot;?</DialogTitle>
                        <DialogDescription>Its photos and videos are not deleted — they move to Gallery.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingCategory(null)}>Cancel</Button>
                        <Button
                            variant="destructive" disabled={removeCategory.isPending}
                            onClick={() => deletingCategory && removeCategory.mutate(deletingCategory.id, {
                                onSuccess: () => { setDeletingCategory(null); setCategoryId(undefined); },
                            })}
                        >
                            Delete Category
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button" onClick={onClick}
            className={cn(
                "rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
            )}
        >
            {children}
        </button>
    );
}

/** Photos / videos per event and the account's storage — reported, enforced by the server. */
function UsageCard({ usage }: { usage: GalleryUsage }) {
    const bar = (used: number, limit: number | null) => (limit ? Math.min(100, (used / limit) * 100) : 0);
    return (
        <Section title="Plan limits">
            <div className="grid gap-4 sm:grid-cols-3">
                <Meter label="Photos" text={`${usage.photos.used} / ${usage.photos.limit ?? "Unlimited"}`} pct={bar(usage.photos.used, usage.photos.limit)} />
                <Meter label="Videos" text={`${usage.videos.used} / ${usage.videos.limit ?? "Unlimited"}`} pct={bar(usage.videos.used, usage.videos.limit)} />
                <Meter
                    label="Storage"
                    text={`${usage.storage.used_mb} MB / ${usage.storage.limit_mb === null ? "Unlimited" : `${usage.storage.limit_mb} MB`}`}
                    pct={bar(usage.storage.used_mb, usage.storage.limit_mb)}
                />
            </div>
        </Section>
    );
}

function Meter({ label, text, pct }: { label: string; text: string; pct: number }) {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[12px]">
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground">{text}</span>
            </div>
            <Progress value={pct} className="h-1.5" />
        </div>
    );
}

/**
 * The app's full-screen viewer, for the web: the whole photo in its own shape
 * (never the square tile cut), a video PLAYING with controls, ‹ › and the
 * arrow keys between items, the caption editable, Download.
 */
function MediaViewer({
    eventId, items, index, onIndex, onClose,
}: {
    eventId: number; items: GalleryItem[]; index: number;
    onIndex: (i: number) => void; onClose: () => void;
}) {
    const item = items[index];
    const update = useUpdateGalleryItem(eventId);
    const [caption, setCaption] = useState(item.caption ?? "");
    const go = (by: -1 | 1) => {
        const to = index + by;
        if (to >= 0 && to < items.length) onIndex(to);
    };
    const changed = caption.trim() !== (item.caption ?? "");

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent
                className="max-w-4xl gap-3 p-4 sm:max-w-4xl"
                onKeyDown={(e) => {
                    if ((e.target as HTMLElement).tagName === "INPUT") return;
                    if (e.key === "ArrowLeft") go(-1);
                    if (e.key === "ArrowRight") go(1);
                }}
            >
                <DialogHeader>
                    <DialogTitle className="text-[13px]">
                        {index + 1} of {items.length}{item.file_name ? ` · ${item.file_name}` : ""}
                    </DialogTitle>
                    <DialogDescription className="sr-only">Full-size view of this gallery item.</DialogDescription>
                </DialogHeader>

                <div className="relative grid min-h-[240px] place-items-center overflow-hidden rounded-md bg-black">
                    {item.type === "video" ? (
                        <video
                            src={mediaUrl(item.url)} poster={mediaUrl(item.thumbnail_url) ?? undefined}
                            controls autoPlay playsInline className="max-h-[70vh] w-auto max-w-full"
                        />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl(item.url)} alt={item.caption ?? ""} className="max-h-[70vh] w-auto max-w-full object-contain" />
                    )}
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

                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                        <Label className="text-[12.5px]">Caption (optional)</Label>
                        <Input value={caption} maxLength={300} placeholder="Add a caption" onChange={(e) => setCaption(e.target.value)} />
                    </div>
                    <Button
                        disabled={!changed || update.isPending}
                        onClick={() => update.mutate(
                            { id: item.id, data: { caption: caption.trim() || null } },
                            { onSuccess: () => toast.success("Caption saved") },
                        )}
                    >
                        Save Caption
                    </Button>
                    <Button asChild variant="outline">
                        <a href={mediaUrl(item.url)} target="_blank" rel="noopener noreferrer" download>
                            <Download className="size-3.5" /> Download
                        </a>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function CategoryDialog({
    eventId, category, onClose,
}: { eventId: number; category: GalleryCategory | null; onClose: () => void }) {
    const save = useSaveGalleryCategory(eventId);
    const uploadCover = useUploadGalleryCover(eventId);
    const coverRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(category?.name ?? "");
    const [description, setDescription] = useState(category?.description ?? "");
    /** The host's own cover; null = none (the list shows the first photo). */
    const [cover, setCover] = useState<string | null>(category?.cover_image ?? null);
    const [tried, setTried] = useState(false);

    const pickCover = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { toast.error("Images must be 2 MB or smaller."); return; }
        const res = await uploadCover.mutateAsync(file).catch(() => null);
        if (res?.url) setCover(res.url);
    };

    const submit = () => {
        setTried(true);
        if (!name.trim()) { toast.error("Please fill all mandatory fields."); return; }
        save.mutate(
            { id: category?.id, data: { name: name.trim(), description: description.trim() || null, cover_image: cover } },
            { onSuccess: onClose },
        );
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader><DialogTitle>{category ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Name <span className="text-destructive">*</span></Label>
                        <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={cn(tried && !name.trim() && "border-destructive")} />
                        <FieldError show={tried && !name.trim()} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Description (optional)</Label>
                        <Input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Cover Image (optional)</Label>
                        <p className="text-[11.5px] text-muted-foreground">Shown square. With none, the category shows its first photo.</p>
                        <div className="flex items-center gap-3">
                            <button
                                type="button" onClick={() => coverRef.current?.click()} disabled={uploadCover.isPending}
                                className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted text-muted-foreground"
                                aria-label="Choose cover image"
                            >
                                {cover ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={mediaUrl(cover)} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <ImagePlus className="size-6" />
                                )}
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
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={save.isPending} onClick={submit}>{category ? "Save" : "Add Category"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
