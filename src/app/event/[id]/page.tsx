"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EventDetail } from "@/app/dashboard/(dashboard)/events/[id]/_components/event-detail";

/** The event workspace's content — the section named by `?tab=` (default: Dashboard). */
export default function EventWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) {
        return (
            <div className="flex flex-col items-center gap-2 py-20 text-center">
                <p className="text-[15px] font-semibold">Event not found</p>
                <p className="text-[13px] text-muted-foreground">That is not a valid event link.</p>
                <Button asChild variant="outline" size="sm" className="mt-2"><Link href="/dashboard/events">Back to My Events</Link></Button>
            </div>
        );
    }
    return (
        <Suspense fallback={null}>
            <EventDetail eventId={eventId} workspace />
        </Suspense>
    );
}
