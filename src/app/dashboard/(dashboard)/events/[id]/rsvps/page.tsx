"use client";

import { use } from "react";
import { RsvpsView } from "../../../rsvps/_components/rsvps-view";

/** Event → RSVPs (2026-11-02): it lives inside the event. */
export default function EventRsvpsViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <RsvpsView key={id} eventId={Number(id)} />;
}
