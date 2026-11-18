"use client";

import { useState } from "react";
import Link from "next/link";
import {
    Activity, CalendarCheck2, CalendarDays, CalendarPlus, CalendarSearch, CheckCircle2, Clock, FileText, Info, Layers,
    Lock, PartyPopper, Play, Rocket, ShieldCheck, Star, Archive, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useBookings, useBookingSummary, type Booking } from "@/hooks/use-bookings";

/**
 * The dashboard's top half (Jamal's "Create Event updated v4" designs, 2026-11-19):
 *
 *   zero state     no booked date, no event      → Welcome + "No Event Date Booked Yet" + Getting Started
 *   initial state  a booked date, no event yet   → "Your event date is reserved!" + "Create Your Event Now"
 *   returning      events + a new booked date    → "New event date booked" + a Pending Setup card per booking
 *   after          events, nothing pending       → "Your event is ready to manage!"
 *
 * Four tiles in every state: Total Booked Dates (booked dates waiting + events), Draft, Published, Past.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayText = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return `${day} ${MONTHS[m - 1]} ${y} (${WEEK[new Date(`${d}T00:00:00`).getDay()]})`;
};
const bookingDates = (b: Booking) => (b.end_date && b.end_date !== b.start_date ? `${dayText(b.start_date)} – ${dayText(b.end_date)}` : dayText(b.start_date));
const atText = (iso: string) => {
    const d = new Date(iso);
    return `${dayText(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)} at ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
};
const createHref = (b: Booking) => `/dashboard/events/create?booking=${b.id}`;

export interface DashboardCounts {
    draft: number;
    published: number;
    past: number;
    total: number;
}

export function DashboardBookingState({ counts, loading }: { counts: DashboardCounts; loading: boolean }) {
    const summary = useBookingSummary();
    const reserved = useBookings("reserved");
    const all = useBookings();
    const [details, setDetails] = useState<Booking | null>(null);

    const waiting = reserved.data ?? [];
    const hasEvents = counts.total > 0;
    const busy = loading || summary.isLoading || reserved.isLoading;
    const state: "zero" | "initial" | "returning" | "after" = !hasEvents ? (waiting.length ? "initial" : "zero") : waiting.length ? "returning" : "after";

    const banner = {
        zero: { title: "Welcome to Event Invite! 👋", text: "You're all set to start managing your events. First, check date availability and book an event date, then create your event and share it with your guests." },
        initial: { title: "Your event date is reserved! 🎉", text: "You have successfully booked an event date. Complete your event setup any time before the event date." },
        returning: { title: "New event date booked — event setup pending ✨", text: "Your new event date has been allotted. Create the event any time before the booked date to start invitations and RSVP." },
        after: { title: "Your event is ready to manage! 🎉", text: "You've successfully booked a date and created your event. Now you can send invitations, track RSVPs, and follow your event activity all in one place." },
    }[state];

    const tiles: { label: string; value: number | undefined; Icon: LucideIcon; cls: string }[] = [
        { label: "Total Booked Dates", value: summary.data?.total_booked_dates, Icon: CalendarDays, cls: "bg-pink-50 text-pink-600" },
        { label: "Draft Events", value: counts.draft, Icon: FileText, cls: "bg-violet-50 text-violet-600" },
        { label: "Published Events", value: counts.published, Icon: Play, cls: "bg-emerald-50 text-emerald-600" },
        { label: "Past Events", value: counts.past, Icon: Archive, cls: "bg-sky-50 text-sky-600" },
    ];

    return (
        <>
            <div>
                <h1 className="text-[22px] font-bold leading-tight text-foreground">Organizer Dashboard</h1>
                <p className="text-[13px] text-muted-foreground">Manage your booked dates, create events, and track event activity from one place.</p>
            </div>

            {/* Banner */}
            <div className="relative flex items-center gap-5 overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 px-5 py-5">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/70 text-primary dark:bg-white/10"><PartyPopper className="h-8 w-8" /></span>
                <div className="min-w-0 flex-1 border-l border-primary/15 pl-5">
                    {busy ? <Skeleton className="h-6 w-72" /> : <p className="text-[19px] font-bold text-foreground">{banner.title}</p>}
                    <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">{busy ? <Skeleton className="h-4 w-96 max-w-full" /> : banner.text}</p>
                </div>
                <span className="hidden h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white/70 text-primary md:grid dark:bg-white/10"><CalendarCheck2 className="h-11 w-11" /></span>
            </div>

            {/* Tiles */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {tiles.map((t) => (
                    <div key={t.label} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", t.cls.split(" ")[0])}><t.Icon className={cn("h-5 w-5", t.cls.split(" ")[1])} /></span>
                        <div className="min-w-0">
                            <p className="truncate text-[12.5px] text-muted-foreground">{t.label}</p>
                            {busy ? <Skeleton className="mt-1 h-6 w-10" /> : <p className="text-[22px] font-bold leading-tight tabular-nums text-foreground">{(t.value ?? 0).toLocaleString()}</p>}
                        </div>
                    </div>
                ))}
            </div>

            {!busy && state === "zero" && <ZeroState />}
            {!busy && state === "initial" && waiting[0] && <InitialState booking={waiting[0]} more={waiting.slice(1)} onDetails={setDetails} activity={all.data ?? []} />}
            {!busy && state === "returning" && (
                <div className="flex flex-col gap-3">
                    {waiting.map((b) => <PendingSetup key={b.id} booking={b} onDetails={setDetails} />)}
                </div>
            )}

            <BookingDetails booking={details} onClose={() => setDetails(null)} />
        </>
    );
}

/* ── Zero state (mockup 1) ───────────────────────────────────────────────── */

function ZeroState() {
    return (
        <>
            <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
                <Card className="items-center gap-0 rounded-xl border px-6 py-8 text-center shadow-none">
                    <Illustration icon={CalendarSearch} />
                    <p className="mt-4 text-[22px] font-bold text-foreground">No Event Date Booked Yet</p>
                    <p className="mt-1 max-w-md text-[13px] text-muted-foreground">You haven&apos;t booked any event date yet. To create an event, you must first check date availability and book a date.</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                        <Button asChild className="h-10 px-6 font-semibold"><Link href="/dashboard/events/check-availability"><CalendarDays className="mr-1.5 h-4 w-4" />Check Event Availability</Link></Button>
                        <Button asChild variant="outline" className="h-10 px-6 font-semibold"><a href="#how-it-works"><Play className="mr-1.5 h-4 w-4" />View How It Works</a></Button>
                    </div>
                </Card>
                <Steps
                    id="how-it-works" icon={Rocket} title="Getting Started" text="Follow these simple steps to create and publish your first event."
                    steps={[
                        ["Book event date", "Check availability and book your preferred event date."],
                        ["Complete payment/plan", "Confirm your booking by completing the payment or activating a suitable plan."],
                        ["Create event", "Add event details, customize, and publish your event for your guests."],
                    ]}
                />
            </div>
            <RecentActivity items={[]} />
        </>
    );
}

/* ── Initial state (mockup 2) ────────────────────────────────────────────── */

function InitialState({ booking, more, onDetails, activity }: { booking: Booking; more: Booking[]; onDetails: (b: Booking) => void; activity: Booking[] }) {
    return (
        <>
            <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
                <Card className="items-center gap-0 rounded-xl border px-6 py-6 text-center shadow-none">
                    <Illustration icon={CalendarCheck2} done />
                    <p className="mt-4 text-[22px] font-bold text-foreground">Event Date Allotted — Create Your Event Now</p>
                    <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">Your event date is reserved, but you haven&apos;t created the event yet. Set up your event details now and publish your invitation for your guests.</p>
                    <div className="mt-4 grid w-full grid-cols-2 gap-3 rounded-xl border px-3 py-3 text-left md:grid-cols-4">
                        <Fact icon={CalendarDays} label="Event Date" value={bookingDates(booking)} />
                        <Fact icon={Layers} label="Booking Type" value={booking.booking_type} />
                        <Fact icon={Star} label="Selected Plan" value={booking.plan.name} />
                        <Fact icon={ShieldCheck} label="Slot Status" value={<ReservedChip />} />
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><Info className="h-3.5 w-3.5" />You can create the event anytime before the event date.</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-3">
                        <Button asChild className="h-10 px-8 font-semibold"><Link href={createHref(booking)}><CalendarPlus className="mr-1.5 h-4 w-4" />Create Event Now</Link></Button>
                        <Button variant="outline" className="h-10 px-8 font-semibold" onClick={() => onDetails(booking)}><Play className="mr-1.5 h-4 w-4" />View Booking Details</Button>
                    </div>
                </Card>
                <Steps
                    icon={Rocket} title="Next Steps" text="Follow these simple steps to set up and publish your event."
                    steps={[
                        ["Complete event details", "Add event information such as title, venue, time, and other key details."],
                        ["Choose menus and theme", "Select your food menus and a beautiful invitation theme that fits your event."],
                        ["Preview and publish invitation", "Review your event, make any final changes, and publish the invitation for your guests."],
                    ]}
                />
            </div>
            {more.map((b) => <PendingSetup key={b.id} booking={b} onDetails={onDetails} />)}
            <p className="flex items-center gap-4 rounded-xl border border-primary/20 bg-primary/5 px-5 py-3.5 text-[13px]">
                <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
                <span className="border-l border-primary/20 pl-4"><b className="text-primary">Your booking slot is secured.</b> <span className="text-muted-foreground">The event will remain in pending setup until you create it.</span></span>
            </p>
            <RecentActivity items={activity} />
        </>
    );
}

/* ── Returning client with a new booked date (mockup 3) ─────────────────── */

function PendingSetup({ booking, onDetails }: { booking: Booking; onDetails: (b: Booking) => void }) {
    return (
        <Card className="gap-0 rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-none xl:max-w-4xl">
            <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></span>
                <div>
                    <p className="text-[17px] font-bold text-foreground">Pending Setup: Create Your New Event</p>
                    <p className="text-[13px] text-muted-foreground">You have a booked date with no event created yet. Set up your event now to start invitations and RSVP.</p>
                </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg bg-card/70 p-3">
                <span className="relative hidden h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:grid"><CalendarPlus className="h-9 w-9" /></span>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <Fact icon={CalendarDays} label="Event Date" value={bookingDates(booking)} />
                        <Fact icon={Layers} label="Booking Type" value={booking.booking_type} />
                        <Fact icon={Star} label="Plan" value={booking.plan.name} />
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12.5px] font-semibold text-emerald-700"><Lock className="h-3.5 w-3.5" />Slot Reserved</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Button asChild className="h-10 min-w-56 font-semibold"><Link href={createHref(booking)}><CalendarPlus className="mr-1.5 h-4 w-4" />Create Event Now</Link></Button>
                        <Button variant="outline" className="h-10 min-w-48 font-semibold" onClick={() => onDetails(booking)}><Play className="mr-1.5 h-4 w-4" />View Booking</Button>
                    </div>
                </div>
            </div>
        </Card>
    );
}

/* ── Small parts ─────────────────────────────────────────────────────────── */

function Illustration({ icon: Icon, done }: { icon: LucideIcon; done?: boolean }) {
    return (
        <span className="relative grid h-28 w-36 place-items-center rounded-[48%] bg-primary/10">
            <Icon className="h-16 w-16 text-primary" strokeWidth={1.6} />
            {done && <span className="absolute bottom-3 right-6 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"><CheckCircle2 className="h-5 w-5" /></span>}
        </span>
    );
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: React.ReactNode }) {
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <Icon className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
                <p className="text-[11.5px] text-muted-foreground">{label}</p>
                <div className="text-[13.5px] font-bold text-foreground">{value}</div>
            </div>
        </div>
    );
}

function ReservedChip() {
    return <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Reserved</span>;
}

function Steps({ id, icon: Icon, title, text, steps }: { id?: string; icon: LucideIcon; title: string; text: string; steps: [string, string][] }) {
    return (
        <Card id={id} className="gap-0 rounded-xl border p-5 shadow-none scroll-mt-20">
            <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                <div><p className="text-[18px] font-bold text-foreground">{title}</p><p className="text-[12.5px] text-muted-foreground">{text}</p></div>
            </div>
            <ol className="mt-4 flex flex-col">
                {steps.map(([t, d], i) => (
                    <li key={t} className="flex gap-4">
                        <div className="flex flex-col items-center">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-[14px] font-bold text-primary">{i + 1}</span>
                            {i < steps.length - 1 && <span className="my-1 w-px flex-1 border-l-2 border-dotted border-primary/30" aria-hidden />}
                        </div>
                        <div className={cn(i < steps.length - 1 && "pb-4")}>
                            <p className="text-[14px] font-bold text-foreground">{t}</p>
                            <p className="text-[12.5px] text-muted-foreground">{d}</p>
                        </div>
                    </li>
                ))}
            </ol>
        </Card>
    );
}

function RecentActivity({ items }: { items: Booking[] }) {
    return (
        <Card className="gap-0 rounded-xl border p-5 shadow-none">
            <div className="flex items-start gap-3">
                <Activity className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div><p className="text-[16px] font-bold text-foreground">Recent Activity</p><p className="text-[12.5px] text-muted-foreground">A timeline of your latest actions, such as bookings, event creations, and updates.</p></div>
            </div>
            {items.length === 0 ? (
                <div className="mt-4 flex flex-col items-center rounded-xl border px-4 py-6 text-center">
                    <Clock className="h-9 w-9 text-muted-foreground/60" />
                    <p className="mt-2 text-[14px] font-bold text-foreground">No activity yet</p>
                    <p className="text-[12.5px] text-muted-foreground">Your event activity will appear here once you book a date or create an event.</p>
                </div>
            ) : (
                <ul className="mt-4 flex flex-col gap-2">
                    {items.slice(0, 5).map((b) => (
                        <li key={b.id} className="flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></span>
                            <div className="min-w-[200px] flex-1">
                                <p className="text-[14px] font-bold text-foreground">{b.status === "used" ? "Event created from booked date" : "Event date booked successfully"}</p>
                                <p className="text-[12px] text-muted-foreground">{atText(b.used_at ?? b.booked_at)}</p>
                            </div>
                            <p className="max-w-md text-[12.5px] text-muted-foreground md:border-l md:pl-4">
                                {b.status === "used" ? `Your event for ${dayText(b.start_date)} has been created.` : "No event has been created yet. Create your event to set up the details and publish the invitation."}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

function BookingDetails({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
    return (
        <Dialog open={!!booking} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Booking Details</DialogTitle></DialogHeader>
                {booking && (
                    <div className="flex flex-col gap-4">
                        <dl className="divide-y rounded-lg border px-4 text-[13px]">
                            {([
                                ["Event Date", bookingDates(booking)],
                                ["Booking Type", booking.booking_type],
                                ["Plan", booking.plan.name],
                                ["Payment", booking.payment_status === "free" ? "Free plan — no payment" : booking.payment_status === "pending" ? "Payment details saved — awaiting confirmation" : "Paid"],
                                ["Slot Status", "Reserved"],
                                ["Booked On", atText(booking.booked_at)],
                            ] as const).map(([k, v]) => (
                                <div key={k} className="flex items-start justify-between gap-4 py-2.5">
                                    <dt className="text-muted-foreground">{k}</dt><dd className="text-right font-semibold text-foreground">{v}</dd>
                                </div>
                            ))}
                        </dl>
                        <Button asChild className="h-10 font-semibold"><Link href={createHref(booking)}><CalendarPlus className="mr-1.5 h-4 w-4" />Create Event Now</Link></Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
