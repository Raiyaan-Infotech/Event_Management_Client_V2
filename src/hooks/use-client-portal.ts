'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import { WEBSITE_URL } from '@/lib/site';

/**
 * The signed-in client and what their plan allows.
 *
 * ── WHY NOT CALL THE TAXONOMY DIRECTLY ───────────────────────────────────────
 * `/event-categories` and `/event-menus` are the
 * ADMIN catalogue. They are admin-permission gated, and more importantly they
 * are the *whole* catalogue — showing them to a client offers options their
 * subscription plan does not include.
 *
 * `/client/event-options` returns the same data already narrowed to the
 * client's plan: the plan is scoped to a category, and
 * subscription_plan_menus lists exactly the menus it grants. One request, and
 * the portal cannot accidentally offer something unpaid for.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ClientPlan {
    id: number;
    name: string;
    plan_code: string;
    billing_cycle: string;
    short_description: string | null;
    /** A plan is scoped by category only; NULL = every category. */
    event_category_id: number | null;
    currency_code: string;
    price: string;
    trial_days: number;
    is_active: number;
    /** Plan limits. NULL = unlimited. Undefined on an older backend. */
    max_events?: number | null;
    max_guests_per_event?: number | null;
    max_photos?: number | null;
    max_videos?: number | null;
    storage_limit?: number | null;
    storage_unit?: "MB" | "GB" | null;
}

export interface ClientProfile {
    id: number;
    name: string;
    email: string;
    mobile: string | null;
    avatar_url: string | null;
    is_active: number;
    /**
     * The plan this client is assigned to, joined by `/client/me`.
     *
     * Null means there is no USABLE plan — either none was ever assigned, or the
     * one it pointed at has since been deleted. `subscription_plan_id` below is
     * what separates those two, and ClientPlanGate reports them differently.
     * A deactivated plan is returned rather than nulled, deliberately, so the
     * client can be told why their options disappeared.
     */
    plan: ClientPlan | null;
    /** The raw column. Set with `plan: null` means the plan row is gone. */
    subscription_plan_id: number | null;
    /** Template slugs hearted on the Templates screen. Null until first saved. */
    favourite_templates: string[] | null;

    /** Free text the client types about themselves, from Settings > Profile. */
    company_name: string | null;
    bio: string | null;
    dial_code: string | null;

    /** Whether each contact route has been proven. Read-only to the client. */
    email_verified: number;
    mobile_verified: number;

    /** Drives "Member Since". */
    created_at: string;

    /**
     * Whether this account has a password at all.
     *
     * A social-only sign-in has none, and the Change Password form has to say so
     * rather than asking for a current password that never existed.
     */
    has_password?: number | boolean;
}

export interface TaxonomyOption {
    id: number;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    sort_order: number;
    event_category_id?: number | null;
}

export interface MenuOption extends TaxonomyOption {
    slug: string;
    /** A label only (Core / Add-on); `is_default` decides the switch. */
    menu_group: 'core' | 'addon';
    /** 1 = Default: always on, the event cannot switch it off. 0 = Add-on. */
    is_default?: number | boolean;
    /** The menu's category; NULL = suits every category. */
    event_category_id?: number | null;
}

/**
 * An invitation template authored in the ADMIN panel (`event_templates`).
 *
 * This is the real catalogue. `lib/event-themes.ts` is the older hardcoded one
 * and is now only a FALLBACK, for events whose `theme_id` predates this table.
 *
 * The backend has already dropped anything this client's plan does not
 * entitle them to, and stripped the columns that decide that — so everything
 * here is offerable and nothing here is a gate.
 */
export interface TemplateOption {
    id: number;
    /** What goes into `events.theme_id`. A slug, so the column needs no change. */
    code: string;
    name: string;
    description: string | null;
    style: string;
    thumbnail: string | null;
    layout_style: string | null;
    background_type: 'color' | 'image' | 'gradient' | 'custom';
    background_color: string | null;
    secondary_color: string | null;
    background_image: string | null;
    gradient_from: string | null;
    gradient_via: string | null;
    gradient_to: string | null;
    gradient_type: 'linear' | 'radial';
    gradient_direction: string | null;
    overlay_enabled: boolean;
    overlay_color: string | null;
    overlay_opacity: number;
    image_position: string | null;
    image_scale: string | null;
    image_shape: 'rectangle' | 'square' | 'circle' | 'heart' | 'arch';
    corner_radius: number;
    background_position: string | null;
    image_size: number;
    orientation: 'portrait' | 'landscape';
    primary_font: string | null;
    secondary_font: string | null;
    /** Font sizes as a percentage of the standard size (60-160; 100 = unchanged). */
    primary_font_size?: number | null;
    secondary_font_size?: number | null;
    /** Draw the frame in this one colour; null = the frame's own colours. */
    frame_color?: string | null;
    /** Draw the decorations in this one colour; null = their own colours. */
    decoration_color?: string | null;
    border_style: string | null;
    /**
     * The chosen Frame Style's artwork, resolved server-side.
     *
     * When present it REPLACES `border_style` entirely — a real frame occupies
     * the margin the CSS border would sit in, and drawing both gives a double
     * edge nobody asked for. Same rule as the admin's own preview.
     */
    frame_url: string | null;
    /** Decorations, resolved and in display order. Placed by their `type`. */
    decorationItems: Array<{ id: number; name: string; type: string; file_url: string | null }>;
    /** Which invitation parts show, and in what order. */
    components: Record<string, number>;
    component_order: string[];
    /** NULL means the template suits every category. */
    event_category_id: number | null;
    is_featured: number;
    sort_order: number;
}

export interface EventOptions {
    plan: ClientPlan | null;
    /**
     * Events already created on this account against `plan.max_events` —
     * DELETED ones included, because a deleted event still spends its slot.
     * Undefined on an older backend.
     */
    events_used?: number;
    /** Why the lists are empty — null when they are not. Show it verbatim. */
    reason: string | null;
    /**
     * Fonts the admin added for templates — where to load each from. See
     * `use-template-fonts.ts`. Undefined on an older backend.
     */
    fonts?: {
        id: number;
        name: string;
        source: 'upload' | 'link';
        link_url: string | null;
        link_kind: 'stylesheet' | 'file' | null;
    }[];
    categories: TaxonomyOption[];
    menus: MenuOption[];
    /**
     * Slugs of the client-portal SIDEBAR sections the plan grants on the website
     * (`guests`, `messages`, `splash-screens`, …). Kept apart from `menus`, which
     * are event features. Undefined on an older backend — see `grantedSections`.
     */
    portal_sections?: string[];
    /** Always empty now — every granted menu is in `menus`. */
    app_features?: MenuOption[];
    /**
     * Admin-authored templates this plan allows. May be empty on an older
     * backend, so every consumer must tolerate `undefined` — which is why the
     * wizard falls back to the built-in catalogue rather than rendering nothing.
     */
    templates?: TemplateOption[];
}

export function useClientProfile() {
    return useQuery({
        queryKey: ['client', 'me'],
        queryFn: () => api.get<{ client: ClientProfile }>('/client/me').then((r) => r.client),
        staleTime: 5 * 60 * 1000,
        retry: false, // a 401 here means "not signed in" — retrying changes nothing
    });
}

export function useEventOptions() {
    return useQuery({
        queryKey: ['client', 'event-options'],
        queryFn: () => api.get<EventOptions>('/client/event-options'),
        staleTime: 5 * 60 * 1000,
        retry: false,
    });
}

/**
 * Sign out.
 *
 * The logout route lives under `/public`, NOT `/client` — it has to be callable
 * with a session that the server is about to reject, so it cannot sit behind
 * `isWebsiteClientAuthenticated`.
 *
 * The redirect is a full `window.location.assign`, not a router push: the
 * cookie is cleared by the server's Set-Cookie and the portal is a different
 * origin from the site being returned to, so a client-side navigation would
 * keep a stale cache and a dead session in memory.
 */
export function useLogout() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => api.post<unknown>('/public/website-clients/logout'),
        // onSettled, not onSuccess: if the call fails the session is already
        // unusable from the user's point of view, and trapping them in a
        // signed-in shell they cannot leave is the worse outcome.
        onSettled: () => {
            qc.clear();
            // Back to the WEBSITE, never to this portal — returning here just
            // hits the auth gate and bounces to sign-in, which reads as the
            // logout having failed.
            //
            // With no website configured there is nowhere correct to go, so the
            // page reloads instead. The gate then renders its "not configured"
            // screen, which names the missing variable — better than navigating
            // to a hardcoded guess that may be a stale domain.
            if (WEBSITE_URL) window.location.assign(WEBSITE_URL);
            else window.location.reload();
        },
        onError: (e) => {
            if (!(e instanceof ApiError)) return;
            toast.error('Signed out locally, but the server could not be reached.');
        },
    });
}

/**
 * Replace the client's favourite templates.
 *
 * The whole list goes up, not a toggle. A toggle endpoint races itself when two
 * hearts are clicked quickly — both requests read the same starting list and the
 * second overwrites the first.
 *
 * Optimistic, because a heart that waits for a round trip feels broken. The
 * previous list is captured and restored on failure, and the query is
 * invalidated on settle so the server stays the final word.
 */
export function useSetFavouriteTemplates() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (templateIds: string[]) =>
            api.put<{ favourite_templates: string[] }>('/client/favourite-templates', {
                template_ids: templateIds,
            }),
        onMutate: async (templateIds) => {
            await qc.cancelQueries({ queryKey: ['client', 'me'] });
            const previous = qc.getQueryData<ClientProfile>(['client', 'me']);
            if (previous) {
                qc.setQueryData<ClientProfile>(['client', 'me'], {
                    ...previous,
                    favourite_templates: templateIds,
                });
            }
            return { previous };
        },
        onError: (error, _vars, context) => {
            if (context?.previous) qc.setQueryData(['client', 'me'], context.previous);
            if (error instanceof ApiError && error.isAuthError) {
                toast.error('Your session has expired. Please sign in again.');
                return;
            }
            toast.error('Could not save your favourites.');
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: ['client', 'me'] });
        },
    });
}

/**
 * Update the signed-in client's own profile.
 *
 * The endpoint takes no id — it acts on the session — so there is nothing here
 * that could be aimed at another account. The server whitelist is narrower than
 * this payload looks: plan, active state and verification flags are ignored if
 * sent.
 */
export function useUpdateProfile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (patch: Partial<Pick<ClientProfile,
            'name' | 'email' | 'mobile' | 'dial_code' | 'company_name' | 'bio' | 'avatar_url'>>) =>
            api.put<{ client: ClientProfile }>('/client/me', patch).then((r) => r.client),
        onSuccess: (client) => {
            // Written straight into the cache rather than invalidated: the
            // response IS the fresh row, and a refetch would show the old values
            // for a beat before catching up.
            qc.setQueryData(['client', 'me'], client);
            toast.success('Profile updated');
        },
        onError: (error) => {
            // The server's own wording — "That email address is already in use"
            // is the only message that tells them what to do next.
            toast.error(error instanceof ApiError ? error.message : 'Could not save your profile.');
        },
    });
}

/** Change the signed-in client's password. */
export function useChangePassword() {
    return useMutation({
        mutationFn: (body: { current_password: string; new_password: string }) =>
            api.put('/client/me/password', body),
        onSuccess: () => toast.success('Password updated'),
        onError: (error) =>
            toast.error(error instanceof ApiError ? error.message : 'Could not change your password.'),
    });
}

/**
 * Close the signed-in client's own account.
 *
 * The server clears the session cookies, so there is nothing to sign out of
 * afterwards — the caller just needs to leave the portal.
 *
 * The body re-confirms identity: `password` for an account that has one, or
 * `confirm_email` (the account's own address, re-typed) for a social-only
 * client that has none. The server decides which it requires and rejects the
 * request without it, so this is not a check the UI can be talked out of.
 */
export function useDeleteAccount() {
    return useMutation({
        mutationFn: (body: { password?: string; confirm_email?: string }) =>
            api.del('/client/me', body),
        onError: (error) =>
            toast.error(error instanceof ApiError ? error.message : 'Could not close your account.'),
    });
}

/**
 * Replace the signed-in client's profile photo.
 *
 * Goes to `/client/me/avatar`, not `/media/upload` — the latter is behind the
 * ADMIN token plus a `media.upload` permission and the approval middleware, so
 * a client session gets 401 there. The client route accepts images only, caps
 * at 4MB, and writes the result straight onto `avatar_url`.
 *
 * Where the FILE lands is decided by the company's media settings, not here:
 * S3 where that is configured, local disk where it is not.
 */
export function useUploadAvatar() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (file: File) => {
            const form = new FormData();
            form.append('file', file);
            return api.put<{ client: ClientProfile }>('/client/me/avatar', form).then((r) => r.client);
        },
        onSuccess: (client) => {
            qc.setQueryData(['client', 'me'], client);
            toast.success('Photo updated');
        },
        onError: (error) =>
            toast.error(error instanceof ApiError ? error.message : 'Could not upload that photo.'),
    });
}

/** Clear it. The stored file is left in place — the server explains why. */
export function useRemoveAvatar() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => api.del<{ client: ClientProfile }>('/client/me/avatar').then((r) => r.client),
        onSuccess: (client) => {
            qc.setQueryData(['client', 'me'], client);
            toast.success('Photo removed');
        },
        onError: (error) =>
            toast.error(error instanceof ApiError ? error.message : 'Could not remove that photo.'),
    });
}
