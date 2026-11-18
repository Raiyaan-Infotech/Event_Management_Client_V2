"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useEventOptions } from "@/hooks/use-client-portal";
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

export function EventLimitGate({ initialThemeId, initialStartDate, initialEndDate, bookingPlanId }: { initialThemeId?: string; initialStartDate?: string; initialEndDate?: string; bookingPlanId?: number }) {
    const { limit, used, planName, reached: limitReached } = useEventLimit();

    if (!limitReached) return <EventWizard initialThemeId={initialThemeId} initialStartDate={initialStartDate} initialEndDate={initialEndDate} bookingPlanId={bookingPlanId} />;

    return (
        <Card className="mx-auto mt-6 max-w-lg">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <FontAwesomeIcon icon={faCalendarXmark} className="!size-[26px] text-muted-foreground/40" />
                <p className="text-[14px] font-semibold text-foreground">Event limit reached</p>
                <p className="max-w-sm text-[13px] text-muted-foreground">
                    Your {planName ?? "current"} plan allows {limit} event{limit === 1 ? "" : "s"} and
                    you have created {used}. Upgrade your plan to create more.
                </p>
                {bookingPlanId && (
                    // Came from Book Event → Payment: the details are saved but no gateway has confirmed them yet.
                    <p className="max-w-sm rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
                        Your payment details for the new plan are saved. You can create this event as soon as the payment is confirmed.
                    </p>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <Button asChild size="sm" className="h-8 text-[12px]">
                        <Link href="/dashboard/billing">View Plan &amp; Billing</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-8 text-[12px]">
                        <Link href="/dashboard/events">Back to Events</Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
