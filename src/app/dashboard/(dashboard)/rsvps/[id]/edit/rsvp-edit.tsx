'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Minus, Plus, Calendar } from 'lucide-react';
import type { CountryCode } from 'libphonenumber-js';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

import {
    useRsvp, useUpdateRsvp,
    BUCKET_LABEL, BUCKET_STYLE, formatDate, formatTime,
    type RsvpDetail,
} from '@/hooks/use-rsvps';
import { PhoneInput } from '@/components/common/phone-input';
import { countryForDial, dialOf, mobileNumberError, nationalMobile } from '@/lib/phone';
import { useDateFormatter } from '@/hooks/use-client-settings';
import { useEventHref } from "@/lib/event-workspace";

/**
 * Edit RSVP Response — the same fields and required fields as the app's Edit
 * Response (Jamal, 2026-11-02). The phone is editable as in the app; the
 * server checks it by country and refuses a number another participant of the
 * event already has (clientRsvp.service update).
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
    const wsHref = useEventHref();
    const { data, isLoading, isError } = useRsvp(rsvpId);

    if (isLoading) {
        return (
            <div className="flex flex-col gap-3">
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
                    <Link href={wsHref("/dashboard/rsvps")}>Back to RSVPs</Link>
                </Button>
            </div>
        );
    }

    return (
        <EditForm key={rsvpId} rsvpId={rsvpId} data={data} />
    );
}

/**
 * The form — the app's Edit Response, field for field (Jamal, 2026-11-02):
 * Response Status * (Attending / Not Attending / Maybe), Number of Guests (not
 * for Not Attending), Special Requests, Participant Name (read-only), Phone
 * Number * (country code + the app's per-country check) and Internal Note.
 *
 * ⚠ State is seeded from PROPS in the `useState` initialisers, and the parent
 * gives this component a `key` — so it is populated exactly once per mount and
 * a background refetch can never overwrite what somebody has typed.
 */
const ANSWERS: { value: 'yes' | 'no' | 'maybe'; label: string }[] = [
    { value: 'yes', label: 'Attending' },
    { value: 'no', label: 'Not Attending' },
    { value: 'maybe', label: 'Maybe' },
];

function EditForm({ rsvpId, data }: {
    rsvpId: number;
    data: RsvpDetail;
}) {
    const wsHref = useEventHref();
    const router = useRouter();
    const fmt = useDateFormatter();
    const update = useUpdateRsvp(() => router.push(wsHref(`/dashboard/rsvps/${rsvpId}`)));

    const r = data.rsvp;
    const g = r.guest;

    const [answer, setAnswer] = useState<'yes' | 'no' | 'maybe' | null>(
        r.response_type === 'yes' || r.response_type === 'no' || r.response_type === 'maybe' ? r.response_type : null,
    );
    const [guests, setGuests] = useState(Math.min(50, Math.max(1, r.party_size || 1)));
    const [requests, setRequests] = useState(r.special_requirements ?? '');
    const [note, setNote] = useState(r.notes ?? '');
    const [country, setCountry] = useState<CountryCode>(countryForDial(g.dial_code || '+91'));
    const [phone, setPhone] = useState(() => {
        const stored = (g.mobile ?? '').replace(/[\s-]/g, '');
        const dial = g.dial_code || '+91';
        return stored.startsWith(dial) ? stored.slice(dial.length) : stored.replace(/^\+/, '');
    });
    const [submitted, setSubmitted] = useState(false);

    const phoneError = !phone.trim() ? 'This field is required.' : mobileNumberError(country, phone);

    function submit() {
        if (update.isPending) return;
        setSubmitted(true);
        if (!answer) {
            toast.error('Please select an RSVP response.');
            return;
        }
        if (phoneError) {
            toast.error('Please enter a valid mobile number.');
            return;
        }
        update.mutate({
            id: rsvpId,
            response_type: answer,
            party_size: answer === 'no' ? 1 : guests,
            special_requirements: requests.trim() || null,
            notes: note.trim() || null,
            dial_code: dialOf(country),
            mobile: nationalMobile(country, phone),
        });
    }

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="min-w-0">
                    <h1 className="text-[20px] font-bold leading-tight tracking-tight">Edit RSVP Response</h1>
                    <p className="text-[12.5px] break-words text-muted-foreground">Update the RSVP details for this participant.</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
                    <Link href={wsHref(`/dashboard/rsvps/${rsvpId}`)}>
                        <ArrowLeft className="size-3.5" /> Back
                    </Link>
                </Button>
            </div>

            <Card className="py-0">
                <CardContent className="flex min-w-0 flex-col gap-3 p-4">
                    {/* The person, the event and where the answer stands. */}
                    <div className="grid min-w-0 gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
                        <div className="min-w-0">
                            <p className="text-[11px] text-muted-foreground">Participant</p>
                            <p className="text-[13px] font-semibold break-words">{g.name}</p>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] text-muted-foreground">Event</p>
                            <p className="text-[13px] font-semibold break-words">{r.event?.name ?? '—'}</p>
                            {r.event?.start_date ? (
                                <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                                    <Calendar className="size-3 shrink-0" />
                                    {formatDate(r.event.start_date)}
                                    {r.event.start_time ? `, ${formatTime(r.event.start_time)}` : ''}
                                </p>
                            ) : null}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] text-muted-foreground">Current status</p>
                            <Badge variant="ghost" className={`mt-0.5 ${BUCKET_STYLE[r.bucket]}`}>{BUCKET_LABEL[r.bucket]}</Badge>
                            <p className="text-[11px] break-words text-muted-foreground">
                                {r.responded_at ? `Responded ${fmt(r.responded_at, true)}` : 'No response yet'}
                            </p>
                        </div>
                    </div>

                    <div className="grid min-w-0 gap-3 md:grid-cols-2">
                        <FieldBox label="Response Status" required error={submitted && !answer ? 'This field is required.' : null}>
                            <div className="grid grid-cols-3 gap-2">
                                {ANSWERS.map((o) => {
                                    const on = answer === o.value;
                                    return (
                                        <button
                                            key={o.value}
                                            type="button"
                                            onClick={() => setAnswer(o.value)}
                                            className={`flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border px-2 text-[12.5px] transition-colors ${
                                                on ? 'border-primary bg-primary/5 font-semibold text-primary' : 'hover:bg-muted'
                                            }`}
                                        >
                                            <span className={`grid size-[14px] shrink-0 place-items-center rounded-full border-[1.5px] ${
                                                on ? 'border-primary' : 'border-muted-foreground/40'
                                            }`}>
                                                {on ? <span className="size-[6px] rounded-full bg-primary" /> : null}
                                            </span>
                                            <span className="min-w-0 truncate">{o.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </FieldBox>

                        {/* A head count only means something for somebody coming. */}
                        {answer !== 'no' ? (
                            <FieldBox label="Number of Guests">
                                <div className="flex items-center gap-3">
                                    <div className="flex w-fit items-center rounded-md border">
                                        <Button
                                            type="button" size="icon" variant="ghost" className="size-10 rounded-e-none"
                                            disabled={guests <= 1}
                                            onClick={() => setGuests((n) => Math.max(1, n - 1))}
                                            aria-label="One fewer"
                                        >
                                            <Minus className="size-3.5" />
                                        </Button>
                                        <span className="w-12 text-center text-[13px] font-semibold tabular-nums">{guests}</span>
                                        <Button
                                            type="button" size="icon" variant="ghost" className="size-10 rounded-s-none"
                                            disabled={guests >= 50}
                                            onClick={() => setGuests((n) => Math.min(50, n + 1))}
                                            aria-label="One more"
                                        >
                                            <Plus className="size-3.5" />
                                        </Button>
                                    </div>
                                    <span className="text-[11.5px] text-muted-foreground">Including the participant</span>
                                </div>
                            </FieldBox>
                        ) : <div className="hidden md:block" />}

                        <FieldBox label="Participant Name">
                            <Input value={g.name} disabled className="h-10 rounded-md" />
                        </FieldBox>

                        <FieldBox label="Phone Number" required error={submitted ? phoneError : null}>
                            <PhoneInput
                                country={country}
                                number={phone}
                                onChange={(iso, num) => { setCountry(iso); setPhone(num); }}
                                placeholder="Enter mobile number"
                                invalid={submitted && !!phoneError}
                            />
                        </FieldBox>

                        <FieldBox label="Special Requests">
                            <Textarea
                                value={requests}
                                onChange={(e) => setRequests(e.target.value.slice(0, 500))}
                                rows={3}
                                placeholder="e.g. Dietary preferences, special needs…"
                                className="min-h-[72px] text-[12.5px]"
                            />
                        </FieldBox>

                        <FieldBox label="Internal Note">
                            <Textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                                rows={3}
                                placeholder="Only you can see this note"
                                className="min-h-[72px] text-[12.5px]"
                            />
                        </FieldBox>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                        <Button asChild variant="outline" className="h-10">
                            <Link href={wsHref(`/dashboard/rsvps/${rsvpId}`)}>Cancel</Link>
                        </Button>
                        <Button onClick={submit} disabled={update.isPending} className="h-10 px-6">
                            {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Update
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function FieldBox({ label, required, error, children }: {
    label: string; required?: boolean; error?: string | null; children: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-[12.5px] font-medium">
                {label} {required ? <span className="text-destructive">*</span> : null}
            </Label>
            {children}
            {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
        </div>
    );
}
