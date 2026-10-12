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
    first_name: string;
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
        mutationFn: ({ id, data }: { id?: number; data: FamilyPayload }) => (id
            ? api.put(`/client/family-members/${id}`, data)
            : api.post(`/client/events/${eventId}/family-members`, data)),
        onSuccess: (_r, v) => {
            toast.success(v.id ? 'Family member updated' : 'Family member added');
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
        mutationFn: ({ id, data }: { id?: number; data: AgendaPayload }) => (id
            ? api.put(`/client/agenda/${id}`, data)
            : api.post(`/client/events/${eventId}/agenda`, data)),
        onSuccess: (_r, v) => {
            toast.success(v.id ? 'Agenda updated' : 'Agenda added');
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
}

export interface GalleryCategory {
    id: number;
    name: string;
    description: string | null;
    cover_url: string | null;
    is_default: boolean;
    item_count: number;
}

export interface GalleryUsage {
    photos: { used: number; limit: number | null };
    videos: { used: number; limit: number | null };
    storage: { used_mb: number; limit_mb: number | null };
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
        mutationFn: ({ id, data }: { id: number; data: Partial<Pick<GalleryItem, 'caption' | 'show_in_app' | 'category_id'>> }) =>
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

export function useSaveGalleryCategory(eventId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: { name?: string; description?: string | null } }) => (id
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

export interface OrganizerContact {
    name: string | null;
    photo: string | null;
    mobile: string | null;
    email: string | null;
    address: string | null;
    description: string | null;
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
    attendance_status: boolean;
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
