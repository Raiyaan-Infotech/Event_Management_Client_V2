'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, type ListResult } from '@/lib/api-client';

/**
 * Splash Screens — `/api/v1/client/splash-screens`.
 *
 * ── THE SPLASH IS THE EVENT'S INVITATION ────────────────────────────────────
 * Since the app's splash rebuild (session 57, §756) a splash is no longer a
 * background / sound / animation / button design. It is the invitation the host
 * already chose for the event, drawn with the splash's OWN Primary and
 * Secondary colour and its own section switches. That is all this screen edits.
 *
 * The old fields (background type and files, sound, animation, button, the
 * show_couple_name / show_event_date / show_tagline switches) were dropped
 * from the table, and the server ignores them if sent.
 *
 * ── ONE EVENT, ONE SPLASH ───────────────────────────────────────────────────
 * `event_id` is UNIQUE server-side. `event_name` is copied from the event and
 * read-only. The QR code and Organizer & Contact never appear on a splash: the
 * server forces `event_qr_code`, `organizer` and `contact_details` OFF on every
 * write and read, so this form neither offers nor sends them as on.
 */

const ENDPOINT = '/client/splash-screens';
const KEY = ['client', 'splash-screens'] as const;

export type SplashStatus = 'draft' | 'active';

/** The section switches a splash offers, in the order the invitation draws them. */
export const SPLASH_SWITCHES = [
    { key: 'event_title', label: 'Show Title' },
    { key: 'host_names', label: 'Show Names' },
    { key: 'invitation_message', label: 'Show Invitation Message' },
    { key: 'date_time', label: 'Show Date & Time' },
    { key: 'venue', label: 'Show Venue' },
    { key: 'footer_note', label: 'Show Footer Note' },
] as const;

/** Never on a splash, with no switch to turn them on. */
export const SPLASH_HIDDEN_KEYS = ['event_qr_code', 'organizer', 'contact_details'] as const;

export interface SplashScreen {
    id: number;
    name: string;
    main_title: string;
    /** Derived from `event_id` by the server — never sent by the form. */
    event_name: string;
    /** Null only on rows saved before splashes were tied to events. */
    event_id: number | null;

    /** The invitation template (its code) the splash mirrors. */
    theme_id: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    /** Section on/off; null = inherit the invitation's own. */
    components: Record<string, boolean | number> | null;
    component_order: string[] | null;

    status: SplashStatus;
    created_at: string;
    updated_at: string;
}

export type SplashScreenPayload = {
    event_id?: number;
    name?: string;
    main_title?: string;
    background_type?: string;
    loader_enabled?: boolean;
    theme_id?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    components?: Record<string, boolean> | null;
    component_order?: string[] | null;
    bg_color?: null;
    decoration_url?: null;
    background_config?: Record<string, unknown> | null;
    status?: SplashStatus;
};

function reportError(error: unknown, verb: string) {
    if (error instanceof ApiError && error.isAuthError) {
        toast.error('Your session has expired. Please sign in again.');
        return;
    }
    toast.error(error instanceof Error ? error.message : `Failed to ${verb} splash screen`);
}

export function useSplashScreens(params: { search?: string; page?: number; limit?: number } = {}) {
    return useQuery({
        queryKey: [...KEY, 'list', params],
        queryFn: (): Promise<ListResult<SplashScreen>> =>
            api.getList<SplashScreen>(ENDPOINT, {
                search: params.search || undefined,
                page: params.page ?? 1,
                limit: params.limit ?? 12,
            }),
        retry: false,
    });
}

export function useSplashScreen(id: number | undefined) {
    return useQuery({
        queryKey: [...KEY, id],
        queryFn: () =>
            api.get<{ splash_screen: SplashScreen }>(`${ENDPOINT}/${id}`).then((r) => r.splash_screen),
        enabled: !!id,
        retry: false,
    });
}

export function useCreateSplashScreen(onDone?: (splash: SplashScreen) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: SplashScreenPayload) =>
            api.post<{ splash_screen: SplashScreen }>(ENDPOINT, data).then((r) => r.splash_screen),
        onSuccess: (splash) => {
            toast.success('Splash screen created successfully');
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            onDone?.(splash);
        },
        onError: (e) => reportError(e, 'create'),
    });
}

export function useUpdateSplashScreen(onDone?: (splash: SplashScreen) => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: SplashScreenPayload }) =>
            api.put<{ splash_screen: SplashScreen }>(`${ENDPOINT}/${id}`, data).then((r) => r.splash_screen),
        onSuccess: (splash) => {
            toast.success('Splash screen updated successfully');
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
            onDone?.(splash);
        },
        onError: (e) => reportError(e, 'update'),
    });
}

export function useDeleteSplashScreen() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.del(`${ENDPOINT}/${id}`),
        onSuccess: () => {
            toast.success('Splash screen deleted');
            qc.invalidateQueries({ queryKey: KEY, refetchType: 'all' });
        },
        onError: (e) => reportError(e, 'delete'),
    });
}
