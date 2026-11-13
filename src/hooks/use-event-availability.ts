import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

/**
 * Event Availability calendar (client portal, Jamal 2026-11-13).
 * GET /client/availability?from&to — TOTAL slots per date across every config the super admin set
 * (no category). `not_configured` dates are hidden by the page. `my_events` are this client's own.
 */
export type CalendarStatus = 'available' | 'low' | 'full' | 'disabled' | 'not_configured';

export interface CalendarDay {
    date: string;
    day: string;
    status: CalendarStatus;
    daily_max: number;
    booked: number;
    balance: number;
    my_events: { id: number; name: string; start_time: string | null; status: string }[];
}

export function useAvailabilityCalendar(from: string, to: string) {
    return useQuery({
        queryKey: ['client', 'availability', from, to],
        queryFn: () => api.get<{ range: { from: string; to: string }; days: CalendarDay[] }>(`/client/availability?from=${from}&to=${to}`),
        retry: false,
    });
}

/** A support / allocation request for unavailable dates (Contact Support). */
export interface AvailabilityRequest {
    id: number;
    ticket_no: string;
    booking_type: 'single' | 'multiple';
    start_date: string;
    end_date: string;
    unavailable_dates: { date: string; status: CalendarStatus }[];
    contact_method: 'call' | 'email';
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
}

/** POST /client/availability/requests — FormData (attachment optional, email only). */
export function useCreateAvailabilityRequest() {
    return useMutation({
        mutationFn: (form: FormData) => api.post<AvailabilityRequest>('/client/availability/requests', form),
    });
}

/** The full request, as the Allocation Requests pages read it. */
export interface AllocationRequest extends AvailabilityRequest {
    contact_name: string;
    contact_mobile: string | null;
    contact_email: string | null;
    preferred_call_time: string | null;
    subject: string | null;
    message: string;
    attachment_name: string | null;
    decision_reason: string | null;
    decision: {
        dates?: string[]; exception_slots?: number; expiry_hours?: number; expires_at?: string;
        category?: string; used_event_id?: number; used_at?: string;
    } | null;
    decided_at: string | null;
    days?: { date: string; day: string; status: CalendarStatus; daily_max: number; booked: number; balance: number }[];
}

export function useMyAllocationRequests() {
    return useQuery({
        queryKey: ['client', 'availability', 'requests'],
        queryFn: () => api.get<AllocationRequest[]>('/client/availability/requests'),
        retry: false,
    });
}

export function useMyAllocationRequest(id: number | null) {
    return useQuery({
        queryKey: ['client', 'availability', 'requests', id],
        queryFn: () => api.get<AllocationRequest>(`/client/availability/requests/${id}`),
        enabled: !!id,
        retry: false,
    });
}
