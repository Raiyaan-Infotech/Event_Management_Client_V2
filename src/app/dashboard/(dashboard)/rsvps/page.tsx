'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    Users, CircleCheck, CircleHelp, CircleX, Mail, Search, X, Download,
    ChevronLeft, ChevronRight, Eye, MoreVertical, Pencil, Send, Trash2,
    Loader2, AlertTriangle,
    UserRound,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import {
    useRsvps, useResetResponse, fetchExportRows, useRsvpRelationOptions,
    BUCKET_LABEL, BUCKET_STYLE, formatDate, formatTime,
    type Rsvp, type RsvpBucket, type RsvpParams,
} from '@/hooks/use-rsvps';
import { useComposer } from '@/hooks/use-messages';
import { useDateFormatter } from '@/hooks/use-client-settings';

/**
 * RSVPs.
 *
 * ── ⚠ AN RSVP IS NOT A ROW ──────────────────────────────────────────────────
 * It is the response columns on a guest. So the row menu offers **Clear
 * response**, not Delete — the guest stays on the list and can answer again.
 * Deleting the PERSON lives on the Guests screen, which says so.
 *
 * The supplied design's "Delete RSVP · This action cannot be undone" describes
 * the destructive version; the dialog here describes what actually happens.
 *
 * ── THE TILES DO NOT FOLLOW THE STATUS FILTER ───────────────────────────────
 * They count everything the OTHER filters select. Clicking "Accepted" would
 * otherwise make every other tile read zero, and the summary would stop being a
 * summary and become a restatement of the tab.
 *
 * ── EXPORT IS CSV ONLY ──────────────────────────────────────────────────────
 * The design offers CSV, XLSX and PDF "generated in the background, we will
 * email you a link". There is no spreadsheet library, no PDF renderer and no
 * job queue. The CSV is real and built in the browser, exactly as the invoice
 * export is; the other two are absent rather than buttons that produce nothing.
 */

const TILES: { key: RsvpBucket | 'total'; label: string; icon: React.ElementType; tint: string }[] = [
    { key: 'total', label: 'Total Invitations', icon: Users, tint: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
    { key: 'accepted', label: 'Accepted', icon: CircleCheck, tint: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    { key: 'maybe', label: 'Maybe', icon: CircleHelp, tint: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    { key: 'declined', label: 'Declined', icon: CircleX, tint: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
    { key: 'no_response', label: 'No Response', icon: Mail, tint: 'bg-muted text-muted-foreground' },
];

/** The columns the export offers. `key` reads straight off a shaped RSVP. */
const EXPORT_COLUMNS = [
    { key: 'name', label: 'Guest Name', always: true },
    { key: 'email', label: 'Email' },
    { key: 'mobile', label: 'Phone' },
    { key: 'event', label: 'Event' },
    { key: 'side', label: 'Side' },
    { key: 'relationship', label: 'Relationship' },
    { key: 'status', label: 'RSVP Status', always: true },
    { key: 'party_size', label: 'Number of Guests' },
    { key: 'responded_at', label: 'Response Date' },
    { key: 'dietary', label: 'Dietary Preference' },
    { key: 'requirements', label: 'Special Requirements' },
    { key: 'notes', label: 'Notes' },
    { key: 'table_number', label: 'Table Number' },
];

export default function RsvpsPage() {
    const [eventId, setEventId] = useState<string>('all');
    const [side, setSide] = useState<'all' | 'groom' | 'bride'>('all');
    const [relation, setRelation] = useState<string>('all');
    const [status, setStatus] = useState<RsvpBucket | 'all'>('all');
    const [search, setSearch] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [limit, setLimit] = useState('10');
    const [page, setPage] = useState(1);

    const [confirmReset, setConfirmReset] = useState<Rsvp | null>(null);
    const [reason, setReason] = useState('');
    const [acknowledged, setAcknowledged] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);

    const fmt = useDateFormatter();

    // `?event=` from the event page's "View all participants" link. Read once on
    // mount from the URL rather than useSearchParams, which would need a
    // Suspense boundary around the whole page.

    const [debounced, setDebounced] = useState('');
    useEffect(() => {
        const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    // Reuses the composer payload — it already serves the client's events with
    // a guest count on each, which is exactly what this filter needs.
    const { data: composer } = useComposer();

    // V2: RSVPs are per event, as in the app — always one event selected:
    // `?event=` (the event page's "View all participants" link) or the first.
    useEffect(() => {
        if (eventId !== 'all') return;
        const list = composer?.events ?? [];
        if (!list.length) return;
        const fromUrl = new URLSearchParams(window.location.search).get('event');
        const found = list.find((e) => String(e.id) === fromUrl);
        setEventId(String((found ?? list[0]).id));
    }, [composer, eventId]);
    const { data: relations } = useRsvpRelationOptions(eventId === 'all' ? undefined : eventId);

    const params: RsvpParams = useMemo(() => ({
        event_id: eventId === 'all' ? undefined : eventId,
        side: side === 'all' ? undefined : side,
        relationship: relation === 'all' ? undefined : relation,
        status,
        search: debounced,
        from: from || undefined,
        to: to || undefined,
    }), [eventId, side, relation, status, debounced, from, to]);

    const { data, isLoading, isFetching } = useRsvps({ ...params, page, limit: Number(limit) });
    const reset = useResetResponse(() => { setConfirmReset(null); setReason(''); setAcknowledged(false); });

    const rsvps = data?.rsvps ?? [];
    const stats = data?.stats;
    const pagination = data?.pagination;
    const filtered = side !== 'all' || relation !== 'all' || status !== 'all'
        || !!debounced || !!from || !!to;

    const onFilter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
    const clearAll = () => {
        setSide('all'); setRelation('all'); setStatus('all');
        setSearch(''); setDebounced(''); setFrom(''); setTo(''); setPage(1);
    };

    const showingFrom = rsvps.length ? ((pagination?.page ?? 1) - 1) * Number(limit) + 1 : 0;
    const showingTo = showingFrom ? showingFrom + rsvps.length - 1 : 0;

    if (isLoading && !data) {
        return (
            <div className="flex flex-col gap-5 p-4 md:p-6">
                <Skeleton className="h-9 w-40" />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-5 p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight">RSVPs</h1>
                    <p className="text-sm break-words text-muted-foreground">
                        View and manage RSVP responses for your events.
                    </p>
                </div>
                <Button variant="outline" onClick={() => setExportOpen(true)}>
                    <Download className="size-4" /> Export
                </Button>
            </div>

            {/* ── Tiles ─────────────────────────────────────────────────────── */}
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {TILES.map((t) => {
                    /*
                      Total is the "all" tab, not a fifth bucket. Every tile maps
                      to a value of the SAME filter, so exactly one is ever lit
                      and there is no state a tile shows that the table does not.

                      Everything below reads `tileStatus`, not `t.key` — that is
                      what lets TypeScript narrow it to a real bucket in the else
                      branch, and it keeps the "which filter is this" question
                      answered in exactly one place.
                    */
                    const tileStatus: RsvpBucket | 'all' = t.key === 'total' ? 'all' : t.key;
                    const isTotal = tileStatus === 'all';
                    const value = isTotal
                        ? stats?.total_invitations ?? 0
                        : stats?.[tileStatus] ?? 0;
                    const pct = isTotal
                        ? null
                        : stats?.[`${tileStatus}_pct` as keyof typeof stats];
                    const active = status === tileStatus;
                    return (
                        <Card
                            key={t.key}
                            className={`py-0 cursor-pointer transition-colors hover:bg-muted/40 ${
                                active ? 'border-primary/50 bg-primary/5' : ''
                            }`}
                            role="button"
                            tabIndex={0}
                            aria-pressed={active}
                            /*
                              One rule for all five: press a tile to apply it,
                              press the lit one to clear back to "all". Total IS
                              "all", so both halves of that give 'all' and the
                              lit Total tile is a harmless no-op — no special
                              case needed, and none can drift out of step.
                            */
                            onClick={() => onFilter(setStatus)(active ? 'all' : tileStatus)}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter' && e.key !== ' ') return;
                                e.preventDefault();
                                onFilter(setStatus)(active ? 'all' : tileStatus);
                            }}
                        >
                            <CardContent className="flex min-w-0 items-center gap-3 p-4">
                                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${t.tint}`}>
                                    <t.icon className="size-5" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-[11.5px] break-words text-muted-foreground">{t.label}</p>
                                    <p className="text-xl leading-tight font-bold tabular-nums">
                                        {value.toLocaleString('en-IN')}
                                    </p>
                                    <p className="text-[10.5px] text-muted-foreground">
                                        {isTotal
                                            /* Rows vs heads, said on the tile —
                                               the Guests screen shows the other
                                               number and they are never equal. */
                                            ? `${(stats?.heads ?? 0).toLocaleString('en-IN')} people expected`
                                            : `${pct ?? 0}%`}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
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
                                placeholder="Search guests by name, email or phone…"
                                className="h-9 ps-8 text-[12.5px]"
                            />
                        </div>

                        <Select value={eventId} onValueChange={onFilter(setEventId)}>
                            <SelectTrigger className="h-9 w-[170px] text-[12.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {(composer?.events ?? []).map((e) => (
                                    <SelectItem key={e.id} value={String(e.id)}>
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span className="min-w-0 truncate">{e.name}</span>
                                            <span className="shrink-0 text-[10.5px] text-muted-foreground">
                                                {e.guest_count ?? 0}
                                            </span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={status}
                            onValueChange={(v) => onFilter(setStatus)(v as RsvpBucket | 'all')}
                        >
                            <SelectTrigger className="h-9 w-[160px] text-[12.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All RSVP Status</SelectItem>
                                {(Object.keys(BUCKET_LABEL) as RsvpBucket[]).map((b) => (
                                    <SelectItem key={b} value={b}>{BUCKET_LABEL[b]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={side}
                            onValueChange={(v) => {
                                onFilter(setSide)(v as 'all' | 'groom' | 'bride');
                                // A relation of the other side does not carry over.
                                setRelation('all');
                            }}
                        >
                            <SelectTrigger className="h-9 w-[140px] text-[12.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Groom &amp; Bride</SelectItem>
                                <SelectItem value="groom">Groom&apos;s Side</SelectItem>
                                <SelectItem value="bride">Bride&apos;s Side</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={relation} onValueChange={onFilter(setRelation)}>
                            <SelectTrigger className="h-9 w-[160px] text-[12.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Relations</SelectItem>
                                {(relations ?? [])
                                    // That side's relations only, like the app's form.
                                    .filter((r) => side === 'all'
                                        || !(side === 'groom' ? r.name.toLowerCase().startsWith('bride') : r.name.toLowerCase().startsWith('groom')))
                                    .map((r) => (
                                        <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>

                        {/* On RESPONDED_AT, which is the column the table shows.
                            Inclusive of the `to` day, server-side. */}
                        <Input type="date" value={from} max={to || undefined}
                            onChange={(e) => onFilter(setFrom)(e.target.value)}
                            className="h-9 w-[145px] text-[12.5px]" aria-label="Responded from" />
                        <Input type="date" value={to} min={from || undefined}
                            onChange={(e) => onFilter(setTo)(e.target.value)}
                            className="h-9 w-[145px] text-[12.5px]" aria-label="Responded to" />

                        {filtered ? (
                            <Button variant="ghost" size="sm" className="h-9" onClick={clearAll}>
                                <X className="size-3.5" /> Clear Filters
                            </Button>
                        ) : null}
                    </div>

                    {/* ── Table ────────────────────────────────────────────── */}
                    {rsvps.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
                            <Mail className="size-5 text-muted-foreground/60" />
                            <p className="text-[13px] font-semibold">No RSVPs here</p>
                            <p className="max-w-sm text-[12px] break-words text-muted-foreground">
                                {filtered
                                    ? 'Nothing matches these filters.'
                                    : 'Responses appear here once your guests reply to an invitation.'}
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Scrolls inside its own box — the page must never
                                scroll sideways. */}
                            <div className="w-full overflow-x-auto">
                                <Table className={isFetching ? 'opacity-60 transition-opacity' : undefined}>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="min-w-[220px]">Guest</TableHead>
                                            <TableHead className="min-w-[170px]">Event</TableHead>
                                            <TableHead className="min-w-[140px]">Side &amp; Relationship</TableHead>
                                            <TableHead className="min-w-[120px]">Status</TableHead>
                                            <TableHead className="min-w-[110px] text-end">No. of Guests</TableHead>
                                            <TableHead className="min-w-[150px]">Response Date</TableHead>
                                            <TableHead className="min-w-[90px] text-end">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rsvps.map((r) => (
                                            <Row
                                                key={r.id}
                                                rsvp={r}
                                                fmt={fmt}
                                                onReset={() => { setConfirmReset(r); setReason(''); setAcknowledged(false); }}
                                            />
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                                <p className="text-[11.5px] text-muted-foreground">
                                    Showing {showingFrom} to {showingTo} of {pagination?.totalItems ?? 0} RSVP
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
                                    <Select value={limit} onValueChange={onFilter(setLimit)}>
                                        <SelectTrigger className="h-8 w-[95px] text-[12px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {['10', '25', '50'].map((n) => (
                                                <SelectItem key={n} value={n}>{n} per page</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* ── Clear response ───────────────────────────────────────────── */}
            <Dialog
                open={!!confirmReset}
                onOpenChange={(open) => { if (!open) { setConfirmReset(null); setAcknowledged(false); } }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-500/15">
                                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                            </span>
                            Clear this response?
                        </DialogTitle>
                        {/*
                          What actually happens. The design's dialog says "delete
                          the RSVP · cannot be undone", which describes removing
                          the guest — a different act, on a different screen.
                        */}
                        <DialogDescription>
                            <span className="font-medium text-foreground">
                                {confirmReset?.guest.name}
                            </span>{' '}
                            stays on your guest list, keeps their group, and can respond again.
                            Only their answer is cleared.
                        </DialogDescription>
                    </DialogHeader>

                    {confirmReset ? (
                        <div className="flex min-w-0 flex-col gap-3">
                            <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3">
                                <div className="min-w-0">
                                    <p className="text-[12.5px] font-medium break-words">
                                        {confirmReset.guest.name}
                                    </p>
                                    <p className="text-[11px] break-all text-muted-foreground">
                                        {confirmReset.guest.email || confirmReset.guest.mobile || '—'}
                                    </p>
                                </div>
                                <Badge variant="ghost" className={BUCKET_STYLE[confirmReset.bucket]}>
                                    {BUCKET_LABEL[confirmReset.bucket]}
                                </Badge>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="reset-reason" className="text-[12px]">
                                    Why are you clearing it? (optional)
                                </Label>
                                <Input
                                    id="reset-reason"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Responded by mistake, asked to re-confirm…"
                                />
                            </div>

                            <label className="flex min-w-0 items-start gap-2.5 text-[12px]">
                                <Checkbox
                                    checked={acknowledged}
                                    onCheckedChange={(v) => setAcknowledged(v === true)}
                                    className="mt-0.5"
                                />
                                <span className="min-w-0 break-words text-muted-foreground">
                                    I understand this clears their answer and the date they replied.
                                    It does not remove the guest.
                                </span>
                            </label>
                        </div>
                    ) : null}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmReset(null)}>Cancel</Button>
                        <Button
                            disabled={!acknowledged || reset.isPending}
                            onClick={() => confirmReset && reset.mutate({
                                id: confirmReset.id, reason: reason.trim() || undefined,
                            })}
                        >
                            {reset.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Clear response
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ExportDialog open={exportOpen} onOpenChange={setExportOpen} params={params} fmt={fmt} />
        </div>
    );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function Row({ rsvp: r, fmt, onReset }: {
    rsvp: Rsvp;
    fmt: (v: string | null | undefined, withTime?: boolean) => string;
    onReset: () => void;
}) {
    return (
        <TableRow>
            <TableCell className="max-w-[280px]">
                {/*
                  The NAME goes to the PERSON, the eye icon to this invitation.
                  A person's name leading anywhere else reads wrong, and the two
                  destinations are genuinely different questions — see the guest
                  profile's own header.

                  break-all + line-clamp, never truncate: the table is
                  auto-layout, so truncate has nothing to truncate against.
                */}
                {r.phone_book_guest_id ? (
                    <Link
                        href={`/dashboard/guests/${r.phone_book_guest_id}/profile`}
                        title={`View ${r.guest.name}'s profile`}
                        className="inline-block py-1.5 text-[12.5px] font-medium break-words hover:text-primary hover:underline"
                    >
                        {r.guest.name}
                    </Link>
                ) : (
                    /* Scanned the QR without being in the phone book — no guest profile to open. */
                    <p className="py-1.5 text-[12.5px] font-medium break-words">{r.guest.name}</p>
                )}
                <p className="text-[11px] break-all text-muted-foreground">{r.guest.email || '—'}</p>
                {r.guest.mobile ? (
                    <p className="text-[11px] text-muted-foreground">
                        {r.guest.dial_code} {r.guest.mobile}
                    </p>
                ) : null}
            </TableCell>
            <TableCell className="max-w-[200px]">
                <p className="text-[12px] font-medium break-words">{r.event?.name ?? '—'}</p>
                {r.event?.start_date ? (
                    <p className="text-[11px] text-muted-foreground">
                        {formatDate(r.event.start_date)}
                        {r.event.start_time ? `, ${formatTime(r.event.start_time)}` : ''}
                    </p>
                ) : null}
            </TableCell>
            <TableCell className="max-w-[160px] text-[12px] break-words">
                {r.rsvp_side || r.guest.relationship ? (
                    <>
                        {r.rsvp_side ? <p className="font-medium">{r.rsvp_side === 'bride' ? "Bride's side" : "Groom's side"}</p> : null}
                        {r.guest.relationship ? <p className="text-[11px] text-muted-foreground">{r.guest.relationship}</p> : null}
                    </>
                ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>
                <Badge variant="ghost" className={BUCKET_STYLE[r.bucket]}>
                    {BUCKET_LABEL[r.bucket]}
                </Badge>
            </TableCell>
            <TableCell className="text-end text-[12.5px] tabular-nums">{r.party_size}</TableCell>
            <TableCell className="text-[12px] whitespace-nowrap">
                {/* An em dash, not a blank — "has not replied" is a fact, and an
                    empty cell reads as missing data. */}
                {r.responded_at ? fmt(r.responded_at, true) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className="text-end">
                <div className="flex items-center justify-end gap-1">
                    <Button asChild size="icon" variant="ghost" className="size-8">
                        <Link href={`/dashboard/rsvps/${r.id}`} title="View this RSVP">
                            <Eye className="size-3.5" />
                        </Link>
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-8" aria-label="More actions">
                                <MoreVertical className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                                <Link href={`/dashboard/rsvps/${r.id}`}>
                                    <Eye className="size-3.5" /> View RSVP
                                </Link>
                            </DropdownMenuItem>
                            {/* The PERSON in the phone book, as opposed to this
                                one invitation — a different id (§581). Absent
                                for a stranger who has no phone-book entry. */}
                            {r.phone_book_guest_id ? (
                                <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/guests/${r.phone_book_guest_id}/profile`}>
                                        <UserRound className="size-3.5" /> View guest profile
                                    </Link>
                                </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem asChild>
                                <Link href={`/dashboard/rsvps/${r.id}/edit`}>
                                    <Pencil className="size-3.5" /> Edit response
                                </Link>
                            </DropdownMenuItem>
                            {/*
                              Goes to the composer with this guest preselected —
                              the reminder IS a message, and a second sending path
                              would be a second set of rules about who is reachable.
                            */}
                            <DropdownMenuItem asChild>
                                <Link href={`/dashboard/messages/send?event_id=${r.event?.id ?? ''}&guest_id=${r.id}&kind=reminder&from=rsvps`}>
                                    <Send className="size-3.5" /> Send reminder
                                </Link>
                            </DropdownMenuItem>
                            {/* Clear, never Delete. The guest is not going anywhere. */}
                            <DropdownMenuItem variant="destructive" onClick={onReset}>
                                <Trash2 className="size-3.5" /> Clear response
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </TableCell>
        </TableRow>
    );
}

/**
 * Export.
 *
 * ⚠ CSV only, and it says so. The design's XLSX and PDF need a spreadsheet
 * library and a PDF renderer, and "generated in the background, we will email
 * you a link" needs a job queue and SMTP. None of the four exist. A format
 * button that produces nothing is worse than a format that is not offered.
 */
function ExportDialog({ open, onOpenChange, params, fmt }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    params: RsvpParams;
    fmt: (v: string | null | undefined, withTime?: boolean) => string;
}) {
    const [columns, setColumns] = useState<string[]>(
        EXPORT_COLUMNS.filter((c) => c.always || ['email', 'mobile', 'event', 'side', 'relationship', 'party_size', 'responded_at'].includes(c.key))
            .map((c) => c.key),
    );
    const [busy, setBusy] = useState(false);

    const toggle = (key: string) =>
        setColumns((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

    async function run() {
        setBusy(true);
        try {
            const result = await fetchExportRows(params);
            if (!result.rows.length) {
                toast.error('There is nothing to export with these filters.');
                return;
            }

            const chosen = EXPORT_COLUMNS.filter((c) => columns.includes(c.key));
            const value = (r: Rsvp, key: string) => {
                switch (key) {
                    case 'name': return r.guest.name;
                    case 'email': return r.guest.email ?? '';
                    case 'mobile': return r.guest.mobile ? `${r.guest.dial_code ?? ''} ${r.guest.mobile}`.trim() : '';
                    case 'event': return r.event?.name ?? '';
                    case 'side': return r.rsvp_side === 'bride' ? "Bride's side" : r.rsvp_side === 'groom' ? "Groom's side" : '';
                    case 'relationship': return r.guest.relationship ?? '';
                    case 'status': return BUCKET_LABEL[r.bucket];
                    case 'party_size': return r.party_size;
                    case 'responded_at': return r.responded_at ? fmt(r.responded_at, true) : '';
                    case 'dietary': return r.dietary_preference ?? '';
                    case 'requirements': return r.special_requirements ?? '';
                    case 'notes': return r.notes ?? '';
                    case 'table_number': return r.guest.table_number ?? '';
                    default: return '';
                }
            };

            const csv = [
                chosen.map((c) => c.label),
                ...result.rows.map((r) => chosen.map((c) => value(r, c.key))),
            ].map((line) => line.map(csvCell).join(',')).join('\r\n');

            // The BOM is what makes Excel read a non-ASCII name correctly rather
            // than as mojibake.
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rsvps-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);

            if (result.truncated) {
                toast.warning(`Exported the first ${result.count} responses`, {
                    description: 'The export is capped. Narrow the filters to get the rest.',
                });
            } else {
                toast.success(`Exported ${result.count} response${result.count === 1 ? '' : 's'}.`);
            }
            onOpenChange(false);
        } catch {
            toast.error('Could not build that export.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Export RSVP responses</DialogTitle>
                    <DialogDescription>
                        Everything the current filters select, as a CSV.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex min-w-0 flex-col gap-3">
                    <p className="text-[12px] font-medium">Columns</p>
                    <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                        {EXPORT_COLUMNS.map((c) => (
                            <label key={c.key} className="flex min-w-0 items-center gap-2 text-[12px]">
                                <Checkbox
                                    checked={columns.includes(c.key)}
                                    // Guest name and status are what makes a row
                                    // identifiable at all; an export without them
                                    // is a list of numbers.
                                    disabled={c.always}
                                    onCheckedChange={() => toggle(c.key)}
                                />
                                <span className="min-w-0 break-words">{c.label}</span>
                            </label>
                        ))}
                    </div>

                    <p className="flex min-w-0 items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-[11px] break-words text-muted-foreground">
                        <Download className="mt-0.5 size-3 shrink-0" />
                        CSV only. Excel and PDF would need a spreadsheet library and a document
                        renderer, and neither is part of this system — a format that produced
                        nothing would be worse than one that is not offered.
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={busy || columns.length === 0} onClick={run}>
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                        Export CSV
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * One CSV cell.
 *
 * Quoted and quote-doubled, and a leading =, +, - or @ is prefixed with an
 * apostrophe: a spreadsheet treats those as FORMULAS, so a guest's note could
 * otherwise execute when the file is opened.
 */
function csvCell(v: unknown) {
    const raw = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
}
