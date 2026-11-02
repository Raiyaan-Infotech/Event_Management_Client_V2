"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowDownRight, ArrowRight, ArrowUp, ArrowUpRight, Loader2, Music, Pause, Play, Sparkles, Upload, ZoomIn, MoveRight, Circle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    SPLASH_COMPONENTS,
    splashBackgroundCss,
    useUploadSplashMedia,
    type SplashAnimation,
    type SplashBackground,
    type SplashState,
} from "@/hooks/use-event-splash";

/**
 * Step 5 — the splash guests see while the event opens in the mobile app.
 * Background (image / gradient / colour), which invitation parts are drawn,
 * the entry animation and optional music, with a live phone preview.
 */

const PRESETS = [
    "#9B59B6", "#8E44AD", "#D36A7C", "#C0392B", "#E67E5A", "#F8C9A0", "#F5C542",
    "#F1D54B", "#8BC34A", "#48C9B0", "#16A085", "#E0E0E0", "#7F8C8D", "#5DADE2", "#1F1F1F",
];

const DIRECTIONS = [
    { angle: 90, icon: ArrowRight, label: "Left to right" },
    { angle: 135, icon: ArrowDownRight, label: "Diagonal down" },
    { angle: 180, icon: ArrowDown, label: "Top to bottom" },
    { angle: 0, icon: ArrowUp, label: "Bottom to top" },
    { angle: 45, icon: ArrowUpRight, label: "Diagonal up" },
] as const;

const ANIMATIONS: { value: SplashAnimation; label: string; icon: typeof Circle }[] = [
    { value: "fade", label: "Fade", icon: Circle },
    { value: "zoom", label: "Zoom", icon: ZoomIn },
    { value: "slide", label: "Slide", icon: MoveRight },
    { value: "particles", label: "Particle Effect", icon: Sparkles },
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
    venue,
}: {
    value: SplashState;
    onChange: (next: SplashState) => void;
    /** "Groom & Bride", or the event title. */
    title: string;
    dateText: string;
    tagline: string;
    venue: string;
}) {
    const set = <K extends keyof SplashState>(key: K, v: SplashState[K]) => onChange({ ...value, [key]: v });
    const upload = useUploadSplashMedia();
    const imageInput = useRef<HTMLInputElement>(null);
    const musicInput = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState<"image" | "music" | null>(null);

    const pickFile = async (kind: "image" | "music", file: File | undefined) => {
        if (!file) return;
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
            if (kind === "image") onChange({ ...value, image_url: url, background: "image" });
            else onChange({ ...value, music_url: url, music_name: file.name, music_enabled: true });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "That file could not be uploaded.");
        } finally {
            setUploading(null);
        }
    };

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="flex min-w-0 flex-col gap-3">
                {/* 1. Background */}
                <Section title="1. Background">
                    <Label className="text-[12.5px] font-medium">Background Type</Label>
                    <div className="flex flex-wrap gap-6">
                        {(["image", "gradient", "color"] as SplashBackground[]).map((t) => (
                            <label key={t} className="flex cursor-pointer items-center gap-2 text-[13px]">
                                <input
                                    type="radio"
                                    name="splash-bg"
                                    checked={value.background === t}
                                    onChange={() => set("background", t)}
                                    className="size-4 accent-[var(--primary)]"
                                />
                                {t === "image" ? "Image" : t === "gradient" ? "Gradient" : "Color"}
                            </label>
                        ))}
                    </div>

                    {value.background === "image" && (
                        <div className="mt-2 flex flex-col gap-2">
                            <Label className="text-[12.5px] font-medium">Background Image</Label>
                            <div className="flex flex-wrap items-center gap-4">
                                <div
                                    className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md border border-border bg-muted"
                                    style={value.image_url ? { background: splashBackgroundCss(value) } : undefined}
                                />
                                <div className="flex flex-col gap-1">
                                    <Button
                                        type="button" variant="outline" size="sm" className="h-8 w-fit text-[12px]"
                                        disabled={uploading === "image"}
                                        onClick={() => imageInput.current?.click()}
                                    >
                                        {uploading === "image" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                                        {value.image_url ? "Change Image" : "Upload Image"}
                                    </Button>
                                    <span className="text-[11px] text-muted-foreground">Recommended: 1290 x 2796 px</span>
                                </div>
                            </div>
                            <input
                                ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pickFile("image", f); }}
                            />
                        </div>
                    )}

                    {value.background === "color" && (
                        <div className="mt-2 flex flex-col gap-2">
                            <Label className="text-[12.5px] font-medium">Background Color</Label>
                            <ColorInput value={value.color} onChange={(c) => set("color", c)} />
                            <div className="flex flex-wrap gap-1.5">
                                {PRESETS.map((c) => (
                                    <button
                                        key={c} type="button" title={c} onClick={() => set("color", c)}
                                        className={cn("h-6 w-6 rounded border border-border", value.color.toLowerCase() === c.toLowerCase() && "ring-2 ring-primary ring-offset-1")}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {value.background === "gradient" && (
                        <div className="mt-2 grid gap-5 sm:grid-cols-2">
                            <div className="flex flex-col gap-2">
                                <Label className="text-[12.5px] font-medium">Gradient Type</Label>
                                <Select value={value.gradient_type} onValueChange={(v) => set("gradient_type", v as SplashState["gradient_type"])}>
                                    <SelectTrigger className="h-9 w-full max-w-[180px] rounded-md"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="linear">Linear</SelectItem>
                                        <SelectItem value="radial">Radial</SelectItem>
                                    </SelectContent>
                                </Select>
                                {value.gradient_type === "linear" && (
                                    <>
                                        <Label className="mt-2 text-[12.5px] font-medium">Gradient Direction</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {DIRECTIONS.map(({ angle, icon: Icon, label }) => (
                                                <button
                                                    key={angle} type="button" title={label} aria-label={label}
                                                    onClick={() => set("gradient_angle", angle)}
                                                    className={cn(
                                                        "grid h-9 w-10 place-items-center rounded-md border transition",
                                                        value.gradient_angle === angle ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
                                                    )}
                                                >
                                                    <Icon className="size-4" />
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label className="text-[12.5px] font-medium">Gradient Colors</Label>
                                <div className="flex flex-wrap items-start gap-3">
                                    <div className="flex flex-col gap-1">
                                        <ColorInput value={value.gradient_from} onChange={(c) => set("gradient_from", c)} />
                                        <span className="text-center text-[11px] text-muted-foreground">Start Color</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <ColorInput value={value.gradient_to} onChange={(c) => set("gradient_to", c)} />
                                        <span className="text-center text-[11px] text-muted-foreground">End Color</span>
                                    </div>
                                </div>
                                <div className="mt-1 h-3 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${value.gradient_from}, ${value.gradient_to})` }} />
                            </div>
                        </div>
                    )}
                </Section>

                <div className="grid gap-3 xl:grid-cols-2">
                {/* 2. Invitation parts, each with a switch */}
                <Section title="2. Invitation Menu">
                    <p className="-mt-1 text-[12px] text-muted-foreground">Choose what is shown on the splash screen.</p>
                    <ul className="grid gap-x-6">
                        {SPLASH_COMPONENTS.map((c) => (
                            <li key={c.key} className="flex items-center justify-between gap-3 border-b border-border py-2 text-[13px]">
                                {c.label}
                                <Switch
                                    checked={!!value.components[c.key]}
                                    onCheckedChange={(v) => set("components", { ...value.components, [c.key]: v })}
                                    aria-label={c.label}
                                />
                            </li>
                        ))}
                    </ul>
                </Section>

                <div className="flex min-w-0 flex-col gap-3">
                {/* 3. Animation */}
                <Section title="3. Animation">
                    <Label className="text-[12.5px] font-medium">Select Animation</Label>
                    <div className="grid grid-cols-4 gap-2">
                        {ANIMATIONS.map(({ value: a, label, icon: Icon }) => (
                            <button
                                key={a} type="button" onClick={() => set("animation", a)} aria-pressed={value.animation === a}
                                className={cn(
                                    "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-center text-[11.5px] transition",
                                    value.animation === a ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20" : "border-border hover:bg-muted/50",
                                )}
                            >
                                <Icon className="size-5" />
                                {label}
                            </button>
                        ))}
                    </div>
                </Section>

                {/* 4. Music */}
                <Section title="4. Music">
                    <div className="flex items-center gap-3">
                        <Label className="text-[12.5px] font-medium">Enable Music</Label>
                        <Switch checked={value.music_enabled} onCheckedChange={(v) => set("music_enabled", v)} aria-label="Enable music" />
                    </div>
                    {value.music_enabled && (
                        <>
                            <Label className="mt-2 text-[12.5px] font-medium">Upload Music</Label>
                            <MusicRow
                                url={value.music_url}
                                name={value.music_name}
                                uploading={uploading === "music"}
                                onPick={() => musicInput.current?.click()}
                            />
                            <p className="text-[11.5px] text-muted-foreground">Note: MP3, up to 1 minute and less than 5MB.</p>
                            <input
                                ref={musicInput} type="file" accept="audio/mpeg,.mp3" className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pickFile("music", f); }}
                            />
                        </>
                    )}
                </Section>
                </div>
                </div>
            </div>

            {/* Live phone preview */}
            <div className="flex justify-center lg:sticky lg:top-4 lg:self-start">
                <PhonePreview value={value} title={title} dateText={dateText} tagline={tagline} venue={venue} />
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <h3 className="text-[12.5px] font-bold uppercase tracking-wide text-foreground">{title}</h3>
            {children}
        </section>
    );
}

function ColorInput({ value, onChange }: { value: string; onChange: (c: string) => void }) {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    return (
        <div className="flex w-fit items-center gap-2 rounded-md border border-border px-2 py-1.5">
            <input
                type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
                onChange={(e) => onChange(e.target.value.toUpperCase())}
                className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label="Pick a colour"
            />
            <input
                value={text}
                onChange={(e) => {
                    const v = e.target.value.slice(0, 7);
                    setText(v);
                    if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toUpperCase());
                }}
                className="w-[76px] bg-transparent text-[12.5px] font-medium uppercase outline-none"
                aria-label="Hex colour"
            />
        </div>
    );
}

function MusicRow({ url, name, uploading, onPick }: { url: string; name: string; uploading: boolean; onPick: () => void }) {
    const audio = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [length, setLength] = useState<string>("");

    useEffect(() => { setPlaying(false); setLength(""); }, [url]);

    return (
        <div className="flex max-w-md items-center gap-3 rounded-lg border border-border p-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                <Music className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium" title={name || undefined}>{url ? name || "Music" : "No music yet"}</p>
                {length && <p className="text-[11px] text-muted-foreground">{length}</p>}
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 text-[12px]" onClick={onPick} disabled={uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : url ? "Change" : "Upload"}
            </Button>
            {url && (
                <>
                    <Button
                        type="button" variant="outline" size="icon" className="size-8 rounded-full"
                        aria-label={playing ? "Pause" : "Play"}
                        onClick={() => {
                            const a = audio.current;
                            if (!a) return;
                            if (a.paused) void a.play(); else a.pause();
                        }}
                    >
                        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </Button>
                    <audio
                        ref={audio} src={url} preload="metadata"
                        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
                        onLoadedMetadata={(e) => {
                            const s = Math.round(e.currentTarget.duration || 0);
                            if (s) setLength(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
                        }}
                    />
                </>
            )}
        </div>
    );
}

function PhonePreview({
    value, title, dateText, tagline, venue,
}: { value: SplashState; title: string; dateText: string; tagline: string; venue: string }) {
    const on = (k: string) => !!value.components[k];
    // Replays the entry animation whenever it is changed.
    const [run, setRun] = useState(0);
    useEffect(() => setRun((n) => n + 1), [value.animation]);
    const enter =
        value.animation === "zoom" ? "animate-in zoom-in-75 fade-in duration-700"
            : value.animation === "slide" ? "animate-in slide-in-from-left-10 fade-in duration-700"
                : "animate-in fade-in duration-700";
    const [first, ...rest] = title.split("&").map((s) => s.trim());

    return (
        <div className="w-[210px] rounded-[38px] border-[6px] border-neutral-900 bg-neutral-900 shadow-xl">
            <div
                className="relative h-[420px] overflow-hidden rounded-[32px] text-white"
                style={{ background: splashBackgroundCss(value) }}
            >
                <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-neutral-900" />
                {value.background === "image" && value.image_url && <div className="absolute inset-0 bg-black/25" />}
                {value.animation === "particles" && (
                    <div className="pointer-events-none absolute inset-0">
                        {Array.from({ length: 18 }).map((_, i) => (
                            <span
                                key={i}
                                className="absolute size-1.5 animate-pulse rounded-full bg-white/70"
                                style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, animationDelay: `${(i % 6) * 0.3}s` }}
                            />
                        ))}
                    </div>
                )}
                <div key={run} className={cn("relative flex h-full flex-col items-center justify-center gap-2 px-5 text-center", enter)}>
                    {on("decoration_elements") && <span className="text-[11px] tracking-[0.3em] opacity-80">✦ ✦ ✦</span>}
                    {on("host_names") && first ? (
                        <div className="font-serif text-[30px] italic leading-tight drop-shadow">
                            {first}
                            {rest.length > 0 && (<><br /><span className="text-[22px]">&amp;</span><br />{rest.join(" & ")}</>)}
                        </div>
                    ) : on("event_title") ? (
                        <div className="font-serif text-[24px] italic leading-tight drop-shadow">{title || "Your Event"}</div>
                    ) : null}
                    {on("decoration_elements") && <span className="my-1 h-px w-24 bg-white/60" />}
                    {on("date_time") && dateText && <p className="text-[10.5px] uppercase tracking-[0.2em]">{dateText}</p>}
                    {on("venue") && venue && <p className="text-[10.5px] opacity-90">{venue}</p>}
                    {on("invitation_message") && tagline && <p className="text-[10px] opacity-90">{tagline}</p>}
                </div>
            </div>
        </div>
    );
}
