"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useEventOptions } from "@/hooks/use-client-portal";
import { useBooking, useBookings } from "@/hooks/use-bookings";
import { EventWizard } from "./event-wizard";

/**
 * Stops the create wizard opening at all once the plan's event limit is reached.
 *
 * The backend refuses the create either way (clientEvent.createEvent), but that
 * answer only arrives after five steps of typing — the limit is knowable before
 * the first field, so it is said before the first field.
 *
 * Both numbers come from `/client/event-options`, the call the wizard makes
 * anyway, and `events_used` is counted server-side exactly as the create counts
 * it — DELETED events included. The events list is deliberately not used for
 * the count: it shows live events only, so it would read 4 of 5 while the create
 * was refused.
 *
 * Fail-open: while the numbers are loading or absent (an older backend sends
 * neither) the wizard opens. A reporting gap should not stop somebody creating
 * an event they are entitled to — the backend still has the last word.
 */
/**
 * The plan's event limit, shared by the create wizard (this gate) and the Check Event Availability
 * calendar (which must not offer Book Event / Contact Support to a client who cannot create an event).
 * Fail-open, as described above: `reached` is false while loading or when the backend sends no numbers.
 */
export function useEventLimit() {
    const options = useEventOptions();
    const limit = options.data?.plan?.max_events ?? null;
    const used = options.data?.events_used ?? null;
    return {
        limit,
        used,
        planName: options.data?.plan?.name ?? null,
        reached: !options.isLoading && limit !== null && used !== null && used >= limit,
    };
}

/**
 * Create Event (per-event plans, Jamal 2026-11-19): an event is made from a BOOKED DATE — the date
 * was checked, a plan chosen for it (Free too) and the slot reserved. `?booking=<id>` opens the
 * wizard on that booking (its dates and plan). Without one, the client books a date first; any
 * booked dates still waiting for their event are offered here.
 */
export function EventLimitGate({ initialThemeId, bookingId }: { initialThemeId?: string; bookingId?: number }) {
    const booking = useBooking(bookingId ?? null);
    const waiting = useBookings("reserved");

    if (bookingId) {
        if (booking.isLoading) {
            return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
        }
        const b = booking.data;
        if (b && b.status === "reserved") {
            return <EventWizard initialThemeId={initialThemeId} initialStartDate={b.start_date} initialEndDate={b.end_date ?? b.start_date} booking={b} />;
        }
        return (
            <GateCard
                title={b?.status === "used" ? "This booked date already has an event" : "Booked date not found"}
                text={b?.status === "used" ? "An event has already been created for this booking. Book another date to create a new event." : "We could not find this booking. Check your availability and book a date to create an event."}
                eventId={b?.status === "used" ? b.event_id : null}
            />
        );
    }

    const list = waiting.data ?? [];
    return (
        <GateCard
            title="Book your event date first"
            text="Every event starts with a booked date. Check availability, confirm a plan for the event, then create it."
        >
            {list.length > 0 && (
                <div className="mt-2 w-full max-w-sm text-left">
                    <p className="mb-1.5 text-[12.5px] font-semibold text-foreground">Your booked dates waiting for an event</p>
                    <ul className="divide-y rounded-lg border">
                        {list.map((x) => (
                            <li key={x.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
                                <span><b>{x.start_date}</b> · {x.plan.name}</span>
                                <Link href={`/dashboard/events/create?booking=${x.id}`} className="font-semibold text-primary hover:underline">Create Event</Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </GateCard>
    );
}

function GateCard({ title, text, eventId, children }: { title: string; text: string; eventId?: number | null; children?: React.ReactNode }) {
    return (
        <Card className="mx-auto mt-6 max-w-lg">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <FontAwesomeIcon icon={faCalendarXmark} className="!size-[26px] text-muted-foreground/40" />
                <p className="text-[14px] font-semibold text-foreground">{title}</p>
                <p className="max-w-sm text-[13px] text-muted-foreground">{text}</p>
                {children}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <Button asChild size="sm" className="h-8 text-[12px]">
                        <Link href="/dashboard/events/check-availability">Check Event Availability</Link>
                    </Button>
                    {eventId ? (
                        <Button asChild variant="outline" size="sm" className="h-8 text-[12px]"><Link href={`/event/${eventId}`}>Open the Event</Link></Button>
                    ) : (
                        <Button asChild variant="outline" size="sm" className="h-8 text-[12px]"><Link href="/dashboard">Back to Dashboard</Link></Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
