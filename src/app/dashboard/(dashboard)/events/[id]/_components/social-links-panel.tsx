"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Link2, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faInstagram, faXTwitter, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import type { ClientEvent } from "@/hooks/use-client-events";
import {
    SOCIAL_PRESETS, uploadSocialIcon, useDeleteSocialLink, useReorderSocialLinks, useSaveSocialLink, useSocialLinks,
    type SocialLink,
} from "@/hooks/use-event-engagement";
import { Empty, FieldError, PanelLoading, Section, ShowInAppRow, SwitchRow } from "./module-ui";

/**
 * Social Links — as the app's Social Links screen (V1, Jamal's mockup
 * 2026-10-20). The four presets (Instagram, Facebook, X, YouTube) are always
 * there ("Not added yet" until they get a link); + Add Social Link makes a
 * custom one with its own icon. Move up / down sets the order guests see.
 * Same endpoints as the app.
 */

const PRESET_ICON = { instagram: faInstagram, facebook: faFacebook, x: faXTwitter, youtube: faYoutube } as const;

const shortUrl = (url: string | null) => (url ?? "").replace(/^https?:\/\/(www\.)?/, "");

export function SocialIcon({ link, size = 40 }: { link: Pick<SocialLink, "platform_key" | "icon_url" | "platform_name">; size?: number }) {
    const preset = link.platform_key ? SOCIAL_PRESETS[link.platform_key] : null;
    const box = { width: size, height: size };
    if (preset && link.platform_key) {
        return (
            <span className="grid shrink-0 place-items-center rounded-lg" style={{ ...box, backgroundColor: `${preset.color}14` }}>
                <FontAwesomeIcon icon={PRESET_ICON[link.platform_key]} style={{ color: preset.color, width: size * 0.45, height: size * 0.45 }} />
            </span>
        );
    }
    if (link.icon_url) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={mediaUrl(link.icon_url)} alt="" className="shrink-0 rounded-lg border border-border object-cover" style={box} />;
    }
    return (
        <span className="grid shrink-0 place-items-center rounded-lg bg-primary/10 text-primary" style={box}>
            <Link2 style={{ width: size * 0.45, height: size * 0.45 }} />
        </span>
    );
}

export function SocialLinksPanel({ event }: { event: ClientEvent }) {
    const query = useSocialLinks(event.id);
    const save = useSaveSocialLink(event.id);
    const remove = useDeleteSocialLink(event.id);
    const reorder = useReorderSocialLinks(event.id);
    const [editing, setEditing] = useState<SocialLink | "new" | null>(null);
    const [deleting, setDeleting] = useState<SocialLink | null>(null);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Social Links"><Empty title="Could not load the social links">Please try again in a moment.</Empty></Section>;
    }
    const page = query.data;
    const links = page.links;

    const move = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= links.length) return;
        const ids = links.map((l) => l.id);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        reorder.mutate(ids);
    };

    return (
        <div className="flex flex-col gap-5">
            <Section
                title="Social Links"
                action={page.can_edit && (
                    <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add Social Link</Button>
                )}
            >
                <ShowInAppRow
                    eventId={event.id} menuIds={event.menu_ids ?? []} menuId={page.menu_id}
                    isDefault={page.is_default} show={page.show_in_app} label="Social Links"
                />
                {links.length === 0 ? (
                    <Empty title="No social links yet">Add the event&apos;s Instagram, Facebook, X or YouTube page, or any other link.</Empty>
                ) : (
                    <ul className="mt-2 flex flex-col gap-2">
                        {links.map((link, i) => {
                            const has = !!link.url;
                            return (
                                <li key={link.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3">
                                    <SocialIcon link={link} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[13px] font-semibold">{link.title || link.platform_name}</p>
                                        {has ? (
                                            <a href={link.url!} target="_blank" rel="noreferrer"
                                                className="flex min-w-0 items-center gap-1 text-[12px] text-primary hover:underline">
                                                <span className="truncate">{shortUrl(link.url)}</span>
                                                <ExternalLink className="size-3 shrink-0" />
                                            </a>
                                        ) : (
                                            <p className="text-[12px] italic text-muted-foreground">Not added yet</p>
                                        )}
                                    </div>
                                    {page.can_edit && (
                                        <div className="flex shrink-0 items-center gap-1">
                                            <div className="mr-1 hidden items-center gap-2 sm:flex">
                                                <span className="text-[11px] text-muted-foreground">Show</span>
                                                <Switch
                                                    checked={link.show_in_app}
                                                    disabled={!has || save.isPending}
                                                    onCheckedChange={(v) => save.mutate({ id: link.id, data: { show_in_app: v }, quiet: true })}
                                                    aria-label="Show in app"
                                                />
                                            </div>
                                            <Button size="icon" variant="ghost" className="size-8" aria-label="Move up" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                                                <ArrowUp className="size-3.5" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="size-8" aria-label="Move down" disabled={i === links.length - 1 || reorder.isPending} onClick={() => move(i, 1)}>
                                                <ArrowDown className="size-3.5" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="size-8" aria-label={has ? "Edit" : "Add link"} onClick={() => setEditing(link)}>
                                                {has ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
                                            </Button>
                                            {(!link.platform_key || has) && (
                                                <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="Delete" onClick={() => setDeleting(link)}>
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Section>

            {editing && (
                <SocialLinkDialog
                    key={editing === "new" ? "new" : editing.id}
                    eventId={event.id}
                    link={editing === "new" ? null : editing}
                    onClose={() => setEditing(null)}
                />
            )}

            <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{deleting?.platform_key ? `Remove the ${deleting.platform_name} link?` : "Delete this social link?"}</DialogTitle>
                        <DialogDescription>
                            {deleting?.platform_key
                                ? `${deleting.platform_name} stays in the list as "Not added yet".`
                                : `"${deleting?.title}" will be removed for everyone.`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
                        <Button
                            variant="destructive" disabled={remove.isPending}
                            onClick={() => deleting && remove.mutate({ id: deleting.id, preset: !!deleting.platform_key }, { onSuccess: () => setDeleting(null) })}
                        >
                            {deleting?.platform_key ? "Remove" : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SocialLinkDialog({ eventId, link, onClose }: { eventId: number; link: SocialLink | null; onClose: () => void }) {
    const save = useSaveSocialLink(eventId);
    const preset = !!link?.platform_key;
    const [platform, setPlatform] = useState(link?.platform_name ?? "");
    const [title, setTitle] = useState(link?.title ?? "");
    const [url, setUrl] = useState(link?.url ?? "");
    const [description, setDescription] = useState(link?.description ?? "");
    const [iconUrl, setIconUrl] = useState<string | null>(link?.icon_url ?? null);
    const [openExternal, setOpenExternal] = useState(link?.open_external ?? true);
    const [showInApp, setShowInApp] = useState(link?.show_in_app ?? true);
    const [uploading, setUploading] = useState(false);
    const [tried, setTried] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

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
        if ((!preset && (!platform.trim() || !title.trim())) || !url.trim()) {
            toast.error("Please fill all mandatory fields.");
            return;
        }
        if (!/^https?:\/\//i.test(url.trim())) {
            toast.error("Please enter a valid link starting with http:// or https://.");
            return;
        }
        const data: Record<string, unknown> = {
            url: url.trim(),
            description: description.trim() || null,
            open_external: openExternal,
            show_in_app: showInApp,
            ...(preset ? (title.trim() ? { title: title.trim() } : {}) : {
                platform_name: platform.trim(), title: title.trim(), icon_url: iconUrl,
            }),
        };
        save.mutate({ id: link?.id, data }, { onSuccess: onClose });
    };

    const bad = (v: string) => tried && !v.trim();

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{link ? (preset ? `${link.platform_name} Link` : "Edit Social Link") : "Add Social Link"}</DialogTitle>
                    <DialogDescription>Guests open this link from the event app.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    {!preset && (
                        <div className="flex items-center gap-3">
                            <SocialIcon link={{ platform_key: null, icon_url: iconUrl, platform_name: platform }} size={52} />
                            <div className="flex flex-col gap-1">
                                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickIcon(e.target.files?.[0]); e.target.value = ""; }} />
                                <div className="flex gap-2">
                                    <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                                        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                                        {iconUrl ? "Change Icon" : "Upload Icon"}
                                    </Button>
                                    {iconUrl && (
                                        <Button type="button" size="sm" variant="ghost" onClick={() => setIconUrl(null)}><X className="size-3.5" /> Remove</Button>
                                    )}
                                </div>
                                <p className="text-[11px] text-muted-foreground">Optional · square image, up to 1 MB</p>
                            </div>
                        </div>
                    )}
                    {!preset && (
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Platform Name <span className="text-destructive">*</span></Label>
                            <Input value={platform} maxLength={60} placeholder="e.g. Our Website, Venue Location, LinkedIn" onChange={(e) => setPlatform(e.target.value)} className={cn(bad(platform) && "border-destructive")} />
                            <FieldError show={bad(platform)} />
                        </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Title {!preset && <span className="text-destructive">*</span>}</Label>
                        <Input value={title} maxLength={100} placeholder="e.g. Our Wedding Instagram" onChange={(e) => setTitle(e.target.value)} className={cn(!preset && bad(title) && "border-destructive")} />
                        {!preset && <FieldError show={bad(title)} />}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Link <span className="text-destructive">*</span></Label>
                        <Input value={url} maxLength={500} placeholder="https://" onChange={(e) => setUrl(e.target.value)} className={cn(bad(url) && "border-destructive")} />
                        <FieldError show={bad(url)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Description (optional)</Label>
                        <Textarea value={description} maxLength={300} rows={2} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="rounded-lg border border-border px-3">
                        <SwitchRow id="sl-external" label="Open in External App" hint="Opens in Instagram / YouTube / the browser" checked={openExternal} onChange={setOpenExternal} />
                        <SwitchRow id="sl-show" label="Show in Event App" hint="Guests see this link" checked={showInApp} onChange={setShowInApp} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={save.isPending || uploading} onClick={submit}>{link ? "Save Changes" : "Add Link"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
