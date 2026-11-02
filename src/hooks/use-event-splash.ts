'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

/**
 * The event's mobile splash screen, edited on step 5 of Create / Edit Event.
 *
 * Uses the existing splash API (`/client/splash-screens`) — one row per event,
 * the same row the mobile app's splash editor writes. The web-only choices
 * (gradient type + direction, animation, music) live in `background_config`,
 * which is free JSON on the server.
 */

export type SplashBackground = 'image' | 'gradient' | 'color';
export type SplashGradientType = 'linear' | 'radial';
export type SplashAnimation = 'fade' | 'zoom' | 'slide' | 'particles';

export interface SplashState {
    /** The saved row's id; null until the first save. */
    id: number | null;
    background: SplashBackground;
    image_url: string;
    color: string;
    gradient_type: SplashGradientType;
    /** CSS angle in degrees (linear) — 90 = left to right. */
    gradient_angle: number;
    gradient_from: string;
    gradient_to: string;
    /** Invitation parts drawn on the splash, by component key. */
    components: Record<string, boolean>;
    animation: SplashAnimation;
    music_enabled: boolean;
    music_url: string;
    music_name: string;
}

export const SPLASH_COMPONENTS = [
    { key: 'event_title', label: 'Event Title' },
    { key: 'host_names', label: 'Host / Couple Names' },
    { key: 'date_time', label: 'Date & Time' },
    { key: 'venue', label: 'Venue' },
    { key: 'invitation_message', label: 'Tagline' },
    { key: 'decoration_elements', label: 'Decoration' },
] as const;

export const EMPTY_SPLASH: SplashState = {
    id: null,
    background: 'color',
    image_url: '',
    color: '#D36A7C',
    gradient_type: 'linear',
    gradient_angle: 90,
    gradient_from: '#8A2BE2',
    gradient_to: '#FF6B92',
    components: Object.fromEntries(SPLASH_COMPONENTS.map((c) => [c.key, c.key !== 'venue'])),
    animation: 'fade',
    music_enabled: false,
    music_url: '',
    music_name: '',
};

interface SplashRow {
    id: number;
    background_type?: string | null;
    background_url?: string | null;
    bg_color?: string | null;
    background_config?: Record<string, unknown> | null;
    components?: Record<string, unknown> | null;
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' && v ? v : fallback);

/** Saved row → editor state. Anything missing keeps the editor default. */
export function splashFromRow(row: SplashRow | null | undefined): SplashState {
    if (!row) return EMPTY_SPLASH;
    const c = (row.background_config ?? {}) as Record<string, unknown>;
    const type = row.background_type;
    const components = { ...EMPTY_SPLASH.components };
    for (const [k, v] of Object.entries(row.components ?? {})) {
        if (k in components) components[k] = v === true || v === 1 || v === '1';
    }
    return {
        id: row.id,
        background: type === 'gradient' ? 'gradient' : type === 'solid_color' ? 'color' : type === 'image' ? 'image' : EMPTY_SPLASH.background,
        image_url: str(row.background_url),
        color: str(row.bg_color, EMPTY_SPLASH.color),
        gradient_type: c.gradient_type === 'radial' ? 'radial' : 'linear',
        gradient_angle: typeof c.gradient_angle === 'number' ? c.gradient_angle : EMPTY_SPLASH.gradient_angle,
        gradient_from: str(c.gradient_from, EMPTY_SPLASH.gradient_from),
        gradient_to: str(c.gradient_to, EMPTY_SPLASH.gradient_to),
        components,
        animation: (['fade', 'zoom', 'slide', 'particles'] as const).find((a) => a === c.animation) ?? 'fade',
        music_enabled: c.music_enabled === true,
        music_url: str(c.music_url),
        music_name: str(c.music_name),
    };
}

/** CSS background for the preview (and the same values the row stores). */
export function splashBackgroundCss(s: SplashState): string {
    if (s.background === 'image' && s.image_url) return `center / cover no-repeat url("${s.image_url}")`;
    if (s.background === 'gradient') {
        return s.gradient_type === 'radial'
            ? `radial-gradient(circle, ${s.gradient_from}, ${s.gradient_to})`
            : `linear-gradient(${s.gradient_angle}deg, ${s.gradient_from}, ${s.gradient_to})`;
    }
    return s.color;
}

/** The event's splash (active row) — null when it has none yet. */
export function useEventSplash(eventId: number | null | undefined) {
    return useQuery({
        queryKey: ['event-splash', eventId],
        enabled: !!eventId,
        queryFn: async () => {
            const res = await api.get<{ splash_screen: SplashRow | null }>(`/client/splash-screens/for-event/${eventId}`);
            return res.splash_screen ?? null;
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

/**
 * Create or update the event's splash. Called after the event itself is
 * saved, because a splash needs the event's id.
 */
export async function saveEventSplash(event: { id: number; name: string; host_one?: string | null; host_two?: string | null }, s: SplashState) {
    const hosts = [event.host_one, event.host_two].map((v) => (v ?? '').trim()).filter(Boolean).join(' & ');
    const title = (hosts || event.name || 'Welcome').slice(0, 60);
    const body: Record<string, unknown> = {
        main_title: title,
        background_type: s.background === 'color' ? 'solid_color' : s.background,
        background_url: s.background === 'image' ? s.image_url || null : null,
        bg_color: s.background === 'color' ? s.color : null,
        components: s.components,
        background_config: {
            gradient_type: s.gradient_type,
            gradient_angle: s.gradient_angle,
            gradient_from: s.gradient_from,
            gradient_to: s.gradient_to,
            animation: s.animation,
            music_enabled: s.music_enabled,
            music_url: s.music_url || null,
            music_name: s.music_name || null,
            show_organizer: false,
        },
        status: 'active',
    };
    if (s.id) return api.put(`/client/splash-screens/${s.id}`, body);
    return api.post('/client/splash-screens', {
        ...body,
        event_id: event.id,
        name: `${event.name} splash`.slice(0, 150),
        loader_enabled: true,
    });
}
