'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
    MessageCircle, Mail, Smartphone, Send, Users, User, UsersRound,
    Calendar, Loader2, Info, X, Lightbulb, ChevronDown, Check, AlertTriangle,
    Bold, Italic, Strikethrough, Sparkles, CalendarClock, Filter, ArrowRight,
    CheckCheck, Wallet, Link2, ArrowLeft,
    Bell,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
    useComposer, usePreviewAudience, useSendMessage, useSendTest,
    renderPreview,
    type MessageChannel, type ChannelState, type AudiencePreview,
} from '@/hooks/use-messages';
import { useParticipants } from '@/hooks/use-guests';
import {
    RichTextEditor, htmlIsEmpty,
    type RichTextEditorRef,
} from '@/components/common/rich-text-editor';
import { useEventHref } from "@/lib/event-workspace";

/**
 * Send Message.
 *
 * ── ⚠ NOTHING IS DELIVERED YET ──────────────────────────────────────────────
 * No WhatsApp, SMS or SMTP provider is configured. Pressing Send RECORDS the
 * campaign and one row per recipient, and the screen says so in the server's
 * own words — `channels[]` carries the state and the reason, so this file has
 * no sentence of its own to go stale, and the banner disappears by itself the
 * day a provider is wired.
 *
 * ── THE THREE NUMBERS ON THIS SCREEN COME FROM THE SERVER ───────────────────
 * Recipient count, the group breakdown and the merge-field preview are all
 * resolved by `POST /messages/preview`, even though the browser has the guest
 * list and could compute them. That endpoint is the same code the SEND uses, so
 * the review step and the send cannot disagree about who is reachable — which
 * is exactly how a "816 recipients" turns into 804 delivered with nobody able
 * to say why.
 *
 * ── WHAT THE DESIGN SHOWS THAT IS NOT HERE, AND WHY ─────────────────────────
 * **Estimated Cost / Credits.** There is no credit ledger anywhere in this
 * system — no table, no balance, no price per message. "0 Credits" beside a
 * send is a number that means nothing, and "2 Credits" would be invented.
 * The tile that would have held it reports the real constraint instead.
 *
 * **Delivery Estimate: High.** Nothing measures deliverability, and there is no
 * provider to measure. A confidence rating for an integration that does not
 * exist is the one claim on this screen nobody should make.
 *
 * **Template (Optional) / View Templates / Save as Template.** There is no
 * message-template table. A picker with nothing behind it is a control that
 * looks broken rather than unbuilt.
 *
 * ── ⚠ TWO EDITORS, BECAUSE THERE ARE TWO KINDS OF MESSAGE ──────────────────
 * EMAIL gets the rich text editor — an email body IS html, and that is what
 * the admin panel's editor produces.
 *
 * WHATSAPP does NOT, and must not. WhatsApp is a plain-text protocol: it
 * renders `*bold*` and `_italic_`, not `<b>`. Feeding it html would deliver
 * `<p>Hi Arjun</p>` to the guest, literally, tags and all. So that channel
 * keeps a plain field whose toolbar writes WhatsApp's own markers.
 *
 * Which one appears follows the channel, so neither can be used on the wrong
 * one by accident.
 */

/**
 * Look and wording per channel.
 *
 * WHICH channels appear is NOT decided here — the buttons render from
 * `composer.channels`, which the server serves. This map only says how one
 * LOOKS once the server has offered it, so a channel can be added or withdrawn
 * without a frontend release and this screen can never offer one the send
 * would reject.
 *
 * `sms` keeps an entry only so a historical row stays describable.
 */
const CHANNEL_META: Record<MessageChannel, {
    hint: string;
    icon: React.ElementType;
    tint: string;
    /** The card's own colour when chosen, so the choice is legible at a glance. */
    active: string;
}> = {
    whatsapp: {
        hint: 'Send via WhatsApp', icon: MessageCircle,
        tint: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
        active: 'border-emerald-500/60 bg-emerald-500/5',
    },
    sms: {
        hint: 'Send via SMS', icon: Smartphone,
        tint: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
        active: 'border-blue-500/60 bg-blue-500/5',
    },
    email: {
        hint: 'Send via Email', icon: Mail,
        tint: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
        active: 'border-violet-500/60 bg-violet-500/5',
    },
    /*
      Present so the type is total and a historical push row can describe
      itself, NOT so push can be chosen here — `OFFERED_CHANNELS` decides which
      buttons render, and push is absent from it on purpose. Push has its own
      composer under Messages -> Notifications, because its audience rule and
      its options have nothing in common with the other three.
    */
    push: {
        hint: 'Send via Push Notification', icon: Bell,
        tint: 'text-pink-600 dark:text-pink-400 bg-pink-500/10',
        active: 'border-pink-500/60 bg-pink-500/5',
    },
};

/** WhatsApp's own markers. Real formatting, not a decorative toolbar. */
const WRAPS = [
    { key: 'bold', icon: Bold, mark: '*', label: 'Bold' },
    { key: 'italic', icon: Italic, mark: '_', label: 'Italic' },
    { key: 'strike', icon: Strikethrough, mark: '~', label: 'Strikethrough' },
];

/**
 * The kinds `VALID_KINDS` in `clientMessage.service.js` accepts.
 *
 * A `?kind=` the server would reject must not reach the send — it would be
 * silently coerced to `invite` there and the campaign would be filed under the
 * wrong heading with nothing said about it. Unknown values fall back HERE,
 * where the banner can say the link was only partly understood.
 */
const KINDS = ['invite', 'reminder', 'update', 'thank_you', 'custom'] as const;
type MessageKind = (typeof KINDS)[number];

const KIND_LABEL: Record<MessageKind, string> = {
    invite: 'Invitation',
    reminder: 'Reminder',
    update: 'Update',
    thank_you: 'Thank you',
    custom: 'Message',
};

/**
 * Where the Back link goes, keyed by `?from=`.
 *
 * An ALLOWLIST of tokens, not a return URL in the query string. A `?back=` the
 * page followed verbatim is a redirect somebody else gets to write — and even
 * kept internal it would need path validation this map makes unnecessary.
 *
 * An unrecognised token falls through to Messages, which is where the composer
 * belongs when nothing sent you here.
 */
const BACK_TO = {
    rsvps: { href: '/dashboard/rsvps', label: 'Back to RSVPs' },
    guests: { href: '/dashboard/guests', label: 'Back to Guests' },
    'guest-groups': { href: '/dashboard/guests/groups', label: 'Back to Groups' },
} as const;

const BACK_DEFAULT = { href: '/dashboard/messages', label: 'Back to Messages' };

/**
 * What a deep link asked for.
 *
 * ⚠ Read ONCE, in the `useState` initialisers below — never in an effect. An
 * effect would paint the default composer first and then swap the selection
 * under the client, and seeding state from an effect is the same mistake the
 * RSVP edit form had.
 *
 * Two spellings exist in the wild: the Guests screens link with `?guest=` /
 * `?group=`, the RSVP screens with `?guest_id=` / `?group_id=`. Both are read,
 * because breaking somebody's bookmark to tidy a parameter name is a worse
 * trade than four extra characters here.
 */
function readLink(q: URLSearchParams) {
    const num = (...names: string[]) => {
        for (const n of names) {
            const v = Number(q.get(n));
            if (Number.isInteger(v) && v > 0) return v;
        }
        return null;
    };
    const rawKind = q.get('kind');
    const guestId = num('guest_id', 'guest');
    const groupId = num('group_id', 'group');
    const known = (KINDS as readonly string[]).includes(rawKind ?? '');
    const from = q.get('from');
    return {
        eventId: num('event_id', 'event'),
        guestId,
        groupId,
        back: (from && from in BACK_TO
            ? BACK_TO[from as keyof typeof BACK_TO]
            : BACK_DEFAULT),
        kind: (known ? rawKind : 'invite') as MessageKind,
        /** A `kind` was asked for and is not one this system has. */
        kindIgnored: !!rawKind && !known,
        /** Whether the link steered the recipients — drives the banner. */
        seeded: !!(guestId || groupId),
    };
}

const AUDIENCES = [
    { value: 'all', label: 'All Guests', hint: 'Send message to all guests in the event' },
    { value: 'groups', label: 'Selected Groups', hint: 'Send message to guests in specific groups' },
    { value: 'guests', label: 'Selected Guests', hint: 'Send message to individual guests' },
] as const;

/**
 * `useSearchParams` opts the tree into client-side rendering, so Next requires
 * a Suspense boundary around it or the production build fails outright.
 */
export default function SendMessagePage() {
    return (
        <Suspense fallback={<ComposerSkeleton />}>
            <SendMessageComposer />
        </Suspense>
    );
}

function SendMessageComposer() {
    const wsHref = useEventHref();
    const router = useRouter();
    const search = useSearchParams();

    /*
      Resolved once per mount. `useSearchParams` hands back a new object on
      every render, so reading it inside `useState(() => …)` is what stops this
      re-seeding — and re-seeding would wipe whatever had been typed.
    */
    const [link] = useState(() => readLink(new URLSearchParams(search.toString())));

    const [eventId, setEventId] = useState<number | null>(link.eventId);
    const { data: composer, isLoading } = useComposer(eventId);

    const [channel, setChannel] = useState<MessageChannel>('whatsapp');
    /*
      Fixed by the link, because there is no control that changes it. A setter
      nothing calls would suggest one exists; when a message-type picker is
      built this becomes state again.
    */
    const kind: MessageKind = link.kind;
    const [audience, setAudience] = useState<'all' | 'groups' | 'guests'>(
        link.guestId ? 'guests' : link.groupId ? 'groups' : 'all',
    );
    const [groupIds, setGroupIds] = useState<number[]>(link.groupId ? [link.groupId] : []);
    const [guestIds, setGuestIds] = useState<number[]>(link.guestId ? [link.guestId] : []);
    const [subject, setSubject] = useState('');
    const [preheader, setPreheader] = useState('');
    const [body, setBody] = useState('');
    const [excludeUnsubscribed, setExcludeUnsubscribed] = useState(true);
    const [scheduleOn, setScheduleOn] = useState(false);
    const [scheduledAt, setScheduledAt] = useState('');
    const [errors, setErrors] = useState<Record<string, boolean>>({});

    const bodyRef = useRef<HTMLTextAreaElement>(null);
    const editorRef = useRef<RichTextEditorRef>(null);

    /*
      Quill leaves "<p><br></p>" behind when you delete everything — not empty
      by `.trim()`, but empty to the person looking at it. `htmlIsEmpty` is the
      only honest emptiness test for the email body.
    */
    const isHtml = channel === 'email';
    const bodyEmpty = isHtml ? htmlIsEmpty(body) : !body.trim();

    const previewAudience = usePreviewAudience();
    const sendTest = useSendTest();
    const send = useSendMessage(() => router.push(wsHref('/dashboard/messages')));

    const [resolved, setResolved] = useState<AudiencePreview | null>(null);

    const event = composer?.selected_event ?? null;
    const channelState: ChannelState | undefined =
        composer?.channels.find((c) => c.channel === channel);

    // The first event, once, without stomping a choice the client has made.
    useEffect(() => {
        if (eventId === null && composer?.selected_event) setEventId(composer.selected_event.id);
    }, [composer?.selected_event, eventId]);

    /*
      Falls back to the first channel the server DOES offer. The initial state
      is a guess; a default the send would reject makes the first attempt fail
      for no visible reason.
    */
    useEffect(() => {
        const offered = composer?.channels ?? [];
        if (offered.length && !offered.some((c) => c.channel === channel)) {
            setChannel(offered[0].channel);
        }
    }, [composer?.channels, channel]);

    /*
      Re-resolve whenever the audience or the channel changes — those are what
      decide who is reachable. NOT on every keystroke in the body: the recipient
      count does not depend on the text, and a request per character is the
      mistake the Translations page already made once.
    */
    useEffect(() => {
        if (!eventId) return;
        if (audience === 'groups' && !groupIds.length) { setResolved(null); return; }
        if (audience === 'guests' && !guestIds.length) { setResolved(null); return; }
        const t = setTimeout(() => {
            previewAudience.mutate(
                {
                    event_id: eventId, channel, audience,
                    group_ids: groupIds, guest_ids: guestIds,
                    subject, body,
                    exclude_unsubscribed: excludeUnsubscribed,
                },
                { onSuccess: setResolved },
            );
        }, 250);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId, channel, audience, groupIds, guestIds, excludeUnsubscribed]);

    /** The live preview, rendered in the browser so it updates as you type. */
    const mergeValues = useMemo(() => ({
        first_name: resolved?.preview.rendered_for?.name?.split(' ')[0] || 'Guest',
        last_name: resolved?.preview.rendered_for?.name?.split(' ').slice(1).join(' ') || '',
        full_name: resolved?.preview.rendered_for?.name || 'Guest',
        event_name: event?.name || '',
        event_date: event?.start_date ? formatDate(event.start_date) : '',
        event_time: event?.start_time ? formatTime(event.start_time) : '',
        venue_name: event?.venue_name || '',
        venue_address: event?.venue_address || '',
        host_name: '',
        table_number: '',
        rsvp_link: 'RSVP link',
    }), [resolved?.preview.rendered_for?.name, event]);

    const recipients = resolved?.total_recipients ?? 0;

    /**
     * Insert at the CURSOR, not at the end.
     *
     * Appending would put a merge field after the signature every time somebody
     * went back to fix the greeting — which is exactly when they use the picker.
     */
    function insertAtCursor(text: string) {
        // The rich editor owns its own caret; it cannot be driven through a
        // textarea ref that is not mounted.
        if (isHtml) { editorRef.current?.insertTextAtCursor(text); return; }
        const el = bodyRef.current;
        if (!el) { setBody((prev) => prev + text); return; }
        const start = el.selectionStart ?? body.length;
        const end = el.selectionEnd ?? body.length;
        setBody(body.slice(0, start) + text + body.slice(end));
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(start + text.length, start + text.length);
        });
    }

    /** Wraps the SELECTION, or inserts the pair and puts the cursor between them. */
    function wrapSelection(mark: string) {
        const el = bodyRef.current;
        if (!el) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const selected = body.slice(start, end);
        setBody(`${body.slice(0, start)}${mark}${selected}${mark}${body.slice(end)}`);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(start + mark.length, start + mark.length + selected.length);
        });
    }

    function submit() {
        if (send.isPending) return;
        const bad: Record<string, boolean> = {};
        if (!eventId) bad.event = true;
        if (bodyEmpty) bad.body = true;
        if (channel === 'email' && !subject.trim()) bad.subject = true;
        if (audience === 'groups' && !groupIds.length) bad.groups = true;
        if (audience === 'guests' && !guestIds.length) bad.guests = true;
        if (scheduleOn && !scheduledAt) bad.schedule = true;
        if (Object.keys(bad).length) {
            setErrors(bad);
            toast.error('Please fill all mandatory fields.');
            return;
        }
        setErrors({});

        if (!recipients) {
            toast.error('Nobody would receive this message.', {
                description: resolved?.unreachable.reason ?? 'No guests match that selection.',
            });
            return;
        }

        send.mutate({
            event_id: eventId!,
            channel,
            kind,
            audience,
            group_ids: groupIds,
            guest_ids: guestIds,
            subject: subject.trim() || undefined,
            // Html is sent as-is; only a plain body is worth trimming.
            body: isHtml ? body : body.trim(),
            exclude_unsubscribed: excludeUnsubscribed,
            scheduled_at: scheduleOn && scheduledAt ? scheduledAt : undefined,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
    }

    if (isLoading) return <ComposerSkeleton />;

    if (!composer?.events.length) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
                <Calendar className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium">No event to message about</p>
                <p className="max-w-sm text-[12.5px] text-muted-foreground">
                    A message goes to the guests of one event, so there has to be an event first.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href={wsHref(link.back.href)}>
                            <ArrowLeft className="size-3.5" /> {link.back.label}
                        </Link>
                    </Button>
                    <Button asChild size="sm">
                        <Link href={wsHref("/dashboard/events/create")}>Create an event</Link>
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-5 p-4 md:p-6">
            {/*
              Named for the screen you came FROM, not a bare "Back" — a composer
              reached from four different places needs to say which one it will
              return you to before you press it.
            */}
            <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit text-muted-foreground">
                <Link href={wsHref(link.back.href)}>
                    <ArrowLeft className="size-3.5" /> {link.back.label}
                </Link>
            </Button>

            <div className="flex min-w-0 flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Send Message</h1>
                <p className="text-sm break-words text-muted-foreground">
                    Send personalized messages to your guests via WhatsApp or Email.
                </p>
            </div>

            {/*
              What the link actually did.

              ⚠ The COUNT is the server's, not this file's. A `?guest_id=` for
              somebody who is not on this event resolves to nobody, and the old
              behaviour — landing on the default event with nothing selected —
              looked like it had worked. `selected_guests: 0` is the only
              trustworthy signal that the link pointed at nothing, so the banner
              waits for the preview rather than asserting a success of its own.
            */}
            {link.seeded ? (
                <div className={`flex min-w-0 items-start gap-3 rounded-xl border p-4 ${
                    resolved && !resolved.counts?.selected_guests
                        ? 'border-warning/40 bg-warning/10'
                        : 'bg-muted/40'
                }`}>
                    <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 text-[12.5px] break-words">
                        {!resolved ? (
                            <span className="text-muted-foreground">
                                Opening a {KIND_LABEL[kind].toLowerCase()} for the selection you
                                came from…
                            </span>
                        ) : resolved.counts?.selected_guests ? (
                            <>
                                <span className="font-semibold">
                                    Pre-filled from where you came from.
                                </span>{' '}
                                <span className="text-muted-foreground">
                                    {KIND_LABEL[kind]} to{' '}
                                    {resolved.counts.selected_guests === 1
                                        ? resolved.preview.rendered_for?.name ?? '1 guest'
                                        : `${resolved.counts.selected_guests} guests`}
                                    {event ? ` for ${event.name}` : ''}. Change anything below
                                    before sending.
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="font-semibold text-warning">
                                    That link did not match anyone.
                                </span>{' '}
                                <span className="text-muted-foreground">
                                    The guest it named is not on{' '}
                                    {event ? event.name : 'this event'} — pick the right event, or
                                    choose the recipients yourself.
                                </span>
                            </>
                        )}
                        {link.kindIgnored ? (
                            <span className="mt-1 block text-[11.5px] text-muted-foreground">
                                It also asked for a message type this system does not have, so this
                                is being composed as an invitation.
                            </span>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {/*
              The server's own sentence, not one written here. It names the
              channel the client actually picked, and it disappears by itself
              when a provider is connected.
            */}
            {channelState && !channelState.enabled ? (
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-warning">
                            {channelState.label} is not connected
                        </p>
                        <p className="mt-1 text-[12.5px] break-words text-muted-foreground">
                            {channelState.reason}
                        </p>
                    </div>
                </div>
            ) : null}

            {/* `items-start` so a short column does not stretch to match a tall one. */}
            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[290px_minmax(0,1fr)_320px]">
                {/* ── 1 · Recipients ───────────────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-5">
                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-4 p-5">
                            <StepHeading n={1} label="Select Recipients" />

                            <div className="flex flex-col gap-2.5">
                                <Label className="text-[12px]">
                                    Send To <span className="text-destructive">*</span>
                                </Label>
                                {/*
                                  A plain radio list, not three bordered boxes: boxing
                                  each option makes them read as three separate cards
                                  and loses that they are one choice.
                                */}
                                <div className="flex flex-col gap-3">
                                    {AUDIENCES.map((a) => {
                                        const on = audience === a.value;
                                        return (
                                            <button
                                                key={a.value}
                                                type="button"
                                                onClick={() => { setAudience(a.value); setErrors({}); }}
                                                className="flex min-w-0 items-start gap-2.5 text-start"
                                            >
                                                <span className={`mt-0.5 grid size-[15px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors ${
                                                    on ? 'border-primary' : 'border-muted-foreground/40'
                                                }`}>
                                                    {on ? <span className="size-[7px] rounded-full bg-primary" /> : null}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className={`block text-[12.5px] ${on ? 'font-semibold' : 'font-medium'}`}>
                                                        {a.label}
                                                    </span>
                                                    <span className="mt-0.5 block text-[11px] leading-snug break-words text-muted-foreground">
                                                        {a.hint}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {audience === 'groups' ? (
                                <>
                                    <Separator />
                                    <GroupPicker
                                        groups={composer.groups}
                                        selected={groupIds}
                                        onChange={setGroupIds}
                                        error={errors.groups}
                                    />
                                </>
                            ) : null}

                            {audience === 'guests' && eventId ? (
                                <>
                                    <Separator />
                                    <GuestPicker
                                        eventId={eventId}
                                        selected={guestIds}
                                        onChange={setGuestIds}
                                        error={errors.guests}
                                    />
                                </>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-3 p-5">
                            <span className="text-[13.5px] font-semibold">Event</span>
                            <Select
                                value={eventId ? String(eventId) : ''}
                                onValueChange={(v) => { setEventId(Number(v)); setGroupIds([]); setGuestIds([]); }}
                            >
                                <SelectTrigger className="w-full text-[12.5px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {/*
                                      The guest count rides along, so an event with
                                      nobody on it is visibly the reason the
                                      recipient picker came up empty.
                                    */}
                                    {composer.events.map((e) => (
                                        <SelectItem key={e.id} value={String(e.id)}>
                                            <span className="flex min-w-0 items-center gap-2">
                                                <span className="min-w-0 truncate">{e.name}</span>
                                                <span className="shrink-0 text-[10.5px] text-muted-foreground">
                                                    {e.guest_count ?? 0} {e.guest_count === 1 ? 'guest' : 'guests'}
                                                </span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {event ? (
                                <div className="flex min-w-0 items-start gap-2">
                                    <Calendar className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                    <p className="min-w-0 text-[11.5px] break-words text-muted-foreground">
                                        {event.start_date ? formatDate(event.start_date) : 'No date set'}
                                        {event.start_time ? `, ${formatTime(event.start_time)}` : ''}
                                        {event.venue_name ? ` · ${event.venue_name}` : ''}
                                    </p>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-4 p-5">
                            <span className="text-[13.5px] font-semibold">Advanced Options</span>

                            {/*
                              This maps onto `rsvp_status = 'declined'`, which is
                              the only opt-out this schema records — there is no
                              separate unsubscribe flag on a guest, and inventing
                              one nothing ever sets would make the toggle decorative.
                            */}
                            <ToggleRow
                                icon={Filter}
                                label="Exclude declined"
                                hint="Skip guests who have declined the invitation"
                                checked={excludeUnsubscribed}
                                onChange={setExcludeUnsubscribed}
                            />
                            <ToggleRow
                                icon={CalendarClock}
                                label="Schedule for Later"
                                hint="Choose date and time to send"
                                checked={scheduleOn}
                                onChange={(v) => { setScheduleOn(v); setErrors({}); }}
                            />
                            {scheduleOn ? (
                                <div className="flex flex-col gap-1.5 ps-[34px]">
                                    <Input
                                        type="datetime-local"
                                        value={scheduledAt}
                                        onChange={(e) => setScheduledAt(e.target.value)}
                                        className="text-[12.5px]"
                                        aria-invalid={errors.schedule || undefined}
                                    />
                                    {/* The server refuses a time already past rather
                                        than firing immediately — quietly sending now
                                        is the one outcome that cannot be undone. */}
                                    <span className="text-[11px] text-muted-foreground">
                                        {Intl.DateTimeFormat().resolvedOptions().timeZone}
                                    </span>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>

                {/* ── 2 · Channel + 3 · Compose ────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-5">
                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-4 p-5">
                            <StepHeading n={2} label="Choose Message Type" />
                            {/*
                              Rendered from what the SERVER offers, not from a list
                              here — so this cannot show a channel the send would
                              then refuse.
                            */}
                            <div className="grid gap-3 sm:grid-cols-2">
                                {composer.channels.map((state) => {
                                    const meta = CHANNEL_META[state.channel] ?? CHANNEL_META.email;
                                    const active = channel === state.channel;
                                    return (
                                        <button
                                            key={state.channel}
                                            type="button"
                                            onClick={() => setChannel(state.channel)}
                                            className={`flex min-w-0 items-center gap-3 rounded-xl border p-3.5 text-start transition-colors ${
                                                active ? meta.active : 'hover:bg-muted/60'
                                            }`}
                                        >
                                            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${meta.tint}`}>
                                                <meta.icon className="size-[18px]" />
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-[13px] font-semibold">{state.label}</span>
                                                <span className="mt-0.5 block text-[11px] break-words text-muted-foreground">
                                                    {/* Says what is true of THIS channel rather
                                                        than repeating the marketing line. */}
                                                    {state.enabled ? meta.hint : 'Not connected yet'}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-4 p-5">
                            <StepHeading n={3} label={channel === 'email' ? 'Compose Email Message' : 'Compose Message'} />

                            {channel === 'email' ? (
                                <>
                                    <Field label="Subject" required error={errors.subject}>
                                        <Input
                                            value={subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                            placeholder="You're Invited! {event_name}"
                                            aria-invalid={errors.subject || undefined}
                                        />
                                    </Field>
                                    <Field
                                        label="Preview Text (Preheader)"
                                        hint="This appears in the recipient's inbox after the subject line."
                                    >
                                        <Input
                                            value={preheader}
                                            onChange={(e) => setPreheader(e.target.value)}
                                            placeholder="We would love to celebrate this occasion with you."
                                        />
                                    </Field>
                                </>
                            ) : null}

                            <div className="flex min-w-0 flex-col gap-1.5">
                                <Label className="text-[12px]">
                                    {channel === 'email' ? 'Email Content' : 'Message'}
                                    <span className="text-destructive"> *</span>
                                </Label>

                                {/*
                                  An EMAIL body is html, so it gets the admin
                                  panel's rich editor. WhatsApp is plain text and
                                  gets a plain field — see the file header.
                                */}
                                {isHtml ? (
                                    <RichTextEditor
                                        ref={editorRef}
                                        value={body}
                                        onChange={setBody}
                                        variant="compact"
                                        invalid={errors.body}
                                        placeholder="Hi {first_name}, you are invited to {event_name}…"
                                        customButtons={<MergeFieldMenu fields={composer.merge_fields} onPick={insertAtCursor} />}
                                    />
                                ) : (
                                    <div className="min-w-0 overflow-hidden rounded-lg border">
                                        <div className="flex min-w-0 flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
                                            <MergeFieldMenu fields={composer.merge_fields} onPick={insertAtCursor} />

                                            <Separator orientation="vertical" className="mx-0.5 !h-4" />
                                            {/*
                                              WhatsApp's OWN markers, not html. These
                                              are what it actually renders.
                                            */}
                                            {WRAPS.map((w) => (
                                                <Button
                                                    key={w.key}
                                                    size="icon"
                                                    variant="ghost"
                                                    className="size-7"
                                                    title={`${w.label} — WhatsApp renders ${w.mark}text${w.mark}`}
                                                    onClick={() => wrapSelection(w.mark)}
                                                >
                                                    <w.icon className="size-3.5" />
                                                </Button>
                                            ))}

                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="ms-auto h-7 gap-1 text-[11.5px]"
                                                title="Insert the guest's first name"
                                                onClick={() => insertAtCursor('{first_name}')}
                                            >
                                                <Sparkles className="size-3.5" /> Personalize
                                            </Button>
                                        </div>

                                        <Textarea
                                            ref={bodyRef}
                                            value={body}
                                            onChange={(e) => setBody(e.target.value)}
                                            rows={12}
                                            placeholder={'Hi {first_name},\n\nYou are invited to {event_name} on {event_date}.'}
                                            className="rounded-none border-0 text-[12.5px] shadow-none focus-visible:ring-0"
                                            aria-invalid={errors.body || undefined}
                                        />
                                    </div>
                                )}

                                <p className="flex items-start gap-1.5 text-[11px] break-words text-muted-foreground">
                                    <Info className="mt-0.5 size-3 shrink-0" />
                                    Merge fields personalise each message. An unknown one is left as you
                                    typed it rather than deleted, so a mistake stays visible.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── 4 · Review ───────────────────────────────────────── */}
                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-4 p-5">
                            <StepHeading n={4} label="Review & Send" />

                            <div className="grid min-w-0 gap-5 sm:grid-cols-3 sm:divide-x sm:divide-border">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10">
                                        <Users className="size-[18px] text-primary" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[11px] text-muted-foreground">Total Recipients</p>
                                        <p className="flex items-baseline gap-1 text-xl leading-tight font-bold tabular-nums">
                                            {previewAudience.isPending
                                                ? <Loader2 className="size-4 animate-spin" />
                                                : recipients.toLocaleString('en-IN')}
                                            <span className="text-[11px] font-normal text-muted-foreground">
                                                {recipients === 1 ? 'message' : 'messages'}
                                            </span>
                                        </p>
                                        {/*
                                          ⚠ The Guests screen counts HEADS — it sums
                                          party_size, so a guest bringing three is
                                          three. A send is one message per guest ROW.
                                          The two numbers are never equal, and both
                                          are right, so the difference is stated here
                                          rather than left to be discovered.
                                        */}
                                        {resolved?.counts && resolved.counts.heads !== resolved.counts.selected_guests ? (
                                            <p className="mt-0.5 text-[11px] break-words text-muted-foreground">
                                                One per guest · {resolved.counts.heads} people expected
                                            </p>
                                        ) : null}
                                    </div>
                                </div>

                                {/*
                                  The arithmetic, spelled out. A recipient count
                                  smaller than the guest list looks like a bug
                                  unless the gap is named — and it always is
                                  smaller, for two different reasons at once.
                                */}
                                <div className="min-w-0 sm:ps-5">
                                    <p className="text-[11px] text-muted-foreground">Not included</p>
                                    <p className="text-[15px] font-semibold tabular-nums">
                                        {(resolved?.counts?.excluded_declined ?? 0)
                                            + (resolved?.unreachable.count ?? 0)}
                                    </p>
                                    {resolved?.counts ? (
                                        <ul className="mt-0.5 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                                            <li>{resolved.counts.selected_guests} on this event</li>
                                            {resolved.counts.excluded_declined > 0 ? (
                                                <li>− {resolved.counts.excluded_declined} declined</li>
                                            ) : null}
                                            {resolved.counts.unreachable > 0 ? (
                                                <li>
                                                    − {resolved.counts.unreachable} with no{' '}
                                                    {channel === 'email' ? 'email address' : 'phone number'}
                                                </li>
                                            ) : null}
                                        </ul>
                                    ) : (
                                        <p className="mt-0.5 text-[11px] break-words text-muted-foreground">
                                            Everyone selected can be reached.
                                        </p>
                                    )}
                                </div>

                                {/*
                                  Where the design puts "Message Cost · 0 Credits".
                                  There is no credit ledger in this system — no
                                  table, no balance, no price per message — so this
                                  reports the real constraint instead of a number
                                  that means nothing.
                                */}
                                <div className="min-w-0 sm:ps-5">
                                    <p className="text-[11px] text-muted-foreground">Delivery</p>
                                    <p className={`text-[15px] font-semibold ${
                                        channelState?.enabled ? 'text-emerald-600 dark:text-emerald-400' : ''
                                    }`}>
                                        {channelState?.enabled ? 'Will be sent' : 'Recorded only'}
                                    </p>
                                    <p className="mt-0.5 text-[11px] break-words text-muted-foreground">
                                        {channelState?.enabled
                                            ? `Through your ${channelState.label} provider.`
                                            : 'No provider is connected, so nothing leaves this system yet.'}
                                    </p>
                                </div>
                            </div>

                            <Separator />

                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <Button variant="outline" asChild>
                                    <Link href={wsHref("/dashboard/messages")}>Cancel</Link>
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={sendTest.isPending || !eventId}
                                    onClick={() => sendTest.mutate({
                                        event_id: eventId!, channel, subject, body,
                                    })}
                                >
                                    {sendTest.isPending
                                        ? <Loader2 className="size-3.5 animate-spin" />
                                        : <Send className="size-3.5" />}
                                    Send Test
                                </Button>
                                <Button onClick={submit} disabled={send.isPending}>
                                    {send.isPending
                                        ? <Loader2 className="size-3.5 animate-spin" />
                                        : <Send className="size-3.5" />}
                                    {scheduleOn ? 'Schedule Message' : 'Send Message'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* ── Rail ─────────────────────────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-5">
                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-3.5 p-5">
                            <div className="flex items-center gap-2.5">
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10">
                                    <Mail className="size-4 text-primary" />
                                </span>
                                <span className="text-[13.5px] font-semibold">Message Summary</span>
                            </div>

                            <dl className="flex flex-col gap-3 text-[12.5px]">
                                <SummaryRow icon={MessageCircle} label="Message Type" value={channelState?.label ?? '—'} />
                                <SummaryRow icon={Calendar} label="Event" value={event?.name ?? '—'} />
                                <SummaryRow
                                    icon={Users}
                                    label="Recipients"
                                    value={`${recipients.toLocaleString('en-IN')} ${recipients === 1 ? 'message' : 'messages'}`}
                                />
                                {audience === 'groups' ? (
                                    <SummaryRow
                                        icon={UsersRound}
                                        label="Groups Included"
                                        value={`${groupIds.length} ${groupIds.length === 1 ? 'group' : 'groups'}`}
                                    />
                                ) : null}
                                {/*
                                  The design's "Estimated Cost · 0 Credits" row keeps
                                  its place and says the true thing instead.
                                */}
                                <SummaryRow icon={Wallet} label="Cost" value="Not metered" />
                                <SummaryRow
                                    icon={CheckCheck}
                                    label="Delivery"
                                    value={channelState?.enabled ? 'Enabled' : 'Not enabled'}
                                    tone={channelState?.enabled ? 'good' : undefined}
                                />
                            </dl>

                            {resolved && resolved.breakdown.length > 1 ? (
                                <>
                                    <Separator />
                                    <span className="text-[12px] font-semibold">Recipient Breakdown</span>
                                    <dl className="flex flex-col gap-2 text-[12px]">
                                        {resolved.breakdown.map((b) => (
                                            <div key={b.name} className="flex items-start justify-between gap-3">
                                                <dt className="min-w-0 break-words text-muted-foreground">{b.name}</dt>
                                                <dd className="shrink-0 tabular-nums">
                                                    {b.count}
                                                    <span className="ms-1 text-muted-foreground">({b.percent}%)</span>
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="py-0">
                        <CardContent className="flex flex-col gap-3 p-5">
                            <span className="text-[13.5px] font-semibold">
                                {channel === 'email' ? 'Email Preview' : 'Message Preview'}
                            </span>
                            {/*
                              Rendered in the browser so it follows every keystroke.
                              The SERVER renders the copy that actually goes out —
                              see renderPreview()'s own note about the two.
                            */}
                            {channel === 'whatsapp' ? (
                                <div className="min-w-0 rounded-lg bg-muted/50 p-3">
                                    <div className="ms-auto min-w-0 max-w-[92%] rounded-xl rounded-br-sm bg-emerald-500/15 px-3 py-2">
                                        {!bodyEmpty ? (
                                            <p className="text-[12px] break-words whitespace-pre-wrap">
                                                {renderPreview(body, mergeValues)}
                                            </p>
                                        ) : (
                                            <p className="text-[12px] text-muted-foreground">
                                                Your message will appear here as you type it.
                                            </p>
                                        )}
                                        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                                            {nowLabel()} <CheckCheck className="size-3" />
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="min-w-0 rounded-lg border bg-muted/30 p-3.5 text-[12px]">
                                    {subject ? (
                                        <p className="mb-2 font-semibold break-words">
                                            {renderPreview(subject, mergeValues)}
                                        </p>
                                    ) : null}
                                    {preheader ? (
                                        <p className="mb-2 text-[11px] break-words text-muted-foreground">
                                            {renderPreview(preheader, mergeValues)}
                                        </p>
                                    ) : null}
                                    {/*
                                      Html, so it is INJECTED rather than printed —
                                      escaping it would show the client their own
                                      markup. It is their own editor's output, going
                                      back to their own screen.
                                    */}
                                    {!bodyEmpty ? (
                                        <div
                                            className="rich-html break-words"
                                            dangerouslySetInnerHTML={{ __html: renderPreview(body, mergeValues) }}
                                        />
                                    ) : (
                                        <p className="text-muted-foreground">
                                            Your message will appear here as you type it.
                                        </p>
                                    )}
                                </div>
                            )}
                            {resolved?.preview.rendered_for ? (
                                <p className="text-[11px] break-words text-muted-foreground">
                                    Shown as {resolved.preview.rendered_for.name} would receive it.
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="border-amber-500/30 bg-amber-500/5 py-0">
                        <CardContent className="flex min-w-0 flex-col gap-2.5 p-5">
                            <div className="flex items-center gap-2.5">
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/20">
                                    <Lightbulb className="size-4 text-amber-600 dark:text-amber-400" />
                                </span>
                                <p className="text-[12.5px] font-semibold">Pro tip</p>
                            </div>
                            <p className="text-[11.5px] break-words text-muted-foreground">
                                Personalise with merge fields — a guest&rsquo;s own name reads as an
                                invitation rather than an announcement.
                            </p>
                            {/*
                              Opens the same picker the composer uses, rather than
                              linking to a docs page that does not exist.
                            */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="inline-flex w-fit items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline">
                                        View all merge fields <ArrowRight className="size-3" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                                    {composer.merge_fields.map((f) => (
                                        <DropdownMenuItem key={f.token} onClick={() => insertAtCursor(`{${f.token}}`)}>
                                            <span className="flex min-w-0 flex-col">
                                                <span className="text-[12px]">{f.label}</span>
                                                <span className="text-[10.5px] text-muted-foreground">
                                                    {'{'}{f.token}{'}'} → {f.example}
                                                </span>
                                            </span>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

/**
 * The merge-field picker.
 *
 * One component, mounted into the rich editor's toolbar slot and into the plain
 * field's own bar — so the two composers cannot drift into offering different
 * tokens. The list is served by the API, because a token the renderer does not
 * know is how a message goes out with a literal "{table_no}" in it.
 */
function MergeFieldMenu({ fields, onPick }: {
    fields: { token: string; label: string; example: string }[];
    onPick: (text: string) => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-[11.5px]">
                    Merge Fields <ChevronDown className="size-3" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                {fields.map((f) => (
                    <DropdownMenuItem key={f.token} onClick={() => onPick(`{${f.token}}`)}>
                        <span className="flex min-w-0 flex-col">
                            <span className="text-[12px]">{f.label}</span>
                            <span className="text-[10.5px] text-muted-foreground">
                                {'{'}{f.token}{'}'} → {f.example}
                            </span>
                        </span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function StepHeading({ n, label }: { n: number; label: string }) {
    return (
        <div className="flex items-center gap-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {n}
            </span>
            <span className="text-[13.5px] font-semibold">{label}</span>
        </div>
    );
}

function Field({ label, required, error, hint, children }: {
    label: string; required?: boolean; error?: boolean; hint?: string; children: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-[12px]">
                {label}{required ? <span className="text-destructive"> *</span> : null}
            </Label>
            {children}
            {error ? (
                <span className="text-[11px] text-destructive">This is required.</span>
            ) : hint ? (
                <span className="text-[11px] break-words text-muted-foreground">{hint}</span>
            ) : null}
        </div>
    );
}

function ToggleRow({ icon: Icon, label, hint, checked, onChange }: {
    icon: React.ElementType; label: string; hint: string;
    checked: boolean; onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted">
                <Icon className="size-3.5 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium">{label}</p>
                <p className="mt-0.5 text-[11px] leading-snug break-words text-muted-foreground">{hint}</p>
            </div>
            {/* onCheckedChange, never onClick — this Switch spreads {...props}
                after its own handler, so an onClick would be swallowed. */}
            <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
        </div>
    );
}

function SummaryRow({ icon: Icon, label, value, tone }: {
    icon: React.ElementType; label: string; value: string; tone?: 'good';
}) {
    return (
        <div className="flex min-w-0 items-start justify-between gap-3">
            <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <Icon className="size-3.5 shrink-0" />
                <span className="min-w-0 break-words">{label}</span>
            </dt>
            <dd className={`min-w-0 text-end font-medium break-words ${
                tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : ''
            }`}>
                {value}
            </dd>
        </div>
    );
}

function GroupPicker({ groups, selected, onChange, error }: {
    groups: { id: number; name: string; guest_count: number }[];
    selected: number[];
    onChange: (v: number[]) => void;
    error?: boolean;
}) {
    const toggle = (id: number) =>
        onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-[12px]">
                    Selected Groups ({selected.length}) <span className="text-destructive">*</span>
                </Label>
                {selected.length ? (
                    <button type="button" onClick={() => onChange([])}
                        className="text-[11.5px] font-medium text-destructive hover:underline">
                        Clear All
                    </button>
                ) : null}
            </div>
            {groups.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[11.5px] text-muted-foreground">
                    You have no guest groups yet.
                </p>
            ) : groups.every((g) => g.guest_count === 0) ? (
                /*
                  The groups exist but nobody in them is on THIS event — which is
                  a different problem from having no groups, and the one a person
                  actually hits after switching events.
                */
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[11.5px] break-words text-muted-foreground">
                    None of your groups has a guest on this event yet.
                </p>
            ) : (
                <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                    {groups.map((g) => {
                        const on = selected.includes(g.id);
                        return (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => toggle(g.id)}
                                className={`flex min-w-0 items-center gap-2.5 rounded-lg border p-2.5 text-start transition-colors ${
                                    on ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted'
                                }`}
                            >
                                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10">
                                    <UsersRound className="size-3.5 text-primary" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[12px] font-medium break-words">{g.name}</span>
                                    <span className="text-[10.5px] text-muted-foreground">
                                        {g.guest_count} guest{g.guest_count === 1 ? '' : 's'}
                                    </span>
                                </span>
                                {on ? <X className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                            </button>
                        );
                    })}
                </div>
            )}
            {error ? <span className="text-[11px] text-destructive">Choose at least one group.</span> : null}
        </div>
    );
}

function GuestPicker({ eventId, selected, onChange, error }: {
    eventId: number;
    selected: number[];
    onChange: (v: number[]) => void;
    error?: boolean;
}) {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setDebounced(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    // An event's participants — the phone book has no event (§581).
    const { data } = useParticipants({ event_id: eventId, search: debounced, limit: 25 });
    const guests = data?.data ?? [];

    const toggle = (id: number) =>
        onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-[12px]">
                    Selected Guests ({selected.length}) <span className="text-destructive">*</span>
                </Label>
                {selected.length ? (
                    <button type="button" onClick={() => onChange([])}
                        className="text-[11.5px] font-medium text-destructive hover:underline">
                        Clear
                    </button>
                ) : null}
            </div>
            <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search guests…"
                className="h-9 text-[12px]"
            />
            <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                {guests.map((g) => {
                    const on = selected.includes(g.id);
                    return (
                        <button
                            key={g.id}
                            type="button"
                            onClick={() => toggle(g.id)}
                            className={`flex min-w-0 items-center gap-2.5 rounded-lg border p-2.5 text-start transition-colors ${
                                on ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted'
                            }`}
                        >
                            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted">
                                <User className="size-3.5 text-muted-foreground" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[12px] font-medium break-words">{g.name}</span>
                                <span className="block text-[10.5px] break-all text-muted-foreground">
                                    {g.email || g.mobile || 'No contact details'}
                                </span>
                            </span>
                            {on ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                        </button>
                    );
                })}
                {guests.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[11.5px] break-words text-muted-foreground">
                        {/* "No guests match" is wrong when nothing was searched
                            for — the list is empty because the EVENT is. */}
                        {debounced
                            ? 'No guests match that search.'
                            : 'This event has no guests yet. Add some, or choose another event.'}
                    </p>
                ) : null}
            </div>
            {error ? <span className="text-[11px] text-destructive">Choose at least one guest.</span> : null}
        </div>
    );
}

/* ── Dates ───────────────────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * From the PARTS. Never `new Date(value)` on a bare date — that parses as UTC
 * and renders the previous day for anyone behind it, which on an invitation is
 * the wrong date for the wedding.
 */
function formatDate(value: string) {
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function formatTime(value: string) {
    const m = String(value).match(/^(\d{2}):(\d{2})/);
    if (!m) return '';
    const h = Number(m[1]);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(h12).padStart(2, '0')}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** The chat bubble's timestamp. Cosmetic — it is a preview, not a sent message. */
function nowLabel() {
    const d = new Date();
    const h = d.getHours();
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function ComposerSkeleton() {
    return (
        <div className="flex flex-col gap-5 p-4 md:p-6">
            <Skeleton className="h-9 w-52" />
            <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
                <Skeleton className="h-96 rounded-xl" />
                <Skeleton className="h-96 rounded-xl" />
                <Skeleton className="h-96 rounded-xl" />
            </div>
        </div>
    );
}
