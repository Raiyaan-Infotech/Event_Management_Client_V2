'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, CheckCircle2, Minus, ShieldCheck, RefreshCw, Lock,
    ChevronDown, Loader2, Info, ArrowRight,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import {
    useBillingPlans, useChangePlan, formatMoney, formatDate, CYCLE_SUFFIX, CYCLE_LABEL,
} from '@/hooks/use-billing';

/**
 * Upgrade Now.
 *
 * ── HOW THIS DIFFERS FROM THE MOCKUP, AND WHY ───────────────────────────────
 *
 * **The Monthly ⇄ Yearly toggle filters; it does not re-price.** The design
 * implies each plan has a monthly and a yearly price with 20% off the latter.
 * In this database a plan has ONE `billing_cycle` — Basic is monthly-only,
 * Premium yearly-only — so there is no pair to toggle between and no discount
 * field anywhere. The toggle therefore shows the plans billed on that cycle,
 * and hides itself entirely when only one cycle exists. Real per-cycle pricing
 * needs paired plans or a price-per-cycle table.
 *
 * **There is no Checkout button.** Choosing a plan schedules the switch for the
 * end of the current term, exactly as Change Plan does. An immediate upgrade
 * has to charge the difference, and there is no payment provider to charge it
 * with; applying it for free would hand out a paid plan on a button press.
 *
 * **No add-ons and no coupon field.** Neither has a table, a catalogue, or a
 * price list. A quantity selector that adds ₹999 to a total nobody will ever
 * charge is a worse outcome than the row not being there.
 */
export default function UpgradeNowPage() {
    const { data, isLoading } = useBillingPlans();
    const changePlan = useChangePlan();
    const [confirmId, setConfirmId] = useState<number | null>(null);

    const plans = useMemo(() => data?.plans ?? [], [data]);
    const sub = data?.subscription ?? null;
    const ending = sub?.cancel_at_period_end === true;

    // Only the cycles that actually occur. A toggle offering "Yearly" on an
    // account where no plan is billed yearly selects nothing and reads as broken.
    const cycles = useMemo(
        () => Array.from(new Set(plans.map((p) => p.billing_cycle))),
        [plans],
    );
    const [cycle, setCycle] = useState<string | null>(null);
    const activeCycle = cycle ?? sub?.billing_cycle ?? cycles[0] ?? null;

    const shown = cycles.length > 1 && activeCycle
        ? plans.filter((p) => p.billing_cycle === activeCycle)
        : plans;

    const target = plans.find((p) => p.id === confirmId) ?? null;

    const allFeatures = useMemo(
        () => Array.from(new Map(plans.flatMap((p) => p.features).map((f) => [f.id, f])).values()),
        [plans],
    );

    if (isLoading) {
        return (
            <div className="flex flex-col gap-5 p-4 md:p-6">
                <Skeleton className="h-8 w-52" />
                <div className="grid gap-5 md:grid-cols-3">
                    <Skeleton className="h-80 rounded-xl" />
                    <Skeleton className="h-80 rounded-xl" />
                    <Skeleton className="h-80 rounded-xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-5 p-4 md:p-6">
            <div className="flex flex-col gap-1">
                <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit text-muted-foreground">
                    <Link href="/dashboard/billing"><ArrowLeft className="size-3.5" /> Back to Billing</Link>
                </Button>
                <h1 className="text-2xl font-semibold tracking-tight">Upgrade Now</h1>
                <p className="text-sm text-muted-foreground">
                    Choose the plan that grows with your events.
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-4 text-[12.5px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-emerald-500" /> Secure &amp; encrypted</span>
                    <span className="flex items-center gap-1.5"><RefreshCw className="size-3.5 text-violet-500" /> Cancel anytime</span>
                    <span className="flex items-center gap-1.5"><Lock className="size-3.5 text-blue-500" /> No hidden fees</span>
                </div>
            </div>

            {/* Cycle filter — hidden when there is only one cycle to choose. */}
            {cycles.length > 1 ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] text-muted-foreground">Billed</span>
                    {cycles.map((c) => (
                        <Button
                            key={c}
                            size="sm"
                            variant={activeCycle === c ? 'default' : 'outline'}
                            className="h-8 capitalize"
                            onClick={() => setCycle(c)}
                        >
                            {c}
                        </Button>
                    ))}
                    {/*
                      Stated rather than implied. The mockup's "Save 20%" assumes a
                      monthly/yearly pair of the same plan, which this data does not
                      have — so the control filters instead of re-pricing, and says so.
                    */}
                    <span className="text-[11px] break-words text-muted-foreground">
                        Plans are billed on a fixed cycle — this filters, it does not re-price.
                    </span>
                </div>
            ) : null}

            {ending ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                    <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="min-w-0 text-[12.5px] break-words">
                        Your subscription is set to end on{' '}
                        <span className="font-medium">{formatDate(sub?.current_period_end)}</span>.
                        {' '}Resume it from the Billing page before choosing a new plan.
                    </p>
                </div>
            ) : null}

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="flex min-w-0 flex-col gap-5">
                    <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {shown.map((plan) => (
                            <Card
                                key={plan.id}
                                className={`py-0 ${plan.is_current ? 'border-primary ring-1 ring-primary' : ''}`}
                            >
                                <CardContent className="flex h-full flex-col gap-4 p-5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="min-w-0 text-base font-semibold break-words">{plan.name}</h2>
                                        {plan.is_current ? (
                                            <Badge variant="ghost" className="bg-primary/15 text-primary">Current</Badge>
                                        ) : null}
                                        {plan.is_pending ? (
                                            <Badge variant="ghost" className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                                Scheduled
                                            </Badge>
                                        ) : null}
                                    </div>

                                    {plan.short_description ? (
                                        <p className="text-[12.5px] break-words text-muted-foreground">
                                            {plan.short_description}
                                        </p>
                                    ) : null}

                                    <div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-2xl font-semibold">
                                                {formatMoney(plan.amount.subtotal, plan.currency_code)}
                                            </span>
                                            <span className="text-sm text-muted-foreground">
                                                {CYCLE_SUFFIX[plan.billing_cycle]}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-muted-foreground">
                                            {CYCLE_LABEL[plan.billing_cycle]}
                                            {plan.amount.subtotal > 0
                                                ? ` · ${formatMoney(plan.amount.total, plan.currency_code)} incl. ${plan.amount.tax_rate}% tax`
                                                : ''}
                                        </span>
                                    </div>

                                    <Separator />

                                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                        {plan.features.slice(0, 6).map((f) => (
                                            <div key={f.id} className="flex items-start gap-2">
                                                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                                                <span className="min-w-0 text-[12.5px] break-words">{f.label}</span>
                                            </div>
                                        ))}
                                        {plan.features.length > 6 ? (
                                            <span className="text-[11px] text-muted-foreground">
                                                +{plan.features.length - 6} more
                                            </span>
                                        ) : null}
                                    </div>

                                    <Button
                                        className="w-full"
                                        variant={plan.is_current ? 'outline' : 'default'}
                                        disabled={plan.is_current || ending || changePlan.isPending}
                                        onClick={() => setConfirmId(plan.id)}
                                    >
                                        {plan.is_current ? 'Current plan' : `Choose ${plan.name}`}
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Comparison */}
                    {allFeatures.length > 0 ? (
                        <Card className="py-0">
                            <CardContent className="flex flex-col gap-3 p-5">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="text-[12.5px] font-medium">Compare plan features</span>
                                    <Button asChild size="sm" variant="ghost" className="h-7">
                                        <Link href="/dashboard/billing/features">
                                            All features <ArrowRight className="size-3.5" />
                                        </Link>
                                    </Button>
                                </div>
                                <div className="w-full overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="min-w-[180px]">Feature</TableHead>
                                                {shown.map((p) => (
                                                    <TableHead key={p.id} className="min-w-[110px] text-center">
                                                        <span className="block break-words">{p.name}</span>
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {allFeatures.map((f) => (
                                                <TableRow key={f.id}>
                                                    <TableCell className="max-w-[240px] text-[12.5px] break-words">
                                                        {f.label}
                                                    </TableCell>
                                                    {shown.map((p) => (
                                                        <TableCell key={p.id} className="text-center">
                                                            {p.features.some((x) => x.id === f.id)
                                                                ? <CheckCircle2 className="mx-auto size-4 text-emerald-500" />
                                                                : <Minus className="mx-auto size-4 text-muted-foreground/40" />}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    ) : null}
                </div>

                {/* Rail */}
                <div className="flex min-w-0 flex-col gap-5">
                    {sub ? (
                        <Card className="py-0 xl:sticky xl:top-4">
                            <CardContent className="flex flex-col gap-3 p-5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[12.5px] font-medium">Your current plan</span>
                                    <Badge variant="ghost" className="bg-primary/15 text-primary">
                                        {sub.plan?.name}
                                    </Badge>
                                </div>
                                <dl className="flex flex-col gap-2 text-[12.5px]">
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Price</dt>
                                        <dd className="font-medium">
                                            {formatMoney(sub.amount.subtotal, sub.currency_code)}
                                            {CYCLE_SUFFIX[sub.billing_cycle]}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Tax ({sub.amount.tax_rate}%)</dt>
                                        <dd>{formatMoney(sub.amount.tax_amount, sub.currency_code)}</dd>
                                    </div>
                                    <Separator />
                                    <div className="flex justify-between gap-3 font-semibold">
                                        <dt>Total</dt>
                                        <dd>{formatMoney(sub.amount.total, sub.currency_code)}</dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Renews</dt>
                                        <dd>{sub.next_billing_date ? formatDate(sub.next_billing_date) : '—'}</dd>
                                    </div>
                                </dl>
                                <Separator />
                                <ul className="flex flex-col gap-1.5 text-[12.5px] text-muted-foreground">
                                    <li className="flex items-start gap-2">
                                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                                        Your new plan starts straight away
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                                        Cancel or change at any time
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                                        A new term starts on the day you switch
                                    </li>
                                </ul>
                            </CardContent>
                        </Card>
                    ) : null}

                    {/* FAQs — answers describe how this actually behaves. */}
                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-2 p-5">
                            <span className="text-[12.5px] font-medium">Frequently asked questions</span>
                            {[
                                {
                                    q: 'Can I change my plan later?',
                                    a: 'Yes. Choose another plan at any time and it applies straight away.',
                                },
                                {
                                    q: 'What happens when I upgrade?',
                                    a: 'Your new plan starts immediately, with a new billing term from today.',
                                },
                                {
                                    q: 'How do I pay?',
                                    a: 'Online payment is not enabled yet. An invoice is raised for each term and our team will arrange settlement with you.',
                                },
                                {
                                    q: 'Do you offer refunds?',
                                    a: 'Cancelling stops the next renewal and you keep access until your paid term ends. Please contact us about anything already invoiced.',
                                },
                            ].map((item) => (
                                <Collapsible key={item.q}>
                                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 py-2 text-start text-[12.5px] font-medium">
                                        <span className="min-w-0 break-words">{item.q}</span>
                                        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pb-2 text-[12.5px] break-words text-muted-foreground">
                                        {item.a}
                                    </CollapsibleContent>
                                </Collapsible>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-2 p-5">
                            <span className="text-[12.5px] font-medium">Need something custom?</span>
                            <p className="text-[12.5px] break-words text-muted-foreground">
                                Tell us what you need and our team will put a plan together.
                            </p>
                            <Button asChild size="sm" variant="outline" className="mt-1">
                                <Link href="/dashboard/billing/contact-sales">Contact sales</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Switch to {target?.name}?</DialogTitle>
                        <DialogDescription>
                            You move from <span className="font-medium text-foreground">{sub?.plan?.name}</span> to{' '}
                            <span className="font-medium text-foreground">{target?.name}</span> straight away.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmId(null)}>Back</Button>
                        <Button
                            disabled={changePlan.isPending}
                            onClick={() =>
                                confirmId !== null
                                && changePlan.mutate(confirmId, { onSuccess: () => setConfirmId(null) })
                            }
                        >
                            {changePlan.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Confirm switch
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
