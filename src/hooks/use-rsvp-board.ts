'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import type { Guest } from '@/hooks/use-guests';

/**
 * RSVP board — the portal's "RSVP Responses" (web design 2026-11-04).
 * `GET /client/events/:id/rsvp-board`: one row per event guest with their
 * answer (from their participant row when they joined, else the organizer's).
 */

export type RsvpState = 'confirmed' | 'pending' | 'declined' | 'maybe' | 'not_invited';
export type RsvpAnswer = 'yes' | 'no' | 'maybe';
export type RsvpTab = 'all' | 'confirmed' | 'pending' | 'declined' | 'maybe' | 'bride' | 'groom' | 'vip' | 'hidden';
export type RsvpSort = 'response_desc' | 'response_asc' | 'name_asc' | 'name_desc';

export interface RsvpInfo {
    participant_id: number | null;
    joined: boolean;
    answer: RsvpAnswer | null;
    state: RsvpState;
    attending_count: number | null;
    meal_preference: string | null;
    message: string | null;
    responded_at: string | null;
    source: string | null;
    decline_reason: string | null;
    hidden: boolean;
    hidden_reason: string | null;
}

export type RsvpRow = Guest & { rsvp: RsvpInfo };

export interface RsvpBoard {
    rows: RsvpRow[];
    pagination: { page: number; limit: number; totalItems: number; totalPages: number };
    stats: {
        invited: number; responded: number; confirmed: number; pending: number; declined: number; maybe: number;
        responded_pct: number; confirmed_pct: number; pending_pct: number; declined_pct: number; maybe_pct: number;
        not_invited: number; total_guests: number;
    };
    tabs: Record<RsvpTab, number>;
    channels: { whatsapp: number; email: number; in_app: number };
    recent: { guest_id: number; name: string; state: RsvpState; attending_count: number | null; at: string }[];
}

export interface RsvpBoardParams {
    tab?: RsvpTab; status?: RsvpState | ''; side?: 'bride' | 'groom' | ''; source?: string;
    search?: string; sort?: RsvpSort; from?: string; to?: string; show_uninvited?: boolean;
    page?: number; limit?: number | 'all';
}

const KEY = ['client', 'rsvp-board'] as const;

const query = (p: RsvpBoardParams) => ({
    tab: p.tab && p.tab !== 'all' ? p.tab : undefined,
    status: p.status || undefined, side: p.side || undefined, source: p.source || undefined,
    search: p.search || undefined, sort: p.sort, from: p.from || undefined, to: p.to || undefined,
    show_uninvited: p.show_uninvited ? '1' : undefined,
    page: p.page ?? 1, limit: p.limit ?? 10,
});

export function useRsvpBoard(eventId: number, params: RsvpBoardParams) {
    return useQuery({
        queryKey: [...KEY, eventId, params],
        queryFn: () => api.get<RsvpBoard>(`/client/events/${eventId}/rsvp-board`, query(params)),
        retry: false,
        placeholderData: (prev) => prev,
    });
}

/** Every row of the current filters, for Export. */
export const fetchRsvpBoardAll = (eventId: number, params: RsvpBoardParams) =>
    api.get<RsvpBoard>(`/client/events/${eventId}/rsvp-board`, query({ ...params, page: 1, limit: 'all' }));

function useBoardMutation<V>(fn: (v: V) => Promise<unknown>, success: string | ((v: V) => string), failure: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: (_r, v) => {
            toast.success(typeof success === 'function' ? success(v) : success);
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            qc.invalidateQueries({ queryKey: ['client', 'guests'], refetchType: 'all' });
            qc.invalidateQueries({ queryKey: ['guest-profile'], refetchType: 'all' });
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : failure),
    });
}

export interface RsvpUpdate {
    response: RsvpAnswer | 'pending';
    attending_count?: number;
    meal_preference?: string | null;
    response_note?: string | null;
    decline_reason?: string | null;
    admin_note?: string | null;
}

const LABEL: Record<RsvpUpdate['response'], string> = { yes: 'Confirmed', no: 'Declined', maybe: 'Maybe', pending: 'Pending' };

export function useUpdateRsvp() {
    return useBoardMutation(
        ({ guestId, ...body }: { guestId: number } & RsvpUpdate) => api.put(`/client/rsvp-board/${guestId}`, body),
        (v) => `Marked as ${LABEL[v.response]}`,
        'Could not update this RSVP.',
    );
}

export function useHideRsvp() {
    return useBoardMutation(
        ({ guestId, ...body }: { guestId: number; hidden: boolean; reason?: string }) => api.put(`/client/rsvp-board/${guestId}/hide`, body),
        (v) => (v.hidden ? 'Response hidden' : 'Response shown'),
        'Could not change this response.',
    );
}

export function useClearRsvp() {
    return useBoardMutation(
        (guestId: number) => api.del(`/client/rsvp-board/${guestId}`),
        'Response deleted',
        'Could not delete this response.',
    );
}
