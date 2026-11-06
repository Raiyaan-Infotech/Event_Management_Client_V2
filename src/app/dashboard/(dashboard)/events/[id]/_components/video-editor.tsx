"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    AlertCircle, ArrowLeft, Bold, Copy, Eye, Info, Italic, Music, Pause, Pencil, Play, Plus, RotateCcw, Save, Scissors,
    Trash2, Type, Underline, Upload, Volume2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import { useExportVideoEdit, type GalleryItem, type VideoEditSpec, type VideoEditText } from "@/hooks/use-event-modules";

/**
 * EDIT VIDEO / SHORTS — web gallery design 03 (Jamal, 2026-11-06).
 * Shown ONLY when VIDEO_EDITOR_ENABLED (src/lib/features.ts) — off until a paid server; nothing of it
 * appears in the portal while off. The browser only PREVIEWS the edit (text drawn over the playing
 * video); Export sends the edit to `POST /client/gallery/:id/edit`, where ffmpeg renders it into a new
 * gallery file in the same folder (the original stays). Save Draft keeps the edit in this browser.
 */

type Layer = VideoEditText & { id: string };
type Tool = "text" | "trim" | "music" | "volume";

const FONTS = ["Poppins", "Montserrat", "Playfair Display", "Great Vibes", "Dancing Script", "Cormorant Garamond"];
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,700;1,400;1,700&family=Montserrat:ital,wght@0,400;0,700;1,400;1,700&family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Great+Vibes&family=Dancing+Script:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400;1,700&display=swap";
const ANIMS: { value: Layer["animation"]; label: string; glyph: string }[] = [
    { value: "fade", label: "Fade", glyph: "Aa" },
    { value: "slide", label: "Slide", glyph: "Aa→" },
    { value: "zoom", label: "Zoom", glyph: "[Aa]" },
    { value: "typewriter", label: "Typewriter", glyph: "Aa|" },
];
const DIRS: Record<Layer["animation"], { value: Layer["direction"]; label: string }[]> = {
    fade: [{ value: "in", label: "Fade In" }, { value: "out", label: "Fade Out" }, { value: "in_out", label: "Fade In & Out" }],
    slide: [{ value: "left", label: "From Left" }, { value: "right", label: "From Right" }, { value: "up", label: "From Bottom" }, { value: "down", label: "From Top" }],
    zoom: [{ value: "in", label: "Zoom In" }],
    typewriter: [{ value: "in", label: "Type In" }],
};
const DURATIONS = [0.5, 1, 1.5, 2, 3];
const MAX_MUSIC = 10 * 1024 * 1024;

const t1 = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const t0 = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const parseT = (v: string) => {
    const m = v.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
    return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : NaN;
};
const uid = () => Math.random().toString(36).slice(2, 9);
const newLayer = (len: number, from = 0): Layer => ({
    id: uid(), text: "Our Wedding", animation: "fade", duration: 1, direction: "in", font: "Poppins", color: "#FFFFFF",
    bold: true, italic: false, underline: false, position: 4, from: Math.min(from, Math.max(0, len - 1)), to: len || 5,
});
const draftKey = (id: number) => `video-edit-draft:${id}`;
type Draft = { trim: { start: number; end: number }; layers: Layer[]; mute: boolean; videoVol: number; musicVol: number; musicStart: number; musicName?: string };
const readDraft = (id: number): Draft | null => {
    try { const raw = localStorage.getItem(draftKey(id)); return raw ? (JSON.parse(raw) as Draft) : null; } catch { return null; }
};

export function VideoEditor({ eventId, item, folderName, onBack, onDone }: {
    eventId: number; item: GalleryItem; folderName: string; onBack: () => void; onDone: () => void;
}) {
    const exporter = useExportVideoEdit(eventId);
    const isShort = !!item.is_short;
    const [draft] = useState(() => readDraft(item.id));
    const [duration, setDuration] = useState(item.duration_seconds ?? 0);
    const [trim, setTrim] = useState(draft?.trim ?? { start: 0, end: item.duration_seconds ?? 0 });
    const [layers, setLayers] = useState<Layer[]>(draft?.layers?.length ? draft.layers : [newLayer(item.duration_seconds ?? 0)]);
    const [active, setActive] = useState<string>(() => (draft?.layers?.[0]?.id ?? ""));
    const [tool, setTool] = useState<Tool>("text");
    const [mute, setMute] = useState(draft?.mute ?? false);
    const [videoVol, setVideoVol] = useState(draft?.videoVol ?? (draft?.mute ? 0 : 100));
    const [musicVol, setMusicVol] = useState(draft?.musicVol ?? 80);
    const [musicStart, setMusicStart] = useState(draft?.musicStart ?? 0);
    const [music, setMusic] = useState<{ file: File; url: string; duration: number; peaks: number[] } | null>(null);
    const [time, setTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [sent, setSent] = useState<number | null>(null);
    const [thumbs, setThumbs] = useState<string[]>([]);
    const [boxH, setBoxH] = useState(300);
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    const musicPick = useRef<HTMLInputElement>(null);
    const trimBox = useRef<HTMLDivElement>(null);
    const musicBox = useRef<HTMLDivElement>(null);
    const volumeBox = useRef<HTMLDivElement>(null);
    const scrollTo = (k: Exclude<Tool, "text">) => (k === "trim" ? trimBox : k === "music" ? musicBox : volumeBox).current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const src = mediaUrl(item.url) ?? item.url;
    const len = Math.max(0, trim.end - trim.start);
    const rel = Math.max(0, time - trim.start);
    const layer = layers.find((l) => l.id === active) ?? layers[0];

    // Draft restored once (lazy state above) — say so after the first paint.
    useEffect(() => {
        if (!draft) return;
        const t = setTimeout(() => toast.message(`Draft restored${draft.musicName ? ` — choose "${draft.musicName}" again to keep the music` : ""}.`), 0);
        return () => clearTimeout(t);
    }, [draft]);

    // Preview text size follows the player height (the server uses height / 14).
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setBoxH(e.contentRect.height));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Smooth time while playing (timeupdate fires only ~4× a second); stop at the trim end.
    useEffect(() => {
        if (!playing) return;
        let raf = 0;
        const tick = () => {
            const v = videoRef.current;
            if (v) {
                if (v.currentTime >= trim.end) { v.pause(); audioRef.current?.pause(); setPlaying(false); setTime(trim.end); return; }
                setTime(v.currentTime);
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, trim.end]);

    // Live volumes in the preview.
    useEffect(() => {
        if (videoRef.current) { videoRef.current.muted = mute; videoRef.current.volume = Math.min(1, videoVol / 100); }
        if (audioRef.current) audioRef.current.volume = Math.min(1, musicVol / 100);
    }, [mute, videoVol, musicVol, music]);

    const onMeta = () => {
        const v = videoRef.current;
        if (!v || !Number.isFinite(v.duration)) return;
        const d = v.duration;
        setDuration(d);
        setTrim((t) => (t.end > 0 && t.end <= d + 0.05 ? t : { start: Math.min(t.start, d), end: d }));
        setLayers((ls) => ls.map((l) => (l.to > d || l.to <= 0 ? { ...l, to: d } : l)));
        void makeThumbs(d);
    };
    /** Timeline pictures — needs the file to allow it (CORS); without, the strip stays plain. */
    const makeThumbs = async (d: number) => {
        try {
            const v = document.createElement("video");
            v.crossOrigin = "anonymous"; v.muted = true; v.preload = "auto"; v.src = src;
            await new Promise<void>((ok, bad) => { v.onloadeddata = () => ok(); v.onerror = () => bad(new Error("no")); });
            const c = document.createElement("canvas");
            c.width = 96; c.height = 54;
            const ctx = c.getContext("2d");
            const out: string[] = [];
            for (let i = 0; i < 12; i++) {
                v.currentTime = (d * (i + 0.5)) / 12;
                await new Promise<void>((ok) => { v.onseeked = () => ok(); });
                ctx?.drawImage(v, 0, 0, c.width, c.height);
                out.push(c.toDataURL("image/jpeg", 0.6));
            }
            setThumbs(out);
        } catch { /* the strip stays plain */ }
    };

    const play = () => {
        const v = videoRef.current;
        if (!v) return;
        if (playing) { v.pause(); audioRef.current?.pause(); setPlaying(false); return; }
        if (v.currentTime < trim.start || v.currentTime >= trim.end - 0.05) v.currentTime = trim.start;
        const a = audioRef.current;
        if (a && music) { a.currentTime = (musicStart + (v.currentTime - trim.start)) % Math.max(1, music.duration); void a.play().catch(() => {}); }
        void v.play().then(() => setPlaying(true)).catch(() => toast.error("The video could not be played."));
    };
    const seek = (s: number) => {
        const v = videoRef.current;
        const to = Math.max(trim.start, Math.min(trim.end, s));
        if (v) v.currentTime = to;
        if (audioRef.current && music) audioRef.current.currentTime = (musicStart + (to - trim.start)) % Math.max(1, music.duration);
        setTime(to);
    };
    const preview = () => { seek(trim.start); if (!playing) setTimeout(play, 50); };

    const patch = (p: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === layer?.id ? { ...l, ...p } : l)));
    const addLayer = () => {
        const l = { ...newLayer(len, Math.min(rel, Math.max(0, len - 1))), text: "", to: len };
        setLayers((ls) => [...ls, l]); setActive(l.id); setTool("text");
    };
    const duplicate = () => {
        if (!layer) return;
        const l = { ...layer, id: uid(), position: (layer.position + 3) % 9 };
        setLayers((ls) => [...ls, l]); setActive(l.id);
    };
    const removeLayer = (id: string) => setLayers((ls) => {
        const next = ls.filter((l) => l.id !== id);
        if (active === id) setActive(next[0]?.id ?? "");
        return next;
    });

    const setTrimSafe = (start: number, end: number) => {
        const s = Math.max(0, Math.min(start, duration - 0.5));
        let e = Math.max(s + 0.5, Math.min(end, duration));
        if (isShort && e - s > 60) e = s + 60;
        setTrim({ start: s, end: e });
        // Text timing lives on the KEPT clip; keep every layer inside it.
        setLayers((ls) => ls.map((l) => ({ ...l, from: Math.min(l.from, e - s - 0.1), to: Math.min(Math.max(l.to, 0.2), e - s) })));
        if (time < s || time > e) seek(s);
    };
    /** Drag a trim handle on the strip. */
    const dragHandle = (which: "start" | "end") => (e: React.PointerEvent) => {
        e.preventDefault();
        const strip = stripRef.current;
        if (!strip || !duration) return;
        const rect = strip.getBoundingClientRect();
        const move = (ev: PointerEvent) => {
            const s = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)) * duration;
            if (which === "start") setTrimSafe(Math.min(s, trim.end - 0.5), trim.end);
            else setTrimSafe(trim.start, Math.max(s, trim.start + 0.5));
        };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    const pickMusic = async (f: File | undefined) => {
        if (!f) return;
        if (!/^audio\//.test(f.type) && !/\.mp3$/i.test(f.name)) { toast.error("Please choose an MP3 file."); return; }
        if (f.size > MAX_MUSIC) { toast.error("The music must be 10 MB or smaller."); return; }
        const url = URL.createObjectURL(f);
        let peaks: number[] = [];
        let d = 0;
        try {
            const ctx = new AudioContext();
            const buf = await ctx.decodeAudioData(await f.arrayBuffer());
            d = buf.duration;
            const data = buf.getChannelData(0);
            const step = Math.floor(data.length / 120) || 1;
            for (let i = 0; i < 120; i++) {
                let m = 0;
                for (let j = i * step; j < (i + 1) * step && j < data.length; j += 64) m = Math.max(m, Math.abs(data[j]));
                peaks.push(m);
            }
            void ctx.close();
        } catch { peaks = Array.from({ length: 120 }, () => 0.4); }
        if (music) URL.revokeObjectURL(music.url);
        setMusic({ file: f, url, duration: d, peaks });
        setMusicStart(0);
    };

    const spec = (): VideoEditSpec => ({
        trim: { start: +trim.start.toFixed(2), end: +trim.end.toFixed(2) },
        mute, video_volume: mute ? 0 : videoVol / 100, music_volume: musicVol / 100, music_start: musicStart,
        texts: layers.filter((l) => l.text.trim()).map((l) => ({
            text: l.text, animation: l.animation, duration: l.duration, direction: l.direction, font: l.font, color: l.color,
            bold: l.bold, italic: l.italic, underline: l.underline, position: l.position, from: l.from, to: l.to,
        })),
    });
    const saveDraft = () => {
        try {
            localStorage.setItem(draftKey(item.id), JSON.stringify({ trim, layers, mute, videoVol, musicVol, musicStart, musicName: music?.file.name } satisfies Draft));
            toast.success("Draft saved in this browser.");
        } catch { toast.error("This browser blocked saving the draft."); }
    };
    const doExport = () => {
        if (len < 0.5) { toast.error("Keep at least half a second of the video."); return; }
        if (isShort && len > 60.5) { toast.error("A short can be up to 1 minute. Please trim it shorter."); return; }
        const bad = layers.find((l) => l.text.trim() && !(l.to > l.from));
        if (bad) { toast.error(`"${bad.text}": the text must end after it starts.`); return; }
        setSent(0);
        exporter.mutate({ itemId: item.id, spec: spec(), music: music?.file ?? null, onProgress: setSent }, {
            onSuccess: () => { try { localStorage.removeItem(draftKey(item.id)); } catch { /* ignore */ } setSent(null); onDone(); },
            onError: () => setSent(null),
        });
    };

    const ticks = useMemo(() => {
        if (!duration) return [];
        const step = duration <= 20 ? 2 : duration <= 60 ? 5 : duration <= 180 ? 15 : 30;
        const out: number[] = [];
        for (let s = 0; s < duration; s += step) out.push(s);
        out.push(duration);
        return out;
    }, [duration]);
    const pct = (s: number) => (duration ? (s / duration) * 100 : 0);
    const exporting = sent !== null;
    const songShort = !!music && music.duration > 0 && music.duration - musicStart < len - 0.5;

    return (
        <div className="flex flex-col gap-3">
            <link rel="stylesheet" href={FONT_CSS} />

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                    <Button size="icon" variant="outline" className="size-8 shrink-0" onClick={onBack} aria-label="Back"><ArrowLeft className="size-4" /></Button>
                    <div className="min-w-0">
                        <p className="text-[12px] text-muted-foreground">Gallery › {folderName} › {item.title || item.file_name}</p>
                        <h3 className="text-[20px] leading-tight font-bold">Edit Video / Shorts</h3>
                        <p className="text-[12.5px] text-muted-foreground">Trim, add music, and create engaging text animations for your video or short.</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-8" onClick={preview} disabled={exporting}><Eye className="size-3.5" /> Preview</Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={saveDraft} disabled={exporting}><Save className="size-3.5" /> Save Draft</Button>
                    <Button size="sm" className="h-8" onClick={doExport} disabled={exporting}>
                        <Upload className="size-3.5" /> {exporting ? (sent! < 100 ? `Sending ${sent}%…` : "Rendering…") : "Export"}
                    </Button>
                </div>
            </div>
            {exporting && sent! >= 100 && (
                <p className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[12.5px] text-primary">
                    <Info className="size-4" /> The server is drawing the text and mixing the sound — this can take a few minutes for a long video. Keep this page open.
                </p>
            )}

            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex min-w-0 flex-col gap-3">
                    <div className="grid min-w-0 gap-3 md:grid-cols-[150px_minmax(0,1fr)]">
                        {/* Tools */}
                        <div className="flex flex-row flex-wrap gap-1.5 rounded-xl border border-border bg-card p-2 md:flex-col">
                            {([["text", "Add Text", Type], ["trim", "Trim & Cut", Scissors], ["music", "Music & Audio", Music], ["volume", "Volume", Volume2]] as const).map(([k, l, I]) => (
                                <button key={k} type="button" onClick={() => { setTool(k); if (k !== "text") scrollTo(k); }}
                                    className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition", tool === k ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                                    <I className="size-4" /> {l}
                                </button>
                            ))}
                        </div>

                        {/* Player + text layers */}
                        <div ref={boxRef} className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
                            <video ref={videoRef} src={src} className="size-full object-contain" playsInline onLoadedMetadata={onMeta}
                                onTimeUpdate={(e) => { if (!playing) setTime(e.currentTarget.currentTime); }} onEnded={() => setPlaying(false)} />
                            {music && <audio ref={audioRef} src={music.url} loop />}
                            {layers.map((l) => (
                                <TextPreview key={l.id} layer={l} t={rel} h={boxH} selected={l.id === layer?.id} onSelect={() => { setActive(l.id); setTool("text"); }}
                                    onEdit={() => setTool("text")} onDuplicate={duplicate} onDelete={() => removeLayer(l.id)} />
                            ))}
                            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-white">
                                <button type="button" onClick={play} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause className="size-4 fill-white" /> : <Play className="size-4 fill-white" />}</button>
                                <span className="text-[11.5px] tabular-nums">{t0(rel)} / {t0(len)}</span>
                                <input type="range" min={trim.start} max={trim.end || 1} step={0.05} value={Math.min(Math.max(time, trim.start), trim.end)}
                                    onChange={(e) => seek(Number(e.target.value))} className="h-1 flex-1 accent-primary" aria-label="Seek" />
                            </div>
                        </div>
                    </div>

                    {/* Timeline & Clip Trimming */}
                    <div ref={trimBox}className={cn("rounded-xl border bg-card p-3", tool === "trim" ? "border-primary/40" : "border-border")}>
                        <div className="mb-2 flex items-center justify-between text-[13px]">
                            <p className="flex items-center gap-1.5 font-bold"><Scissors className="size-4" /> Timeline &amp; Clip Trimming</p>
                            <span className="text-[11.5px] text-muted-foreground">Video Duration: <b className="text-foreground">{t0(duration)}</b> ({Math.round(duration)}s)</span>
                        </div>
                        <div className="relative mb-1 h-4 text-[10px] text-muted-foreground">
                            {ticks.map((s) => <span key={s} className="absolute -translate-x-1/2" style={{ left: `${pct(s)}%` }}>{t0(s)}</span>)}
                        </div>
                        <div ref={stripRef} className="relative h-14 overflow-hidden rounded-lg bg-gradient-to-r from-primary/30 via-violet-400/30 to-primary/30"
                            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * duration); }}>
                            {thumbs.length > 0 && (
                                <div className="absolute inset-0 flex">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {thumbs.map((t, i) => <img key={i} src={t} alt="" className="h-full min-w-0 flex-1 object-cover" />)}
                                </div>
                            )}
                            <div className="absolute inset-y-0 left-0 bg-black/55" style={{ width: `${pct(trim.start)}%` }} />
                            <div className="absolute inset-y-0 right-0 bg-black/55" style={{ width: `${100 - pct(trim.end)}%` }} />
                            <div className="pointer-events-none absolute inset-y-0 border-y-[3px] border-primary" style={{ left: `${pct(trim.start)}%`, right: `${100 - pct(trim.end)}%` }} />
                            {(["start", "end"] as const).map((w) => (
                                <span key={w} onPointerDown={dragHandle(w)} onClick={(e) => e.stopPropagation()} role="slider" aria-label={`Trim ${w}`}
                                    aria-valuenow={w === "start" ? trim.start : trim.end} tabIndex={0}
                                    className="absolute inset-y-0 z-10 grid w-3.5 -translate-x-1/2 cursor-ew-resize place-items-center rounded bg-primary text-white"
                                    style={{ left: `${pct(w === "start" ? trim.start : trim.end)}%` }}>
                                    <span className="h-4 w-0.5 rounded bg-white/90" />
                                </span>
                            ))}
                            <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{ left: `${pct(time)}%` }} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
                            <span className="font-medium">Trim Video (Clip Range)</span>
                            <TimeInput label="Start" value={trim.start} onChange={(v) => setTrimSafe(v, trim.end)} />
                            <TimeInput label="End" value={trim.end} onChange={(v) => setTrimSafe(trim.start, v)} />
                            <span className="rounded-md bg-muted px-2.5 py-1.5 text-[12px]">Duration: <b>{t0(len)}</b>{isShort && " (max 1:00)"}</span>
                            <Button size="sm" variant="outline" className="ml-auto h-8" onClick={() => setTrimSafe(0, duration)}><RotateCcw className="size-3.5" /> Reset</Button>
                        </div>
                    </div>

                    {/* Music */}
                    <div ref={musicBox}className={cn("rounded-xl border bg-card p-3", tool === "music" ? "border-primary/40" : "border-border")}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                            <p className="flex items-center gap-1.5 font-bold"><Music className="size-4 text-primary" /> Music (Background MP3)</p>
                            <span className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11.5px] text-primary">
                                <Music className="size-3" /> Song length should fit the video or shorts duration ({t0(len)}).
                            </span>
                        </div>
                        <input ref={musicPick} type="file" accept="audio/mpeg,audio/mp3,.mp3" className="hidden" onChange={(e) => { void pickMusic(e.target.files?.[0]); e.target.value = ""; }} />
                        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
                            <span className="w-[110px] font-medium">Background MP3</span>
                            {music ? (
                                <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-3 py-2">
                                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Music className="size-4" /></span>
                                    <span className="min-w-0 flex-1"><b className="block truncate">{music.file.name}</b><span className="text-[11px] text-muted-foreground">{(music.file.size / 1048576).toFixed(1)} MB • {t0(music.duration)}</span></span>
                                    <button type="button" onClick={() => { URL.revokeObjectURL(music.url); setMusic(null); }} aria-label="Remove music"><X className="size-4" /></button>
                                </span>
                            ) : <span className="flex-1 text-muted-foreground">No music — the video keeps its own sound.</span>}
                            <Button variant="outline" className="h-auto flex-col gap-0 py-1.5" onClick={() => musicPick.current?.click()}>
                                <span className="flex items-center gap-1.5 text-[12.5px]"><Upload className="size-3.5" /> Upload MP3</span>
                                <span className="text-[10.5px] text-muted-foreground">MP3 only • Max 10 MB</span>
                            </Button>
                            <label className="flex items-center gap-2 border-l border-border pl-3 font-medium">
                                <Volume2 className="size-4" /> Mute Original Audio <Switch checked={mute} onCheckedChange={setMute} />
                            </label>
                        </div>
                        {music && (
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
                                <span className="w-[110px] font-medium">Music Timeline ({t0(len)})</span>
                                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-border px-3 py-2">
                                    <button type="button" onClick={play} className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary" aria-label="Play with music">
                                        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                                    </button>
                                    <div className="flex h-8 min-w-0 flex-1 items-center gap-px">
                                        {music.peaks.map((p, i) => {
                                            const at = (i / music.peaks.length) * (music.duration || 1);
                                            const inUse = at >= musicStart && at <= musicStart + len;
                                            return <span key={i} className={cn("min-w-0 flex-1 rounded-full", inUse ? "bg-primary" : "bg-primary/25")} style={{ height: `${Math.max(8, p * 100)}%` }} />;
                                        })}
                                    </div>
                                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{t0(musicStart)} / {t0(music.duration)}</span>
                                </div>
                                <TimeInput label="Song starts at" value={musicStart} onChange={(v) => setMusicStart(Math.max(0, Math.min(v, Math.max(0, music.duration - 1))))} />
                            </div>
                        )}
                        {songShort && <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-warning"><AlertCircle className="size-3.5" /> The song is shorter than the clip — it will start again from the beginning.</p>}
                    </div>

                    {/* Volume */}
                    <div ref={volumeBox}className={cn("flex flex-wrap items-center gap-4 rounded-xl border bg-card p-3 text-[12.5px]", tool === "volume" ? "border-primary/40" : "border-border")}>
                        <p className="flex items-center gap-1.5 font-bold"><Volume2 className="size-4" /> Volume Controls</p>
                        <label className={cn("flex min-w-[220px] flex-1 items-center gap-2", mute && "opacity-50")}>
                            Video (Original Audio)
                            <input type="range" min={0} max={100} value={mute ? 0 : videoVol} disabled={mute} onChange={(e) => setVideoVol(Number(e.target.value))} className="flex-1 accent-primary" />
                            <b className="w-9 text-right tabular-nums">{mute ? 0 : videoVol}%</b>
                        </label>
                        <label className={cn("flex min-w-[220px] flex-1 items-center gap-2 border-l border-border pl-4", !music && "opacity-50")}>
                            Background Music <Volume2 className="size-3.5" />
                            <input type="range" min={0} max={100} value={musicVol} disabled={!music} onChange={(e) => setMusicVol(Number(e.target.value))} className="flex-1 accent-primary" />
                            <b className="w-9 text-right tabular-nums">{musicVol}%</b>
                        </label>
                    </div>
                </div>

                {/* Add Text panel */}
                <div className="flex h-fit flex-col gap-3 rounded-xl border border-border bg-card p-3.5 xl:sticky xl:top-4">
                    <div>
                        <p className="flex items-center gap-2 text-[15px] font-bold"><Type className="size-4 text-primary" /> Add Text</p>
                        <p className="text-[12px] text-muted-foreground">Add and animate text overlays to make your video more engaging.</p>
                    </div>
                    {layers.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                            {layers.map((l, i) => (
                                <button key={l.id} type="button" onClick={() => setActive(l.id)}
                                    className={cn("max-w-[140px] truncate rounded-full border px-2.5 py-1 text-[11.5px]", l.id === layer?.id ? "border-primary bg-primary/10 text-primary" : "border-border")}>
                                    {i + 1}. {l.text || "Empty text"}
                                </button>
                            ))}
                        </div>
                    )}
                    {!layer ? (
                        <p className="text-[12.5px] text-muted-foreground">No text on this video.</p>
                    ) : (
                        <>
                            <label className="flex flex-col gap-1 text-[12.5px] font-semibold">Text Content
                                <Textarea value={layer.text} maxLength={100} rows={2} onChange={(e) => patch({ text: e.target.value })} placeholder="Type your text" className="font-normal" />
                                <span className="text-right text-[11px] font-normal text-muted-foreground">{layer.text.length} / 100</span>
                            </label>
                            <div className="flex flex-col gap-1.5">
                                <p className="text-[12.5px] font-semibold">Animation (Text Entrance)</p>
                                <div className="grid grid-cols-4 gap-1.5">
                                    {ANIMS.map((a) => (
                                        <button key={a.value} type="button" onClick={() => patch({ animation: a.value, direction: DIRS[a.value][0].value })}
                                            className={cn("relative flex flex-col items-center gap-1 rounded-lg border py-2 text-[11.5px]", layer.animation === a.value ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                                            <b className="text-[14px]">{a.glyph}</b>{a.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <p className="text-[12.5px] font-semibold">Animation Settings</p>
                            <div className="grid grid-cols-2 gap-2 text-[12px]">
                                <label className="flex flex-col gap-1">Duration
                                    <Select value={String(layer.duration)} onValueChange={(v) => patch({ duration: Number(v) })}>
                                        <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>{DURATIONS.map((d) => <SelectItem key={d} value={String(d)}>{d.toFixed(1)} s</SelectItem>)}</SelectContent>
                                    </Select>
                                </label>
                                <label className="flex flex-col gap-1">Direction
                                    <Select value={layer.direction} onValueChange={(v) => patch({ direction: v as Layer["direction"] })}>
                                        <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>{DIRS[layer.animation].map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                                    </Select>
                                </label>
                                <label className="flex flex-col gap-1">Font
                                    <Select value={layer.font} onValueChange={(v) => patch({ font: v })}>
                                        <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                                        <SelectContent>{FONTS.map((f) => <SelectItem key={f} value={f}><span style={{ fontFamily: `'${f}'` }}>{f}</span></SelectItem>)}</SelectContent>
                                    </Select>
                                </label>
                                <label className="flex flex-col gap-1">Text Color
                                    <span className="flex h-8 items-center gap-2 rounded-md border border-input px-2">
                                        <input type="color" value={layer.color} onChange={(e) => patch({ color: e.target.value.toUpperCase() })} className="size-5 cursor-pointer rounded border-0 bg-transparent p-0" aria-label="Text colour" />
                                        <input value={layer.color} maxLength={7} onChange={(e) => { const v = e.target.value.toUpperCase(); if (/^#[0-9A-F]{0,6}$/.test(v)) patch({ color: v }); }}
                                            onBlur={() => { if (!/^#[0-9A-F]{6}$/.test(layer.color)) patch({ color: "#FFFFFF" }); }} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
                                    </span>
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[12px]">
                                <div className="flex flex-col gap-1">Text Style
                                    <span className="flex gap-1.5">
                                        {([["bold", Bold], ["italic", Italic], ["underline", Underline]] as const).map(([k, I]) => (
                                            <button key={k} type="button" onClick={() => patch({ [k]: !layer[k] })} aria-label={k} aria-pressed={layer[k]}
                                                className={cn("grid size-8 place-items-center rounded-md border", layer[k] ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}><I className="size-4" /></button>
                                        ))}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1">Position
                                    <span className="grid w-fit grid-cols-3 gap-1">
                                        {Array.from({ length: 9 }).map((_, i) => (
                                            <button key={i} type="button" onClick={() => patch({ position: i })} aria-label={`Position ${i + 1}`}
                                                className={cn("h-5 w-7 rounded border", layer.position === i ? "border-primary bg-primary/40" : "border-border hover:bg-muted")} />
                                        ))}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 text-[12px]">
                                <p className="text-[12.5px] font-semibold">Text Timing on Video</p>
                                <span className="flex flex-wrap items-center gap-2">
                                    <TimeInput label="Show from" value={layer.from} onChange={(v) => patch({ from: Math.max(0, Math.min(v, layer.to - 0.1)) })} />
                                    <span>to</span>
                                    <TimeInput value={layer.to} onChange={(v) => patch({ to: Math.min(len, Math.max(v, layer.from + 0.1)) })} />
                                    <span className="text-muted-foreground">({(layer.to - layer.from).toFixed(1)}s)</span>
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" className="h-8 flex-1" onClick={duplicate}><Copy className="size-3.5" /> Duplicate</Button>
                                <Button variant="outline" size="sm" className="h-8 flex-1 border-destructive/40 text-destructive" onClick={() => removeLayer(layer.id)}><Trash2 className="size-3.5" /> Remove</Button>
                            </div>
                        </>
                    )}
                    <Button variant="outline" className="border-primary/50 text-primary" onClick={addLayer}><Plus className="size-4" /> Add Another Text</Button>
                </div>
            </div>
        </div>
    );
}

/** "0:02.0" box with ▲▼ (0.1 s steps). */
function TimeInput({ label, value, onChange }: { label?: string; value: number; onChange: (v: number) => void }) {
    const [text, setText] = useState<string | null>(null);
    return (
        <label className="flex items-center gap-1.5 text-[12px]">
            {label}
            <span className="flex h-8 items-center rounded-md border border-input">
                <Input value={text ?? t1(value)} onChange={(e) => setText(e.target.value)} className="h-full w-[68px] border-0 px-2 text-[12px] shadow-none focus-visible:ring-0"
                    onBlur={() => { if (text !== null) { const v = parseT(text); if (Number.isFinite(v)) onChange(v); setText(null); } }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <span className="flex flex-col border-l border-input">
                    <button type="button" className="px-1 text-[8px] leading-[14px] hover:bg-muted" onClick={() => onChange(+(value + 0.1).toFixed(1))} aria-label="Later">▲</button>
                    <button type="button" className="px-1 text-[8px] leading-[14px] hover:bg-muted" onClick={() => onChange(Math.max(0, +(value - 0.1).toFixed(1)))} aria-label="Earlier">▼</button>
                </span>
            </span>
        </label>
    );
}

/**
 * One text layer drawn over the player — the same animation the server burns in
 * (fade / slide / zoom / typewriter, 3×3 position, size = player height / 14).
 */
function TextPreview({ layer: l, t, h, selected, onSelect, onEdit, onDuplicate, onDelete }: {
    layer: Layer; t: number; h: number; selected: boolean; onSelect: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
    const visible = t >= l.from && t <= l.to;
    if (!l.text.trim() || (!visible && !selected)) return null;
    const p = Math.min(1, Math.max(0, (t - l.from) / l.duration));
    const ease = 1 - Math.pow(1 - p, 3);
    const outP = Math.min(1, Math.max(0, (l.to - t) / l.duration));
    let opacity = visible ? p : 0.35;
    let dx = 0, dy = 0, scale = 1;
    let shown = l.text;
    if (visible) {
        if (l.animation === "fade") opacity = l.direction === "out" ? outP : l.direction === "in_out" ? Math.min(p, outP) : p;
        if (l.animation === "slide") {
            const off = 1 - ease;
            if (l.direction === "right") dx = off * 30; else if (l.direction === "up") dy = off * 30; else if (l.direction === "down") dy = -off * 30; else dx = -off * 30;
        }
        if (l.animation === "zoom") scale = 0.4 + 0.6 * ease;
        if (l.animation === "typewriter") { opacity = 1; shown = l.text.slice(0, Math.max(1, Math.ceil(l.text.length * p))); }
    }
    const col = l.position % 3;
    const row = Math.floor(l.position / 3);
    const style: React.CSSProperties = {
        fontFamily: `'${l.font}', sans-serif`, fontSize: h / 14, color: l.color, fontWeight: l.bold ? 700 : 400,
        fontStyle: l.italic ? "italic" : "normal", textDecoration: l.underline ? "underline" : "none",
        textShadow: "2px 2px 3px rgba(0,0,0,.45)", opacity,
        left: col === 0 ? "6%" : col === 1 ? "50%" : undefined, right: col === 2 ? "6%" : undefined,
        top: row === 0 ? "8%" : row === 1 ? "50%" : undefined, bottom: row === 2 ? "10%" : undefined,
        transform: `translate(${col === 1 ? "-50%" : "0"}, ${row === 1 ? "-50%" : "0"}) translate(${dx}%, ${dy * 3}%) scale(${scale})`,
    };
    return (
        <div className="absolute z-[5] whitespace-pre" style={style}>
            <button type="button" onClick={onSelect} className={cn("block px-1 leading-tight", selected && "rounded outline-2 outline-offset-2 outline-primary outline-dashed")}>{shown}</button>
            {selected && (
                <span className="absolute -top-9 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full bg-white px-1 py-0.5 text-foreground shadow" style={{ fontSize: 12 }}>
                    <button type="button" onClick={onEdit} className="grid size-6 place-items-center rounded-full hover:bg-muted" aria-label="Edit text"><Pencil className="size-3.5" /></button>
                    <button type="button" onClick={onDuplicate} className="grid size-6 place-items-center rounded-full hover:bg-muted" aria-label="Duplicate text"><Copy className="size-3.5" /></button>
                    <button type="button" onClick={onDelete} className="grid size-6 place-items-center rounded-full text-destructive hover:bg-muted" aria-label="Delete text"><Trash2 className="size-3.5" /></button>
                </span>
            )}
        </div>
    );
}
