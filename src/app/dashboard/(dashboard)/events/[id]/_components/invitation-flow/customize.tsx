"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
    ArrowRight, Check, Eye, GripVertical, Image as ImageIcon, Info, Loader2, Palette, Pencil,
    QrCode, RotateCcw, Save, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PRIMARY_SWATCHES } from "@/lib/event-themes";
import type { ClientEvent } from "@/hooks/use-client-events";
import { useUploadEventCover } from "@/hooks/use-client-events";
import type { TemplateOption } from "@/hooks/use-client-portal";
import { InvitationCard, type InvitationData } from "@/components/common/invitation-card";
import { ImageCropDialog } from "@/components/common/image-crop-dialog";
import { EventLogoField } from "../../../_components/event-wizard";
import {
    COMPONENT_SWITCHES, hostsOf, prettyDate, prettyTime,
    type ComponentKey, type InvitationDesign,
} from "./shared";

/**
 * Step 2 — Customize & Save (design 02.png). Only the OLD invitation-form fields
 * (Jamal, 2026-11-18): component switches + order, template, primary and
 * secondary colour, own picture (custom templates), event logo, QR style. The
 * event's title, names, date and venue are shown read-only — they are edited
 * in Event Info.
 */

const SECONDARY_SWATCHES = ["#D97706", "#8B5CF6", "#EC4899", "#06B6D4", "#10B981"];
const QR_STYLES = [
    { value: 0, label: "Classic" },
    { value: 1, label: "Rounded" },
    { value: 2, label: "Heart" },
] as const;
type Tab = "content" | "design" | "media" | "qr";

export function Customize({
    event, design, setDesign, template, templates, data, components, order,
    dirty, saving, eventInfoHref, onReset, onSaveDraft, onSaveContinue,
}: {
    event: ClientEvent;
    design: InvitationDesign;
    setDesign: (fn: (d: InvitationDesign) => InvitationDesign) => void;
    /** The chosen template, with the event's secondary colour and own picture applied. */
    template: TemplateOption | null;
    templates: TemplateOption[];
    data: InvitationData;
    /** The effective switches / order (override, else the template's). */
    components: Record<ComponentKey, boolean>;
    order: ComponentKey[];
    dirty: boolean;
    saving: boolean;
    eventInfoHref: string;
    onReset: () => void;
    onSaveDraft: () => void;
    onSaveContinue: () => void;
}) {
    const [tab, setTab] = useState<Tab>("content");
    const [full, setFull] = useState(false);
    const [dragLabel, setDragLabel] = useState<string | null>(null);
    const isCustom = template?.background_type === "custom";

    const toggle = (keys: ComponentKey[], v: boolean) =>
        setDesign((d) => ({ ...d, components: { ...components, ...Object.fromEntries(keys.map((k) => [k, v])) } }));

    /* Component Order = the seven switches as units (a switch's sections stay together). */
    type Unit = { label: string | null; keys: ComponentKey[] };
    const units: Unit[] = [];
    for (const key of order) {
        const owner = COMPONENT_SWITCHES.find((s) => s.keys.includes(key));
        if (!owner) units.push({ label: null, keys: [key] });
        else if (!units.some((u) => u.label === owner.label)) units.push({ label: owner.label, keys: owner.keys });
    }
    const chips = units.filter((u): u is { label: string; keys: ComponentKey[] } => u.label !== null);
    const moveTo = (target: string) => {
        if (!dragLabel || dragLabel === target) return;
        const next = [...units];
        const from = next.findIndex((u) => u.label === dragLabel);
        const [moved] = next.splice(from, 1);
        next.splice(next.findIndex((u) => u.label === target), 0, moved);
        setDesign((d) => ({ ...d, component_order: next.flatMap((u) => u.keys) }));
    };

    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            {/* ── Edit Template Properties ─────────────────────────────── */}
            <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-[16px] font-bold text-foreground">Edit Template Properties</h2>
                    {template && (
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                            Admin Template: {template.style || template.name}
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-muted/30 p-1" role="tablist">
                    {([
                        { v: "content", label: "Content", icon: Pencil },
                        { v: "design", label: "Design", icon: Palette },
                        { v: "media", label: "Media", icon: ImageIcon },
                        { v: "qr", label: "QR & Access", icon: QrCode },
                    ] as { v: Tab; label: string; icon: typeof Pencil }[]).map(({ v, label, icon: Icon }) => (
                        <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                            className={cn("flex h-9 items-center justify-center gap-1.5 rounded-md text-[12.5px] font-semibold transition",
                                tab === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                            <Icon className="size-3.5" />{label}
                        </button>
                    ))}
                </div>

                {tab === "content" && (
                    <div className="flex flex-col gap-4">
                        {/* Event details: read-only here — they belong to Event Info. */}
                        <div className="rounded-lg border border-border">
                            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                                <span className="text-[12.5px] font-semibold text-foreground">Event Details</span>
                                <Link href={eventInfoHref} className="text-[12px] font-semibold text-primary hover:underline">Edit in Event Info</Link>
                            </div>
                            <dl className="grid gap-x-4 gap-y-2.5 p-3 text-[12.5px] sm:grid-cols-2">
                                <Detail label="Invitation Title" value={event.name} wide />
                                <Detail label="Couple / Host Names" value={hostsOf(event)} />
                                <Detail label="Template Style" value={template?.name ?? ""} />
                                <Detail label="Event Date" value={prettyDate(event.start_date)} />
                                <Detail label="Start Time" value={prettyTime(event.start_time)} />
                                <Detail label="Event Venue & Location" value={[event.venue_name, event.venue_address].filter(Boolean).join(", ")} wide />
                            </dl>
                        </div>

                        <div>
                            <p className="mb-1 text-[13px] font-semibold text-foreground">Display Settings</p>
                            <ul className="grid gap-x-6 sm:grid-cols-2">
                                {COMPONENT_SWITCHES.map((s) => (
                                    <li key={s.label} className="flex items-center justify-between gap-3 border-b border-border py-2 text-[12.5px]">
                                        {s.label}
                                        <Switch checked={s.keys.some((k) => components[k])} onCheckedChange={(v) => toggle(s.keys, v)} aria-label={s.label} />
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <p className="text-[13px] font-semibold text-foreground">Component Order</p>
                            <p className="mb-2 text-[11.5px] text-muted-foreground">Drag the chips to arrange the order on the invitation. Switched-off parts keep their place.</p>
                            <ul className="flex flex-wrap gap-2" aria-label="Component order">
                                {chips.map((c, i) => {
                                    const on = c.keys.some((k) => components[k]);
                                    return (
                                        <li key={c.label} draggable data-chip={c.label}
                                            onDragStart={() => setDragLabel(c.label)}
                                            onDragEnd={() => setDragLabel(null)}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => { e.preventDefault(); moveTo(c.label); setDragLabel(null); }}
                                            className={cn("flex cursor-grab items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11.5px] active:cursor-grabbing",
                                                dragLabel === c.label ? "border-primary bg-primary/10" : "border-border bg-card", !on && "opacity-50")}>
                                            <GripVertical className="size-3 text-muted-foreground" />
                                            <span className="grid size-4 place-items-center rounded bg-foreground/80 text-[9px] font-semibold text-background">{i + 1}</span>
                                            <span className={cn(!on && "line-through")}>{c.label}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>
                )}

                {tab === "design" && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px] font-semibold">Template Style</Label>
                            <Select value={design.theme_id} onValueChange={(code) => setDesign((d) => ({ ...d, theme_id: code, secondary_color: "" }))}>
                                <SelectTrigger className="h-10 text-[13px]"><SelectValue placeholder="Choose a template" /></SelectTrigger>
                                <SelectContent>{templates.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <ColorRow label="Primary Color" hint="Used for the names and the QR code on your invitation."
                            value={design.primary_color} swatches={PRIMARY_SWATCHES}
                            onChange={(c) => setDesign((d) => ({ ...d, primary_color: c }))} />
                        <ColorRow label="Accent Color" hint="Accents and details. Empty = the template's own colour."
                            value={design.secondary_color} swatches={SECONDARY_SWATCHES} allowEmpty
                            emptyLabel={template?.secondary_color ? `Template (${template.secondary_color})` : "Template's own"}
                            onChange={(c) => setDesign((d) => ({ ...d, secondary_color: c }))} />
                    </div>
                )}

                {tab === "media" && (
                    <div className="flex flex-col gap-5">
                        <div>
                            <p className="text-[13px] font-semibold text-foreground">Your Image</p>
                            {isCustom ? (
                                <CustomImage value={design.custom_image} onChange={(url) => setDesign((d) => ({ ...d, custom_image: url }))} />
                            ) : (
                                <p className="mt-1 text-[12px] text-muted-foreground">This template uses its own artwork. Only custom templates take your picture.</p>
                            )}
                        </div>
                        <div>
                            <p className="mb-2 text-[13px] font-semibold text-foreground">Event Logo</p>
                            <EventLogoField value={design.logo_image} sample={template?.logo_image}
                                onChange={(url) => setDesign((d) => ({ ...d, logo_image: url }))} />
                        </div>
                    </div>
                )}

                {tab === "qr" && (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-[13px]">
                            Show Event QR Code
                            <Switch checked={components.event_qr_code} onCheckedChange={(v) => toggle(["event_qr_code"], v)} aria-label="Show event QR code" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px] font-semibold">QR Style</Label>
                            <div className="flex flex-wrap gap-2">
                                {QR_STYLES.map((q) => (
                                    <button key={q.value} type="button" aria-pressed={design.qr_style === q.value}
                                        onClick={() => setDesign((d) => ({ ...d, qr_style: q.value }))}
                                        className={cn("h-9 rounded-md border px-4 text-[12.5px] font-semibold transition",
                                            design.qr_style === q.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                                        {q.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <p className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-[12px] text-muted-foreground">
                            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                            The QR code is your event&apos;s own. Guests scan it in the Event Invite app to join the event.
                        </p>
                    </div>
                )}

                <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
                    <Button variant="outline" className="h-10 text-[13px]" disabled={!dirty || saving} onClick={onReset}>
                        <RotateCcw className="size-4" />Reset Changes
                    </Button>
                    <Button variant="outline" className="h-10 text-[13px]" disabled={saving || !design.theme_id} onClick={onSaveDraft}>
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save Draft
                    </Button>
                    <Button className="ml-auto h-10 text-[13px] font-semibold" disabled={saving || !design.theme_id || (isCustom && !design.custom_image)} onClick={onSaveContinue}>
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{saving ? "Saving..." : "Save & Continue"}
                    </Button>
                </div>
                {isCustom && !design.custom_image && (
                    <p className="-mt-2 text-[11.5px] text-destructive">This custom template needs your image (Media tab) before you continue.</p>
                )}
            </section>

            {/* ── Live preview ─────────────────────────────────────────── */}
            <section className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
                    <div>
                        <h2 className="text-[16px] font-bold text-foreground">Live Invitation Preview</h2>
                        <p className="text-[12px] text-muted-foreground">Updates as you edit</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Live</span>
                </div>
                <div className="grid flex-1 place-items-center bg-muted/30 p-6" data-preview>
                    {template ? (
                        <InvitationCard template={template} data={data} componentsOverride={design.components} orderOverride={design.component_order} className="w-[290px]" />
                    ) : (
                        <p className="text-[12.5px] text-muted-foreground">Choose a template in step 1.</p>
                    )}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 text-[12px] text-muted-foreground">
                    {event.qr_token ? "Event-specific QR Code attached" : "The QR code is added once the event is saved"}
                    <Button variant="outline" size="sm" className="h-8 text-[12px]" disabled={!template} onClick={() => setFull(true)}>
                        <Eye className="size-3.5" />Full Preview
                    </Button>
                </div>
            </section>

            <Dialog open={full} onOpenChange={setFull}>
                <DialogContent className="w-auto max-w-none border-0 bg-transparent p-0 shadow-none" showCloseButton={false}>
                    <DialogTitle className="sr-only">Full invitation preview</DialogTitle>
                    <div className="flex flex-col items-center gap-3">
                        {full && template && (
                            <InvitationCard template={template} data={data} componentsOverride={design.components} orderOverride={design.component_order} className="w-[min(380px,90vw)]" />
                        )}
                        <Button type="button" variant="secondary" size="sm" onClick={() => setFull(false)}><X className="size-4" />Close</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
    return (
        <div className={cn("min-w-0", wide && "sm:col-span-2")}>
            <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
            <dd className="truncate font-medium text-foreground" title={value || undefined}>{value || "—"}</dd>
        </div>
    );
}

function ColorRow({
    label, hint, value, swatches, onChange, allowEmpty, emptyLabel,
}: { label: string; hint: string; value: string; swatches: string[]; onChange: (c: string) => void; allowEmpty?: boolean; emptyLabel?: string }) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-[12.5px] font-semibold">{label}</Label>
            <p className="-mt-1 text-[11.5px] text-muted-foreground">{hint}</p>
            <div className="flex flex-wrap items-center gap-2.5">
                {allowEmpty && (
                    <button type="button" onClick={() => onChange("")} aria-pressed={!value}
                        className={cn("h-8 rounded-md border px-2.5 text-[11.5px] font-medium", !value ? "border-primary bg-primary/10 text-primary" : "border-border")}>
                        {emptyLabel}
                    </button>
                )}
                {swatches.map((c) => (
                    <button key={c} type="button" title={c} aria-label={c} onClick={() => onChange(c)}
                        className={cn("grid size-8 place-items-center rounded-full border border-border", value.toLowerCase() === c.toLowerCase() && "ring-2 ring-primary ring-offset-2")}
                        style={{ backgroundColor: c }}>
                        {value.toLowerCase() === c.toLowerCase() && <Check className="size-4 text-white" />}
                    </button>
                ))}
                <label className="flex h-8 items-center gap-2 rounded-md border border-border px-2">
                    <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())}
                        className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" aria-label={`${label} picker`} />
                    <span className="w-[64px] text-[12px] font-medium uppercase">{value || "—"}</span>
                </label>
            </div>
        </div>
    );
}

/** The host's picture for a custom template — cropped to the card's 9:16. */
function CustomImage({ value, onChange }: { value: string; onChange: (url: string) => void }) {
    const upload = useUploadEventCover();
    const input = useRef<HTMLInputElement>(null);
    const [picked, setPicked] = useState<File | null>(null);
    return (
        <div className="mt-2 flex items-center gap-3">
            <span className="grid h-[86px] w-[50px] place-items-center overflow-hidden rounded-md border border-dashed border-border bg-muted/40">
                {upload.isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="size-4 text-muted-foreground" />}
            </span>
            <Button type="button" variant="outline" size="sm" className="h-8 text-[12px]" disabled={upload.isPending} onClick={() => input.current?.click()}>
                <Upload className="size-3.5" />{value ? "Change Image" : "Upload Image"}
            </Button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (f.size > 25 * 1024 * 1024) { toast.error("That image is larger than 25MB."); return; }
                    setPicked(f);
                }} />
            <ImageCropDialog file={picked} open={picked !== null} onOpenChange={(o) => { if (!o) setPicked(null); }}
                aspect={9 / 16} outputSize={1080} title="Crop your image"
                onCropped={(cropped) => { setPicked(null); upload.mutate(cropped, { onSuccess: onChange }); }} />
        </div>
    );
}
