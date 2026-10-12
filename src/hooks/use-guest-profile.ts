'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import type { RsvpBucket, ResponseType } from './use-rsvps';

/**
 * Guest Profile — the PERSON, not the invitation.
 *
 * ── ⚠ A DIFFERENT QUESTION FROM `use-rsvps` ─────────────────────────────────
 * `useRsvp(id)` asks "what did this guest say about THIS event" — one row.
 * `useGuestProfile(id)` asks "who is this person across every event", which is
 * every guest row sharing their email.
 *
 * The id is the SAME id in both cases, because an RSVP is a guest. One row,
 * two lenses.
 *
 * ── ⚠ THE LINK IS THE EMAIL, AND THE SCREEN MUST SAY SO ─────────────────────
 * `identity` carries how the profile was stitched together. A typo'd address
 * splits one person into two profiles; a shared family address merges two
 * people into one. Nothing can detect either, so the screen PRINTS
 * `identity.note` rather than presenting the result as fact.
 *
 * ── ⚠ TWO KINDS OF NOTE, AND THEY MUST NOT BE MERGED ────────────────────────
 * `guest.response_note` is what the GUEST said with their reply.
 * `notes[]` is what the HOST wrote about them.
 * Different authors, different lifetimes. The reader needs to know which.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

export type Accommodation = 'unknown' | 'required' | 'not_required';
export type NoteCategory =
    | 'general' | 'personal' | 'dietary' | 'communication' | 'reminder' | 'logistics';
export type NoteVisibility = 'internal' | 'shared';
export type ReminderStatus = 'pending' | 'done' | 'dismissed';
/** Derived server-side from `due_at` vs now — never stored. */
export type ReminderState = 'upcoming' | 'overdue' | 'done' | 'dismissed';

export interface GuestNote {
    id: number;
    title: string;
    /** HTML from the rich editor — render with dangerouslySetInnerHTML. */
    body: string;
    category: NoteCategory;
    visibility: NoteVisibility;
    is_pinned: boolean;
    created_at: string;
    updated_at: string;
    edited: boolean;
    author: string | null;
}

export interface GuestTag {
    id: number;
    label: string;
    color: string | null;
    /** Present when `color` is null, so no screen owns the fallback. */
    tint: string | null;
}

export interface GuestReminder {
    id: number;
    note_id: number | null;
    title: string;
    due_at: string;
    status: ReminderStatus;
    completed_at: string | null;
    state: ReminderState;
}

export interface ProfileMessage {
    id: number;
    guest_id: number;
    channel: 'whatsapp' | 'email' | 'sms';
    kind: string;
    status: 'queued' | 'sent' | 'delivered' | 'failed';
    sent_at: string | null;
    delivered_at: string | null;
    opened_at: string | null;
    sender: 'client' | 'system';
    sender_name: string | null;
    event: { id: number; name: string; start_date: string } | null;
}

export interface ResponseHistoryEntry {
    id: number;
    /** NULL only on a first entry — NOT the same as 'none'. */
    from_response_type: ResponseType | null;
    to_response_type: ResponseType;
    party_size: number;
    dietary_preference: string | null;
    accommodation: Accommodation;
    notes: string | null;
    source: 'client' | 'guest' | 'import' | 'system';
    changed_at: string;
    is_first: boolean;
    event: { id: number; name: string; start_date: string } | null;
}

export interface LinkedEvent {
    id: number;
    is_current: boolean;
    rsvp_status: string;
    response_type: ResponseType;
    responded_at: string | null;
    invited_at: string | null;
    /** "Not sent yet" reads differently from "sent, no reply". */
    invitation_sent: boolean;
    party_size: number;
    accommodation: Accommodation;
    dietary_preference: string | null;
    event: {
        id: number; name: string; start_date: string;
        start_time: string | null; venue_name: string | null;
    } | null;
}

export interface GuestProfile {
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
        photo: string | null;
        relationship: string | null;
        accommodation: Accommodation;
        location: string | null;
        city: string | null;
        state: string | null;
        country: string | null;
        group: { id: number; name: string; color: string | null } | null;
        rsvp_status: string;
        response_type: ResponseType;
        responded_at: string | null;
        invited_at: string | null;
        party_size: number;
        dietary_preference: string | null;
        special_requirements: string | null;
        /** ⚠ The GUEST's own note. Not `notes[]`. */
        response_note: string | null;
        custom_answers: Record<string, unknown> | null;
        created_at: string;
    };
    event: { id: number; name: string; start_date: string; start_time: string | null; venue_name: string | null } | null;
    identity: {
        linked_by: 'email' | 'none';
        email: string | null;
        guest_row_ids: number[];
        events_invited: number;
        note: string;
    };
    summary: {
        events_invited: number;
        last_contact: string | null;
        total_messages: number;
        opened: number;
        delivered: number;
        pending: number;
        notes: number;
        reminders_open: number;
    };
    linked_events: LinkedEvent[];
    messages: ProfileMessage[];
    response_history: ResponseHistoryEntry[];
    notes: GuestNote[];
    tags: GuestTag[];
    reminders: GuestReminder[];
    unavailable: Record<string, string>;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Labels
 * ────────────────────────────────────────────────────────────────────────── */

export const NOTE_CATEGORIES: { value: NoteCategory; label: string }[] = [
    { value: 'general', label: 'General' },
    { value: 'personal', label: 'Personal' },
    { value: 'dietary', label: 'Dietary' },
    { value: 'communication', label: 'Communication' },
    { value: 'reminder', label: 'Reminder' },
    { value: 'logistics', label: 'Logistics' },
];

export const CATEGORY_STYLE: Record<NoteCategory, string> = {
    general: 'bg-slate-500/12 text-slate-600 dark:text-slate-300',
    personal: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
    dietary: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    communication: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
    reminder: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
    logistics: 'bg-cyan-500/12 text-cyan-600 dark:text-cyan-400',
};

/** Matches the server's `tintFor`, which derives from the label. */
export const TINT_STYLE: Record<string, string> = {
    violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
    emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    blue: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
    amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
    pink: 'bg-pink-500/12 text-pink-600 dark:text-pink-400',
    cyan: 'bg-cyan-500/12 text-cyan-600 dark:text-cyan-400',
};

export const REMINDER_STYLE: Record<ReminderState, string> = {
    upcoming: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
    overdue: 'bg-destructive/12 text-destructive',
    done: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    dismissed: 'bg-muted text-muted-foreground',
};

export const REMINDER_LABEL: Record<ReminderState, string> = {
    upcoming: 'Upcoming',
    overdue: 'Overdue',
    done: 'Done',
    dismissed: 'Dismissed',
};

export const ACCOMMODATION_LABEL: Record<Accommodation, string> = {
    /* "—", not "No". Nobody asked, which is not the same as declining a room. */
    unknown: '—',
    required: 'Required',
    not_required: 'Not required',
};

export const RESPONSE_LABEL: Record<ResponseType, string> = {
    none: 'No response',
    yes: 'Accepted',
    no: 'Declined',
    maybe: 'Maybe',
};

export const RESPONSE_STYLE: Record<ResponseType, string> = {
    none: 'bg-muted text-muted-foreground',
    yes: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    no: 'bg-destructive/12 text-destructive',
    maybe: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
};

/** Delivery, said in the server's own vocabulary. */
export const DELIVERY_STYLE: Record<string, string> = {
    queued: 'bg-muted text-muted-foreground',
    sent: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
    delivered: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    failed: 'bg-destructive/12 text-destructive',
};

export const bucketOf = (r: ResponseType): RsvpBucket =>
    r === 'yes' ? 'accepted' : r === 'no' ? 'declined' : r === 'maybe' ? 'maybe' : 'no_response';

/* ─────────────────────────────────────────────────────────────────────────────
 * Queries
 * ────────────────────────────────────────────────────────────────────────── */

const KEY = ['guest-profile'];

export function useGuestProfile(id: number | null) {
    return useQuery({
        queryKey: [...KEY, id],
        queryFn: () => api.get<GuestProfile>(`/client/guests/${id}/profile`),
        enabled: id !== null && Number.isFinite(id),
        staleTime: 30 * 1000,
    });
}

/**
 * One mutation factory for all nine writes.
 *
 * Every one of them changes something the profile renders, so every one
 * invalidates the same three keys — the profile itself, and the RSVP and guest
 * lists, which show counts derived from the same rows. Writing that out nine
 * times is nine chances for one of them to be forgotten.
 */
function useProfileMutation<V>(
    fn: (vars: V) => Promise<unknown>,
    messages: { success: string; failure: string },
) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: () => {
            toast.success(messages.success);
            for (const key of [KEY, ['rsvps'], ['guests']]) {
                qc.invalidateQueries({ queryKey: key, refetchType: 'all' });
            }
        },
        onError: (error) =>
            toast.error(error instanceof ApiError ? error.message : messages.failure),
    });
}

/* ── Profile fields ──────────────────────────────────────────────────────── */

/**
 * ⚠ Photo and relationship ONLY.
 *
 * Name, email and phone belong to the Guests form. The server refuses them
 * here regardless; this is the client agreeing with the API rather than a
 * second copy of the rule that can drift out of step with it.
 */
export function useUpdateGuestProfile() {
    return useProfileMutation<{ id: number; photo?: string | null; relationship?: string | null }>(
        ({ id, ...body }) => api.put(`/client/guests/${id}/profile`, body),
        { success: 'Profile updated', failure: 'Could not update that profile.' },
    );
}

/* ── Notes ───────────────────────────────────────────────────────────────── */

export interface NoteInput {
    title: string;
    body?: string;
    category?: NoteCategory;
    visibility?: NoteVisibility;
    is_pinned?: boolean;
}

export function useCreateNote(onDone?: () => void) {
    const m = useProfileMutation<{ id: number } & NoteInput>(
        ({ id, ...body }) => api.post(`/client/guests/${id}/notes`, body),
        { success: 'Note added', failure: 'Could not add that note.' },
    );
    return { ...m, mutate: (v: { id: number } & NoteInput) => m.mutate(v, { onSuccess: onDone }) };
}

export function useUpdateNote(onDone?: () => void) {
    const m = useProfileMutation<{ id: number; noteId: number } & Partial<NoteInput>>(
        ({ id, noteId, ...body }) => api.put(`/client/guests/${id}/notes/${noteId}`, body),
        { success: 'Note updated', failure: 'Could not update that note.' },
    );
    return {
        ...m,
        mutate: (v: { id: number; noteId: number } & Partial<NoteInput>) =>
            m.mutate(v, { onSuccess: onDone }),
    };
}

export function useDeleteNote() {
    return useProfileMutation<{ id: number; noteId: number }>(
        ({ id, noteId }) => api.del(`/client/guests/${id}/notes/${noteId}`),
        { success: 'Note deleted', failure: 'Could not delete that note.' },
    );
}

/* ── Tags ────────────────────────────────────────────────────────────────── */

export function useAddTag() {
    return useProfileMutation<{ id: number; label: string; color?: string }>(
        ({ id, ...body }) => api.post(`/client/guests/${id}/tags`, body),
        { success: 'Tag added', failure: 'Could not add that tag.' },
    );
}

export function useRemoveTag() {
    return useProfileMutation<{ id: number; tagId: number }>(
        ({ id, tagId }) => api.del(`/client/guests/${id}/tags/${tagId}`),
        { success: 'Tag removed', failure: 'Could not remove that tag.' },
    );
}

/* ── Reminders ───────────────────────────────────────────────────────────── */

export function useCreateReminder(onDone?: () => void) {
    const m = useProfileMutation<{ id: number; title: string; due_at: string; note_id?: number }>(
        ({ id, ...body }) => api.post(`/client/guests/${id}/reminders`, body),
        { success: 'Reminder added', failure: 'Could not add that reminder.' },
    );
    return {
        ...m,
        mutate: (v: { id: number; title: string; due_at: string; note_id?: number }) =>
            m.mutate(v, { onSuccess: onDone }),
    };
}

export function useUpdateReminder() {
    return useProfileMutation<{
        id: number; reminderId: number;
        title?: string; due_at?: string; status?: ReminderStatus;
    }>(
        ({ id, reminderId, ...body }) => api.put(`/client/guests/${id}/reminders/${reminderId}`, body),
        { success: 'Reminder updated', failure: 'Could not update that reminder.' },
    );
}

export function useDeleteReminder() {
    return useProfileMutation<{ id: number; reminderId: number }>(
        ({ id, reminderId }) => api.del(`/client/guests/${id}/reminders/${reminderId}`),
        { success: 'Reminder deleted', failure: 'Could not delete that reminder.' },
    );
}
