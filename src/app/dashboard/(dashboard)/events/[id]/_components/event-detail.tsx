"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faPenToSquare, faDownload,
    faLocationDot, faGlobe,
    faLock, faEyeSlash, faUsers, faSquareCheck, faComments, faQrcode,
    faLayerGroup, faPalette, faClockRotateLeft, faCircleInfo,
    faTriangleExclamation, faArrowRight, faCircleCheck, faXmark, faMinus,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EventQr } from "@/components/common/event-qr";
import { downloadQrAsPng, fileSlug } from "@/lib/export-invitation";
import { useClientEvent } from "@/hooks/use-client-events";
import { ApiError } from "@/lib/api-client";
import { SignInPrompt } from '@/components/common/sign-in-prompt';
import { useDateFormatter } from '@/hooks/use-client-settings';
import { AgendaPanel } from "./agenda-panel";
import { FamilyPanel } from "./family-panel";
import { GalleryBoard } from "./gallery-board";
import { SettingsPanel } from "./settings-panel";
import { WishesPanel } from "./wishes-panel";
import { LivePanel } from "./live-panel";
import { SocialLinksPanel } from "./social-links-panel";
import { GuestsView } from "../../../guests/_components/guests-view";
import { RsvpsView } from "../../../rsvps/_components/rsvps-view";
import { RsvpChannels, RsvpNotes, RsvpRecent, RsvpSummary } from "../../../rsvps/_components/rsvp-summary";
import { ParticipantsView } from "../../../participants/_components/participants-view";
import { ScrollTabs } from "./scroll-tabs";
import { EVENT_STATUS, EVENT_TAB_ICONS, settingsFrom, tabFrom, useVisibleEventTabs, type EventTab } from "./event-tabs";
import { EventHero } from "./event-hero";
import { CalendarDays, Clock, Info, Link2, MapPin, Send, UsersRound, type LucideIcon } from "lucide-react";
import { useEventHref } from "@/lib/event-workspace";

/**
 * Event Details — the View Event screen.
 *
 * ── THE EVENT CODE IS DERIVED, NOT STORED ────────────────────────────────────
 * `#EVT20250525-001` is built from the start date and the id. No column, no
 * migration, and it cannot drift from the row it describes. It is stable
 * because both inputs are: an event's id never changes, and changing its date
 * changes the code — which is correct, the code encodes when the event is.
 *
 * ── WHAT EACH TAB ACTUALLY HAS ───────────────────────────────────────────────
 * Overview, Event Information, Agenda (was Schedule, renamed 2026-11-02), Venue, Gallery,
 * Family, RSVPs and Settings (Organizer Contact, Participants, RSVP) read and
 * write real data — the same endpoints the mobile app uses. Activity Log has no
 * table behind it and says so. Messages is ON HOLD by decision, not by
 * oversight — see the tab body.
 */

type TabValue = EventTab;
const TAB_ICONS = EVENT_TAB_ICONS;
const STATUS_META = EVENT_STATUS;

const PRIVACY_ICON = { private: faLock, public: faGlobe, unlisted: faEyeSlash } as const;



/**
 * "10:30 AM" from a stored `HH:MM:SS`.
 *
 * Deliberately NOT routed through the client's time-zone preference: this is
 * the wall-clock time the event starts AT ITS VENUE, not an instant to be
 * converted. Shifting it would tell a guest in another zone to arrive at the
 * wrong hour.
 */
function formatTime(value: string | null): string {
    if (!value) return "—";
    const [hh, mm] = value.split(":").map(Number);
    const suffix = hh >= 12 ? "PM" : "AM";
    const hour12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${String(hour12).padStart(2, "0")}:${String(mm ?? 0).padStart(2, "0")} ${suffix}`;
}

/** `#EVT20250525-017` — derived from the date and id, never stored. */
function eventCode(id: number, startDate: string | null): string {
    const datePart = (startDate ?? "").replace(/-/g, "") || "00000000";
    return `#EVT${datePart}-${String(id).padStart(3, "0")}`;
}

/**
 * `workspace`: inside the event workspace (`/event/:id`, opened in its own tab by
 * View Event — Jamal 2026-11-04), whose top bar and sidebar already show the
 * event and its sections, so the header card and the tab bar are not drawn.
 */
export function EventDetail({ eventId, workspace = false }: { eventId: number; workspace?: boolean }) {
    const wsHref = useEventHref();
    // Dates follow the client's own Date Format / Time Zone preference.
    const fmt = useDateFormatter();
    const router = useRouter();
    const pathname = usePathname();
    // `?tab=` is the open section — the workspace sidebar, the Edit Event hub and
    // the in-page links all set it; a refresh or a shared link reopens it.
    const search = useSearchParams();
    const tab = tabFrom(search.get("tab"));
    const settingsPage = settingsFrom(search.get("set"));
    const visibleTabs = useVisibleEventTabs();
    const openTab = (v: TabValue) => router.replace(v === "overview" ? pathname : `${pathname}?tab=${v}`, { scroll: false });
    const [qrOpen, setQrOpen] = useState(false);
    // The QR inside the dialog, captured on demand by its Download button.
    const dialogQrRef = useRef<HTMLDivElement>(null);
    const [savingQr, setSavingQr] = useState(false);

    const query = useClientEvent(eventId);

    if (query.isLoading) {
        return (
            <div className="flex flex-col gap-5">
                <Skeleton className="h-9 w-[180px]" />
                <Skeleton className="h-[220px] w-full rounded-xl" />
                <div className="grid gap-5 lg:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[260px] rounded-xl" />)}
                </div>
            </div>
        );
    }

    if (query.isError || !query.data) {
        const isAuth = query.error instanceof ApiError && query.error.isAuthError;
        return (
            <Card className="border border-border py-0 shadow-none">
                <CardContent className="flex flex-col items-center gap-2 py-20 text-center">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="!size-[26px] text-warning/60" />
                    <p className="text-[15px] font-semibold text-foreground">
                        {isAuth ? "You are not signed in" : "Event not found"}
                    </p>
                    <p className="max-w-sm text-[13px] text-muted-foreground">
                        {isAuth
                            ? "Your session has ended. Sign in again to carry on."
                            : "This event does not exist, or it is not on your account."}
                    </p>
                    {isAuth && <SignInPrompt className="mt-2" />}
                    <Button asChild variant="outline" size="sm" className="mt-2 h-9 text-[12.5px]">
                        <Link href="/dashboard/events">Back to My Events</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const event = query.data;
    const status = STATUS_META[event.derived_status];
    const code = eventCode(event.id, event.start_date);

    const shareEvent = async () => {
        const url = `${window.location.origin}/dashboard/events/${event.id}`;
        try {
            await navigator.clipboard.writeText(url);
            toast.success("Event link copied");
        } catch {
            // Denied outside a secure context; a silent no-op reads as a bug.
            toast.error("Your browser blocked clipboard access.");
        }
    };

    return (
        <div className="flex flex-col gap-3">
            {/* ── Header card + tabs (Jamal's mockup, 2026-11-04) — the workspace has its own. ── */}
            {!workspace && <EventHero event={event} status={status} code={code} onShare={shareEvent} onQr={() => setQrOpen(true)} />}
            {!workspace && <ScrollTabs value={tab} onChange={(v) => openTab(v as TabValue)} tabs={visibleTabs.map((t) => ({ ...t, icon: TAB_ICONS[t.value] }))} />}

            {/* ── Dashboard (was Overview) — the mockup's six cards (2026-11-04) ── */}
            {tab === "overview" && (
                <div className="flex flex-col gap-4">
                    <div>
                        <h2 className="text-[18px] leading-tight font-bold">Dashboard</h2>
                        <p className="text-[12.5px] text-muted-foreground">Overview of your event, guest responses, and key details.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                        <Panel title="Basic Information" icon={Info}>
                            <Row label="Event Category" value={event.category?.name ?? "—"} />
                            <Row label="Tagline" value={event.tagline || "—"} />
                            <Row label="Short Description" value={event.description || "—"} />
                        </Panel>

                        <Panel title="Event Status" icon={CalendarDays}>
                            <div className="flex items-start justify-between gap-3 border-b border-border/70 py-2">
                                <span className="shrink-0 text-[12.5px] text-muted-foreground">Status</span>
                                <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                                    <span className={cn("h-2 w-2 rounded-full", status.dot)} />
                                    {status.label}
                                </span>
                            </div>
                            <Row label="Created On" value={fmt(event.created_at)} />
                            <Row label="Last Updated" value={fmt(event.updated_at)} />
                            <div className="flex items-start justify-between gap-3 py-2">
                                <span className="shrink-0 text-[12.5px] text-muted-foreground">Event Privacy</span>
                                <span className="flex items-center gap-1.5 text-[13px] font-medium capitalize text-foreground">
                                    <FontAwesomeIcon icon={PRIVACY_ICON[event.privacy] ?? faLock} className="!size-[11px] text-muted-foreground" />
                                    {event.privacy}
                                </span>
                            </div>
                        </Panel>

                        <Panel title="Quick Links" icon={Link2}>
                            <div className="flex flex-col gap-2 pt-1">
                                <QuickLink icon={faUsers} label="View Guests" onClick={() => openTab("guests")} />
                                <QuickLink icon={faSquareCheck} label="View RSVPs" onClick={() => openTab("rsvps")} />
                                {/* Held by decision — see the Messages tab. */}
                                <QuickLink icon={faComments} label="Send Message" soon />
                                <QuickLink icon={faQrcode} label="Download QR Code" onClick={() => setQrOpen(true)} />
                            </div>
                        </Panel>

                        <Panel title="Date & Time" icon={CalendarDays}>
                            <Row label="Start Date" value={fmt(event.start_date)} />
                            <Row label="Start Time" value={formatTime(event.start_time)} />
                            <Row label="End Date" value={fmt(event.end_date)} />
                            <Row label="End Time" value={formatTime(event.end_time)} />
                        </Panel>

                        <Panel title="RSVP Summary" icon={UsersRound}>
                            <RsvpSummary eventId={event.id} />
                        </Panel>

                        <Panel title="Invitation Channel Breakdown" icon={Send}>
                            <RsvpChannels eventId={event.id} />
                        </Panel>

                        <Panel title="Recent Activity" icon={Clock}>
                            <RsvpRecent eventId={event.id} onOpen={() => openTab("rsvps")} />
                        </Panel>

                        <Panel title="Guest Response Notes" icon={Info}>
                            <RsvpNotes />
                        </Panel>

                        <Panel title="Region" icon={MapPin}>
                            <Row label="Venue" value={event.venue_name || "—"} />
                            <Row label="Location" value={event.venue_address || "—"} />
                            <Row label="City" value={event.venue_landmark || "—"} />
                            <div className="flex items-start justify-between gap-3 py-2">
                                <span className="shrink-0 text-[12.5px] text-muted-foreground">Map</span>
                                {event.venue_map_link
                                    ? <a href={event.venue_map_link} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-primary hover:underline">Open in Maps</a>
                                    : <span className="text-[13px] font-medium">—</span>}
                            </div>
                        </Panel>
                    </div>
                </div>
            )}

            {/* ── Event Information ───────────────────────────────────────── */}
            {tab === "information" && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <Panel title="Event Information">
                        <Row label="Event Name" value={event.name} />
                        <Row label="Event Code" value={code} />
                        <Row label="Category" value={event.category?.name ?? "—"} />
                        <Row label="Privacy" value={event.privacy} />
                        <Row label="Status" value={status.label} />
                    </Panel>

                    <Panel title="Description">
                        <p className="py-2 text-[12.5px] leading-relaxed text-muted-foreground break-words">
                            {event.description || "No description was added for this event."}
                        </p>
                        {event.tagline && (
                            <>
                                <Separator className="my-2" />
                                <p className="text-[11px] text-muted-foreground">Tagline</p>
                                <p className="text-[12.5px] text-foreground break-words">{event.tagline}</p>
                            </>
                        )}
                    </Panel>

                    <Panel title="Menus Included" className="lg:col-span-2">
                        {(event.menus?.length ?? 0) === 0 ? (
                            <p className="py-2 text-[12.5px] text-muted-foreground">
                                No menus were selected for this event.
                            </p>
                        ) : (
                            <ul className="flex flex-wrap gap-2 pt-1">
                                {event.menus?.map((menu) => (
                                    <li key={menu.id}
                                        className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                                        <FontAwesomeIcon icon={faLayerGroup} className="!size-[11px] text-primary" />
                                        <span className="text-[12.5px] text-foreground break-words">{menu.name}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            )}

            {/* ── Agenda ──────────────────────────────────────────────────── */}
            {/* Agenda only, as in the app (no extra Date & Time box). */}
            {tab === "agenda" && <AgendaPanel event={event} />}

            {/* ── Venue ───────────────────────────────────────────────────── */}
            {tab === "venue" && (
                <Panel title="Venue">
                    {event.venue_name || event.venue_address ? (
                        <>
                            <Row label="Venue Name" value={event.venue_name || "—"} />
                            <Row label="Address" value={event.venue_address || "—"} />
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-2 py-8 text-center">
                            <FontAwesomeIcon icon={faLocationDot} className="!size-[22px] text-muted-foreground/40" />
                            <p className="text-[12.5px] font-semibold text-foreground">No venue set</p>
                            <p className="max-w-[320px] text-[11.5px] text-muted-foreground">
                                The Create Event wizard does not collect a venue yet, so this is empty for
                                every event.
                            </p>
                            <Button asChild variant="outline" size="sm" className="mt-1 h-8 text-[12px]">
                                <Link href={wsHref(`/dashboard/events/${event.id}/edit`)}>Edit event</Link>
                            </Button>
                        </div>
                    )}
                </Panel>
            )}

            {/* ── Gallery ─────────────────────────────────────────────────── */}
            {tab === "gallery" && <GalleryBoard eventId={event.id} />}

            {/* ── Family ──────────────────────────────────────────────────── */}
            {tab === "family" && <FamilyPanel event={event} />}

            {/* Guests / RSVPs / Participants — in place, like Family (2026-11-04). */}
            {tab === "guests" && <GuestsView key={event.id} eventId={event.id} />}
            {tab === "rsvps" && <RsvpsView key={event.id} eventId={event.id} />}
            {tab === "participants" && <ParticipantsView key={event.id} eventId={event.id} />}

            {/* Wed Wishes, Live Streaming, Social Links — as the app (2026-11-03). */}
            {tab === "wishes" && <WishesPanel event={event} />}
            {tab === "live" && <LivePanel event={event} />}
            {tab === "social" && <SocialLinksPanel event={event} />}

            {/* ── Settings ────────────────────────────────────────────────── */}
            {tab === "settings" && <SettingsPanel event={event} only={settingsPage} />}

            {/* ── Messages — ON HOLD ──────────────────────────────────────── */}
            {tab === "messages" && (
                <Panel title="Messages">
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                        <FontAwesomeIcon icon={faComments} className="!size-[24px] text-muted-foreground/40" />
                        <p className="text-[13px] font-semibold text-foreground">Messaging is on hold</p>
                        <p className="max-w-[420px] text-[12px] leading-relaxed text-muted-foreground">
                            Sending invitations by email or WhatsApp is paused by decision, not missing by
                            accident. The tables are already in place, so this tab fills in once the module
                            is picked back up.
                        </p>
                        <Badge variant="secondary" className="mt-1 rounded text-[10px] font-semibold uppercase">
                            Paused
                        </Badge>
                    </div>
                </Panel>
            )}

            {/* ── Activity Log ────────────────────────────────────────────── */}
            {tab === "activity" && (
                <Panel title="Activity Log">
                    <ul className="flex flex-col gap-4 py-2">
                        {/* Only what the row itself can prove. An audit trail
                            would need its own table; inventing entries for it
                            would be worse than showing these two. */}
                        <ActivityRow icon={faCircleInfo} label="Event created" value={fmt(event.created_at)} />
                        <ActivityRow icon={faPenToSquare} label="Last updated" value={fmt(event.updated_at)} />
                        {event.qr_issued_at && (
                            <ActivityRow icon={faQrcode} label="QR code issued" value={fmt(event.qr_issued_at)} />
                        )}
                    </ul>
                    <Separator className="my-2" />
                    <p className="text-[11.5px] text-muted-foreground">
                        A full audit trail (who changed what) is not recorded for events yet — these three
                        come from the event record itself.
                    </p>
                </Panel>
            )}

            {/* ── QR dialog ───────────────────────────────────────────────── */}
            <Dialog open={qrOpen} onOpenChange={setQrOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FontAwesomeIcon icon={faQrcode} className="!size-[14px] text-primary" />
                            Event QR Code
                        </DialogTitle>
                        <DialogDescription className="break-words">
                            Print this on your invitation. It carries only your event&apos;s encrypted id, and
                            stays the same when you edit the event — a scan always shows the latest details.
                        </DialogDescription>
                    </DialogHeader>
                    {/* The dialog's own QR is the capture target, so what gets
                        saved is the code being looked at rather than a second
                        one rendered somewhere off-screen. */}
                    <div ref={dialogQrRef} className="flex justify-center py-2">
                        <EventQr token={event.qr_token} qrStyle={event.qr_style} eventName={event.name} size={200} />
                    </div>
                    {event.qr_issued_at && (
                        <p className="text-center text-[10.5px] text-muted-foreground">
                            Issued {fmt(event.qr_issued_at)}
                        </p>
                    )}
                    {event.qr_token && (
                        <Button
                            variant="outline"
                            disabled={savingQr}
                            onClick={async () => {
                                if (!dialogQrRef.current) return;
                                setSavingQr(true);
                                try {
                                    await downloadQrAsPng(dialogQrRef.current, fileSlug(event.name, "invitation"));
                                    toast.success("QR code downloaded.");
                                } catch (error) {
                                    toast.error(
                                        error instanceof Error ? error.message : "Could not download the QR code."
                                    );
                                } finally {
                                    setSavingQr(false);
                                }
                            }}
                            className="h-10 w-full rounded-md text-[12.5px] font-semibold"
                        >
                            <FontAwesomeIcon icon={faDownload} className="mr-2 !size-[12px]" />
                            {savingQr ? "Preparing…" : "Download QR Code"}
                        </Button>
                    )}
                </DialogContent>
            </Dialog>

        </div>
    );
}

/* ── building blocks ────────────────────────────────────────────────────── */

function Panel({ title, icon: Icon, children, className }: { title: string; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
    return (
        <Card className={cn("min-w-0 rounded-xl border border-border py-0 shadow-none", className)}>
            <CardContent className="p-4">
                <p className="flex items-center gap-2.5 text-[14px] font-bold text-foreground">
                    {Icon && <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>}
                    {title}
                </p>
                <Separator className="my-3" />
                {children}
            </CardContent>
        </Card>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4 border-b border-border/70 py-2 last:border-0">
            <span className="shrink-0 text-[12.5px] text-muted-foreground">{label}</span>
            {/* break-words and a max width — a long description must wrap in the
                right column rather than push the label off the card. */}
            <span className="min-w-0 max-w-[62%] text-right text-[13px] font-medium capitalize text-foreground break-words">
                {value}
            </span>
        </div>
    );
}

function QuickLink({
    icon, label, href, onClick, soon,
}: {
    icon: typeof faUsers; label: string; href?: string; onClick?: () => void; soon?: boolean;
}) {
    const inner = (
        <>
            <FontAwesomeIcon icon={icon} className="!size-[12px] shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 break-words">{label}</span>
            {soon ? (
                <Badge variant="secondary" className="shrink-0 rounded px-1.5 py-0 text-[9px] font-semibold uppercase">
                    Paused
                </Badge>
            ) : (
                <FontAwesomeIcon icon={faArrowRight} className="!size-[10px] shrink-0 text-muted-foreground" />
            )}
        </>
    );

    const base = "flex items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-[12.5px] font-medium transition-colors";

    if (soon) {
        return (
            <div aria-disabled title="Paused" className={cn(base, "cursor-not-allowed text-muted-foreground/60")}>
                {inner}
            </div>
        );
    }
    if (href) {
        return <Link href={href} className={cn(base, "text-foreground hover:border-primary/40 hover:bg-primary/5")}>{inner}</Link>;
    }
    return (
        <button type="button" onClick={onClick}
            className={cn(base, "w-full text-left text-foreground hover:border-primary/40 hover:bg-primary/5")}>
            {inner}
        </button>
    );
}

function ActivityRow({ icon, label, value }: { icon: typeof faUsers; label: string; value: string }) {
    return (
        <li className="flex items-start gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10">
                <FontAwesomeIcon icon={icon} className="!size-[11px] text-primary" />
            </span>
            <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground">{value}</p>
            </div>
        </li>
    );
}
