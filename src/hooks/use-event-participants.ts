'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import type { Participant } from '@/hooks/use-guests';

/**
 * The web Participants module — the app's Manage Participants (Jamal,
 * 2026-11-02). Same API as the app: `/client/participants`.
 *
 * The list is read WHOLE (every page, as the app does) because the tabs —
 * All / Active / Pending — are counted on the client: Active = signed in to
 * the app at least once (`has_joined`), Pending = added and not signed in yet.
 */

/** The fields the app's Add / Edit Participant form shows. */
export interface ParticipantRow extends Participant {
    photo?: string | null;
    side?: 'groom' | 'bride' | null;
    rsvp_side?: 'groom' | 'bride' | null;
    relationship?: string | null;
    relationship_option_id?: number | null;
    has_joined: boolean;
    // ── Participants web design (2026-11-04) ──
    /** blocked > active (joined in the app) > pending (added, not joined). */
    access?: 'active' | 'pending' | 'blocked';
    invite_status?: 'invited' | 'pending';
    is_blocked?: boolean;
    block_reason?: string | null;
    block_note?: string | null;
    is_hidden?: boolean;
    hide_reason?: string | null;
    hide_note?: string | null;
    guest?: { id: number; name: string; side?: 'groom' | 'bride' | null; is_vip?: boolean; vip_label?: string | null; invited_at?: string | null } | null;
}

export interface ParticipantPayload {
    event_id?: number;
    title: string;
    first_name: string;
    last_name: string | null;
    date_of_birth: string | null;
    email: string | null;
    dial_code: string;
    mobile: string;
    side: 'groom' | 'bride';
    rsvp_side: 'groom' | 'bride';
    relationship: string | null;
    relationship_option_id: number | null;
    dietary_preference: string | null;
    food_preference_option_id: number | null;
    party_size: number;
    plus_one: number;
    plus_one_count: number;
    company: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    table_number: string | null;
    notes: string | null;
    special_requirements: string | null;
    /** A URL from the guest photo upload; '' clears it. */
    photo: string;
    invite_source?: 'manual';
}

const KEY = ['client', 'participants'] as const;

function report(error: unknown, fallback: string) {
    toast.error(error instanceof ApiError ? error.message : fallback);
}

/** Every participant of one event (all pages, newest first). */
export function useEventParticipants(eventId: number | null) {
    return useQuery({
        queryKey: [...KEY, 'event-all', eventId],
        enabled: !!eventId,
        retry: false,
        queryFn: async (): Promise<ParticipantRow[]> => {
            const byId = new Map<number, ParticipantRow>();
            let page = 1;
            let totalPages = 1;
            do {
                const res = await api.getList<ParticipantRow>('/client/participants', {
                    event_id: eventId ?? undefined, limit: 200, page,
                });
                for (const row of res.data) if (!byId.has(row.id)) byId.set(row.id, row);
                totalPages = res.pagination?.totalPages ?? 1;
                page += 1;
            } while (page <= totalPages && page <= 50);
            return [...byId.values()];
        },
    });
}

export function useParticipantRow(id: number | null) {
    return useQuery({
        queryKey: [...KEY, 'row', id],
        enabled: !!id,
        retry: false,
        queryFn: () =>
            api.get<{ participant: ParticipantRow }>(`/client/participants/${id}`).then((r) => r.participant),
    });
}

export function useSaveParticipant(onDone?: (p: ParticipantRow) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: Partial<ParticipantPayload> }) =>
            (id
                ? api.put<{ participant: ParticipantRow }>(`/client/participants/${id}`, data)
                : api.post<{ participant: ParticipantRow }>('/client/participants', data)
            ).then((r) => r.participant),
        onSuccess: (p, vars) => {
            toast.success(vars.id ? 'Participant updated successfully!' : 'Participant added successfully!');
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            qc.invalidateQueries({ queryKey: ['rsvps'], refetchType: 'all' });
            onDone?.(p);
        },
        onError: (e) => report(e, 'Could not save the participant.'),
    });
}

/** Change Photo from the list's ⋮ menu — only the photo is sent. */
export function useSetParticipantPhoto() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, photo }: { id: number; photo: string }) =>
            api.put(`/client/participants/${id}`, { photo }),
        onSuccess: () => {
            toast.success('Photo updated.');
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
        },
        onError: (e) => report(e, 'Could not change the photo.'),
    });
}

export function useRemoveParticipant() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.del(`/client/participants/${id}`),
        onSuccess: () => {
            toast.success('Participant removed successfully!');
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            qc.invalidateQueries({ queryKey: ['rsvps'], refetchType: 'all' });
        },
        onError: (e) => report(e, 'Could not remove the participant.'),
    });
}
