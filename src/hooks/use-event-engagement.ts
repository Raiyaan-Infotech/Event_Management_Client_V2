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
    { key: 'youtube', label: 'YouTube Live', short: 'YouTube', color: '#FF0000' },
    { key: 'facebook', label: 'Facebook Live', short: 'Facebook', color: '#1877F2' },
    { key: 'instagram', label: 'Instagram Live', short: 'Instagram', color: '#E1306C' },
    { key: 'zoom', label: 'Zoom', short: 'Zoom', color: '#2D8CFF' },
    { key: 'google_meet', label: 'Google Meet', short: 'Google Meet', color: '#00897B' },
    { key: 'teams', label: 'Microsoft Teams', short: 'Teams', color: '#5059C9' },
    { key: 'custom_rtmp', label: 'Custom RTMP', short: 'Custom RTMP', color: '#DB2777' },
    { key: 'embedded', label: 'Embedded Player', short: 'Embedded', color: '#475569' },
    { key: 'other', label: 'Other Platform', short: 'Other', color: '#6B7280' },
] as const;
export type LivePlatform = (typeof LIVE_PLATFORMS)[number]['key'];

/** Who can watch a stream (Jamal's Visibility dropdown, 2026-11-11). */
export const LIVE_VISIBILITIES = [
    { key: 'public', label: 'Public', hint: 'Visible to everyone (including non-invited users)' },
    { key: 'participants', label: 'Participants Only', hint: 'Visible only to event participants' },
    { key: 'guests', label: 'Guests Only', hint: 'Visible only to invited guests (RSVPed or not)' },
    { key: 'invite_link', label: 'Invite Link Only', hint: 'Visible only to people with the stream link' },
    { key: 'unlisted', label: 'Unlisted', hint: 'Hidden from listings, accessible via direct link' },
    { key: 'private', label: 'Private / Organizer Only', hint: 'Visible only to event organizers and co-organizers' },
] as const;
export type LiveVisibility = (typeof LIVE_VISIBILITIES)[number]['key'];
export type LiveStatus = 'scheduled' | 'live' | 'ended';

export interface LiveStreamType {
    id: number;
    name: string;
    description: string | null;
    cover_url: string | null;
    is_active: boolean;
    default_visibility: LiveVisibility;
    notes: string | null;
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
    rtmp_url: string | null;
    visibility: LiveVisibility;
    stream_date: string;
    stream_time: string;
    end_time: string | null;
    /** What is shown: Go Live / End Stream, else worked out from the schedule. */
    status: LiveStatus;
    /** What the organizer set. */
    set_status: LiveStatus;
    started_at: string | null;
    ended_at: string | null;
    description: string | null;
    notes: string | null;
    cover_image: string | null;
    is_enabled: boolean;
    auto_go_live: boolean;
    notify_participants: boolean;
    views_count: number;
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
    counts: { total: number; live: number; scheduled: number; ended: number; enabled: number; disabled: number };
    can_edit: boolean;
}

export function useLiveTypes(eventId: number) {
    return useQuery({
        queryKey: key(eventId, 'live', 'types'),
        queryFn: () => api.get<LiveTypesPage>(`/client/events/${eventId}/live-stream-types`),
        retry: false,
    });
}

/** Every stream of the event. Re-read each minute: a stream turns Live / Ended by the clock. */
export function useLiveStreams(eventId: number) {
    return useQuery({
        queryKey: key(eventId, 'live', 'streams'),
        queryFn: () => api.get<LiveStreamsPage>(`/client/events/${eventId}/live-streams`),
        retry: false,
        refetchInterval: 60_000,
    });
}

/** One stream with its viewer numbers (View Live Stream). */
export function useLiveStream(eventId: number, streamId: number | null) {
    return useQuery({
        queryKey: [...key(eventId, 'live', 'streams'), 'one', streamId],
        queryFn: () => api.get<{ stream: LiveStream; stats: { total_views: number; unique_viewers: number } }>(`/client/live-streams/${streamId}`),
        enabled: !!streamId,
        retry: false,
        refetchInterval: 30_000,
    });
}

export function useSaveLiveType(eventId: number) {
    const refresh = useRefresh(eventId, 'live');
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: Record<string, unknown> }) => (id
            ? api.put(`/client/live-stream-types/${id}`, data)
            : api.post(`/client/events/${eventId}/live-stream-types`, data)),
        onSuccess: (_r, v) => { toast.success(v.id ? 'Category updated' : 'Category created'); refresh(); },
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

export function useSaveLiveStream(eventId: number) {
    const refresh = useRefresh(eventId, 'live');
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: Record<string, unknown>; quiet?: boolean }) => (id
            ? api.put(`/client/live-streams/${id}`, data)
            : api.post(`/client/events/${eventId}/live-streams`, data)),
        onSuccess: (_r, v) => {
            if (!v.quiet) toast.success(v.id ? 'Live stream updated' : 'Live stream created');
            refresh();
        },
        onError: (e) => report(e, 'Could not save this live stream'),
    });
}

const LIVE_STATUS_DONE: Record<LiveStatus, string> = {
    live: 'The stream is live', ended: 'Live stream ended', scheduled: 'Live stream set back to scheduled',
};

/** Go Live / End Stream. */
export function useSetLiveStatus(eventId: number) {
    const refresh = useRefresh(eventId, 'live');
    return useMutation({
        mutationFn: ({ id, status }: { id: number; status: LiveStatus }) => api.patch(`/client/live-streams/${id}/status`, { status }),
        onSuccess: (_r, v) => { toast.success(LIVE_STATUS_DONE[v.status]); refresh(); },
        onError: (e) => report(e, 'Could not change the stream status'),
    });
}

export function useDuplicateLiveStream(eventId: number) {
    const refresh = useRefresh(eventId, 'live');
    return useMutation({
        mutationFn: (id: number) => api.post(`/client/live-streams/${id}/duplicate`, {}),
        onSuccess: () => { toast.success('Live stream duplicated'); refresh(); },
        onError: (e) => report(e, 'Could not duplicate this live stream'),
    });
}

/** Share to Participants: an in-app notification to every app participant. */
export function useShareLiveStream() {
    return useMutation({
        mutationFn: (id: number) => api.post<{ sent: number }>(`/client/live-streams/${id}/share`, {}),
        onSuccess: (r) => {
            if (r.sent) toast.success(`Sent to ${r.sent} participant${r.sent === 1 ? '' : 's'}`);
            else toast.message('No participants use the app for this event yet');
        },
        onError: (e) => report(e, 'Could not share the stream'),
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

/* ── Near By places ───────────────────────────────────────────────────────── */

/** A category tile of "Add Nearby Place" — from the backend's nearby_categories table (2026-11-10). */
export interface NearbyCategory { key: string; name: string; icon: string; color: string | null; searchable: boolean }

export interface NearbyPlace {
    id: number;
    event_id: number;
    google_place_id: string | null;
    name: string;
    description: string | null;
    category_key: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    distance_km: number | null;
    rating: number | null;
    rating_count: number | null;
    map_url: string | null;
    photo_url: string | null;
    show_in_app: boolean;
    sort_order: number;
    created_at: string | null;
    updated_at: string | null;
}

export interface NearbyVenue {
    name: string | null; address: string | null; lat: number | null; lng: number | null; has_location: boolean;
    /** Where the point came from: the venue pin, the venue's map link, or its address found on Google. */
    source?: 'pin' | 'map_link' | 'address' | null;
}

export interface NearbyPlacesPage {
    places: NearbyPlace[];
    categories: NearbyCategory[];
    venue: NearbyVenue;
    counts?: { total: number; visible: number; hidden: number };
    options?: { radii_km: number[]; default_radius_km: number; sorts: string[] };
    can_edit: boolean;
}

/** One Google Maps suggestion (not saved yet). */
export interface NearbySuggestion {
    google_place_id: string;
    name: string;
    category_key: string;
    address: string | null;
    lat: number;
    lng: number;
    distance_km: number;
    rating: number | null;
    rating_count: number | null;
    map_url: string;
    photo_uri: string | null;
    already_added: boolean;
}

export function useNearbyPlaces(eventId: number) {
    return useQuery({
        queryKey: key(eventId, 'nearby-places'),
        queryFn: () => api.get<NearbyPlacesPage>(`/client/events/${eventId}/nearby-places`),
        retry: false,
    });
}

/** Google Maps suggestions; runs only when there is something to search. */
export function useNearbySuggestions(
    eventId: number,
    params: { q: string; categories: string[]; radius_km: number; sort: string },
    enabled: boolean,
) {
    const qs = new URLSearchParams({
        q: params.q, categories: params.categories.join(','), radius_km: String(params.radius_km), sort: params.sort,
    }).toString();
    return useQuery({
        queryKey: key(eventId, 'nearby-places', 'suggestions', qs),
        queryFn: () => api.get<{ suggestions: NearbySuggestion[] }>(`/client/events/${eventId}/nearby-places/suggestions?${qs}`),
        enabled: enabled && (!!params.q.trim() || params.categories.length > 0),
        retry: false,
        staleTime: 5 * 60 * 1000,
    });
}

export function useAddNearbyPlaces(eventId: number) {
    const refresh = useRefresh(eventId, 'nearby-places');
    return useMutation({
        mutationFn: (places: NearbySuggestion[]) => api.post<{ added: number }>(`/client/events/${eventId}/nearby-places`, { places }),
        onSuccess: (r) => { toast.success(r.added === 1 ? 'Nearby place added' : `${r.added} nearby places added`); refresh(); },
        onError: (e) => report(e, 'Could not save the nearby places'),
    });
}

export function useUpdateNearbyPlace(eventId: number) {
    const refresh = useRefresh(eventId, 'nearby-places');
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => api.put(`/client/nearby-places/${id}`, data),
        onSuccess: () => { toast.success('Nearby place updated'); refresh(); },
        onError: (e) => report(e, 'Could not update this place'),
    });
}

export function useDeleteNearbyPlace(eventId: number) {
    const refresh = useRefresh(eventId, 'nearby-places');
    return useMutation({
        mutationFn: (id: number) => api.del(`/client/nearby-places/${id}`),
        onSuccess: () => { toast.success('Nearby place deleted'); refresh(); },
        onError: (e) => report(e, 'Could not delete this place'),
    });
}

export function useReorderNearbyPlaces(eventId: number) {
    const refresh = useRefresh(eventId, 'nearby-places');
    return useMutation({
        mutationFn: (ids: number[]) => api.put(`/client/events/${eventId}/nearby-places/reorder`, { ids }),
        onSuccess: refresh,
        onError: (e) => report(e, 'Could not change the order'),
    });
}

/* ── Contact Messages (Jamal's 8 screens, 2026-11-11) ────────────────────────
 * Participants write to the event's contact person from the app (contact_chat_repository);
 * the owner answers here. Same endpoints as the app. */

export type ContactChatStatus = 'open' | 'resolved' | 'blocked' | 'removed';
export interface ContactBlock { reason: string | null; note: string | null; duration: 'event_end' | 'permanent'; at: string | null }
export interface ContactChatRow {
    id: number;
    participant: {
        client_id: number; name: string; photo: string | null; side: 'bride' | 'groom' | null;
        relationship: string | null; online: boolean; last_seen_at: string | null;
    };
    status: ContactChatStatus;
    last_message: string | null;
    last_message_at: string | null;
    unread: number;
    awaiting: boolean;
    awaiting_since: string | null;
    inquiries: number;
    block: ContactBlock | null;
}
export interface ContactInbox {
    event: { id: number; name: string };
    chats: ContactChatRow[];
    counts: { all: number; open: number; unread: number; awaiting: number; resolved: number; blocked: number };
    stats: { total_inquiries: number; open: number; awaiting: number; resolved: number; blocked: number };
    contact: { name: string | null; photo: string | null; designation: string | null; phone: string | null; email: string | null; online: boolean };
    performance: { total_inquiries: number; resolved: number; awaiting: number; avg_reply_minutes: number | null };
    options: { resolution_types: string[]; block_reasons: string[] };
}
export interface ContactMessage {
    id: number; side: 'participant' | 'team'; mine: boolean; sender_name: string | null;
    body: string; photo: string | null; is_auto: boolean; created_at: string;
    /** Replying to: the participant message this team reply quotes. */
    reply_to: { id: number; side: 'participant' | 'team'; sender_name: string | null; body: string; photo: boolean } | null;
}
export interface ContactChatSummary { id: number; status: ContactChatStatus; awaiting: boolean; block: ContactBlock | null }
export interface ContactDetails {
    chat: ContactChatSummary;
    participant: {
        client_id: number; name: string; photo: string | null; mobile: string | null; email: string | null;
        side: 'bride' | 'groom' | null; relationship: string | null; invitation_status: string | null; rsvp: string | null;
        online: boolean; last_seen_at: string | null;
    };
    summary: { total_messages: number; inquiries: number; last_contacted: string | null; assigned_contact: string | null };
    inquiries: { id: number; first_message: string | null; opened_at: string; resolved_at: string | null; resolution_type: string | null; resolution_note: string | null }[];
    activity: { at: string; kind: 'opened' | 'resolved' | 'removed' | 'blocked'; text: string }[];
}
export interface ContactRecipient {
    client_id: number; name: string; photo: string | null; side: 'bride' | 'groom' | null;
    relationship: string | null; chat_id: number | null; chat_status: ContactChatStatus | null;
}

const contactBase = (eventId: number) => `/client/events/${eventId}/contact-chats`;

/** A message body, with the optional photo as multipart. */
function messageBody(body: string, photo?: File | null, extra: Record<string, string | number> = {}) {
    if (!photo) return { body, ...extra };
    const form = new FormData();
    form.append('body', body);
    form.append('photo', photo);
    Object.entries(extra).forEach(([k, v]) => form.append(k, String(v)));
    return form;
}

export function useContactInbox(eventId: number) {
    return useQuery({
        queryKey: key(eventId, 'contact-chats'),
        queryFn: () => api.get<ContactInbox>(contactBase(eventId)),
        refetchInterval: 15_000,
        retry: false,
    });
}

export function useContactMessages(eventId: number, chatId: number | null) {
    const refreshInbox = useRefresh(eventId, 'contact-chats');
    return useQuery({
        queryKey: key(eventId, 'contact-messages', chatId ?? 0),
        // Reading clears the unread badge — refresh the inbox after.
        queryFn: () => api.get<{ chat: ContactChatSummary; messages: ContactMessage[] }>(`${contactBase(eventId)}/${chatId}/messages`)
            .then((r) => { refreshInbox(); return r; }),
        enabled: !!chatId,
        refetchInterval: 5_000,
        retry: false,
    });
}

export function useContactDetails(eventId: number, chatId: number | null) {
    return useQuery({
        queryKey: key(eventId, 'contact-details', chatId ?? 0),
        queryFn: () => api.get<ContactDetails>(`${contactBase(eventId)}/${chatId}/details`),
        enabled: !!chatId,
        retry: false,
    });
}

export function useContactRecipients(eventId: number, enabled: boolean) {
    return useQuery({
        queryKey: key(eventId, 'contact-recipients'),
        queryFn: () => api.get<{ participants: ContactRecipient[] }>(`${contactBase(eventId)}/recipients`).then((r) => r.participants),
        enabled,
        retry: false,
    });
}

/** Everything Contact shows changes together after a send / status change. */
function useContactRefresh(eventId: number) {
    const qc = useQueryClient();
    return () => ['contact-chats', 'contact-messages', 'contact-details', 'contact-recipients'].forEach((part) =>
        qc.invalidateQueries({ queryKey: key(eventId, part), refetchType: 'active' }));
}

/** Reply in a conversation (text and / or photo). */
export function useSendContactMessage(eventId: number) {
    const refresh = useContactRefresh(eventId);
    return useMutation({
        mutationFn: ({ chatId, body, photo, replyTo }: { chatId: number; body: string; photo?: File | null; replyTo?: number | null; toast?: boolean }) =>
            api.post<{ message: ContactMessage }>(`${contactBase(eventId)}/${chatId}/messages`, messageBody(body, photo, replyTo ? { reply_to_id: replyTo } : {})),
        onSuccess: (_r, v) => { if (v.toast) toast.success('Reply sent'); refresh(); },
        onError: (e) => report(e, 'Could not send the message'),
    });
}

/**
 * New Message: start (or continue) a chat with each picked participant — one request per person, in order.
 * Resolves with the chat ids that worked; throws only when none did.
 */
export function useStartContactChat(eventId: number) {
    const refresh = useContactRefresh(eventId);
    return useMutation({
        mutationFn: async ({ participantIds, body, photo }: { participantIds: number[]; body: string; photo?: File | null }) => {
            const chatIds: number[] = [];
            let failed = 0;
            let lastError: unknown = null;
            for (const id of participantIds) {
                try {
                    const r = await api.post<{ chat: ContactChatSummary; message: ContactMessage }>(contactBase(eventId), messageBody(body, photo, { participant_client_id: id }));
                    chatIds.push(r.chat.id);
                } catch (e) { failed++; lastError = e; }
            }
            if (!chatIds.length) throw lastError;
            return { chatIds, failed };
        },
        onSuccess: ({ chatIds, failed }) => {
            const n = chatIds.length;
            if (failed) toast.warning(`Message sent to ${n} — ${failed} could not be sent`);
            else toast.success(n === 1 ? 'Message sent' : `Message sent to ${n} participants`);
            refresh();
        },
        onError: (e) => { report(e, 'Could not send the message'); refresh(); },
    });
}

export type ContactStatusInput =
    | { status: 'resolved'; resolution_type: string; note?: string; notify: boolean }
    | { status: 'blocked'; reason: string; note?: string; duration: 'event_end' | 'permanent' }
    | { status: 'removed'; reason?: string; notify: boolean }
    | { status: 'open' };

const STATUS_DONE: Record<ContactStatusInput['status'], string> = {
    resolved: 'Conversation marked as resolved',
    blocked: 'Participant blocked',
    removed: 'Conversation removed',
    open: 'Conversation reopened',
};

export function useSetContactStatus(eventId: number) {
    const refresh = useContactRefresh(eventId);
    return useMutation({
        mutationFn: ({ chatId, input }: { chatId: number; input: ContactStatusInput; done?: string }) =>
            api.patch<{ chat: ContactChatSummary }>(`${contactBase(eventId)}/${chatId}`, input),
        onSuccess: (_r, v) => { toast.success(v.done ?? STATUS_DONE[v.input.status]); refresh(); },
        onError: (e) => report(e, 'Could not update this conversation'),
    });
}
