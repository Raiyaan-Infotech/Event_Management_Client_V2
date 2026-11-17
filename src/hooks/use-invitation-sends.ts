'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, type Pagination } from '@/lib/api-client';

/**
 * Invitations flow — step 3 "Share with Guests" and step 4 "Track Responses"
 * (Jamal's design, 2026-11-18).
 *
 * ⚠ A send is SAVED, not delivered (Jamal: "save this data into db for now"):
 * no WhatsApp / email provider is connected, so the rows read "Recorded" (or
 * "Scheduled") until one is. The screens say so rather than claim delivery.
 * No RSVP anywhere in this flow.
 */

export type InviteChannel = 'whatsapp' | 'email';
export type InviteStatus = 'recorded' | 'scheduled' | 'sent' | 'delivered' | 'failed';

export interface AudienceGuest {
    id: number;
    name: string;
    email: string | null;
    dial_code: string | null;
    mobile: string | null;
    whatsapp: string | null;
    invited_at: string | null;
    group: { id: number; name: string; color: string | null } | null;
}

export interface AudienceGroup {
    id: number;
    name: string;
    color: string | null;
    guest_count: number;
}

export interface InvitationAudience {
    event: { id: number; name: string };
    groups: AudienceGroup[];
    guests: AudienceGuest[];
    delivery_connected: boolean;
}

export interface InvitationSendRow {
    id: number;
    batch_key: string;
    channel: InviteChannel;
    subject: string | null;
    message: string;
    status: InviteStatus;
    scheduled_at: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    opened_at: string | null;
    failed_reason: string | null;
    created_at: string;
    guest: {
        id: number; name: string; email: string | null; dial_code: string | null;
        mobile: string | null; whatsapp: string | null;
        group: { id: number; name: string; color: string | null } | null;
        /** Scanned the QR and became a participant of the event. */
        joined: boolean;
    } | null;
}

export interface InvitationStats {
    total: number;
    /** Sent now (recorded / sent / delivered / failed) — everything but scheduled. */
    shared: number;
    sent: number;
    delivered: number;
    scheduled: number;
    failed: number;
    guests: number;
    joined: number;
    by_channel: { whatsapp: number; email: number };
}

export interface InvitationSendList {
    rows: InvitationSendRow[];
    pagination: Pagination;
    stats: InvitationStats;
    delivery_connected: boolean;
}

export interface SendInvitationPayload {
    event_id: number;
    channel: InviteChannel;
    group_ids?: number[];
    guest_ids?: number[];
    subject?: string;
    message: string;
    scheduled_at?: string;
}

export interface SendInvitationResult {
    batch_key: string;
    channel: InviteChannel;
    status: 'recorded' | 'scheduled';
    recipients: number;
    skipped: number;
    scheduled_at: string | null;
    sent_at: string | null;
    delivery_connected: boolean;
}

const KEY = ['invitation-sends'] as const;
const ENDPOINT = '/client/invitation-sends';

const fail = (e: unknown, fallback: string) => toast.error(e instanceof ApiError ? e.message : fallback);

export function useInvitationAudience(eventId: number | null) {
    return useQuery({
        queryKey: [...KEY, 'audience', eventId],
        queryFn: () => api.get<InvitationAudience>(`${ENDPOINT}/audience`, { event_id: eventId! }),
        enabled: !!eventId,
        staleTime: 30_000,
    });
}

export interface InvitationListParams {
    eventId: number | null;
    search?: string;
    status?: string;
    channel?: string;
    page?: number;
    limit?: number;
}

export function useInvitationSends(p: InvitationListParams) {
    return useQuery({
        queryKey: [...KEY, 'list', p.eventId, p.search ?? '', p.status ?? '', p.channel ?? '', p.page ?? 1, p.limit ?? 10],
        queryFn: () => api.get<InvitationSendList>(ENDPOINT, {
            event_id: p.eventId!,
            search: p.search || undefined,
            status: p.status || undefined,
            channel: p.channel || undefined,
            page: p.page ?? 1,
            limit: p.limit ?? 10,
        }),
        enabled: !!p.eventId,
        placeholderData: (prev) => prev,
    });
}

export function useSendInvitation(onDone?: (r: SendInvitationResult) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: SendInvitationPayload) => api.post<SendInvitationResult>(ENDPOINT, body),
        onSuccess: (r) => {
            if (r.skipped) {
                toast.warning(`${r.skipped} guest${r.skipped === 1 ? ' was' : 's were'} skipped`, {
                    description: `No ${r.channel === 'email' ? 'email address' : 'mobile number'} on file.`,
                });
            }
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            qc.invalidateQueries({ queryKey: ['guests'], refetchType: 'all' });
            onDone?.(r);
        },
        onError: (e) => fail(e, 'Could not send the invitation.'),
    });
}

export function useResendInvitation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.post<{ id: number }>(`${ENDPOINT}/${id}/resend`),
        onSuccess: () => {
            toast.success('Invitation sent again.', { description: 'Saved — it is delivered once WhatsApp / email is connected.' });
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
        },
        onError: (e) => fail(e, 'Could not resend the invitation.'),
    });
}

export function useRemoveInvitationRecipient() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.del<{ id: number }>(`${ENDPOINT}/${id}`),
        onSuccess: () => {
            toast.success('Recipient removed.');
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
        },
        onError: (e) => fail(e, 'Could not remove the recipient.'),
    });
}
