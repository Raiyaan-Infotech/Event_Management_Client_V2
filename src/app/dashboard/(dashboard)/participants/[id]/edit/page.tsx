"use client";

import { use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useParticipantRow } from "@/hooks/use-event-participants";
import { ParticipantForm } from "../../_components/participant-form";
import { useEventHref } from "@/lib/event-workspace";

/** Edit Participant — the same form as Add, prefilled; RSVP answer untouched. */
export default function EditParticipantPage({ params }: { params: Promise<{ id: string }> }) {
    const wsHref = useEventHref();
    const { id } = use(params);
    const participantId = Number(id);
    const row = useParticipantRow(Number.isInteger(participantId) && participantId > 0 ? participantId : null);

    if (row.isLoading) return <Skeleton className="h-[420px] w-full rounded-xl" />;
    if (!row.data) {
        return (
            <Card className="border border-border py-0 shadow-none">
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                    <p className="text-[14px] font-semibold">Participant not found</p>
                    <Button asChild variant="outline" size="sm"><Link href={wsHref("/dashboard/participants")}>Back to Participants</Link></Button>
                </CardContent>
            </Card>
        );
    }
    return (
        <ParticipantForm
            key={row.data.id}
            eventId={row.data.event_id}
            eventName={row.data.event?.name}
            participant={row.data}
        />
    );
}
