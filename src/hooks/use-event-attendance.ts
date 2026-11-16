'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';

/**
 * Event Attendance — client portal → event → QR Code → Event Attendance (Jamal's design, 2026-11-16).
 * Backend: /client/events/:id/attendance (clientAttendance.service). The check-ins themselves happen
 * on the mobile side (QR scan); this is the list + the organizer's Verify / Mark Attendance.
 */

export type CheckInSource = 'event_qr' | 'manual' | 'self_link';

export interface AttendanceRow {
    id: number;
    participant_code: string;
    name: string;
    photo: string | null;
    dial_code: string;
    mobile: string | null;
    email: string | null;
    relation: string | null;
    relationship: string | null;
    rsvp_status: string;
    party_size: number;
    is_blocked: boolean;
    joined_app: boolean;
    registered_at: string | null;
    attendance: 'attended' | 'not_attended';
    checked_in_at: string | null;
    checked_in_by_name: string | null;
    check_in_source: CheckInSource | null;
    check_in_note: string | null;
    verification: 'verified' | 'pending';
    verified_at: string | null;
    verified_by_name: string | null;
    verify_method: 'qr' | 'manual' | null;
    verify_note: string | null;
}

export interface AttendanceDetail extends AttendanceRow {
    history: { type: 'registered' | 'verified' | 'checked_in'; at: string; label: string; by?: string | null }[];
}

export interface AttendanceStats {
    total: number;
    attended: number; attended_pct: number;
    verified: number; verified_pct: number;
    not_attended: number; not_attended_pct: number;
    total_scans: number;
}

export interface AttendanceQuery {
    search?: string;
    attendance?: 'all' | 'attended' | 'not_attended';
    verification?: 'all' | 'verified' | 'pending';
    relationship?: string;
    page?: number;
    limit?: number;
}

interface AttendanceList {
    stats: AttendanceStats;
    relationships: string[];
    rows: AttendanceRow[];
    pagination: { page: number; limit: number; totalItems: number; totalPages: number };
}

const KEY = ['client', 'attendance'] as const;

const report = (e: unknown, fallback: string) => toast.error(e instanceof ApiError ? e.message : fallback);

export function useAttendance(eventId: number, query: AttendanceQuery) {
    return useQuery({
        queryKey: [...KEY, eventId, query],
        placeholderData: keepPreviousData,
        queryFn: () => api.get<AttendanceList>(`/client/events/${eventId}/attendance`, query as Record<string, string | number | undefined>),
    });
}

export function useAttendanceDetail(eventId: number, participantId: number | null) {
    return useQuery({
        queryKey: [...KEY, eventId, 'one', participantId],
        enabled: !!participantId,
        queryFn: () => api.get<{ participant: AttendanceDetail }>(`/client/events/${eventId}/attendance/${participantId}`).then((r) => r.participant),
    });
}

/** Every row matching the filters (for Export List), page by page. */
export async function fetchAllAttendance(eventId: number, query: AttendanceQuery): Promise<AttendanceRow[]> {
    const out: AttendanceRow[] = [];
    for (let page = 1; page <= 50; page += 1) {
        const r = await api.get<AttendanceList>(`/client/events/${eventId}/attendance`, { ...query, page, limit: 200 } as Record<string, string | number | undefined>);
        out.push(...r.rows);
        if (page >= r.pagination.totalPages) break;
    }
    return out;
}

function useRefresh(eventId: number) {
    const qc = useQueryClient();
    return () => {
        qc.invalidateQueries({ queryKey: [...KEY, eventId] });
        qc.invalidateQueries({ queryKey: ['client', 'participants'] });
    };
}

export function useVerifyParticipant(eventId: number, onDone?: () => void) {
    const refresh = useRefresh(eventId);
    return useMutation({
        mutationFn: ({ id, ...body }: { id: number; verified?: boolean; method?: 'qr' | 'manual'; note?: string }) =>
            api.post<{ participant: AttendanceRow }>(`/client/events/${eventId}/attendance/${id}/verify`, body),
        onSuccess: (r) => {
            toast.success(r.participant.verification === 'verified' ? 'Participant verified' : 'Verification removed');
            refresh();
            onDone?.();
        },
        onError: (e) => report(e, 'Could not update the verification'),
    });
}

export function useMarkAttendance(eventId: number, onDone?: () => void) {
    const refresh = useRefresh(eventId);
    return useMutation({
        mutationFn: ({ id, ...body }: { id: number; status: 'attended' | 'not_attended'; at?: string; note?: string }) =>
            api.post<{ participant: AttendanceRow }>(`/client/events/${eventId}/attendance/${id}/mark`, body),
        onSuccess: (r) => {
            toast.success(r.participant.attendance === 'attended' ? 'Attendance marked' : 'Marked as not attended');
            refresh();
            onDone?.();
        },
        onError: (e) => report(e, 'Could not update the attendance'),
    });
}

export function useBulkAttendance(eventId: number, onDone?: () => void) {
    const refresh = useRefresh(eventId);
    return useMutation({
        mutationFn: (body: { action: 'verify' | 'attend'; ids: number[] }) =>
            api.post<{ updated: number; selected: number }>(`/client/events/${eventId}/attendance/bulk`, body),
        onSuccess: (r, v) => {
            const skipped = r.selected - r.updated;
            toast.success(`${r.updated} participant${r.updated === 1 ? '' : 's'} ${v.action === 'verify' ? 'verified' : 'marked as attended'}${skipped ? ` · ${skipped} already done or blocked` : ''}`);
            refresh();
            onDone?.();
        },
        onError: (e) => report(e, 'Could not update the selected participants'),
    });
}

/** Send Notification to one or more participants — the event notifications ("specific" audience). */
export function useNotifyParticipants(eventId: number, onDone?: () => void) {
    return useMutation({
        mutationFn: (body: { ids: number[]; title: string; message: string; channels: ('in_app' | 'push')[] }) =>
            api.post(`/client/events/${eventId}/notifications`, {
                action: 'send',
                title: body.title.trim(),
                message: body.message.trim(),
                audience: 'specific',
                participant_ids: body.ids,
                channels: body.channels,
            }),
        onSuccess: (_r, v) => {
            toast.success(v.ids.length === 1 ? 'Notification sent' : `Notification sent to ${v.ids.length} participants`);
            onDone?.();
        },
        onError: (e) => report(e, 'Could not send the notification'),
    });
}
