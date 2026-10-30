'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, type ListResult } from '@/lib/api-client';

/**
 * Guests and guest groups — `/api/v1/client/guests`.
 *
 * ── STATUS AND RESPONSE ARE TWO FIELDS ───────────────────────────────────────
 * The import CSV settled it: a guest can be `Invited` with a blank response.
 *
 *   rsvp_status    not_responded -> invited -> pending -> accepted | declined
 *   response_type  none | yes | maybe | no
 *
 * The list's STATUS column shows the first, the RESPONSE column the second.
 * They are kept consistent by the server, never by this file.
 */

const ENDPOINT = '/client/guests';
const KEY = ['client', 'guests'] as const;
const GROUP_KEY = ['client', 'guest-groups'] as const;

export type RsvpStatus = 'not_responded' | 'invited' | 'pending' | 'accepted' | 'declined';
export type ResponseType = 'none' | 'yes' | 'no' | 'maybe';
export type InviteSource = 'whatsapp' | 'email' | 'sms' | 'manual' | 'import';

/**
 * The Guests (phone book) tabs. RSVP tabs live on the RSVP screen now — a
 * contact has no RSVP; a participant of one event does (§581).
 */
export type GuestTab = 'all' | 'imported' | 'joined' | 'not_joined';

/** The participant list's tabs — the stored RSVP statuses. */
export type ParticipantTab = 'all' | 'accepted' | 'pending' | 'declined' | 'not_responded' | 'joined';

export interface GuestGroup {
    id: number;
    name: string;
    description: string | null;
    color: string | null;
    visibility: 'private' | 'public';
    is_default: number;
    members_count: number;
    /** DISTINCT events the group appears in — not a member count. */
    events_count: number;
    created_at: string;
}

/**
 * A guest in the client's phone book (§581). No event, no RSVP — the
 * invitation is SHARED with them, and only scanning the QR makes them a
 * participant of an event.
 */
export interface Guest {
    id: number;
    group_id: number | null;

    title: string | null;
    /** YYYY-MM-DD, or null when not given. */
    date_of_birth: string | null;
    first_name: string | null;
    last_name: string | null;
    name: string;
    full_name: string;
    /** Optional — the mobile number is the key a guest is known by. */
    email: string | null;
    dial_code: string | null;
    mobile: string | null;
    whatsapp: string | null;
    company: string | null;

    source: 'manual' | 'import';
    is_imported: boolean;
    /** Events this person joined by scanning the QR with this mobile. */
    events_joined: number;
    has_joined: boolean;

    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    dietary_preference: string | null;
    /** The row of the admin's Guest Food Preferences list behind the words. */
    food_preference_option_id?: number | null;
    special_requirements: string | null;
    notes: string | null;

    created_at: string;
    group?: { id: number; name: string; color: string | null } | null;
}

/**
 * One person attending ONE event (`/client/participants`) — the same person
 * fields as a guest, plus the answers about this event.
 */
export interface Participant extends Omit<Guest, 'source' | 'events_joined'> {
    event_id: number;
    /** The phone-book guest this participant is, when they are one. */
    guest_id: number | null;
    table_number: string | null;
    /** One row can cover a family; this is heads, not rows. */
    party_size: number;
    rsvp_status: RsvpStatus;
    response_type: ResponseType;
    invite_source: InviteSource | 'qr';
    invited_at: string | null;
    responded_at: string | null;
    plus_one: number;
    plus_one_count: number;
    event?: { id: number; name: string; start_date: string | null; start_time: string | null; theme_id: string | null } | null;
    guest?: { id: number; name: string } | null;
}

/** The Guests (phone book) tiles. */
export interface GuestStats {
    grouped: number; grouped_pct: number;
    ungrouped: number; ungrouped_pct: number;
    imported: number;
    /** Guests who have joined at least one event. */
    joined: number; joined_pct: number;
    /** Guests in the phone book. */
    total_guests: number;
    total_rows: number;
}

/** The RSVP tiles for participants — one event, or all of them. */
export interface ParticipantStats {
    /** Heads (sum of party_size), which is what a caterer means by "guests". */
    total_guests: number;
    /** Rows — one per participant. The percentages are of this. */
    total_rows: number;
    accepted: number; accepted_pct: number;
    pending: number; pending_pct: number;
    declined: number; declined_pct: number;
    /** Groups `invited` with `not_responded`, exactly as the tab does. */
    not_responded: number; not_responded_pct: number;
    imported: number;
}

export interface GuestListParams {
    status?: GuestTab;
    /** 0 means "ungrouped" and is a real filter, not a falsy blank. */
    group_id?: number | string | null;
    search?: string;
    page?: number;
    limit?: number;
}

export interface ParticipantListParams {
    event_id?: number | null;
    status?: ParticipantTab;
    group_id?: number | string | null;
    search?: string;
    page?: number;
    limit?: number;
}

/** A phone-book guest — person fields only (§581). */
export interface GuestPayload {
    group_id?: number | null;
    title?: string | null;
    date_of_birth?: string | null;
    first_name: string;
    last_name?: string | null;
    email?: string | null;
    dial_code?: string | null;
    /** Required: an invitation is shared to a phone number. */
    mobile: string;
    whatsapp?: string | null;
    company?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    dietary_preference?: string | null;
    food_preference_option_id?: number | null;
    special_requirements?: string | null;
    notes?: string | null;
}

function reportError(error: unknown, verb: string) {
    if (error instanceof ApiError && error.isAuthError) {
        toast.error('Your session has expired. Please sign in again.');
        return;
    }
    toast.error(error instanceof Error ? error.message : `Failed to ${verb} guest`);
}

/* ── Guests ─────────────────────────────────────────────────────────────── */

export function useGuests(params: GuestListParams = {}) {
    return useQuery({
        queryKey: [...KEY, 'list', params],
        queryFn: (): Promise<ListResult<Guest>> =>
            api.getList<Guest>(ENDPOINT, {
                status: params.status && params.status !== 'all' ? params.status : undefined,
                // Sent as a string so `0` (ungrouped) survives the falsy check
                // in buildUrl, which drops empty values.
                group_id: params.group_id === null || params.group_id === undefined || params.group_id === ''
                    ? undefined
                    : String(params.group_id),
                search: params.search,
                page: params.page ?? 1,
                limit: params.limit ?? 8,
            }),
        retry: false,
    });
}

export function useGuestStats() {
    return useQuery({
        queryKey: [...KEY, 'stats'],
        queryFn: () => api.get<GuestStats>(`${ENDPOINT}/stats`),
        retry: false,
    });
}

/* ── Participants (§581) ──────────────────────────────────────────────────── */

const PARTICIPANT_KEY = ['client', 'participants'] as const;

/**
 * The people attending the host's events — `/client/participants`. Use this,
 * not useGuests, wherever the screen is about an EVENT (its guest list, message
 * recipients, push audience): the phone book has no event.
 */
export function useParticipants(params: ParticipantListParams = {}, enabled = true) {
    return useQuery({
        queryKey: [...PARTICIPANT_KEY, 'list', params],
        queryFn: (): Promise<ListResult<Participant>> =>
            api.getList<Participant>('/client/participants', {
                event_id: params.event_id || undefined,
                status: params.status && params.status !== 'all' ? params.status : undefined,
                group_id: params.group_id === null || params.group_id === undefined || params.group_id === ''
                    ? undefined
                    : String(params.group_id),
                search: params.search,
                page: params.page ?? 1,
                limit: params.limit ?? 20,
            }),
        enabled,
        retry: false,
    });
}

/** RSVP tiles for one event's participants (or all events when omitted). */
export function useParticipantStats(eventId?: number | null) {
    return useQuery({
        queryKey: [...PARTICIPANT_KEY, 'stats', eventId ?? 'all'],
        queryFn: () => api.get<ParticipantStats>('/client/participants/stats', { event_id: eventId || undefined }),
        retry: false,
    });
}

export interface ParticipantCapacity {
    /** Participants allowed on ONE event (plan's Max RSVP per event); null = unlimited. */
    limit: number | null;
    used: number;
    full: boolean;
}

/**
 * One event's participants against the plan's Max RSVP per event — the same
 * count QR registration and the app's Add Participant refuse at.
 */
export function useParticipantCapacity(eventId?: number | null) {
    return useQuery({
        queryKey: [...PARTICIPANT_KEY, 'capacity', eventId ?? null],
        queryFn: () => api.get<ParticipantCapacity>('/client/participants/capacity', { event_id: eventId }),
        enabled: !!eventId,
        retry: false,
    });
}

export interface GuestCapacity {
    /** Guests allowed IN TOTAL on the host's current plan; null = unlimited. */
    limit: number | null;
    /** Guests currently in the phone book. Removing one gives its place back. */
    used: number;
    full: boolean;
    remaining: number | null;
}

/**
 * Account-wide guest count against the plan limit, counted exactly as the server's
 * create counts it. Under KEY, so adding or deleting a guest refreshes it.
 */
export function useGuestCapacity() {
    return useQuery({
        queryKey: [...KEY, 'capacity'],
        queryFn: () => api.get<GuestCapacity>(`${ENDPOINT}/capacity`),
        retry: false,
    });
}

export function useGuest(id: number | null) {
    return useQuery({
        queryKey: [...KEY, 'detail', id],
        queryFn: async () => {
            const res = await api.get<{ guest: Guest } | Guest>(`${ENDPOINT}/${id}`);
            return (res as { guest?: Guest }).guest ?? (res as Guest);
        },
        enabled: !!id,
        retry: false,
    });
}

export function useCreateGuest(onDone?: (guest: Guest) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data: GuestPayload) => {
            const res = await api.post<{ guest: Guest } | Guest>(ENDPOINT, data);
            return (res as { guest?: Guest }).guest ?? (res as Guest);
        },
        onSuccess: (guest) => {
            toast.success('Guest added successfully');
            // 'all' also refreshes the group member counts and the analytics
            // tiles, which both read guest rows.
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            qc.invalidateQueries({ queryKey: GROUP_KEY, refetchType: 'all' });
            onDone?.(guest);
        },
        onError: (e) => reportError(e, 'add'),
    });
}

export function useUpdateGuest(onDone?: (guest: Guest) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: number; data: Partial<GuestPayload> }) => {
            const res = await api.put<{ guest: Guest } | Guest>(`${ENDPOINT}/${id}`, data);
            return (res as { guest?: Guest }).guest ?? (res as Guest);
        },
        onSuccess: (guest) => {
            toast.success('Guest updated successfully');
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            qc.invalidateQueries({ queryKey: GROUP_KEY, refetchType: 'all' });
            onDone?.(guest);
        },
        onError: (e) => reportError(e, 'update'),
    });
}

export function useDeleteGuest() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.del<unknown>(`${ENDPOINT}/${id}`),
        onSuccess: () => {
            toast.success('Guest removed');
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            qc.invalidateQueries({ queryKey: GROUP_KEY, refetchType: 'all' });
        },
        onError: (e) => reportError(e, 'remove'),
    });
}

export interface BulkAction {
    guest_ids: number[];
    /** RSVP status is per event — it is changed on the RSVP screen, not here. */
    action: 'delete' | 'group';
    value?: string | number | null;
}

export function useBulkGuests() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: BulkAction) =>
            api.post<{ action: string; affected: number }>(`${ENDPOINT}/bulk`, body),
        onSuccess: (result) => {
            toast.success(`${result.affected} guest(s) updated`);
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            qc.invalidateQueries({ queryKey: GROUP_KEY, refetchType: 'all' });
        },
        onError: (e) => reportError(e, 'update'),
    });
}

/* ── Groups ─────────────────────────────────────────────────────────────── */

export function useGuestGroups(params: { search?: string; visibility?: string; page?: number; limit?: number } = {}) {
    return useQuery({
        queryKey: [...GROUP_KEY, 'list', params],
        queryFn: (): Promise<ListResult<GuestGroup>> =>
            api.getList<GuestGroup>(`${ENDPOINT}/groups`, {
                search: params.search,
                visibility: params.visibility && params.visibility !== 'all' ? params.visibility : undefined,
                page: params.page ?? 1,
                limit: params.limit ?? 8,
            }),
        retry: false,
    });
}

/** Unpaginated — for the pickers on Add Guest, the list filter and Send Message. */
export interface GuestFormOption {
    id: number;
    name: string;
}

/**
 * The admin's dropdown lists for a guest form — relationships and dietary
 * (food) preferences. No event: a guest in the phone book has none, so the
 * server answers with the default lists. The mobile app reads the same route.
 */
export function useGuestFormOptions() {
    return useQuery({
        queryKey: [...KEY, 'form-options'],
        queryFn: () =>
            api.get<{
                relationship_options: GuestFormOption[];
                food_preference_options: GuestFormOption[];
            }>(`${ENDPOINT}/form-options`),
        staleTime: 5 * 60 * 1000,
        retry: false,
    });
}

export function useAllGuestGroups() {
    return useQuery({
        queryKey: [...GROUP_KEY, 'all'],
        queryFn: () =>
            api.get<{ groups: GuestGroup[] }>(`${ENDPOINT}/groups/all`).then((r) => r.groups),
        retry: false,
    });
}

export function useGuestGroupStats() {
    return useQuery({
        queryKey: [...GROUP_KEY, 'stats'],
        queryFn: () =>
            api.get<{
                total_groups: number; total_members: number;
                groups_in_use: number; private_groups: number;
            }>(`${ENDPOINT}/groups/stats`),
        retry: false,
    });
}

export interface GroupPayload {
    name: string;
    description?: string | null;
    color?: string | null;
    visibility?: 'private' | 'public';
    is_default?: boolean;
}

export function useCreateGuestGroup(onDone?: (group: GuestGroup) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data: GroupPayload) => {
            const res = await api.post<{ group: GuestGroup } | GuestGroup>(`${ENDPOINT}/groups`, data);
            return (res as { group?: GuestGroup }).group ?? (res as GuestGroup);
        },
        onSuccess: (group) => {
            toast.success('Group created successfully');
            qc.invalidateQueries({ queryKey: GROUP_KEY, refetchType: 'all' });
            onDone?.(group);
        },
        onError: (e) => reportError(e, 'create'),
    });
}

export function useUpdateGuestGroup(onDone?: (group: GuestGroup) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: number; data: Partial<GroupPayload> }) => {
            const res = await api.put<{ group: GuestGroup } | GuestGroup>(`${ENDPOINT}/groups/${id}`, data);
            return (res as { group?: GuestGroup }).group ?? (res as GuestGroup);
        },
        onSuccess: (group) => {
            toast.success('Group updated successfully');
            qc.invalidateQueries({ queryKey: GROUP_KEY, refetchType: 'all' });
            onDone?.(group);
        },
        onError: (e) => reportError(e, 'update'),
    });
}

/** Deleting a group UNGROUPS its guests; the server's message says how many. */
export function useDeleteGuestGroup() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) =>
            api.del<{ deleted: boolean; ungrouped_guests: number }>(`${ENDPOINT}/groups/${id}`),
        onSuccess: (result) => {
            toast.success(
                result?.ungrouped_guests
                    ? `Group deleted. ${result.ungrouped_guests} guest(s) are now ungrouped.`
                    : 'Group deleted.'
            );
            qc.invalidateQueries({ queryKey: GROUP_KEY, refetchType: 'all' });
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
        },
        onError: (e) => reportError(e, 'delete'),
    });
}

/* ── CSV ────────────────────────────────────────────────────────────────── */

/**
 * Download a CSV from an authenticated endpoint.
 *
 * A plain `<a href>` cannot carry the session cookie cross-origin, so the file
 * is fetched and handed to the browser as a Blob. `credentials: 'include'` is
 * the whole reason this is not just a link.
 */
async function downloadCsv(path: string, fallbackName: string) {
    const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1').replace(/\/$/, '');
    const res = await fetch(`${base}${path}`, { credentials: 'include' });
    if (!res.ok) throw new ApiError(res.status, 'Could not download the file.');

    const disposition = res.headers.get('Content-Disposition') ?? '';
    const named = /filename="?([^";]+)"?/.exec(disposition)?.[1];

    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = named || fallbackName;
    link.click();
    URL.revokeObjectURL(url);
}

export function useExportGuests() {
    return useMutation({
        mutationFn: (params: GuestListParams = {}) => {
            const query = new URLSearchParams();
            if (params.status && params.status !== 'all') query.set('status', params.status);
            if (params.group_id !== undefined && params.group_id !== null && params.group_id !== '') {
                query.set('group_id', String(params.group_id));
            }
            if (params.search) query.set('search', params.search);
            const qs = query.toString();
            return downloadCsv(`/client/guests/export${qs ? `?${qs}` : ''}`, 'guests.csv');
        },
        onSuccess: () => toast.success('Guest list exported'),
        onError: (e) => reportError(e, 'export'),
    });
}

export function useDownloadSampleCsv() {
    return useMutation({
        mutationFn: () => downloadCsv('/client/guests/import/sample', 'guest-import-sample.csv'),
        onError: (e) => reportError(e, 'download sample for'),
    });
}
