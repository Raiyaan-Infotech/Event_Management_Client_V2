'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { mediaUrl } from '@/lib/media-url';
import type { TemplateOption } from '@/hooks/use-client-portal';

/**
 * The event's mobile splash screen — the Splash Screen page of the event
 * (Jamal's "Splash Screen Customization" design, 2026-11-17).
 *
 * Uses the existing splash API (`/client/splash-screens`) — one row per event,
 * the same row the mobile app's splash editor writes. Everything the row has no
 * column for (title/subtitle, the extra gradient stops, overlay, text and accent
 * colours, frame, duration, quick template, music) lives in `background_config`,
 * which is free JSON on the server — no migration. The columns the app already
 * reads (`bg_color`, `background_url`, `gradient_from` / `gradient_to`) keep
 * being written as before.
 *
 * Jamal's choices (2026-11-17):
 *   - Quick Templates = the admin's Invitation Templates the event's plan allows;
 *     picking one copies its background, colours and frame.
 *   - Border / Frame Style = the admin's Frame Styles (real artwork) + None.
 *   - Logo = the template's sample logo from admin; the host may upload their
 *     own (`events.logo_image`), which the invitation shows too.
 *   - A new splash starts from the event's own invitation template.
 */

export type SplashBackground = 'image' | 'gradient' | 'color';
export type SplashGradientType = 'linear' | 'radial';
export type SplashAnimation = 'fade' | 'zoom' | 'slide' | 'particles';

export interface SplashState {
    /** The saved row's id; null until the first save. */
    id: number | null;
    /** Enable Splash Screen — off saves the row as `draft` and the app skips it. */
    enabled: boolean;
    /** Splash Title; "" = the host names / event name. */
    title: string;
    /** Subtitle / Tagline; "" = the event's tagline. */
    subtitle: string;
    show_date: boolean;
    show_logo: boolean;
    background: SplashBackground;
    image_url: string;
    color: string;
    gradient_type: SplashGradientType;
    /** CSS angle in degrees (linear) — 135 = top left to bottom right. */
    gradient_angle: number;
    /** 2-5 stops, in order. */
    gradient_colors: string[];
    overlay_color: string;
    /** 0-100. */
    overlay_opacity: number;
    text_color: string;
    accent_color: string;
    /** Accent / Border Color, and whether the frame + dividers are drawn in it. */
    border_color: string;
    border_for_frame: boolean;
    /** Admin Frame Style; null = None. */
    frame_id: number | null;
    frame_url: string;
    animation: SplashAnimation;
    /** Seconds on screen. */
    duration: number;
    /** Code of the admin template last applied ("" = none). */
    template: string;
    music_enabled: boolean;
    music_url: string;
    music_name: string;
}

export const EMPTY_SPLASH: SplashState = {
    id: null,
    enabled: true,
    title: '',
    subtitle: '',
    show_date: true,
    show_logo: true,
    background: 'gradient',
    image_url: '',
    color: '#7B0835',
    gradient_type: 'linear',
    gradient_angle: 135,
    gradient_colors: ['#8B1E3F', '#D5306A', '#F7C66E'],
    overlay_color: '#800000',
    overlay_opacity: 0,
    text_color: '#FFFFFF',
    accent_color: '#D4AF37',
    border_color: '#D4AF37',
    border_for_frame: false,
    frame_id: null,
    frame_url: '',
    animation: 'fade',
    duration: 3,
    template: '',
    music_enabled: false,
    music_url: '',
    music_name: '',
};

export const SPLASH_DURATIONS = [2, 3, 4, 5, 6] as const;

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;
/** `#abc` / `#AABBCC` → `#AABBCC`; anything else → fallback. */
const hex = (v: unknown, fallback: string) => {
    if (typeof v !== 'string') return fallback;
    if (HEX6.test(v)) return v.toUpperCase();
    if (HEX3.test(v)) return `#${v.slice(1).split('').map((c) => c + c).join('')}`.toUpperCase();
    return fallback;
};
const str = (v: unknown, fallback = '') => (typeof v === 'string' && v ? v : fallback);
const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** The admin template's gradient direction → a CSS angle (same table as the invitation card). */
const GRADIENT_DEG: Record<string, number> = {
    top: 0, 'top-right': 45, right: 90, 'bottom-right': 135,
    bottom: 180, 'bottom-left': 225, left: 270, 'top-left': 315,
};

/**
 * An admin invitation template → the splash's design values. Content (title,
 * subtitle, switches, animation, duration, music) is NOT touched — only the look.
 */
export function splashLookFromTemplate(t: TemplateOption): Partial<SplashState> {
    const ink = hex(t.secondary_color, '#FFFFFF');
    const accent = hex(t.frame_color, ink);
    const look: Partial<SplashState> = {
        template: t.code,
        text_color: ink,
        accent_color: accent,
        border_color: accent,
        border_for_frame: !!t.frame_color,
        frame_id: t.frame_style_id ?? null,
        frame_url: t.frame_url ?? '',
        overlay_color: hex(t.overlay_color, '#000000'),
        overlay_opacity: t.overlay_opacity ? Math.min(Math.max(Number(t.overlay_opacity) || 0, 0), 90) : 0,
    };
    if ((t.background_type === 'image' || t.background_type === 'custom') && t.background_image) {
        look.background = 'image';
        look.image_url = t.background_image;
    } else if (t.background_type === 'gradient') {
        look.background = 'gradient';
        look.gradient_type = t.gradient_type === 'radial' ? 'radial' : 'linear';
        look.gradient_angle = GRADIENT_DEG[t.gradient_direction ?? 'bottom'] ?? 180;
        look.gradient_colors = [t.gradient_from, t.gradient_via, t.gradient_to]
            .map((c) => hex(c, ''))
            .filter(Boolean);
        if ((look.gradient_colors as string[]).length < 2) look.gradient_colors = EMPTY_SPLASH.gradient_colors;
    } else {
        look.background = 'color';
        look.color = hex(t.background_color, EMPTY_SPLASH.color);
    }
    return look;
}

interface SplashRow {
    id: number;
    main_title?: string | null;
    status?: string | null;
    background_type?: string | null;
    background_url?: string | null;
    bg_color?: string | null;
    background_config?: Record<string, unknown> | null;
    components?: Record<string, unknown> | null;
}

/** Saved row → editor state. Anything missing keeps the editor default. */
export function splashFromRow(row: SplashRow | null | undefined): SplashState {
    if (!row) return EMPTY_SPLASH;
    const c = (row.background_config ?? {}) as Record<string, unknown>;
    const comp = (row.components ?? {}) as Record<string, unknown>;
    const type = row.background_type;
    // Rows saved before the 3-stop gradient carry only from / to.
    const stops = Array.isArray(c.gradient_colors)
        ? (c.gradient_colors as unknown[]).map((v) => hex(v, '')).filter(Boolean).slice(0, 5)
        : [];
    const gradient_colors = stops.length >= 2
        ? stops
        : [hex(c.gradient_from, EMPTY_SPLASH.gradient_colors[0]), hex(c.gradient_to, EMPTY_SPLASH.gradient_colors[2])];
    const dateOn = comp.date_time;
    const frameId = Number(c.frame_id);
    return {
        id: row.id,
        enabled: row.status ? row.status === 'active' : true,
        title: str(c.title),
        subtitle: str(c.subtitle),
        show_date: bool(c.show_date, dateOn === undefined ? true : dateOn === true || dateOn === 1 || dateOn === '1'),
        show_logo: bool(c.show_logo, true),
        background: type === 'gradient' ? 'gradient' : type === 'solid_color' ? 'color' : type === 'image' ? 'image' : EMPTY_SPLASH.background,
        image_url: str(row.background_url),
        color: hex(row.bg_color, EMPTY_SPLASH.color),
        gradient_type: c.gradient_type === 'radial' ? 'radial' : 'linear',
        gradient_angle: num(c.gradient_angle, EMPTY_SPLASH.gradient_angle, 0, 360),
        gradient_colors,
        overlay_color: hex(c.overlay_color, EMPTY_SPLASH.overlay_color),
        overlay_opacity: num(c.overlay_opacity, type === 'image' ? 25 : 0, 0, 100),
        text_color: hex(c.text_color, EMPTY_SPLASH.text_color),
        accent_color: hex(c.accent_color, EMPTY_SPLASH.accent_color),
        border_color: hex(c.border_color, EMPTY_SPLASH.border_color),
        border_for_frame: bool(c.border_for_frame, false),
        frame_id: frameId > 0 ? frameId : null,
        frame_url: frameId > 0 ? str(c.frame_url) : '',
        animation: (['fade', 'zoom', 'slide', 'particles'] as const).find((a) => a === c.animation) ?? 'fade',
        duration: num(c.duration, EMPTY_SPLASH.duration, 1, 10),
        template: str(c.template),
        music_enabled: c.music_enabled === true,
        music_url: str(c.music_url),
        music_name: str(c.music_name),
    };
}

/** CSS gradient of the stops. */
export function splashGradientCss(s: Pick<SplashState, 'gradient_type' | 'gradient_angle' | 'gradient_colors'>): string {
    const stops = s.gradient_colors.join(', ');
    return s.gradient_type === 'radial'
        ? `radial-gradient(circle at 50% 40%, ${stops})`
        : `linear-gradient(${s.gradient_angle}deg, ${stops})`;
}

/** CSS background for the preview. */
export function splashBackgroundCss(s: Pick<SplashState, 'background' | 'image_url' | 'color' | 'gradient_type' | 'gradient_angle' | 'gradient_colors'>): string {
    if (s.background === 'image' && s.image_url) return `center / cover no-repeat url("${mediaUrl(s.image_url) ?? s.image_url}")`;
    if (s.background === 'gradient') return splashGradientCss(s);
    return s.color;
}

/** The single colour the frame is drawn in; null = the frame's own colours. */
export const splashFrameTint = (s: SplashState) => (s.border_for_frame ? s.border_color : null);
/** The colour of the dividers. */
export const splashLineColor = (s: SplashState) => (s.border_for_frame ? s.border_color : s.accent_color);

/**
 * The event's splash row, WHATEVER its status — null when it has none yet.
 * Read from the list filtered by event, not from /for-event: that is the app's
 * read and serves only an `active` row, so a splash switched off (saved as
 * `draft`) would vanish from the editor and the next save would hit the
 * one-splash-per-event rule.
 */
export function useEventSplash(eventId: number | null | undefined) {
    return useQuery({
        queryKey: ['event-splash', eventId],
        enabled: !!eventId,
        queryFn: async () => {
            // limit 100: a backend without the filter returns every row, newest first.
            const res = await api.getList<SplashRow & { event_id?: number | null }>('/client/splash-screens', { event_id: eventId!, limit: 100 });
            // Only trust a row of THIS event.
            return res.data.find((r) => Number(r.event_id) === Number(eventId)) ?? null;
        },
    });
}

export interface SplashFrameOption {
    id: number;
    name: string;
    file_url: string;
    template_category_id: number | null;
    supported_layouts: string[] | null;
}

/** The admin's Frame Styles, for Border / Frame Style. */
export function useSplashFrames() {
    return useQuery({
        queryKey: ['splash-frames'],
        staleTime: 5 * 60_000,
        queryFn: async () => {
            const res = await api.get<{ frames?: SplashFrameOption[] }>('/client/splash-screens/decorations');
            // Portrait (a phone) or unspecified.
            return (res.frames ?? []).filter((f) => f.file_url && (!f.supported_layouts?.length || f.supported_layouts.includes('portrait')));
        },
    });
}

/** One upload (image or MP3) → its stored URL. */
export function useUploadSplashMedia() {
    return useMutation({
        mutationFn: (file: File) => {
            const form = new FormData();
            form.append('file', file);
            return api.post<{ url: string }>('/client/splash-screens/media', form).then((r) => r.url);
        },
    });
}

/** "Groom & Bride", or the event name. */
export const splashAutoTitle = (event: { name?: string | null; host_one?: string | null; host_two?: string | null }) => {
    const hosts = [event.host_one, event.host_two].map((v) => (v ?? '').trim()).filter(Boolean).join(' & ');
    return hosts || (event.name ?? '').trim() || 'Welcome';
};

/**
 * Create or update the event's splash. Called after the event itself is
 * saved, because a splash needs the event's id.
 */
export async function saveEventSplash(
    event: {
        id: number; name: string; host_one?: string | null; host_two?: string | null; tagline?: string | null;
        /** The logo resolved for the app: the event's own, else the template's sample. */
        logo_url?: string | null;
    },
    s: SplashState,
) {
    const title = (s.title.trim() || splashAutoTitle(event)).slice(0, 60);
    const stops = s.gradient_colors.length >= 2 ? s.gradient_colors : EMPTY_SPLASH.gradient_colors;
    const body: Record<string, unknown> = {
        main_title: title,
        tagline: (s.subtitle.trim() || event.tagline || '').slice(0, 150) || null,
        background_type: s.background === 'color' ? 'solid_color' : s.background,
        background_url: s.background === 'image' ? s.image_url || null : null,
        bg_color: s.background === 'color' ? s.color : null,
        // The app's part switches, kept in step with the new controls.
        components: {
            event_title: true,
            host_names: true,
            date_time: s.show_date,
            venue: false,
            invitation_message: !!(s.subtitle.trim() || event.tagline),
            decoration_elements: !!s.frame_id,
            event_logo: s.show_logo,
        },
        background_config: {
            title: s.title.trim() || null,
            subtitle: s.subtitle.trim() || null,
            show_date: s.show_date,
            show_logo: s.show_logo,
            // A copy for the app, which reads only this row; the portal always
            // re-resolves it from the event and its template.
            logo_url: s.show_logo ? event.logo_url || null : null,
            gradient_type: s.gradient_type,
            gradient_angle: s.gradient_angle,
            gradient_colors: stops,
            // First / last stop, for readers that only know two.
            gradient_from: stops[0],
            gradient_to: stops[stops.length - 1],
            overlay_color: s.overlay_color,
            overlay_opacity: s.overlay_opacity,
            text_color: s.text_color,
            accent_color: s.accent_color,
            border_color: s.border_color,
            border_for_frame: s.border_for_frame,
            frame_id: s.frame_id,
            frame_url: s.frame_id ? s.frame_url || null : null,
            animation: s.animation,
            duration: s.duration,
            template: s.template || null,
            music_enabled: s.music_enabled,
            music_url: s.music_url || null,
            music_name: s.music_name || null,
            show_organizer: false,
        },
        // The column's values are draft | active; draft = the app skips the splash.
        status: s.enabled ? 'active' : 'draft',
    };
    if (s.id) return api.put(`/client/splash-screens/${s.id}`, body);
    return api.post('/client/splash-screens', {
        ...body,
        event_id: event.id,
        name: `${event.name} splash`.slice(0, 150),
        loader_enabled: true,
    });
}
