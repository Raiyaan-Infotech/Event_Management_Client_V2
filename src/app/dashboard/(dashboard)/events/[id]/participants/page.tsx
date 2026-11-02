"use client";

import { use } from "react";
import { ParticipantsView } from "../../../participants/_components/participants-view";

/** Event → Participants (2026-11-02): it lives inside the event. */
export default function EventParticipantsViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <ParticipantsView key={id} eventId={Number(id)} />;
}
