"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ArrowDown, ArrowLeft, ArrowUp, Clock, Eye, EyeOff, Film, GripVertical, Image as ImageIcon, Images, Info, Maximize2,
    Minus, MoreVertical, Music, Pause, Pencil, Play, Plus, Save, Trash2, Type, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CharCount, FormField, PhotoDropzone, StatusPill } from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import { useUploadGalleryCover, type GalleryCategory, type GalleryItem } from "@/hooks/use-event-modules";
import {
    useDeleteAlbum, useSaveAlbum, useUploadAlbumMusic, type GalleryAlbum, type IntroAnimation,
} from "@/hooks/use-gallery-albums";

/**
 * Create / Edit Album — Jamal's web design (2026-11-04): Album Slides (from the
 * gallery's photos; drag to reorder, per-slide seconds, remove), Album Settings
 * (name, description, cover, animated intro text, background MP3, intro and
 * slide durations, total), and a live Slideshow Preview with its timeline and
 * an Album Summary. Saved to /client/events/:id/gallery/albums.
 */

const ANIMATIONS: { value: IntroAnimation; label: string }[] = [
    { value: "fade_slide_up", label: "Fade In & Slide Up" },
    { value: "fade", label: "Fade In" },
    { value: "zoom", label: "Zoom In" },
    { value: "typewriter", label: "Typewriter" },
];
const MAX_MUSIC = 10 * 1024 * 1024;
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

type Slide = { item_id: number; url: string; thumbnail_url: string | null; file_name: string | null; seconds: number };
export type PlayerAlbum = {
    name: string; intro_enabled: boolean; intro_text: string | null; intro_animation: IntroAnimation; intro_seconds: number;
    music_enabled: boolean; music_url: string | null; slides: { url: string; seconds: number }[];
    /** The intro is drawn over this (the mockup); falls back to the first slide. */
    cover_image?: string | null;
};

/* ── The slideshow player (preview, Preview Album, Play) ─────────────────── */

/** Plays the intro text, then each slide for its seconds; the song plays along. */
export function SlideshowPlayer({ album, autoPlay = false, className }: { album: PlayerAlbum; autoPlay?: boolean; className?: string }) {
    const segments = useMemo(() => {
        const list: { kind: "intro" | "slide"; start: number; end: number; url?: string }[] = [];
        let t = 0;
        if (album.intro_enabled && album.intro_text) { list.push({ kind: "intro", start: 0, end: album.intro_seconds }); t = album.intro_seconds; }
        for (const s of album.slides) { list.push({ kind: "slide", start: t, end: t + s.seconds, url: s.url }); t += s.seconds; }
        return list;
    }, [album]);
    const total = segments.length ? segments[segments.length - 1].end : 0;
    const [time, setTime] = useState(0);
    const [playing, setPlaying] = useState(autoPlay);
    const audio = useRef<HTMLAudioElement>(null);
    const last = useRef<number | null>(null);

    useEffect(() => {
        if (!playing) { last.current = null; return; }
        let raf = 0;
        const tick = (now: number) => {
            if (last.current !== null) {
                const dt = (now - last.current) / 1000;
                setTime((t) => {
                    const next = t + dt;
                    if (next >= total) { setPlaying(false); return total; }
                    return next;
                });
            }
            last.current = now;
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, total]);
    useEffect(() => {
        const a = audio.current;
        if (!a) return;
        if (playing) { a.currentTime = time % (a.duration || Infinity); a.play().catch(() => undefined); } else a.pause();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing]);

    const seg = segments.find((s) => time >= s.start && time < s.end) ?? segments[segments.length - 1];
    const activeIdx = seg ? segments.indexOf(seg) : -1;
    const toggle = () => { if (!playing && time >= total) setTime(0); setPlaying((p) => !p); };
    const seek = (v: number) => { setTime(v); if (audio.current) audio.current.currentTime = v; };
    const introBg = album.cover_image || album.slides[0]?.url || null;
    const anim = { fade_slide_up: "albumUp", fade: "albumFade", zoom: "albumZoom", typewriter: "albumType" }[album.intro_animation];

    return (
        <div className={cn("relative overflow-hidden rounded-xl bg-black", className)}>
            <style>{`
@keyframes albumUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes albumFade{from{opacity:0}to{opacity:1}}
@keyframes albumZoom{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}
@keyframes albumType{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes albumKen{from{transform:scale(1.02)}to{transform:scale(1.12)}}`}</style>
            {/* Every layer is mounted from the start, so each photo is already loaded when its turn
                comes, and the next one CROSS-FADES over the last (Jamal, 2026-11-05: cover → first
                image went black and lagged while that image downloaded). The zoom keeps running on
                the layer that is fading out, so it does not jump back. */}
            {!seg ? (
                <div className="grid size-full place-items-center text-[13px] text-white/70">Add images to see the slideshow</div>
            ) : segments.map((s, i) => {
                const active = s === seg;
                const zooming = i === activeIdx || i === activeIdx - 1;
                const ken = zooming ? `albumKen ${(s.end - s.start).toFixed(1)}s linear both` : "none";
                return (
                    <div key={`${s.kind}-${i}`} aria-hidden={!active}
                        className={cn("absolute inset-0 transition-opacity duration-700 ease-out", active ? "opacity-100" : "opacity-0")}
                        style={{ zIndex: i === activeIdx ? 2 : i === activeIdx - 1 ? 1 : 0 }}>
                        {s.kind === "intro" ? (
                            <div className="relative grid size-full place-items-center px-6 text-center">
                                {/* The intro text sits OVER the cover image (Jamal's mockup); pink card only when there is no picture. */}
                                {introBg ? (
                                    <>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={mediaUrl(introBg)} alt="" decoding="async" className="absolute inset-0 size-full object-cover"
                                            style={{ animation: ken, animationPlayState: playing ? "running" : "paused" }} />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-black/20" />
                                    </>
                                ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-rose-100 via-pink-50 to-amber-50" />
                                )}
                                <p key={`t-${active}-${playing}`} className={cn("relative font-serif text-[clamp(18px,4vw,34px)] leading-snug whitespace-pre-line italic",
                                    introBg ? "text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" : "text-primary")}
                                    style={{ animation: active ? `${anim} 1.2s ease-out both` : "none" }}>{album.intro_text}</p>
                            </div>
                        ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mediaUrl(s.url)} alt="" decoding="async" className="size-full object-cover"
                                style={{ animation: ken, animationPlayState: playing ? "running" : "paused" }} />
                        )}
                    </div>
                );
            })}
            {album.music_enabled && album.music_url && <audio ref={audio} src={mediaUrl(album.music_url)} loop />}
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2 text-white">
                <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} disabled={!total}>{playing ? <Pause className="size-4 fill-white" /> : <Play className="size-4 fill-white" />}</button>
                <span className="text-[11px] tabular-nums">{fmtTime(time)} / {fmtTime(total)}</span>
                <input type="range" min={0} max={total || 1} step={0.1} value={time} onChange={(e) => seek(Number(e.target.value))} className="h-1 flex-1 accent-[var(--primary)]" aria-label="Seek" />
                {album.music_enabled && album.music_url && <Music className="size-3.5 opacity-80" />}
            </div>
        </div>
    );
}

export function PlayAlbumDialog({ album, onClose }: { album: PlayerAlbum; onClose: () => void }) {
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-4xl p-3 sm:max-w-4xl">
                <DialogHeader className="px-1"><DialogTitle>{album.name || "Album"}</DialogTitle><DialogDescription className="sr-only">Slideshow</DialogDescription></DialogHeader>
                <SlideshowPlayer album={album} autoPlay className="aspect-video w-full" />
            </DialogContent>
        </Dialog>
    );
}

/* ── Albums on the Gallery Overview ─────────────────────────────────────── */

export function AlbumCards({ eventId, albums, onEdit }: { eventId: number; albums: GalleryAlbum[]; onEdit: (a: GalleryAlbum) => void }) {
    const remove = useDeleteAlbum(eventId);
    const [playing, setPlaying] = useState<GalleryAlbum | null>(null);
    const [deleting, setDeleting] = useState<GalleryAlbum | null>(null);
    if (!albums.length) return null;
    return (
        <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-[14px] font-bold"><Images className="size-4 text-primary" /> Albums ({albums.length})</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {albums.map((a) => (
                    <div key={a.id} className="flex gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40">
                        <button type="button" className="relative h-[78px] w-[104px] shrink-0 overflow-hidden rounded-lg bg-muted" onClick={() => setPlaying(a)} aria-label={`Play ${a.name}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {a.cover_url ? <img src={mediaUrl(a.cover_url)} alt="" className="size-full object-cover" /> : <Images className="m-auto mt-6 size-7 text-muted-foreground" />}
                            <Play className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 fill-white text-white drop-shadow" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                                <p className="truncate text-[13.5px] font-bold" title={a.name}>{a.name}</p>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label="Album actions"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-40">
                                        <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setPlaying(a)}><Play className="size-4" /> Play</DropdownMenuItem>
                                        <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => onEdit(a)}><Pencil className="size-4" /> Edit Album</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="gap-2 text-[13px] text-destructive focus:text-destructive" onClick={() => setDeleting(a)}><Trash2 className="size-4" /> Delete</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            <p className="truncate text-[11.5px] text-muted-foreground">{a.description || "Slideshow album"}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <StatusPill tone="primary" icon={ImageIcon}>{a.slide_count} slides</StatusPill>
                                <StatusPill tone="violet" icon={Clock}>{fmtTime(a.total_seconds)}</StatusPill>
                                {a.music_enabled && <StatusPill tone="amber" icon={Music}>Music</StatusPill>}
                                {!a.show_in_app && <StatusPill tone="muted" icon={EyeOff}>Hidden</StatusPill>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {playing && <PlayAlbumDialog album={playing} onClose={() => setPlaying(null)} />}
            <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Delete Album?</DialogTitle><DialogDescription>&ldquo;{deleting?.name}&rdquo; will be removed. Its photos stay in the gallery.</DialogDescription></DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>Delete Album</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* ── The builder ────────────────────────────────────────────────────────── */

function Stepper({ value, onChange, min = 1, max = 60 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
    const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 10) / 10));
    return (
        <div className="flex h-9 items-center overflow-hidden rounded-md border border-input">
            <button type="button" className="grid h-full w-8 place-items-center text-primary hover:bg-muted" onClick={() => onChange(clamp(value - 0.5))} aria-label="Less"><Minus className="size-3.5" /></button>
            <span className="flex-1 text-center text-[13px] tabular-nums">{one(value)} s</span>
            <button type="button" className="grid h-full w-8 place-items-center text-primary hover:bg-muted" onClick={() => onChange(clamp(value + 0.5))} aria-label="More"><Plus className="size-3.5" /></button>
        </div>
    );
}

export function AlbumBuilder({
    eventId, album, images, folders, onBack,
}: { eventId: number; album: GalleryAlbum | null; images: GalleryItem[]; folders: GalleryCategory[]; onBack: () => void }) {
    const save = useSaveAlbum(eventId);
    const cover = useUploadGalleryCover(eventId);
    const music = useUploadAlbumMusic(eventId);
    const musicRef = useRef<HTMLInputElement>(null);
    const listen = useRef<HTMLAudioElement>(null);
    const [listening, setListening] = useState(false);

    const [name, setName] = useState(album?.name ?? "");
    const [description, setDescription] = useState(album?.description ?? "");
    const [coverImage, setCoverImage] = useState<string | null>(album?.cover_image ?? null);
    const [introOn, setIntroOn] = useState(album?.intro_enabled ?? true);
    const [introText, setIntroText] = useState(album?.intro_text ?? "");
    const [animation, setAnimation] = useState<IntroAnimation>(album?.intro_animation ?? "fade_slide_up");
    const [introSeconds, setIntroSeconds] = useState(album?.intro_seconds ?? 5);
    const [musicOn, setMusicOn] = useState(album?.music_enabled ?? false);
    const [song, setSong] = useState<{ url: string; name: string; size?: number } | null>(album?.music_url ? { url: album.music_url, name: album.music_name ?? "song.mp3" } : null);
    const [slideSeconds, setSlideSeconds] = useState(album?.slide_seconds ?? 5);
    const [slides, setSlides] = useState<Slide[]>(album?.slides ?? []);
    const [picking, setPicking] = useState(false);
    const [preview, setPreview] = useState(false);
    const [drag, setDrag] = useState<number | null>(null);
    const [tried, setTried] = useState(false);

    const total = (introOn ? introSeconds : 0) + slides.reduce((t, s) => t + s.seconds, 0);
    // The intro shows the Intro Text, or the Album Name when that is empty (Jamal, 2026-11-05:
    // the name typed in did not show in the video, and the timeline claimed an intro that was skipped).
    const introShown = introText.trim() || name.trim();
    const player: PlayerAlbum = {
        name, intro_enabled: introOn, intro_text: introShown, intro_animation: animation, intro_seconds: introSeconds,
        music_enabled: musicOn, music_url: song?.url ?? null, slides: slides.map((s) => ({ url: s.url, seconds: s.seconds })),
        cover_image: coverImage,
    };
    const setAll = (sec: number) => { setSlideSeconds(sec); setSlides((l) => l.map((s) => ({ ...s, seconds: sec }))); };
    const move = (from: number, to: number) => setSlides((l) => { const c = [...l]; const [x] = c.splice(from, 1); c.splice(to, 0, x); return c; });

    const pickSong = (f?: File) => {
        if (!f) return;
        if (!/audio\/(mpeg|mp3)/.test(f.type) && !/\.mp3$/i.test(f.name)) return toast.error("Please choose an MP3 file.");
        if (f.size > MAX_MUSIC) return toast.error("The song must be 10 MB or smaller.");
        music.mutate(f, { onSuccess: (r) => { setSong({ url: r.url, name: r.name, size: r.size }); setMusicOn(true); } });
    };

    const submit = () => {
        setTried(true);
        if (!name.trim()) return toast.error("Please enter the album name.");
        if (!slides.length) return toast.error("Please add at least one image.");
        if (!coverImage) return toast.error("Please add a cover image.");
        if (musicOn && !song) return toast.error("Please upload the background song, or switch the music off.");
        save.mutate({
            id: album?.id,
            data: {
                name: name.trim(), description: description.trim() || null, cover_image: coverImage,
                intro_enabled: introOn, intro_text: introOn ? introShown : introText.trim() || null, intro_animation: animation, intro_seconds: introSeconds,
                music_enabled: musicOn, music_url: song?.url ?? null, music_name: song?.name ?? null,
                slide_seconds: slideSeconds, slides: slides.map((s) => ({ item_id: s.item_id, seconds: s.seconds })),
            },
        }, { onSuccess: onBack });
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" className="h-8" onClick={onBack}><ArrowLeft className="size-3.5" /> Gallery</Button>
                <div className="min-w-0 flex-1">
                    <h3 className="text-[20px] leading-tight font-bold">{album ? "Edit Album" : "Create Album"}</h3>
                    <p className="text-[12.5px] text-muted-foreground">Build a beautiful slideshow album from your event photos, add animated intro text, music, and more.</p>
                </div>
                <Button variant="outline" size="sm" className="h-8" onClick={() => setPreview(true)} disabled={!slides.length}><Play className="size-3.5" /> Preview Album</Button>
                <Button size="sm" className="h-8" disabled={save.isPending || music.isPending} onClick={submit}><Save className="size-3.5" /> Save Album</Button>
            </div>

            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(240px,0.9fr)_minmax(300px,1.1fr)_minmax(320px,1.3fr)]">
                {/* ── Album Slides ── */}
                <div className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
                    <div className="flex items-start justify-between gap-2 border-b border-border p-3">
                        <div><p className="text-[14px] font-bold">Album Slides ({slides.length})</p><p className="text-[11px] text-muted-foreground">Pick photos from your gallery and arrange them in the order you want.</p></div>
                        <Button size="sm" variant="outline" className="h-7 shrink-0 border-primary/40 text-primary" onClick={() => setPicking(true)}><Plus className="size-3.5" /> Add Images</Button>
                    </div>
                    <div className="flex max-h-[560px] flex-col gap-1.5 overflow-y-auto p-2">
                        {slides.length === 0 && <button type="button" onClick={() => setPicking(true)} className="rounded-lg border border-dashed border-primary/40 py-10 text-[12.5px] text-muted-foreground hover:bg-primary/5">No slides yet — <span className="font-semibold text-primary">add images</span></button>}
                        {slides.map((s, i) => (
                            <div key={`${s.item_id}-${i}`} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()}
                                onDrop={() => { if (drag !== null && drag !== i) move(drag, i); setDrag(null); }} onDragEnd={() => setDrag(null)}
                                className={cn("flex items-center gap-2 rounded-lg border bg-card p-1.5", drag === i ? "border-primary opacity-60" : "border-border")}>
                                <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
                                <span className="grid size-6 shrink-0 place-items-center rounded bg-primary/10 text-[11.5px] font-bold text-primary">{i + 1}</span>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={mediaUrl(s.thumbnail_url || s.url)} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[12px] font-medium" title={s.file_name ?? ""}>{s.file_name || `Photo ${s.item_id}`}</p>
                                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="size-3" /> {one(s.seconds)} s</p>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label="Slide actions"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44">
                                        {[3, 5, 7, 10].map((n) => <DropdownMenuItem key={n} className="gap-2 text-[13px]" onClick={() => setSlides((l) => l.map((x, j) => (j === i ? { ...x, seconds: n } : x)))}><Clock className="size-4" /> Show {n} s</DropdownMenuItem>)}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="gap-2 text-[13px]" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp className="size-4" /> Move Up</DropdownMenuItem>
                                        <DropdownMenuItem className="gap-2 text-[13px]" disabled={i === slides.length - 1} onClick={() => move(i, i + 1)}><ArrowDown className="size-4" /> Move Down</DropdownMenuItem>
                                        <DropdownMenuItem className="gap-2 text-[13px]" onClick={() => setCoverImage(s.url)}><ImageIcon className="size-4" /> Use as Cover</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="gap-2 text-[13px] text-destructive focus:text-destructive" onClick={() => setSlides((l) => l.filter((_, j) => j !== i))}><Trash2 className="size-4" /> Remove</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ))}
                    </div>
                    <p className="m-2 mt-auto flex gap-1.5 rounded-lg bg-primary/5 p-2 text-[11px] text-foreground/75"><Info className="mt-px size-3.5 shrink-0 text-primary" /> Drag and drop to reorder slides. Each slide is shown for the duration set in Slide Duration.</p>
                </div>

                {/* ── Album Settings ── */}
                <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 text-[12.5px] [&_[data-slot=input]]:!h-8 [&_[data-slot=input]]:!text-[12.5px] [&_textarea]:!text-[12.5px]">
                    <div><p className="text-[14px] font-bold">Album Settings</p><p className="text-[11px] text-muted-foreground">Configure your album details, intro, background music, and timing.</p></div>
                    <FormField label="Album Name" required>
                        <Input value={name} maxLength={150} placeholder="e.g. QA Test Wedding – Highlights" onChange={(e) => setName(e.target.value)} className={cn(tried && !name.trim() && "border-destructive")} />
                    </FormField>
                    <FormField label="Description">
                        <Textarea value={description} maxLength={300} rows={2} placeholder="A beautiful collection of moments…" onChange={(e) => setDescription(e.target.value)} />
                        <CharCount value={description} max={300} />
                    </FormField>
                    <FormField label="Cover Image" required>
                        <PhotoDropzone value={coverImage} onChange={setCoverImage} aspect={16 / 9} outputSize={1280} recommend={null}
                            uploader={(f) => cover.mutateAsync(f).then((r) => r.url)} />
                    </FormField>
                    <div className="flex items-start gap-3 border-t border-border pt-3">
                        <Switch checked={introOn} onCheckedChange={setIntroOn} id="album-intro" />
                        <label htmlFor="album-intro"><span className="block font-semibold">Add Animated Intro Text</span><span className="block text-[11px] text-muted-foreground">Show a beautiful animated text before the slideshow starts.</span></label>
                    </div>
                    {introOn && (
                        <>
                            <FormField label="Intro Text">
                                <Textarea value={introText} maxLength={120} rows={2} placeholder={name.trim() ? `${name.trim()} (the album name is used when this is empty)` : "QA Test Wedding\nA Journey of Love & Togetherness"} onChange={(e) => setIntroText(e.target.value)} />
                                <CharCount value={introText} max={120} />
                            </FormField>
                            <FormField label="Text Animation">
                                <Select value={animation} onValueChange={(v) => setAnimation(v as IntroAnimation)}>
                                    <SelectTrigger className="!h-8 w-full text-[12.5px]"><span className="flex items-center gap-2"><Type className="size-3.5 text-primary" /><SelectValue /></span></SelectTrigger>
                                    <SelectContent>{ANIMATIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </FormField>
                        </>
                    )}
                    <div className="flex items-start gap-3 border-t border-border pt-3">
                        <Switch checked={musicOn} onCheckedChange={setMusicOn} id="album-music" />
                        <label htmlFor="album-music"><span className="block font-semibold">Add Background MP3 Song</span><span className="block text-[11px] text-muted-foreground">Play a background song throughout the slideshow.</span></label>
                    </div>
                    {musicOn && (
                        <div className="flex items-center gap-2 rounded-lg border border-border p-2">
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Music className="size-4" /></span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{song ? song.name : "No song yet"}</p>
                                <p className="text-[11px] text-muted-foreground">{music.isPending ? "Uploading…" : song?.size ? `${(song.size / 1024 / 1024).toFixed(1)} MB` : "MP3 • Max 10 MB"}</p>
                            </div>
                            <input ref={musicRef} type="file" accept="audio/mpeg,.mp3" className="hidden" onChange={(e) => { pickSong(e.target.files?.[0]); e.target.value = ""; }} />
                            {song && (
                                <>
                                    <audio ref={listen} src={mediaUrl(song.url)} onEnded={() => setListening(false)} />
                                    <Button size="icon" variant="outline" className="size-8" aria-label={listening ? "Pause song" : "Play song"} onClick={() => {
                                        const a = listen.current; if (!a) return;
                                        if (listening) { a.pause(); setListening(false); } else { a.play().then(() => setListening(true)).catch(() => toast.error("Could not play that file.")); }
                                    }}>{listening ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</Button>
                                </>
                            )}
                            <Button size="sm" variant="outline" className="h-8" disabled={music.isPending} onClick={() => musicRef.current?.click()}><Upload className="size-3.5" /> {song ? "Change Song" : "Upload MP3"}</Button>
                            {song && <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="Remove song" onClick={() => { setSong(null); setListening(false); }}><Trash2 className="size-3.5" /></Button>}
                        </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
                        <FormField label="Intro Duration"><Stepper value={introSeconds} onChange={setIntroSeconds} /></FormField>
                        <FormField label="Slide Duration"><Stepper value={slideSeconds} onChange={setAll} /></FormField>
                        <div className="flex flex-col justify-center rounded-lg border border-primary/30 bg-primary/5 px-2 py-1">
                            <p className="text-[11px] font-semibold">Total Album Duration</p>
                            <p className="text-[20px] leading-6 font-bold text-primary">{fmtTime(total)}</p>
                            <p className="text-[10px] text-muted-foreground">{introOn ? `${one(introSeconds)} s intro + ` : ""}{slides.length} slides</p>
                        </div>
                    </div>
                </div>

                {/* ── Slideshow Preview ── */}
                <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                        <div><p className="flex items-center gap-1.5 text-[14px] font-bold"><Eye className="size-4" /> Slideshow Preview</p><p className="text-[11px] text-muted-foreground">See how your album will play, including the animated intro and image slides.</p></div>
                        <Button size="icon" variant="outline" className="size-8" onClick={() => setPreview(true)} disabled={!slides.length} aria-label="Full screen"><Maximize2 className="size-4" /></Button>
                    </div>
                    <SlideshowPlayer album={player} className="aspect-video w-full" />
                    <div>
                        <p className="mb-1.5 flex items-center justify-between text-[12px] font-semibold">Preview Timeline <span className="font-normal text-muted-foreground">{introOn ? `Intro (0:00 – ${fmtTime(introSeconds)}) | ` : ""}{slides.length} slides</span></p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {introOn && <span className="grid h-14 w-16 shrink-0 place-items-center rounded-lg border border-primary bg-primary/5 text-center text-[10.5px] text-primary"><Type className="size-4" />Intro<br />({one(introSeconds)}s)</span>}
                            {slides.map((s, i) => (
                                <span key={`${s.item_id}-${i}`} className="w-16 shrink-0 text-center text-[10.5px] text-muted-foreground">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={mediaUrl(s.thumbnail_url || s.url)} alt="" className="h-10 w-16 rounded object-cover" />{i + 1} ({one(s.seconds)}s)
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="rounded-lg border border-border p-2.5 text-[12px]">
                        <p className="mb-1.5 flex items-center gap-1.5 font-bold"><Images className="size-3.5 text-primary" /> Album Summary</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <span className="flex items-center gap-1.5"><ImageIcon className="size-3.5 text-muted-foreground" /> {slides.length} Slides</span>
                            <span className="flex items-center gap-1.5"><Clock className="size-3.5 text-muted-foreground" /> Intro: {introOn ? `${one(introSeconds)} s` : "Off"}</span>
                            <span className="flex items-center gap-1.5"><Type className="size-3.5 text-muted-foreground" /> Intro Text {introOn ? "(Animated)" : "(Off)"}</span>
                            <span className="flex items-center gap-1.5"><Clock className="size-3.5 text-muted-foreground" /> Slide: {one(slideSeconds)} s</span>
                            <span className="flex items-center gap-1.5"><Music className="size-3.5 text-muted-foreground" /> {musicOn && song ? "Background Song (MP3)" : "No music"}</span>
                            <span className="flex items-center gap-1.5 rounded bg-primary/10 px-1.5 font-semibold text-primary"><Film className="size-3.5" /> Total: {fmtTime(total)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {picking && <PickImages images={images} folders={folders} chosen={slides.map((s) => s.item_id)} onClose={() => setPicking(false)}
                onAdd={(list) => { setSlides((l) => [...l, ...list.map((i) => ({ item_id: i.id, url: i.url, thumbnail_url: i.thumbnail_url, file_name: i.file_name, seconds: slideSeconds }))]); if (!coverImage && list[0]) setCoverImage(list[0].url); setPicking(false); }} />}
            {preview && <PlayAlbumDialog album={player} onClose={() => setPreview(false)} />}
        </div>
    );
}

/** Add Images: the gallery's photos, filtered by folder; already-added ones are marked. */
function PickImages({ images, folders, chosen, onClose, onAdd }: { images: GalleryItem[]; folders: GalleryCategory[]; chosen: number[]; onClose: () => void; onAdd: (list: GalleryItem[]) => void }) {
    const [folder, setFolder] = useState<string>("all");
    const [sel, setSel] = useState<number[]>([]);
    const list = images.filter((i) => folder === "all" || String(i.category_id) === folder);
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto sm:max-w-3xl">
                <DialogHeader><DialogTitle>Add Images</DialogTitle><DialogDescription>Choose photos from your event gallery for this album.</DialogDescription></DialogHeader>
                <Select value={folder} onValueChange={setFolder}>
                    <SelectTrigger className="h-9 w-60"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All folders</SelectItem>{folders.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
                {list.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">No photos here yet — upload some first.</p> : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {list.map((i) => {
                            const on = sel.includes(i.id);
                            const added = chosen.includes(i.id);
                            return (
                                <button key={i.id} type="button" onClick={() => setSel((s) => (on ? s.filter((x) => x !== i.id) : [...s, i.id]))}
                                    className={cn("relative aspect-square overflow-hidden rounded-lg border-2", on ? "border-primary" : "border-transparent")}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={mediaUrl(i.thumbnail_url || i.url)} alt="" className="size-full object-cover" />
                                    <span className="absolute top-1 left-1"><Checkbox checked={on} className="border-white bg-black/30" /></span>
                                    {added && <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10px] text-white">In album</span>}
                                </button>
                            );
                        })}
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={!sel.length} onClick={() => onAdd(images.filter((i) => sel.includes(i.id)))}>Add {sel.length || ""} {sel.length === 1 ? "Image" : "Images"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
