"use client";

import { use } from "react";
import { GuestsView } from "../../../guests/_components/guests-view";

/** Event → Guests (2026-11-02): the guest list lives inside the event. */
export default function EventGuestsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <GuestsView key={id} eventId={Number(id)} />;
}
