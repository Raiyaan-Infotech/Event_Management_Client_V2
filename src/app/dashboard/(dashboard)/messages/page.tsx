'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    MessageCircle, Mail, Smartphone, Search, Plus, X,
    ChevronLeft, ChevronRight, ArrowRight, AlertTriangle,
    Bell,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import {
    useCampaigns, type MessageChannel, type Campaign, type ChannelState,
} from '@/hooks/use-messages';
import { useDateFormatter } from '@/hooks/use-client-settings';
import { htmlToText } from '@/components/common/rich-text-editor';

/**
 * Messages — the record of what was composed and to whom.
 *
 * ── ⚠ THE STATUS COLUMN IS THE HONEST ONE ───────────────────────────────────
 * No provider is connected, so a campaign reads `Recorded` rather than
 * `Delivered`. The design's own table shows "Delivered 98.6%" beside every row;
 * printing that for messages nobody received is the single most misleading
 * thing this screen could do, and the hardest to walk back once somebody has
 * planned around it.
 *
 * A delivery RATE is therefore `null`, not 0% — 0% reads as "it failed", and
 * nothing was attempted.
 *
 * ── THE THREE TILES COUNT THE WHOLE ACCOUNT ─────────────────────────────────
 * Never the filtered page. A "Sent 212" that moved while somebody typed in the
 * search box would be reporting the search.
 */

/**
 * Look and wording per channel.
 *
 * The TILES and the filter render from `data.channels`, which the server
 * serves — this map only says how one looks. `sms` keeps an entry because the
 * table's rows must stay describable even though it can no longer be chosen:
 * a row whose channel had no entry here would render blank.
 */
const CHANNEL_META: Record<MessageChannel, { label: string; icon: React.ElementType; tint: string }> = {
    whatsapp: { label: 'WhatsApp', icon: MessageCircle, tint: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    sms: { label: 'SMS', icon: Smartphone, tint: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
    email: { label: 'Email', icon: Mail, tint: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
    push: { label: 'Push', icon: Bell, tint: 'bg-pink-500/15 text-pink-600 dark:text-pink-400' },
};

/**
 * What a status looks like.
 *
 * `sending` is what a recorded-but-undelivered campaign is, and it is labelled
 * **Recorded** rather than "Sending" — nothing is in flight, and a spinner-ish
 * word would have somebody waiting for it to finish.
 */
const STATUS_STYLE: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
    scheduled: { label: 'Scheduled', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
    sending: { label: 'Recorded', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    sent: { label: 'Sent', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    failed: { label: 'Failed', className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
};

const PER_PAGE = ['10', '25', '50'];

export default function MessagesPage() {
    const [channel, setChannel] = useState('all');
    const [status, setStatus] = useState('all');
    const [search, setSearch] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [limit, setLimit] = useState('10');
    const [page, setPage] = useState(1);
    const fmt = useDateFormatter();

    // Debounced, so typing does not fire a request per keystroke.
    const [debounced, setDebounced] = useState('');
    useEffect(() => {
        const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    const { data, isLoading, isFetching } = useCampaigns({
        channel: channel === 'all' ? undefined : channel,
        status: status === 'all' ? undefined : status,
        search: debounced,
        from: from || undefined,
        to: to || undefined,
        page,
        limit: Number(limit),
    });

    const campaigns = data?.campaigns ?? [];
    const stats = data?.stats;
    const pagination = data?.pagination;
    const filtered = channel !== 'all' || status !== 'all' || !!debounced || !!from || !!to;

    const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
    const clearAll = () => {
        setChannel('all'); setStatus('all'); setSearch(''); setDebounced('');
        setFrom(''); setTo(''); setPage(1);
    };

    const showingFrom = campaigns.length ? ((pagination?.page ?? 1) - 1) * Number(limit) + 1 : 0;
    const showingTo = showingFrom ? showingFrom + campaigns.length - 1 : 0;

    // Any channel undelivered means the note below the table applies.
    const anyDisabled = (data?.channels ?? []).some((c) => !c.enabled);

    if (isLoading && !data) {
        return (
            <div className="flex flex-col gap-5 p-4 md:p-6">
                <Skeleton className="h-9 w-40" />
                <div className="grid gap-4 md:grid-cols-3">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-5 p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
                    <p className="text-sm break-words text-muted-foreground">
                        View, track and manage all messages sent to your guests.
                    </p>
                </div>
                <Button asChild>
                    <Link href="/dashboard/messages/send"><Plus className="size-4" /> Send Message</Link>
                </Button>
            </div>

            {/* ── Channel tiles: whole account, always ──────────────────────── */}
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
                {(data?.channels ?? []).map((state) => (
                    <ChannelCard
                        key={state.channel}
                        state={state}
                        stat={stats?.by_channel?.[state.channel]}
                    />
                ))}
            </div>

            <Card className="py-0">
                <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                    {/* ── Filters ──────────────────────────────────────────── */}
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <div className="relative min-w-[200px] flex-1">
                            <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by subject or content…"
                                className="h-9 ps-8 text-[12.5px]"
                            />
                        </div>

                        <Select value={channel} onValueChange={reset(setChannel)}>
                            <SelectTrigger className="h-9 w-[150px] text-[12.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Channels</SelectItem>
                                {(data?.channels ?? []).map((c) => (
                                    <SelectItem key={c.channel} value={c.channel}>{c.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={status} onValueChange={reset(setStatus)}>
                            <SelectTrigger className="h-9 w-[150px] text-[12.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {Object.entries(STATUS_STYLE).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Native inputs, matching Billing History — a custom range
                            picker is a lot of surface for two dates, and the native
                            control already knows the locale and the keyboard.
                            The range is INCLUSIVE of the `to` day, server-side. */}
                        <Input type="date" value={from} max={to || undefined}
                            onChange={(e) => reset(setFrom)(e.target.value)}
                            className="h-9 w-[145px] text-[12.5px]" aria-label="From date" />
                        <Input type="date" value={to} min={from || undefined}
                            onChange={(e) => reset(setTo)(e.target.value)}
                            className="h-9 w-[145px] text-[12.5px]" aria-label="To date" />

                        {filtered ? (
                            <Button variant="ghost" size="sm" className="h-9" onClick={clearAll}>
                                <X className="size-3.5" /> Clear
                            </Button>
                        ) : null}
                    </div>

                    {/* ── Table ────────────────────────────────────────────── */}
                    {campaigns.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
                            <MessageCircle className="size-5 text-muted-foreground/60" />
                            <p className="text-[13px] font-semibold">No messages yet</p>
                            <p className="max-w-sm text-[12px] break-words text-muted-foreground">
                                {filtered
                                    ? 'Nothing matches these filters.'
                                    : 'Compose one and it will appear here with everyone it reached.'}
                            </p>
                            {!filtered ? (
                                <Button asChild size="sm" className="mt-1">
                                    <Link href="/dashboard/messages/send">Send your first message</Link>
                                </Button>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            {/* Scrolls inside its own box — the page must never
                                scroll sideways. */}
                            <div className="w-full overflow-x-auto">
                                <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="min-w-[180px]">Subject / Content</TableHead>
                                            <TableHead className="min-w-[80px]">Type</TableHead>
                                            <TableHead className="hidden min-w-[120px] xl:table-cell">Event</TableHead>
                                            <TableHead className="min-w-[80px] text-end">Recipients</TableHead>
                                            <TableHead className="min-w-[90px]">Status</TableHead>
                                            <TableHead className="min-w-[110px]">Sent On</TableHead>
                                            <TableHead className="min-w-[44px] text-end">View</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {campaigns.map((c) => <Row key={c.id} campaign={c} fmt={fmt} />)}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* ── Paging ───────────────────────────────────── */}
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                                <p className="text-[11.5px] text-muted-foreground">
                                    Showing {showingFrom} to {showingTo} of {pagination?.totalItems ?? 0} message
                                    {(pagination?.totalItems ?? 0) === 1 ? '' : 's'}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button size="icon" variant="outline" className="size-8"
                                        disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        aria-label="Previous page">
                                        <ChevronLeft className="size-4" />
                                    </Button>
                                    <span className="text-[12px] tabular-nums">
                                        {pagination?.page ?? 1} / {pagination?.totalPages ?? 1}
                                    </span>
                                    <Button size="icon" variant="outline" className="size-8"
                                        disabled={!pagination || page >= pagination.totalPages}
                                        onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                                        <ChevronRight className="size-4" />
                                    </Button>
                                    <Select value={limit} onValueChange={reset(setLimit)}>
                                        <SelectTrigger className="h-8 w-[95px] text-[12px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {PER_PAGE.map((n) => (
                                                <SelectItem key={n} value={n}>{n} / page</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </>
                    )}

                    {/*
                      Said once, plainly, rather than a warning icon on every row.
                      The reasons come from the API, so this unlocks itself.
                    */}
                    {anyDisabled ? (
                        <div className="flex min-w-0 items-start gap-2.5 rounded-lg border bg-muted/40 px-3.5 py-2.5">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 text-[11.5px] break-words text-muted-foreground">
                                <p className="font-medium">Messages are recorded, not yet delivered.</p>
                                <ul className="mt-1 flex flex-col gap-0.5">
                                    {(data?.channels ?? []).filter((c) => !c.enabled).map((c) => (
                                        <li key={c.channel}>· {c.reason}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}

/**
 * One channel's totals.
 *
 * ── THE FIRST ROW IS LABELLED FROM REALITY, NOT FROM THE DESIGN ─────────────
 * The mockup says "Sent". While no provider is connected nothing has been sent,
 * so the row reads **Recorded** and counts `queued`. It flips to "Sent" with
 * the real figure by itself the day a provider is wired — `state.enabled` comes
 * from the API, so there is no sentence here to remember to change.
 *
 * ── AND WHY THE NUMBERS ARE NOT ALL COLOURED ────────────────────────────────
 * Green on a count that has not happened reads as success. Delivered and Failed
 * are coloured only when they are NON-ZERO; a green 0 and a red 0 are two
 * claims about an account where nothing has been attempted.
 */
function ChannelCard({ state, stat }: {
    state: ChannelState;
    stat?: { total: number; sent: number; delivered: number; failed: number; queued: number; share: number };
}) {
    const meta = CHANNEL_META[state.channel] ?? CHANNEL_META.email;
    const total = stat?.total ?? 0;
    const delivered = stat?.delivered ?? 0;
    const failed = stat?.failed ?? 0;
    const firstCount = state.enabled ? (stat?.sent ?? 0) : (stat?.queued ?? 0);

    return (
        <Card className="py-0">
            <CardContent className="flex min-w-0 items-start justify-between gap-4 p-5">
                <div className="flex min-w-0 items-start gap-3">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-full ${meta.tint}`}>
                        <meta.icon className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold break-words">{state.label}</p>
                        <p className="mt-0.5 text-2xl leading-none font-bold tabular-nums">
                            {total.toLocaleString('en-IN')}
                        </p>
                        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                            {stat?.share ?? 0}% of total
                        </p>
                    </div>
                </div>

                <dl className="flex shrink-0 flex-col gap-1.5 text-[12px]">
                    <StatLine
                        label={state.enabled ? 'Sent' : 'Recorded'}
                        value={firstCount}
                        tone={firstCount ? 'emerald' : 'muted'}
                    />
                    <StatLine
                        label="Delivered"
                        value={delivered}
                        tone={delivered ? 'emerald' : 'muted'}
                    />
                    <StatLine
                        label="Failed"
                        value={failed}
                        tone={failed ? 'rose' : 'muted'}
                    />
                </dl>
            </CardContent>
        </Card>
    );
}

const TONE: Record<string, string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    muted: 'text-muted-foreground',
};

function StatLine({ label, value, tone }: { label: string; value: number; tone: string }) {
    return (
        <div className="flex items-baseline justify-between gap-5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={`font-semibold tabular-nums ${TONE[tone]}`}>
                {value.toLocaleString('en-IN')}
            </dd>
        </div>
    );
}

function Row({ campaign: c, fmt }: {
    campaign: Campaign;
    fmt: (v: string | null | undefined, withTime?: boolean) => string;
}) {
    const meta = CHANNEL_META[c.channel] ?? CHANNEL_META.email;
    const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.draft;
    const snippet = htmlToText(c.body);

    return (
        <TableRow>
            <TableCell className="max-w-[220px]">
                {/* break-all + line-clamp, never truncate: the table is
                    auto-layout, so truncate has nothing to truncate against. */}
                <p className="text-[12.5px] font-medium break-all">{c.subject}</p>
                {/*
                  An email body is HTML. Printed raw it shows the client
                  "<p>Hi…</p>"; injected, a table cell would start rendering
                  lists and links. Stripped to text is the only thing a one-line
                  snippet can honestly be.
                */}
                {snippet ? (
                    <p className="mt-0.5 line-clamp-1 text-[11px] break-all text-muted-foreground"
                        title={snippet}>
                        {snippet}
                    </p>
                ) : null}
                {/* Fit view: under xl the event shows here (its column hides). */}
                {c.event?.name && <p className="mt-0.5 text-[11px] text-primary xl:hidden">{c.event.name}</p>}
            </TableCell>
            <TableCell>
                <Badge variant="ghost" className={`${meta.tint} gap-1`}>
                    <meta.icon className="size-3" /> {meta.label}
                </Badge>
            </TableCell>
            <TableCell className="hidden max-w-[150px] text-[12px] break-words xl:table-cell">
                {c.event?.name ?? '—'}
            </TableCell>
            <TableCell className="text-end text-[12.5px] tabular-nums">
                {c.recipients_count.toLocaleString('en-IN')}
            </TableCell>
            <TableCell>
                <Badge variant="ghost" className={st.className}>{st.label}</Badge>
                {/* Null, never 0% — 0% reads as "it failed", and nothing was
                    attempted. */}
                {c.delivery?.delivered_rate !== null && c.delivery?.delivered_rate !== undefined ? (
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                        {c.delivery.delivered_rate}% delivered
                    </p>
                ) : null}
            </TableCell>
            <TableCell className="min-w-[96px] text-[12px]">
                {c.scheduled_at && !c.sent_at
                    ? `Scheduled ${fmt(c.scheduled_at, true)}`
                    : fmt(c.sent_at ?? c.created_at, true)}
            </TableCell>
            <TableCell className="text-end">
                <Button asChild size="icon" variant="ghost" className="size-8">
                    <Link href={`/dashboard/messages/${c.id}`} title="Open this message">
                        <ArrowRight className="size-3.5" />
                    </Link>
                </Button>
            </TableCell>
        </TableRow>
    );
}
