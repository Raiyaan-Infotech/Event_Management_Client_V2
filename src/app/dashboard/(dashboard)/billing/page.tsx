'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
    Calendar, Users, Mail, HardDrive, CheckCircle2, AlertTriangle, Crown,
    Headphones, ArrowRight, Loader2, Info, Clock, RotateCcw,
    FileText, Receipt, Search, CreditCard, Plus, Pencil, MapPin, Lock,
    Download, X, ChevronLeft, ChevronRight, MoreVertical, Eye, UserCheck,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PaymentMethodsPanel, BrandMark } from './_components/payment-methods-panel';
import { HistoryPanel } from './_components/history-panel';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import {
    useBillingOverview, useInvoices, usePaymentMethods,
    useCancelSubscription, useResumeSubscription,
    formatMoney, formatDate, CYCLE_LABEL, CYCLE_SUFFIX,
    type BillingStatus, type UsageMetric, type PaymentMethodList,
    type Invoice, type InvoiceList,
} from '@/hooks/use-billing';
import { useClientProfile } from '@/hooks/use-client-portal';
import { api } from '@/lib/api-client';

/**
 * Billing.
 *
 * ── WHAT IS REAL ON THIS SCREEN ─────────────────────────────────────────────
 * The plan, its price and billing cycle, the term dates, the next billing date,
 * cancel and resume, a scheduled plan change, and the events/guests figures —
 * all from `client_subscriptions` and the client's own rows.
 *
 * ── WHAT IS NOT, AND WHY IT SAYS SO RATHER THAN SHOWING A NUMBER ────────────
 * The supplied design also has Invoices, Payment Methods, Billing History as
 * transactions, saved cards, add-ons, coupons, a billing address and a
 * "Messages Sent" figure. None of those has a table, and three of them need a
 * payment provider this project does not have.
 *
 * Every one of them therefore renders an explicit state naming what it is
 * waiting on. The reasons come from the API's `unavailable` block, not from
 * strings typed here, so these unlock when the backend stops reporting them —
 * nobody has to remember to come back and edit this file.
 *
 * STORAGE is measured from the account's gallery (the bytes of every photo and
 * video, in the plan's own unit), so it shows a real figure against the plan's
 * ceiling. It does not count cover, invitation, splash, agenda or contact
 * pictures — the same rule the gallery upload enforces.
 */

const STATUS_STYLE: Record<BillingStatus, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    trialing: { label: 'Trial', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
    // Distinct from both Active and Cancelled on purpose: access continues, and
    // no renewal will follow. Showing "Active" here would hide the ending.
    cancelling: { label: 'Ending soon', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    cancelled: { label: 'Cancelled', className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
    expired: { label: 'Expired', className: 'bg-muted text-muted-foreground' },
};

/** A card that names what it is waiting on, rather than rendering empty. */
function NotAvailable({ title, reason, icon: Icon }: {
    title: string; reason?: string; icon?: React.ElementType;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
            {Icon ? <Icon className="size-5 text-muted-foreground" /> : null}
            <p className="text-sm font-medium">{title}</p>
            <p className="max-w-md text-[12.5px] text-muted-foreground">
                {reason ?? 'This is not available yet.'}
            </p>
        </div>
    );
}

/**
 * One usage tile.
 *
 * Three distinct renderings, because they are three different claims:
 *   available + limit    a figure and its ceiling, with a bar
 *   available, no limit  a figure and "No limit set" — the plan sets none
 *   not available        an em dash and the reason. NEVER a zero.
 */
function UsageTile({ icon: Icon, label, metric, unit, tint, perEventLimit }: {
    icon: React.ElementType;
    label: string;
    metric: UsageMetric & { used_gb?: number | null; limit_gb?: number | null };
    unit?: string;
    tint: string;
    /** Guests: the plan caps guests PER EVENT, not as a running total — see the note below. */
    perEventLimit?: number | null;
}) {
    const used = metric.used ?? metric.used_gb ?? null;
    const limit = metric.limit ?? metric.limit_gb ?? null;
    const known = metric.available && used !== null;
    const pct = known && limit ? Math.min(100, Math.round((Number(used) / limit) * 100)) : null;
    const over = known && limit !== null && Number(used) > limit;

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tint}`}>
                    <Icon className="size-4" />
                </span>
                <span className="min-w-0 text-[12.5px] font-medium text-muted-foreground">{label}</span>
            </div>

            <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-semibold tabular-nums ${known ? '' : 'text-muted-foreground/50'}`}>
                    {known ? Number(used).toLocaleString('en-IN') : '—'}
                </span>
                {unit && known ? <span className="text-xs text-muted-foreground">{unit}</span> : null}
                {limit !== null ? (
                    <span className="text-xs text-muted-foreground">
                        / {limit.toLocaleString('en-IN')}{unit ? ` ${unit}` : ''}
                    </span>
                ) : null}
            </div>

            {pct !== null ? (
                <div className="flex flex-col gap-1">
                    <Progress value={Math.min(100, pct)} className={over ? '[&>*]:bg-rose-500' : ''} />
                    <span className={`text-[11px] ${over ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                        {over ? `Over your plan limit by ${Number(used) - limit}` : `${pct}%`}
                    </span>
                </div>
            ) : (
                <span className="text-[11px] break-words text-muted-foreground">
                    {!metric.available
                        ? metric.reason ?? 'Not available yet'
                        // A per-event ceiling has no total to be a ratio of, but it is
                        // still a real limit — saying "No limit set" here would be wrong.
                        : perEventLimit
                            ? `Up to ${perEventLimit.toLocaleString('en-IN')} per event`
                            : 'No limit set on your plan'}
                </span>
            )}
        </div>
    );
}

/**
 * Max RSVP per event. A PER-EVENT ceiling, so there is no account total to put
 * against it — the tile states the allowance; each event's own RSVPs tab shows
 * its "used / limit" bar.
 */
function RsvpLimitTile({ limit }: { limit: number | null }) {
    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    <UserCheck className="size-4" />
                </span>
                <span className="min-w-0 text-[12.5px] font-medium text-muted-foreground">RSVPs per Event</span>
            </div>
            <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums">
                    {limit === null ? '∞' : limit.toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-muted-foreground">participants</span>
            </div>
            <span className="text-[11px] break-words text-muted-foreground">
                {limit === null ? 'No limit set on your plan' : 'Allowed on each event — see the event’s RSVPs tab'}
            </span>
        </div>
    );
}

const TABS = ['overview', 'invoices', 'payment', 'history'];

/**
 * `useSearchParams` opts the tree into client-side rendering, so Next 15 wants
 * it under a Suspense boundary. The fallback is the same skeleton the page uses
 * while the overview loads, so nothing flashes.
 */
export default function BillingPage() {
    return (
        <Suspense fallback={<BillingSkeleton />}>
            <BillingScreen />
        </Suspense>
    );
}

function BillingSkeleton() {
    return (
        <div className="flex flex-col gap-5 p-4 md:p-6">
            <Skeleton className="h-8 w-40" />
            <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
            </div>
            <Skeleton className="h-40 rounded-xl" />
        </div>
    );
}

function BillingScreen() {
    const { data, isLoading } = useBillingOverview();
    const { data: pm } = usePaymentMethods();
    const cancel = useCancelSubscription();
    const resume = useResumeSubscription();

    const [cancelOpen, setCancelOpen] = useState(false);
    const [reason, setReason] = useState('');

    /*
      Controlled, because the Overview now links INTO the other tabs:
      "View All Invoices", "Manage" and "Manage Payment Method" are the
      design's own affordances, and each moves the tab rather than
      navigating to a page that does not exist.
    */
    /*
      `?tab=` so the invoice screen's "Back to Invoices" and "View Billing
      History" land where they say they will.

      Seeded from the URL on the FIRST render, not pushed in by an effect — an
      effect would paint Overview and then swap, and setState in an effect body
      is a cascading render. `useSearchParams` is why the export below wraps
      this component in Suspense.
    */
    const params = useSearchParams();
    const wanted = params.get('tab');
    const [tab, setTab] = useState(
        wanted && TABS.includes(wanted) ? wanted : 'overview',
    );

    const sub = data?.subscription ?? null;
    const unavailable = data?.unavailable ?? {};
    const status = sub?.status;
    const cycleSuffix = sub ? CYCLE_SUFFIX[sub.billing_cycle] ?? '' : '';

    if (isLoading) return <BillingSkeleton />;

    return (
        <div className="flex min-w-0 flex-col gap-5 p-4 md:p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
                <p className="text-sm text-muted-foreground">
                    Manage your subscription and see what you have used.
                </p>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="gap-5">
                <TabsList variant="line" className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="invoices">Invoices</TabsTrigger>
                    <TabsTrigger value="payment">Payment Methods</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                {/* ── OVERVIEW ─────────────────────────────────────────────── */}
                <TabsContent value="overview" className="flex flex-col gap-5">
                    {!sub ? (
                        <Card className="py-0">
                            <CardContent className="p-6">
                                <NotAvailable
                                    icon={AlertTriangle}
                                    title="No active subscription"
                                    reason={data?.reason ?? undefined}
                                />
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            {sub.pending_change ? (
                                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                                    <Clock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <p className="min-w-0 text-[12.5px] break-words">
                                        <span className="font-medium">
                                            Switching to {sub.pending_change.plan?.name ?? 'another plan'}
                                        </span>{' '}
                                        on {formatDate(sub.pending_change.effective_at)}. You stay on{' '}
                                        {sub.plan?.name} until then.
                                    </p>
                                </div>
                            ) : null}

                            {sub.cancel_at_period_end ? (
                                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3">
                                    <AlertTriangle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                                    <p className="min-w-0 flex-1 text-[12.5px] break-words">
                                        Your subscription ends on{' '}
                                        <span className="font-medium">{formatDate(sub.current_period_end)}</span>.
                                        You keep full access until then.
                                    </p>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={resume.isPending}
                                        onClick={() => resume.mutate()}
                                    >
                                        {resume.isPending
                                            ? <Loader2 className="size-3.5 animate-spin" />
                                            : <RotateCcw className="size-3.5" />}
                                        Resume
                                    </Button>
                                </div>
                            ) : null}

                            <div className="grid min-w-0 gap-5 lg:grid-cols-[1.4fr_1fr]">
                                {/* Current plan */}
                                <Card className="py-0">
                                    <CardContent className="flex flex-col gap-5 p-5">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-bold text-muted-foreground">
                                                Current Plan
                                            </span>
                                            {status ? (
                                                <Badge variant="ghost" className={STATUS_STYLE[status].className}>
                                                    {STATUS_STYLE[status].label}
                                                </Badge>
                                            ) : null}
                                        </div>

                                        <div className="grid min-w-0 gap-5 sm:grid-cols-[1fr_auto_1fr]">
                                            <div className="flex min-w-0 flex-col gap-2">
                                                <h2 className="text-xl font-semibold break-words">
                                                    {sub.plan?.name ?? 'Unknown plan'}
                                                </h2>
                                                {sub.plan?.short_description ? (
                                                    <p className="text-[12.5px] break-words text-muted-foreground">
                                                        {sub.plan.short_description}
                                                    </p>
                                                ) : null}
                                                <div className="mt-1 flex items-baseline gap-1">
                                                    <span className="text-3xl font-semibold">
                                                        {formatMoney(sub.amount.subtotal, sub.currency_code)}
                                                    </span>
                                                    <span className="text-sm text-muted-foreground">{cycleSuffix}</span>
                                                </div>
                                                <span className="text-[12.5px] text-muted-foreground">
                                                    {CYCLE_LABEL[sub.billing_cycle]}
                                                    {' · plus '}
                                                    {formatMoney(sub.amount.tax_amount, sub.currency_code)}
                                                    {` tax (${sub.amount.tax_rate}%)`}
                                                </span>
                                            </div>

                                            <Separator orientation="vertical" className="hidden self-stretch sm:block" />

                                            {/*
                                              The feature list is the menus this plan actually GRANTS —
                                              the only per-plan feature data in the database that is true.
                                            */}
                                            <div className="flex min-w-0 flex-col gap-1.5">
                                                {(data?.features ?? []).map((f) => (
                                                    <div key={f.id} className="flex items-start gap-2">
                                                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                                                        <span className="min-w-0 text-[12.5px] break-words">{f.label}</span>
                                                    </div>
                                                ))}
                                                {!data?.features?.length ? (
                                                    <span className="text-[12.5px] text-muted-foreground">
                                                        This plan grants no modules yet.
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        <Separator />

                                        <div className="flex flex-col gap-3">
                                            <span className="text-[12.5px] text-muted-foreground">
                                                {sub.next_billing_date
                                                    ? <>Next billing date: <span className="font-medium text-foreground">{formatDate(sub.next_billing_date)}</span></>
                                                    : sub.billing_cycle === 'lifetime'
                                                        ? 'This plan does not renew.'
                                                        : 'No further billing is scheduled.'}
                                            </span>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link href="/dashboard/billing/change-plan">Change Plan</Link>
                                                </Button>
                                                {!sub.cancel_at_period_end && status !== 'cancelled' ? (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-rose-600 hover:text-rose-600 dark:text-rose-400"
                                                        onClick={() => setCancelOpen(true)}
                                                    >
                                                        Cancel Subscription
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Summary */}
                                <Card className="py-0">
                                    <CardContent className="flex flex-col gap-4 p-5">
                                        <span className="text-sm font-bold text-muted-foreground">
                                            Billing Summary
                                        </span>
                                        <dl className="flex flex-col gap-3 text-[12.5px]">
                                            {[
                                                ['Plan', sub.plan?.name ?? '—'],
                                                ['Billing Cycle', CYCLE_LABEL[sub.billing_cycle] ?? sub.billing_cycle],
                                                ['Amount', `${formatMoney(sub.amount.subtotal, sub.currency_code)} + tax`],
                                                ['Tax', `${formatMoney(sub.amount.tax_amount, sub.currency_code)} (${sub.amount.tax_rate}%)`],
                                                ['Total', formatMoney(sub.amount.total, sub.currency_code)],
                                                ['Started', formatDate(sub.started_at)],
                                                ['Next Billing Date', sub.next_billing_date ? formatDate(sub.next_billing_date) : '—'],
                                            ].map(([label, value]) => (
                                                <div key={label} className="flex items-start justify-between gap-3">
                                                    <dt className="shrink-0 text-muted-foreground">{label}</dt>
                                                    <dd className="min-w-0 text-end font-medium break-words">{value}</dd>
                                                </div>
                                            ))}
                                            <div className="flex items-center justify-between gap-3">
                                                <dt className="shrink-0 text-muted-foreground">Payment Method</dt>
                                                <dd className="min-w-0 text-end">
                                                    {/*
                                                      The server's own label. A UPI address has no
                                                      last four, so "•••• 4242" only works for a
                                                      card — and the label is already worded once,
                                                      centrally, for exactly this reason.
                                                    */}
                                                    {pm?.default_method ? (
                                                        <span className="font-medium break-words">
                                                            {pm.default_method.label}
                                                        </span>
                                                    ) : (
                                                        <span className="font-medium text-muted-foreground">Not set up yet</span>
                                                    )}
                                                </dd>
                                            </div>
                                        </dl>

                                        <Separator />

                                        {/*
                                          The design's "Manage Payment Method" button. It moves to the
                                          Payment Methods tab, which is a screen that exists — not to a
                                          gateway portal, which does not.
                                        */}
                                        <Button
                                            variant="outline"
                                            className="w-full"
                                            onClick={() => setTab('payment')}
                                        >
                                            Manage Payment Method
                                        </Button>

                                        {!pm?.gateway.enabled ? (
                                            <p className="text-[11px] break-words text-muted-foreground">
                                                {pm?.manual.reason ?? unavailable.payment_methods}
                                            </p>
                                        ) : null}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Usage */}
                            <Card className="py-0">
                                <CardContent className="flex flex-col gap-5 p-5">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="text-sm font-bold">Usage this billing period</span>
                                        {/*
                                          Labelled by the PERIOD, not "this month". The design says
                                          "Usage This Month", but a plan ceiling applies to the term —
                                          on a yearly plan a monthly count against an annual allowance
                                          is a number that means nothing.
                                        */}
                                        <span className="text-[11px] text-muted-foreground">
                                            {formatDate(data?.usage.period_start)} – {formatDate(data?.usage.period_end)}
                                        </span>
                                    </div>
                                    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5 xl:gap-0 xl:divide-x xl:divide-border">
                                        <div className="xl:pr-6">
                                            <UsageTile
                                                icon={Calendar} label="Events" tint="bg-violet-500/15 text-violet-600 dark:text-violet-400"
                                                metric={data!.usage.events}
                                            />
                                        </div>
                                        <div className="xl:px-6">
                                            <UsageTile
                                                icon={Users} label="Guests" tint="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                                metric={data!.usage.guests}
                                                perEventLimit={data!.usage.guests.per_event_limit}
                                            />
                                        </div>
                                        <div className="xl:px-6">
                                            <UsageTile
                                                icon={Mail} label="Messages Sent" tint="bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                                metric={data!.usage.messages}
                                            />
                                        </div>
                                        <div className="xl:px-6">
                                            <RsvpLimitTile limit={data!.usage.rsvps?.limit ?? null} />
                                        </div>
                                        <div className="xl:pl-6">
                                            <UsageTile
                                                icon={HardDrive} label="Storage Used" unit={data!.usage.storage.unit ?? 'GB'}
                                                tint="bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                                metric={data!.usage.storage as never}
                                            />
                                        </div>
                                    </div>

                                    <Separator />

                                    {/*
                                      The design's "View Usage Details". It points at Analytics —
                                      the one screen that actually breaks these figures down — rather
                                      than at a usage page that was never built.
                                    */}
                                    <Link
                                        href="/dashboard/analytics"
                                        className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline"
                                    >
                                        View usage details <ArrowRight className="size-3.5" />
                                    </Link>
                                </CardContent>
                            </Card>

                            {/* ── Recent invoices · payment method · billing details ── */}
                            <div className="grid min-w-0 gap-5 lg:grid-cols-[1.4fr_1fr]">
                                <RecentInvoicesCard onViewAll={() => setTab('invoices')} />

                                <div className="flex min-w-0 flex-col gap-5">
                                    <PaymentMethodCard
                                        data={pm}
                                        onManage={() => setTab('payment')}
                                    />
                                    <BillingDetailsCard reason={unavailable.billing_address} />
                                </div>
                            </div>
                        </>
                    )}

                    <div className="grid gap-5 md:grid-cols-2">
                        <Card className="py-0">
                            <CardContent className="flex flex-wrap items-center gap-4 p-5">
                                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10">
                                    <Crown className="size-5 text-primary" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium">Need more power?</p>
                                    <p className="text-[12.5px] break-words text-muted-foreground">
                                        Compare every plan and switch whenever you like.
                                    </p>
                                </div>
                                <Button asChild size="sm">
                                    <Link href="/dashboard/billing/upgrade">
                                        See plans <ArrowRight className="size-3.5" />
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="py-0">
                            <CardContent className="flex flex-wrap items-center gap-4 p-5">
                                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
                                    <Headphones className="size-5 text-muted-foreground" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium">Need help?</p>
                                    <p className="text-[12.5px] break-words text-muted-foreground">
                                        Questions about your plan or your usage.
                                    </p>
                                </div>
                                <Button asChild size="sm" variant="outline">
                                    <Link href="/dashboard/billing/contact-sales">Contact us</Link>
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ── INVOICES ─────────────────────────────────────────────── */}
                <TabsContent value="invoices" className="flex flex-col gap-5">
                    <InvoicesPanel onGoToHistory={() => setTab('history')} />
                </TabsContent>

                {/* ── PAYMENT METHODS ──────────────────────────────────────── */}
                <TabsContent value="payment">
                    <PaymentMethodsPanel />
                </TabsContent>

                {/* ── BILLING HISTORY ──────────────────────────────────────── */}
                <TabsContent value="history" className="flex flex-col gap-5">
                    <HistoryPanel />
                </TabsContent>

            </Tabs>

            {/* Cancel confirmation */}
            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cancel your subscription?</DialogTitle>
                        <DialogDescription>
                            {/*
                              States what actually happens. "Cancel" beside a plan name
                              reads as though access stops immediately, and it does not.
                            */}
                            You keep full access until{' '}
                            <span className="font-medium text-foreground">
                                {formatDate(sub?.current_period_end)}
                            </span>
                            . Nothing is charged after that, and you can resume any time before then.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="cancel-reason">Why are you cancelling? (optional)</Label>
                        <Textarea
                            id="cancel-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="This helps us improve."
                            rows={3}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelOpen(false)}>
                            Keep my plan
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={cancel.isPending}
                            onClick={() =>
                                cancel.mutate(
                                    { reason: reason.trim() || undefined },
                                    // Closes only on success — on failure the subscription
                                    // is still live and dismissing would imply otherwise.
                                    { onSuccess: () => { setCancelOpen(false); setReason(''); } },
                                )
                            }
                        >
                            {cancel.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Cancel subscription
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Invoices
 * ────────────────────────────────────────────────────────────────────────── */

const INVOICE_STATUS_STYLE: Record<string, string> = {
    paid: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    unpaid: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    partially_paid: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    overdue: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    cancelled: 'bg-muted text-muted-foreground',
    refunded: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    draft: 'bg-muted text-muted-foreground',
};

const prettyStatus = (s: string) => s.replace(/_/g, ' ');

/**
 * The Invoices tab.
 *
 * ── THE TILES COUNT THE WHOLE ACCOUNT, NOT THE FILTERED PAGE ────────────────
 * A "Total Invoices" that changes when you type in the search box is not a
 * total. The API computes them over every invoice and returns them beside the
 * filtered page, and each tile is captioned "All time" so the two numbers on
 * screen cannot be read as the same claim.
 *
 * ── THERE IS NO PAY BUTTON, AND NO PAYMENT METHOD COLUMN ────────────────────
 * `payments_enabled` comes from the API. While it is false the screen says so
 * once, plainly, instead of rendering a disabled Pay control on every row —
 * which reads as a bug rather than as a feature that has not launched.
 *
 * The design also draws a "Payment Method" column showing the card each invoice
 * was paid with. Nothing links a transaction to a saved card:
 * `client_transactions` carries `gateway` and `gateway_transaction_id` and no
 * payment-method id, and there are no payments at all yet. The column is
 * therefore absent rather than a column of em dashes.
 */
function InvoicesPanel({ onGoToHistory }: { onGoToHistory: () => void }) {
    const [status, setStatus] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [limit, setLimit] = useState('10');
    const [page, setPage] = useState(1);
    const [exporting, setExporting] = useState(false);

    // Debounced so typing does not fire a request per keystroke — the same
    // mistake that made the Translations page fire a full scan per character.
    const [debounced, setDebounced] = useState('');
    useEffect(() => {
        const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    const params = {
        status: status === 'all' ? undefined : status,
        search: debounced || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: Number(limit),
    };

    const { data, isLoading, isFetching } = useInvoices({ ...params, page });

    const stats = data?.stats;
    const invoices = data?.invoices ?? [];
    const pagination = data?.pagination;
    const filtered = status !== 'all' || !!debounced || !!from || !!to;

    /** Every filter change returns to page 1 — a narrower result set otherwise lands on an empty page. */
    const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

    const clearAll = () => {
        setStatus('all'); setSearch(''); setDebounced(''); setFrom(''); setTo(''); setPage(1);
    };

    const showingFrom = invoices.length ? ((pagination?.page ?? 1) - 1) * Number(limit) + 1 : 0;
    const showingTo = showingFrom ? showingFrom + invoices.length - 1 : 0;

    /**
     * Export.
     *
     * Built in the browser from the invoices the CURRENT FILTERS select, paging
     * the same endpoint the table uses — so the file and the screen can never
     * disagree. There is no server-side export and this needs none.
     */
    async function exportCsv() {
        setExporting(true);
        try {
            const rows: Invoice[] = [];
            // The API caps `limit` at 100; the guard stops a runaway loop if a
            // future change ever made totalPages unreliable.
            for (let pg = 1; pg <= 50; pg += 1) {
                const res = await api.get<InvoiceList>('/client/billing/invoices', {
                    ...params, limit: 100, page: pg,
                });
                rows.push(...res.invoices);
                if (!res.pagination || pg >= res.pagination.totalPages) break;
            }

            if (rows.length === 0) {
                toast.error('There is nothing to export with these filters.');
                return;
            }

            const header = [
                'Invoice ID', 'Issue Date', 'Period Start', 'Period End', 'Plan',
                'Currency', 'Subtotal', 'Tax', 'Total', 'Paid', 'Due', 'Status',
                'Payment Method',
            ];
            const body = rows.map((r) => [
                r.invoice_number, r.issue_date, r.period_start, r.period_end,
                r.plan?.name ?? '', r.currency_code,
                r.subtotal, r.tax_amount, r.total, r.amount_paid, r.amount_due,
                prettyStatus(r.status),
                r.payment_method?.label ?? '',
            ]);

            const csv = [header, ...body].map((line) => line.map(csvCell).join(',')).join('\r\n');
            // The BOM is what makes Excel read the ₹ and any non-ASCII name
            // correctly instead of as mojibake.
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(`Exported ${rows.length} invoice${rows.length === 1 ? '' : 's'}.`);
        } catch {
            toast.error('Could not export your invoices.');
        } finally {
            setExporting(false);
        }
    }

    if (isLoading && !data) {
        return (
            <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <Skeleton className="h-96 rounded-xl" />
                    <Skeleton className="h-96 rounded-xl" />
                </div>
            </>
        );
    }

    return (
        <>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-[12.5px] text-muted-foreground">
                    View and download all your invoices.
                </p>
                <Button variant="outline" size="sm" disabled={exporting} onClick={exportCsv}>
                    {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    Export Invoices
                </Button>
            </div>

            {/* ── Tiles: the whole account, always ──────────────────────────── */}
            <Card className="py-0">
                <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:divide-x sm:divide-border xl:grid-cols-4">
                    {[
                        { label: 'Total Invoices', value: String(stats?.total_invoices ?? 0), tint: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', icon: FileText },
                        { label: 'Total Amount', value: formatMoney(stats?.total_amount ?? 0), tint: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', icon: Receipt },
                        { label: 'Paid Amount', value: formatMoney(stats?.paid_amount ?? 0), tint: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
                        { label: 'Outstanding Amount', value: formatMoney(stats?.outstanding_amount ?? 0), tint: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', icon: Clock },
                    ].map((t, i) => (
                        <div key={t.label} className={`flex items-center gap-3 ${i > 0 ? 'sm:pl-4' : ''}`}>
                            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${t.tint}`}>
                                <t.icon className="size-4" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[11px] text-muted-foreground">{t.label}</p>
                                <p className="text-lg font-semibold break-words">{t.value}</p>
                                <p className="text-[10.5px] text-muted-foreground/70">All time</p>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                {/* ── Table ─────────────────────────────────────────────────── */}
                <Card className="py-0">
                    <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <div className="relative min-w-[200px] flex-1">
                                <Search className="absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by invoice ID…"
                                    className="h-9 ps-8 text-[12.5px]"
                                />
                            </div>

                            {/*
                              Only the statuses that actually occur are offered. A
                              filter for "refunded" on an account with no refunds
                              selects nothing and reads as broken.
                            */}
                            <Select value={status} onValueChange={reset(setStatus)}>
                                <SelectTrigger className="h-9 w-[165px] text-[12.5px]">
                                    {/* Custom children so the count badge (below, inside each
                                        SelectItem) does not get mirrored into the collapsed trigger. */}
                                    <SelectValue>
                                        {status === 'all' ? 'Status: All' : `Status: ${prettyStatus(status)}`}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        Status: All
                                        <span className="ms-1.5 text-[11px] opacity-60">
                                            {stats?.total_invoices ?? 0}
                                        </span>
                                    </SelectItem>
                                    {Object.keys(stats?.by_status ?? {}).map((sKey) => (
                                        <SelectItem key={sKey} value={sKey} className="capitalize">
                                            {prettyStatus(sKey)}
                                            <span className="ms-1.5 text-[11px] opacity-60">
                                                {stats?.by_status?.[sKey] ?? 0}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/*
                              Native date inputs, matching Billing History. A custom
                              range picker is a lot of surface for two dates, and the
                              native control already knows the locale and the keyboard.

                              The range is INCLUSIVE of the `to` day, server-side.
                            */}
                            <Input
                                type="date" value={from} max={to || undefined}
                                onChange={(e) => reset(setFrom)(e.target.value)}
                                className="h-9 w-[145px] text-[12.5px]" aria-label="From date"
                            />
                            <Input
                                type="date" value={to} min={from || undefined}
                                onChange={(e) => reset(setTo)(e.target.value)}
                                className="h-9 w-[145px] text-[12.5px]" aria-label="To date"
                            />

                            {filtered ? (
                                <Button variant="ghost" size="sm" className="h-9" onClick={clearAll}>
                                    <X className="size-3.5" /> Clear
                                </Button>
                            ) : null}
                        </div>

                        {invoices.length === 0 ? (
                            <NotAvailable
                                icon={FileText}
                                title="No invoices found"
                                reason={
                                    filtered
                                        ? 'Nothing matches these filters.'
                                        : 'An invoice is raised at the start of each billing term.'
                                }
                            />
                        ) : (
                            <>
                                {/* Scrolls inside its own box — the page must never scroll sideways. */}
                                <div className="w-full overflow-x-auto">
                                    <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="min-w-[150px]">Invoice ID</TableHead>
                                                {/*
                                                  The arrow states the order the API actually
                                                  returns — newest first — rather than offering
                                                  a sort the endpoint does not accept.
                                                */}
                                                <TableHead className="min-w-[120px]">Date ↓</TableHead>
                                                <TableHead className="min-w-[110px] text-end">Amount</TableHead>
                                                <TableHead className="min-w-[100px] ps-6">Status</TableHead>
                                                {/*
                                                  Real since `client_transactions` gained
                                                  `client_payment_method_id` plus a brand /
                                                  last4 SNAPSHOT. The snapshot is what an
                                                  archived invoice keeps saying after the
                                                  card is renamed or removed.
                                                */}
                                                <TableHead className="min-w-[150px]">Payment Method</TableHead>
                                                <TableHead className="min-w-[80px] text-end">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {invoices.map((inv) => (
                                                <TableRow key={inv.id}>
                                                    <TableCell className="max-w-[200px] font-medium break-all">
                                                        {inv.invoice_number}
                                                    </TableCell>
                                                    <TableCell className="text-[12.5px] whitespace-nowrap">
                                                        {formatDate(inv.issue_date)}
                                                    </TableCell>
                                                    <TableCell className="text-end tabular-nums whitespace-nowrap">
                                                        {formatMoney(inv.total, inv.currency_code)}
                                                    </TableCell>
                                                    <TableCell className="ps-6">
                                                        <Badge
                                                            variant="ghost"
                                                            className={`${INVOICE_STATUS_STYLE[inv.status] ?? 'bg-muted text-muted-foreground'} capitalize`}
                                                        >
                                                            {prettyStatus(inv.status)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {inv.payment_method ? (
                                                            <span className="flex items-center gap-2">
                                                                <BrandMark brand={inv.payment_method.brand} />
                                                                <span className="text-[12.5px] tabular-nums">
                                                                    &bull;&bull;&bull;&bull; {inv.payment_method.last4 ?? '----'}
                                                                </span>
                                                            </span>
                                                        ) : (
                                                            /* Never a zero or a blank: nothing was paid, so
                                                               there is no card to name. */
                                                            <span className="text-[12.5px] text-muted-foreground">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-end">
                                                        {/*
                                                          Both actions land on the same invoice page --
                                                          it carries the print action, which is the only
                                                          thing that actually produces a file. A download
                                                          icon that downloads nothing is worse than no icon.
                                                        */}
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button asChild size="icon" variant="ghost" className="size-8">
                                                                <Link
                                                                    href={`/dashboard/billing/invoices/${inv.id}`}
                                                                    title="Download this invoice"
                                                                >
                                                                    <Download className="size-3.5" />
                                                                </Link>
                                                            </Button>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button
                                                                        size="icon" variant="ghost" className="size-8"
                                                                        aria-label="More actions"
                                                                    >
                                                                        <MoreVertical className="size-3.5" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem asChild>
                                                                        <Link href={`/dashboard/billing/invoices/${inv.id}`}>
                                                                            <Eye className="size-3.5" /> View Invoice
                                                                        </Link>
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="grid min-w-0 grid-cols-1 items-center gap-3 sm:grid-cols-3">
                                    <p className="text-[11.5px] text-muted-foreground">
                                        Showing {showingFrom} to {showingTo} of{' '}
                                        {pagination?.totalItems ?? 0} invoice
                                        {(pagination?.totalItems ?? 0) === 1 ? '' : 's'}
                                        {filtered && pagination?.totalItems !== stats?.total_invoices
                                            ? ` (filtered from ${stats?.total_invoices ?? 0})`
                                            : ''}
                                    </p>
                                    <div className="flex items-center justify-center gap-2">
                                        <Button
                                            size="icon" variant="outline" className="size-8"
                                            disabled={page <= 1}
                                            onClick={() => setPage((v) => Math.max(1, v - 1))}
                                            aria-label="Previous page"
                                        >
                                            <ChevronLeft className="size-4" />
                                        </Button>
                                        <span className="text-[12px] tabular-nums">
                                            {pagination?.page ?? 1} / {pagination?.totalPages ?? 1}
                                        </span>
                                        <Button
                                            size="icon" variant="outline" className="size-8"
                                            disabled={!pagination || page >= pagination.totalPages}
                                            onClick={() => setPage((v) => v + 1)}
                                            aria-label="Next page"
                                        >
                                            <ChevronRight className="size-4" />
                                        </Button>
                                    </div>
                                    <div className="flex items-center justify-end gap-2">
                                        <Select value={limit} onValueChange={reset(setLimit)}>
                                            <SelectTrigger className="h-8 w-[95px] text-[12px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {['10', '20', '50'].map((n) => (
                                                    <SelectItem key={n} value={n}>{n} / page</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </>
                        )}

                        {data && !data.payments_enabled && data.payments_reason ? (
                            <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-[11px] break-words text-muted-foreground">
                                <Info className="mt-0.5 size-3.5 shrink-0" />
                                {data.payments_reason}
                            </p>
                        ) : null}
                    </CardContent>
                </Card>

                {/* ── Rail ──────────────────────────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-5">
                    <InvoiceSummaryCard stats={stats} onViewHistory={onGoToHistory} />

                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-3 p-5">
                            <span className="text-[13px] font-semibold">Filter by Status</span>
                            <div className="flex flex-col gap-1">
                                <StatusFilterRow
                                    label="All Invoices"
                                    count={stats?.total_invoices ?? 0}
                                    dot="bg-primary"
                                    active={status === 'all'}
                                    onClick={() => reset(setStatus)('all')}
                                />
                                {Object.entries(stats?.by_status ?? {}).map(([sKey, count]) => (
                                    <StatusFilterRow
                                        key={sKey}
                                        label={prettyStatus(sKey)}
                                        count={count}
                                        dot={STATUS_DOT[sKey] ?? 'bg-muted-foreground'}
                                        active={status === sKey}
                                        onClick={() => reset(setStatus)(sKey)}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-3 p-5">
                            <div className="flex items-center gap-2.5">
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                                    <Headphones className="size-4 text-muted-foreground" />
                                </span>
                                <span className="text-[13px] font-semibold">Need help?</span>
                            </div>
                            <p className="text-[12px] break-words text-muted-foreground">
                                Questions about an invoice or a payment.
                            </p>
                            <Button asChild variant="outline" size="sm" className="w-full">
                                <Link href="/dashboard/billing/contact-sales">
                                    <Headphones className="size-3.5" /> Contact us
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/*
              The design says "Invoices are generated on the 12th of every
              month". They are not: one is raised at the start of each billing
              TERM, which on a yearly plan is once a year.
            */}
            <div className="flex min-w-0 items-start gap-2.5 rounded-lg border bg-muted/40 px-4 py-3">
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="min-w-0 text-[12px] break-words text-muted-foreground">
                    An invoice is raised at the start of each billing term, so how often you
                    see one follows your plan&rsquo;s cycle. Every invoice you have ever been
                    issued stays listed here.
                </p>
            </div>
        </>
    );
}

/* ── Invoices: rail pieces ───────────────────────────────────────────────── */

const STATUS_DOT: Record<string, string> = {
    paid: 'bg-emerald-500',
    unpaid: 'bg-amber-500',
    partially_paid: 'bg-blue-500',
    overdue: 'bg-rose-500',
    cancelled: 'bg-muted-foreground',
    refunded: 'bg-violet-500',
    draft: 'bg-muted-foreground',
};

function StatusFilterRow({ label, count, dot, active, onClick }: {
    label: string; count: number; dot: string; active: boolean; onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-[12.5px] transition-colors ${
                active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
            }`}
        >
            <span className={`size-2 shrink-0 rounded-full ${dot}`} />
            <span className="min-w-0 flex-1 capitalize break-words">{label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{count}</span>
        </button>
    );
}

/**
 * The design's donut.
 *
 * Paid against Outstanding, both of which are real sums the API already
 * returns. It is deliberately NOT "Paid vs Unpaid by COUNT": a single large
 * unpaid invoice among nine small paid ones is 10% by count and most of the
 * money, and the tiles above it are money, so the ring is money too.
 */
function InvoiceSummaryCard({ stats, onViewHistory }: {
    stats: InvoiceList['stats'] | undefined;
    onViewHistory: () => void;
}) {
    const total = stats?.total_amount ?? 0;
    const paid = stats?.paid_amount ?? 0;
    const due = stats?.outstanding_amount ?? 0;

    const slices = [
        { key: 'paid', name: 'Paid', value: paid, fill: 'var(--color-emerald-500, #10b981)' },
        { key: 'due', name: 'Outstanding', value: due, fill: 'var(--color-amber-500, #f59e0b)' },
    ].filter((s) => s.value > 0);

    const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

    return (
        <Card className="py-0">
            <CardContent className="flex flex-col gap-4 p-5">
                <span className="text-[13px] font-semibold">Summary</span>

                {slices.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-3 py-6 text-center text-[12px] text-muted-foreground">
                        Nothing has been invoiced yet.
                    </p>
                ) : (
                    <>
                        <div className="relative mx-auto h-[150px] w-[150px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={slices}
                                        dataKey="value"
                                        nameKey="name"
                                        innerRadius={46}
                                        outerRadius={70}
                                        strokeWidth={0}
                                    >
                                        {slices.map((sl) => <Cell key={sl.key} fill={sl.fill} />)}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            {/* Centre label as DOM, not SVG <text> — it inherits
                                the app font and stays readable in both themes. */}
                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-[15px] leading-none font-bold tabular-nums">
                                    {share(paid)}%
                                </span>
                                <span className="mt-0.5 text-[10px] text-muted-foreground">Paid</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 text-[12.5px]">
                            <LegendRow dot="bg-emerald-500" label="Paid" value={formatMoney(paid)} share={share(paid)} />
                            <LegendRow dot="bg-amber-500" label="Outstanding" value={formatMoney(due)} share={share(due)} />
                        </div>
                    </>
                )}

                <Separator />

                <div className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="font-medium">Total</span>
                    <span className="font-semibold tabular-nums break-words">{formatMoney(total)}</span>
                </div>

                <Button variant="outline" size="sm" className="w-full" onClick={onViewHistory}>
                    View Billing History
                </Button>
            </CardContent>
        </Card>
    );
}

function LegendRow({ dot, label, value, share }: {
    dot: string; label: string; value: string; share: number;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className={`size-2 shrink-0 rounded-full ${dot}`} />
            <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
            <span className="shrink-0 tabular-nums">
                {value} <span className="text-muted-foreground">({share}%)</span>
            </span>
        </div>
    );
}

/**
 * One CSV cell.
 *
 * Quoted and quote-doubled, and a leading =, +, - or @ is prefixed with an
 * apostrophe: a spreadsheet treats those as FORMULAS, so an invoice note could
 * otherwise execute when the file is opened.
 */
function csvCell(v: unknown) {
    const raw = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
}

/* -----------------------------------------------------------------------------
 * Overview: recent invoices
 *
 * The five most recent, which is what the design shows. The full list, its
 * filters and its totals live on the Invoices tab -- this is a glance, so it
 * carries no search box and no pagination of its own.
 * -------------------------------------------------------------------------- */

function RecentInvoicesCard({ onViewAll }: { onViewAll: () => void }) {
    const { data, isLoading } = useInvoices({ page: 1 });
    const invoices = (data?.invoices ?? []).slice(0, 5);

    return (
        <Card className="py-0">
            <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">Recent Invoices</span>
                    {data?.stats?.total_invoices ? (
                        <button
                            type="button"
                            onClick={onViewAll}
                            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline"
                        >
                            View all invoices <ArrowRight className="size-3.5" />
                        </button>
                    ) : null}
                </div>

                {isLoading && !data ? (
                    <Skeleton className="h-48 rounded-lg" />
                ) : invoices.length === 0 ? (
                    <NotAvailable
                        icon={FileText}
                        title="No invoices yet"
                        reason="An invoice is raised at the start of each billing term."
                    />
                ) : (
                    <div className="w-full overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-[150px]">Invoice ID</TableHead>
                                    <TableHead className="min-w-[110px]">Date</TableHead>
                                    <TableHead className="min-w-[110px] text-end">Amount</TableHead>
                                    <TableHead className="min-w-[100px] ps-6">Status</TableHead>
                                    {/*
                                      Labelled "Download" to match the design. It still opens the
                                      invoice page -- the print action there is the only thing that
                                      actually produces a file, so the icon points at where that
                                      really happens rather than promising a direct download.
                                    */}
                                    <TableHead className="min-w-[70px] text-end">Download</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoices.map((inv) => (
                                    <TableRow key={inv.id}>
                                        <TableCell className="max-w-[200px] font-medium break-all">
                                            {inv.invoice_number}
                                        </TableCell>
                                        <TableCell className="text-[12.5px] whitespace-nowrap">
                                            {formatDate(inv.issue_date)}
                                        </TableCell>
                                        <TableCell className="text-end tabular-nums whitespace-nowrap">
                                            {formatMoney(inv.total, inv.currency_code)}
                                        </TableCell>
                                        <TableCell className="ps-6">
                                            <Badge
                                                variant="ghost"
                                                className={`${INVOICE_STATUS_STYLE[inv.status] ?? 'bg-muted text-muted-foreground'} capitalize`}
                                            >
                                                {prettyStatus(inv.status)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-end">
                                            <Button asChild size="icon" variant="ghost" className="size-8">
                                                <Link
                                                    href={`/dashboard/billing/invoices/${inv.id}`}
                                                    title="Download this invoice"
                                                >
                                                    <Download className="size-3.5" />
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/* -----------------------------------------------------------------------------
 * Overview: the default payment method
 *
 * Everything READ-side here is real. Only ADD waits on a provider, and the
 * button carries the server's own reason rather than a string typed here -- so
 * it switches itself on the day a gateway is configured.
 * -------------------------------------------------------------------------- */

function PaymentMethodCard({
    data, onManage,
}: {
    data: PaymentMethodList | undefined;
    onManage: () => void;
}) {
    const def = data?.default_method ?? null;
    // No longer gated on a provider: the manual route needs none, so the cap is
    // the only thing that can stop an add.
    const canAdd = Boolean(data?.can_add);

    return (
        <Card className="py-0">
            <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">Payment Method</span>
                    <button
                        type="button"
                        onClick={onManage}
                        className="text-[12.5px] font-medium text-primary hover:underline"
                    >
                        Manage
                    </button>
                </div>

                {def ? (
                    <div className="flex min-w-0 items-center gap-3">
                        <BrandMark brand={def.method_type === 'card' ? def.brand : null} />
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[13px] font-medium break-words">{def.label}</p>
                                <Badge variant="secondary" className="h-5 text-[10.5px]">Default</Badge>
                                {def.is_expired ? (
                                    <Badge variant="destructive" className="h-5 text-[10.5px]">Expired</Badge>
                                ) : null}
                            </div>
                            <p className="mt-0.5 text-[11.5px] break-words text-muted-foreground">
                                {def.method_type === 'card'
                                    ? def.expiry_label ? `Expires ${def.expiry_label}` : 'No expiry recorded'
                                    : `${def.type_label} · ${def.is_verified ? 'verified' : 'not verified'}`}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-dashed p-4">
                        <CreditCard className="size-4 shrink-0 text-muted-foreground" />
                        <p className="min-w-0 text-[12.5px] break-words text-muted-foreground">
                            {data?.methods.length
                                ? 'None of your saved methods is set as the default.'
                                : 'No payment method saved yet.'}
                        </p>
                    </div>
                )}

                {/*
                  Disabled with the reason beside it, not hidden: the design has
                  this button, and a client who cannot find it assumes the feature
                  is broken rather than not yet launched.
                */}
                <Button
                    variant="outline"
                    className="w-full border-dashed"
                    disabled={!canAdd}
                    onClick={onManage}
                >
                    <Plus className="size-4" /> Add Payment Method
                </Button>

                {!data?.gateway.enabled ? (
                    <p className="flex min-w-0 items-start gap-2 text-[11px] break-words text-muted-foreground">
                        <Lock className="mt-0.5 size-3 shrink-0" />
                        {data?.manual.reason ?? 'Nothing is charged automatically.'}
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );
}

/* -----------------------------------------------------------------------------
 * Overview: billing details
 *
 * The design calls this "Billing Address" and draws a street, a city and a PIN
 * code. `website_clients` has NO address columns -- name, company, email and
 * mobile are every contact field this account actually has, which is also why
 * an invoice's `billing_address` is written as null.
 *
 * So the card shows what is real, and states the missing part in the server's
 * own words instead of rendering a plausible address nobody entered. Edit goes
 * to Profile, which is where these four fields are actually changed.
 * -------------------------------------------------------------------------- */

function BillingDetailsCard({ reason }: { reason?: string }) {
    const { data: me } = useClientProfile();

    const phone = me?.mobile ? `${me.dial_code ?? ''} ${me.mobile}`.trim() : null;

    return (
        <Card className="py-0">
            <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">Billing Details</span>
                    <Link
                        href="/dashboard/profile"
                        className="text-[12.5px] font-medium text-primary hover:underline"
                    >
                        <Pencil className="me-1 inline size-3" />Edit
                    </Link>
                </div>

                <div className="flex min-w-0 flex-col gap-1 text-[12.5px]">
                    <p className="font-medium break-words">{me?.name ?? '—'}</p>
                    {me?.company_name ? (
                        <p className="break-words text-muted-foreground">{me.company_name}</p>
                    ) : null}
                    {/* Invoices are addressed to the account's own email. */}
                    <p className="break-all text-muted-foreground">{me?.email ?? '—'}</p>
                    {phone ? <p className="break-words text-muted-foreground">{phone}</p> : null}
                </div>

                <p className="flex min-w-0 items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-[11px] break-words text-muted-foreground">
                    <MapPin className="mt-0.5 size-3 shrink-0" />
                    {reason ?? 'No billing address is stored on your account yet.'}
                </p>
            </CardContent>
        </Card>
    );
}
