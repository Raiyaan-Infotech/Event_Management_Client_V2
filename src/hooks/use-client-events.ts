'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, type ListResult } from '@/lib/api-client';
import type { ClientPlan } from '@/hooks/use-client-portal';

/**
 * The signed-in client's events — `/api/v1/client/events`.
 *
 * Built on the `use-event-categories.ts` template, with two differences worth
 * knowing:
 *
 *  1. Everything is scoped to the SESSION on the server. There is no client id
 *     in any request here; the backend reads it off the cookie. An id belonging
 *     to another client answers 404, not 403 — it simply is not in scope.
 *
 *  2. `status` is not a plain column filter. "Past" is derived from the event's
 *     dates on the server rather than stored, so `status=past` and
 *     `status=upcoming` are date comparisons, not equality checks.
 */

const ENDPOINT = '/client/events';
const KEY = ['client', 'events'] as const;

/** Stored status — exactly what the wizard's Event Status dropdown offers. */
export type EventStatus = 'draft' | 'upcoming' | 'cancelled';
/**
 * What the UI actually shows.
 *
 * `live` and `past` are derived server-side from the event's dates and are
 * never stored: an event goes live when it starts and completes when it ends,
 * with nothing to flip and no window where the DB disagrees with the calendar.
 * The My Events screen labels `past` as "Completed".
 */
export type DerivedStatus = EventStatus | 'live' | 'past';

export interface EventMenuRef {
    id: number;
    name: string;
    slug: string;
    menu_group: 'core' | 'additional' | 'custom';
}

export interface TaxonomyRef {
    id: number;
    name: string;
    color?: string | null;
    icon?: string | null;
}

export interface ClientEvent {
    id: number;
    website_client_id: number;
    vendor_id: number;
    company_id: number | null;
    subscription_plan_id: number | null;

    event_category_id: number | null;

    name: string;
    /** The two host lines the invitation prints either side of an ampersand. */
    host_one: string | null;
    host_two: string | null;
    tagline: string | null;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    timezone: string | null;
    venue_name: string | null;
    venue_address: string | null;
    venue_landmark?: string | null;
    venue_map_link?: string | null;
    venue_image?: string | null;
    /** DECIMAL — arrives as a string, e.g. "13.0827000". */
    venue_lat?: string | number | null;
    venue_lng?: string | number | null;
    ceremony_title?: string | null;
    ceremony_venue?: string | null;
    ceremony_description?: string | null;
    organizer: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    footer_note: string | null;
    privacy: 'private' | 'public' | 'unlisted';
    status: EventStatus;
    /** Computed server-side from the dates — this is what the UI badges. */
    derived_status: DerivedStatus;

    menu_ids: number[];
    /** Menu ids in the host's order; null = the admin's sort_order. */
    menu_order?: number[] | null;
    /** The plan's app features switched OFF for this event; [] = all on. */
    disabled_app_menu_ids?: number[];
    theme_id: string | null;
    /** Mobile app home screen design (Home Screen Templates); null = none picked. */
    home_screen_template_id?: number | null;
    primary_color: string | null;
    /** The event's own secondary colour; null = follow the template. */
    secondary_color?: string | null;
    /**
     * The event's own photo — shown on the mobile app's event card and at the
     * top of the event screen. Null falls back to the template artwork. Not part
     * of the invitation design.
     */
    cover_image: string | null;
    /** The host's own picture for a custom-type template. Null = the template's own. */
    custom_image?: string | null;

    /** The finished invitation as a PNG, uploaded by the wizard after a save. */
    invitation_image?: string | null;

    /**
     * The client's per-event override of the template's component set / order.
     *
     * NULL on either means "inherit whatever the template says" — which is what
     * every event created before this feature means, and why the renderer has
     * to treat null as inheritance rather than as an empty design.
     */
    components: Record<string, number> | null;
    component_order: string[] | null;

    /**
     * The encrypted QR payload. This string IS what the QR image encodes,
     * character for character — a normal scanner returns exactly this, and only
     * the backend can decrypt it.
     */
    qr_token: string | null;
    qr_version: number;
    qr_issued_at: string | null;
    /** How the QR is drawn: 0 classic, 1 rounded, 2 heart. Set from the app. */
    qr_style?: number;

    created_at: string;
    updated_at: string;

    /** Joins — present on list and detail alike. */
    plan?: Pick<ClientPlan, 'id' | 'name'> & { plan_code?: string };
    category?: TaxonomyRef | null;
    /** Detail only: menu_ids resolved to rows. */
    menus?: EventMenuRef[];
}

export interface EventPayload {
    event_category_id: number;
    name: string;
    tagline?: string | null;
    description?: string | null;
    start_date: string;
    end_date: string;
    start_time: string;
    end_time: string;
    timezone?: string | null;
    privacy?: string;
    status?: string;
    menu_ids?: number[];
    menu_order?: number[] | null;
    disabled_app_menu_ids?: number[];
    theme_id?: string | null;
    home_screen_template_id?: number | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    qr_style?: number;
    cover_image?: string | null;
    custom_image?: string | null;
    venue_landmark?: string | null;
    venue_map_link?: string | null;
    venue_image?: string | null;
    venue_lat?: number | null;
    venue_lng?: number | null;
    ceremony_title?: string | null;
    ceremony_venue?: string | null;
    ceremony_description?: string | null;
}

export interface EventListParams {
    /**
     * 'all' omits the filter. 'published' means everything a guest could see —
     * live, upcoming and completed alike, but never a draft or a cancellation.
     */
    status?: DerivedStatus | 'all' | 'published';
    /** Plan-gated server-side; an id outside the plan simply matches nothing. */
    category_id?: number | null;
    /** private | public | unlisted. Whitelisted server-side; junk is ignored. */
    privacy?: string;
    /** A key from the server's SORT_ORDERS table, never a column name. */
    sort?: string;
    search?: string;
    page?: number;
    limit?: number;
}

export interface DashboardStats {
    total_events: number;
    /** Live + upcoming + completed. Excludes drafts and cancellations. */
    published_events: number;
    live_events: number;
    upcoming_events: number;
    past_events: number;
    draft_events: number;
    cancelled_events: number;
    upcoming_next_30_days: number;
    /**
     * All five are always 0 today — there is no guest module in this system yet.
     * `guests_available` is what tells the UI that the 0 means "not built"
     * rather than "genuinely none", so the tiles can say so instead of implying
     * nobody has replied.
     */
    total_guests: number;
    rsvps_received: number;
    rsvp_going: number;
    rsvp_pending: number;
    rsvp_declined: number;
    guests_available: boolean;
}

export function useClientEvents(params: EventListParams = {}) {
    return useQuery({
        queryKey: [...KEY, 'list', params],
        queryFn: (): Promise<ListResult<ClientEvent>> =>
            api.getList<ClientEvent>(ENDPOINT, {
                status: params.status && params.status !== 'all' ? params.status : undefined,
                category_id: params.category_id || undefined,
                privacy: params.privacy,
                sort: params.sort,
                search: params.search,
                page: params.page ?? 1,
                limit: params.limit ?? 6,
            }),
        // A 401 here means "not signed in"; retrying cannot fix that.
        retry: false,
    });
}

export function useClientEvent(id: number | null) {
    return useQuery({
        queryKey: [...KEY, 'detail', id],
        // Detail endpoints nest under a named key; list endpoints do not.
        queryFn: async () => {
            const res = await api.get<{ event: ClientEvent } | ClientEvent>(`${ENDPOINT}/${id}`);
            return (res as { event?: ClientEvent }).event ?? (res as ClientEvent);
        },
        enabled: !!id,
        retry: false,
    });
}

export type RsvpStatus = 'attending' | 'not_attending' | 'maybe' | 'no_response';
export type MessageChannel = 'whatsapp' | 'email' | 'sms';
export type InviteSource = MessageChannel | 'manual' | 'import';

/**
 * Everything the Analytics screen shows, in one payload.
 *
 * ── NULL IS NOT ZERO ANYWHERE IN HERE ────────────────────────────────────────
 * A rate is `null` when its denominator was zero, and SMS `open_rate` /
 * `click_rate` are `null` always — there is no pixel and no link wrapper, so an
 * open is unknowable rather than absent. Render an em dash for null; a 0% would
 * claim nobody opened it. Same for the deltas: no prior period means null, not
 * a 100% jump from nothing.
 */
export interface EventAnalytics {
    period: { days: number; from: string; to: string };

    totals: {
        total_guests: number;
        total_rsvps: number;
        messages_sent: number;
        /** opened / DELIVERED. Null when nothing was delivered. */
        open_rate: number | null;
        /** responded / INVITED. */
        response_rate: number | null;
        /** clicked / DELIVERED. */
        click_rate: number | null;
    };
    /** Percent change against the equal-length window before this one. */
    deltas: {
        total_guests: number | null;
        total_rsvps: number | null;
        messages_sent: number | null;
        open_rate: number | null;
        response_rate: number | null;
        click_rate: number | null;
    };

    rsvp_breakdown: { key: RsvpStatus; count: number; percent: number }[];
    /** A DENSE day axis — quiet days are present with zeroes. */
    rsvp_trend: {
        key: string; label: string;
        attending: number; not_attending: number; maybe: number; no_response: number;
    }[];

    messages_by_channel: {
        key: MessageChannel;
        sent: number;
        delivered: number;
        failed: number;
        percent: number;
        delivery_rate: number | null;
        open_rate: number | null;
        click_rate: number | null;
    }[];

    engagement_by_source: { key: InviteSource; count: number; percent: number }[];

    top_events: {
        id: number;
        name: string;
        start_date: string | null;
        theme_id: string | null;
        category: string | null;
        guests: number;
        rsvp_rate: number | null;
        response_rate: number | null;
    }[];

    /** Event-side aggregates, merged in by the controller. */
    event_totals: {
        total_events: number;
        published_events: number;
        live_events: number;
        upcoming_events: number;
        past_events: number;
        draft_events: number;
        cancelled_events: number;
        completion_rate: number;
    };
    by_status: { key: DerivedStatus; count: number }[];
    by_category: { name: string; color: string | null; count: number }[];
    by_theme: { theme_id: string; count: number }[];
    top_menus: { id: number; name: string; count: number }[];
    timeline: { key: string; label: string; year: number; created: number; scheduled: number }[];
    recent_events: {
        id: number; name: string; start_date: string | null; theme_id: string | null;
        derived_status: DerivedStatus; category: string | null; menu_count: number;
    }[];

    guests_available: boolean;
    messaging_available: boolean;
}

export function useEventAnalytics(days = 31) {
    return useQuery({
        queryKey: [...KEY, 'analytics', days],
        queryFn: () => api.get<EventAnalytics>(`${ENDPOINT}/analytics`, { days }),
        retry: false,
    });
}

export function useDashboardStats() {
    return useQuery({
        queryKey: [...KEY, 'stats'],
        queryFn: () => api.get<DashboardStats>(`${ENDPOINT}/stats`),
        retry: false,
    });
}

function reportError(error: unknown, verb: string) {
    if (error instanceof ApiError && error.isAuthError) {
        toast.error('Your session has expired. Please sign in again.');
        return;
    }
    toast.error(error instanceof Error ? error.message : `Failed to ${verb} event`);
}

/**
 * Create an event. The response already carries the issued `qr_token`, because
 * the backend writes the row and its QR code in one transaction — so the
 * success step can render the code without a second request.
 *
 * No navigation happens in here: the wizard needs to advance to its own step 6
 * rather than route away, so the caller decides what "done" means.
 */
export function useCreateEvent(onDone?: (event: ClientEvent) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data: EventPayload) => {
            const res = await api.post<{ event: ClientEvent } | ClientEvent>(ENDPOINT, data);
            return (res as { event?: ClientEvent }).event ?? (res as ClientEvent);
        },
        onSuccess: (event) => {
            toast.success('Event created successfully');
            // refetchType 'all' also refreshes the dashboard's queries while
            // they are unmounted — otherwise going back shows the old list.
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            onDone?.(event);
        },
        onError: (e) => reportError(e, 'create'),
    });
}

export function useUpdateEvent(onDone?: (event: ClientEvent) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: number; data: Partial<EventPayload> }) => {
            const res = await api.put<{ event: ClientEvent } | ClientEvent>(`${ENDPOINT}/${id}`, data);
            return (res as { event?: ClientEvent }).event ?? (res as ClientEvent);
        },
        onSuccess: (event) => {
            toast.success('Event updated successfully');
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            onDone?.(event);
        },
        onError: (e) => reportError(e, 'update'),
    });
}

/**
 * Upload an event's cover photo and get back its URL.
 *
 * Fires the moment a file is picked, before the event is saved — a new event
 * has no id yet — and the wizard sends the URL as `cover_image` on its final
 * step. Same shape as the splash-screen uploader.
 */
export function useUploadEventCover() {
    return useMutation({
        mutationFn: (file: File) => {
            const form = new FormData();
            form.append('file', file);
            return api.post<{ url: string }>(`${ENDPOINT}/cover-image`, form).then((r) => r.url);
        },
        onError: (e) => reportError(e, 'upload'),
    });
}

/**
 * Store the finished invitation (the card rendered to PNG) on a SAVED event.
 *
 * Silent by design: the wizard fires it after the save succeeds, with no toast
 * either way. The app's View Invitation shows this image; if the upload fails
 * the event is still saved and the app falls back to its drawn card, so an
 * error here is logged, never shown.
 */
export function useUploadInvitationImage() {
    return useMutation({
        mutationFn: ({ eventId, image }: { eventId: number; image: Blob }) => {
            const form = new FormData();
            form.append('file', image, `invitation-${eventId}.png`);
            return api.post<{ url: string }>(`${ENDPOINT}/${eventId}/invitation-image`, form).then((r) => r.url);
        },
    });
}

export function useDeleteEvent() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.del<unknown>(`${ENDPOINT}/${id}`),
        onSuccess: () => {
            toast.success('Event deleted');
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
        },
        onError: (e) => reportError(e, 'delete'),
    });
}

export interface DecodedQr {
    payload: {
        version: number | null;
        event_id: number | null;
        company_id: number | null;
        vendor_id: number | null;
        website_client_id: number | null;
        subscription_plan_id: number | null;
        event_category_id: number | null;
        name: string | null;
        start_date: string | null;
        end_date: string | null;
        start_time: string | null;
        end_time: string | null;
        issued_at: string | null;
    };
    /** The live row, when the event still exists. Null if it was deleted. */
    event: ClientEvent | null;
}

/**
 * Turn a scanned QR string back into event details.
 *
 * POST, not GET: the token is the secret itself, and a GET would leave it in
 * access logs, browser history and every proxy along the way.
 */
export function useDecodeQr() {
    return useMutation({
        mutationFn: (token: string) => api.post<DecodedQr>(`${ENDPOINT}/qr/decode`, { token }),
        onError: (e) => reportError(e, 'decode'),
    });
}
