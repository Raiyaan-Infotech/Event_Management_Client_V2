'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, type Pagination } from '@/lib/api-client';

/**
 * RSVPs.
 *
 * ── ⚠ THERE IS NO RSVP TABLE ────────────────────────────────────────────────
 * An RSVP is the response COLUMNS on a guest — this is a different lens on
 * `event_guests`, not a different resource. Three things follow:
 *
 * 1. **`useResetResponse` does not delete anything.** It clears the response
 *    and leaves the guest on the list, able to answer again. Deleting the
 *    PERSON is `useDeleteGuest` in `use-guests.ts`, and the two must never be
 *    wired to the same button.
 * 2. **`rsvp_status` is derived from `response_type` server-side.** Sending
 *    both would let a row say "accepted" and "no" at once, so the payload
 *    carries only the response.
 * 3. **There is no response history.** A row holds one current answer. The
 *    detail's `linked_events` is the same PERSON at other events, matched on
 *    email — not a change log.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The four buckets the tiles and tabs share.
 *
 * Four over five stored statuses: `not_responded` and `invited` both mean "we
 * are still waiting", and the tile must agree with the tab or the two
 * contradict each other on the same screen.
 */
export type RsvpBucket = 'accepted' | 'maybe' | 'declined' | 'no_response';
export type ResponseType = 'none' | 'yes' | 'no' | 'maybe';

export interface Rsvp {
    id: number;
    /**
     * The phone-book guest this participant IS, or null for someone who
     * scanned the QR without being in the phone book. `id` and `guest.id` are
     * the PARTICIPANT — guest-page links must use this, never those.
     */
    phone_book_guest_id: number | null;
    guest: {
        id: number;
        name: string;
        first_name: string | null;
        last_name: string | null;
        title: string | null;
        email: string | null;
        dial_code: string | null;
        mobile: string | null;
        whatsapp: string | null;
        company: string | null;
        table_number: string | null;
        city: string | null;
        state: string | null;
        country: string | null;
        /** The admin's relation name ("Father") — asked with the side. */
        relationship?: string | null;
    };
    event: {
        id: number; name: string; start_date: string | null; start_time: string | null;
        venue_name: string | null; venue_address: string | null;
    } | null;

    rsvp_status: string;
    response_type: ResponseType;
    bucket: RsvpBucket;
    party_size: number;
    /** Groom's or Bride's side — asked when the participant is added or answers. */
    rsvp_side?: 'groom' | 'bride' | null;
    dietary_preference: string | null;
    special_requirements: string | null;
    plus_one: boolean;
    plus_one_count: number;
    notes: string | null;
    /** Raw. No question table exists, so nothing can label these. */
    custom_answers: Record<string, unknown> | null;

    invite_source: string | null;
    invited_at: string | null;
    responded_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface RsvpStats {
    /** ROWS — one invitation per guest, however many people it covers. */
    total_invitations: number;
    /** SUM(party_size). The other number, and never equal to the one above. */
    heads: number;
    accepted: number; accepted_pct: number;
    maybe: number; maybe_pct: number;
    declined: number; declined_pct: number;
    no_response: number; no_response_pct: number;
}

export interface RsvpList {
    rsvps: Rsvp[];
    pagination: Pagination;
    /** ⚠ Counts everything the filters select EXCEPT the status filter. */
    stats: RsvpStats;
}

export interface TimelineEntry {
    key: string;
    label: string;
    detail: string;
    at: string;
    channel?: string;
    /** The event date, which has not happened yet — styled differently. */
    upcoming?: boolean;
}

export interface RsvpDetail {
    rsvp: Rsvp;
    /** Derived from real timestamps, never stored. */
    timeline: TimelineEntry[];
    messages: {
        id: number; channel: string; kind: string; status: string;
        sent_at: string | null; delivered_at: string | null; opened_at: string | null;
    }[];
    /** The same EMAIL at other events — not a response history. */
    linked_events: {
        id: number; rsvp_status: string; response_type: ResponseType; bucket: RsvpBucket;
        responded_at: string | null; party_size: number;
        event: { id: number; name: string; start_date: string | null; venue_name: string | null } | null;
    }[];
    /** What this system does not record, in the server's own words. */
    unavailable: Record<string, string>;
}

export interface RsvpParams {
    event_id?: number | string;
    /** Groom's or Bride's side. */
    side?: 'groom' | 'bride';
    /** A relation's name ("Father"), as the participant was added with it. */
    relationship?: string;
    status?: RsvpBucket | 'all';
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Queries
 * ────────────────────────────────────────────────────────────────────────── */

const KEY = ['rsvps'] as const;

export function useRsvps(params: RsvpParams = {}) {
    return useQuery({
        queryKey: [
            ...KEY, 'list',
            params.event_id ?? 'all', params.status ?? 'all',
            params.side ?? 'all', params.relationship ?? 'all',
            params.search ?? '', params.from ?? '', params.to ?? '',
            params.page ?? 1, params.limit ?? 10,
        ],
        queryFn: () => api.get<RsvpList>('/client/rsvps', {
            event_id: params.event_id,
            side: params.side,
            relationship: params.relationship,
            status: params.status,
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

export function useRsvp(id: number | null) {
    return useQuery({
        queryKey: [...KEY, 'detail', id],
        queryFn: () => api.get<RsvpDetail>(`/client/rsvps/${id}`),
        enabled: id !== null && Number.isFinite(id),
        staleTime: 30 * 1000,
    });
}

/* ── Mutations ────────────────────────────────────────────────────────────── */

export interface RsvpUpdate {
    response_type?: ResponseType;
    party_size?: number;
    dietary_preference?: string | null;
    special_requirements?: string | null;
    notes?: string | null;
}

export function useUpdateRsvp(onDone?: () => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...body }: RsvpUpdate & { id: number }) =>
            api.put<RsvpDetail>(`/client/rsvps/${id}`, body),
        onSuccess: () => {
            toast.success('RSVP updated');
            for (const key of [KEY, ['guests'], ['notifications']]) {
                qc.invalidateQueries({ queryKey: key, refetchType: 'all' });
            }
            onDone?.();
        },
        onError: (error) =>
            toast.error(error instanceof ApiError ? error.message : 'Could not update that RSVP.'),
    });
}

/**
 * Clear a response.
 *
 * ⚠ NOT a delete. The guest stays on the list, in their group and in every
 * count, and can respond again. The success toast comes from the SERVER so this
 * screen cannot promise something the route did not do.
 */
export function useResetResponse(onDone?: () => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
            api.put<RsvpDetail>(`/client/rsvps/${id}/reset`, { reason }),
        onSuccess: () => {
            toast.success('Response cleared', {
                description: 'The guest is still on your list and can respond again.',
            });
            for (const key of [KEY, ['guests'], ['notifications']]) {
                qc.invalidateQueries({ queryKey: key, refetchType: 'all' });
            }
            onDone?.();
        },
        onError: (error) =>
            toast.error(error instanceof ApiError ? error.message : 'Could not clear that response.'),
    });
}

/* ── Export ───────────────────────────────────────────────────────────────── */

export interface ExportResult {
    rows: Rsvp[];
    count: number;
    /** Said out loud — a truncated export that looks complete is worse. */
    truncated: boolean;
    stats: RsvpStats;
}

export function fetchExportRows(params: RsvpParams) {
    return api.get<ExportResult>('/client/rsvps/export', {
        event_id: params.event_id,
        side: params.side,
        relationship: params.relationship,
        status: params.status,
        search: params.search || undefined,
        from: params.from || undefined,
        to: params.to || undefined,
    });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Display
 * ────────────────────────────────────────────────────────────────────────── */

export const BUCKET_LABEL: Record<RsvpBucket, string> = {
    accepted: 'Accepted',
    maybe: 'Maybe',
    declined: 'Declined',
    no_response: 'No Response',
};

export const BUCKET_STYLE: Record<RsvpBucket, string> = {
    accepted: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    maybe: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    declined: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    no_response: 'bg-muted text-muted-foreground',
};

/** The four the Edit form offers, in the order the design shows them. */
export const RESPONSE_OPTIONS: { value: ResponseType; label: string; bucket: RsvpBucket }[] = [
    { value: 'yes', label: 'Accepted', bucket: 'accepted' },
    { value: 'maybe', label: 'Maybe', bucket: 'maybe' },
    { value: 'no', label: 'Declined', bucket: 'declined' },
    { value: 'none', label: 'No Response', bucket: 'no_response' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A date from its PARTS.
 *
 * Never `new Date(value)` on a bare date — that parses as UTC and renders the
 * previous day for anyone behind it, which on an event date is wrong.
 */
export function formatDate(value: string | null | undefined) {
    if (!value) return '—';
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '—';
    return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function formatTime(value: string | null | undefined) {
    if (!value) return '';
    const m = String(value).match(/^(\d{2}):(\d{2})/);
    if (!m) return '';
    const h = Number(m[1]);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(h12).padStart(2, '0')}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * The relation names for the Relationship filter — the admin's list for the
 * chosen event's category, or the default list when "All Events" is chosen.
 * Names repeat across categories, so each is listed once.
 */
export function useRsvpRelationOptions(eventId?: string) {
    return useQuery({
        queryKey: [...KEY, 'relations', eventId ?? 'all'],
        queryFn: () => api
            .get<{ relationship_options: { id: number; name: string }[] }>(
                '/client/guests/form-options',
                { event_id: eventId },
            )
            .then((r) => {
                const seen = new Set<string>();
                return (r.relationship_options ?? []).filter((o) => {
                    const key = o.name.trim().toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            }),
        staleTime: 5 * 60 * 1000,
        retry: false,
    });
}
