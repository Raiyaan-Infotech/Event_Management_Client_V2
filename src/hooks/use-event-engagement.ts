'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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
    /** The writer's relationship / Bride-Groom side from their participant row (2026-11-10). */
    relationship?: string | null;
    side?: 'bride' | 'groom' | null;
    mobile: string | null;
    message: string;
    photo: string | null;
    video_url: string | null;
    thumbnail_url: string | null;
    duration_seconds: number | null;
    /** The media's stored size (organizer / writer). */
    size_bytes?: number | null;
    avatar: string | null;
    like_count: number;
    liked_by_me: boolean;
    is_hidden: boolean;
    is_flagged: boolean;
    /** New comments allowed on this wish (2026-11-09). */
    allow_comments?: boolean;
    /** A participant's wish the organizer changed — shown as "Edited by organizer" (2026-11-09). */
    edited_by_organizer?: boolean;
    status: WishStatus;
    added_by_organizer: boolean;
    author_blocked: boolean;
    /** Organizer only: why the writer is blocked (2026-11-09). */
    author_block?: { reason: BlockReason | null; note: string | null; blocked_at?: string | null } | null;
    /** Comments under it (2026-11-09). */
    comment_count?: number;
    /** Organizer only: how many participants reported it. */
    report_count?: number;
    participant_id: number | null;
    is_mine: boolean;
    can_edit: boolean;
    can_delete: boolean;
    created_at: string | null;
    /** Organizer only (2026-11-09): the conversation — `c:<writer's client id>` or `org` (organizer posts). */
    thread_key?: string | null;
    /** Organizer only: the conversation replies under it (organizer + the writer), oldest first. */
    replies?: WishComment[];
}

/** Organizer only: one conversation's Unread count and Online dot. */
export interface WishThreadInfo {
    unread: number; online: boolean; last_read_at: string | null;
    /** Hide Chat: out of the main inbox (the Hidden tab). */
    hidden?: boolean; hide_note?: string | null;
    /** When the participant last used the app (null = never) — "last seen" in the chat header. */
    last_seen_at?: string | null;
}

export interface WishSettings {
    allow_new: boolean;
    allow_photo: boolean;
    details_screen: boolean;
    profile_photo: boolean;
    name: boolean;
    wish_photo: boolean;
    time: boolean;
    /** Participants may comment (2026-11-09). */
    allow_comments?: boolean;
    /** Participants see like counts (2026-11-09). */
    show_likes?: boolean;
    /** 2026-11-10 (optional: an older backend does not send them). */
    allow_text?: boolean;
    allow_video?: boolean;
    relationship?: boolean;
    side?: boolean;
    audience?: boolean;
    notify_new?: boolean;
    hide_blocked?: boolean;
}

export type BlockReason = 'inappropriate' | 'spam' | 'harassment' | 'other';
export type WordAction = 'replace' | 'hold' | 'hide';

export interface WishComment {
    id: number;
    wish_id: number;
    guest_name: string;
    message: string;
    /** An attached image — the organizer's photo reply (2026-11-09). */
    photo?: string | null;
    author_client_id?: number | null;
    is_hidden: boolean;
    status: 'visible' | 'hidden';
    is_flagged: boolean;
    added_by_organizer: boolean;
    is_mine: boolean;
    can_edit: boolean;
    can_delete: boolean;
    created_at: string | null;
}

export interface WishReport { id: number; reporter_name: string; reason: BlockReason; note: string | null; created_at: string | null }

export interface WishesPage {
    wishes: Wish[];
    settings: WishSettings;
    can_manage: boolean;
    can_write: boolean;
    counts?: { all: number; visible: number; hidden: number; blocked: number; blocked_users: number; flagged: number; reported?: number };
    /** Organizer only (2026-11-09): per conversation key. */
    threads?: Record<string, WishThreadInfo>;
}

export interface WishFilter {
    enabled: boolean;
    /** `action` (2026-11-09): replace = masked only · hold = hidden until reviewed · hide = hidden. */
    words: { word: string; replace: string; action?: WordAction }[];
    auto_hide: boolean;
    notify: boolean;
}

export function useEventWishes(eventId: number) {
    return useQuery({
        queryKey: key(eventId, 'wishes'),
        queryFn: () => api.get<WishesPage>(`/client/events/${eventId}/wishes`),
        retry: false,
        // The chat keeps itself fresh: new wishes, unread counts and Online / last seen (only while the tab is open).
        refetchInterval: 30_000,
    });
}

/** New post (organizer): text, or with one image / video in the same request. */
export function useCreateWish(eventId: number) {
    const refresh = useRefresh(eventId, 'wishes');
    return useMutation({
        mutationFn: ({ message, audience, guestName, file }: {
            message: string; audience: WishAudience; guestName?: string; file?: File | null;
        }): Promise<{ wish?: Wish }> => {
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

/** Put a new image / video on a post (organizer's own post) — `POST /wishes/:id/media`. */
export function useReplaceWishMedia(eventId: number) {
    const refresh = useRefresh(eventId, 'wishes');
    return useMutation({
        mutationFn: ({ id, file }: { id: number; file: File }) => {
            const form = new FormData();
            form.append('file', file);
            return api.post(`/client/wishes/${id}/media`, form);
        },
        onSuccess: () => refresh(),
        onError: (e) => report(e, 'Could not change the photo / video'),
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
        mutationFn: ({ id, blocked, reason, note }: { id: number; blocked: boolean; reason?: BlockReason; note?: string }) =>
            blocked ? api.post(`/client/wishes/${id}/block`, { reason, note }) : api.del(`/client/wishes/${id}/block`),
        onSuccess: (_r, v) => { toast.success(v.blocked ? 'Participant blocked from Wed Wishes' : 'Participant unblocked'); refresh(); },
        onError: (e) => report(e, 'Could not change the block'),
    });
}

/** One in-app message to a post's writer (no chat) — the app's "Message". */
export function useMessageWishWriter(eventId: number) {
    return useMutation({
        mutationFn: ({ participantId, message, title }: { participantId: number; message: string; title?: string }) =>
            api.post(`/client/events/${eventId}/notifications`, {
                action: 'send',
                title: title?.trim() || 'Message from the organizer',
                message,
                audience: 'specific',
                participant_ids: [participantId],
                channels: ['in_app'],
            }),
        onSuccess: () => toast.success('Notification sent'),
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

/* ── Wish comments + reports (2026-11-09) ─────────────────────────────────── */

export function useWishComments(eventId: number, wishId: number | null) {
    return useQuery({
        queryKey: [...key(eventId, 'wishes'), 'comments', wishId],
        queryFn: async () => (await api.get<{ comments: WishComment[] }>(`/client/wishes/${wishId}/comments`)).comments,
        enabled: !!wishId,
        retry: false,
    });
}

/** Every comment on several wishes (Participant Details → Comments); same cache as useWishComments. */
export function useWishCommentsMany(eventId: number, wishIds: number[]) {
    return useQueries({
        queries: wishIds.map((wishId) => ({
            queryKey: [...key(eventId, 'wishes'), 'comments', wishId],
            queryFn: async () => (await api.get<{ comments: WishComment[] }>(`/client/wishes/${wishId}/comments`)).comments,
            retry: false,
        })),
        combine: (results) => ({
            byWish: new Map(wishIds.map((id, i) => [id, results[i]?.data ?? []] as const)),
            isLoading: results.some((r) => r.isLoading),
        }),
    });
}

/** Add (organizer), edit own / hide / show / review, delete — each refreshes the comments and the list's counts. */
export function useWishCommentActions(eventId: number) {
    const refresh = useRefresh(eventId, 'wishes');
    const done = (msg?: string) => () => { if (msg) toast.success(msg); refresh(); };
    return {
        add: useMutation({
            mutationFn: ({ wishId, message, file }: { wishId: number; message: string; file?: File | null; quiet?: boolean }) => {
                if (!file) return api.post(`/client/wishes/${wishId}/comments`, { message });
                const form = new FormData();
                form.append('file', file);
                form.append('message', message);
                return api.post(`/client/wishes/${wishId}/comments`, form);
            },
            onSuccess: (_r, v) => { if (!v.quiet) toast.success('Comment added'); refresh(); },
            onError: (e) => report(e, 'Could not add the comment'),
        }),
        update: useMutation({
            mutationFn: ({ id, data }: { id: number; data: Record<string, unknown>; done?: string }) => api.put(`/client/wish-comments/${id}`, data),
            onSuccess: (_r, v) => { if (v.done) toast.success(v.done); refresh(); },
            onError: (e) => report(e, 'Could not update the comment'),
        }),
        remove: useMutation({
            mutationFn: (id: number) => api.del(`/client/wish-comments/${id}`),
            onSuccess: done('Comment deleted'),
            onError: (e) => report(e, 'Could not delete the comment'),
        }),
    };
}

/** The organizer opened a conversation — its Unread count goes to 0 (2026-11-09). */
export function useMarkWishThreadRead(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (thread: string) => api.post(`/client/events/${eventId}/wish-threads/read`, { thread }),
        onSuccess: (_r, thread) => {
            // Clear it in the cached list straight away; no refetch needed.
            qc.setQueryData<WishesPage>(key(eventId, 'wishes'), (old) => (old?.threads?.[thread]
                ? { ...old, threads: { ...old.threads, [thread]: { ...old.threads[thread], unread: 0 } } }
                : old));
        },
    });
}

/** Hide Chat / Show Chat — the organizer's inbox only (2026-11-09). */
export function useHideWishThread(eventId: number) {
    const refresh = useRefresh(eventId, 'wishes');
    return useMutation({
        mutationFn: ({ thread, hidden, note }: { thread: string; hidden: boolean; note?: string }) =>
            api.post(`/client/events/${eventId}/wish-threads/hide`, { thread, hidden, note }),
        onSuccess: (_r, v) => { toast.success(v.hidden ? 'Chat hidden' : 'Chat moved back to the inbox'); refresh(); },
        onError: (e) => report(e, 'Could not change the chat'),
    });
}

export function useWishReports(eventId: number, wishId: number | null, enabled = true) {
    return useQuery({
        queryKey: [...key(eventId, 'wishes'), 'reports', wishId],
        queryFn: async () => (await api.get<{ reports: WishReport[] }>(`/client/wishes/${wishId}/reports`)).reports,
        enabled: !!wishId && enabled,
        retry: false,
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

/** A platform of "Add Social Link" — from the backend's social_platforms table (2026-11-10). */
export interface SocialPlatform {
    key: string;
    name: string;
    /** Iconify id, e.g. "mdi:instagram". */
    icon: string;
    color: string | null;
    url_placeholder: string | null;
    /** Others: saved without a platform key; the organizer names it. */
    is_custom: boolean;
}

export interface SocialLink {
    id: number;
    event_id: number;
    /** A social_platforms key (instagram / whatsapp / …); null = a custom (Others) link. */
    platform_key: string | null;
    /** The four rows every event has: Remove clears them instead of deleting. */
    is_preset?: boolean;
    platform_icon?: string | null;
    platform_color?: string | null;
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
    /** The platforms to pick from (older backends: missing). */
    platforms?: SocialPlatform[];
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

/* ── Downloads ────────────────────────────────────────────────────────────── */

/** A category chip of "Add Download" — from the backend's download_categories table (2026-11-10). */
export interface DownloadCategory { key: string; name: string; color: string | null }

export type DownloadVisibility = 'all' | 'bride' | 'groom';
export type DownloadAccess = 'all' | 'confirmed';

export interface EventDownload {
    id: number;
    event_id: number;
    title: string;
    category_key: string;
    /** Null for a participant who may not open it. */
    file_url: string | null;
    file_name: string;
    /** PDF / DOCX / JPG … */
    file_type: string;
    file_size: number;
    description: string | null;
    visibility: DownloadVisibility;
    download_access: DownloadAccess;
    expires_at: string | null;
    expired: boolean;
    show_in_app: boolean;
    can_download: boolean;
    download_count?: number;
    sort_order: number;
    created_at: string | null;
    updated_at: string | null;
}

export interface DownloadsPage {
    downloads: EventDownload[];
    categories: DownloadCategory[];
    counts?: { total: number; visible: number; hidden: number; downloads: number };
    max_file_bytes: number;
    file_types: string[];
    can_edit: boolean;
}

export interface UploadedDownloadFile { url: string; file_name: string; file_type: string; file_size: number }

export function useDownloads(eventId: number) {
    return useQuery({
        queryKey: key(eventId, 'downloads'),
        queryFn: () => api.get<DownloadsPage>(`/client/events/${eventId}/downloads`),
        retry: false,
    });
}

export function useSaveDownload(eventId: number) {
    const refresh = useRefresh(eventId, 'downloads');
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: Record<string, unknown>; quiet?: boolean }) => (id
            ? api.put(`/client/downloads/${id}`, data)
            : api.post(`/client/events/${eventId}/downloads`, data)),
        onSuccess: (_r, v) => {
            if (!v.quiet) toast.success(v.id ? 'Download updated' : 'Download added');
            refresh();
        },
        onError: (e) => report(e, 'Could not save this download'),
    });
}

export function useDeleteDownload(eventId: number) {
    const refresh = useRefresh(eventId, 'downloads');
    return useMutation({
        mutationFn: (id: number) => api.del(`/client/downloads/${id}`),
        onSuccess: () => { toast.success('Download deleted'); refresh(); },
        onError: (e) => report(e, 'Could not delete this download'),
    });
}

/** Upload the file first; the download is then saved with what comes back. */
export async function uploadDownloadFile(eventId: number, file: File): Promise<UploadedDownloadFile> {
    const form = new FormData();
    form.append('file', file);
    return api.post<UploadedDownloadFile>(`/client/events/${eventId}/downloads/file`, form);
}
