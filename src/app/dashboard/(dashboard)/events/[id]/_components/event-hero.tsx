"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ExternalLink, MapPin, MoreHorizontal, Pencil, QrCode, Share2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EventThumbnail } from "@/components/common/event-thumbnail";
import { InvitationDownload } from "@/components/common/invitation-download";
import { eventCustomImage } from "@/lib/event-templates";
import { cn } from "@/lib/utils";
import { useDateFormatter } from "@/hooks/use-client-settings";
import type { ClientEvent } from "@/hooks/use-client-events";
import { useEventHref } from "@/lib/event-workspace";

/**
 * The event page's header card (Jamal's mockup, 2026-11-04): invitation
 * thumbnail, the event name (+ a small status badge), pink chips for date,
 * venue and category; on the right View Invitation (a large preview with the
 * Download menu) and ⋯ (Edit Event, Share Event, Download QR Code).
 * Replaces the old Back link, "Event Details" title row and fact boxes.
 */
export function EventHero({
    event, status, code, onShare, onQr,
}: {
    event: ClientEvent;
    status: { label: string; dot: string; className: string };
    code: string;
    onShare: () => void;
    onQr: () => void;
}) {
    const wsHref = useEventHref();
    const fmt = useDateFormatter();
    const [view, setView] = useState(false);
    const thumb = (className: string) => (
        <EventThumbnail
            themeId={event.theme_id} customImage={eventCustomImage(event)} name={event.name}
            primaryColor={event.primary_color} startDate={event.start_date} venueName={event.venue_name}
            className={className}
        />
    );
    const venue = [event.venue_name, event.venue_landmark].filter(Boolean).join(", ") || "Venue not set";
    const chip = "inline-flex min-w-0 items-center gap-1.5 rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-[12.5px] font-medium";

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-gradient-to-r from-primary/[0.04] via-card to-card p-3 sm:flex-row sm:items-center">
            {thumb("h-[88px] w-full shrink-0 rounded-lg border border-primary/10 shadow-sm sm:w-[104px]")}

            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    {/* break-words, never truncate — a long name must wrap. */}
                    <h1 className="break-words text-[20px] leading-tight font-bold tracking-tight">{event.name}</h1>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold", status.className)} title={code}>
                        <span className={cn("size-1.5 rounded-full", status.dot)} /> {status.label}
                    </span>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className={chip}>
                        <CalendarDays className="size-3.5 shrink-0 text-primary" /> {event.start_date ? fmt(event.start_date) : "Date not set"}
                    </span>
                    <span className={cn(chip, "max-w-full sm:max-w-[320px]")} title={venue}>
                        <MapPin className="size-3.5 shrink-0 text-primary" /> <span className="truncate">{venue}</span>
                    </span>
                    {event.category?.name && (
                        <span className={cn(chip, "text-primary")}><Tag className="size-3.5 shrink-0" /> {event.category.name}</span>
                    )}
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 border-primary/30 px-3.5 text-[12.5px] font-semibold text-primary hover:bg-primary/5 hover:text-primary" onClick={() => setView(true)}>
                    View Invitation <ExternalLink className="size-3.5" />
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="outline" className="size-9 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary" aria-label="More actions">
                            <MoreHorizontal className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem asChild className="gap-2.5 text-[13px]">
                            <Link href={wsHref(`/dashboard/events/${event.id}/edit`)}><Pencil className="size-4 text-muted-foreground" /> {event.status === "draft" ? "Continue Editing" : "Edit Event"}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onShare} className="gap-2.5 text-[13px]"><Share2 className="size-4 text-muted-foreground" /> Share Event</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onQr} className="gap-2.5 text-[13px]"><QrCode className="size-4 text-muted-foreground" /> Download QR Code</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <Dialog open={view} onOpenChange={setView}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>Invitation</DialogTitle>
                        <DialogDescription>{event.name} · {code}</DialogDescription>
                    </DialogHeader>
                    {thumb("aspect-[16/10] w-full rounded-lg border border-border")}
                    {/* The real file: the invitation as PNG or SVG, or the QR on its own. */}
                    <InvitationDownload event={event} className="h-9" />
                </DialogContent>
            </Dialog>
        </div>
    );
}
