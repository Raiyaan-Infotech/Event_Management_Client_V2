"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Music, Pause, Play, RotateCcw, Scissors, Upload, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * The gallery's video-editing sections, built ONCE (web gallery design 03, 2026-11-06) and used by
 * Upload Media (a queued video's "Trim & Music") and the Edit Video / Shorts page:
 *   · useClipPlayer — play / seek a video inside its trim, with the background song in step;
 *   · TrimTimeline  — "Timeline & Clip Trimming": ticks, frame strip, drag handles, Start / End, Duration, Reset;
 *   · MusicSection  — "Music (Background MP3)": song card, Upload MP3, Mute Original Audio, waveform timeline.
 */

export const t0 = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const t1 = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
export const parseT = (v: string) => {
    const m = v.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
    return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : NaN;
};

export type Trim = { start: number; end: number };
export type LoadedMusic = { file: File; url: string; duration: number; peaks: number[] };
/** The server's song cap (MAX_MUSIC_BYTES). */
export const MAX_MUSIC_BYTES = 10 * 1024 * 1024;

/** Read a picked song: its length and a 120-bar waveform (plain bars when the browser cannot decode it). */
export async function loadMusic(f: File): Promise<LoadedMusic | null> {
    if (!/^audio\//.test(f.type) && !/\.mp3$/i.test(f.name)) { toast.error("Please choose an MP3 file."); return null; }
    if (f.size > MAX_MUSIC_BYTES) { toast.error("The music must be 10 MB or smaller."); return null; }
    const url = URL.createObjectURL(f);
    let peaks: number[] = [];
    let duration = 0;
    try {
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(await f.arrayBuffer());
        duration = buf.duration;
        const data = buf.getChannelData(0);
        const step = Math.floor(data.length / 120) || 1;
        for (let i = 0; i < 120; i++) {
            let m = 0;
            for (let j = i * step; j < (i + 1) * step && j < data.length; j += 64) m = Math.max(m, Math.abs(data[j]));
            peaks.push(m);
        }
        void ctx.close();
    } catch { peaks = Array.from({ length: 120 }, () => 0.4); }
    return { file: f, url, duration, peaks };
}

/** Play / pause / seek inside [trim.start, trim.end]; the song follows the picture. */
export function useClipPlayer(trim: Trim, music: LoadedMusic | null, musicStart: number) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [time, setTime] = useState(0);
    const [playing, setPlaying] = useState(false);
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
    const songAt = (videoTime: number) => (music ? (musicStart + Math.max(0, videoTime - trim.start)) % Math.max(1, music.duration || 1) : 0);
    const play = () => {
        const v = videoRef.current;
        if (!v) return;
        if (playing) { v.pause(); audioRef.current?.pause(); setPlaying(false); return; }
        if (v.currentTime < trim.start || v.currentTime >= trim.end - 0.05) v.currentTime = trim.start;
        const a = audioRef.current;
        if (a && music) { a.currentTime = songAt(v.currentTime); void a.play().catch(() => {}); }
        void v.play().then(() => setPlaying(true)).catch(() => toast.error("The video could not be played."));
    };
    const seek = (s: number) => {
        const to = Math.max(trim.start, Math.min(trim.end, s));
        if (videoRef.current) videoRef.current.currentTime = to;
        if (audioRef.current && music) audioRef.current.currentTime = songAt(to);
        setTime(to);
    };
    const onTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => { if (!playing) setTime(e.currentTarget.currentTime); };
    return { videoRef, audioRef, time, playing, play, seek, onTimeUpdate, stop: () => setPlaying(false) };
}

/** "0:02.0" box with ▲▼ (0.1 s steps). */
export function TimeInput({ label, value, onChange }: { label?: string; value: number; onChange: (v: number) => void }) {
    const [text, setText] = useState<string | null>(null);
    return (
        <label className="flex items-center gap-1.5 text-[12px]">
            {label}
            <span className="flex h-8 items-center rounded-md border border-input bg-background">
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
 * Timeline & Clip Trimming. `onTrim` receives the wanted range; the caller clamps it
 * (use `clampTrim`). The frame strip is drawn from the video itself — a local file always,
 * a stored one only when its server allows it (CORS); otherwise the strip stays plain.
 */
export function TrimTimeline({ src, duration, trim, onTrim, time, onSeek, maxLength, active, boxRef }: {
    src: string; duration: number; trim: Trim; onTrim: (t: Trim) => void; time: number; onSeek: (s: number) => void;
    /** e.g. 60 for a short. */
    maxLength?: number; active?: boolean; boxRef?: React.Ref<HTMLDivElement>;
}) {
    const stripRef = useRef<HTMLDivElement>(null);
    const [thumbs, setThumbs] = useState<{ src: string; list: string[] } | null>(null);
    const len = Math.max(0, trim.end - trim.start);

    useEffect(() => {
        if (!duration || !src) return;
        let stop = false;
        const v = document.createElement("video");
        (async () => {
            try {
                if (!src.startsWith("blob:")) v.crossOrigin = "anonymous";
                v.muted = true; v.preload = "auto"; v.src = src;
                await new Promise<void>((ok, bad) => { v.onloadeddata = () => ok(); v.onerror = () => bad(new Error("no")); });
                const c = document.createElement("canvas");
                c.width = 96; c.height = 54;
                const ctx = c.getContext("2d");
                const out: string[] = [];
                for (let i = 0; i < 12 && !stop; i++) {
                    v.currentTime = (duration * (i + 0.5)) / 12;
                    await new Promise<void>((ok) => { v.onseeked = () => ok(); });
                    ctx?.drawImage(v, 0, 0, c.width, c.height);
                    out.push(c.toDataURL("image/jpeg", 0.6));
                }
                if (!stop) setThumbs({ src, list: out });
            } catch { /* the strip stays plain */ }
        })();
        return () => { stop = true; v.removeAttribute("src"); };
    }, [src, duration]);

    const ticks = useMemo(() => {
        if (!duration) return [];
        const step = duration <= 20 ? 2 : duration <= 60 ? 5 : duration <= 180 ? 15 : 30;
        const out: number[] = [];
        for (let s = 0; s < duration - step * 0.4; s += step) out.push(s);
        out.push(duration);
        return out;
    }, [duration]);
    const pct = (s: number) => (duration ? (s / duration) * 100 : 0);
    const frames = thumbs?.src === src ? thumbs.list : [];

    const dragHandle = (which: "start" | "end") => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const strip = stripRef.current;
        if (!strip || !duration) return;
        const rect = strip.getBoundingClientRect();
        let cur = trim;
        const move = (ev: PointerEvent) => {
            const s = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)) * duration;
            cur = which === "start" ? { start: Math.min(s, cur.end - 0.5), end: cur.end } : { start: cur.start, end: Math.max(s, cur.start + 0.5) };
            onTrim(cur);
        };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    return (
        <div ref={boxRef} className={cn("rounded-xl border bg-card p-3", active ? "border-primary/40" : "border-border")}>
            <div className="mb-2 flex items-center justify-between text-[13px]">
                <p className="flex items-center gap-1.5 font-bold"><Scissors className="size-4" /> Timeline &amp; Clip Trimming</p>
                <span className="text-[11.5px] text-muted-foreground">Video Duration: <b className="text-foreground">{t0(duration)}</b> ({Math.round(duration)}s)</span>
            </div>
            <div className="relative mx-2 mb-1 h-4 text-[10px] text-muted-foreground">
                {ticks.map((s) => <span key={s} className="absolute -translate-x-1/2" style={{ left: `${pct(s)}%` }}>{t0(s)}</span>)}
            </div>
            <div className="px-2">
                <div ref={stripRef} className="relative h-14 cursor-pointer rounded-lg bg-gradient-to-r from-primary/30 via-violet-400/30 to-primary/30"
                    onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * duration); }}>
                    {frames.length > 0 && (
                        <div className="absolute inset-0 flex overflow-hidden rounded-lg">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {frames.map((t, i) => <img key={i} src={t} alt="" className="h-full min-w-0 flex-1 object-cover" />)}
                        </div>
                    )}
                    <div className="absolute inset-y-0 left-0 rounded-l-lg bg-black/55" style={{ width: `${pct(trim.start)}%` }} />
                    <div className="absolute inset-y-0 right-0 rounded-r-lg bg-black/55" style={{ width: `${100 - pct(trim.end)}%` }} />
                    <div className="pointer-events-none absolute inset-y-0 rounded-md border-y-[3px] border-primary" style={{ left: `${pct(trim.start)}%`, right: `${100 - pct(trim.end)}%` }} />
                    {(["start", "end"] as const).map((w) => (
                        <span key={w} onPointerDown={dragHandle(w)} onClick={(e) => e.stopPropagation()} role="slider" tabIndex={0}
                            aria-label={w === "start" ? "Trim start" : "Trim end"} aria-valuenow={w === "start" ? trim.start : trim.end}
                            className="absolute inset-y-0 z-10 grid w-4 -translate-x-1/2 cursor-ew-resize place-items-center rounded-md bg-primary text-white shadow"
                            style={{ left: `${pct(w === "start" ? trim.start : trim.end)}%` }}>
                            <span className="flex gap-0.5"><span className="h-4 w-px bg-white/90" /><span className="h-4 w-px bg-white/90" /></span>
                        </span>
                    ))}
                    <span className="pointer-events-none absolute inset-y-0 z-[5] w-0.5 bg-white shadow" style={{ left: `${pct(time)}%` }} />
                </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
                <span className="font-medium">Trim Video (Clip Range)</span>
                <TimeInput label="Start" value={trim.start} onChange={(v) => onTrim({ start: v, end: trim.end })} />
                <TimeInput label="End" value={trim.end} onChange={(v) => onTrim({ start: trim.start, end: v })} />
                <span className="rounded-md bg-muted px-2.5 py-1.5 text-[12px]">Duration: <b>{t0(len)}</b>{maxLength ? ` (max ${t0(maxLength)})` : ""}</span>
                <Button size="sm" variant="outline" className="ml-auto h-8" onClick={() => onTrim({ start: 0, end: duration })}><RotateCcw className="size-3.5" /> Reset</Button>
            </div>
        </div>
    );
}

/** Keep a wanted range inside the video, at least 0.5 s, and at most `maxLength`. */
export function clampTrim(t: Trim, duration: number, maxLength?: number): Trim {
    const start = Math.max(0, Math.min(t.start, Math.max(0, duration - 0.5)));
    let end = Math.max(start + 0.5, Math.min(t.end, duration));
    if (maxLength && end - start > maxLength) end = start + maxLength;
    return { start: +start.toFixed(2), end: +end.toFixed(2) };
}

/**
 * Music (Background MP3). `musicReplacesSound`: the upload's server replaces the clip's own
 * sound with the song (no mixing) — Mute Original Audio then shows on and locked.
 */
export function MusicSection({
    music, onPick, onRemove, musicStart, onMusicStart, mute, onMute, len, playing, onPlay, musicReplacesSound, active, boxRef,
}: {
    music: LoadedMusic | null; onPick: (m: LoadedMusic) => void; onRemove: () => void; musicStart: number; onMusicStart: (s: number) => void;
    mute: boolean; onMute: (v: boolean) => void; len: number; playing: boolean; onPlay: () => void;
    musicReplacesSound?: boolean; active?: boolean; boxRef?: React.Ref<HTMLDivElement>;
}) {
    const pick = useRef<HTMLInputElement>(null);
    const locked = !!musicReplacesSound && !!music;
    const songShort = !!music && music.duration > 0 && music.duration - musicStart < len - 0.5;
    return (
        <div ref={boxRef} className={cn("rounded-xl border bg-card p-3", active ? "border-primary/40" : "border-border")}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <p className="flex items-center gap-1.5 font-bold"><Music className="size-4 text-primary" /> Music (Background MP3)</p>
                <span className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11.5px] text-primary">
                    <Music className="size-3" /> Song length should fit the video or shorts duration ({t0(len)}).
                </span>
            </div>
            <input ref={pick} type="file" accept="audio/mpeg,audio/mp3,.mp3" className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const m = await loadMusic(f); if (m) onPick(m); } }} />
            <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
                <span className="w-[110px] font-medium">Background MP3</span>
                {music ? (
                    <span className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-border px-3 py-2">
                        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Music className="size-4" /></span>
                        <span className="min-w-0 flex-1"><b className="block truncate">{music.file.name}</b><span className="text-[11px] text-muted-foreground">{(music.file.size / 1048576).toFixed(1)} MB • {t0(music.duration)}</span></span>
                        <button type="button" onClick={onRemove} aria-label="Remove music"><X className="size-4" /></button>
                    </span>
                ) : <span className="min-w-[200px] flex-1 text-muted-foreground">No music — the video keeps its own sound.</span>}
                <Button variant="outline" className="h-auto flex-col gap-0 py-1.5" onClick={() => pick.current?.click()}>
                    <span className="flex items-center gap-1.5 text-[12.5px]"><Upload className="size-3.5" /> Upload MP3</span>
                    <span className="text-[10.5px] text-muted-foreground">MP3 only • Max 10 MB</span>
                </Button>
                <label className={cn("flex items-center gap-2 border-l border-border pl-3 font-medium", locked && "opacity-70")}
                    title={locked ? "The song replaces the video's own sound." : undefined}>
                    <Volume2 className="size-4" /> Mute Original Audio <Switch checked={locked || mute} disabled={locked} onCheckedChange={onMute} />
                </label>
            </div>
            {music && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
                    <span className="w-[110px] font-medium">Music Timeline ({t0(len)})</span>
                    <div className="flex min-w-[240px] flex-1 items-center gap-3 rounded-lg border border-border px-3 py-2">
                        <button type="button" onClick={onPlay} className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary" aria-label={playing ? "Pause" : "Play with music"}>
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
                    <TimeInput label="Song starts at" value={musicStart} onChange={(v) => onMusicStart(Math.max(0, Math.min(v, Math.max(0, music.duration - 1))))} />
                </div>
            )}
            {songShort && <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-warning"><AlertCircle className="size-3.5" /> The song is shorter than the clip — it will start again from the beginning.</p>}
        </div>
    );
}
