import { EventLimitGate } from "../_components/event-limit-gate";

/**
 * Create New Event.
 *
 * The wizard itself lives in `_components/event-wizard.tsx` because
 * `/dashboard/events/[id]/edit` renders the very same six steps — "Continue
 * Editing" on a draft has to reopen this exact form, and keeping two copies is
 * how a field added to one goes missing from the other.
 *
 * `?theme=` is what the Templates screen's "Use Template" button passes. Read
 * here in the server component rather than with `useSearchParams` in the client
 * one, which would need its own Suspense boundary for a value known at request
 * time. In Next 16 `searchParams` is a Promise and must be awaited.
 */
export default async function CreateEventPage({
    searchParams,
}: {
    searchParams: Promise<{ theme?: string; start?: string; end?: string }>;
}) {
    const { theme, start, end } = await searchParams;
    // ?start= / ?end= come from the Event Availability calendar's Book Event.
    const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    const startDate = day(start);
    const endDate = startDate ? day(end) : undefined;
    return <EventLimitGate initialThemeId={theme} initialStartDate={startDate} initialEndDate={endDate && endDate >= (startDate as string) ? endDate : startDate} />;
}
