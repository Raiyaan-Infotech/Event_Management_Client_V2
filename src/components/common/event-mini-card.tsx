"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EventThumbnail } from "@/components/common/event-thumbnail";
import { eventCustomImage } from "@/lib/event-templates";
import { cn } from "@/lib/utils";
import { useClientEvent, type DerivedStatus } from "@/hooks/use-client-events";
import { useDateFormatter } from "@/hooks/use-client-settings";

/**
 * The event a Guests / RSVPs / Participants page belongs to (Jamal, 2026-11-02:
 * those three moved INSIDE the event). Thumbnail, status, name, date + time and
 * venue — a small copy of the event view's hero — plus the way back to it.
 */
const STATUS: Record<DerivedStatus, { label: string; dot: string; className: string }> = {
    live: { label: "Live", dot: "bg-destructive", className: "bg-destructive/10 text-destructive" },
    upcoming: { label: "Upcoming", dot: "bg-success", className: "bg-success/12 text-success" },
    past: { label: "Completed", dot: "bg-muted-foreground", className: "bg-muted text-muted-foreground" },
    draft: { label: "Draft", dot: "bg-warning", className: "bg-warning/15 text-warning" },
    cancelled: { label: "Cancelled", dot: "bg-foreground/50", className: "bg-foreground/10 text-foreground/70" },
} as Record<DerivedStatus, { label: string; dot: string; className: string }>;

function time(value: string | null | undefined): string {
    if (!value) return "";
    const [hh, mm] = value.split(":").map(Number);
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${String(h12).padStart(2, "0")}:${String(mm ?? 0).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"}`;
}

export function EventMiniCard({ eventId }: { eventId: number }) {
    const fmt = useDateFormatter();
    const { data: event, isLoading } = useClientEvent(eventId);

    if (isLoading || !event) return <Skeleton className="h-[92px] w-full rounded-lg" />;

    const status = STATUS[event.derived_status] ?? STATUS.upcoming;
    const hours = [time(event.start_time), time(event.end_time)].filter(Boolean).join(" - ");

    return (
        <div className="flex min-w-0 items-center gap-3">
            <Link href={`/dashboard/events/${event.id}`} className="shrink-0" title="Open the event">
                <EventThumbnail
                    themeId={event.theme_id}
                    customImage={eventCustomImage(event)}
                    name={event.name}
                    primaryColor={event.primary_color}
                    startDate={event.start_date}
                    venueName={event.venue_name}
                    className="h-[92px] w-[120px] rounded-md"
                />
            </Link>
            <div className="flex min-w-0 flex-col gap-1">
                <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold", status.className)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                    {status.label}
                </span>
                <p className="text-[15px] font-bold leading-tight text-foreground break-words">{event.name}</p>
                <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px]">
                        <CalendarDays className="size-3.5 text-[#7C5AED]" />
                        <span className="font-medium">{fmt(event.start_date)}</span>
                        {hours ? <span className="text-muted-foreground">{hours}</span> : null}
                    </span>
                    {event.venue_name ? (
                        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px]">
                            <MapPin className="size-3.5 shrink-0 text-[#EC4899]" />
                            <span className="font-medium break-words">{event.venue_name}</span>
                            {event.venue_landmark ? <span className="text-muted-foreground">{event.venue_landmark}</span> : null}
                        </span>
                    ) : null}
                    <Link href={`/dashboard/events/${event.id}`}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-primary hover:bg-primary/5">
                        <ArrowLeft className="size-3.5" /> Back to event
                    </Link>
                </div>
            </div>
        </div>
    );
}
