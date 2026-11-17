"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    ArrowLeft, CalendarDays, Check, Copy, Download, Link2, Mail, MapPin, Search, Share2, Users, X,
} from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import { downloadQrAsPng } from "@/lib/export-invitation";
import { EventThumbnail } from "@/components/common/event-thumbnail";
import { StyledQrSvg, toQrStyle } from "@/components/common/styled-qr";
import type { ClientEvent } from "@/hooks/use-client-events";
import { GUEST_STATUS_LABELS, useBulkGuests, useGuests, type Guest } from "@/hooks/use-guests";

/**
 * Share Event (Jamal's design, 2026-11-17) — one modal for the dashboard and My Events.
 *
 *   left    the invitation (the saved invitation image, else the drawn artwork)
 *   right   Shareable Event Link (+ Copy Link) and the Event QR Code (+ Download QR)
 *   below   Share via: WhatsApp · Email · Copy Link · Guests
 *
 * THE LINK is `<this portal>/e/<qr_token>` — the public invitation page (`app/e/[token]`),
 * which shows the event and its QR code to anyone who opens it. It carries the same token
 * the QR image does, so sharing the link is the same as sharing the QR.
 *
 * GUESTS opens the event's guest list inside the modal: WhatsApp is one chat per guest
 * (a browser cannot open many at once), Email goes to every ticked guest in one draft.
 * Either one marks those guests as Invited (the same `invite` action as Send Invitation).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (d?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
    return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
};

export const eventShareLink = (token?: string | null) =>
    token && typeof window !== "undefined" ? `${window.location.origin}/e/${token}` : "";

const inviteText = (e: ClientEvent, link: string, first?: string) => {
    const when = prettyDate(e.start_date);
    return `${first ? `Dear ${first}, you` : "You"} are warmly invited to ${e.name}${when ? ` on ${when}` : ""}${e.venue_name ? ` at ${e.venue_name}` : ""}.\n\nOpen your invitation: ${link}`;
};

const copyText = async (text: string, done: string) => {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(done);
        return true;
    } catch {
        toast.error("Could not copy. Your browser blocked clipboard access.");
        return false;
    }
};

export function ShareEventDialog({ event, onClose }: { event: ClientEvent | null; onClose: () => void }) {
    return (
        <Dialog open={!!event} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent showCloseButton={false} className="max-h-[calc(100vh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-[700px]">
                {event && <ShareBody key={event.id} event={event} onClose={onClose} />}
            </DialogContent>
        </Dialog>
    );
}

function ShareBody({ event, onClose }: { event: ClientEvent; onClose: () => void }) {
    const [view, setView] = useState<"share" | "guests">("share");
    const [copied, setCopied] = useState(false);
    const qrRef = useRef<HTMLDivElement>(null);
    const link = eventShareLink(event.qr_token);
    const text = inviteText(event, link);
    const when = prettyDate(event.start_date);

    const copyLink = async () => {
        if (!link) return;
        if (await copyText(link, "Event link copied")) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };
    const downloadQr = async () => {
        if (!qrRef.current) return;
        const slug = event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "event";
        try { await downloadQrAsPng(qrRef.current, slug); } catch { toast.error("Could not read the QR image."); }
    };

    return (
        <>
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
                {view === "guests" ? (
                    <Button size="icon" variant="outline" className="size-10 shrink-0" onClick={() => setView("share")} aria-label="Back to Share Event">
                        <ArrowLeft className="size-4" />
                    </Button>
                ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Share2 className="size-5" /></span>
                )}
                <div className="min-w-0 flex-1">
                    <DialogTitle className="text-[17px] leading-tight font-bold">{view === "guests" ? "Send to Guests" : "Share Event"}</DialogTitle>
                    <DialogDescription className="mt-0.5 truncate text-[12.5px]">
                        {view === "guests" ? `Choose who gets the invitation to ${event.name}` : `Invite your guests to ${event.name}`}
                    </DialogDescription>
                </div>
                <Button size="icon" variant="outline" className="size-8 shrink-0 rounded-full" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
            </div>

            {view === "guests" ? (
                <GuestPicker event={event} link={link} />
            ) : (
                <div className="flex flex-col gap-4 p-5">
                    {!link && (
                        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-foreground">
                            This event has no QR code yet, so there is nothing to share. Save the event once to create it.
                        </p>
                    )}
                    <div className="grid gap-4 sm:grid-cols-[190px_1fr]">
                        {/* The invitation */}
                        <div className="mx-auto w-[190px] sm:mx-0">
                            {event.invitation_image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={mediaUrl(event.invitation_image)} alt={`Invitation to ${event.name}`} className="h-[250px] w-full rounded-lg border object-cover" />
                            ) : (
                                <EventThumbnail themeId={event.theme_id} customImage={event.custom_image} name={event.name}
                                    primaryColor={event.primary_color} startDate={event.start_date} venueName={event.venue_name}
                                    className="h-[250px] w-full rounded-lg" />
                            )}
                        </div>

                        <div className="flex min-w-0 flex-col gap-3">
                            <div className="rounded-lg border border-border p-3">
                                <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground"><Link2 className="size-4 text-muted-foreground" />Shareable Event Link</p>
                                <div className="flex items-center gap-2">
                                    <Input readOnly value={link} placeholder="No link yet" onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 text-[12px]" aria-label="Shareable event link" />
                                    <Button className="h-9 shrink-0 text-[12.5px]" disabled={!link} onClick={copyLink}>
                                        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy Link"}
                                    </Button>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                                <div ref={qrRef} className="shrink-0 rounded-md border border-border bg-white p-1.5">
                                    {event.qr_token ? (
                                        <span data-qr-svg className="block">
                                            <StyledQrSvg value={event.qr_token} size={92} qrStyle={toQrStyle(event.qr_style)} level="M" marginSize={1}
                                                style={{ width: 92, height: 92, display: "block" }} />
                                        </span>
                                    ) : <span className="grid size-[92px] place-items-center text-[10.5px] text-muted-foreground">No QR yet</span>}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-semibold text-foreground">Event QR Code</p>
                                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">Guests scan it in the Event Invite app to open the event and RSVP.</p>
                                </div>
                                <Button variant="outline" className="h-9 shrink-0 border-primary/40 text-[12.5px] text-primary hover:text-primary" disabled={!event.qr_token} onClick={downloadQr}>
                                    <Download className="size-4" />Download QR
                                </Button>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11.5px] text-muted-foreground">
                                {when && <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />{when}</span>}
                                {event.venue_name && <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{event.venue_name}</span></span>}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 text-[12.5px] font-medium text-muted-foreground">
                        <span className="h-px flex-1 bg-border" />Share via<span className="h-px flex-1 bg-border" />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <ShareButton label="WhatsApp" cls="bg-emerald-50 text-emerald-700 hover:bg-emerald-100" disabled={!link}
                            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener")}>
                            <FontAwesomeIcon icon={faWhatsapp} className="!size-[18px]" />
                        </ShareButton>
                        <ShareButton label="Email" cls="bg-pink-50 text-pink-700 hover:bg-pink-100" disabled={!link}
                            onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent(`You're Invited — ${event.name}`)}&body=${encodeURIComponent(text)}`; }}>
                            <Mail className="size-[18px]" />
                        </ShareButton>
                        <ShareButton label="Copy Link" cls="bg-violet-50 text-violet-700 hover:bg-violet-100" disabled={!link} onClick={copyLink}>
                            <Link2 className="size-[18px]" />
                        </ShareButton>
                        <ShareButton label="Guests" cls="bg-sky-50 text-sky-700 hover:bg-sky-100" disabled={!link} onClick={() => setView("guests")}>
                            <Users className="size-[18px]" />
                        </ShareButton>
                    </div>
                </div>
            )}
        </>
    );
}

function ShareButton({ label, cls, disabled, onClick, children }: { label: string; cls: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" disabled={disabled} onClick={onClick}
            className={cn("flex h-11 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50", cls)}>
            {children}{label}
        </button>
    );
}

/* ── Guests: the event's guest list, to send the invitation to ───────────── */

const PAGE = 200; // the server's largest page
const waNumber = (g: Guest) => `${g.dial_code || "+91"}${g.mobile ?? ""}`.replace(/\D/g, "");

function GuestPicker({ event, link }: { event: ClientEvent; link: string }) {
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [picked, setPicked] = useState<Set<number>>(new Set());
    /** Sent from this modal just now — ticked green before the list refetches. */
    const [sent, setSent] = useState<Set<number>>(new Set());
    useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);

    const guests = useGuests({ event_id: event.id, search: debounced || undefined, limit: PAGE, sort: "name_asc" });
    const bulk = useBulkGuests();
    const rows = useMemo(() => guests.data?.data ?? [], [guests.data]);
    const total = guests.data?.pagination?.totalItems ?? rows.length;
    const allPicked = rows.length > 0 && rows.every((g) => picked.has(g.id));
    const chosen = rows.filter((g) => picked.has(g.id));
    const withEmail = chosen.filter((g) => !!g.email);

    const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const toggleAll = () => setPicked((s) => {
        const n = new Set(s);
        rows.forEach((g) => { if (allPicked) n.delete(g.id); else n.add(g.id); });
        return n;
    });
    const markSent = (ids: number[], channel: "whatsapp" | "email", message: string) => {
        setSent((s) => new Set([...s, ...ids]));
        bulk.mutate({ guest_ids: ids, action: "invite", value: { channels: [channel], message } });
    };

    const whatsapp = (g: Guest) => {
        const message = inviteText(event, link, g.name.split(/\s+/)[0]);
        // Opened in the click itself, so the browser does not block the window.
        window.open(`https://wa.me/${waNumber(g)}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
        markSent([g.id], "whatsapp", message);
    };
    const emailPicked = () => {
        if (!chosen.length) return toast.error("Please select at least one guest.");
        if (!withEmail.length) return toast.error("None of the selected guests has an email address.");
        const message = inviteText(event, link);
        // BCC: guests do not see each other's addresses.
        window.location.href = `mailto:?bcc=${encodeURIComponent(withEmail.map((g) => g.email).join(","))}&subject=${encodeURIComponent(`You're Invited — ${event.name}`)}&body=${encodeURIComponent(message)}`;
        markSent(withEmail.map((g) => g.id), "email", message);
        if (withEmail.length < chosen.length) toast.message(`${chosen.length - withEmail.length} selected guest(s) have no email address and were left out.`);
    };

    return (
        <div className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest by name or mobile..." className="h-9 pl-9 text-[12.5px]" />
                </div>
                <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-[12.5px] font-medium">
                    <Checkbox checked={allPicked} onCheckedChange={toggleAll} disabled={!rows.length} />Select all ({rows.length})
                </label>
            </div>

            <div className="h-[300px] overflow-y-auto rounded-lg border border-border">
                {guests.isLoading ? (
                    <div className="flex flex-col gap-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : guests.isError ? (
                    <p className="px-4 py-14 text-center text-[12.5px] text-muted-foreground">
                        Could not load the guests. <button className="font-semibold text-primary hover:underline" onClick={() => guests.refetch()}>Try again</button>
                    </p>
                ) : !rows.length ? (
                    <p className="px-4 py-14 text-center text-[12.5px] text-muted-foreground">
                        {debounced ? "No guests match this search." : "This event has no guests yet. Add guests from the event's Guests page first."}
                    </p>
                ) : (
                    <ul className="divide-y divide-border">
                        {rows.map((g) => {
                            const done = sent.has(g.id);
                            return (
                                <li key={g.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                                    <Checkbox checked={picked.has(g.id)} onCheckedChange={() => toggle(g.id)} aria-label={`Select ${g.name}`} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[12.5px] font-semibold text-foreground" title={g.name}>{g.name}</p>
                                        <p className="truncate text-[11px] text-muted-foreground">
                                            {[g.mobile ? `${g.dial_code || ""} ${g.mobile}`.trim() : null, g.email, g.group?.name].filter(Boolean).join(" · ")}
                                        </p>
                                    </div>
                                    <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium",
                                        done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted/40 text-muted-foreground")}>
                                        {done ? "Sent" : g.status ? GUEST_STATUS_LABELS[g.status] : "—"}
                                    </span>
                                    <Button size="sm" variant="outline" disabled={!g.mobile} onClick={() => whatsapp(g)}
                                        className="h-8 shrink-0 border-emerald-200 px-2.5 text-[12px] text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700"
                                        aria-label={`Send to ${g.name} on WhatsApp`}>
                                        <FontAwesomeIcon icon={faWhatsapp} className="!size-[14px]" />Send
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            {total > rows.length && (
                <p className="text-[11.5px] text-muted-foreground">Showing {rows.length} of {total} guests — search to find the others.</p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11.5px] text-muted-foreground">
                    WhatsApp opens one chat per guest — use Send on each row. Email goes to all selected guests in one draft.
                </p>
                <Button className="h-9 shrink-0 text-[12.5px]" disabled={!chosen.length} onClick={emailPicked}>
                    <Mail className="size-4" />Email Selected ({chosen.length})
                </Button>
            </div>
        </div>
    );
}
