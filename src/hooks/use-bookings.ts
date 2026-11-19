'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import type { CheckoutBody, CheckoutResult } from '@/hooks/use-billing';

/**
 * Per-event plans (Jamal, 2026-11-19 — Create Event updated v4).
 *
 * Every event is booked with its own plan: Check Availability → choose a plan (Free too) → the
 * date is booked → Create Event. A booked date with no event yet is a `reserved` booking; the
 * dashboard's "Create Your Event Now" card lists them. Creating the event from one sends
 * `booking_id` and the booking turns `used`.
 *
 * A paid plan saves a successful payment and the date is reserved straight away (no pending).
 */

export interface Booking {
    id: number;
    start_date: string;
    end_date: string | null;
    plan: { id: number; name: string };
    amount: number;
    currency_code: string;
    payment_status: 'free' | 'pending' | 'paid';
    status: 'reserved' | 'used' | 'cancelled';
    event_id: number | null;
    booking_type: string;
    booked_at: string;
    used_at: string | null;
}

export interface BookingSummary {
    reserved_bookings: number;
    total_booked_dates: number;
}

/** Free plan: just the date and plan. Paid plan: the payment fields too (never a card number). */
export type BookingBody = { start_date: string; end_date?: string; plan_id: number } & Partial<Omit<CheckoutBody, 'plan_id' | 'start_date' | 'end_date'>>;

export interface BookingResult {
    booking: Booking;
    transaction: CheckoutResult['transaction'] | null;
}

const KEY = {
    list: (status?: string) => ['client', 'bookings', status ?? 'all'] as const,
    one: (id: number | string) => ['client', 'bookings', 'one', String(id)] as const,
    summary: ['client', 'bookings', 'summary'] as const,
};

export function useBookings(status?: Booking['status']) {
    return useQuery({
        queryKey: KEY.list(status),
        queryFn: () => api.get<Booking[]>(`/client/bookings${status ? `?status=${status}` : ''}`),
        staleTime: 30_000,
    });
}

export function useBooking(id: number | string | null | undefined) {
    return useQuery({
        queryKey: KEY.one(id ?? ''),
        queryFn: () => api.get<Booking>(`/client/bookings/${id}`),
        enabled: !!id,
        retry: false,
    });
}

export function useBookingSummary() {
    return useQuery({
        queryKey: KEY.summary,
        queryFn: () => api.get<BookingSummary>('/client/bookings/summary'),
        staleTime: 30_000,
    });
}

export function useCreateBooking() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: BookingBody) => api.post<BookingResult>('/client/bookings', body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['client', 'bookings'], refetchType: 'all' });
            qc.invalidateQueries({ queryKey: ['billing'], refetchType: 'all' });
            qc.invalidateQueries({ queryKey: ['client', 'availability'], refetchType: 'all' });
        },
        onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not book this date.'),
    });
}
