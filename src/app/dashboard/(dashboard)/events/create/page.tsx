import { EventLimitGate } from "../_components/event-limit-gate";

/**
 * Create New Event.
 *
 * The wizard itself lives in `_components/event-wizard.tsx` because
 * `/dashboard/events/[id]/edit` renders the very same six steps — "Continue
 * Editing" on a draft has to reopen this exact form, and keeping two copies is
 * how a field added to one goes missing from the other.
 *
 * `?booking=<id>` (per-event plans, 2026-11-19): the booked date this event is made from — its
 * dates and plan. Without it the gate asks the client to book a date first.
 * `?theme=` is what the Templates screen's "Use Template" button passes.
 * In Next 16 `searchParams` is a Promise and must be awaited.
 */
export default async function CreateEventPage({
    searchParams,
}: {
    searchParams: Promise<{ theme?: string; booking?: string }>;
}) {
    const { theme, booking } = await searchParams;
    const bookingId = booking && /^\d+$/.test(booking) ? Number(booking) : undefined;
    return <EventLimitGate initialThemeId={theme} bookingId={bookingId} />;
}
