'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';

/** Gallery albums — Create Album slideshows (web design, 2026-11-04). */

export type IntroAnimation = 'fade_slide_up' | 'fade' | 'zoom' | 'typewriter';

/** Intro text style (Jamal, 2026-11-05). */
export type IntroFont = 'playfair' | 'great_vibes' | 'dancing' | 'cormorant' | 'montserrat' | 'poppins';
export interface IntroStyle {
    font: IntroFont;
    color: string;
    size: 'sm' | 'md' | 'lg' | 'xl';
    align: 'left' | 'center' | 'right';
    position: 'top' | 'middle' | 'bottom';
    bold: boolean;
    italic: boolean;
    shadow: boolean;
}
export const INTRO_STYLE_DEFAULT: IntroStyle = {
    font: 'playfair', color: '#FFFFFF', size: 'lg', align: 'center', position: 'middle', bold: false, italic: true, shadow: true,
};

export interface AlbumSlide { item_id: number; url: string; thumbnail_url: string | null; file_name: string | null; seconds: number }

export interface GalleryAlbum {
    id: number;
    event_id: number;
    name: string;
    description: string | null;
    cover_image: string | null;
    cover_url: string | null;
    intro_enabled: boolean;
    intro_text: string | null;
    intro_animation: IntroAnimation;
    intro_seconds: number;
    intro_style?: IntroStyle | null;
    music_enabled: boolean;
    music_url: string | null;
    music_name: string | null;
    slide_seconds: number;
    slides: AlbumSlide[];
    slide_count: number;
    total_seconds: number;
    show_in_app: boolean;
    created_at?: string;
}

export interface AlbumPayload {
    name: string;
    description?: string | null;
    cover_image?: string | null;
    intro_enabled: boolean;
    intro_text?: string | null;
    intro_animation: IntroAnimation;
    intro_seconds: number;
    intro_style?: IntroStyle;
    music_enabled: boolean;
    music_url?: string | null;
    music_name?: string | null;
    slide_seconds: number;
    slides: { item_id: number; seconds: number }[];
    show_in_app?: boolean;
}

const key = (eventId: number) => ['client', 'gallery-albums', eventId] as const;
const fail = (e: unknown, fallback: string) => toast.error(e instanceof ApiError ? e.message : fallback);

export function useGalleryAlbums(eventId: number) {
    return useQuery({
        queryKey: key(eventId),
        queryFn: () => api.get<{ albums: GalleryAlbum[]; can_edit: boolean }>(`/client/events/${eventId}/gallery/albums`),
        retry: false,
    });
}

export function useSaveAlbum(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: AlbumPayload }) => (id
            ? api.put<{ album: GalleryAlbum }>(`/client/gallery/albums/${id}`, data)
            : api.post<{ album: GalleryAlbum }>(`/client/events/${eventId}/gallery/albums`, data)).then((r) => r.album),
        onSuccess: () => { toast.success('Album saved'); qc.invalidateQueries({ queryKey: key(eventId) }); },
        onError: (e) => fail(e, 'Could not save the album'),
    });
}

export function useDeleteAlbum(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.del(`/client/gallery/albums/${id}`),
        onSuccess: () => { toast.success('Album deleted'); qc.invalidateQueries({ queryKey: key(eventId) }); },
        onError: (e) => fail(e, 'Could not delete the album'),
    });
}

export function useUploadAlbumMusic(eventId: number) {
    return useMutation({
        mutationFn: (file: File) => {
            const form = new FormData();
            form.append('file', file);
            return api.post<{ url: string; name: string; size: number }>(`/client/events/${eventId}/gallery/albums/music`, form);
        },
        onError: (e) => fail(e, 'Could not upload that song'),
    });
}
