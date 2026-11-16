'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';

/**
 * Files Downloaded — client portal → event → QR Code → File Downloads (Jamal's design, 2026-11-16).
 * Backend: /client/events/:id/download-logs (event_download_logs, one row per download, written when a
 * participant downloads a file in the app). The portal only lists it.
 */

export interface DownloadLogParticipant {
    id: number;
    name: string;
    photo: string | null;
    dial_code: string;
    mobile: string | null;
    email: string | null;
    relation: string | null;
    relationship: string | null;
    is_blocked: boolean;
}

export interface DownloadLogRow {
    id: number;
    downloaded_at: string;
    status: 'completed' | 'failed';
    failed_reason: string | null;
    device: 'mobile' | 'tablet' | 'desktop' | null;
    platform: string | null;
    source: 'app' | 'sample';
    file: { id: number; title: string; file_name: string; file_type: string; category_key: string; file_url: string };
    participant: DownloadLogParticipant | null;
}

export interface DownloadLogQuery {
    search?: string;
    from?: string;
    to?: string;
    file_type?: string;
    status?: 'all' | 'completed' | 'failed';
    relationship?: string;
    page?: number;
    limit?: number;
}

interface DownloadLogList {
    stats: {
        total_downloads: number;
        unique_downloaders: number;
        failed_downloads: number;
        most_downloaded: { id: number; title: string; file_name: string; downloads: number } | null;
    };
    file_types: string[];
    relationships: string[];
    rows: DownloadLogRow[];
    pagination: { page: number; limit: number; totalItems: number; totalPages: number };
}

export interface DownloadHistory {
    participant: DownloadLogParticipant | null;
    summary: { total: number; completed: number; failed: number; files: number; first_at: string; last_at: string };
    downloads: DownloadLogRow[];
}

const KEY = ['client', 'download-logs'] as const;
type Q = Record<string, string | number | undefined>;

export function useDownloadLogs(eventId: number, query: DownloadLogQuery) {
    return useQuery({
        queryKey: [...KEY, eventId, query],
        placeholderData: keepPreviousData,
        queryFn: () => api.get<DownloadLogList>(`/client/events/${eventId}/download-logs`, query as Q),
    });
}

export function useDownloadHistory(eventId: number, participantId: number | null) {
    return useQuery({
        queryKey: [...KEY, eventId, 'history', participantId],
        enabled: !!participantId,
        queryFn: () => api.get<DownloadHistory>(`/client/events/${eventId}/download-logs/participants/${participantId}`),
    });
}

/** Every row matching the filters (Export), page by page. */
export async function fetchAllDownloadLogs(eventId: number, query: DownloadLogQuery): Promise<DownloadLogRow[]> {
    const out: DownloadLogRow[] = [];
    for (let page = 1; page <= 50; page += 1) {
        const r = await api.get<DownloadLogList>(`/client/events/${eventId}/download-logs`, { ...query, page, limit: 200 } as Q);
        out.push(...r.rows);
        if (page >= r.pagination.totalPages) break;
    }
    return out;
}

/** Remove Participant — takes their downloads off this list (they stay a participant). */
export function useRemoveFromDownloads(eventId: number, onDone?: () => void) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (participantId: number) => api.del<{ removed: number }>(`/client/events/${eventId}/download-logs/participants/${participantId}`),
        onSuccess: () => {
            toast.success('Participant removed from the download list');
            qc.invalidateQueries({ queryKey: [...KEY, eventId] });
            onDone?.();
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove the participant'),
    });
}

/** After the Participants module's Block panel closes, the list shows the new state. */
export function useRefreshDownloadLogs(eventId: number) {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: [...KEY, eventId] });
}
