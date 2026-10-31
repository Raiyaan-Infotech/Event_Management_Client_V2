"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowLeft, faPenToSquare, faShareNodes, faDownload, faTrash,
    faCalendarDays, faLocationDot, faHeart, faGlobe,
    faLock, faEyeSlash, faUsers, faSquareCheck, faComments, faQrcode,
    faLayerGroup, faPalette, faClockRotateLeft, faCircleInfo,
    faTriangleExclamation, faArrowRight, faCircleCheck, faXmark, faMinus,
} from "@fortawesome/free-solid-svg-icons";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { themeName } from "@/lib/event-themes";
import { EventThumbnail } from "@/components/common/event-thumbnail";
import { eventCustomImage } from "@/lib/event-templates";
import { EventQr } from "@/components/common/event-qr";
import { InvitationDownload } from "@/components/common/invitation-download";
import { downloadQrAsPng, fileSlug } from "@/lib/export-invitation";
import { useClientEvent, useDeleteEvent, type DerivedStatus } from "@/hooks/use-client-events";
import { useParticipantCapacity, useParticipantStats, useParticipants } from "@/hooks/use-guests";
import { PlanUsageBar } from "@/components/common/plan-usage-bar";
import { ApiError } from "@/lib/api-client";
import { SignInPrompt } from '@/components/common/sign-in-prompt';
import { useDateFormatter } from '@/hooks/use-client-settings';
import { AgendaPanel } from "./agenda-panel";
import { FamilyPanel } from "./family-panel";
import { GalleryPanel } from "./gallery-panel";
import { SettingsPanel } from "./settings-panel";

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
 * Overview, Event Information, Schedule (with the Agenda), Venue, Gallery,
 * Family, RSVPs and Settings (Organizer Contact, Participants, RSVP) read and
 * write real data — the same endpoints the mobile app uses. Activity Log has no
 * table behind it and says so. Messages is ON HOLD by decision, not by
 * oversight — see the tab body.
 */

const TABS = [
    { value: "overview", label: "Overview" },
    { value: "information", label: "Event Information" },
    { value: "schedule", label: "Schedule" },
    { value: "venue", label: "Venue" },
    { value: "gallery", label: "Gallery" },
    { value: "family", label: "Family" },
    { value: "rsvps", label: "RSVPs" },
    { value: "settings", label: "Settings" },
    { value: "messages", label: "Messages" },
    { value: "activity", label: "Activity Log" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const STATUS_META: Record<DerivedStatus, { label: string; dot: string; className: string }> = {
    live: { label: "Live", dot: "bg-destructive", className: "bg-destructive/10 text-destructive" },
    upcoming: { label: "Upcoming", dot: "bg-success", className: "bg-success/12 text-success" },
    past: { label: "Completed", dot: "bg-muted-foreground", className: "bg-muted text-muted-foreground" },
    draft: { label: "Draft", dot: "bg-warning", className: "bg-warning/15 text-warning" },
    cancelled: { label: "Cancelled", dot: "bg-foreground/50", className: "bg-foreground/10 text-foreground/70" },
};

const PRIVACY_ICON = { private: faLock, public: faGlobe, unlisted: faEyeSlash } as const;

/** RSVP donut colours — the same three the design uses. */
const RSVP_SLICES = [
    { key: "accepted", label: "Accepted", color: "#22C55E" },
    { key: "pending", label: "Pending", color: "#F59E0B" },
    { key: "declined", label: "Declined", color: "#EF4444" },
] as const;



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

export function EventDetail({ eventId }: { eventId: number }) {
    // Dates follow the client's own Date Format / Time Zone preference.
    const fmt = useDateFormatter();
    const router = useRouter();
    const [tab, setTab] = useState<TabValue>("overview");
    // `?tab=` opens a tab directly — how the Edit Event hub links to Agenda,
    // Family, Gallery, RSVPs and Settings.
    useEffect(() => {
        const wanted = new URLSearchParams(window.location.search).get("tab");
        if (wanted && TABS.some((t) => t.value === wanted)) setTab(wanted as TabValue);
    }, []);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    // The QR inside the dialog, captured on demand by its Download button.
    const dialogQrRef = useRef<HTMLDivElement>(null);
    const [savingQr, setSavingQr] = useState(false);

    const query = useClientEvent(eventId);
    const remove = useDeleteEvent();
    // The people attending THIS event — participants, not the phone book (§581).
    const rsvp = useParticipantStats(eventId);
    const guests = useParticipants({ event_id: eventId, limit: 8 });
    const participantCap = useParticipantCapacity(eventId);

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
    const isDraft = event.status === "draft";
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

    const totalRsvp = (rsvp.data?.accepted ?? 0) + (rsvp.data?.pending ?? 0) + (rsvp.data?.declined ?? 0);
    const donut = RSVP_SLICES
        .map((s) => ({ ...s, value: (rsvp.data?.[s.key] as number | undefined) ?? 0 }))
        // Recharts draws a zero slice as an invisible wedge that still owns a
        // tooltip target.
        .filter((s) => s.value > 0);

    return (
        <div className="flex flex-col gap-5">
            {/* ── Back ────────────────────────────────────────────────────── */}
            <div>
                <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-[12.5px] text-muted-foreground">
                    <Link href="/dashboard/events">
                        <FontAwesomeIcon icon={faArrowLeft} className="mr-2 !size-[11px]" />
                        Back to Event List
                    </Link>
                </Button>
            </div>

            {/* ── Title row ───────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">Event Details</h1>
                    <p className="mt-1 text-[13.5px] text-muted-foreground">
                        View complete information about your event.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" className="h-10 rounded-md px-4 text-[12.5px] font-semibold">
                        <Link href={`/dashboard/events/${event.id}/edit`}>
                            <FontAwesomeIcon icon={faPenToSquare} className="mr-2 !size-[12px]" />
                            {isDraft ? "Continue Editing" : "Edit Event"}
                        </Link>
                    </Button>
                    <Button variant="outline" onClick={shareEvent} className="h-10 rounded-md px-4 text-[12.5px] font-semibold">
                        <FontAwesomeIcon icon={faShareNodes} className="mr-2 !size-[12px]" />
                        Share Event
                    </Button>
                    {/* Was a button that only opened the QR dialog — it said
                        "Download" and downloaded nothing. It now produces the
                        real file: the invitation as PNG or SVG, or the QR on
                        its own. */}
                    <InvitationDownload event={event} />
                </div>
            </div>

            {/* ── Hero ────────────────────────────────────────────────────── */}
            <Card className="border border-border py-0 shadow-none">
                <CardContent className="flex flex-col gap-5 p-5 lg:flex-row">
                    <EventThumbnail
                        themeId={event.theme_id}
                        customImage={eventCustomImage(event)}
                        name={event.name}
                        primaryColor={event.primary_color}
                        startDate={event.start_date}
                        venueName={event.venue_name}
                        className="h-[200px] w-full shrink-0 rounded-lg lg:w-[206px]"
                    />

                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <Badge
                            variant="ghost"
                            className={cn("w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", status.className)}
                        >
                            <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                            {status.label}
                        </Badge>

                        {/* break-words, never truncate — a long name must wrap. */}
                        <h2 className="text-[24px] font-bold leading-tight tracking-tight text-foreground break-words">
                            {event.name}
                        </h2>

                        <p className="font-mono text-[12.5px] text-muted-foreground">{code}</p>

                        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <FactBox
                                icon={faCalendarDays}
                                title={fmt(event.start_date)}
                                sub={`${formatTime(event.start_time)} - ${formatTime(event.end_time)}`}
                                tint="#7C5AED"
                            />
                            <FactBox
                                icon={faLocationDot}
                                title={event.venue_name || "Venue not set"}
                                sub={event.venue_address || "—"}
                                tint="#EC4899"
                            />
                            <FactBox
                                icon={faHeart}
                                title={event.category?.name ?? "—"}
                                sub="Event Category"
                                tint="#F59E0B"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="overflow-x-auto">
                <TabsList variant="line" className="h-auto gap-0 border-b border-border p-0">
                    {TABS.map((t) => (
                        <TabsTrigger
                            key={t.value}
                            value={t.value}
                            className="h-auto rounded-none px-4 py-3 text-[13px] data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:after:bg-primary data-[state=active]:after:opacity-100"
                        >
                            {t.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {/* ── Overview ────────────────────────────────────────────────── */}
            {tab === "overview" && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
                    <div className="flex min-w-0 flex-col gap-5">
                        <Panel title="Basic Information">
                            <Row label="Event Category" value={event.category?.name ?? "—"} />
                            <Row label="Tagline" value={event.tagline || "—"} />
                            <Row label="Short Description" value={event.description || "—"} />
                        </Panel>

                        <Panel title="Date & Time">
                            <Row label="Start Date" value={fmt(event.start_date)} />
                            <Row label="End Date" value={fmt(event.end_date)} />
                            <Row label="Start Time" value={formatTime(event.start_time)} />
                            <Row label="End Time" value={formatTime(event.end_time)} />
                            <Row label="Time Zone" value={event.timezone || "—"} />
                        </Panel>
                    </div>

                    <div className="flex min-w-0 flex-col gap-5">
                        <Panel title="Event Status">
                            <div className="flex items-start justify-between gap-3 py-1.5">
                                <span className="shrink-0 text-[12px] text-muted-foreground">Status</span>
                                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                                    <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                                    {status.label}
                                </span>
                            </div>
                            <Row label="Created On" value={fmt(event.created_at)} />
                            <Row label="Last Updated" value={fmt(event.updated_at)} />
                            <div className="flex items-start justify-between gap-3 py-1.5">
                                <span className="shrink-0 text-[12px] text-muted-foreground">Event Privacy</span>
                                <span className="flex items-center gap-1.5 text-[12.5px] font-medium capitalize text-foreground">
                                    <FontAwesomeIcon
                                        icon={PRIVACY_ICON[event.privacy] ?? faLock}
                                        className="!size-[10px] text-muted-foreground"
                                    />
                                    {event.privacy}
                                </span>
                            </div>
                        </Panel>

                        <Panel title="RSVP Summary">
                            {rsvp.isLoading ? (
                                <Skeleton className="h-[160px] w-full rounded-md" />
                            ) : totalRsvp === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-6 text-center">
                                    <FontAwesomeIcon icon={faUsers} className="!size-[22px] text-muted-foreground/40" />
                                    <p className="text-[12.5px] font-semibold text-foreground">No RSVPs yet</p>
                                    <p className="max-w-[220px] text-[11.5px] text-muted-foreground">
                                        Add guests to this event and their responses appear here.
                                    </p>
                                    <Button asChild size="sm" className="mt-1 h-8 text-[12px]">
                                        <Link href={`/dashboard/guests/add`}>Add a guest</Link>
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-4 py-2">
                                    <div className="relative h-[132px] w-[132px] shrink-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={donut} dataKey="value" nameKey="label"
                                                    innerRadius={44} outerRadius={64} strokeWidth={0}>
                                                    {donut.map((s) => <Cell key={s.key} fill={s.color} />)}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                        {/* Centre label as DOM, not an SVG <text> — it
                                            inherits the app font and stays readable. */}
                                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-[20px] font-bold leading-none tabular-nums text-foreground">
                                                {totalRsvp}
                                            </span>
                                            <span className="mt-0.5 text-[10px] text-muted-foreground">Total</span>
                                        </div>
                                    </div>

                                    <ul className="flex min-w-0 flex-1 flex-col gap-3">
                                        {RSVP_SLICES.map((s) => {
                                            const value = (rsvp.data?.[s.key] as number | undefined) ?? 0;
                                            const pct = totalRsvp ? Math.round((value / totalRsvp) * 100) : 0;
                                            return (
                                                <li key={s.key} className="min-w-0">
                                                    <p className="flex items-center gap-2 text-[12px] text-foreground">
                                                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                                                        {s.label}
                                                    </p>
                                                    <p className="ml-4 text-[11.5px] tabular-nums text-muted-foreground">
                                                        {pct}% ({value})
                                                    </p>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}
                        </Panel>
                    </div>

                    <div className="flex min-w-0 flex-col gap-5">
                        <Panel title="Quick Links">
                            <div className="flex flex-col gap-2 pt-1">
                                <QuickLink icon={faUsers} label="View Guests" href={`/dashboard/guests?event=${event.id}`} />
                                <QuickLink icon={faSquareCheck} label="View RSVPs" onClick={() => setTab("rsvps")} />
                                {/* Held by decision — see the Messages tab. */}
                                <QuickLink icon={faComments} label="Send Message" soon />
                                <QuickLink icon={faQrcode} label="Download QR Code" onClick={() => setQrOpen(true)} />
                            </div>
                        </Panel>

                        <Panel title="Design">
                            <Row label="Template" value={themeName(event.theme_id)} />
                            <div className="flex items-center justify-between gap-3 py-1.5">
                                <span className="text-[12px] text-muted-foreground">Primary colour</span>
                                <span className="flex items-center gap-2">
                                    <span className="h-4 w-4 rounded-full border border-border"
                                        style={{ backgroundColor: event.primary_color ?? undefined }} />
                                    <span className="text-[12.5px] font-medium uppercase text-foreground">
                                        {event.primary_color || "—"}
                                    </span>
                                </span>
                            </div>
                            <Row label="Plan" value={event.plan?.name ?? "—"} />
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

            {/* ── Schedule ────────────────────────────────────────────────── */}
            {tab === "schedule" && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <Panel title="Date & Time">
                        <Row label="Start Date" value={fmt(event.start_date)} />
                        <Row label="End Date" value={fmt(event.end_date)} />
                        <Row label="Start Time" value={formatTime(event.start_time)} />
                        <Row label="End Time" value={formatTime(event.end_time)} />
                        <Row label="Time Zone" value={event.timezone || "—"} />
                    </Panel>

                    <AgendaPanel event={event} />
                </div>
            )}

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
                                <Link href={`/dashboard/events/${event.id}/edit`}>Edit event</Link>
                            </Button>
                        </div>
                    )}
                </Panel>
            )}

            {/* ── Gallery ─────────────────────────────────────────────────── */}
            {tab === "gallery" && <GalleryPanel eventId={event.id} />}

            {/* ── Family ──────────────────────────────────────────────────── */}
            {tab === "family" && <FamilyPanel event={event} />}

            {/* ── Settings ────────────────────────────────────────────────── */}
            {tab === "settings" && <SettingsPanel event={event} />}

            {tab === "rsvps" && (
                <div className="flex flex-col gap-5">
                    {participantCap.data?.limit != null && (
                        <Card className="min-w-0 border border-border py-0 shadow-none">
                            <CardContent className="p-4">
                                <PlanUsageBar
                                    label="Participants on this event (plan's Max RSVP per event)"
                                    used={participantCap.data.used}
                                    limit={participantCap.data.limit}
                                />
                            </CardContent>
                        </Card>
                    )}
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        <MiniTile label="Accepted" value={rsvp.data?.accepted ?? 0} icon={faCircleCheck} color="#22C55E" />
                        <MiniTile label="Pending" value={rsvp.data?.pending ?? 0} icon={faMinus} color="#F59E0B" />
                        <MiniTile label="Declined" value={rsvp.data?.declined ?? 0} icon={faXmark} color="#EF4444" />
                        <MiniTile label="Not Responded" value={rsvp.data?.not_responded ?? 0} icon={faUsers} color="#3B82F6" />
                    </div>

                    <Panel title="Guests on this event">
                        {guests.isLoading ? (
                            <div className="flex flex-col gap-2 py-2">
                                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
                            </div>
                        ) : (guests.data?.data ?? []).length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-8 text-center">
                                <FontAwesomeIcon icon={faUsers} className="!size-[22px] text-muted-foreground/40" />
                                <p className="text-[12.5px] font-semibold text-foreground">No guests yet</p>
                                <Button asChild size="sm" className="mt-1 h-8 text-[12px]">
                                    <Link href="/dashboard/guests/add">Add a guest</Link>
                                </Button>
                            </div>
                        ) : (
                            <>
                                <ul className="divide-y divide-border">
                                    {(guests.data?.data ?? []).map((guest) => (
                                        <li key={guest.id} className="flex items-center gap-3 py-2.5">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[12.5px] font-medium text-foreground break-words">{guest.name}</p>
                                                <p className="text-[11px] text-muted-foreground break-all">{guest.email}</p>
                                            </div>
                                            <Badge variant="secondary" className="shrink-0 rounded text-[10.5px] capitalize">
                                                {guest.rsvp_status.replace("_", " ")}
                                            </Badge>
                                        </li>
                                    ))}
                                </ul>
                                <Separator className="my-3" />
                                <Link href={`/dashboard/rsvps?event=${event.id}`}
                                    className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline">
                                    View all participants for this event
                                    <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                                </Link>
                            </>
                        )}
                    </Panel>
                </div>
            )}

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

            {/* ── Danger zone ─────────────────────────────────────────────── */}
            <Card className="border-destructive/25 py-0 shadow-none">
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-foreground">Delete this event</p>
                        <p className="text-[11.5px] text-muted-foreground break-words">
                            Its guests and its QR code go with it. This cannot be undone from here.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setConfirmDelete(true)}
                        className="h-9 shrink-0 rounded-md border-destructive/40 px-4 text-[12.5px] font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive"
                    >
                        <FontAwesomeIcon icon={faTrash} className="mr-2 !size-[11px]" />
                        Delete Event
                    </Button>
                </CardContent>
            </Card>

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

            {/* ── Delete confirm ──────────────────────────────────────────── */}
            <Dialog open={confirmDelete} onOpenChange={(v) => { if (!v && !remove.isPending) setConfirmDelete(v); }}>
                <DialogContent className="sm:max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle>Delete event?</DialogTitle>
                        <DialogDescription>
                            &ldquo;{event.name}&rdquo; will be removed, along with its guests and its QR code.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" className="h-10 rounded-md text-[13px]" disabled={remove.isPending}
                            onClick={() => setConfirmDelete(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive" className="h-10 rounded-md text-[13px] font-semibold"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(event.id, {
                                // Only leave on success — routing away after a
                                // failure would suggest it had gone.
                                onSuccess: () => router.push("/dashboard/events"),
                                onError: () => setConfirmDelete(false),
                            })}
                        >
                            {remove.isPending ? "Deleting..." : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* ── building blocks ────────────────────────────────────────────────────── */

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
    return (
        <Card className={cn("min-w-0 border border-border py-0 shadow-none", className)}>
            <CardContent className="p-5">
                <p className="text-[13px] font-bold text-foreground">{title}</p>
                <Separator className="my-3" />
                {children}
            </CardContent>
        </Card>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="shrink-0 text-[12px] text-muted-foreground">{label}</span>
            {/* break-words and a max width — a long description must wrap in the
                right column rather than push the label off the card. */}
            <span className="min-w-0 max-w-[62%] text-right text-[12.5px] font-medium capitalize text-foreground break-words">
                {value}
            </span>
        </div>
    );
}

function FactBox({
    icon, title, sub, tint,
}: {
    icon: typeof faCalendarDays; title: string; sub: string; tint: string;
}) {
    return (
        <div className="flex min-w-0 items-center gap-3 rounded-md border border-border p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
                style={{ backgroundColor: `${tint}1A` }}>
                <FontAwesomeIcon icon={icon} className="!size-[13px]" style={{ color: tint }} />
            </span>
            <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-foreground break-words">{title}</p>
                <p className="text-[11px] text-muted-foreground break-words">{sub}</p>
            </div>
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

function MiniTile({
    label, value, icon, color,
}: {
    label: string; value: number; icon: typeof faUsers; color: string;
}) {
    return (
        <Card className="min-w-0 border border-border py-0 shadow-none">
            <CardContent className="flex items-center gap-3 p-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
                    style={{ backgroundColor: `${color}1A` }}>
                    <FontAwesomeIcon icon={icon} className="!size-[12px]" style={{ color }} />
                </span>
                <div className="min-w-0">
                    <p className="text-[18px] font-bold leading-none tabular-nums text-foreground">{value}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground break-words">{label}</p>
                </div>
            </CardContent>
        </Card>
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
