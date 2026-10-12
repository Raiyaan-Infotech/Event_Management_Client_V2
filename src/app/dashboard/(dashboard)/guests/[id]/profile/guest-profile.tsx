'use client';

import Link from 'next/link';
import { mediaUrl } from '@/lib/media-url';
import {
    ArrowLeft, Mail, Phone, MapPin, Calendar, Users, Link2, Clock,
    Pencil, Send, Info, CircleCheck, Inbox, Eye,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import {
    useGuestProfile,
    RESPONSE_LABEL, RESPONSE_STYLE, DELIVERY_STYLE, ACCOMMODATION_LABEL,
    type GuestProfile,
} from '@/hooks/use-guest-profile';
import { useDateFormatter } from '@/hooks/use-client-settings';
import { NotesTab } from './notes-tab';

/**
 * Guest Profile — six tabs over one payload.
 *
 * ── ⚠ THIS IS THE PERSON, NOT THE INVITATION ────────────────────────────────
 * Every other RSVP screen answers "what did this guest say about THIS event".
 * This one answers "who is this person across all of them", which means every
 * guest row sharing their email.
 *
 * ── ⚠ AND THAT STITCH IS PRINTED, NOT HIDDEN ────────────────────────────────
 * Email is the only link the schema has. A typo splits one person into two
 * profiles; a shared family address merges two people into one. Nothing can
 * detect either, so `identity.note` is rendered on the page. A wrong profile
 * that explains how it was assembled is recoverable; one that looks
 * authoritative is not.
 *
 * ── WHAT THE DESIGN ASKS FOR THAT IS STILL NOT HERE ─────────────────────────
 * **"Link / Unlink Events"** is not an operation. A guest row IS per-event, so
 * linking a person to an event means CREATING a row — that is "invite them to
 * another event", a different verb, and a button called Link would misdescribe
 * what it did. The tab links out to the guest list instead.
 *
 * **Custom Questions.** `custom_answers` holds JSON but nothing defines what
 * the QUESTIONS are, so an answer cannot be labelled. The Overview prints the
 * raw keys and says why.
 *
 * **Delivered / Opened counts read 0**, and that is correct: no provider is
 * connected, so nothing is ever actually delivered or opened. Counting sends
 * instead would make the tiles look healthy while meaning nothing.
 */
export function GuestProfileScreen({ guestId }: { guestId: number }) {
    const { data, isLoading, isError } = useGuestProfile(guestId);
    const fmt = useDateFormatter();

    if (isLoading) {
        return (
            <div className="flex flex-col gap-5 p-4 md:p-6">
                <Skeleton className="h-8 w-52" />
                <Skeleton className="h-36 rounded-xl" />
                <Skeleton className="h-10 w-full max-w-2xl rounded-lg" />
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }

    if (isError || !data?.guest) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
                <p className="text-sm font-medium">Guest not found</p>
                <p className="text-[12.5px] text-muted-foreground">
                    This guest does not exist, or they are not on your account.
                </p>
                <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/rsvps">Back to RSVPs</Link>
                </Button>
            </div>
        );
    }

    const g = data.guest;
    const initials = g.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

    return (
        <div className="flex min-w-0 flex-col gap-5 p-4 md:p-6">
            <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit text-muted-foreground">
                <Link href="/dashboard/rsvps">
                    <ArrowLeft className="size-3.5" /> Back to RSVPs
                </Link>
            </Button>

            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-tight">Guest Profile</h1>
                    <p className="text-sm break-words text-muted-foreground">
                        Everything recorded about this person, across every event.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/guests/${g.id}`}>
                            <Pencil className="size-3.5" /> Edit guest
                        </Link>
                    </Button>
                    <Button asChild size="sm">
                        <Link href={`/dashboard/messages/send?event_id=${data.event?.id ?? ''}&guest_id=${g.id}&kind=reminder&from=rsvps`}>
                            <Send className="size-3.5" /> Send message
                        </Link>
                    </Button>
                </div>
            </div>

            {/* ── Header card ──────────────────────────────────────────────── */}
            <Card className="py-0">
                <CardContent className="grid min-w-0 gap-5 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="flex min-w-0 items-start gap-4">
                        <Avatar className="size-16 shrink-0">
                            {/*
                              Conditionally rendered, with a key. A bare
                              src={undefined} does not reliably trigger the
                              fallback in Radix.

                              ⚠ mediaUrl(), not the raw path. Local storage
                              writes `/uploads/...`, which is relative to the
                              BACKEND, not this app — rendered as-is it 404s
                              against this app's own origin. Same bug as the
                              header's avatar; see media-url.ts.
                            */}
                            {g.photo ? <AvatarImage key={g.photo} src={mediaUrl(g.photo)} alt={g.name} /> : null}
                            <AvatarFallback className="text-[15px] font-semibold">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col gap-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="text-[17px] font-semibold break-words">{g.name}</span>
                                <Badge variant="ghost" className={RESPONSE_STYLE[g.response_type]}>
                                    {RESPONSE_LABEL[g.response_type]}
                                </Badge>
                            </div>
                            {g.email ? (
                                <p className="flex min-w-0 items-center gap-1.5 text-[12px] break-all text-muted-foreground">
                                    <Mail className="size-3 shrink-0" /> {g.email}
                                </p>
                            ) : null}
                            {g.mobile ? (
                                <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                                    <Phone className="size-3 shrink-0" /> {g.dial_code} {g.mobile}
                                </p>
                            ) : null}
                            {g.location ? (
                                <p className="flex min-w-0 items-center gap-1.5 text-[12px] break-words text-muted-foreground">
                                    <MapPin className="size-3 shrink-0" /> {g.location}
                                </p>
                            ) : null}
                            {data.tags.length ? (
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                    {data.tags.map((t) => (
                                        <Badge key={t.id} variant="ghost"
                                            className="bg-muted text-[10.5px] text-muted-foreground">
                                            {t.label}
                                        </Badge>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex min-w-0 flex-col gap-3 lg:border-s lg:ps-5">
                        <HeaderRow icon={Calendar} label="Relationship / Role" value={g.relationship} />
                        <HeaderRow icon={Users} label="Group" value={g.group?.name ?? null} />
                        <HeaderRow
                            icon={Inbox} label="Accommodation"
                            value={ACCOMMODATION_LABEL[g.accommodation]}
                        />
                    </div>

                    <div className="flex min-w-0 flex-col gap-3 lg:border-s lg:ps-5">
                        <HeaderRow
                            icon={Clock} label="Last contact"
                            value={data.summary.last_contact ? fmt(data.summary.last_contact, true) : null}
                        />
                        <HeaderRow
                            icon={Link2} label="Events invited"
                            value={String(data.summary.events_invited)}
                        />
                        <HeaderRow
                            icon={CircleCheck} label="Responded"
                            value={g.responded_at ? fmt(g.responded_at, true) : null}
                        />
                    </div>
                </CardContent>
            </Card>

            {/*
              ⚠ How this page was assembled, said out loud. See the file header.
              Rendered for BOTH outcomes: "linked by email" is a caveat, and
              "no email, so nothing could be linked" is a different one — a
              blank space would be read as neither.
            */}
            <p className="flex min-w-0 items-start gap-2 rounded-lg border bg-muted/40 px-3.5 py-2.5 text-[11.5px] break-words text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {data.identity.note}
            </p>

            {/* ── Tabs ─────────────────────────────────────────────────────── */}
            <Tabs defaultValue="overview" className="min-w-0">
                <div className="w-full overflow-x-auto">
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="invitations">
                            Invitation History ({data.messages.length})
                        </TabsTrigger>
                        <TabsTrigger value="history">
                            RSVP History ({data.response_history.length})
                        </TabsTrigger>
                        <TabsTrigger value="notes">Notes ({data.notes.length})</TabsTrigger>
                        <TabsTrigger value="events">
                            Linked Events ({data.linked_events.length})
                        </TabsTrigger>
                        <TabsTrigger value="timeline">Activity</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="overview" className="mt-4">
                    <OverviewTab data={data} fmt={fmt} />
                </TabsContent>
                <TabsContent value="invitations" className="mt-4">
                    <InvitationsTab data={data} fmt={fmt} />
                </TabsContent>
                <TabsContent value="history" className="mt-4">
                    <HistoryTab data={data} fmt={fmt} />
                </TabsContent>
                <TabsContent value="notes" className="mt-4">
                    <NotesTab guestId={guestId} data={data} fmt={fmt} />
                </TabsContent>
                <TabsContent value="events" className="mt-4">
                    <LinkedEventsTab data={data} fmt={fmt} />
                </TabsContent>
                <TabsContent value="timeline" className="mt-4">
                    <TimelineTab data={data} fmt={fmt} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

type Fmt = (v: string | number | Date | null | undefined, withTime?: boolean) => string;

/* ── Overview ────────────────────────────────────────────────────────────── */

function OverviewTab({ data, fmt }: { data: GuestProfile; fmt: Fmt }) {
    const g = data.guest;
    const answers = g.custom_answers ? Object.entries(g.custom_answers) : [];

    return (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-3">
            <Card className="py-0">
                <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                    <SectionHeading icon={Calendar} label="Invitation Summary" />
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                        <Field label="Event" value={data.event?.name} />
                        <Field label="Event date" value={data.event?.start_date ? fmt(data.event.start_date) : null} />
                        <Field label="Invited on" value={g.invited_at ? fmt(g.invited_at, true) : null} />
                        <Field label="Response" value={RESPONSE_LABEL[g.response_type]} />
                        <Field label="Guests attending" value={String(g.party_size)} />
                        <Field label="Group" value={g.group?.name} />
                        <Field label="Meal preference" value={g.dietary_preference} />
                        <Field label="Table" value={g.table_number} />
                    </div>
                    {g.special_requirements ? (
                        <>
                            <Separator />
                            <Field label="Special requirements" value={g.special_requirements} />
                        </>
                    ) : null}

                    {/*
                      ⚠ The GUEST's own words, and labelled as such. The Notes
                      tab holds what the HOST wrote; showing them in one place
                      would lose which of the two a sentence came from.
                    */}
                    {g.response_note ? (
                        <>
                            <Separator />
                            <div className="min-w-0">
                                <p className="text-[11px] text-muted-foreground">
                                    What the guest said with their reply
                                </p>
                                <p className="mt-1 rounded-lg border bg-muted/40 px-3 py-2 text-[12.5px] break-words">
                                    {g.response_note}
                                </p>
                            </div>
                        </>
                    ) : null}
                </CardContent>
            </Card>

            <Card className="py-0">
                <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                    <SectionHeading icon={Mail} label="Communication" />
                    <div className="grid grid-cols-2 gap-3">
                        <Stat label="Messages" value={data.summary.total_messages} />
                        <Stat label="Delivered" value={data.summary.delivered} />
                        <Stat label="Opened" value={data.summary.opened} />
                        <Stat label="Pending" value={data.summary.pending} />
                    </div>
                    {/*
                      Said plainly rather than left for somebody to puzzle over.
                      Zero here is CORRECT, not a bug — see the file header.
                    */}
                    {data.summary.delivered === 0 && data.summary.total_messages > 0 ? (
                        <p className="flex min-w-0 items-start gap-2 text-[11px] break-words text-muted-foreground">
                            <Info className="mt-0.5 size-3 shrink-0" />
                            Nothing is delivered or opened until a WhatsApp or email provider is
                            connected. Messages are recorded, not sent.
                        </p>
                    ) : null}
                    <Separator />
                    <Field
                        label="Last contact"
                        value={data.summary.last_contact ? fmt(data.summary.last_contact, true) : null}
                    />
                </CardContent>
            </Card>

            <Card className="py-0">
                <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                    <SectionHeading icon={Info} label="Custom Answers" />
                    {answers.length ? (
                        <>
                            <div className="flex min-w-0 flex-col gap-2.5">
                                {answers.map(([k, v]) => (
                                    <div key={k} className="min-w-0">
                                        {/* The raw KEY, because nothing defines
                                            the question it answers. */}
                                        <p className="text-[11px] break-all text-muted-foreground">{k}</p>
                                        <p className="text-[12.5px] break-words">{String(v ?? '—')}</p>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[11px] break-words text-muted-foreground">
                                {data.unavailable.custom_questions}
                            </p>
                        </>
                    ) : (
                        <Empty text={data.unavailable.custom_questions ?? 'No custom answers.'} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

/* ── Invitation History ──────────────────────────────────────────────────── */

function InvitationsTab({ data, fmt }: { data: GuestProfile; fmt: Fmt }) {
    return (
        <Card className="py-0">
            <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                <div className="grid gap-3 sm:grid-cols-4">
                    <Stat label="Total" value={data.summary.total_messages} />
                    <Stat label="Delivered" value={data.summary.delivered} />
                    <Stat label="Opened" value={data.summary.opened} />
                    <Stat label="Pending" value={data.summary.pending} />
                </div>

                {data.messages.length === 0 ? (
                    <Empty text="No invitation or message has been sent to this guest yet." />
                ) : (
                    <div className="w-full overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-[170px]">Event</TableHead>
                                    <TableHead className="min-w-[150px]">Sent</TableHead>
                                    <TableHead className="min-w-[100px]">Channel</TableHead>
                                    <TableHead className="min-w-[110px]">Sender</TableHead>
                                    <TableHead className="min-w-[130px]">Delivery</TableHead>
                                    <TableHead className="min-w-[110px]">Opened</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.messages.map((m) => (
                                    <TableRow key={m.id}>
                                        <TableCell className="max-w-[220px] text-[12px] break-words">
                                            {m.event?.name ?? '—'}
                                            <span className="block text-[10.5px] text-muted-foreground">
                                                {m.kind}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-[12px] whitespace-nowrap">
                                            {m.sent_at ? fmt(m.sent_at, true)
                                                : <span className="text-muted-foreground">Not sent</span>}
                                        </TableCell>
                                        <TableCell className="text-[12px] capitalize">{m.channel}</TableCell>
                                        <TableCell className="max-w-[160px] text-[12px] break-words">
                                            {m.sender_name ?? '—'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="ghost" className={DELIVERY_STYLE[m.status]}>
                                                {m.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-[12px] whitespace-nowrap">
                                            {m.opened_at ? fmt(m.opened_at, true)
                                                : <span className="text-muted-foreground">—</span>}
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

/* ── RSVP History ────────────────────────────────────────────────────────── */

function HistoryTab({ data, fmt }: { data: GuestProfile; fmt: Fmt }) {
    return (
        <Card className="py-0">
            <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                <SectionHeading icon={Clock} label="Every recorded change to this guest's answer" />

                {data.response_history.length === 0 ? (
                    /*
                      ⚠ A REAL answer, not a load failure. A guest who never
                      replied has no history, and one whose only answer predates
                      the change log has none either. Saying so beats an empty
                      table that reads as broken.
                    */
                    <Empty text={
                        "No changes recorded. Either this guest has not responded, or their answer "
                        + 'was given before response history was kept.'
                    } />
                ) : (
                    <div className="w-full overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-[150px]">When</TableHead>
                                    <TableHead className="min-w-[170px]">Event</TableHead>
                                    <TableHead className="min-w-[190px]">Change</TableHead>
                                    <TableHead className="min-w-[80px] text-end">Guests</TableHead>
                                    <TableHead className="min-w-[130px]">Meal</TableHead>
                                    <TableHead className="min-w-[120px]">Accommodation</TableHead>
                                    <TableHead className="min-w-[100px]">By</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.response_history.map((h) => (
                                    <TableRow key={h.id}>
                                        <TableCell className="text-[12px] whitespace-nowrap">
                                            {fmt(h.changed_at, true)}
                                        </TableCell>
                                        <TableCell className="max-w-[200px] text-[12px] break-words">
                                            {h.event?.name ?? '—'}
                                        </TableCell>
                                        <TableCell>
                                            {/*
                                              ⚠ The FIRST entry reads "Responded";
                                              later ones read "Maybe -> Yes". They
                                              are different sentences, which is why
                                              `from` is null rather than 'none' on
                                              a first answer.
                                            */}
                                            <span className="flex flex-wrap items-center gap-1.5">
                                                {h.is_first ? (
                                                    <span className="text-[11px] text-muted-foreground">
                                                        Responded
                                                    </span>
                                                ) : (
                                                    <>
                                                        <Badge variant="ghost"
                                                            className={`${RESPONSE_STYLE[h.from_response_type ?? 'none']} opacity-60`}>
                                                            {RESPONSE_LABEL[h.from_response_type ?? 'none']}
                                                        </Badge>
                                                        <span className="text-muted-foreground">&rarr;</span>
                                                    </>
                                                )}
                                                <Badge variant="ghost" className={RESPONSE_STYLE[h.to_response_type]}>
                                                    {RESPONSE_LABEL[h.to_response_type]}
                                                </Badge>
                                            </span>
                                            {h.notes ? (
                                                <span className="mt-1 block max-w-[260px] text-[10.5px] break-words text-muted-foreground">
                                                    {h.notes}
                                                </span>
                                            ) : null}
                                        </TableCell>
                                        <TableCell className="text-end text-[12px] tabular-nums">
                                            {h.party_size}
                                        </TableCell>
                                        <TableCell className="max-w-[160px] text-[12px] break-words">
                                            {h.dietary_preference || '—'}
                                        </TableCell>
                                        <TableCell className="text-[12px]">
                                            {ACCOMMODATION_LABEL[h.accommodation]}
                                        </TableCell>
                                        <TableCell className="text-[12px] capitalize">
                                            {h.source === 'client' ? 'You' : h.source}
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

/* ── Linked Events ───────────────────────────────────────────────────────── */

function LinkedEventsTab({ data, fmt }: { data: GuestProfile; fmt: Fmt }) {
    return (
        <Card className="py-0">
            <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                <SectionHeading icon={Link2} label={`Events this person is on (${data.linked_events.length})`} />

                <div className="w-full overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-[200px]">Event</TableHead>
                                <TableHead className="min-w-[140px]">Date</TableHead>
                                <TableHead className="min-w-[160px]">Venue</TableHead>
                                <TableHead className="min-w-[130px]">Invitation</TableHead>
                                <TableHead className="min-w-[120px]">Response</TableHead>
                                <TableHead className="min-w-[90px] text-end">Open</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.linked_events.map((l) => (
                                <TableRow key={l.id} className={l.is_current ? 'bg-primary/5' : undefined}>
                                    <TableCell className="max-w-[240px] text-[12px] break-words">
                                        {l.event?.name ?? '—'}
                                        {l.is_current ? (
                                            <Badge variant="ghost" className="ms-2 bg-primary/10 text-[10px] text-primary">
                                                This one
                                            </Badge>
                                        ) : null}
                                    </TableCell>
                                    <TableCell className="text-[12px] whitespace-nowrap">
                                        {l.event?.start_date ? fmt(l.event.start_date) : '—'}
                                    </TableCell>
                                    <TableCell className="max-w-[200px] text-[12px] break-words text-muted-foreground">
                                        {l.event?.venue_name || '—'}
                                    </TableCell>
                                    <TableCell>
                                        {/*
                                          ⚠ "Not sent yet" and "sent, no reply"
                                          are different facts. The design draws
                                          them the same; they are not.
                                        */}
                                        {l.invitation_sent ? (
                                            <span className="text-[12px]">{fmt(l.invited_at)}</span>
                                        ) : (
                                            <Badge variant="ghost" className="bg-muted text-muted-foreground">
                                                Not sent yet
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="ghost" className={RESPONSE_STYLE[l.response_type]}>
                                            {RESPONSE_LABEL[l.response_type]}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-end">
                                        <Button asChild size="icon" variant="ghost" className="size-8">
                                            <Link href={`/dashboard/rsvps/${l.id}`} title="Open this RSVP">
                                                <Eye className="size-3.5" />
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {/*
                  ⚠ Where the design puts "Link / Unlink Events". A guest row IS
                  per-event, so there is nothing to link — adding this person to
                  another event CREATES a row, which is an invitation. Naming
                  the real operation beats a button that misdescribes itself.
                */}
                <p className="flex min-w-0 items-start gap-2 rounded-lg border bg-muted/40 px-3.5 py-2.5 text-[11.5px] break-words text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    A guest belongs to one event, so events are not linked or unlinked. To add this
                    person to another event,{' '}
                    <Link href="/dashboard/guests/add" className="font-medium text-primary hover:underline">
                        invite them to it
                    </Link>
                    {' '}— they join this profile automatically if the email matches.
                </p>
            </CardContent>
        </Card>
    );
}

/* ── Activity ────────────────────────────────────────────────────────────── */

/**
 * Composed in the BROWSER from things already on the payload.
 *
 * Never a stored feed: a second copy of the same facts is the first thing to
 * fall out of step with the rows it describes. Only what HAPPENED appears —
 * a greyed-out "awaiting response" step reads as stuck rather than as not
 * started.
 */
function TimelineTab({ data, fmt }: { data: GuestProfile; fmt: Fmt }) {
    const entries: { at: string; title: string; detail: string; by: string }[] = [];

    if (data.guest.created_at) {
        entries.push({
            at: data.guest.created_at,
            title: 'Added to the guest list',
            detail: data.event?.name ? `For ${data.event.name}.` : '',
            by: 'You',
        });
    }
    for (const m of data.messages) {
        if (!m.sent_at) continue;
        entries.push({
            at: m.sent_at,
            title: `${m.kind.replace(/_/g, ' ')} sent`,
            detail: `Via ${m.channel}${m.event?.name ? ` for ${m.event.name}` : ''}.`,
            by: m.sender_name ?? 'System',
        });
        if (m.opened_at) {
            entries.push({
                at: m.opened_at, title: 'Opened', detail: `They opened the ${m.channel}.`, by: 'Guest',
            });
        }
    }
    for (const h of data.response_history) {
        entries.push({
            at: h.changed_at,
            title: h.is_first
                ? `Responded ${RESPONSE_LABEL[h.to_response_type].toLowerCase()}`
                : `Response changed to ${RESPONSE_LABEL[h.to_response_type].toLowerCase()}`,
            detail: h.event?.name ? `For ${h.event.name}.` : '',
            by: h.source === 'client' ? 'You' : h.source === 'guest' ? 'Guest' : 'System',
        });
    }

    entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return (
        <Card className="py-0">
            <CardContent className="flex min-w-0 flex-col gap-4 p-5">
                <SectionHeading icon={Clock} label={`Activity (${entries.length})`} />
                {entries.length === 0 ? (
                    <Empty text="Nothing has happened with this guest yet." />
                ) : (
                    <ol className="flex min-w-0 flex-col gap-0">
                        {entries.map((e, i) => (
                            <li key={`${e.at}-${i}`} className="flex min-w-0 gap-3">
                                <div className="flex flex-col items-center">
                                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                                    {i < entries.length - 1
                                        ? <span className="w-px flex-1 bg-border" /> : null}
                                </div>
                                <div className="min-w-0 pb-5">
                                    <p className="text-[12.5px] font-medium capitalize break-words">
                                        {e.title}
                                    </p>
                                    {e.detail ? (
                                        <p className="text-[11.5px] break-words text-muted-foreground">
                                            {e.detail}
                                        </p>
                                    ) : null}
                                    <p className="text-[11px] text-muted-foreground">
                                        {fmt(e.at, true)} · {e.by}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </CardContent>
        </Card>
    );
}

/* ── Small parts ─────────────────────────────────────────────────────────── */

function HeaderRow({ icon: Icon, label, value }: {
    icon: React.ElementType; label: string; value: string | null;
}) {
    return (
        <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted">
                <Icon className="size-3.5 text-muted-foreground" />
            </span>
            <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className={`text-[12.5px] break-words ${value ? 'font-medium' : 'text-muted-foreground'}`}>
                    {value || '—'}
                </p>
            </div>
        </div>
    );
}

export function SectionHeading({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-[13.5px] font-semibold break-words">{label}</span>
        </div>
    );
}

export function Field({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={`text-[12.5px] break-words ${value ? '' : 'text-muted-foreground'}`}>
                {value || '—'}
            </p>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="min-w-0 rounded-lg border p-3">
            <p className="text-[11px] break-words text-muted-foreground">{label}</p>
            <p className="text-lg leading-tight font-bold tabular-nums">{value}</p>
        </div>
    );
}

export function Empty({ text }: { text: string }) {
    return (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-[12px] break-words text-muted-foreground">
            {text}
        </p>
    );
}
