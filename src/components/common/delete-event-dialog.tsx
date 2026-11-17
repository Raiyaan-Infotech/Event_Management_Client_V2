"use client";

import { CalendarDays, Loader2, MapPin, Trash2, TriangleAlert, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EventThumbnail } from "@/components/common/event-thumbnail";
import type { ClientEvent } from "@/hooks/use-client-events";

/**
 * Delete Event (Jamal, 2026-11-17) — the centre popup of the dashboard and My Events, drawn
 * like the Share Event modal: icon + title + ✕ on top, the event itself in a card, then what
 * deleting does and Cancel / Delete Event. Both buttons lock and Delete spins while it runs.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (d?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
    return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
};

export function DeleteEventDialog({
    event, busy, onClose, onConfirm,
}: { event: ClientEvent | null; busy?: boolean; onClose: () => void; onConfirm: (event: ClientEvent) => void }) {
    const when = prettyDate(event?.start_date);
    const guests = event?.guest_count ?? 0;
    return (
        <Dialog open={!!event} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
            <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-[480px]">
                {event && (
                    <>
                        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
                            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive text-white"><Trash2 className="size-5" /></span>
                            <div className="min-w-0 flex-1">
                                <DialogTitle className="text-[17px] leading-tight font-bold">Delete Event</DialogTitle>
                                <DialogDescription className="mt-0.5 text-[12.5px]">This removes the event from your account.</DialogDescription>
                            </div>
                            <Button size="icon" variant="outline" className="size-8 shrink-0 rounded-full" disabled={busy} onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
                        </div>

                        <div className="flex flex-col gap-3 p-5">
                            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                                <EventThumbnail themeId={event.theme_id} customImage={event.custom_image} name={event.name}
                                    primaryColor={event.primary_color} className="h-[72px] w-[56px] rounded-md" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[14px] font-semibold text-foreground" title={event.name}>{event.name}</p>
                                    <div className="mt-1 flex flex-col gap-0.5 text-[11.5px] text-muted-foreground">
                                        {when && <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5 shrink-0" />{when}</span>}
                                        {event.venue_name && <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{event.venue_name}</span></span>}
                                        {guests > 0 && <span className="inline-flex items-center gap-1.5"><Users className="size-3.5 shrink-0" />{guests.toLocaleString()} {guests === 1 ? "guest" : "guests"}</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-[12.5px] text-foreground">
                                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                                <p>
                                    <span className="font-semibold">&ldquo;{event.name}&rdquo;</span> will be removed from your events, and its QR code and
                                    invitation link will stop working{guests > 0 ? " for your guests" : ""}.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 border-t border-border px-5 py-3">
                            <Button variant="outline" className="h-10 text-[13px]" disabled={busy} onClick={onClose}>Cancel</Button>
                            <Button variant="destructive" className="h-10 text-[13px] font-semibold" disabled={busy} onClick={() => onConfirm(event)}>
                                {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{busy ? "Deleting..." : "Delete Event"}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
