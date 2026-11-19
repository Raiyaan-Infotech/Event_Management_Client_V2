'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Info, Loader2, Clock, Minus, Headphones } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import {
    useBillingPlans, useChangePlan, formatMoney, formatDate, CYCLE_SUFFIX, CYCLE_LABEL,
} from '@/hooks/use-billing';

/**
 * Change Plan.
 *
 * ── A CHANGE APPLIES STRAIGHT AWAY (Jamal, 2026-11-19: no pending) ─────────
 * Choosing a plan switches it now and starts a new term today (backend changePlan).
 *
 * ── THE COMPARISON TABLE IS REAL ────────────────────────────────────────────
 * Its rows are the union of the modules every plan grants
 * (`subscription_plan_menus`), so a tick means the plan genuinely includes that
 * module. It is NOT the design's hardcoded list of Team Members / API Access /
 * SSO — those name entitlements that do not exist anywhere in this system, and
 * a comparison table that promises them would be selling something undeliverable.
 */
export default function ChangePlanPage() {
    const { data, isLoading } = useBillingPlans();
    const changePlan = useChangePlan();
    const [confirmId, setConfirmId] = useState<number | null>(null);

    const plans = data?.plans ?? [];
    const sub = data?.subscription ?? null;
    const target = plans.find((p) => p.id === confirmId) ?? null;
    const ending = sub?.cancel_at_period_end === true;

    // The comparison table's rows: every module any offered plan grants, in a
    // stable order, so a plan missing one renders a dash rather than a gap.
    const allFeatures = Array.from(
        new Map(plans.flatMap((p) => p.features).map((f) => [f.id, f])).values(),
    );

    if (isLoading) {
        return (
            <div className="flex flex-col gap-5 p-4 md:p-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-16 rounded-xl" />
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
                <h1 className="text-2xl font-semibold tracking-tight">Change Plan</h1>
                <p className="text-sm text-muted-foreground">
                    Choose the plan that fits you. Upgrade or downgrade at any time.
                </p>
            </div>

            {/* The banner's date is read from the record, not typed into the copy. */}
            {sub ? (
                <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-4 py-3">
                    <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 text-[12.5px]">
                        <p className="break-words">
                            You are on{' '}
                            <span className="font-medium">{sub.plan?.name}</span>
                            {' ('}
                            {formatMoney(sub.amount.subtotal, sub.currency_code)}
                            {CYCLE_SUFFIX[sub.billing_cycle]}
                            {', plus tax)'}.
                        </p>
                        <p className="mt-0.5 break-words text-muted-foreground">
                            A new plan applies straight away, with a new billing term from today.
                        </p>
                    </div>
                </div>
            ) : null}

            {/*
              A cancelled term cannot also be scheduled to change plan — both
              would land on the same date and contradict each other. The API
              refuses it, so the UI says so up front instead of letting somebody
              press a button that cannot work.
            */}
            {ending ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                    <Clock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="min-w-0 text-[12.5px] break-words">
                        Your subscription is set to end on{' '}
                        <span className="font-medium">{formatDate(sub?.current_period_end)}</span>.
                        {' '}Resume it from the Billing page before changing plan.
                    </p>
                </div>
            ) : null}

            {sub?.pending_change ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                    <Clock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="min-w-0 text-[12.5px] break-words">
                        Already scheduled: <span className="font-medium">{sub.pending_change.plan?.name}</span>{' '}
                        from {formatDate(sub.pending_change.effective_at)}. Choosing your current plan
                        again cancels that switch.
                    </p>
                </div>
            ) : null}

            {/* Plan cards */}
            <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan) => (
                    <Card
                        key={plan.id}
                        className={`py-0 ${plan.is_current ? 'border-primary ring-1 ring-primary' : ''}`}
                    >
                        <CardContent className="flex h-full flex-col gap-4 p-5">
                            {plan.is_current ? (
                                <div className="flex justify-center">
                                    <Badge className="bg-primary px-3 py-1 text-[10.5px] font-bold tracking-wide text-primary-foreground uppercase">
                                        Current Plan
                                    </Badge>
                                </div>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="min-w-0 text-base font-semibold break-words">{plan.name}</h2>
                                {plan.is_pending ? (
                                    <Badge variant="ghost" className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                        Scheduled
                                    </Badge>
                                ) : null}
                                {plan.trial_days > 0 ? (
                                    <Badge variant="ghost" className="bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                        {plan.trial_days}-day trial
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
                                {plan.features.map((f) => (
                                    <div key={f.id} className="flex items-start gap-2">
                                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                                        <span className="min-w-0 text-[12.5px] break-words">{f.label}</span>
                                    </div>
                                ))}
                                {!plan.features.length ? (
                                    <span className="text-[12.5px] text-muted-foreground">
                                        No modules are attached to this plan yet.
                                    </span>
                                ) : null}
                            </div>

                            <Button
                                className="w-full"
                                variant={plan.is_current ? 'outline' : 'default'}
                                disabled={
                                    (plan.is_current && !sub?.pending_change)
                                    || ending
                                    || changePlan.isPending
                                }
                                onClick={() => setConfirmId(plan.id)}
                            >
                                {plan.is_current
                                    ? (sub?.pending_change ? 'Stay on this plan' : 'Current plan')
                                    : `Choose ${plan.name}`}
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Comparison — rows are the modules plans actually grant */}
            {allFeatures.length > 0 && plans.length > 0 ? (
                <Card className="py-0">
                    <CardContent className="flex flex-col gap-3 p-5">
                        <div className="flex flex-col gap-1">
                            <span className="text-[12.5px] font-medium">Compare plan features</span>
                            <span className="text-[11px] break-words text-muted-foreground">
                                Each row is a module the plan includes.
                            </span>
                        </div>
                        {/* The table scrolls inside its own box — the page must never scroll sideways. */}
                        <div className="w-full overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-[180px]">Feature</TableHead>
                                        {plans.map((p) => (
                                            <TableHead
                                                key={p.id}
                                                className={`min-w-[120px] text-center ${p.is_current ? 'border-x-2 border-primary bg-primary/5' : ''}`}
                                            >
                                                <span className="block break-words">{p.name}</span>
                                                <span className="block text-[11px] font-normal text-muted-foreground">
                                                    {formatMoney(p.amount.subtotal, p.currency_code)}
                                                    {CYCLE_SUFFIX[p.billing_cycle]}
                                                </span>
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {allFeatures.map((f) => (
                                        <TableRow key={f.id}>
                                            {/* break-words, never truncate: this table is auto-layout. */}
                                            <TableCell className="max-w-[240px] text-[12.5px] break-words">
                                                {f.label}
                                            </TableCell>
                                            {plans.map((p) => (
                                                <TableCell
                                                    key={p.id}
                                                    className={`text-center ${p.is_current ? 'border-x-2 border-primary bg-primary/5' : ''}`}
                                                >
                                                    {p.features.some((x) => x.id === f.id) ? (
                                                        <CheckCircle2 className="mx-auto size-4 text-emerald-500" />
                                                    ) : (
                                                        <Minus className="mx-auto size-4 text-muted-foreground/40" />
                                                    )}
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

            {/*
              The mockup's "Need a custom plan?" strip. Routes to the same
              Contact Sales screen the rest of Billing already uses -- there is
              no separate custom-plan intake anywhere in this system.
            */}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10">
                    <Headphones className="size-[18px] text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Need a custom plan?</p>
                    <p className="text-[12.5px] break-words text-muted-foreground">
                        Have specific requirements? Contact our sales team for a custom solution.
                    </p>
                </div>
                <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/billing/contact-sales">Contact Sales</Link>
                </Button>
            </div>

            {/* Confirm */}
            <Dialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {target?.is_current ? 'Stay on your current plan?' : `Switch to ${target?.name}?`}
                        </DialogTitle>
                        <DialogDescription>
                            {target?.is_current ? (
                                <>This cancels the earlier scheduled switch. You stay on {target?.name}.</>
                            ) : (
                                <>
                                    You move from <span className="font-medium text-foreground">{sub?.plan?.name}</span> to{' '}
                                    <span className="font-medium text-foreground">{target?.name}</span> straight away, at{' '}
                                    {target ? formatMoney(target.amount.subtotal, target.currency_code) : ''}
                                    {target ? CYCLE_SUFFIX[target.billing_cycle] : ''} plus tax.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmId(null)}>Back</Button>
                        <Button
                            disabled={changePlan.isPending}
                            onClick={() =>
                                confirmId !== null
                                && changePlan.mutate(confirmId, {
                                    // Closes only on success: on failure the change did
                                    // not happen, and dismissing would imply it had.
                                    onSuccess: () => setConfirmId(null),
                                })
                            }
                        >
                            {changePlan.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            {target?.is_current ? 'Keep my plan' : 'Confirm switch'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
