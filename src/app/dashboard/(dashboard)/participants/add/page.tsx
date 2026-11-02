"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientEvent } from "@/hooks/use-client-events";
import { useGuest } from "@/hooks/use-guests";
import { ParticipantForm } from "../_components/participant-form";

/**
 * Add Participant — `?event=` (required) and, for Add from Guest, `?guest=`:
 * that guest fills the form (the app's flow).
 */
export default function AddParticipantPage() {
    const [ids, setIds] = useState<{ event: number | null; guest: number | null } | null>(null);
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        setIds({ event: Number(q.get("event")) || null, guest: Number(q.get("guest")) || null });
    }, []);

    const event = useClientEvent(ids?.event ?? null);
    const guest = useGuest(ids?.guest ?? null);

    if (!ids || (ids.event && event.isLoading) || (ids.guest && guest.isLoading)) {
        return <Skeleton className="h-[420px] w-full rounded-xl" />;
    }
    if (!ids.event) {
        return (
            <Card className="border border-border py-0 shadow-none">
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                    <p className="text-[14px] font-semibold">Please select an event first</p>
                    <Button asChild variant="outline" size="sm"><Link href="/dashboard/participants">Back to Participants</Link></Button>
                </CardContent>
            </Card>
        );
    }
    return (
        <ParticipantForm
            key={`${ids.event}-${ids.guest ?? "manual"}`}
            eventId={ids.event}
            eventName={event.data?.name}
            fromGuest={guest.data ?? null}
        />
    );
}
