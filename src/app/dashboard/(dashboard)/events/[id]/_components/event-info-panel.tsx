"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    BadgeCheck, CalendarDays, Clock, Contact, ExternalLink, FileText, Globe, Hash, Hourglass, ImageIcon, KeyRound, Layers, Lock, MapPin,
    MapPinned, MoreHorizontal, Palette, Pencil, QrCode, Share2, ShieldCheck, Smartphone, SquareCheck, Star, Tag, Timer, Users, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useDateFormatter } from "@/hooks/use-client-settings";
import { useEventOptions } from "@/hooks/use-client-portal";
import { useHomeScreenTemplates } from "@/hooks/use-home-screen-templates";
import { useEventHref } from "@/lib/event-workspace";
import type { ClientEvent } from "@/hooks/use-client-events";

/**
 * Event Info (Jamal's design, 2026-11-17): header card + Basic Information, Media & Design,
 * Date & Time (live countdown), Location Details, Event Visibility & Access.
 * Only fields the event really has are shown — State / Country / Guest Approval / Event Type from
 * the mockup have no data behind them yet, so they are left out rather than invented.
 */

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRIVACY: Record<string, { label: string; note: string; icon: LucideIcon }> = {
    public: { label: "Public", note: "Anyone with the event link can view", icon: Globe },
    unlisted: { label: "Unlisted", note: "Only people who have the link can view", icon: KeyRound },
    private: { label: "Private", note: "Invited guests only", icon: Lock },
};
const ACCESS: Record<string, string> = {
    public: "Via the event link or QR code",
    unlisted: "Via the event link only",
    private: "Invited guests only",
};

const time12 = (v: string | null) => {
    if (!v) return null;
    const [h, m] = v.split(":").map(Number);
    if (Number.isNaN(h)) return v;
    return `${String(h % 12 || 12).padStart(2, "0")}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const weekdayOf = (d: string | null) => (d ? WEEKDAY[new Date(`${String(d).slice(0, 10)}T00:00:00`).getDay()] : "");
const fileNameOf = (url: string | null) => {
    if (!url) return null;
    try { return decodeURIComponent(url.split("?")[0].split("/").pop() || "") || null; } catch { return url.split("/").pop() || null; }
};

/** "218 days 13 hours 41 minutes to go", ticking every minute. */
function useCountdown(event: ClientEvent) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(t);
    }, []);
    if (event.derived_status === "live") return { text: "Happening now", tone: "live" as const };
    if (event.derived_status === "past") return { text: "Event completed", tone: "past" as const };
    if (event.derived_status === "cancelled") return { text: "Event cancelled", tone: "past" as const };
    if (!event.start_date) return { text: "Date not set", tone: "past" as const };
    const start = new Date(`${String(event.start_date).slice(0, 10)}T${event.start_time || "00:00"}`).getTime();
    let mins = Math.max(0, Math.floor((start - now) / 60_000));
    const days = Math.floor(mins / 1440); mins -= days * 1440;
    const hours = Math.floor(mins / 60); mins -= hours * 60;
    const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
    return { text: `${part(days, "day")} ${part(hours, "hour")} ${part(mins, "minute")} to go`, tone: "soon" as const };
}

export function EventInfoPanel({ event, status, code, onShare, onQr }: {
    event: ClientEvent;
    status: { label: string; dot: string; className: string };
    code: string;
    onShare: () => void;
    onQr: () => void;
}) {
    const fmt = useDateFormatter();
    const href = useEventHref();
    const options = useEventOptions();
    const homeTemplates = useHomeScreenTemplates(event.event_category_id);
    const countdown = useCountdown(event);
    const privacy = PRIVACY[event.privacy] ?? PRIVACY.private;
    const cover = event.cover_image || event.invitation_image || event.venue_image || null;
    const template = options.data?.templates?.find((t) => t.code === event.theme_id)?.name || null;
    const homeTemplate = homeTemplates.data?.templates?.find((t) => t.id === event.home_screen_template_id)?.name || null;
    const hosts = [event.host_one, event.host_two].map((h) => h?.trim()).filter(Boolean).join(" & ") || null;
    const rsvpOn = (event.menus ?? []).some((m) => m.slug === "rsvp");
    const city = event.venue_landmark?.trim() || null;
    const mapLink = event.venue_map_link
        || (event.venue_lat && event.venue_lng ? `https://www.google.com/maps?q=${event.venue_lat},${event.venue_lng}` : null);
    const dateLine = event.start_date
        ? `${fmt(event.start_date)} (${weekdayOf(event.start_date)})${event.end_date && event.end_date !== event.start_date ? ` – ${fmt(event.end_date)} (${weekdayOf(event.end_date)})` : ""}`
        : null;
    const swatches = [event.primary_color, event.secondary_color].filter((c): c is string => !!c);

    return (
        <div className="flex flex-col gap-4">
            {/* ── Header card ── */}
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:flex-row md:items-start">
                <div className="h-[112px] w-full shrink-0 overflow-hidden rounded-lg bg-muted md:w-[150px]">
                    {cover
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={cover} alt="" className="size-full object-cover" />
                        : <div className="grid size-full place-items-center text-muted-foreground"><ImageIcon className="size-7" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[22px] leading-tight font-bold break-words">{event.name}</h2>
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold", status.className)}>
                            <span className={cn("size-1.5 rounded-full", status.dot)} /> {status.label}
                        </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-foreground/85">
                        {dateLine && <span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-muted-foreground" /> {dateLine}</span>}
                        {(event.venue_name || city) && (
                            <span className="flex items-center gap-1.5"><MapPin className="size-4 text-muted-foreground" /> {[event.venue_name, city].filter(Boolean).join(", ")}</span>
                        )}
                        {event.category?.name && <span className="flex items-center gap-1.5"><Layers className="size-4 text-muted-foreground" /> {event.category.name}</span>}
                    </div>
                    {(event.tagline || event.description) && (
                        <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">{event.tagline || event.description}</p>
                    )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                    <Button size="sm" className="h-9" onClick={onShare}><Share2 className="size-4" /> Share Event</Button>
                    <Button size="sm" variant="outline" className="h-9" asChild>
                        <Link href={href(`/dashboard/events/${event.id}/edit`)}><Pencil className="size-4" /> {event.status === "draft" ? "Continue Editing" : "Edit Event"}</Link>
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" asChild>
                        <Link href={`?tab=guests`} scroll={false}><Users className="size-4" /> Manage Guests</Link>
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="outline" className="size-9" aria-label="More actions"><MoreHorizontal className="size-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-auto min-w-44">
                            <DropdownMenuItem onClick={onQr}><QrCode className="size-4" /> Event QR Code</DropdownMenuItem>
                            <DropdownMenuItem asChild><Link href="?tab=rsvps" scroll={false}><SquareCheck className="size-4" /> View RSVPs</Link></DropdownMenuItem>
                            <DropdownMenuItem asChild><Link href="?tab=activity" scroll={false}><Clock className="size-4" /> Activity Log</Link></DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Two independent columns, as the design: left Basic Information + Date & Time; right Media & Design,
                Location Details, Event Visibility & Access — no card stretches to its neighbour's height. */}
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                <div className="flex flex-col gap-4">
                {/* ── Basic Information ── */}
                <InfoCard title="Basic Information" icon={FileText}>
                    <IRow icon={Hash} label="Event ID" value={code} />
                    <IRow icon={Pencil} label="Event Name" value={event.name} />
                    <IRow icon={Layers} label="Category" value={event.category?.name} />
                    <IRow icon={privacy.icon} label="Privacy" value={<span className="flex flex-wrap items-center gap-2"><Pill tone="violet" icon={privacy.icon}>{privacy.label}</Pill><span className="text-[12px] text-muted-foreground">{privacy.note}</span></span>} />
                    <IRow icon={Users} label="Host / Couple Names" value={hosts} />
                    <IRow icon={Star} label="Short Description" value={event.tagline} />
                    <IRow icon={FileText} label="Full Description" value={event.description ? <span className="whitespace-pre-line">{event.description}</span> : null} />
                    <IRow icon={CalendarDays} label="Created On" value={fmt(event.created_at, true)} />
                    <IRow icon={CalendarDays} label="Last Updated" value={fmt(event.updated_at, true)} />
                    <IRow icon={BadgeCheck} label="Status" value={<span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold", status.className)}><span className={cn("size-1.5 rounded-full", status.dot)} /> {status.label}</span>} />
                </InfoCard>

                {/* ── Date & Time ── */}
                <InfoCard title="Date & Time" icon={CalendarDays}>
                    <IRow icon={CalendarDays} label="Event Date" value={dateLine} />
                    <IRow icon={Clock} label="Start Time" value={time12(event.start_time)} />
                    <IRow icon={Clock} label="End Time" value={time12(event.end_time)} />
                    <IRow icon={Globe} label="Time Zone" value={event.timezone} />
                    <IRow icon={Hourglass} label="Countdown Status" value={
                        <Pill tone={countdown.tone === "soon" ? "primary" : countdown.tone === "live" ? "success" : "muted"} icon={Timer}>{countdown.text}</Pill>
                    } />
                </InfoCard>
                </div>

                <div className="flex flex-col gap-4">
                {/* ── Media & Design ── */}
                <InfoCard title="Media & Design" icon={ImageIcon}>
                    <IRow icon={ImageIcon} label="Cover Image" value={cover ? (
                        <span className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={cover} alt="" className="h-11 w-16 rounded-md object-cover" />
                            <span className="min-w-0 flex-1 truncate text-[12.5px]" title={fileNameOf(cover) ?? undefined}>{fileNameOf(cover)}</span>
                            <Button size="sm" variant="outline" className="h-7 shrink-0 text-[12px]" asChild>
                                <a href={cover} target="_blank" rel="noreferrer">View <ExternalLink className="size-3" /></a>
                            </Button>
                        </span>
                    ) : null} />
                    <IRow icon={Layers} label="Invitation Template" value={template} />
                    <IRow icon={Palette} label="Color Palette" value={swatches.length ? (
                        <span className="flex items-center gap-2">
                            {swatches.map((c) => <span key={c} title={c} className="size-6 rounded-full border border-border shadow-sm" style={{ background: c }} />)}
                        </span>
                    ) : null} />
                    <IRow icon={Smartphone} label="Home Screen Template" value={homeTemplate} />
                </InfoCard>



                {/* ── Location Details ── */}
                <InfoCard title="Location Details" icon={MapPin}>
                    <IRow icon={MapPinned} label="Venue Name" value={event.venue_name} />
                    <IRow icon={MapPin} label="Full Address" value={event.venue_address} />
                    <IRow icon={MapPinned} label="Google Map" value={mapLink ? (
                        <a href={mapLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">View on Google Maps <ExternalLink className="size-3" /></a>
                    ) : null} />
                    <IRow icon={Tag} label="City" value={city} />
                </InfoCard>

                {/* ── Event Visibility & Access ── */}
                <InfoCard title="Event Visibility & Access" icon={ShieldCheck}>
                    <IRow icon={Globe} label="Event Status" value={<span className="flex flex-wrap items-center gap-2"><Pill tone="violet" icon={privacy.icon}>{privacy.label}</Pill><span className="text-[12px] text-muted-foreground">{privacy.note}</span></span>} />
                    <IRow icon={SquareCheck} label="RSVP" value={<span className="flex flex-wrap items-center gap-2">
                        {rsvpOn ? <Pill tone="success" icon={BadgeCheck}>Enabled</Pill> : <Pill tone="muted">Not included</Pill>}
                        <span className="text-[12px] text-muted-foreground">{rsvpOn ? "Guests can confirm their attendance (RSVP)" : "RSVP is not one of this event's menus"}</span>
                    </span>} />
                    <IRow icon={Contact} label="Participant Access" value={<Pill tone="info" icon={KeyRound}>{ACCESS[event.privacy] ?? ACCESS.private}</Pill>} />
                </InfoCard>
                </div>
            </div>
        </div>
    );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

function InfoCard({ title, icon: Icon, children, className }: { title: string; icon: LucideIcon; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
            <div className="flex items-center gap-2.5 border-b border-border bg-primary/5 px-4 py-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
                <h3 className="text-[15px] font-bold">{title}</h3>
            </div>
            <div className="divide-y divide-border/70 px-4">{children}</div>
        </section>
    );
}

function IRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[minmax(150px,200px)_1fr] items-start gap-3 py-2.5 text-[13px]">
            <span className="flex items-center gap-2.5 font-medium text-foreground/80"><Icon className="size-4 shrink-0 text-muted-foreground" /> {label}</span>
            <span className="min-w-0 break-words text-foreground">{value || <span className="text-muted-foreground">—</span>}</span>
        </div>
    );
}

const PILL: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    info: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    muted: "bg-muted text-muted-foreground",
};
function Pill({ tone, icon: Icon, children }: { tone: keyof typeof PILL; icon?: LucideIcon; children: React.ReactNode }) {
    return (
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold", PILL[tone])}>
            {Icon && <Icon className="size-3.5" />} {children}
        </span>
    );
}
