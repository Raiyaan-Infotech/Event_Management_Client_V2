"use client";

/**
 * Agenda — per event, as in the mobile app (2026-10-31). Pick an event, then
 * add, edit and order its agenda items. The editor is the same AgendaPanel the
 * event page's Schedule tab uses, so the two never disagree.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useClientEvents } from "@/hooks/use-client-events";
import { AgendaPanel } from "../events/[id]/_components/agenda-panel";

export default function AgendaPage() {
    const events = useClientEvents({ status: "all", limit: 100 });
    const rows = useMemo(() => events.data?.data ?? [], [events.data]);
    const [eventId, setEventId] = useState("");

    // `?event=` when given, else the first event.
    useEffect(() => {
        if (eventId || rows.length === 0) return;
        const wanted = new URLSearchParams(window.location.search).get("event");
        const found = rows.find((e) => String(e.id) === wanted);
        setEventId(String((found ?? rows[0]).id));
    }, [rows, eventId]);

    const event = rows.find((e) => String(e.id) === eventId) ?? null;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">Agenda</h1>
                    <p className="mt-1 text-[13.5px] text-muted-foreground">
                        Add, edit and manage the agenda of each event.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[12.5px] font-medium text-muted-foreground">Event</span>
                    <Select value={eventId} onValueChange={setEventId} disabled={rows.length === 0}>
                        <SelectTrigger className="h-10 w-full rounded-md text-[13px] lg:w-[260px]">
                            <SelectValue placeholder={events.isLoading ? "Loading events..." : "No events yet"} />
                        </SelectTrigger>
                        <SelectContent>
                            {rows.map((e) => (
                                <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {events.isLoading ? (
                <Skeleton className="h-[320px] w-full rounded-xl" />
            ) : rows.length === 0 ? (
                <Card className="border border-border py-0 shadow-none">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <p className="text-[13px] text-muted-foreground">An agenda belongs to an event. Create an event first.</p>
                        <Button asChild size="sm" className="h-8 text-[12px]">
                            <Link href="/dashboard/events/create">Create Event</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : event ? (
                <AgendaPanel key={event.id} event={event} />
            ) : null}
        </div>
    );
}
