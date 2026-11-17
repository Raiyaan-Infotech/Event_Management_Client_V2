"use client";

import { useId, useRef, useState } from "react";
import {
    CalendarDays, Check, Circle, Droplet, Eye, GripVertical, Image as ImageIcon, Loader2, MapPin, Music, Pause, Pipette, Play, Plus,
    RotateCcw, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import { useUploadEventCover } from "@/hooks/use-client-events";
import type { TemplateOption } from "@/hooks/use-client-portal";
import {
    SPLASH_DURATIONS,
    SPLASH_PARTS,
    type SplashPart,
    splashBackgroundCss,
    splashFrameTint,
    splashLineColor,
    splashLookFromTemplate,
    useSplashFrames,
    useUploadSplashMedia,
    type SplashAnimation,
    type SplashBackground,
    type SplashState,
} from "@/hooks/use-event-splash";

/**
 * Splash Screen Customization (Jamal's design, 2026-11-17) — the screen guests
 * see while the event opens in the mobile app.
 *
 * Left: Splash Content (enable, title, subtitle, date, logo) and Design & Style
 * (Image / Gradient / Solid Color with their own controls, Border / Frame Style,
 * text and accent colours, animation, duration, music). Middle: the live phone.
 * Right: Quick Templates.
 *
 * From the admin portal (Jamal, 2026-11-17): Quick Templates = the admin's
 * Invitation Templates the plan allows (picking one copies its look); Border /
 * Frame Style = the admin's Frame Styles; the logo = the template's sample logo,
 * which the host may replace with their own (`events.logo_image` — the
 * invitation shows the same one).
 */

const ANIMATIONS: { value: SplashAnimation; label: string }[] = [
    { value: "fade", label: "Fade In (Recommended)" },
    { value: "zoom", label: "Zoom In" },
    { value: "slide", label: "Slide In" },
    { value: "particles", label: "Sparkle Particles" },
];

const ANGLES = [
    { angle: 135, label: "135° (Top Left → Bottom Right)" },
    { angle: 180, label: "180° (Top → Bottom)" },
    { angle: 90, label: "90° (Left → Right)" },
    { angle: 45, label: "45° (Bottom Left → Top Right)" },
    { angle: 0, label: "0° (Bottom → Top)" },
    { angle: 225, label: "225° (Top Right → Bottom Left)" },
    { angle: 270, label: "270° (Right → Left)" },
    { angle: 315, label: "315° (Bottom Right → Top Left)" },
];

const MAX_MUSIC_BYTES = 5 * 1024 * 1024;
const MAX_MUSIC_SECONDS = 60;

/** A picked audio file's length in seconds; null when the browser can't read it. */
function audioSeconds(file: File): Promise<number | null> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const audio = new Audio();
        const done = (v: number | null) => {
            URL.revokeObjectURL(url);
            resolve(v);
        };
        audio.preload = "metadata";
        audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
        audio.onerror = () => done(null);
        audio.src = url;
    });
}

export function SplashStep({
    value,
    onChange,
    title,
    dateText,
    tagline,
    eventName,
    venue,
    templates,
    templatesLoading,
    defaultLook,
    logoUrl,
    logoIsSample,
    onLogoChange,
}: {
    value: SplashState;
    onChange: (next: SplashState) => void;
    /** "Groom & Bride", or the event title — used when Splash Title is blank. */
    title: string;
    dateText: string;
    /** The event's tagline — used when Subtitle is blank. */
    tagline: string;
    /** The Event Title part (the event's name). */
    eventName: string;
    /** The Venue part. */
    venue: string;
    /** The admin's invitation templates on offer to this event. */
    templates: TemplateOption[];
    templatesLoading?: boolean;
    /** What Reset to Default goes back to (the event's invitation template). */
    defaultLook: SplashState;
    /** The logo shown: the event's own, else the template's sample. */
    logoUrl: string;
    logoIsSample: boolean;
    /** Sets the EVENT's logo ("" = back to the template's sample). */
    onLogoChange: (url: string) => void;
}) {
    const set = <K extends keyof SplashState>(key: K, v: SplashState[K]) => onChange({ ...value, [key]: v });
    const setPart = (key: SplashPart, on: boolean) => onChange({ ...value, parts: { ...value.parts, [key]: on } });
    const [dragKey, setDragKey] = useState<SplashPart | null>(null);
    /** Drop the dragged part onto `target`'s place. */
    const moveTo = (target: SplashPart) => {
        if (!dragKey || dragKey === target) return;
        const next = value.order.filter((k) => k !== dragKey);
        next.splice(next.indexOf(target), 0, dragKey);
        onChange({ ...value, order: next });
    };
    const upload = useUploadSplashMedia();
    const logoUpload = useUploadEventCover();
    const frames = useSplashFrames();
    const imageInput = useRef<HTMLInputElement>(null);
    const musicInput = useRef<HTMLInputElement>(null);
    const logoInput = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState<"image" | "music" | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [replay, setReplay] = useState(0);
    const [allFrames, setAllFrames] = useState(false);

    const pickFile = async (kind: "image" | "music", file: File | undefined) => {
        if (!file) return;
        if (kind === "image" && file.size > 5 * 1024 * 1024) {
            toast.error("Please choose an image smaller than 5MB.");
            return;
        }
        if (kind === "music" && file.size > MAX_MUSIC_BYTES) {
            toast.error("Please choose an MP3 smaller than 5MB.");
            return;
        }
        if (kind === "music") {
            const seconds = await audioSeconds(file);
            if (seconds === null) {
                toast.error("That audio file could not be read. Please choose an MP3.");
                return;
            }
            if (seconds > MAX_MUSIC_SECONDS + 0.5) {
                toast.error("Please choose music of 1 minute or less.");
                return;
            }
        }
        setUploading(kind);
        try {
            const url = await upload.mutateAsync(file);
            if (kind === "image") onChange({ ...value, image_url: url, background: "image", template: "", overlay_opacity: value.overlay_opacity || 40 });
            else onChange({ ...value, music_url: url, music_name: file.name, music_enabled: true });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "That file could not be uploaded.");
        } finally {
            setUploading(null);
        }
    };

    const pickLogo = (file: File | undefined) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error("That image is larger than 5MB.");
            return;
        }
        logoUpload.mutate(file, {
            onSuccess: (url) => {
                onLogoChange(url);
                if (!value.parts.logo) setPart("logo", true);
            },
        });
    };

    const setStop = (i: number, c: string) => {
        const next = [...value.gradient_colors];
        next[i] = c;
        onChange({ ...value, gradient_colors: next, template: "" });
    };

    // The selected frame first, so it is visible even beyond the first row.
    const frameList = frames.data ?? [];
    const orderedFrames = value.frame_id
        ? [...frameList.filter((f) => f.id === value.frame_id), ...frameList.filter((f) => f.id !== value.frame_id)]
        : frameList;
    const shownFrames = allFrames ? orderedFrames : orderedFrames.slice(0, 7);

    const shownTitle = value.title.trim() || title || "Your Event";
    const shownSubtitle = value.subtitle.trim() || tagline;

    return (
        <div className="flex flex-col gap-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_260px_230px]">
                {/* ── Left: content + design ─────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border p-4">
                    <section className="flex flex-col gap-3">
                        <h3 className="text-[15px] font-bold text-foreground">Splash Content</h3>

                        <Row label="Enable Splash Screen">
                            <Switch checked={value.enabled} onCheckedChange={(v) => set("enabled", v)} aria-label="Enable splash screen" />
                            {!value.enabled && <span className="text-[11.5px] text-muted-foreground">Guests go straight into the event.</span>}
                        </Row>

                        <div className={cn("flex flex-col gap-3", !value.enabled && "pointer-events-none opacity-50")}>
                            <Row label={<>Splash Title <span className="text-destructive">*</span></>}>
                                <Input value={value.title} maxLength={60} placeholder={title || "Event title"}
                                    onChange={(e) => set("title", e.target.value)} className="h-9 max-w-[340px] text-[13px]" />
                            </Row>
                            <Row label="Subtitle / Tagline">
                                <Input value={value.subtitle} maxLength={80} placeholder={tagline || "Our Wedding Celebration"}
                                    onChange={(e) => set("subtitle", e.target.value)} className="h-9 max-w-[340px] text-[13px]" />
                            </Row>
                            <Row label="Show Event Date">
                                <Switch checked={value.parts.date_time} onCheckedChange={(v) => setPart("date_time", v)} aria-label="Show event date" />
                                <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-[12.5px] font-medium">
                                    <CalendarDays className="size-4 text-muted-foreground" />{dateText || "No date yet"}
                                </span>
                            </Row>
                            <Row label="Show Event Logo / Monogram">
                                <Switch checked={value.parts.logo} onCheckedChange={(v) => setPart("logo", v)} aria-label="Show event logo" />
                                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted/40">
                                    {logoUpload.isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                        // eslint-disable-next-line @next/next/no-img-element
                                        : logoUrl ? <img src={logoUrl} alt="Event logo" className="h-full w-full object-contain p-1" />
                                            : <ImageIcon className="size-4 text-muted-foreground" />}
                                </span>
                                <Button type="button" size="sm" variant="outline" className="h-8 text-[12px]"
                                    disabled={logoUpload.isPending} onClick={() => logoInput.current?.click()}>
                                    <Upload className="size-3.5" />{logoUrl && !logoIsSample ? "Change" : "Upload"}
                                </Button>
                                {logoUrl && !logoIsSample && (
                                    <Button type="button" size="sm" variant="outline"
                                        className="h-8 border-destructive/40 text-[12px] text-destructive hover:bg-destructive/5 hover:text-destructive"
                                        onClick={() => onLogoChange("")}>
                                        <Trash2 className="size-3.5" />Remove
                                    </Button>
                                )}
                                <input ref={logoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickLogo(f); }} />
                            </Row>
                            <p className="-mt-1 text-[11px] text-muted-foreground sm:pl-[200px]">
                                {logoIsSample
                                    ? "The template's sample logo. Upload yours — it also replaces the logo on your invitation."
                                    : logoUrl ? "Your logo — the same one is shown on your invitation." : "No logo yet. The one you upload is also shown on your invitation."}
                            </p>
                        </div>
                    </section>

                    <div className="h-px bg-border" />

                    {/* Splash Components — every part with a switch, then the drag order (Jamal, 2026-11-17). */}
                    <section className={cn("flex flex-col gap-3", !value.enabled && "pointer-events-none opacity-50")}>
                        <div>
                            <h3 className="text-[15px] font-bold text-foreground">Splash Components</h3>
                            <p className="text-[12px] text-muted-foreground">Choose what is shown on the splash screen.</p>
                        </div>
                        <ul className="grid gap-x-8 sm:grid-cols-2">
                            {SPLASH_PARTS.map((p) => (
                                <li key={p.key} className="flex items-center justify-between gap-3 border-b border-border py-2 text-[13px]">
                                    {p.label}
                                    <Switch checked={value.parts[p.key]} onCheckedChange={(v) => setPart(p.key, v)} aria-label={p.label} />
                                </li>
                            ))}
                        </ul>
                        <div>
                            <p className="text-[12.5px] font-semibold text-foreground">Component Order</p>
                            <p className="mb-2 text-[11.5px] text-muted-foreground">
                                Drag the chips to arrange the order, top to bottom. Components switched off keep their place.
                            </p>
                            <ul className="flex flex-wrap gap-2" aria-label="Component order">
                                {value.order.map((key, index) => {
                                    const part = SPLASH_PARTS.find((p) => p.key === key)!;
                                    const on = value.parts[key];
                                    return (
                                        <li
                                            key={key}
                                            draggable
                                            data-part={key}
                                            onDragStart={() => setDragKey(key)}
                                            onDragEnd={() => setDragKey(null)}
                                            // preventDefault on dragOver, or the browser refuses the drop.
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => { e.preventDefault(); moveTo(key); setDragKey(null); }}
                                            className={cn(
                                                "flex cursor-grab items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors active:cursor-grabbing",
                                                dragKey === key ? "border-primary bg-primary/10" : "border-border bg-card",
                                                !on && "opacity-50",
                                            )}
                                        >
                                            <GripVertical className="size-3.5 text-muted-foreground" />
                                            <span className="grid size-4 place-items-center rounded bg-foreground/80 text-[9px] font-semibold text-background">{index + 1}</span>
                                            <span className={cn(!on && "line-through")}>{part.label}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </section>

                    <div className="h-px bg-border" />

                    <section className={cn("flex flex-col gap-3", !value.enabled && "pointer-events-none opacity-50")}>
                        <h3 className="text-[15px] font-bold text-foreground">Design &amp; Style</h3>

                        <Row label="Background Type">
                            <div className="inline-flex rounded-lg border border-border p-0.5">
                                {([
                                    { v: "image", label: "Image", icon: ImageIcon },
                                    { v: "gradient", label: "Gradient", icon: Droplet },
                                    { v: "color", label: "Solid Color", icon: Circle },
                                ] as { v: SplashBackground; label: string; icon: typeof Circle }[]).map(({ v, label, icon: Icon }) => (
                                    <button key={v} type="button" aria-pressed={value.background === v}
                                        onClick={() => onChange({ ...value, background: v, template: "" })}
                                        className={cn(
                                            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition",
                                            value.background === v ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted",
                                        )}>
                                        <Icon className="size-3.5" />{label}
                                    </button>
                                ))}
                            </div>
                        </Row>

                        {value.background === "image" && (
                            <>
                                <Row label="Background Image">
                                    <span className="h-14 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
                                        style={value.image_url ? { background: splashBackgroundCss(value) } : undefined} />
                                    <Button type="button" size="sm" variant="outline" className="h-8 text-[12px]"
                                        disabled={uploading === "image"} onClick={() => imageInput.current?.click()}>
                                        {uploading === "image" ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                                        {value.image_url ? "Change" : "Upload"}
                                    </Button>
                                    {value.image_url && (
                                        <Button type="button" size="sm" variant="outline"
                                            className="h-8 border-destructive/40 text-[12px] text-destructive hover:bg-destructive/5 hover:text-destructive"
                                            onClick={() => onChange({ ...value, image_url: "", template: "" })}>
                                            <Trash2 className="size-3.5" />Remove
                                        </Button>
                                    )}
                                    <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pickFile("image", f); }} />
                                </Row>
                                <OverlayRow value={value} onChange={onChange} />
                            </>
                        )}

                        {value.background === "gradient" && (
                            <>
                                <Row label="Gradient Style">
                                    {(["linear", "radial"] as const).map((g) => (
                                        <label key={g} className="flex cursor-pointer items-center gap-2 text-[13px]">
                                            <input type="radio" name="splash-gradient" checked={value.gradient_type === g}
                                                onChange={() => onChange({ ...value, gradient_type: g, template: "" })}
                                                className="size-4 accent-[var(--primary)]" />
                                            {g === "linear" ? "Linear Gradient" : "Radial Gradient"}
                                        </label>
                                    ))}
                                </Row>
                                <Row label="Gradient Colors">
                                    {value.gradient_colors.map((c, i) => (
                                        <span key={i} className="relative">
                                            <ColorInput value={c} onChange={(v) => setStop(i, v)} />
                                            {value.gradient_colors.length > 2 && (
                                                <button type="button" aria-label="Remove colour"
                                                    onClick={() => onChange({ ...value, gradient_colors: value.gradient_colors.filter((_, j) => j !== i), template: "" })}
                                                    className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-muted-foreground text-white hover:bg-destructive">
                                                    <X className="size-2.5" />
                                                </button>
                                            )}
                                        </span>
                                    ))}
                                    {value.gradient_colors.length < 5 && (
                                        <Button type="button" size="icon" variant="outline" className="size-9" aria-label="Add colour"
                                            onClick={() => onChange({ ...value, gradient_colors: [...value.gradient_colors, value.gradient_colors[value.gradient_colors.length - 1] ?? "#FFFFFF"], template: "" })}>
                                            <Plus className="size-4" />
                                        </Button>
                                    )}
                                </Row>
                                {value.gradient_type === "linear" && (
                                    <Row label="Direction / Angle">
                                        <Select value={String(value.gradient_angle)} onValueChange={(v) => onChange({ ...value, gradient_angle: Number(v), template: "" })}>
                                            <SelectTrigger className="h-9 w-full max-w-[340px] text-[12.5px]"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {(ANGLES.some((a) => a.angle === value.gradient_angle) ? ANGLES : [...ANGLES, { angle: value.gradient_angle, label: `${value.gradient_angle}°` }])
                                                    .map((a) => <SelectItem key={a.angle} value={String(a.angle)}>{a.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </Row>
                                )}
                                <OverlayRow value={value} onChange={onChange} />
                            </>
                        )}

                        {value.background === "color" && (
                            <Row label={<>Primary Background Color <span className="text-destructive">*</span></>}>
                                <ColorInput value={value.color} onChange={(c) => onChange({ ...value, color: c, template: "" })} />
                                <Pipette className="size-4 text-muted-foreground" aria-hidden />
                            </Row>
                        )}

                        <Row label="Accent / Border Color">
                            <ColorInput value={value.border_color} onChange={(c) => set("border_color", c)} />
                            <label className="flex cursor-pointer items-center gap-2 text-[12px]">
                                <Checkbox checked={value.border_for_frame} onCheckedChange={(v) => set("border_for_frame", v === true)} />
                                Use for frame &amp; dividers
                            </label>
                        </Row>

                        {/* Border / Frame Style — the admin's Frame Styles. */}
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
                            <Label className="pt-2 text-[13px] font-medium text-foreground sm:w-[188px] sm:shrink-0">Border / Frame Style</Label>
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                <div className="flex flex-wrap gap-2">
                                    {frames.isLoading
                                        ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[68px] w-[52px] rounded-md" />)
                                        : (
                                            <>
                                                {shownFrames.map((f) => {
                                                    const on = value.frame_id === f.id;
                                                    return (
                                                        <button key={f.id} type="button" title={f.name} aria-pressed={on}
                                                            onClick={() => onChange({ ...value, frame_id: f.id, frame_url: f.file_url })}
                                                            className={cn(
                                                                "relative h-[68px] w-[52px] overflow-hidden rounded-md border bg-muted/30 transition",
                                                                on ? "border-primary ring-2 ring-primary/25" : "border-border hover:bg-muted",
                                                            )}>
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img src={mediaUrl(f.file_url)} alt={f.name} className="absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)] object-fill" />
                                                            {on && <span className="absolute -right-0 -top-0 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-2.5" /></span>}
                                                        </button>
                                                    );
                                                })}
                                                <button type="button" aria-pressed={!value.frame_id}
                                                    onClick={() => onChange({ ...value, frame_id: null, frame_url: "" })}
                                                    className={cn(
                                                        "grid h-[68px] w-[52px] place-items-center rounded-md border bg-muted/30 text-[11.5px] font-medium transition",
                                                        !value.frame_id ? "border-primary ring-2 ring-primary/25" : "border-border hover:bg-muted",
                                                    )}>
                                                    None
                                                </button>
                                            </>
                                        )}
                                </div>
                                {orderedFrames.length > 7 && (
                                    <button type="button" className="w-fit text-[12px] font-semibold text-primary hover:underline" onClick={() => setAllFrames((v) => !v)}>
                                        {allFrames ? "Show fewer" : `Show all ${orderedFrames.length} frames`}
                                    </button>
                                )}
                                {!frames.isLoading && frameList.length === 0 && (
                                    <p className="text-[11.5px] text-muted-foreground">No frame styles have been added in the admin portal yet.</p>
                                )}
                            </div>
                        </div>

                        <Row label="Text Color">
                            <ColorInput value={value.text_color} onChange={(c) => set("text_color", c)} />
                            <span className="ml-2 text-[13px] font-medium">Accent Color</span>
                            <ColorInput value={value.accent_color} onChange={(c) => set("accent_color", c)} />
                        </Row>
                        <Row label="Animation / Style">
                            <Select value={value.animation} onValueChange={(v) => { set("animation", v as SplashAnimation); setReplay((n) => n + 1); }}>
                                <SelectTrigger className="h-9 w-full max-w-[340px] text-[12.5px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ANIMATIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </Row>
                        <Row label="Display Duration">
                            <Select value={String(value.duration)} onValueChange={(v) => set("duration", Number(v))}>
                                <SelectTrigger className="h-9 w-full max-w-[340px] text-[12.5px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {SPLASH_DURATIONS.map((d) => <SelectItem key={d} value={String(d)}>{d} Seconds</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </Row>
                        <Row label="Music">
                            <Switch checked={value.music_enabled} onCheckedChange={(v) => set("music_enabled", v)} aria-label="Enable music" />
                            {value.music_enabled && (
                                <MusicRow key={value.music_url} url={value.music_url} name={value.music_name} uploading={uploading === "music"}
                                    onPick={() => musicInput.current?.click()} />
                            )}
                            <input ref={musicInput} type="file" accept="audio/mpeg,.mp3" className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pickFile("music", f); }} />
                        </Row>
                        {value.music_enabled && <p className="-mt-1 text-[11px] text-muted-foreground sm:pl-[200px]">MP3, up to 1 minute and less than 5MB.</p>}
                    </section>
                </div>

                {/* ── Middle: the phone ──────────────────────────────────── */}
                <div className="flex justify-center lg:sticky lg:top-4 lg:self-start">
                    <PhonePreview key={replay} value={value} title={shownTitle} subtitle={shownSubtitle} dateText={dateText}
                        logoUrl={logoUrl} eventName={eventName} venue={venue} />
                </div>

                {/* ── Right: quick templates = the admin's invitation templates ── */}
                <div className="rounded-xl border border-border p-3 lg:col-span-2 xl:col-span-1 xl:self-start">
                    <h3 className="text-[15px] font-bold text-foreground">Quick Templates</h3>
                    <p className="mb-3 text-[12px] text-muted-foreground">Apply a ready style and customize.</p>
                    {templatesLoading ? (
                        <div className="grid grid-cols-3 gap-2.5 xl:grid-cols-2">
                            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-lg" />)}
                        </div>
                    ) : templates.length === 0 ? (
                        <p className="text-[12px] text-muted-foreground">No templates are available on your plan yet.</p>
                    ) : (
                        <div className="grid max-h-[560px] grid-cols-3 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-4 xl:grid-cols-2">
                            {templates.map((t) => (
                                <TemplateTile key={t.code} template={t} on={value.template === t.code}
                                    onPick={() => onChange({ ...value, ...splashLookFromTemplate(t) })} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" className="h-9 text-[13px]" onClick={() => setPreviewOpen(true)}>
                    <Eye className="size-4" />Preview
                </Button>
                <Button type="button" variant="outline" className="h-9 text-[13px]"
                    onClick={() => onChange({ ...defaultLook, id: value.id })}>
                    <RotateCcw className="size-4" />Reset to Default
                </Button>
            </div>

            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="w-auto max-w-none border-0 bg-transparent p-0 shadow-none" showCloseButton={false}>
                    <DialogTitle className="sr-only">Splash screen preview</DialogTitle>
                    <div className="flex flex-col items-center gap-3">
                        {previewOpen && (
                            <PhonePreview value={value} title={shownTitle} subtitle={shownSubtitle} dateText={dateText}
                                logoUrl={logoUrl} eventName={eventName} venue={venue} large />
                        )}
                        <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewOpen(false)}>
                            <X className="size-4" />Close
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** One admin template as a small splash: its background, frame and name. */
function TemplateTile({ template, on, onPick }: { template: TemplateOption; on: boolean; onPick: () => void }) {
    const look = splashLookFromTemplate(template);
    const bg = splashBackgroundCss({
        background: look.background ?? "color",
        image_url: look.image_url ?? "",
        color: look.color ?? "#FFFFFF",
        gradient_type: look.gradient_type ?? "linear",
        gradient_angle: look.gradient_angle ?? 180,
        gradient_colors: look.gradient_colors ?? ["#FFFFFF", "#FFFFFF"],
    });
    return (
        <button type="button" title={template.name} aria-pressed={on} onClick={onPick}
            className={cn("relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition", on ? "border-primary" : "border-border hover:border-primary/40")}
            style={{ background: bg }}>
            {template.frame_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(template.frame_url)} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
            )}
            <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/35 px-1 py-0.5 text-center text-[9.5px] font-semibold text-white">{template.name}</span>
            {on && <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>}
        </button>
    );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <Label className="text-[13px] font-medium text-foreground sm:w-[188px] sm:shrink-0">{label}</Label>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
        </div>
    );
}

function OverlayRow({ value, onChange }: { value: SplashState; onChange: (s: SplashState) => void }) {
    return (
        <Row label="Overlay Color">
            <ColorInput value={value.overlay_color} onChange={(c) => onChange({ ...value, overlay_color: c })} />
            <span className="ml-2 text-[13px] font-medium">Opacity</span>
            <input type="range" aria-label="Overlay opacity" className="w-28 accent-[var(--primary)]" min={0} max={90} step={5}
                value={value.overlay_opacity}
                onChange={(e) => onChange({ ...value, overlay_opacity: Number(e.target.value) })} />
            <span className="w-11 rounded-md border border-border px-1.5 py-1 text-center text-[12px]">{value.overlay_opacity}%</span>
        </Row>
    );
}

function ColorInput({ value, onChange }: { value: string; onChange: (c: string) => void }) {
    const [text, setText] = useState(value);
    // Follow a value changed from outside (a template, Reset) — during render, not in an effect.
    const [seen, setSeen] = useState(value);
    if (seen !== value) {
        setSeen(value);
        setText(value);
    }
    return (
        <div className="flex w-fit items-center gap-2 rounded-md border border-border px-1.5 py-1">
            <input
                type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
                onChange={(e) => onChange(e.target.value.toUpperCase())}
                className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label="Pick a colour"
            />
            <input
                value={text}
                onChange={(e) => {
                    const v = e.target.value.slice(0, 7);
                    setText(v);
                    if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toUpperCase());
                }}
                className="w-[68px] bg-transparent text-[12.5px] font-medium uppercase outline-none"
                aria-label="Hex colour"
            />
        </div>
    );
}

function MusicRow({ url, name, uploading, onPick }: { url: string; name: string; uploading: boolean; onPick: () => void }) {
    const audio = useRef<HTMLAudioElement>(null);
    // Keyed by `url` where it is used, so a new file starts paused.
    const [playing, setPlaying] = useState(false);
    return (
        <div className="flex min-w-0 max-w-sm flex-1 items-center gap-2 rounded-md border border-border p-1.5">
            <span className="grid size-7 shrink-0 place-items-center rounded bg-primary text-primary-foreground"><Music className="size-3.5" /></span>
            <span className="min-w-0 flex-1 truncate text-[12px]" title={name || undefined}>{url ? name || "Music" : "No music yet"}</span>
            <Button type="button" variant="outline" size="sm" className="h-7 text-[11.5px]" onClick={onPick} disabled={uploading}>
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : url ? "Change" : "Upload"}
            </Button>
            {url && (
                <>
                    <Button type="button" variant="outline" size="icon" className="size-7 rounded-full" aria-label={playing ? "Pause" : "Play"}
                        onClick={() => { const a = audio.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); }}>
                        {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
                    </Button>
                    <audio ref={audio} src={url} preload="metadata"
                        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
                </>
            )}
        </div>
    );
}

function PhonePreview({
    value, title, subtitle, dateText, logoUrl, eventName, venue, large = false,
}: { value: SplashState; title: string; subtitle: string; dateText: string; logoUrl: string; eventName: string; venue: string; large?: boolean }) {
    const tintId = `splash-tint-${useId().replace(/:/g, "")}`;
    const enter =
        value.animation === "zoom" ? "animate-in zoom-in-75 fade-in duration-700"
            : value.animation === "slide" ? "animate-in slide-in-from-bottom-8 fade-in duration-700"
                : "animate-in fade-in duration-1000";
    const line = splashLineColor(value);
    const tint = splashFrameTint(value);
    const overlay = value.background !== "color" && value.overlay_opacity > 0;
    const w = large ? 300 : 236;
    const h = large ? 620 : 488;
    return (
        <div className="rounded-[40px] border-[7px] border-neutral-900 bg-neutral-900 shadow-xl" style={{ width: w }}>
            <div className="relative overflow-hidden rounded-[33px]" style={{ height: h, background: splashBackgroundCss(value), color: value.text_color }}>
                {overlay && (
                    <div className="absolute inset-0" style={{ backgroundColor: value.overlay_color, opacity: value.overlay_opacity / 100 }} />
                )}
                {value.frame_id && value.frame_url && (
                    <>
                        {tint && (
                            // Border colour: flood the frame's own shape with one colour (same as the invitation card).
                            <svg width="0" height="0" aria-hidden className="absolute">
                                <defs>
                                    <filter id={tintId} colorInterpolationFilters="sRGB">
                                        <feFlood floodColor={tint} result="colour" />
                                        <feComposite in="colour" in2="SourceAlpha" operator="in" />
                                    </filter>
                                </defs>
                            </svg>
                        )}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaUrl(value.frame_url)} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-fill"
                            style={tint ? { filter: `url(#${tintId})` } : undefined} />
                    </>
                )}
                {value.animation === "particles" && (
                    <div className="pointer-events-none absolute inset-0">
                        {Array.from({ length: 22 }).map((_, i) => (
                            <span key={i} className="absolute size-1 animate-pulse rounded-full"
                                style={{ backgroundColor: value.accent_color, left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, animationDelay: `${(i % 6) * 0.3}s` }} />
                        ))}
                    </div>
                )}
                <div className="absolute left-1/2 top-2.5 size-3 -translate-x-1/2 rounded-full bg-neutral-900" />
                {!value.enabled && (
                    <div className="absolute inset-x-3 top-8 z-10 rounded-md bg-black/60 px-2 py-1 text-center text-[10.5px] text-white">
                        Splash screen is off
                    </div>
                )}
                <div className={cn("relative flex h-full flex-col items-center justify-center gap-2 px-9 text-center", enter)}>
                    {/* The parts in the host's order; switched-off and empty parts are skipped. */}
                    {value.order.filter((k) => value.parts[k]).map((k) => {
                        const small = { fontSize: large ? 16 : 13 };
                        switch (k) {
                            case "logo":
                                return logoUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img key={k} src={logoUrl} alt="" data-splash-part="logo" className="mb-1 object-contain" style={{ width: large ? 96 : 76, maxHeight: large ? 96 : 76 }} />
                                ) : null;
                            case "event_title":
                                return eventName ? <p key={k} data-splash-part="event_title" className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ fontSize: large ? 13 : 11 }}>{eventName}</p> : null;
                            case "host_names":
                                return <div key={k} data-splash-part="host_names" className="font-serif font-semibold italic leading-tight drop-shadow" style={{ fontSize: large ? 34 : 27 }}>{title}</div>;
                            case "decoration":
                                return <Divider key={k} color={line} />;
                            case "tagline":
                                return subtitle ? <p key={k} data-splash-part="tagline" style={small}>{subtitle}</p> : null;
                            case "date_time":
                                return dateText ? (
                                    <p key={k} data-splash-part="date_time" className="inline-flex items-center gap-1.5" style={small}>
                                        <CalendarDays className="size-4" style={{ color: value.accent_color }} />{dateText}
                                    </p>
                                ) : null;
                            case "venue":
                                return venue ? (
                                    <p key={k} data-splash-part="venue" className="inline-flex items-start gap-1.5" style={{ fontSize: large ? 14 : 12 }}>
                                        <MapPin className="mt-0.5 size-3.5 shrink-0" style={{ color: value.accent_color }} />{venue}
                                    </p>
                                ) : null;
                            default:
                                return null;
                        }
                    })}
                </div>
            </div>
        </div>
    );
}

function Divider({ color }: { color: string }) {
    return (
        <span className="flex items-center gap-1.5" aria-hidden>
            <span className="h-px w-10" style={{ backgroundColor: color }} />
            <span className="size-1.5 rotate-45" style={{ backgroundColor: color }} />
            <span className="h-px w-10" style={{ backgroundColor: color }} />
        </span>
    );
}
