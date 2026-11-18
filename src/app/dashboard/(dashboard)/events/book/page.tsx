import { redirect } from "next/navigation";
import { BookingFlow } from "./_components/booking-flow";

/**
 * Book Event (Jamal's "Create Event Updated v3" designs, 2026-11-18):
 * Check Availability → Select Plan → Review → Payment → Create Event.
 * `?start=` / `?end=` come from the availability calendar's Book Event; without a date
 * there is nothing to book, so it goes back to the calendar.
 */
export default async function BookEventPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
    const { start, end } = await searchParams;
    const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    const startDate = day(start);
    if (!startDate) redirect("/dashboard/events/check-availability");
    const endDate = day(end);
    return <BookingFlow start={startDate} end={endDate && endDate > startDate ? endDate : undefined} />;
}
