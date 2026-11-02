'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, MessageCircle, Mail, Smartphone, Users, Calendar, Clock,
    AlertTriangle, Search, CheckCircle2, XCircle, Send, Copy, Check,
    Bell,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { useCampaign, type MessageChannel } from '@/hooks/use-messages';
import { useDateFormatter } from '@/hooks/use-client-settings';

/**
 * One message campaign, and everyone it reached.
 *
 * ── ⚠ THIS SCREEN SHOWS TWO VERSIONS OF THE MESSAGE, DELIBERATELY ───────────
 * The TEMPLATE, with `{first_name}` intact, is what was stored — and what makes
 * the campaign re-sendable to a different audience. The RENDERED copy is what a
 * real recipient would have received. Showing only the template makes people
 * think the braces went out; showing only the rendered copy hides that it is
 * personalised at all.
 *
 * ── AN EMAIL BODY IS HTML, A WHATSAPP ONE IS NOT ────────────────────────────
 * Email is composed in the rich editor and stored as markup, so it is injected
 * here — printing it would show the client `<p>Hi…</p>`. WhatsApp is a
 * plain-text protocol and its body is printed with the line breaks intact.
 *
 * Getting this backwards is visible immediately, which is the good case; the
 * bad case is the SEND doing it, which is why the composer picks its editor by
 * channel rather than leaving it to whoever renders the result later.
 *
 * ── THE RECIPIENT TABLE IS THE HONEST PART ──────────────────────────────────
 * Every row reads `Queued`, because nothing has left this system. The design's
 * own detail view shows per-recipient Delivered / Opened ticks; printing those
 * against messages nobody received is the one claim this screen must not make,
 * and the reason for it comes from the API rather than a sentence typed here.
 */

const CHANNEL_META: Record<MessageChannel, { icon: React.ElementType; tint: string }> = {
    whatsapp: { icon: MessageCircle, tint: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    sms: { icon: Smartphone, tint: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
    email: { icon: Mail, tint: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
    push: { icon: Bell, tint: 'bg-pink-500/15 text-pink-600 dark:text-pink-400' },
};

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
    scheduled: { label: 'Scheduled', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
    // Not "Sending": nothing is in flight, and a spinner-ish word would have
    // somebody waiting for it to finish.
    sending: { label: 'Recorded', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    sent: { label: 'Sent', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    failed: { label: 'Failed', className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
};

const DELIVERY_STYLE: Record<string, { label: string; className: string; icon: React.ElementType }> = {
    queued: { label: 'Queued', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', icon: Clock },
    sent: { label: 'Sent', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', icon: Send },
    delivered: { label: 'Delivered', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
    failed: { label: 'Failed', className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400', icon: XCircle },
};

const AUDIENCE_LABEL: Record<string, string> = {
    all: 'All guests',
    groups: 'Selected groups',
    guests: 'Selected guests',
};

export default function MessageDetail({ campaignId }: { campaignId: number }) {
    const { data, isLoading, isError } = useCampaign(campaignId);
    const fmt = useDateFormatter();

    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 300);
        return () => clearTimeout(t);
    }, [search]);

    if (isLoading) {
        return (
            <div className="flex flex-col gap-5 p-4 md:p-6">
                <Skeleton className="h-8 w-52" />
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <Skeleton className="h-96 rounded-xl" />
                    <Skeleton className="h-96 rounded-xl" />
                </div>
            </div>
        );
    }

    // Owner-scoped on the server, so "not found" and "not yours" are the same
    // screen on purpose — distinguishing them would confirm that a campaign
    // exists on somebody else's account.
    if (isError || !data?.campaign) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
                <p className="text-sm font-medium">Message not found</p>
                <p className="text-[12.5px] text-muted-foreground">
                    This message does not exist, or it is not on your account.
                </p>
                <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/messages">Back to Messages</Link>
                </Button>
            </div>
        );
    }

    const c = data.campaign;
    const meta = CHANNEL_META[c.channel] ?? CHANNEL_META.email;
    const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.draft;
    const state = data.channel_state;
    const d = c.delivery;

    const recipients = data.recipients.filter((r) =>
        !debounced
        || (r.guest?.name ?? '').toLowerCase().includes(debounced)
        || (r.guest?.email ?? '').toLowerCase().includes(debounced));

    // Only email is composed as markup. See the header.
    const isHtml = c.channel === 'email';

    async function copyBody() {
        try {
            // The TEMPLATE, markup and merge fields intact — that is the thing
            // worth having on a clipboard, not the rendered copy.
            await navigator.clipboard.writeText(c.body ?? '');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard refused — the text is on screen either way */ }
    }

    return (
        <div className="flex min-w-0 flex-col gap-5 p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-3">
                <Button asChild variant="ghost" size="sm" className="-ms-2 text-muted-foreground">
                    <Link href="/dashboard/messages">
                        <ArrowLeft className="size-3.5" /> Back to Messages
                    </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="ms-auto">
                    <Link href="/dashboard/messages/send">
                        <Send className="size-3.5" /> Send another
                    </Link>
                </Button>
            </div>

            <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold break-words">{c.subject}</h1>
                    <Badge variant="ghost" className={st.className}>{st.label}</Badge>
                    <Badge variant="ghost" className={`${meta.tint} gap-1`}>
                        <meta.icon className="size-3" /> {c.channel_label}
                    </Badge>
                </div>
                <p className="text-[12.5px] break-words text-muted-foreground">
                    {c.scheduled_at && !c.sent_at
                        ? `Scheduled for ${fmt(c.scheduled_at, true)}`
                        : `Recorded ${fmt(c.sent_at ?? c.created_at, true)}`}
                    {c.event ? ` · ${c.event.name}` : ''}
                </p>
            </div>

            {/*
              The reason this campaign delivered nothing, stored ON the row at
              send time — so it still explains itself after a provider is
              connected and the live state has changed.
            */}
            {c.failed_reason || (state && !state.enabled) ? (
                <div className="flex min-w-0 items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-warning">
                            Recorded, not delivered
                        </p>
                        <p className="mt-1 text-[12.5px] break-words text-muted-foreground">
                            {c.failed_reason ?? state?.reason}
                        </p>
                    </div>
                </div>
            ) : null}

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="flex min-w-0 flex-col gap-5">
                    {/* ── The message ──────────────────────────────────────── */}
                    <Card className="py-0">
                        <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                            <span className="text-[13px] font-semibold">Message</span>

                            <div className="min-w-0">
                                <p className="text-[11px] font-medium text-muted-foreground">
                                    As a guest received it
                                </p>
                                <div className={`mt-1.5 min-w-0 rounded-lg border p-3.5 text-[12.5px] ${
                                    c.channel === 'whatsapp' ? 'bg-emerald-500/5' : 'bg-muted/40'
                                }`}>
                                    {isHtml ? (
                                        <div
                                            className="rich-html break-words"
                                            dangerouslySetInnerHTML={{ __html: data.preview || c.body || '' }}
                                        />
                                    ) : (
                                        <p className="break-words whitespace-pre-wrap">
                                            {data.preview || c.body}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-[11px] font-medium text-muted-foreground">
                                        The template that was saved
                                    </p>
                                    <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={copyBody}>
                                        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                                        {copied ? 'Copied' : 'Copy'}
                                    </Button>
                                </div>
                                {/*
                                  Kept with its merge fields intact. That is what
                                  makes the campaign re-sendable to a different
                                  audience, and it is why the two blocks differ.
                                */}
                                <pre className="mt-1.5 min-w-0 overflow-x-auto rounded-lg border bg-muted/30 p-3.5 text-[11.5px] break-words whitespace-pre-wrap">
                                    {c.body}
                                </pre>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── Recipients ───────────────────────────────────────── */}
                    <Card className="py-0">
                        <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[13px] font-semibold">
                                    Recipients ({data.recipients.length})
                                </span>
                                <div className="relative min-w-[180px]">
                                    <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search recipients…"
                                        className="h-8 ps-8 text-[12px]"
                                    />
                                </div>
                            </div>

                            {recipients.length === 0 ? (
                                <p className="rounded-lg border border-dashed px-3 py-8 text-center text-[12px] text-muted-foreground">
                                    {debounced ? 'Nobody matches that search.' : 'This message reached nobody.'}
                                </p>
                            ) : (
                                /* Scrolls inside its own box — the page must never
                                   scroll sideways. */
                                <div className="w-full overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="min-w-[180px]">Guest</TableHead>
                                                <TableHead className="min-w-[200px]">
                                                    {c.channel === 'email' ? 'Email' : 'Phone'}
                                                </TableHead>
                                                <TableHead className="min-w-[110px]">Status</TableHead>
                                                <TableHead className="min-w-[150px]">Recorded</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {recipients.map((r) => {
                                                const ds = DELIVERY_STYLE[r.status] ?? DELIVERY_STYLE.queued;
                                                return (
                                                    <TableRow key={r.id}>
                                                        <TableCell className="max-w-[220px] text-[12.5px] font-medium break-words">
                                                            {r.guest?.name ?? 'Removed guest'}
                                                        </TableCell>
                                                        <TableCell className="max-w-[240px] text-[12px] break-all text-muted-foreground">
                                                            {(c.channel === 'email' ? r.guest?.email : r.guest?.mobile) ?? '—'}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="ghost" className={`${ds.className} gap-1`}>
                                                                <ds.icon className="size-3" /> {ds.label}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-[12px] whitespace-nowrap">
                                                            {r.sent_at ? fmt(r.sent_at, true) : '—'}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {/*
                              The API returns at most 500 recipients. Said out loud
                              rather than silently truncating — a count that does
                              not match the table is the kind of thing somebody
                              spends an afternoon on.
                            */}
                            {data.recipients.length >= 500 ? (
                                <p className="text-[11px] text-muted-foreground">
                                    Showing the first 500 recipients of {c.recipients_count}.
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>

                {/* ── Rail ─────────────────────────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-5">
                    <Card className="py-0">
                        <CardContent className="flex min-w-0 flex-col gap-3 p-5">
                            <span className="text-[13px] font-semibold">Summary</span>
                            <dl className="flex flex-col gap-2.5 text-[12.5px]">
                                <Row label="Channel" value={c.channel_label} />
                                <Row label="Type" value={c.kind.replace(/_/g, ' ')} capitalize />
                                <Row label="Audience" value={AUDIENCE_LABEL[c.audience] ?? c.audience} />
                                <Row label="Recipients" value={c.recipients_count.toLocaleString('en-IN')} />
                                <Row label="Status" value={st.label} />
                                {c.scheduled_at ? (
                                    <Row label="Scheduled" value={fmt(c.scheduled_at, true)} />
                                ) : null}
                                <Row label="Created" value={fmt(c.created_at, true)} />
                            </dl>
                        </CardContent>
                    </Card>

                    <Card className="py-0">
                        <CardContent className="flex min-w-0 flex-col gap-3 p-5">
                            <span className="text-[13px] font-semibold">Delivery</span>
                            <dl className="flex flex-col gap-2.5 text-[12.5px]">
                                <Row label="Queued" value={String(d?.queued ?? 0)} />
                                <Row label="Delivered" value={String(d?.delivered ?? 0)} />
                                <Row label="Opened" value={String(d?.opened ?? 0)} />
                                <Row label="Failed" value={String(d?.failed ?? 0)} />
                            </dl>
                            <Separator />
                            {/*
                              An em dash, never 0%. Nothing was attempted, and 0%
                              reads as "everything failed".
                            */}
                            <div className="flex items-start justify-between gap-3 text-[12.5px]">
                                <span className="text-muted-foreground">Delivery rate</span>
                                <span className="font-medium tabular-nums">
                                    {d?.delivered ? `${Math.round((d.delivered / d.total) * 1000) / 10}%` : '—'}
                                </span>
                            </div>
                            {!d?.delivered ? (
                                <p className="text-[11px] break-words text-muted-foreground">
                                    No delivery has been attempted, so there is no rate to report.
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>

                    {c.event ? (
                        <Card className="py-0">
                            <CardContent className="flex min-w-0 flex-col gap-3 p-5">
                                <span className="text-[13px] font-semibold">Event</span>
                                <div className="flex min-w-0 items-start gap-2.5">
                                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10">
                                        <Calendar className="size-4 text-primary" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[12.5px] font-medium break-words">{c.event.name}</p>
                                        {c.event.start_date ? (
                                            <p className="text-[11px] text-muted-foreground">
                                                {fmt(c.event.start_date)}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                                <Button asChild size="sm" variant="outline" className="w-full">
                                    <Link href={`/dashboard/events/${c.event.id}/guests`}>
                                        <Users className="size-3.5" /> View guest list
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function Row({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className={`min-w-0 text-end font-medium break-words ${capitalize ? 'capitalize' : ''}`}>
                {value}
            </dd>
        </div>
    );
}
