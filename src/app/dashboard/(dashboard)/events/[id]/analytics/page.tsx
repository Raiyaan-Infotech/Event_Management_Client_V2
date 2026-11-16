"use client";

import { use } from "react";
import { EventAnalyticsView } from "../_components/event-analytics";

/** Event Analytics — one event's figures (Jamal's mockup, 2026-11-17). Opened from Dashboard → ⋯ → Analytics. */
export default function EventAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <EventAnalyticsView eventId={Number(id)} />;
}
