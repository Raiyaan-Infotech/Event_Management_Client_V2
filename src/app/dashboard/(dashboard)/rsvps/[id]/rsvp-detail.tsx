'use client';

import Link from 'next/link';
import {
    ArrowLeft, Pencil, Send, Mail, MessageCircle, Calendar, MapPin, Users,
    UsersRound, Clock, CircleCheck, Utensils, Info, Link2, History, Phone,
    UserRound,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import {
    useRsvp, BUCKET_LABEL, BUCKET_STYLE, formatDate, formatTime,
    type TimelineEntry,
} from '@/hooks/use-rsvps';
import { useDateFormatter } from '@/hooks/use-client-settings';

/**
 * View RSVP.
 *
 * ── THE TIMELINE IS DERIVED, NEVER STORED ───────────────────────────────────
 * Every entry is an existing timestamp — created, invited, each message,
 * responded, the event date. Only what HAPPENED appears: the mockup draws a
 * greyed-out "awaiting response" step, which reads as stuck rather than as not
 * started.
 *
 * The event date is the one entry that has NOT happened, and it is marked
 * `upcoming` by the API so it can be drawn as ahead rather than behind.
 *
 * ── ⚠ "RSVP HISTORY" IS NOT A HISTORY ───────────────────────────────────────
 * A guest row holds ONE current answer; changing it overwrites. What the design
 * calls RSVP History is the same PERSON at other events, matched on email — so
 * the section is titled Linked Events and the payload's own `unavailable` note
 * explains the difference on screen. Presenting it as a change log would invite
 * somebody to audit a response that was never recorded.
 *
 * ── CUSTOM ANSWERS ARE PRINTED BY KEY ───────────────────────────────────────
 * `custom_answers` is a JSON column and NOTHING defines what the questions are.
 * The keys are shown as given rather than dressed up as questions nobody wrote.
 */
export default function RsvpDetailScreen({ rsvpId }: { rsvpId: number }) {
    const { data, isLoading, isError } = useRsvp(rsvpId);
    const fmt = useDateFormatter();

    if (isLoading) {
        return (
            <div className="flex flex-col gap-5 p-4 md:p-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-28 rounded-xl" />
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <Skeleton className="h-96 rounded-xl" />
                    <Skeleton className="h-96 rounded-xl" />
                </div>
            </div>
        );
    }

    // Owner-scoped on the server, so "not found" and "not yours" are the same
    // screen on purpose.
    if (isError || !data?.rsvp) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
                <p className="text-sm font-medium">RSVP not found</p>
                <p className="text-[12.5px] text-muted-foreground">
                    This RSVP does not exist, or it is not on your account.
                </p>
                <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/rsvps">Back to RSVPs</Link>
                </Button>
            </div>
        );
    }

    const r = data.rsvp;
    const g = r.guest;

    return (
        <div className="flex min-w-0 flex-col gap-5 p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-3">
                <Button asChild variant="ghost" size="sm" className="-ms-2 text-muted-foreground">
                    <Link href="/dashboard/rsvps">
                        <ArrowLeft className="size-3.5" /> Back to RSVPs
                    </Link>
                </Button>
                <div className="ms-auto flex flex-wrap items-center gap-2">
                    {/*
                      A reminder IS a message. It hands the composer this guest
                      rather than becoming a second sending path with its own
                      rules about who is reachable.
                    */}
                    <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/messages/send?event_id=${r.event?.id ?? ''}&guest_id=${r.id}&kind=reminder&from=rsvps`}>
                            <Send className="size-3.5" /> Send reminder
                        </Link>
                    </Button>
                    {/* The PERSON in the phone book, as opposed to this one
                        invitation — a different id (§581). Absent for a
                        stranger who has no phone-book entry. */}
                    {r.phone_book_guest_id ? (
                        <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/guests/${r.phone_book_guest_id}/profile`}>
                                <UserRound className="size-3.5" /> Guest profile
                            </Link>
                        </Button>
                    ) : null}
                    <Button asChild size="sm">
                        <Link href={`/dashboard/rsvps/${r.id}/edit`}>
                            <Pencil className="size-3.5" /> Edit response
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="flex min-w-0 flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">View RSVP</h1>
                <p className="text-sm break-words text-muted-foreground">
                    Detailed RSVP information and guest response history.
                </p>
            </div>

            {/* ── Header card ──────────────────────────────────────────────── */}
            <Card className="py-0">
                <CardContent className="grid min-w-0 gap-5 p-5 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="min-w-0 xl:col-span-1">
                        <p className="text-lg font-semibold break-words">{g.name}</p>
                        {g.email ? (
                            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] break-all text-muted-foreground">
                                <Mail className="size-3 shrink-0" /> {g.email}
                            </p>
                        ) : null}
                        {g.mobile ? (
                            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                                <Phone className="size-3 shrink-0" /> {g.dial_code} {g.mobile}
                            </p>
                        ) : null}
                    </div>

                    <HeaderCell icon={Calendar} label="Event" value={r.event?.name ?? '—'} />
                    <HeaderCell
                        icon={Clock}
                        label="Date & time"
                        value={r.event?.start_date ? formatDate(r.event.start_date) : '—'}
                        sub={r.event?.start_time ? formatTime(r.event.start_time) : undefined}
                    />
                    <HeaderCell
                        icon={MapPin}
                        label="Venue"
                        value={r.event?.venue_name ?? '—'}
                        sub={r.event?.venue_address ?? undefined}
                    />

                    <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">RSVP status</p>
                        <Badge variant="ghost" className={`mt-1 ${BUCKET_STYLE[r.bucket]}`}>
                            {BUCKET_LABEL[r.bucket]}
                        </Badge>
                    </div>
                </CardContent>
            </Card>

            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="flex min-w-0 flex-col gap-5">
                    {/* ── Guest information ────────────────────────────────── */}
                    <Card className="py-0">
                        <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                            <SectionHeading icon={Users} label="Guest Information" tint="bg-violet-500/15 text-violet-600 dark:text-violet-400" />
                            <dl className="grid min-w-0 gap-4 sm:grid-cols-3">
                                <Field label="Full name" value={g.name} />
                                <Field label="Email" value={g.email} breakAll />
                                <Field label="Phone" value={g.mobile ? `${g.dial_code ?? ''} ${g.mobile}`.trim() : null} />
                                <Field label="Side" value={r.rsvp_side === 'bride' ? "Bride's side" : r.rsvp_side === 'groom' ? "Groom's side" : null} />
                                <Field label="Relationship" value={g.relationship ?? null} />
                                <Field label="Table" value={g.table_number} />
                                <Field label="No. of guests" value={String(r.party_size)} />
                                {g.company ? <Field label="Company" value={g.company} /> : null}
                                {g.city || g.state ? (
                                    <Field label="Location" value={[g.city, g.state, g.country].filter(Boolean).join(', ')} />
                                ) : null}
                                <Field
                                    label="Invited via"
                                    value={r.invite_source}
                                    sub={r.invited_at ? fmt(r.invited_at, true) : undefined}
                                />
                            </dl>
                        </CardContent>
                    </Card>

                    {/* ── Response details ─────────────────────────────────── */}
                    <Card className="py-0">
                        <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                            <SectionHeading icon={CircleCheck} label="Response Details" tint="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" />

                            <dl className="grid min-w-0 gap-4 sm:grid-cols-3">
                                <div className="min-w-0">
                                    <dt className="text-[11px] text-muted-foreground">RSVP status</dt>
                                    <dd className="mt-1">
                                        <Badge variant="ghost" className={BUCKET_STYLE[r.bucket]}>
                                            {BUCKET_LABEL[r.bucket]}
                                        </Badge>
                                    </dd>
                                </div>
                                <Field
                                    label="Responded on"
                                    /* An em dash, not a blank — "has not replied"
                                       is a fact; an empty cell reads as missing. */
                                    value={r.responded_at ? fmt(r.responded_at, true) : null}
                                />
                                <Field label="Guests attending" value={`${r.party_size}`} />
                                <Field label="Meal preference" value={r.dietary_preference} />
                                <Field label="Special requirements" value={r.special_requirements} />
                                {r.plus_one ? (
                                    <Field label="Plus one" value={`Yes${r.plus_one_count ? ` (${r.plus_one_count})` : ''}`} />
                                ) : null}
                            </dl>

                            {r.notes ? (
                                <>
                                    <Separator />
                                    <div className="min-w-0">
                                        <p className="text-[11px] text-muted-foreground">Note</p>
                                        <p className="mt-1 text-[12.5px] break-words">{r.notes}</p>
                                    </div>
                                </>
                            ) : null}
                        </CardContent>
                    </Card>

                    {/* ── Custom answers ───────────────────────────────────── */}
                    <Card className="py-0">
                        <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                            <SectionHeading icon={Info} label="Custom Answers" tint="bg-amber-500/15 text-amber-600 dark:text-amber-400" />
                            {r.custom_answers && Object.keys(r.custom_answers).length ? (
                                <dl className="flex min-w-0 flex-col gap-2.5">
                                    {Object.entries(r.custom_answers).map(([k, v]) => (
                                        <div key={k} className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5">
                                            {/*
                                              The KEY, as stored. Nothing defines
                                              what the questions are, so dressing
                                              these up as questions would be
                                              inventing the wording.
                                            */}
                                            <dt className="min-w-0 text-[12px] font-medium break-words">{k}</dt>
                                            <dd className="min-w-0 text-[12px] break-words text-muted-foreground">
                                                {typeof v === 'string' || typeof v === 'number'
                                                    ? String(v)
                                                    : JSON.stringify(v)}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : (
                                <p className="rounded-lg border border-dashed px-3.5 py-5 text-center text-[11.5px] break-words text-muted-foreground">
                                    {data.unavailable?.custom_questions
                                        ?? 'No custom questions are defined for this event.'}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* ── Invitation history ───────────────────────────────── */}
                    <Card className="py-0">
                        <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                            <SectionHeading icon={Mail} label={`Invitation History (${data.messages.length})`} tint="bg-blue-500/15 text-blue-600 dark:text-blue-400" />
                            {data.messages.length === 0 ? (
                                <p className="rounded-lg border border-dashed px-3.5 py-5 text-center text-[11.5px] text-muted-foreground">
                                    Nothing has been sent to this guest yet.
                                </p>
                            ) : (
                                /* Scrolls inside its own box — the page must
                                   never scroll sideways. */
                                <div className="w-full overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="min-w-[110px]">Channel</TableHead>
                                                <TableHead className="min-w-[100px]">Kind</TableHead>
                                                <TableHead className="min-w-[110px]">Status</TableHead>
                                                <TableHead className="min-w-[150px]">Sent</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data.messages.map((m) => (
                                                <TableRow key={m.id}>
                                                    <TableCell>
                                                        <span className="flex items-center gap-1.5 text-[12px]">
                                                            {m.channel === 'email'
                                                                ? <Mail className="size-3.5 text-muted-foreground" />
                                                                : <MessageCircle className="size-3.5 text-muted-foreground" />}
                                                            {m.channel === 'email' ? 'Email' : 'WhatsApp'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-[12px] capitalize">
                                                        {m.kind.replace(/_/g, ' ')}
                                                    </TableCell>
                                                    <TableCell>
                                                        {/* `queued` is the honest state — nothing
                                                            has left this system. */}
                                                        <Badge
                                                            variant="ghost"
                                                            className={m.status === 'queued'
                                                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                                                : m.status === 'failed'
                                                                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                                                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'}
                                                        >
                                                            {m.status === 'queued' ? 'Recorded' : m.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-[12px] whitespace-nowrap">
                                                        {m.sent_at ? fmt(m.sent_at, true) : '—'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* ── Linked events ────────────────────────────────────── */}
                    <Card className="py-0">
                        <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                            <SectionHeading icon={Link2} label={`Linked Events (${data.linked_events.length})`} tint="bg-pink-500/15 text-pink-600 dark:text-pink-400" />
                            {/*
                              ⚠ NOT an RSVP history. This is the same PERSON at
                              other events, matched on email — the only link this
                              schema has. Said in the server's own words so nobody
                              audits a change log that was never recorded.
                            */}
                            <p className="flex min-w-0 items-start gap-2 rounded-lg border border-dashed px-3.5 py-2.5 text-[11px] break-words text-muted-foreground">
                                <History className="mt-0.5 size-3 shrink-0" />
                                {data.unavailable?.rsvp_history}
                            </p>

                            {data.linked_events.length === 0 ? (
                                <p className="rounded-lg border border-dashed px-3.5 py-5 text-center text-[11.5px] text-muted-foreground">
                                    This guest is not on any other event.
                                </p>
                            ) : (
                                <div className="w-full overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="min-w-[190px]">Event</TableHead>
                                                <TableHead className="min-w-[120px]">Status</TableHead>
                                                <TableHead className="min-w-[90px] text-end">Guests</TableHead>
                                                <TableHead className="min-w-[150px]">Responded</TableHead>
                                                <TableHead className="min-w-[70px] text-end">View</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data.linked_events.map((l) => (
                                                <TableRow key={l.id}>
                                                    <TableCell className="max-w-[240px]">
                                                        <p className="text-[12.5px] font-medium break-words">
                                                            {l.event?.name ?? '—'}
                                                        </p>
                                                        {l.event?.start_date ? (
                                                            <p className="text-[11px] text-muted-foreground">
                                                                {formatDate(l.event.start_date)}
                                                                {l.event.venue_name ? ` · ${l.event.venue_name}` : ''}
                                                            </p>
                                                        ) : null}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="ghost" className={BUCKET_STYLE[l.bucket]}>
                                                            {BUCKET_LABEL[l.bucket]}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-end text-[12px] tabular-nums">
                                                        {l.party_size}
                                                    </TableCell>
                                                    <TableCell className="text-[12px] whitespace-nowrap">
                                                        {l.responded_at ? fmt(l.responded_at, true) : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-end">
                                                        <Button asChild size="sm" variant="ghost">
                                                            <Link href={`/dashboard/rsvps/${l.id}`}>
                                                                <ArrowLeft className="size-3.5 rotate-180" />
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
                </div>

                {/* ── Timeline rail ────────────────────────────────────────── */}
                <Card className="py-0">
                    <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                        <SectionHeading icon={Clock} label="Timeline" tint="bg-primary/10 text-primary" />
                        <ol className="flex flex-col">
                            {data.timeline.map((e, i) => (
                                <TimelineRow
                                    key={e.key}
                                    entry={e}
                                    last={i === data.timeline.length - 1}
                                    fmt={fmt}
                                />
                            ))}
                        </ol>
                        {/*
                          The client's own zone, not a hardcoded one — every
                          timestamp above goes through the same formatter, so the
                          note and the rows cannot disagree.
                        */}
                        <p className="flex min-w-0 items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-[11px] break-words text-muted-foreground">
                            <Info className="mt-0.5 size-3 shrink-0" />
                            Times are shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function SectionHeading({ icon: Icon, label, tint }: {
    icon: React.ElementType; label: string; tint: string;
}) {
    return (
        <div className="flex items-center gap-2.5">
            <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tint}`}>
                <Icon className="size-4" />
            </span>
            <span className="text-[13.5px] font-semibold">{label}</span>
        </div>
    );
}

function HeaderCell({ icon: Icon, label, value, sub }: {
    icon: React.ElementType; label: string; value: string; sub?: string;
}) {
    return (
        <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Icon className="size-3 shrink-0" /> {label}
            </p>
            <p className="mt-1 text-[12.5px] font-medium break-words">{value}</p>
            {sub ? <p className="text-[11px] break-words text-muted-foreground">{sub}</p> : null}
        </div>
    );
}

function Field({ label, value, sub, breakAll }: {
    label: string; value: string | null | undefined; sub?: string; breakAll?: boolean;
}) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className={`mt-1 text-[12.5px] ${breakAll ? 'break-all' : 'break-words'} ${
                value ? 'font-medium' : 'text-muted-foreground'
            }`}>
                {value || '—'}
            </dd>
            {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
        </div>
    );
}

const TIMELINE_ICON: Record<string, React.ElementType> = {
    created: UsersRound,
    invited: Send,
    responded: CircleCheck,
    event: Calendar,
};

function TimelineRow({ entry, last, fmt }: {
    entry: TimelineEntry;
    last: boolean;
    fmt: (v: string | null | undefined, withTime?: boolean) => string;
}) {
    const Icon = TIMELINE_ICON[entry.key]
        ?? (entry.key.startsWith('msg-')
            ? (entry.channel === 'email' ? Mail : MessageCircle)
            : Utensils);

    return (
        <li className="flex min-w-0 gap-3">
            <div className="flex shrink-0 flex-col items-center">
                {/*
                  The event date has not happened. Drawn hollow so it reads as
                  ahead rather than as something already done.
                */}
                <span className={`grid size-6 place-items-center rounded-full ${
                    entry.upcoming
                        ? 'border border-dashed border-muted-foreground/40 text-muted-foreground'
                        : 'bg-primary/10 text-primary'
                }`}>
                    <Icon className="size-3" />
                </span>
                {!last ? <span className="w-px flex-1 bg-border" /> : null}
            </div>
            <div className="min-w-0 flex-1 pb-5 last:pb-0">
                <p className="text-[12.5px] font-medium break-words">{entry.label}</p>
                <p className="text-[11px] text-muted-foreground">{fmt(entry.at, true)}</p>
                {entry.detail ? (
                    <p className="mt-0.5 text-[11.5px] break-words text-muted-foreground">
                        {entry.detail}
                    </p>
                ) : null}
            </div>
        </li>
    );
}
