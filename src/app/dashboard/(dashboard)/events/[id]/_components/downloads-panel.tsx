"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    Check, CloudUpload, Copy, Download, ExternalLink, Eye, EyeOff, FileText, Info, LayoutGrid, List, Loader2, Pencil, Plus, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    ActionSheet, CharCount, DatePickerField, DeleteSheet, DetailRow, DetailSection, FormField, ModuleHeader, Notice, OverviewCard,
    RowActions, SearchBox, StatTile, StatusPill,
} from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import type { ClientEvent } from "@/hooks/use-client-events";
import {
    uploadDownloadFile, useDeleteDownload, useDownloads, useSaveDownload,
    type DownloadAccess, type DownloadCategory, type DownloadVisibility, type EventDownload, type UploadedDownloadFile,
} from "@/hooks/use-event-engagement";
import { Empty, PanelLoading, Section } from "./module-ui";

/**
 * Downloads — Jamal's web design (2026-11-10): files the host uploads for participants to download in the
 * event app. Tiles (Total / Visible / Hidden / Total Downloads), search + category + status filters, list
 * or grid, and the "Add Download" panel. The category chips come from the backend (download_categories).
 *
 * "Visible" = switched on (Show in participant app) and not past its expiry date.
 */

type View = "list" | "grid";
type StatusFilter = "all" | "visible" | "hidden";

const VISIBILITY: { value: DownloadVisibility; label: string }[] = [
    { value: "all", label: "All Participants" },
    { value: "bride", label: "Bride Side" },
    { value: "groom", label: "Groom Side" },
];
const ACCESS: { value: DownloadAccess; label: string }[] = [
    { value: "all", label: "All Participants" },
    { value: "confirmed", label: "Confirmed RSVPs only" },
];
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.zip,.mp4";

export const fileSize = (bytes: number) => {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isVisible = (d: EventDownload) => d.show_in_app && !d.expired;

/** A file badge in the type's colour (PDF red, image violet, Word blue …). */
function FileBadge({ type, size = 36 }: { type: string; size?: number }) {
    const t = type.toUpperCase();
    const color = t === "PDF" ? "#E11D48"
        : ["JPG", "JPEG", "PNG", "WEBP"].includes(t) ? "#8B5CF6"
            : ["DOC", "DOCX"].includes(t) ? "#2563EB"
                : ["XLS", "XLSX"].includes(t) ? "#16A34A"
                    : ["PPT", "PPTX"].includes(t) ? "#EA580C"
                        : t === "MP4" ? "#0F172A" : "#D97706";
    return (
        <span className="relative grid shrink-0 place-items-center rounded-md" style={{ width: size, height: size, backgroundColor: `${color}14` }}>
            <FileText style={{ color, width: size * 0.5, height: size * 0.5 }} />
            <span className="absolute -bottom-1 rounded px-1 text-[8px] font-bold leading-[12px] text-white" style={{ backgroundColor: color }}>{t.slice(0, 4)}</span>
        </span>
    );
}

function CategoryChip({ category, fallback }: { category: DownloadCategory | undefined; fallback: string }) {
    const color = category?.color ?? "#6B7280";
    return (
        <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium" style={{ color, backgroundColor: `${color}18` }}>
            {category?.name ?? fallback}
        </span>
    );
}

export function DownloadsPanel({ event }: { event: ClientEvent }) {
    const query = useDownloads(event.id);
    const save = useSaveDownload(event.id);
    const remove = useDeleteDownload(event.id);
    const [editing, setEditing] = useState<EventDownload | "new" | null>(null);
    const [viewing, setViewing] = useState<EventDownload | null>(null);
    const [deleting, setDeleting] = useState<EventDownload | null>(null);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [view, setView] = useState<View>("list");

    const rows = query.data?.downloads;
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (rows ?? []).filter((d) => (category === "all" || d.category_key === category)
            && (status === "all" || (status === "visible") === isVisible(d))
            && (!q || `${d.title} ${d.file_name} ${d.description ?? ""}`.toLowerCase().includes(q)));
    }, [rows, search, category, status]);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Downloads"><Empty title="Could not load the downloads">Please try again in a moment.</Empty></Section>;
    }
    const page = query.data;
    const all = page.downloads;
    const cats = page.categories;
    const catOf = (key: string) => cats.find((c) => c.key === key);
    const counts = page.counts ?? { total: all.length, visible: all.filter(isVisible).length, hidden: all.filter((d) => !isVisible(d)).length, downloads: 0 };

    const open = (d: EventDownload) => d.file_url && window.open(mediaUrl(d.file_url), "_blank", "noopener");
    const actions = (d: EventDownload) => [
        { label: "View Details", icon: Eye, onClick: () => setViewing(d) },
        { label: "Open File", icon: ExternalLink, onClick: () => open(d) },
        { label: "Edit Download", icon: Pencil, onClick: () => setEditing(d), hidden: !page.can_edit },
        {
            label: d.show_in_app ? "Hide from App" : "Show in App", icon: d.show_in_app ? EyeOff : Eye, hidden: !page.can_edit,
            onClick: () => save.mutate({ id: d.id, data: { show_in_app: !d.show_in_app } }),
        },
        { label: "Delete Download", icon: Trash2, onClick: () => setDeleting(d), danger: true, divider: true, hidden: !page.can_edit },
    ];
    const pill = (d: EventDownload) => (d.expired
        ? <StatusPill tone="warning">Expired</StatusPill>
        : d.show_in_app ? <StatusPill tone="success">● Visible</StatusPill> : <StatusPill tone="danger">● Hidden</StatusPill>);

    return (
        <div className="flex flex-col gap-4">
            <ModuleHeader
                title="Downloads"
                subtitle="Upload brochures, PDFs, images, documents, maps, and other files for participants to download."
                actions={page.can_edit && <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add Download</Button>}
            />

            <OverviewCard>
                <StatTile icon={FileText} value={counts.total} label="Total Files" tone="primary" active={status === "all"} onClick={() => setStatus("all")} />
                <StatTile icon={Eye} value={counts.visible} label="Visible Files" tone="success" active={status === "visible"} onClick={() => setStatus("visible")} />
                <StatTile icon={EyeOff} value={counts.hidden} label="Hidden Files" tone="danger" active={status === "hidden"} onClick={() => setStatus("hidden")} />
                <StatTile icon={Download} value={counts.downloads.toLocaleString()} label="Total Downloads" tone="info" />
            </OverviewCard>

            <Notice tone="primary" icon={Info}>Participants can download only the files visible to them.</Notice>

            <div className="flex flex-wrap items-center gap-3">
                <SearchBox value={search} onChange={setSearch} placeholder="Search downloads..." />
                <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="!h-8 w-[160px] text-[12.5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {cats.map((c) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                    <SelectTrigger className="!h-8 w-[140px] text-[12.5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="visible">Visible</SelectItem>
                        <SelectItem value="hidden">Hidden</SelectItem>
                    </SelectContent>
                </Select>
                <div className="flex overflow-hidden rounded-md border border-border">
                    {([["list", List], ["grid", LayoutGrid]] as const).map(([v, Icon]) => (
                        <button
                            key={v} type="button" aria-label={v === "list" ? "List view" : "Grid view"} onClick={() => setView(v)}
                            className={cn("grid h-8 w-9 place-items-center", view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
                        >
                            <Icon className="size-4" />
                        </button>
                    ))}
                </div>
            </div>

            {all.length === 0 ? (
                <Empty title="No downloads yet">Add the invitation PDF, a route map, the schedule brochure or any file guests may need.</Empty>
            ) : shown.length === 0 ? (
                <Empty title="No downloads match">Try another search, category or status.</Empty>
            ) : view === "list" ? (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full min-w-[760px] text-[12.5px]">
                        <thead className="bg-muted/50 text-left text-[12px] font-semibold">
                            <tr>
                                <th className="w-10 px-3 py-2.5">#</th>
                                <th className="px-3 py-2.5">Download Item</th>
                                <th className="px-3 py-2.5">Category</th>
                                <th className="px-3 py-2.5">File Type</th>
                                <th className="px-3 py-2.5">Size</th>
                                <th className="px-3 py-2.5">Status</th>
                                <th className="px-3 py-2.5 text-center">Downloads</th>
                                <th className="w-16 px-3 py-2.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {shown.map((d) => (
                                <tr key={d.id} className="hover:bg-muted/30">
                                    <td className="px-3 py-3 font-medium">{all.indexOf(d) + 1}</td>
                                    <td className="px-3 py-3">
                                        <button type="button" onClick={() => setViewing(d)} className="flex min-w-0 items-center gap-2.5 text-left">
                                            <FileBadge type={d.file_type} size={32} />
                                            <span className="truncate font-semibold">{d.title}</span>
                                        </button>
                                    </td>
                                    <td className="px-3 py-3"><CategoryChip category={catOf(d.category_key)} fallback={d.category_key} /></td>
                                    <td className="px-3 py-3"><span className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-medium">{d.file_type}</span></td>
                                    <td className="whitespace-nowrap px-3 py-3">{fileSize(d.file_size)}</td>
                                    <td className="px-3 py-3">{pill(d)}</td>
                                    <td className="px-3 py-3 text-center font-medium">{(d.download_count ?? 0).toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right"><RowActions compact items={actions(d)} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
                    {shown.map((d) => (
                        <div key={d.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
                            <div className="flex items-start gap-2.5">
                                <FileBadge type={d.file_type} size={40} />
                                <button type="button" onClick={() => setViewing(d)} className="min-w-0 flex-1 text-left">
                                    <p className="truncate text-[13px] font-semibold">{d.title}</p>
                                    <p className="truncate text-[11.5px] text-muted-foreground">{d.file_type} · {fileSize(d.file_size)}</p>
                                </button>
                                <RowActions compact items={actions(d)} />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <CategoryChip category={catOf(d.category_key)} fallback={d.category_key} />
                                {pill(d)}
                            </div>
                            <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                                <Download className="size-3" /> {(d.download_count ?? 0).toLocaleString()} downloads
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {viewing && (
                <DownloadDetails
                    download={all.find((d) => d.id === viewing.id) ?? viewing}
                    category={catOf(viewing.category_key)}
                    canEdit={page.can_edit}
                    onClose={() => setViewing(null)}
                    onEdit={() => { const d = viewing; setViewing(null); setEditing(d); }}
                    onDelete={() => { const d = viewing; setViewing(null); setDeleting(d); }}
                />
            )}

            {editing && (
                <DownloadSheet
                    key={editing === "new" ? "new" : editing.id}
                    eventId={event.id}
                    download={editing === "new" ? null : editing}
                    categories={cats}
                    maxBytes={page.max_file_bytes}
                    onClose={() => setEditing(null)}
                />
            )}

            <DeleteSheet
                open={!!deleting}
                onClose={() => setDeleting(null)}
                title="Delete Download"
                subtitle="The file is removed for everyone."
                summary={deleting && (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                        <FileBadge type={deleting.file_type} />
                        <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold">{deleting.title}</p>
                            <p className="truncate text-[11.5px] text-muted-foreground">{deleting.file_name} · {fileSize(deleting.file_size)}</p>
                        </div>
                    </div>
                )}
                question="Delete this download?"
                effects={[
                    { label: "The file", value: "Deleted from storage" },
                    { label: "Participants", value: "Can no longer download it" },
                ]}
                confirmLabel="Delete Download"
                busy={remove.isPending}
                onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
            />
        </div>
    );
}

/** Add / Edit Download — the design's right-hand panel. */
function DownloadSheet({
    eventId, download, categories, maxBytes, onClose,
}: { eventId: number; download: EventDownload | null; categories: DownloadCategory[]; maxBytes: number; onClose: () => void }) {
    const save = useSaveDownload(eventId);
    const [title, setTitle] = useState(download?.title ?? "");
    const [category, setCategory] = useState(download?.category_key ?? "");
    const [file, setFile] = useState<UploadedDownloadFile | null>(download
        ? { url: download.file_url ?? "", file_name: download.file_name, file_type: download.file_type, file_size: download.file_size }
        : null);
    const [description, setDescription] = useState(download?.description ?? "");
    const [visibility, setVisibility] = useState<DownloadVisibility>(download?.visibility ?? "all");
    const [access, setAccess] = useState<DownloadAccess>(download?.download_access ?? "all");
    const [expires, setExpires] = useState(download?.expires_at?.slice(0, 10) ?? "");
    const [showInApp, setShowInApp] = useState(download?.show_in_app ?? true);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [tried, setTried] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const maxMb = Math.round((maxBytes || 25 * 1024 * 1024) / (1024 * 1024));

    const pick = async (f: File | undefined) => {
        if (!f) return;
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ACCEPT.split(",").includes(`.${ext}`)) return toast.error("That file type is not supported.");
        if (f.size > (maxBytes || 25 * 1024 * 1024)) return toast.error(`The file must be ${maxMb} MB or smaller.`);
        setUploading(true);
        try {
            const up = await uploadDownloadFile(eventId, f);
            setFile(up);
            if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not upload the file");
        } finally {
            setUploading(false);
        }
    };

    const submit = () => {
        setTried(true);
        if (!title.trim() || !category || !file) {
            toast.error("Please fill all mandatory fields.");
            return;
        }
        const data: Record<string, unknown> = {
            title: title.trim(), category_key: category, description: description.trim() || null,
            visibility, download_access: access, expires_at: expires || null, show_in_app: showInApp,
        };
        // Send the file only when it is new — an edit that keeps it leaves it alone.
        if (!download || file.url !== download.file_url) {
            Object.assign(data, { file_url: file.url, file_name: file.file_name, file_size: file.file_size });
        }
        save.mutate({ id: download?.id, data }, { onSuccess: onClose });
    };

    return (
        <ActionSheet
            open onClose={onClose} icon={Download}
            title={download ? "Edit Download" : "Add Download"}
            subtitle="Upload a file or resource for participants to download in the event app."
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={save.isPending || uploading} onClick={submit}>
                        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        Save Download
                    </Button>
                </>
            )}
        >
            <div className="flex flex-col gap-4">
                <FormField label="Download Title" required>
                    <Input value={title} maxLength={150} placeholder="e.g. Wedding Invitation PDF" onChange={(e) => setTitle(e.target.value)}
                        className={cn("h-9", tried && !title.trim() && "border-destructive")} />
                </FormField>

                <FormField label="Category" required>
                    <div className="flex flex-wrap gap-2">
                        {categories.map((c) => {
                            const on = category === c.key;
                            return (
                                <button
                                    key={c.key} type="button" onClick={() => setCategory(c.key)}
                                    className={cn(
                                        "inline-flex items-center gap-1 rounded-md border px-3 py-1 text-[12.5px] font-medium transition-colors",
                                        on ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
                                        tried && !category && "border-destructive",
                                    )}
                                >
                                    {c.name} {on && <Check className="size-3.5" />}
                                </button>
                            );
                        })}
                    </div>
                </FormField>

                <FormField label="File Type">
                    <Input readOnly value={file ? `${file.file_type} (auto-detected)` : "Detected from the file"} className="h-9 bg-muted text-muted-foreground" />
                </FormField>

                <FormField label="Upload File" required>
                    <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
                    <button
                        type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => { e.preventDefault(); setDragOver(false); void pick(e.dataTransfer.files?.[0]); }}
                        className={cn(
                            "flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-4 text-center transition-colors",
                            dragOver ? "border-primary bg-primary/5" : tried && !file ? "border-destructive" : "border-border hover:bg-muted/40",
                        )}
                    >
                        {uploading ? <Loader2 className="size-6 animate-spin text-primary" /> : <CloudUpload className="size-6 text-primary" />}
                        <p className="text-[12.5px]">{uploading ? "Uploading…" : <>Drag and drop your file here, or click to <span className="font-medium text-primary">browse</span></>}</p>
                        <p className="text-[11px] text-muted-foreground">Supported: PDF, DOCX, XLSX, PPTX, JPG, PNG, ZIP, MP4</p>
                        <p className="text-[11px] text-muted-foreground">Max size: {maxMb} MB</p>
                    </button>
                    {file && (
                        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                            <FileBadge type={file.file_type} size={32} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[12.5px] font-semibold">{file.file_name}</p>
                                <p className="text-[11px] text-muted-foreground">{fileSize(file.file_size)}</p>
                            </div>
                            <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Remove file" onClick={() => setFile(null)}>
                                <X className="size-4" />
                            </Button>
                        </div>
                    )}
                </FormField>

                <FormField label="Short Description">
                    <Textarea value={description} maxLength={500} rows={3} placeholder="What is in this file?" onChange={(e) => setDescription(e.target.value)} />
                    <CharCount value={description} max={500} />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                    <FormField label="Visibility" required>
                        <Select value={visibility} onValueChange={(v) => setVisibility(v as DownloadVisibility)}>
                            <SelectTrigger className="!h-9 w-full text-[12.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{VISIBILITY.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                    </FormField>
                    <FormField label="Download Access">
                        <Select value={access} onValueChange={(v) => setAccess(v as DownloadAccess)}>
                            <SelectTrigger className="!h-9 w-full text-[12.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{ACCESS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                    </FormField>
                </div>

                <FormField label="Expiry Date (Optional)" note={expires ? (
                    <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => setExpires("")}>Clear date</button>
                ) : undefined}>
                    <DatePickerField
                        value={expires} onChange={setExpires} placeholder="Select expiry date"
                        label={(day) => new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    />
                </FormField>

                <label className="flex cursor-pointer items-center justify-between gap-3 text-[12.5px]">
                    Show in participant app
                    <Switch checked={showInApp} onCheckedChange={setShowInApp} />
                </label>
            </div>
        </ActionSheet>
    );
}

const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
}) : "—");

function DownloadDetails({
    download: d, category, canEdit, onClose, onEdit, onDelete,
}: {
    download: EventDownload; category: DownloadCategory | undefined; canEdit: boolean;
    onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
    const url = d.file_url ? mediaUrl(d.file_url) : null;
    return (
        <ActionSheet
            open onClose={onClose} icon={Download} title="Download Details" subtitle={d.title}
            footer={canEdit ? (
                <>
                    <Button variant="outline" className="text-destructive" onClick={onDelete}><Trash2 className="size-3.5" /> Delete</Button>
                    <Button onClick={onEdit}><Pencil className="size-3.5" /> Edit</Button>
                </>
            ) : undefined}
        >
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <FileBadge type={d.file_type} size={44} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold">{d.title}</p>
                        <p className="truncate text-[11.5px] text-muted-foreground">{d.file_name} · {fileSize(d.file_size)}</p>
                    </div>
                    {url && (
                        <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="size-8" aria-label="Copy link"
                                onClick={() => { void navigator.clipboard?.writeText(url); toast.success("Link copied"); }}>
                                <Copy className="size-3.5" />
                            </Button>
                            <Button asChild size="icon" variant="ghost" className="size-8" aria-label="Open file">
                                <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /></a>
                            </Button>
                        </div>
                    )}
                </div>
                {d.description && (
                    <DetailSection title="Description">
                        <p className="whitespace-pre-line break-words py-2 text-[12.5px] text-foreground/85">{d.description}</p>
                    </DetailSection>
                )}
                <DetailSection title="Settings">
                    <DetailRow label="Category">{category?.name ?? d.category_key}</DetailRow>
                    <DetailRow label="File Type">{d.file_type}</DetailRow>
                    <DetailRow label="Status" tone={isVisible(d) ? "success" : "danger"}>{d.expired ? "Expired" : d.show_in_app ? "Visible" : "Hidden"}</DetailRow>
                    <DetailRow label="Visibility">{VISIBILITY.find((o) => o.value === d.visibility)?.label}</DetailRow>
                    <DetailRow label="Download Access">{ACCESS.find((o) => o.value === d.download_access)?.label}</DetailRow>
                    <DetailRow label="Expiry Date">{d.expires_at ? new Date(`${d.expires_at.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "No expiry"}</DetailRow>
                    <DetailRow label="Downloads">{(d.download_count ?? 0).toLocaleString()}</DetailRow>
                    <DetailRow label="Added On">{stamp(d.created_at)}</DetailRow>
                    <DetailRow label="Last Updated">{stamp(d.updated_at)}</DetailRow>
                </DetailSection>
            </div>
        </ActionSheet>
    );
}
