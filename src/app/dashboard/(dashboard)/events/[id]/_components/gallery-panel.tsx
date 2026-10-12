"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Plus, Trash2, Upload, Video } from "lucide-react";
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
    useDeleteGalleryCategory, useDeleteGalleryItem, useEventGallery, useSaveGalleryCategory,
    useUpdateGalleryItem, useUploadGalleryItem, type GalleryCategory, type GalleryItem, type GalleryUsage,
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

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Gallery"><Empty title="Could not load the gallery">Please try again in a moment.</Empty></Section>;
    }
    const { items, categories, usage } = query.data;
    const defaultCategory = categories.find((c) => c.is_default);

    const uploadFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        setUploading(true);
        let done = 0;
        // One at a time: each is checked against the plan's limits as it lands.
        for (const file of Array.from(files)) {
            try {
                await upload.mutateAsync({
                    file,
                    // The open category; "All" files into the built-in Gallery.
                    categoryId: categoryId !== undefined && categoryId > 0 ? categoryId : undefined,
                });
                done += 1;
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
                        <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                            <Upload className="size-3.5" /> {uploading ? "Uploading…" : "Upload"}
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
                        {items.map((item) => (
                            <li key={item.id} className="overflow-hidden rounded-lg border border-border">
                                <div className="relative aspect-square bg-muted">
                                    {item.type === "image" ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={mediaUrl(item.thumbnail_url || item.url)} alt={item.caption ?? ""} className={cn("h-full w-full object-cover", !item.show_in_app && "opacity-50")} />
                                    ) : (
                                        <video src={mediaUrl(item.url)} className={cn("h-full w-full object-cover", !item.show_in_app && "opacity-50")} muted preload="metadata" />
                                    )}
                                    {item.type === "video" && (
                                        <span className="absolute top-1.5 left-1.5 grid size-6 place-items-center rounded bg-black/60 text-white"><Video className="size-3.5" /></span>
                                    )}
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
                                <div className="p-2">
                                    <Select
                                        value={String(item.category_id ?? defaultCategory?.id ?? "")}
                                        onValueChange={(v) => update.mutate({ id: item.id, data: { category_id: Number(v) } })}
                                    >
                                        <SelectTrigger className="h-8 w-full text-[11.5px]"><SelectValue placeholder="Move to…" /></SelectTrigger>
                                        <SelectContent>
                                            {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Section>

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

function CategoryDialog({
    eventId, category, onClose,
}: { eventId: number; category: GalleryCategory | null; onClose: () => void }) {
    const save = useSaveGalleryCategory(eventId);
    const [name, setName] = useState(category?.name ?? "");
    const [description, setDescription] = useState(category?.description ?? "");
    const [tried, setTried] = useState(false);

    const submit = () => {
        setTried(true);
        if (!name.trim()) { toast.error("Please fill all mandatory fields."); return; }
        save.mutate({ id: category?.id, data: { name: name.trim(), description: description.trim() || null } }, { onSuccess: onClose });
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
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={save.isPending} onClick={submit}>{category ? "Save" : "Add Category"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
