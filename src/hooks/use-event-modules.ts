'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';

/**
 * The event modules the mobile app manages and this portal now manages too
 * (Jamal, 2026-10-12 — the portal had fallen behind the app): Family, Agenda,
 * Gallery, Organizer Contact, Participants Settings and RSVP Settings.
 *
 * Every call is the SAME endpoint the app uses, so a change made here shows on
 * the phone and the other way round. Nothing is duplicated server-side.
 *
 * ── "SHOW IN EVENT APP" ──────────────────────────────────────────────────────
 * For Family and Agenda that switch is the module's MENU in the event's
 * `menu_ids` (never a column of its own). [useSetMenuShown] saves it with the
 * normal event update, like the app. A Default menu is locked on.
 */

const eventKey = (eventId: number, ...rest: (string | number)[]) =>
    ['client', 'event-module', eventId, ...rest] as const;

function report(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.isAuthError) {
        toast.error('Your session has expired. Please sign in again.');
        return;
    }
    toast.error(error instanceof Error ? error.message : fallback);
}

/** Saves `menu_ids` with the event's own update — the "Show in Event App" switch. */
export function useSetMenuShown(eventId: number, currentMenuIds: number[]) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ menuId, show }: { menuId: number; show: boolean }) => {
            const ids = new Set(currentMenuIds);
            if (show) ids.add(menuId); else ids.delete(menuId);
            return api.put(`/client/events/${eventId}`, { menu_ids: [...ids] });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['client', 'event-module', eventId], refetchType: 'all' });
            qc.invalidateQueries({ queryKey: ['client', 'events'], refetchType: 'all' });
        },
        onError: (e) => report(e, 'Could not change this switch'),
    });
}

/* ── Family ────────────────────────────────────────────────────────────────── */

export interface FamilySettings {
    profile_screen: boolean;
    profile_photo: boolean;
    name: true;
    relationship: boolean;
}

export interface FamilyMember {
    id: number;
    event_id: number;
    title: string | null;
    full_name: string;
    side: 'groom' | 'bride';
    sort_order: number;
    photo: string | null;
    relationship: string | null;
    relationship_option_id: number | null;
    date_of_birth: string | null;
    dial_code: string | null;
    mobile: string | null;
    email: string | null;
    notes: string | null;
    /** false = Hide from App (the organizer still sees the member). */
    is_visible: boolean;
    /** Highlight as Key Family Member. */
    is_key: boolean;
    created_at?: string | null;
}

export interface FamilyPage {
    items: FamilyMember[];
    settings: FamilySettings;
    menu_id: number | null;
    is_default: boolean;
    show_in_app: boolean;
    can_edit: boolean;
}

export interface FamilyPayload {
    /** The whole name in one field (the web form); or first_name + last_name (the app). */
    name?: string;
    first_name?: string;
    last_name?: string | null;
    title?: string | null;
    side: 'groom' | 'bride';
    relationship: string;
    relationship_option_id?: number | null;
    email?: string | null;
    mobile?: string | null;
    dial_code?: string | null;
    date_of_birth?: string | null;
    notes?: string | null;
    photo?: string | null;
    is_visible?: boolean;
    is_key?: boolean;
}

export function useEventFamily(eventId: number) {
    return useQuery({
        queryKey: eventKey(eventId, 'family'),
        queryFn: () => api.get<FamilyPage>(`/client/events/${eventId}/family-members`),
        retry: false,
    });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, eventId: number, part: string) {
    qc.invalidateQueries({ queryKey: eventKey(eventId, part), refetchType: 'all' });
}

export function useSaveFamilyMember(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        // A partial body on update (Change Photo sends only `photo`).
        mutationFn: ({ id, data }: { id?: number; data: FamilyPayload | Partial<FamilyPayload>; done?: string | null }) => (id
            ? api.put(`/client/family-members/${id}`, data)
            : api.post(`/client/events/${eventId}/family-members`, data)),
        onSuccess: (_r, v) => {
            // `done`: the toast; null = none (the form shows its own result page).
            const msg = v.done === undefined ? (v.id ? 'Family member updated' : 'Family member added') : v.done;
            if (msg) toast.success(msg);
            invalidate(qc, eventId, 'family');
        },
        onError: (e) => report(e, 'Could not save this family member'),
    });
}

export function useDeleteFamilyMember(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.del(`/client/family-members/${id}`),
        onSuccess: () => {
            toast.success('Family member deleted');
            invalidate(qc, eventId, 'family');
        },
        onError: (e) => report(e, 'Could not delete this family member'),
    });
}

export function useReorderFamily(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (ids: number[]) => api.put(`/client/events/${eventId}/family-members/reorder`, { ids }),
        onSuccess: () => invalidate(qc, eventId, 'family'),
        onError: (e) => report(e, 'Could not save the order'),
    });
}

export function useSaveFamilySettings(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (s: Omit<FamilySettings, 'name'>) => api.put(`/client/events/${eventId}/family-settings`, s),
        onSuccess: () => {
            toast.success('Family settings saved');
            invalidate(qc, eventId, 'family');
        },
        onError: (e) => report(e, 'Could not save the family settings'),
    });
}

/** One upload for any of the "picture" fields — the existing guest photo route. */
export function useUploadPhoto() {
    return useMutation({
        mutationFn: (file: File) => {
            const form = new FormData();
            form.append('file', file);
            return api.post<{ url: string }>('/client/guests/photo', form).then((r) => r.url);
        },
        onError: (e) => report(e, 'Could not upload that photo'),
    });
}

/* ── Agenda ────────────────────────────────────────────────────────────────── */

export interface AgendaItem {
    id: number;
    event_id: number;
    title: string;
    description: string | null;
    agenda_date: string;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    images: string[];
    sort_order: number;
}

export interface AgendaPage {
    items: AgendaItem[];
    days: string[];
    menu_id: number | null;
    is_default: boolean;
    show_in_app: boolean;
    can_edit: boolean;
}

export type AgendaPayload = Partial<Omit<AgendaItem, 'id' | 'event_id' | 'sort_order'>>;

export function useEventAgenda(eventId: number) {
    return useQuery({
        queryKey: eventKey(eventId, 'agenda'),
        queryFn: () => api.get<AgendaPage>(`/client/events/${eventId}/agenda`),
        retry: false,
    });
}

export function useSaveAgendaItem(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        // `done`: the toast ("Agenda moved"); null = none (the Add success page).
        mutationFn: ({ id, data }: { id?: number; data: AgendaPayload; done?: string | null }) => (id
            ? api.put(`/client/agenda/${id}`, data)
            : api.post(`/client/events/${eventId}/agenda`, data)),
        onSuccess: (_r, v) => {
            const msg = v.done === undefined ? (v.id ? 'Agenda updated' : 'Agenda added') : v.done;
            if (msg) toast.success(msg);
            invalidate(qc, eventId, 'agenda');
        },
        onError: (e) => report(e, 'Could not save this agenda item'),
    });
}

export function useDeleteAgendaItem(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.del(`/client/agenda/${id}`),
        onSuccess: () => {
            toast.success('Agenda deleted');
            invalidate(qc, eventId, 'agenda');
        },
        onError: (e) => report(e, 'Could not delete this agenda item'),
    });
}

/** The app's Actions → Duplicate Agenda. */
export function useDuplicateAgendaItem(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.post(`/client/agenda/${id}/duplicate`),
        onSuccess: () => {
            toast.success('Agenda duplicated');
            invalidate(qc, eventId, 'agenda');
        },
        onError: (e) => report(e, 'Could not duplicate this agenda item'),
    });
}

/** One agenda image; returns its stored URL for the item's `images`. */
export async function uploadAgendaImage(eventId: number, file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<{ url: string }>(`/client/events/${eventId}/agenda/media`, form);
    return res.url;
}

/* ── Gallery ───────────────────────────────────────────────────────────────── */

export interface GalleryItem {
    id: number;
    event_id: number;
    type: 'image' | 'video';
    url: string;
    thumbnail_url: string | null;
    file_name: string | null;
    size_bytes: number;
    category_id: number | null;
    caption: string | null;
    show_in_app: boolean;
    /** A Short (Upload Short), and a video's / short's own title and description. */
    is_short?: boolean;
    title?: string | null;
    description?: string | null;
    duration_seconds?: number | null;
    created_at?: string | null;
}

export interface GalleryCategory {
    id: number;
    name: string;
    description: string | null;
    /** What the host chose; null = none (the list then shows the first photo). */
    cover_image?: string | null;
    /** What a list draws: the chosen cover, else the first photo. */
    cover_url: string | null;
    is_default: boolean;
    item_count: number;
    sort_order?: number;
}

export interface GalleryUsage {
    photos: { used: number; limit: number | null };
    videos: { used: number; limit: number | null };
    storage: { used_mb: number; limit_mb: number | null; used_bytes?: number; limit_bytes?: number | null };
    max_image_bytes: number;
    max_video_bytes: number;
}

export interface GalleryPage {
    items: GalleryItem[];
    categories: GalleryCategory[];
    usage: GalleryUsage;
    can_upload: boolean;
}

/** `categoryId` 0 = the built-in Gallery; undefined = everything. */
export function useEventGallery(eventId: number, categoryId?: number) {
    return useQuery({
        queryKey: eventKey(eventId, 'gallery', categoryId ?? 'all'),
        queryFn: () => api.get<GalleryPage>(
            `/client/events/${eventId}/gallery${categoryId === undefined ? '' : `?category_id=${categoryId}`}`,
        ),
        retry: false,
    });
}

export function useUploadGalleryItem(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ file, categoryId }: { file: File; categoryId?: number }) => {
            const form = new FormData();
            form.append('file', file);
            if (categoryId !== undefined) form.append('category_id', String(categoryId));
            return api.post(`/client/events/${eventId}/gallery`, form);
        },
        onSuccess: () => invalidate(qc, eventId, 'gallery'),
        onError: (e) => report(e, 'Could not upload that file'),
    });
}

export function useUpdateGalleryItem(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<Pick<GalleryItem, 'caption' | 'show_in_app' | 'category_id' | 'title' | 'description'>> }) =>
            api.put(`/client/gallery/${id}`, data),
        onSuccess: () => invalidate(qc, eventId, 'gallery'),
        onError: (e) => report(e, 'Could not update that item'),
    });
}

export function useDeleteGalleryItem(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.del(`/client/gallery/${id}`),
        onSuccess: () => {
            toast.success('Removed');
            invalidate(qc, eventId, 'gallery');
        },
        onError: (e) => report(e, 'Could not remove that item'),
    });
}

/**
 * New order for the items sent (usually one category's). They take back the
 * slots they already held, so other categories do not move in "All".
 */
export function useReorderGallery(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (ids: number[]) => api.put(`/client/events/${eventId}/gallery/reorder`, { ids }),
        onSuccess: () => invalidate(qc, eventId, 'gallery'),
        onError: (e) => report(e, 'Could not save the new order'),
    });
}

/** Stores a category cover image and returns its URL — saved with the category. */
export function useUploadGalleryCover(eventId: number) {
    return useMutation({
        mutationFn: (file: File) => {
            const form = new FormData();
            form.append('file', file);
            return api.post<{ url: string }>(`/client/events/${eventId}/gallery/categories/cover`, form);
        },
        onError: (e) => report(e, 'Could not upload that image'),
    });
}

export function useSaveGalleryCategory(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: { name?: string; description?: string | null; cover_image?: string | null; position?: number | null } }) => (id
            ? api.put(`/client/gallery/categories/${id}`, data)
            : api.post(`/client/events/${eventId}/gallery/categories`, data)),
        onSuccess: (_r, v) => {
            toast.success(v.id ? 'Category updated' : 'Category added');
            invalidate(qc, eventId, 'gallery');
        },
        onError: (e) => report(e, 'Could not save this category'),
    });
}

export function useDeleteGalleryCategory(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.del(`/client/gallery/categories/${id}`),
        onSuccess: () => {
            toast.success('Category removed — its photos moved to Gallery');
            invalidate(qc, eventId, 'gallery');
        },
        onError: (e) => report(e, 'Could not remove this category'),
    });
}

/* ── Organizer Contact ─────────────────────────────────────────────────────── */

/** The event's Contact Person — the app's Edit Contact fields. */
export interface OrganizerContact {
    name: string | null;
    photo: string | null;
    mobile: string | null;
    email: string | null;
    designation: string | null;
    whatsapp: string | null;
    address: string | null;
    time_from: string | null;
    time_to: string | null;
    languages: string[];
    about: string | null;
}

export function useOrganizerContact(eventId: number) {
    return useQuery({
        queryKey: eventKey(eventId, 'contact'),
        queryFn: () => api.get<{ contact: OrganizerContact }>(`/client/events/${eventId}/organizer-contact`).then((r) => r.contact),
        retry: false,
    });
}

export function useSaveOrganizerContact(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: Partial<OrganizerContact>) => api.put(`/client/events/${eventId}/organizer-contact`, data),
        onSuccess: () => {
            toast.success('Organizer contact saved');
            invalidate(qc, eventId, 'contact');
        },
        onError: (e) => report(e, 'Could not save the organizer contact'),
    });
}

export function useUploadOrganizerPhoto() {
    return useMutation({
        mutationFn: (file: File) => {
            const form = new FormData();
            form.append('file', file);
            return api.post<{ url: string }>('/client/events/organizer-photo', form).then((r) => r.url);
        },
        onError: (e) => report(e, 'Could not upload that photo'),
    });
}

/* ── Participants Settings ─────────────────────────────────────────────────── */

export interface ParticipantSettings {
    profile_screen: boolean;
    profile_photo: boolean;
    name: true;
    relationship: boolean;
    /** Shown to other participants (off by default) — as the app. */
    mobile: boolean;
    email: boolean;
}

export function useParticipantSettings(eventId: number) {
    return useQuery({
        queryKey: eventKey(eventId, 'participant-settings'),
        queryFn: () => api
            .get<{ settings: ParticipantSettings }>(`/client/events/${eventId}/participant-settings`)
            .then((r) => r.settings),
        retry: false,
    });
}

export function useSaveParticipantSettings(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (s: Omit<ParticipantSettings, 'name'>) =>
            api.put(`/client/events/${eventId}/participant-settings`, s),
        onSuccess: () => {
            toast.success('Participant settings saved');
            invalidate(qc, eventId, 'participant-settings');
        },
        onError: (e) => report(e, 'Could not save the participant settings'),
    });
}

/* ── RSVP Settings ─────────────────────────────────────────────────────────── */

export type RsvpAnswer = 'yes' | 'no' | 'maybe';

export interface RsvpSettings {
    enabled: boolean;
    response_options: RsvpAnswer[];
    deadline: string | null;
    effective_deadline: string | null;
    allow_guest_count: boolean;
    allow_special_requests: boolean;
    allow_relationship: boolean;
    allow_food_preference: boolean;
}

export function useRsvpSettings(eventId: number) {
    return useQuery({
        queryKey: eventKey(eventId, 'rsvp-settings'),
        queryFn: () => api.get<{ settings: RsvpSettings; event_end_date: string | null }>(
            `/client/events/${eventId}/rsvp-settings`,
        ),
        retry: false,
    });
}

export function useSaveRsvpSettings(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (s: Partial<Omit<RsvpSettings, 'effective_deadline'>>) =>
            api.put(`/client/events/${eventId}/rsvp-settings`, s),
        onSuccess: () => {
            toast.success('RSVP settings saved');
            invalidate(qc, eventId, 'rsvp-settings');
        },
        onError: (e) => report(e, 'Could not save the RSVP settings'),
    });
}

/* ── Relation options for the Family form ──────────────────────────────────── */

export interface RelationOption { id: number; name: string }

/** The admin's relation list for THIS event's category ("Bride's Father", …). */
export function useRelationOptions(eventId: number) {
    return useQuery({
        queryKey: eventKey(eventId, 'relations'),
        queryFn: () => api
            .get<{ relationship_options: RelationOption[] }>('/client/guests/form-options', { event_id: eventId })
            .then((r) => r.relationship_options ?? []),
        staleTime: 5 * 60 * 1000,
        retry: false,
    });
}

/**
 * Whether a relation suits a side — the app's `relationSuitsSide`: a name that
 * starts with "Bride" is left out under Groom and "Groom…" under Bride; a name
 * that mentions neither suits both.
 */
export function relationSuitsSide(name: string, side: 'groom' | 'bride' | null): boolean {
    if (!side) return true;
    const n = name.trim().toLowerCase();
    if (side === 'groom' && n.startsWith('bride')) return false;
    if (side === 'bride' && n.startsWith('groom')) return false;
    return true;
}


/** Edit Media → Change Cover: a video's / short's poster, after upload. */
export function useReplaceGalleryCover(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, file }: { id: number; file: File }) => {
            const form = new FormData();
            form.append('file', file);
            return api.post(`/client/gallery/${id}/cover`, form);
        },
        onSuccess: () => { toast.success('Cover updated'); invalidate(qc, eventId, 'gallery'); },
        onError: (e) => report(e, 'Could not change the cover'),
    });
}

/**
 * Upload Short — the app's flow on the web: a video of up to a minute, optional
 * background music (it replaces the clip's sound, fitted by the server from
 * `musicStart` seconds), Remove Audio, an optional cover, title * and
 * description, into one album.
 */
export function useUploadShort(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: {
            file: File; music?: File | null; musicStart?: number; mute?: boolean; cover?: File | null;
            title: string; description?: string; categoryId?: number;
            /** Seconds of the original to keep — the server cuts the clip (the browser cannot). */
            trimStart?: number; trimEnd?: number;
        }) => {
            const form = new FormData();
            form.append('file', v.file);
            if (v.music) form.append('music', v.music);
            if (v.cover) form.append('cover', v.cover);
            form.append('title', v.title);
            if (v.description) form.append('description', v.description);
            if (v.music && v.musicStart) form.append('music_start', String(v.musicStart));
            if (v.mute && !v.music) form.append('mute', 'true');
            if (v.categoryId !== undefined && v.categoryId > 0) form.append('category_id', String(v.categoryId));
            if (v.trimEnd !== undefined) { form.append('trim_start', String(v.trimStart ?? 0)); form.append('trim_end', String(v.trimEnd)); }
            return api.post(`/client/events/${eventId}/gallery/shorts`, form);
        },
        onSuccess: () => invalidate(qc, eventId, 'gallery'),
        onError: (e) => report(e, 'Could not upload the short'),
    });
}
