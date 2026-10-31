"use client";

/**
 * Edit Event — the same hub as the mobile app's Edit Event screen: one row per
 * part of the event. Form sections (Basic Details, Date & Time, Venue,
 * Invitation Card, Event App Menu, Organizer Settings) open on their own with
 * Cancel / Save; the rest open the module that already exists for them on the
 * event page. Modules the portal does not have yet show "Soon".
 */

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
    faAddressCard,
    faArrowLeft,
    faCalendarDays,
    faChevronRight,
    faCircleInfo,
    faEnvelopeOpenText,
    faGear,
    faHeart,
    faImages,
    faLink,
    faListCheck,
    faLocationDot,
    faMobileScreenButton,
    faPeopleGroup,
    faQrcode,
    faSquareCheck,
    faUserTie,
    faUsers,
    faVideo,
} from "@fortawesome/free-solid-svg-icons";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EventQr } from "@/components/common/event-qr";
import { useClientEvent } from "@/hooks/use-client-events";

type Row = {
    icon: IconDefinition;
    title: string;
    description: string;
    /** A link, an action, or nothing (= not built yet, shows "Soon"). */
    href?: string;
    onClick?: () => void;
};

export function EditEventHub({ eventId }: { eventId: number }) {
    const event = useClientEvent(eventId);
    const [qrOpen, setQrOpen] = useState(false);

    const section = (key: string) => `/dashboard/events/${eventId}/edit?section=${key}`;
    const tab = (key: string) => `/dashboard/events/${eventId}?tab=${key}`;

    // Same order as the app's Edit Event (Organizer Settings added: on the web
    // it is the only place to edit hosted-by, contact email and footer note).
    const rows: Row[] = [
        { icon: faMobileScreenButton, title: "Mobile Splash Screen", description: "Change the app splash screen" },
        { icon: faEnvelopeOpenText, title: "Invitation Card", description: "Choose template, card settings and colour", href: section("invitation") },
        { icon: faCircleInfo, title: "Basic Details", description: "Update title, hosts and photo", href: section("basic") },
        { icon: faQrcode, title: "Event QR", description: "Show the event QR code for guests to scan", onClick: () => setQrOpen(true) },
        { icon: faCalendarDays, title: "Date & Time", description: "Edit event date and time", href: section("date") },
        { icon: faLocationDot, title: "Venue", description: "Edit venue details and map location", href: section("venue") },
        { icon: faListCheck, title: "Agenda", description: "Add, edit and manage event agenda", href: tab("schedule") },
        { icon: faPeopleGroup, title: "Family", description: "Manage family members", href: tab("family") },
        { icon: faUsers, title: "Participants", description: "Manage event participants", href: tab("rsvps") },
        { icon: faSquareCheck, title: "RSVP", description: "Configure RSVP settings", href: tab("settings") },
        { icon: faImages, title: "Photo Gallery", description: "Add, edit and manage event gallery", href: tab("gallery") },
        { icon: faHeart, title: "Wed Wishes", description: "View, hide and manage participant wishes" },
        { icon: faVideo, title: "Live Streaming", description: "Manage your event's live streaming content" },
        { icon: faLink, title: "Social Links", description: "Add, edit and delete event social links" },
        { icon: faAddressCard, title: "Contact Person", description: "Update contact person details", href: tab("settings") },
        { icon: faUserTie, title: "Organizer Details", description: "Hosted by, contact email and footer note", href: section("organizer") },
        { icon: faGear, title: "Event App Menu", description: "Manage app menus and features", href: section("menus") },
    ];

    const e = event.data;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-[22px] font-bold tracking-tight text-foreground">Edit Event</h1>
                    {event.isLoading ? (
                        <Skeleton className="mt-2 h-4 w-48" />
                    ) : (
                        <p className="mt-1 break-words text-[13.5px] text-muted-foreground">{e?.name ?? "Event"}</p>
                    )}
                </div>
                <Button asChild variant="outline" className="h-9 rounded-md text-[12.5px]">
                    <Link href="/dashboard/events">
                        <FontAwesomeIcon icon={faArrowLeft} className="!size-[11px]" />
                        My Events
                    </Link>
                </Button>
            </div>

            {/* A draft is finished through the full Create Event steps. */}
            {e?.status === "draft" && (
                <Card className="border-warning/40 bg-warning/10 py-0 shadow-none">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div>
                            <p className="text-[13px] font-semibold text-foreground">This event is a draft</p>
                            <p className="text-[12px] text-muted-foreground">
                                Finish the Create Event steps to publish it. Its date is fixed once it is created.
                            </p>
                        </div>
                        <Button asChild size="sm" className="h-8 text-[12px]">
                            <Link href={section("all")}>Continue Create Event</Link>
                        </Button>
                    </CardContent>
                </Card>
            )}

            <Card className="border border-border py-0 shadow-none">
                <CardContent className="p-0">
                    <ul className="divide-y divide-border">
                        {rows.map((row) => {
                            const ready = !!row.href || !!row.onClick;
                            const inner = (
                                <>
                                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10">
                                        <FontAwesomeIcon icon={row.icon} className="!size-[15px] text-primary" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13.5px] font-semibold text-foreground">{row.title}</span>
                                        <span className="block text-[12px] text-muted-foreground">{row.description}</span>
                                    </span>
                                    {ready ? (
                                        <FontAwesomeIcon icon={faChevronRight} className="!size-[12px] shrink-0 text-muted-foreground" />
                                    ) : (
                                        <Badge variant="secondary" className="shrink-0 rounded px-1.5 py-0 text-[10px] font-semibold uppercase">
                                            Soon
                                        </Badge>
                                    )}
                                </>
                            );
                            const className = "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors";
                            return (
                                <li key={row.title}>
                                    {row.href ? (
                                        <Link href={row.href} className={`${className} hover:bg-muted/50`}>{inner}</Link>
                                    ) : row.onClick ? (
                                        <button type="button" onClick={row.onClick} className={`${className} hover:bg-muted/50`}>{inner}</button>
                                    ) : (
                                        <div aria-disabled className={`${className} cursor-not-allowed opacity-60`} title="Not available yet">
                                            {inner}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </CardContent>
            </Card>

            <Dialog open={qrOpen} onOpenChange={setQrOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FontAwesomeIcon icon={faQrcode} className="!size-[14px] text-primary" />
                            Event QR
                        </DialogTitle>
                        <DialogDescription className="break-words">
                            Guests scan this in the Event Invite app to open &ldquo;{e?.name}&rdquo;.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-center py-2">
                        <EventQr token={e?.qr_token} qrStyle={e?.qr_style} eventName={e?.name} size={220} />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
