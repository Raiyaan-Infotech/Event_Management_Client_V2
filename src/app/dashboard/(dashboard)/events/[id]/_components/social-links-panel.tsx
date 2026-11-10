"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ArrowDown, ArrowUp, Check, ChevronDown, Copy, ExternalLink, Eye, EyeOff, LayoutGrid, Link2, List, Loader2, Pencil, Plus,
    Share2, Trash2, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    ActionSheet, DeleteSheet, DetailRow, DetailSection, FormField, ModuleHeader, OverviewCard, RowActions, SearchBox, StatTile, StatusPill,
} from "@/components/module-kit";
import { DynamicIcon } from "@/components/common/dynamic-icon";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import type { ClientEvent } from "@/hooks/use-client-events";
import {
    uploadSocialIcon, useDeleteSocialLink, useReorderSocialLinks, useSaveSocialLink, useSocialLinks,
    type SocialLink, type SocialPlatform,
} from "@/hooks/use-event-engagement";
import { Empty, PanelLoading, Section } from "./module-ui";

/**
 * Social Links — Jamal's web design (2026-11-10): tiles (Total / Visible / Hidden), search + status
 * filter + list / grid view, and the "Add Social Link" panel whose Platform grid comes from the backend
 * (`platforms` = the social_platforms table), not from this file.
 *
 * Only links WITH a URL are listed: the four preset rows every event has (Instagram, Facebook, X,
 * YouTube) stay hidden until they get one — adding that platform fills the preset row (backend).
 */

type View = "list" | "grid";
type StatusFilter = "all" | "visible" | "hidden";

const shortUrl = (url: string | null) => (url ?? "").replace(/^https?:\/\/(www\.)?/, "");

/** A platform / link icon: the platform's Iconify icon in its colour, else the uploaded icon, else a link. */
export function SocialIcon({
    icon, color, iconUrl, size = 36,
}: { icon?: string | null; color?: string | null; iconUrl?: string | null; size?: number }) {
    const box = { width: size, height: size };
    if (icon) {
        return (
            <span className="grid shrink-0 place-items-center rounded-lg" style={{ ...box, backgroundColor: `${color ?? "#6B7280"}14` }}>
                <DynamicIcon name={icon} color={color} className="size-[55%]" />
            </span>
        );
    }
    if (iconUrl) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={mediaUrl(iconUrl)} alt="" className="shrink-0 rounded-lg border border-border object-cover" style={box} />;
    }
    return (
        <span className="grid shrink-0 place-items-center rounded-lg bg-primary/10 text-primary" style={box}>
            <Link2 style={{ width: size * 0.5, height: size * 0.5 }} />
        </span>
    );
}

const linkIcon = (l: SocialLink, size?: number) => (
    <SocialIcon icon={l.platform_icon} color={l.platform_color} iconUrl={l.icon_url} size={size} />
);

export function SocialLinksPanel({ event }: { event: ClientEvent }) {
    const query = useSocialLinks(event.id);
    const save = useSaveSocialLink(event.id);
    const remove = useDeleteSocialLink(event.id);
    const reorder = useReorderSocialLinks(event.id);
    const [editing, setEditing] = useState<SocialLink | "new" | null>(null);
    const [deleting, setDeleting] = useState<SocialLink | null>(null);
    const [viewing, setViewing] = useState<SocialLink | null>(null);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [view, setView] = useState<View>("list");

    const all = query.data?.links;
    const links = useMemo(() => (all ?? []).filter((l) => !!l.url), [all]);
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return links.filter((l) => (status === "all" || (status === "visible") === l.show_in_app)
            && (!q || `${l.title} ${l.platform_name} ${l.url}`.toLowerCase().includes(q)));
    }, [links, search, status]);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Social Links"><Empty title="Could not load the social links">Please try again in a moment.</Empty></Section>;
    }
    const page = query.data;
    const platforms = page.platforms ?? [];
    const visible = links.filter((l) => l.show_in_app).length;

    /** Move within the listed links; the order sent keeps every other row after them. */
    const move = (link: SocialLink, dir: -1 | 1) => {
        const ids = links.map((l) => l.id);
        const i = ids.indexOf(link.id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        reorder.mutate(ids);
    };
    const toggle = (l: SocialLink) => save.mutate({ id: l.id, data: { show_in_app: !l.show_in_app } });

    const actions = (l: SocialLink) => {
        const i = links.findIndex((x) => x.id === l.id);
        return [
            { label: "View Details", icon: Eye, onClick: () => setViewing(l) },
            { label: "Edit Link", icon: Pencil, onClick: () => setEditing(l), hidden: !page.can_edit },
            { label: l.show_in_app ? "Hide from App" : "Show in App", icon: l.show_in_app ? EyeOff : Eye, onClick: () => toggle(l), hidden: !page.can_edit },
            { label: "Move Up", icon: ArrowUp, onClick: () => move(l, -1), hidden: !page.can_edit || i <= 0 },
            { label: "Move Down", icon: ArrowDown, onClick: () => move(l, 1), hidden: !page.can_edit || i >= links.length - 1 },
            { label: "Delete Link", icon: Trash2, onClick: () => setDeleting(l), danger: true, divider: true, hidden: !page.can_edit },
        ];
    };

    const pill = (l: SocialLink) => (l.show_in_app
        ? <StatusPill tone="success" icon={Eye}>Visible</StatusPill>
        : <StatusPill tone="muted" icon={EyeOff}>Hidden</StatusPill>);

    return (
        <div className="flex flex-col gap-4">
            <ModuleHeader
                title="Social Links"
                subtitle="Add and manage social media and other important links for your event."
                actions={page.can_edit && (
                    <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add Social Link</Button>
                )}
            />

            <OverviewCard>
                <StatTile icon={Link2} value={links.length} label="Total Links" tone="primary" active={status === "all"} onClick={() => setStatus("all")} />
                <StatTile icon={Eye} value={visible} label="Visible Links" tone="success" active={status === "visible"} onClick={() => setStatus("visible")} />
                <StatTile icon={EyeOff} value={links.length - visible} label={links.length - visible === 1 ? "Hidden Link" : "Hidden Links"} tone="warning" active={status === "hidden"} onClick={() => setStatus("hidden")} />
            </OverviewCard>

            <div className="flex flex-wrap items-center gap-3">
                <SearchBox value={search} onChange={setSearch} placeholder="Search social links..." />
                <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                    <SelectTrigger className="!h-8 w-[150px] text-[12.5px]"><SelectValue /></SelectTrigger>
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
                            className={cn("grid h-8 w-9 place-items-center", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                        >
                            <Icon className="size-4" />
                        </button>
                    ))}
                </div>
            </div>

            {links.length === 0 ? (
                <Empty title="No social links yet">Add the event&apos;s Instagram, YouTube, WhatsApp channel, website or any other link.</Empty>
            ) : shown.length === 0 ? (
                <Empty title="No links match">Try another search or status.</Empty>
            ) : view === "list" ? (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full min-w-[640px] text-[12.5px]">
                        <thead className="bg-muted/50 text-left text-[12px] font-semibold">
                            <tr>
                                <th className="w-10 px-3 py-2.5">#</th>
                                <th className="px-3 py-2.5">Social Link</th>
                                <th className="px-3 py-2.5">URL</th>
                                <th className="px-3 py-2.5">Status</th>
                                <th className="w-16 px-3 py-2.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {shown.map((l) => (
                                <tr key={l.id} className="hover:bg-muted/30">
                                    <td className="px-3 py-2.5 font-medium">{links.indexOf(l) + 1}</td>
                                    <td className="px-3 py-2.5">
                                        <button type="button" onClick={() => setViewing(l)} className="flex min-w-0 items-center gap-2.5 text-left">
                                            {linkIcon(l, 32)}
                                            <span className="truncate font-semibold">{l.title || l.platform_name}</span>
                                        </button>
                                    </td>
                                    <td className="max-w-[260px] px-3 py-2.5">
                                        <a href={l.url ?? "#"} target="_blank" rel="noreferrer" className="block truncate text-foreground/80 hover:text-primary hover:underline">{l.url}</a>
                                    </td>
                                    <td className="px-3 py-2.5">{pill(l)}</td>
                                    <td className="px-3 py-2.5 text-right"><RowActions compact items={actions(l)} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                    {shown.map((l) => (
                        <div key={l.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
                            <div className="flex items-start gap-2.5">
                                {linkIcon(l, 40)}
                                <button type="button" onClick={() => setViewing(l)} className="min-w-0 flex-1 text-left">
                                    <p className="truncate text-[13px] font-semibold">{l.title || l.platform_name}</p>
                                    <p className="truncate text-[11.5px] text-muted-foreground">{l.platform_name}</p>
                                </button>
                                <RowActions compact items={actions(l)} />
                            </div>
                            <a href={l.url ?? "#"} target="_blank" rel="noreferrer" className="truncate text-[12px] text-primary hover:underline">{shortUrl(l.url)}</a>
                            <div>{pill(l)}</div>
                        </div>
                    ))}
                </div>
            )}

            {viewing && (
                <SocialLinkDetails
                    link={links.find((l) => l.id === viewing.id) ?? viewing}
                    order={links.findIndex((l) => l.id === viewing.id) + 1}
                    canEdit={page.can_edit}
                    onClose={() => setViewing(null)}
                    onEdit={() => { const l = viewing; setViewing(null); setEditing(l); }}
                    onDelete={() => { const l = viewing; setViewing(null); setDeleting(l); }}
                />
            )}

            {editing && (
                <SocialLinkSheet
                    key={editing === "new" ? "new" : editing.id}
                    eventId={event.id}
                    link={editing === "new" ? null : editing}
                    platforms={platforms}
                    taken={new Set(links.filter((l) => l.platform_key).map((l) => l.platform_key as string))}
                    onClose={() => setEditing(null)}
                />
            )}

            <DeleteSheet
                open={!!deleting}
                onClose={() => setDeleting(null)}
                title="Delete Social Link"
                subtitle="The link is removed from the event app."
                summary={deleting && (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                        {linkIcon(deleting, 40)}
                        <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold">{deleting.title || deleting.platform_name}</p>
                            <p className="truncate text-[11.5px] text-muted-foreground">{deleting.url}</p>
                        </div>
                    </div>
                )}
                question="Delete this social link?"
                effects={[{ label: "Participants", value: "No longer see this link" }]}
                confirmLabel="Delete Link"
                busy={remove.isPending}
                onConfirm={() => deleting && remove.mutate({ id: deleting.id, preset: false }, { onSuccess: () => setDeleting(null) })}
            />
        </div>
    );
}

/** The platform of a saved link, or a stand-in for a custom one. */
const platformOf = (link: SocialLink, platforms: SocialPlatform[]) =>
    (link.platform_key ? platforms.find((p) => p.key === link.platform_key) : platforms.find((p) => p.is_custom)) ?? null;

/**
 * Add / Edit Social Link — the design's right-hand panel: Platform (a grid of the backend's platforms),
 * Display Name, Profile / Page URL, Visibility. A link's platform is fixed once saved.
 */
function SocialLinkSheet({
    eventId, link, platforms, taken, onClose,
}: { eventId: number; link: SocialLink | null; platforms: SocialPlatform[]; taken: Set<string>; onClose: () => void }) {
    const save = useSaveSocialLink(eventId);
    const [platform, setPlatform] = useState<SocialPlatform | null>(link ? platformOf(link, platforms) : null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [title, setTitle] = useState(link?.title ?? "");
    const [url, setUrl] = useState(link?.url ?? "");
    const [showInApp, setShowInApp] = useState(link?.show_in_app ?? true);
    const [iconUrl, setIconUrl] = useState<string | null>(link?.icon_url ?? null);
    const [uploading, setUploading] = useState(false);
    const [tried, setTried] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const custom = !!platform?.is_custom;
    const locked = !!link;

    const pick = (p: SocialPlatform) => {
        // The display name follows the platform until it is typed by hand.
        if (!title.trim() || title === platform?.name) setTitle(p.is_custom ? "" : p.name);
        setPlatform(p);
        setPickerOpen(false);
    };

    const pickIcon = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) return toast.error("Please choose an image.");
        if (file.size > 1024 * 1024) return toast.error("The icon must be 1 MB or smaller.");
        setUploading(true);
        try {
            setIconUrl(await uploadSocialIcon(eventId, file));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not upload the icon");
        } finally {
            setUploading(false);
        }
    };

    const submit = () => {
        setTried(true);
        if ((!locked && !platform) || !title.trim() || !url.trim()) {
            toast.error("Please fill all mandatory fields.");
            return;
        }
        if (!/^https?:\/\//i.test(url.trim())) {
            toast.error("Please enter a valid link starting with http:// or https://.");
            return;
        }
        const data: Record<string, unknown> = { title: title.trim(), url: url.trim(), show_in_app: showInApp };
        if (!link) {
            if (custom) Object.assign(data, { platform_name: title.trim(), icon_url: iconUrl });
            else data.platform_key = platform!.key;
        } else if (!link.platform_key) {
            Object.assign(data, { platform_name: title.trim(), icon_url: iconUrl });
        }
        save.mutate({ id: link?.id, data }, { onSuccess: onClose });
    };

    const bad = (v: string) => tried && !v.trim();

    return (
        <ActionSheet
            open onClose={onClose} icon={Share2}
            title={link ? "Edit Social Link" : "Add Social Link"}
            subtitle={link ? "Change this link or who can see it." : "Add a social media or custom link for your event."}
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={save.isPending || uploading} onClick={submit}>
                        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        Save Social Link
                    </Button>
                </>
            )}
        >
            <div className="flex flex-col gap-4">
                <FormField label="Platform" required>
                    <Popover open={pickerOpen} onOpenChange={(o) => !locked && setPickerOpen(o)}>
                        <PopoverTrigger asChild>
                            <button
                                type="button" disabled={locked}
                                className={cn(
                                    "flex h-9 w-full items-center gap-2 rounded-md border bg-background px-3 text-left text-[13px] disabled:cursor-not-allowed disabled:opacity-70",
                                    tried && !platform && !locked ? "border-destructive" : "border-input",
                                )}
                            >
                                {platform
                                    ? <><SocialIcon icon={platform.icon} color={platform.color} size={22} /> <span className="flex-1">{platform.name}</span></>
                                    : locked && link
                                        ? <>{linkIcon(link, 22)} <span className="flex-1">{link.platform_name}</span></>
                                        : <span className="flex-1 text-muted-foreground">Choose a platform</span>}
                                {!locked && <ChevronDown className="size-4 text-muted-foreground" />}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
                            {platforms.length === 0 ? (
                                <p className="p-3 text-center text-[12px] text-muted-foreground">No platforms available.</p>
                            ) : (
                                <div className="grid grid-cols-3 gap-2">
                                    {platforms.map((p) => {
                                        const added = !p.is_custom && taken.has(p.key);
                                        const on = platform?.key === p.key;
                                        return (
                                            <button
                                                key={p.key} type="button" disabled={added} onClick={() => pick(p)}
                                                title={added ? `${p.name} is already added` : undefined}
                                                className={cn(
                                                    "relative flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2.5 text-[12px] font-medium transition-colors",
                                                    on ? "border-primary/40 bg-primary/10" : "border-border hover:bg-muted",
                                                    added && "cursor-not-allowed opacity-45 hover:bg-transparent",
                                                )}
                                            >
                                                {on && <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-2.5" /></span>}
                                                <DynamicIcon name={p.icon} color={p.color} className="size-6" />
                                                <span className="truncate">{p.name}</span>
                                                {added && <span className="text-[10px] text-muted-foreground">Added</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>
                </FormField>

                {(custom || (link && !link.platform_key)) && (
                    <div className="flex items-center gap-3">
                        <SocialIcon iconUrl={iconUrl} size={44} />
                        <div className="flex flex-col gap-1">
                            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickIcon(e.target.files?.[0]); e.target.value = ""; }} />
                            <div className="flex gap-2">
                                <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                                    {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                                    {iconUrl ? "Change Icon" : "Upload Icon"}
                                </Button>
                                {iconUrl && <Button type="button" size="sm" variant="ghost" onClick={() => setIconUrl(null)}><X className="size-3.5" /> Remove</Button>}
                            </div>
                            <p className="text-[11px] text-muted-foreground">Optional · square image, up to 1 MB</p>
                        </div>
                    </div>
                )}

                <FormField label="Display Name" required>
                    <Input value={title} maxLength={100} placeholder={custom ? "e.g. Venue Location" : "e.g. Our Wedding Instagram"}
                        onChange={(e) => setTitle(e.target.value)} className={cn("h-9", bad(title) && "border-destructive")} />
                </FormField>

                <FormField label="Profile / Page URL" required>
                    <Input value={url} maxLength={500} placeholder={platform?.url_placeholder || "https://"}
                        onChange={(e) => setUrl(e.target.value)} className={cn("h-9", bad(url) && "border-destructive")} />
                </FormField>

                <div className="flex flex-col gap-2">
                    <p className="text-[12px] font-semibold">Visibility</p>
                    <label className="flex cursor-pointer items-center gap-3 text-[12.5px]">
                        <Switch checked={showInApp} onCheckedChange={setShowInApp} />
                        Show this link in the event app
                    </label>
                </div>
            </div>
        </ActionSheet>
    );
}

const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
}) : "—");

/** Social Link Details — a slide-in panel like the other modules' views (Jamal, 2026-11-10). */
function SocialLinkDetails({
    link, order, canEdit, onClose, onEdit, onDelete,
}: {
    link: SocialLink; order: number; canEdit: boolean;
    onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
    return (
        <ActionSheet
            open onClose={onClose} icon={Share2} title="Social Link Details" subtitle={link.title || link.platform_name}
            footer={canEdit ? (
                <>
                    <Button variant="outline" className="text-destructive" onClick={onDelete}><Trash2 className="size-3.5" /> Delete</Button>
                    <Button onClick={onEdit}><Pencil className="size-3.5" /> Edit</Button>
                </>
            ) : undefined}
        >
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    {linkIcon(link, 48)}
                    <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold">{link.title || link.platform_name}</p>
                        <p className="text-[12px] text-muted-foreground">{link.platform_name}</p>
                    </div>
                </div>
                <DetailSection title="URL">
                    <div className="flex items-center gap-2 py-2">
                        <a href={link.url ?? "#"} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[12.5px] text-primary hover:underline">{link.url}</a>
                        <Button size="icon" variant="ghost" className="size-7" aria-label="Copy link"
                            onClick={() => { void navigator.clipboard?.writeText(link.url ?? ""); toast.success("Link copied"); }}>
                            <Copy className="size-3.5" />
                        </Button>
                        <Button asChild size="icon" variant="ghost" className="size-7" aria-label="Open link">
                            <a href={link.url ?? "#"} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /></a>
                        </Button>
                    </div>
                </DetailSection>
                {link.description && (
                    <DetailSection title="Description">
                        <p className="whitespace-pre-line break-words py-2 text-[12.5px] text-foreground/85">{link.description}</p>
                    </DetailSection>
                )}
                <DetailSection title="Settings">
                    {order > 0 && <DetailRow label="Display Order">{order}</DetailRow>}
                    <DetailRow label="Status" tone={link.show_in_app ? "success" : "muted"}>{link.show_in_app ? "Visible" : "Hidden"}</DetailRow>
                    <DetailRow label="Created On">{stamp(link.created_at)}</DetailRow>
                    <DetailRow label="Last Updated">{stamp(link.updated_at)}</DetailRow>
                </DetailSection>
            </div>
        </ActionSheet>
    );
}
