'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, type Pagination } from '@/lib/api-client';

/**
 * Billing.
 *
 * ── WHAT THESE HOOKS COVER ──────────────────────────────────────────────────
 * The subscription (overview, plans, change, cancel, resume), invoices and
 * their detail, the merged billing history, the Contact Sales form, and
 * payment methods (manual UPI / bank / cash records — see `usePaymentMethods`
 * below for what "payment method" actually means here).
 *
 * ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────
 * There is no `useCheckout`. It needs a payment provider this project does
 * not have, and stubbing it would mean a "Pay ₹16,228" button that takes no
 * money and a receipt for a payment that never happened.
 *
 * Every invoice payload carries `payments_enabled` and a reason, so the screens
 * describe the real state instead of each hardcoding an assumption — and they
 * change behaviour on their own the day a gateway is wired, with nobody having
 * to remember which files to revisit.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

export interface BillingPlan {
    id: number;
    name: string;
    plan_code: string;
    short_description: string | null;
    billing_cycle: 'monthly' | 'quarterly' | 'yearly' | 'lifetime';
    currency_code: string;
    price: string;
    trial_days: number;
    is_active: number;
    is_visible: number;
    sort_order: number;
}

/** Money. `price` is PRE-TAX and tax is added on top — never carved out. */
export interface Money {
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    tax_inclusive: false;
}

/**
 * The status to DISPLAY, which is not always the status stored.
 *
 * `cancelling` exists only here and in the service that derives it: a term that
 * has been cancelled but has not yet ended is neither active nor cancelled —
 * access continues and no renewal will follow. It is not a stored value.
 */
export type BillingStatus = 'active' | 'trialing' | 'cancelling' | 'cancelled' | 'expired';

export interface BillingSubscription {
    id: number;
    status: BillingStatus;
    stored_status: string;
    plan: BillingPlan | null;
    billing_cycle: BillingPlan['billing_cycle'];
    started_at: string;
    current_period_start: string;
    current_period_end: string | null;
    /** Null when cancelled or on a lifetime term — there is no next charge. */
    next_billing_date: string | null;
    trial_ends_at: string | null;
    is_trialing: boolean;
    cancel_at_period_end: boolean;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    amount: Money;
    currency_code: string;
    pending_change: { plan: BillingPlan | null; effective_at: string } | null;
}

/**
 * One usage figure.
 *
 * `available: false` means the number is UNKNOWN, not zero, and `reason` says
 * why. The distinction is the whole point: a 0 and an unbuilt feature look
 * identical on a tile and mean opposite things.
 */
export interface UsageMetric {
    used: number | null;
    limit: number | null;
    available: boolean;
    reason?: string;
}

export interface BillingUsage {
    period_start: string | null;
    period_end: string | null;
    events: UsageMetric;
    guests: UsageMetric & { per_event_limit: number | null };
    messages: UsageMetric;
    /**
     * Measured from the account's gallery. `used` and `limit` are both in
     * `unit` (the plan's own, "500 MB"); `used_gb` / `limit_gb` are the same
     * figures in GB.
     */
    storage: {
        used?: number | null;
        used_gb: number | null;
        limit_gb: number | null;
        limit: number | null;
        unit: 'MB' | 'GB' | null;
        available: boolean;
        reason?: string;
    };
    rsvps: { limit: number | null };
}

export interface BillingOverview {
    subscription: BillingSubscription | null;
    reason: string | null;
    features: { id: number; label: string; group: string }[];
    usage: BillingUsage;
    unavailable: Record<string, string>;
}

export interface AvailablePlans {
    current_plan_id: number | null;
    subscription: BillingSubscription | null;
    plans: (BillingPlan & {
        amount: Money;
        features: { id: number; label: string; group: string }[];
        is_current: boolean;
        is_pending: boolean;
    })[];
    change_effective_at: string | null;
}

/**
 * One row of Billing History.
 *
 * The endpoint MERGES two tables: the money ledger (`client_transactions`) and
 * the subscription lifecycle log (`client_subscription_events`). The design's
 * own table mixes them — "Payment for INV-…" beside "Subscription created" — so
 * the merge happens server-side and this is the single shape that comes back.
 *
 * `amount: null` means the row carries no money at all (a plan change is not a
 * zero-rupee transaction), and renders as an em dash rather than ₹0.00.
 */
export interface BillingHistoryRow {
    key: string;
    occurred_at: string;
    description: string | null;
    type: 'invoice' | 'payment' | 'refund' | 'adjustment' | 'setup';
    event_type?: string;
    amount: number | null;
    currency_code: string | null;
    status: string;
    reference: string | null;
    invoice_id: number | null;
    invoice_number: string | null;
}

export interface BillingHistory {
    transactions: BillingHistoryRow[];
    pagination: Pagination;
    /**
     * Counts for the WHOLE account, not the filtered page — the design's
     * "Transaction Summary" rail is a fact about the account, and a count that
     * moved while you typed in the search box would be reporting the search.
     */
    summary: Record<string, number>;
    /** How many rows the current filters matched — "Showing 1 to 10 of 26". */
    filtered_count: number;
    note: string;
}

/* ── Invoices ─────────────────────────────────────────────────────────────── */

export interface InvoiceTaxComponent { label: string; rate: number; amount: number }

/**
 * The card a payment was made with.
 *
 * Read from the transaction's own SNAPSHOT columns, so an archived invoice keeps
 * saying what it said the day it was settled even if the card is later renamed
 * or removed. `label` is assembled server-side — "Visa ending in 4242" — so the
 * list, the invoice and the Billing Summary cannot word it three ways.
 *
 * Null on every payment today: no provider is connected, so nothing has been
 * paid by card.
 */
export interface InvoicePaymentMethod {
    payment_method_id: number | null;
    brand: string | null;
    last4: string | null;
    gateway: string | null;
    gateway_transaction_id: string | null;
    label: string;
}

/**
 * `status` is DERIVED server-side — `unpaid`, `paid`, `partially_paid`,
 * `overdue`, `cancelled`, `refunded`, `draft`. `stored_status` is the column.
 *
 * `overdue` cannot occur while payments are disabled: no due date is stamped,
 * because an invoice nobody can pay must not be shown as the client's fault.
 */
export interface InvoiceTimelineEntry {
    key: string;
    label: string;
    detail: string;
    at: string;
}

export interface Invoice {
    id: number;
    invoice_number: string;
    /**
     * "One Thousand Four Hundred Ninety Nine Rupees Only" — computed on the
     * server so the words and the figure can never disagree. Null for a
     * non-INR invoice, which has no rupees/paise reading.
     */
    amount_in_words?: string | null;
    /** Derived from real timestamps; never stored. See buildTimeline(). */
    timeline?: InvoiceTimelineEntry[];
    status: string;
    stored_status: string;
    issue_date: string;
    due_date: string | null;
    paid_at: string | null;
    period_start: string | null;
    period_end: string | null;
    currency_code: string;
    subtotal: number;
    discount_amount: number;
    tax_rate: number;
    tax_amount: number;
    tax_breakdown: InvoiceTaxComponent[];
    tax_inclusive: boolean;
    total: number;
    amount_paid: number;
    amount_due: number;
    billing_name: string | null;
    billing_email: string | null;
    billing_address: string | null;
    billing_gstin: string | null;
    notes: string | null;
    plan: { id: number; name: string } | null;
    /** The card that settled this invoice, lifted out of the ledger by the API. */
    payment_method?: InvoicePaymentMethod | null;
    items?: {
        id: number; item_type: string; description: string;
        period_start: string | null; period_end: string | null;
        quantity: number; unit_price: number; amount: number;
    }[];
    transactions?: {
        id: number; type: string; status: string; description: string | null;
        amount: number; reference: string | null;
        gateway: string | null; gateway_transaction_id: string | null;
        payment_method: InvoicePaymentMethod | null;
        occurred_at: string;
    }[];
}

export interface InvoiceList {
    invoices: Invoice[];
    pagination: Pagination;
    stats: {
        total_invoices: number;
        total_amount: number;
        paid_amount: number;
        outstanding_amount: number;
        by_status: Record<string, number>;
    };
    payments_enabled: boolean;
    payments_reason: string | null;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Queries
 * ────────────────────────────────────────────────────────────────────────── */

const KEY = {
    overview: ['billing', 'overview'] as const,
    plans: ['billing', 'plans'] as const,
    history: ['billing', 'history'] as const,
    invoices: ['billing', 'invoices'] as const,
    paymentMethods: ['billing', 'payment-methods'] as const,
};

export function useBillingOverview() {
    return useQuery({
        queryKey: KEY.overview,
        queryFn: () => api.get<BillingOverview>('/client/billing/overview'),
        staleTime: 60 * 1000,
    });
}

export function useBillingPlans() {
    return useQuery({
        queryKey: KEY.plans,
        queryFn: () => api.get<AvailablePlans>('/client/billing/plans'),
        staleTime: 5 * 60 * 1000,
    });
}

export interface HistoryParams {
    type?: string;
    status?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}

export function useBillingHistory(params: HistoryParams = {}) {
    return useQuery({
        queryKey: [
            ...KEY.history,
            params.type ?? 'all', params.status ?? 'all', params.search ?? '',
            params.from ?? '', params.to ?? '', params.page ?? 1, params.limit ?? 10,
        ],
        queryFn: () =>
            api.get<BillingHistory>('/client/billing/history', {
                type: params.type,
                status: params.status,
                search: params.search,
                from: params.from,
                to: params.to,
                page: params.page,
                limit: params.limit,
            }),
        staleTime: 60 * 1000,
        // Keeps the previous page on screen while the next one loads, so
        // paging and typing in the search box do not blank the table.
        placeholderData: (prev) => prev,
    });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Payment methods
 *
 * ⚠ NO CARD DETAILS PASS THROUGH HERE, IN EITHER MODE.
 *
 * TOKENISED — the gateway's own hosted field takes the card in the browser and
 *   returns a token; only that token is posted.
 * MANUAL — no gateway exists, so a method is a RECORD OF HOW THE CLIENT PAYS: a
 *   UPI address, or a bank account named by its last four. Nothing here can be
 *   charged; a payment arrives out of band and is recorded afterwards.
 *
 * The backend refuses a card-shaped body on BOTH paths, and refuses a full bank
 * account number rather than trimming it — so this is not a convention the UI
 * can quietly break.
 * ────────────────────────────────────────────────────────────────────────── */

export interface PaymentMethod {
    id: number;
    /** 'razorpay' / 'stripe' for a tokenised card, 'manual' for a recorded one. */
    gateway: string;
    method_type: 'card' | 'upi' | 'bank_transfer' | string;
    brand: string | null;
    last4: string | null;
    exp_month: number | null;
    exp_year: number | null;

    /* ── Manual methods ─────────────────────────────────────────────────── */
    upi_id: string | null;
    bank_name: string | null;
    account_last4: string | null;
    ifsc: string | null;
    /** A manual method is client-typed; nobody has checked it. Say so on screen. */
    is_verified: boolean;
    /** Whether it could ever be CHARGED, as opposed to merely recorded. */
    is_chargeable: boolean;
    /** "UPI" / "Bank transfer" / "Card" — for a heading, above the detail. */
    type_label: string;
    /** "06/27", assembled server-side so every screen pads it the same way. */
    expiry_label: string | null;
    holder_name: string | null;
    is_default: boolean;
    is_expired: boolean;
    status: 'active' | 'expired' | 'removed';
    /** "Visa ending in 4242" — one wording, decided by the server. */
    label: string;
    created_at: string;
}

export interface PaymentMethodList {
    methods: PaymentMethod[];
    default_method: PaymentMethod | null;
    max_methods: number;
    can_add: boolean;
    gateway: {
        enabled: boolean;
        name: string | null;
        /** Safe to hand the browser — it is what a hosted card field needs. */
        publishable_key: string | null;
        reason: string | null;
    };
    /**
     * The route that needs no provider. `types` is served by the API rather
     * than listed here, so adding one later does not need a frontend release —
     * and the form cannot offer a type the server would reject.
     */
    manual: {
        enabled: boolean;
        types: { value: string; label: string }[];
        reason: string;
    };
}

/**
 * What the Add form posts.
 *
 * No token, no card fields. The server decides which mode it is by whether a
 * token arrived, so there is no flag to get wrong.
 */
export interface NewManualMethod {
    method_type: string;
    upi_id?: string;
    bank_name?: string;
    /** EXACTLY four digits. The server refuses a longer value rather than trimming it. */
    account_last4?: string;
    ifsc?: string;
    holder_name?: string;
    is_default?: boolean;
}

export function usePaymentMethods() {
    return useQuery({
        queryKey: KEY.paymentMethods,
        queryFn: () => api.get<PaymentMethodList>('/client/billing/payment-methods'),
        staleTime: 60 * 1000,
    });
}

export function useAddPaymentMethod() {
    return useBillingMutation<NewManualMethod>(
        (body) => api.post('/client/billing/payment-methods', body),
        {
            success: 'Payment method saved',
            // The server's own message is shown when there is one — it names the
            // field and the shape it wanted, which this cannot.
            failure: 'Could not save that payment method.',
        },
    );
}

export function useSetDefaultPaymentMethod() {
    return useBillingMutation<number>(
        (id) => api.put(`/client/billing/payment-methods/${id}/default`),
        { success: 'Default payment method updated', failure: 'Could not change your default card.' },
    );
}

export function useRemovePaymentMethod() {
    return useBillingMutation<number>(
        (id) => api.del(`/client/billing/payment-methods/${id}`),
        { success: 'Payment method removed', failure: 'Could not remove that card.' },
    );
}

export interface InvoiceParams {
    status?: string;
    search?: string;
    /** Both bounds are INCLUSIVE — the server filters `issue_date` on the day itself. */
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}

export function useInvoices(params: InvoiceParams = {}) {
    return useQuery({
        queryKey: [
            ...KEY.invoices,
            params.status ?? 'all', params.search ?? '',
            params.from ?? '', params.to ?? '',
            params.page ?? 1, params.limit ?? 10,
        ],
        queryFn: () =>
            api.get<InvoiceList>('/client/billing/invoices', {
                status: params.status,
                search: params.search || undefined,
                from: params.from || undefined,
                to: params.to || undefined,
                page: params.page,
                limit: params.limit,
            }),
        staleTime: 60 * 1000,
        // Keeps the current page on screen while the next one loads, so paging
        // and typing in the search box do not blank the table.
        placeholderData: (prev) => prev,
    });
}

export function useInvoice(id: number | null) {
    return useQuery({
        queryKey: [...KEY.invoices, 'detail', id],
        queryFn: () =>
            api.get<{
                invoice: Invoice;
                payments_enabled: boolean;
                payments_reason: string | null;
                /**
                 * Usage for THIS INVOICE'S period, not the current one — an
                 * invoice records a past term, and today's numbers under last
                 * month's dates would be a different fact wearing the same label.
                 */
                usage: BillingUsage;
            }>(`/client/billing/invoices/${id}`),
        enabled: id !== null && Number.isFinite(id),
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Contact Sales.
 *
 * ⚠ The submission is STORED, not emailed — there is no SMTP in this system.
 * The response carries `delivery: 'stored'` so the screen promises a follow-up
 * rather than implying a message just went out.
 */
export interface SalesEnquiry {
    full_name: string;
    work_email: string;
    company_name?: string;
    phone?: string;
    events_per_year?: string;
    interests?: string[];
    message: string;
    preferred_time?: string;
}

export function useContactSales() {
    return useMutation({
        mutationFn: (body: SalesEnquiry) =>
            api.post<{ id: number; message: string; delivery: string }>(
                '/client/billing/contact-sales',
                body,
            ),
        onSuccess: (data) => toast.success(data.message),
        onError: (error) =>
            toast.error(
                error instanceof ApiError ? error.message : 'Could not send your enquiry.',
            ),
    });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Mutations
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Every billing mutation invalidates the same three queries plus `client/me`.
 *
 * `refetchType: 'all'` is not optional here. The app's query client sets
 * `staleTime: 10 min` and `refetchOnMount: false`, and React Query only
 * auto-refetches ACTIVE queries — so a plan change made on the Change Plan
 * screen would leave the Overview showing a ten-minute-old plan on return.
 * That exact combination has produced a "the list still says Active" bug in
 * this codebase before.
 *
 * `client/me` is included because the plan is the ENTITLEMENT: the sidebar's
 * plan card, the event wizard's options and the template gating all read it.
 */
function useBillingMutation<TArgs>(
    fn: (args: TArgs) => Promise<unknown>,
    messages: { success: string; failure: string },
) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: () => {
            toast.success(messages.success);
            for (const key of [KEY.overview, KEY.plans, KEY.history, KEY.invoices, KEY.paymentMethods, ['client', 'me']]) {
                qc.invalidateQueries({ queryKey: key, refetchType: 'all' });
            }
        },
        onError: (error) =>
            toast.error(error instanceof ApiError ? error.message : messages.failure),
    });
}

/**
 * Schedule a plan change for the end of the current term.
 *
 * ⚠ SCHEDULED, never immediate — which is what the Change Plan screen's own
 * banner says. An immediate upgrade would have to charge the difference, and
 * there is nothing to charge it with; applying it for free instead would hand
 * out a paid plan on a button press.
 *
 * The body key is `plan_id`, not `planId`: the backend's `bodyTransform`
 * snake_cases incoming keys, and the controller reads the snake_case form.
 */
export function useChangePlan() {
    return useBillingMutation<number>(
        (planId) => api.post('/client/billing/change-plan', { plan_id: planId }),
        { success: 'Plan change scheduled', failure: 'Could not change your plan.' },
    );
}

export function useCancelSubscription() {
    return useBillingMutation<{ reason?: string; comments?: string }>(
        (body) => api.post('/client/billing/cancel', body),
        {
            success: 'Subscription cancelled — you keep access until the end of your term',
            failure: 'Could not cancel your subscription.',
        },
    );
}

export function useResumeSubscription() {
    return useBillingMutation<void>(
        () => api.post('/client/billing/resume'),
        { success: 'Subscription resumed', failure: 'Could not resume your subscription.' },
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Formatting
 * ────────────────────────────────────────────────────────────────────────── */

export function formatMoney(amount: number | string | null, currency = 'INR') {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    try {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency,
            maximumFractionDigits: 2,
        }).format(n);
    } catch {
        // An unknown currency code must not take the whole card down with it.
        return `${currency} ${n.toFixed(2)}`;
    }
}

/**
 * A date, formatted from its PARTS.
 *
 * Never `new Date(value).toLocaleDateString()` on a bare date — that parses as
 * UTC and renders the previous day for anyone behind it, which on a "next
 * billing date" is a support ticket.
 */
export function formatDate(value: string | null | undefined) {
    if (!value) return '—';
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '—';
    const [, y, mo, d] = m;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${Number(d)} ${months[Number(mo) - 1]} ${y}`;
}

export const CYCLE_LABEL: Record<string, string> = {
    monthly: 'Billed monthly',
    quarterly: 'Billed quarterly',
    yearly: 'Billed yearly',
    lifetime: 'One-time payment',
};

export const CYCLE_SUFFIX: Record<string, string> = {
    monthly: '/month',
    quarterly: '/quarter',
    yearly: '/year',
    lifetime: '',
};
