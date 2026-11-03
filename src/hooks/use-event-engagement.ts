'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';

/**
 * Wed Wishes, Live Streaming and Social Links for the portal (Jamal, 2026-11-03:
 * "pending sections just like the mobile app V1"). Every call is the SAME
 * endpoint the app uses (`wish_repository`, `live_stream_repository`,
 * `social_link_repository`), so a change here shows on the phone and back.
 */

const key = (eventId: number, ...rest: (string | number)[]) =>
    ['client', 'event-module', eventId, ...rest] as const;

function report(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.isAuthError) {
        toast.error('Your session has expired. Please sign in again.');
        return;
    }
    toast.error(error instanceof Error ? error.message : fallback);
}

function useRefresh(eventId: number, part: string) {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: key(eventId, part), refetchType: 'all' });
}

/** Upload one file to a module's upload route; returns the stored URL. */
async function uploadFile(path: string, file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<{ url: string }>(path, form);
    return res.url;
}

/* ── Wed Wishes ───────────────────────────────────────────────────────────── */

export type WishStatus = 'visible' | 'hidden' | 'blocked';
export type WishAudience = 'groom' | 'bride' | 'both';

export interface Wish {
    id: number;
    event_id: number;
    post_type: 'text' | 'image' | 'video';
    audience: WishAudience;
    guest_name: string;
    mobile: string | null;
    message: string;
    photo: string | null;
    video_url: string | null;
    thumbnail_url: string | null;
    duration_seconds: number | null;
    avatar: string | null;
    like_count: number;
    liked_by_me: boolean;
    is_hidden: boolean;
    is_flagged: boolean;
    status: WishStatus;
    added_by_organizer: boolean;
    author_blocked: boolean;
    participant_id: number | null;
    is_mine: boolean;
    can_edit: boolean;
    can_delete: boolean;
    created_at: string | null;
}

export interface WishSettings {
    allow_new: boolean;
    allow_photo: boolean;
    details_screen: boolean;
    profile_photo: boolean;
    name: boolean;
    wish_photo: boolean;
    time: boolean;
}

export interface WishesPage {
    wishes: Wish[];
    settings: WishSettings;
    can_manage: boolean;
    can_write: boolean;
    counts?: { all: number; visible: number; hidden: number; blocked: number; blocked_users: number; flagged: number };
}

export interface WishFilter {
    enabled: boolean;
    words: { word: string; replace: string }[];
    auto_hide: boolean;
    notify: boolean;
}

export function useEventWishes(eventId: number) {
    return useQuery({
        queryKey: key(eventId, 'wishes'),
        queryFn: () => api.get<WishesPage>(`/client/events/${eventId}/wishes`),
        retry: false,
    });
}

/** New post (organizer): text, or with one image / video in the same request. */
export function useCreateWish(eventId: number) {
    const refresh = useRefresh(eventId, 'wishes');
    return useMutation({
        mutationFn: ({ message, audience, guestName, file }: {
            message: string; audience: WishAudience; guestName?: string; file?: File | null;
        }) => {
            if (!file) {
                return api.post(`/client/events/${eventId}/wishes`, {
                    message, audience, ...(guestName ? { guest_name: guestName } : {}),
                });
            }
            const form = new FormData();
            form.append('file', file);
            form.append('message', message);
            form.append('audience', audience);
            if (guestName) form.append('guest_name', guestName);
            return api.post(`/client/events/${eventId}/wishes`, form);
        },
        onSuccess: () => { toast.success('Post added'); refresh(); },
        onError: (e) => report(e, 'Could not add this post'),
    });
}

/** Edit text / audience, hide / show, mark a flagged post reviewed. */
export function useUpdateWish(eventId: number) {
    const refresh = useRefresh(eventId, 'wishes');
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Record<string, unknown>; done?: string }) =>
            api.put(`/client/wishes/${id}`, data),
        onSuccess: (_r, v) => { if (v.done) toast.success(v.done); refresh(); },
        onError: (e) => report(e, 'Could not update this post'),
    });
}

export function useDeleteWish(eventId: number) {
    const refresh = useRefresh(eventId, 'wishes');
    return useMutation({
        mutationFn: (id: number) => api.del(`/client/wishes/${id}`),
        onSuccess: () => { toast.success('Post deleted'); refresh(); },
        onError: (e) => report(e, 'Could not delete this post'),
    });
}

/** Block / unblock the participant who wrote a post from Wed Wishes. */
export function useBlockWishWriter(eventId: number) {
    const refresh = useRefresh(eventId, 'wishes');
    return useMutation({
        mutationFn: ({ id, blocked }: { id: number; blocked: boolean }) =>
            blocked ? api.post(`/client/wishes/${id}/block`) : api.del(`/client/wishes/${id}/block`),
        onSuccess: (_r, v) => { toast.success(v.blocked ? 'Participant blocked from Wed Wishes' : 'Participant unblocked'); refresh(); },
        onError: (e) => report(e, 'Could not change the block'),
    });
}

/** One in-app message to a post's writer (no chat) — the app's "Message". */
export function useMessageWishWriter(eventId: number) {
    return useMutation({
        mutationFn: ({ participantId, message }: { participantId: number; message: string }) =>
            api.post(`/client/events/${eventId}/notifications`, {
                action: 'send',
                title: 'Message from the organizer',
                message,
                audience: 'specific',
                participant_ids: [participantId],
                channels: ['in_app'],
            }),
        onSuccess: () => toast.success('Message sent'),
        onError: (e) => report(e, 'Could not send the message'),
    });
}

export function useSaveWishSettings(eventId: number) {
    const refresh = useRefresh(eventId, 'wishes');
    return useMutation({
        mutationFn: (settings: WishSettings) =>
            api.put(`/client/events/${eventId}/wish-settings`, { ...settings, name: true }),
        onSuccess: () => { toast.success('Wish settings saved'); refresh(); },
        onError: (e) => report(e, 'Could not save the settings'),
    });
}

export function useWishFilter(eventId: number, enabled = true) {
    return useQuery({
        queryKey: key(eventId, 'wish-filter'),
        queryFn: async () => (await api.get<{ filter: WishFilter }>(`/client/events/${eventId}/wish-filter`)).filter,
        enabled,
        retry: false,
    });
}

export function useSaveWishFilter(eventId: number) {
    const refreshFilter = useRefresh(eventId, 'wish-filter');
    const refreshWishes = useRefresh(eventId, 'wishes');
    return useMutation({
        mutationFn: (filter: WishFilter) => api.put(`/client/events/${eventId}/wish-filter`, filter),
        onSuccess: () => { toast.success('Content filter saved'); refreshFilter(); refreshWishes(); },
        onError: (e) => report(e, 'Could not save the content filter'),
    });
}

/* ── Live Streaming ───────────────────────────────────────────────────────── */

export const LIVE_PLATFORMS = [
    { key: 'youtube', label: 'YouTube', color: '#FF0000' },
    { key: 'facebook', label: 'Facebook', color: '#1877F2' },
    { key: 'instagram', label: 'Instagram', color: '#E1306C' },
    { key: 'zoom', label: 'Zoom', color: '#2D8CFF' },
    { key: 'google_meet', label: 'Google Meet', color: '#00897B' },
    { key: 'other', label: 'Other', color: '#6B7280' },
] as const;
export type LivePlatform = (typeof LIVE_PLATFORMS)[number]['key'];

export interface LiveStreamType {
    id: number;
    name: string;
    description: string | null;
    cover_url: string | null;
    sort_order: number;
    stream_count: number;
    enabled_count: number;
}

export interface LiveStream {
    id: number;
    event_id: number;
    type_id: number | null;
    type_name: string | null;
    title: string;
    platform: LivePlatform;
    stream_url: string;
    stream_date: string;
    stream_time: string;
    description: string | null;
    cover_image: string | null;
    is_enabled: boolean;
}

export interface LiveTypesPage {
    types: LiveStreamType[];
    can_edit: boolean;
    event_start_date: string | null;
    event_end_date: string | null;
    menu_id: number | null;
    is_default: boolean;
    show_in_app: boolean;
}

export interface LiveStreamsPage {
    streams: LiveStream[];
    types: LiveStreamType[];
    counts: { total: number; enabled: number; disabled: number };
    can_edit: boolean;
}

export function useLiveTypes(eventId: number) {
    return useQuery({
        queryKey: key(eventId, 'live', 'types'),
        queryFn: () => api.get<LiveTypesPage>(`/client/events/${eventId}/live-stream-types`),
        retry: false,
    });
}

/** Every stream of the event (the app's Live Streaming screen). */
export function useLiveStreams(eventId: number) {
    return useQuery({
        queryKey: key(eventId, 'live', 'streams'),
        queryFn: () => api.get<LiveStreamsPage>(`/client/events/${eventId}/live-streams`),
        retry: false,
    });
}

export function useSaveLiveType(eventId: number) {
    const refresh = useRefresh(eventId, 'live');
    return useMutation({
        mutationFn: ({ id, name, description }: { id?: number; name: string; description: string | null }) => (id
            ? api.put(`/client/live-stream-types/${id}`, { name, description })
            : api.post(`/client/events/${eventId}/live-stream-types`, { name, description })),
        onSuccess: (_r, v) => { toast.success(v.id ? 'Category updated' : 'Category added'); refresh(); },
        onError: (e) => report(e, 'Could not save this category'),
    });
}

export function useDeleteLiveType(eventId: number) {
    const refresh = useRefresh(eventId, 'live');
    return useMutation({
        mutationFn: (id: number) => api.del<{ streams_removed: number }>(`/client/live-stream-types/${id}`),
        onSuccess: () => { toast.success('Category deleted'); refresh(); },
        onError: (e) => report(e, 'Could not delete this category'),
    });
}

export function useReorderLiveTypes(eventId: number) {
    const refresh = useRefresh(eventId, 'live');
    return useMutation({
        mutationFn: (ids: number[]) => api.put(`/client/events/${eventId}/live-stream-types/reorder`, { ids }),
        onSuccess: refresh,
        onError: (e) => report(e, 'Could not change the order'),
    });
}

export function useSaveLiveStream(eventId: number) {
    const refresh = useRefresh(eventId, 'live');
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: Record<string, unknown>; quiet?: boolean }) => (id
            ? api.put(`/client/live-streams/${id}`, data)
            : api.post(`/client/events/${eventId}/live-streams`, data)),
        onSuccess: (_r, v) => {
            if (!v.quiet) toast.success(v.id ? 'Live stream updated' : 'Live stream added');
            refresh();
        },
        onError: (e) => report(e, 'Could not save this live stream'),
    });
}

export function useDeleteLiveStream(eventId: number) {
    const refresh = useRefresh(eventId, 'live');
    return useMutation({
        mutationFn: (id: number) => api.del(`/client/live-streams/${id}`),
        onSuccess: () => { toast.success('Live stream deleted'); refresh(); },
        onError: (e) => report(e, 'Could not delete this live stream'),
    });
}

export const uploadLiveCover = (eventId: number, file: File) =>
    uploadFile(`/client/events/${eventId}/live-streams/cover`, file);

/* ── Social Links ─────────────────────────────────────────────────────────── */

export const SOCIAL_PRESETS = {
    instagram: { label: 'Instagram', color: '#E1306C' },
    facebook: { label: 'Facebook', color: '#1877F2' },
    x: { label: 'X', color: '#111111' },
    youtube: { label: 'YouTube', color: '#FF0000' },
} as const;
export type SocialPresetKey = keyof typeof SOCIAL_PRESETS;

export interface SocialLink {
    id: number;
    event_id: number;
    /** Set for the four preset rows; null = a custom link. */
    platform_key: SocialPresetKey | null;
    platform_name: string;
    title: string;
    url: string | null;
    description: string | null;
    icon_url: string | null;
    sort_order: number;
    open_external: boolean;
    show_in_app: boolean;
    created_at: string | null;
    updated_at: string | null;
}

export interface SocialLinksPage {
    links: SocialLink[];
    can_edit: boolean;
    icon_size: number;
    menu_id: number | null;
    is_default: boolean;
    show_in_app: boolean;
}

export function useSocialLinks(eventId: number) {
    return useQuery({
        queryKey: key(eventId, 'social'),
        queryFn: () => api.get<SocialLinksPage>(`/client/events/${eventId}/social-links`),
        retry: false,
    });
}

export function useSaveSocialLink(eventId: number) {
    const refresh = useRefresh(eventId, 'social');
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: Record<string, unknown>; quiet?: boolean }) => (id
            ? api.put(`/client/social-links/${id}`, data)
            : api.post(`/client/events/${eventId}/social-links`, data)),
        onSuccess: (_r, v) => {
            if (!v.quiet) toast.success(v.id ? 'Social link updated' : 'Social link added');
            refresh();
        },
        onError: (e) => report(e, 'Could not save this social link'),
    });
}

/** Custom: deleted. Preset: its link is cleared, the row stays. */
export function useDeleteSocialLink(eventId: number) {
    const refresh = useRefresh(eventId, 'social');
    return useMutation({
        mutationFn: ({ id }: { id: number; preset: boolean }) => api.del(`/client/social-links/${id}`),
        onSuccess: (_r, v) => { toast.success(v.preset ? 'Link removed' : 'Social link deleted'); refresh(); },
        onError: (e) => report(e, 'Could not delete this social link'),
    });
}

export function useReorderSocialLinks(eventId: number) {
    const refresh = useRefresh(eventId, 'social');
    return useMutation({
        mutationFn: (ids: number[]) => api.put(`/client/events/${eventId}/social-links/reorder`, { ids }),
        onSuccess: refresh,
        onError: (e) => report(e, 'Could not change the order'),
    });
}

export const uploadSocialIcon = (eventId: number, file: File) =>
    uploadFile(`/client/events/${eventId}/social-links/icon`, file);
