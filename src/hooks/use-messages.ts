'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, type Pagination } from '@/lib/api-client';

/**
 * Guest messaging and the notification feed.
 *
 * ── ⚠ NOTHING IS DELIVERED YET ──────────────────────────────────────────────
 * No WhatsApp, SMS or SMTP provider is configured. A send RECORDS the campaign
 * and one row per recipient and stops — the same shape the vendor newsletter
 * uses, and for the same reason: a stub that pretended to deliver would put
 * "Delivered 98.6%" on a dashboard for messages nobody received.
 *
 * Every payload carries `channels[]` with the real state and the server's own
 * reason, so the screens describe it rather than each hardcoding a sentence —
 * and they change behaviour on their own the day a provider is wired, with
 * nobody having to remember which files to revisit.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * ⚠ SMS is deliberately not offered, but it stays in the union: the column
 * still permits it, so a historical row has to remain describable. Nothing new
 * can be created on it — the server's `VALID_CHANNELS` is the gate, and the
 * composer's buttons come from `channels[]` rather than from this type.
 */
export type MessageChannel = 'whatsapp' | 'sms' | 'email' | 'push';

export interface ChannelState {
    channel: MessageChannel;
    label: string;
    enabled: boolean;
    /** Null once a provider is connected. Shown verbatim while it is not. */
    reason: string | null;
}

export interface MergeField {
    token: string;
    label: string;
    example: string;
}

export interface ComposerEvent {
    id: number;
    name: string;
    start_date: string | null;
    start_time: string | null;
    venue_name: string | null;
    venue_address?: string | null;
    status?: string;
    /**
     * How many guests that event has.
     *
     * On the payload so the picker can say which events have anybody on them —
     * "why is this list empty" should be answerable without leaving the screen.
     */
    guest_count?: number;
}

export interface ComposerGroup {
    id: number;
    name: string;
    color: string | null;
    guest_count: number;
}

export interface ComposerData {
    events: ComposerEvent[];
    selected_event: ComposerEvent | null;
    groups: ComposerGroup[];
    guest_count: number;
    /**
     * Served by the API, not listed here. A picker that offered a token the
     * renderer does not know is how a message goes out with a literal
     * "{table_no}" in it.
     */
    merge_fields: MergeField[];
    channels: ChannelState[];
}

export interface AudiencePreview {
    channel: MessageChannel;
    total_recipients: number;
    /**
     * Why the recipient count is smaller than the guest list:
     *   selected_guests − excluded_declined − unreachable = recipients
     *
     * `heads` is the number the GUESTS screen shows — it sums `party_size`, so
     * a guest bringing three counts as three. A send is one message per guest
     * ROW, so the two are never equal and both are correct. Carried here so
     * they can be reconciled without leaving the composer.
     */
    counts?: {
        selected_guests: number;
        heads: number;
        excluded_declined: number;
        unreachable: number;
        recipients: number;
    };
    breakdown: { name: string; count: number; percent: number }[];
    /**
     * Guests with no address for this channel. Named, not just counted —
     * "12 guests have no email" is only actionable if you can see which twelve.
     */
    unreachable: {
        count: number;
        reason: string | null;
        guests: { id: number; name: string }[];
    };
    preview: {
        subject: string;
        body: string;
        rendered_for: { id: number; name: string } | null;
    };
    channels: ChannelState[];
}

export interface CampaignDelivery {
    total: number;
    delivered: number;
    failed: number;
    opened: number;
    queued?: number;
    /** Null, never 0%, while nothing has been delivered — 0% reads as "failed". */
    delivered_rate?: number | null;
}

export interface Campaign {
    id: number;
    subject: string;
    body: string | null;
    channel: MessageChannel;
    channel_label: string;
    kind: string;
    audience: 'all' | 'groups' | 'guests';
    group_ids: number[] | null;
    guest_ids: number[] | null;
    recipients_count: number;
    /**
     * `sending` is what a recorded-but-undelivered campaign reads as, and that
     * is deliberate: it is genuinely mid-flight, not finished.
     */
    status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
    scheduled_at: string | null;
    sent_at: string | null;
    failed_reason: string | null;
    created_at: string;
    event: { id: number; name: string; start_date: string | null } | null;
    delivery: CampaignDelivery | null;
}

export interface CampaignList {
    campaigns: Campaign[];
    pagination: Pagination;
    /** ⚠ The whole account, never the filtered page. */
    stats: {
        total: number;
        by_channel: Record<string, {
            total: number; sent: number; delivered: number;
            failed: number; queued: number; share: number;
            /* Ours, from `opened_at` / `clicked_at` — Firebase reports neither. */
            opened: number; clicked: number;
        }>;
    };
    channels: ChannelState[];
}

/**
 * The Advanced Options screen.
 *
 * ⚠ THERE IS NO SOUND CONTROL, of any kind. A custom sound has to be compiled
 * into the app bundle, so it cannot be chosen at send time; and a Default vs
 * Silent switch, while technically deliverable, is overridden by the person's
 * own notification settings on both Android and iOS — so the portal would be
 * promising something the handset decides. Every notification uses the device
 * default, which is what the guest configured for themselves.
 */
export interface PushOptions {
    badge_enabled?: boolean;
    badge_mode?: 'increment' | 'set' | 'clear';
    badge_value?: number | null;
    priority?: 'high' | 'normal';
    ttl_seconds?: number;
    send_to_offline?: boolean;
    collapse_key?: string | null;
    content_available?: boolean;
    restricted_package_name?: string | null;
}

export interface SendPayload {
    event_id: number;
    channel: MessageChannel;
    kind?: string;
    audience: 'all' | 'groups' | 'guests';
    group_ids?: number[];
    guest_ids?: number[];
    subject?: string;
    body: string;
    exclude_unsubscribed?: boolean;
    scheduled_at?: string;
    timezone?: string;

    /* Push only. Ignored by the server on every other channel. */
    image_url?: string | null;
    click_action?: 'open_app' | 'deep_link' | 'custom';
    deep_link?: string | null;
    data_payload?: Array<{ key: string; value: string }>;
    push_options?: PushOptions;
}

export interface SendResult {
    campaign: Campaign;
    recipients: number;
    skipped: number;
    delivery: {
        attempted: boolean;
        reason: string | null;
        /* Present only for push — the one channel that really goes out. */
        delivered?: number;
        failed?: number;
    };
}

/* ── Notifications ────────────────────────────────────────────────────────── */

export type NotificationCategory = 'rsvp' | 'reminder' | 'message' | 'system' | 'guest';

export interface AppNotification {
    id: number;
    category: NotificationCategory;
    type: string;
    title: string;
    body: string | null;
    event_id: number | null;
    guest_id: number | null;
    link: string | null;
    meta: Record<string, unknown> | null;
    is_read: boolean;
    read_at: string | null;
    created_at: string;
    event: { id: number; name: string } | null;
    guest: { id: number; name: string; email: string | null; mobile: string | null } | null;
}

export interface NotificationStats {
    total: number;
    unread: number;
    reminders: number;
    guest_activity: number;
    by_category: Record<NotificationCategory, { total: number; unread: number }>;
}

export interface NotificationList {
    notifications: AppNotification[];
    pagination: Pagination;
    stats: NotificationStats;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Queries
 * ────────────────────────────────────────────────────────────────────────── */

const KEY = {
    composer: ['messages', 'composer'] as const,
    campaigns: ['messages', 'campaigns'] as const,
    notifications: ['notifications'] as const,
    unread: ['notifications', 'count'] as const,
};

export function useComposer(eventId?: number | null) {
    return useQuery({
        queryKey: [...KEY.composer, eventId ?? 'default'],
        queryFn: () => api.get<ComposerData>('/client/messages/composer', {
            event_id: eventId ?? undefined,
        }),
        staleTime: 60 * 1000,
    });
}

export interface CampaignParams {
    channel?: string;
    status?: string;
    event_id?: number;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}

export function useCampaigns(params: CampaignParams = {}) {
    return useQuery({
        queryKey: [
            ...KEY.campaigns,
            params.channel ?? 'all', params.status ?? 'all', params.event_id ?? 0,
            params.search ?? '', params.from ?? '', params.to ?? '',
            params.page ?? 1, params.limit ?? 10,
        ],
        queryFn: () => api.get<CampaignList>('/client/messages', {
            channel: params.channel,
            status: params.status,
            event_id: params.event_id,
            search: params.search || undefined,
            from: params.from || undefined,
            to: params.to || undefined,
            page: params.page,
            limit: params.limit,
        }),
        staleTime: 30 * 1000,
        // Keeps the current page on screen while the next loads, so paging and
        // typing in the search box do not blank the table.
        placeholderData: (prev) => prev,
    });
}

export function useCampaign(id: number | null) {
    return useQuery({
        queryKey: [...KEY.campaigns, 'detail', id],
        queryFn: () => api.get<{
            campaign: Campaign;
            preview: string;
            recipients: {
                id: number; status: string; sent_at: string | null;
                delivered_at: string | null; opened_at: string | null;
                failed_reason: string | null;
                guest: { id: number; name: string; email: string | null; mobile: string | null } | null;
            }[];
            channel_state: ChannelState;
        }>(`/client/messages/${id}`),
        enabled: id !== null && Number.isFinite(id),
        staleTime: 60 * 1000,
    });
}

/**
 * The review step.
 *
 * Resolved on the SERVER even though the browser has the guest list, because
 * this is the number the send itself will use. Two implementations of "who is
 * reachable" is how a review step and a send come to disagree.
 */
export function usePreviewAudience() {
    return useMutation({
        mutationFn: (body: Partial<SendPayload>) =>
            api.post<AudiencePreview>('/client/messages/preview', body),
    });
}

export function useSendMessage(onDone?: (result: SendResult) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: SendPayload) => api.post<SendResult>('/client/messages/send', body),
        onSuccess: (data) => {
            /*
              The SERVER's message, not one written here. It says "recorded"
              while nothing is delivered and "sent" once something is — the
              client reads this line and decides whether to go and check an
              inbox, so it must not be decided by the frontend.
            */
            if (data.delivery.attempted) {
                toast.success(`Message sent to ${data.recipients} guest${data.recipients === 1 ? '' : 's'}.`);
            } else {
                toast.success(
                    `Recorded for ${data.recipients} guest${data.recipients === 1 ? '' : 's'}.`,
                    { description: data.delivery.reason ?? undefined, duration: 7000 },
                );
            }
            if (data.skipped) {
                toast.warning(
                    `${data.skipped} guest${data.skipped === 1 ? ' was' : 's were'} skipped`,
                    { description: 'They have no contact details for this channel.' },
                );
            }
            for (const key of [KEY.campaigns, KEY.notifications, KEY.unread, ['guests']]) {
                qc.invalidateQueries({ queryKey: key, refetchType: 'all' });
            }
            onDone?.(data);
        },
        onError: (error) =>
            toast.error(error instanceof ApiError ? error.message : 'Could not send that message.'),
    });
}

export function useSendTest() {
    return useMutation({
        mutationFn: (body: Partial<SendPayload>) =>
            api.post<{ sent: boolean; destination: string; preview: { subject: string; body: string }; reason: string | null }>(
                '/client/messages/test', body,
            ),
        onSuccess: (data) => {
            // Never claims success it did not have. A person watching an inbox
            // that will never receive anything is the failure this avoids.
            if (data.sent) toast.success(`Test sent to ${data.destination}.`);
            else toast.info('No test could be delivered', {
                description: data.reason ?? undefined,
                duration: 8000,
            });
        },
        onError: (error) =>
            toast.error(error instanceof ApiError ? error.message : 'Could not send a test.'),
    });
}

/* ── Notifications ────────────────────────────────────────────────────────── */

export interface NotificationParams {
    category?: NotificationCategory | 'all';
    unread?: boolean;
    search?: string;
    page?: number;
    limit?: number;
}

export function useNotifications(params: NotificationParams = {}) {
    return useQuery({
        queryKey: [
            ...KEY.notifications, params.category ?? 'all', params.unread ?? false,
            params.search ?? '', params.page ?? 1, params.limit ?? 10,
        ],
        queryFn: () => api.get<NotificationList>('/client/notifications', {
            category: params.category && params.category !== 'all' ? params.category : undefined,
            unread: params.unread ? 'true' : undefined,
            search: params.search || undefined,
            page: params.page,
            limit: params.limit,
        }),
        staleTime: 30 * 1000,
        placeholderData: (prev) => prev,
    });
}

/**
 * Just the badge.
 *
 * A separate, tiny query because it renders in the header on every page — the
 * full feed would be a page of rows fetched to draw one number.
 */
export function useUnreadCount() {
    return useQuery({
        queryKey: KEY.unread,
        queryFn: () => api.get<{ unread: number }>('/client/notifications/count'),
        staleTime: 60 * 1000,
        // No refetch on tab focus: coming back to the tab must not reload
        // anything. The badge refreshes on its own staleTime / after actions.
    });
}

function useNotificationMutation<TArgs>(
    fn: (args: TArgs) => Promise<unknown>,
    failure: string,
    success?: string,
) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: () => {
            if (success) toast.success(success);
            // Both, always: the badge and the feed are two views of one number
            // and must never be able to disagree.
            qc.invalidateQueries({ queryKey: KEY.notifications, refetchType: 'all' });
            qc.invalidateQueries({ queryKey: KEY.unread, refetchType: 'all' });
        },
        onError: (error) => toast.error(error instanceof ApiError ? error.message : failure),
    });
}

export function useMarkNotificationRead() {
    return useNotificationMutation<{ id: number; read?: boolean }>(
        ({ id, read = true }) => api.put(`/client/notifications/${id}/read`, { read }),
        'Could not update that notification.',
    );
}

/**
 * Mark all read.
 *
 * ⚠ Takes the category in view. Pressed on the RSVP tab it must not silently
 * clear the System tab the client has not looked at — the server enforces this,
 * and the argument is what tells it which tab that is.
 */
export function useMarkAllRead() {
    return useNotificationMutation<{ category?: NotificationCategory | 'all' }>(
        ({ category }) => api.put('/client/notifications/read-all', {
            category: category && category !== 'all' ? category : undefined,
        }),
        'Could not mark them as read.',
        'All caught up.',
    );
}

export function useArchiveNotification() {
    return useNotificationMutation<number>(
        (id) => api.put(`/client/notifications/${id}/archive`),
        'Could not archive that notification.',
        'Archived.',
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Formatting
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * "2 min ago".
 *
 * Only for the feed, where relative time is what the design shows and what a
 * person actually wants. Anything that has to be checked against a record — an
 * invoice, a payment — uses the absolute formatter instead.
 */
export function timeAgo(value: string | null | undefined) {
    if (!value) return '';
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return '';
    const secs = Math.round((Date.now() - then) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
    });
}

export const CHANNEL_ICON_LABEL: Record<MessageChannel, string> = {
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    email: 'Email',
    push: 'Push Notification',
};

/** What a client may choose today. The server enforces the same list. */
export const OFFERED_CHANNELS: MessageChannel[] = ['whatsapp', 'email'];

/**
 * Push is deliberately NOT in [OFFERED_CHANNELS].
 *
 * It is a real channel the server accepts, but it does not belong in the
 * general composer's channel switcher: its audience rule is different (the
 * guest must have the app), and it has a screenful of options none of the
 * other channels have. It gets its own pages under Messages → Notifications
 * instead, which is what the mockups show.
 */
export const PUSH_CHANNEL: MessageChannel = 'push';

/**
 * Substitute merge fields for the live preview.
 *
 * ⚠ A DELIBERATE SECOND IMPLEMENTATION of the server's renderer, and the only
 * one there should ever be. It exists so the composer's preview updates as you
 * type without a request per keystroke; the server's copy is what actually
 * goes out. Both accept `{token}` and `{{token}}`, and both leave an unknown
 * token alone rather than blanking it — a stray brace is a visible mistake
 * somebody fixes, while a silent deletion leaves a sentence with a hole in it.
 *
 * If you change one, change the other: `render()` in clientMessage.service.js.
 */
export function renderPreview(
    text: string,
    values: Record<string, string>,
) {
    if (!text) return '';
    return text.replace(/\{\{?\s*([a-z_]+)\s*\}?\}/gi, (whole, token: string) => {
        const key = token.toLowerCase();
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole;
    });
}

/* ── Devices ──────────────────────────────────────────────────────────────── */

export interface ClientDevice {
    id: number;
    platform: 'android' | 'ios' | 'web';
    device_name: string | null;
    app_version: string | null;
    is_active: boolean;
    disabled_reason: string | null;
    last_seen_at: string | null;
    created_at: string;
}

/**
 * The signed-in account's own registered devices.
 *
 * Used on the push composer to explain a reachable count of zero: without a
 * device token nothing can be delivered no matter how Firebase is configured,
 * and that is not a fact a host can guess from an empty recipient list.
 */
export function useMyDevices() {
    return useQuery({
        queryKey: ['client', 'devices'],
        queryFn: () => api.get<{ devices: ClientDevice[]; push_enabled: boolean }>('/client/devices'),
        staleTime: 60 * 1000,
    });
}
