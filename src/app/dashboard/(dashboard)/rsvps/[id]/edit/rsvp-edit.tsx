'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    ArrowLeft, Loader2, Minus, Plus, Info, Calendar, MapPin, Lock,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

import {
    useRsvp, useUpdateRsvp, RESPONSE_OPTIONS,
    BUCKET_LABEL, BUCKET_STYLE, formatDate, formatTime,
    type ResponseType, type RsvpDetail,
} from '@/hooks/use-rsvps';
import { useDateFormatter } from '@/hooks/use-client-settings';

/**
 * Edit RSVP Response.
 *
 * ── ⚠ THIS FORM EDITS THE RESPONSE, NOT THE GUEST ───────────────────────────
 * Name, email and phone are shown READ-ONLY and link to the Guests form. They
 * belong to the guest; letting two screens write the same columns under two
 * sets of validation is how a mobile number ends up valid on one and rejected
 * on the other. The server refuses them here regardless — this is the screen
 * agreeing with the API rather than testing it.
 *
 * ── THE STATUS IS THE RESPONSE ──────────────────────────────────────────────
 * Only `response_type` is sent. `rsvp_status` is derived server-side, so a row
 * can never say "accepted" and "no" at once.
 *
 * ── WHAT THE DESIGN ASKS FOR THAT HAS NO COLUMN ─────────────────────────────
 * **Accommodation Required** — no column exists.
 * **Custom Questions** — `custom_answers` is JSON, but nothing defines what the
 * questions ARE, so there is no form to render. The View screen prints whatever
 * keys are stored.
 * **"Send update notification to the guest"** — email is not connected, so a
 * checkbox promising one would be a promise nothing keeps. Use Send Reminder,
 * which reports the real delivery state.
 */
export default function RsvpEditScreen({ rsvpId }: { rsvpId: number }) {
    const { data, isLoading, isError, refetch } = useRsvp(rsvpId);

    /*
      Bumped by Reset. It is the form's `key`, so Reset re-reads the SERVER and
      then remounts the form against what came back — never a local revert to
      a stale snapshot, which is the bug the profile form's Reset once had.
    */
    const [nonce, setNonce] = useState(0);
    const [resetting, setResetting] = useState(false);

    async function resetForm() {
        setResetting(true);
        try {
            await refetch();
        } finally {
            setResetting(false);
            setNonce((n) => n + 1);
        }
    }

    if (isLoading) {
        return (
            <div className="flex flex-col gap-5 p-4 md:p-6">
                <Skeleton className="h-8 w-52" />
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }

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

    return (
        <EditForm
            key={`${rsvpId}-${nonce}`}
            rsvpId={rsvpId}
            data={data}
            resetting={resetting}
            onReset={resetForm}
        />
    );
}

/**
 * The form itself.
 *
 * ⚠ State is seeded from PROPS in the `useState` initialisers, and the parent
 * gives this component a `key` — so it is populated exactly once per mount and
 * a background refetch can never overwrite what somebody has typed. That is why
 * there is no effect here: seeding in an effect paints the empty form first and
 * then swaps it, and `setState` in an effect body is a cascading second render.
 */
function EditForm({ rsvpId, data, resetting, onReset }: {
    rsvpId: number;
    data: RsvpDetail;
    resetting: boolean;
    onReset: () => void;
}) {
    const router = useRouter();
    const fmt = useDateFormatter();
    const update = useUpdateRsvp(() => router.push(`/dashboard/rsvps/${rsvpId}`));

    const r = data.rsvp;
    const g = r.guest;

    const [response, setResponse] = useState<ResponseType>(r.response_type);
    const [partySize, setPartySize] = useState(r.party_size);
    const [meal, setMeal] = useState(r.dietary_preference ?? '');
    const [requirements, setRequirements] = useState(r.special_requirements ?? '');
    const [notes, setNotes] = useState(r.notes ?? '');

    function submit() {
        if (update.isPending) return;
        if (partySize < 1 || partySize > 50) {
            toast.error('Number of guests must be between 1 and 50.');
            return;
        }
        update.mutate({
            id: rsvpId,
            response_type: response,
            party_size: partySize,
            dietary_preference: meal.trim() || null,
            special_requirements: requirements.trim() || null,
            notes: notes.trim() || null,
        });
    }

    return (
        <div className="flex min-w-0 flex-col gap-5 p-4 md:p-6">
            <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit text-muted-foreground">
                <Link href={`/dashboard/rsvps/${rsvpId}`}>
                    <ArrowLeft className="size-3.5" /> Back to RSVP
                </Link>
            </Button>

            <div className="flex min-w-0 flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Edit RSVP Response</h1>
                <p className="text-sm break-words text-muted-foreground">
                    Update the RSVP details for this guest.
                </p>
            </div>

            {/* ── Who and what ─────────────────────────────────────────────── */}
            <Card className="py-0">
                <CardContent className="grid min-w-0 gap-5 p-5 sm:grid-cols-3">
                    <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">Guest</p>
                        <p className="mt-1 text-[13px] font-semibold break-words">{g.name}</p>
                        {g.email ? (
                            <p className="text-[11.5px] break-all text-muted-foreground">{g.email}</p>
                        ) : null}
                        {g.mobile ? (
                            <p className="text-[11.5px] text-muted-foreground">
                                {g.dial_code} {g.mobile}
                            </p>
                        ) : null}
                    </div>

                    <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">Event</p>
                        <p className="mt-1 text-[13px] font-semibold break-words">
                            {r.event?.name ?? '—'}
                        </p>
                        {r.event?.start_date ? (
                            <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                                <Calendar className="size-3 shrink-0" />
                                {formatDate(r.event.start_date)}
                                {r.event.start_time ? `, ${formatTime(r.event.start_time)}` : ''}
                            </p>
                        ) : null}
                        {r.event?.venue_name ? (
                            <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] break-words text-muted-foreground">
                                <MapPin className="size-3 shrink-0" /> {r.event.venue_name}
                            </p>
                        ) : null}
                    </div>

                    <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">Current status</p>
                        <Badge variant="ghost" className={`mt-1 ${BUCKET_STYLE[r.bucket]}`}>
                            {BUCKET_LABEL[r.bucket]}
                        </Badge>
                        <p className="mt-1 text-[11px] break-words text-muted-foreground">
                            {r.responded_at
                                ? `Responded ${fmt(r.responded_at, true)}`
                                : 'No response yet'}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* ── The form ─────────────────────────────────────────────────── */}
            <Card className="py-0">
                <CardContent className="flex min-w-0 flex-col gap-5 p-5">
                    <span className="text-[13.5px] font-semibold">RSVP Details</span>

                    {/*
                      Read-only, and it says where to change them. The API refuses
                      these fields; this is the screen agreeing with it rather
                      than a second copy of the rule that can drift.
                    */}
                    <div className="grid min-w-0 gap-4 sm:grid-cols-3">
                        <ReadOnly label="Guest name" value={g.name} />
                        <ReadOnly label="Email" value={g.email} breakAll />
                        <ReadOnly label="Mobile number" value={g.mobile ? `${g.dial_code ?? ''} ${g.mobile}`.trim() : null} />
                    </div>
                    <p className="flex min-w-0 items-start gap-2 text-[11px] break-words text-muted-foreground">
                        <Lock className="mt-0.5 size-3 shrink-0" />
                        {r.phone_book_guest_id ? (
                            <>
                                Contact details belong to the guest, not to this response.{' '}
                                <Link href={`/dashboard/guests/${r.phone_book_guest_id}`} className="font-medium text-primary hover:underline">
                                    Edit them on the guest
                                </Link>
                                .
                            </>
                        ) : (
                            'Contact details are the ones this person entered when they joined — they are not in your guest list.'
                        )}
                    </p>

                    <Separator />

                    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label className="text-[12px]">
                                RSVP status <span className="text-destructive">*</span>
                            </Label>
                            {/*
                              Only the RESPONSE is sent. The stored status is
                              derived server-side, so these four are the whole
                              vocabulary and the row cannot contradict itself.
                            */}
                            <div className="grid grid-cols-2 gap-2">
                                {RESPONSE_OPTIONS.map((o) => {
                                    const on = response === o.value;
                                    return (
                                        <button
                                            key={o.value}
                                            type="button"
                                            onClick={() => setResponse(o.value)}
                                            className={`flex min-w-0 items-center gap-2 rounded-lg border p-2.5 text-start text-[12.5px] transition-colors ${
                                                on ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted'
                                            }`}
                                        >
                                            <span className={`grid size-[15px] shrink-0 place-items-center rounded-full border-[1.5px] ${
                                                on ? 'border-primary' : 'border-muted-foreground/40'
                                            }`}>
                                                {on ? <span className="size-[7px] rounded-full bg-primary" /> : null}
                                            </span>
                                            <span className="min-w-0 break-words">{o.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            {response === 'none' ? (
                                <p className="text-[11px] break-words text-muted-foreground">
                                    Setting this back to No Response clears the date they replied.
                                </p>
                            ) : null}
                        </div>

                        <div className="flex min-w-0 flex-col gap-4">
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <Label className="text-[12px]">
                                    Number of guests <span className="text-destructive">*</span>
                                </Label>
                                <div className="flex w-fit items-center rounded-lg border">
                                    <Button
                                        type="button" size="icon" variant="ghost" className="size-9 rounded-e-none"
                                        disabled={partySize <= 1}
                                        onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                                        aria-label="One fewer"
                                    >
                                        <Minus className="size-3.5" />
                                    </Button>
                                    <Input
                                        value={partySize}
                                        onChange={(e) => {
                                            // Digits only, and capped where the
                                            // server caps it — a value the API
                                            // will reject should not be typeable.
                                            const n = Number(e.target.value.replace(/\D/g, ''));
                                            setPartySize(Math.min(50, Math.max(1, n || 1)));
                                        }}
                                        inputMode="numeric"
                                        className="h-9 w-16 rounded-none border-0 text-center text-[12.5px] shadow-none focus-visible:ring-0"
                                    />
                                    <Button
                                        type="button" size="icon" variant="ghost" className="size-9 rounded-s-none"
                                        disabled={partySize >= 50}
                                        onClick={() => setPartySize((n) => Math.min(50, n + 1))}
                                        aria-label="One more"
                                    >
                                        <Plus className="size-3.5" />
                                    </Button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">Including the guest.</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label htmlFor="meal" className="text-[12px]">Meal preference</Label>
                            {/*
                              Free text, not a Select. There is no list of meal
                              options anywhere in this schema, and a dropdown of
                              three invented ones would silently exclude a fourth
                              a guest actually asked for.
                            */}
                            <Input
                                id="meal"
                                value={meal}
                                onChange={(e) => setMeal(e.target.value)}
                                placeholder="Vegetarian, Jain, no nuts…"
                            />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <Label htmlFor="requirements" className="text-[12px]">Special requirements</Label>
                            <Input
                                id="requirements"
                                value={requirements}
                                onChange={(e) => setRequirements(e.target.value)}
                                placeholder="Wheelchair access, seating…"
                            />
                        </div>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label htmlFor="notes" className="text-[12px]">Response note</Label>
                        <Textarea
                            id="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                            rows={4}
                            placeholder="Anything the guest said with their reply."
                            className="text-[12.5px]"
                        />
                        <p className="text-end text-[11px] text-muted-foreground">{notes.length}/500</p>
                    </div>

                    {/*
                      Where the design puts "Send update notification to the
                      guest". Email is not connected, so a checkbox promising one
                      would be a promise nothing keeps — the reminder path
                      reports the real delivery state instead.
                    */}
                    <p className="flex min-w-0 items-start gap-2 rounded-lg border bg-muted/40 px-3.5 py-2.5 text-[11px] break-words text-muted-foreground">
                        <Info className="mt-0.5 size-3.5 shrink-0" />
                        Saving does not notify the guest. To tell them, use{' '}
                        <Link
                            href={`/dashboard/messages/send?event_id=${r.event?.id ?? ''}&guest_id=${r.id}&kind=reminder&from=rsvps`}
                            className="font-medium text-primary hover:underline"
                        >
                            Send reminder
                        </Link>
                        , which says whether it can actually be delivered.
                    </p>

                    <Separator />

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button variant="ghost" onClick={onReset} disabled={update.isPending || resetting}>
                            {resetting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Reset
                        </Button>
                        <Button asChild variant="outline">
                            <Link href={`/dashboard/rsvps/${rsvpId}`}>Cancel</Link>
                        </Button>
                        <Button onClick={submit} disabled={update.isPending}>
                            {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Save changes
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function ReadOnly({ label, value, breakAll }: {
    label: string; value: string | null | undefined; breakAll?: boolean;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-[12px] text-muted-foreground">{label}</Label>
            <div className={`min-w-0 rounded-lg border bg-muted/40 px-3 py-2 text-[12.5px] ${
                breakAll ? 'break-all' : 'break-words'
            } ${value ? '' : 'text-muted-foreground'}`}>
                {value || '—'}
            </div>
        </div>
    );
}
