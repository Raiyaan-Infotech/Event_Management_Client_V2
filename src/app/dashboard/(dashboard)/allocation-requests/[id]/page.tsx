"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
    ArrowLeft, Bell, CalendarDays, CalendarPlus, CalendarRange, Check, CheckCircle2, Clock, FileText, Gavel, Headphones, Info,
    Layers, Mail, MessageSquare, Phone, ShieldCheck, User, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/common/page-loader";
import { cn } from "@/lib/utils";
import { useMyAllocationRequest, type AllocationRequest } from "@/hooks/use-event-availability";
import { RequestStatusChip, daysBetween, prettyDate, prettyDateTime, prettyRange, weekday } from "../shared";

/**
 * One allocation request (Jamal's designs Organizer\Event Allocation, 2026-11-14):
 *   pending   → Tracking (progress steps, daily availability, expected response)
 *   approved  → exception allocation table + Continue Event Creation (until used / expired)
 *   rejected  → rejection reason + Choose Alternative Dates
 */

const open = (s: string) => s === "available" || s === "low";
const DAY_TEXT: Record<string, string> = { full: "Fully Booked", disabled: "Not Available", not_configured: "Not Open" };

export default function AllocationRequestPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { data: r, isLoading, isError } = useMyAllocationRequest(Number(id) || null);
    // Read once when the page opens (render must stay pure).
    const [now] = useState(() => Date.now());

    if (isLoading) return <PageLoader text="Loading..." />;
    if (isError || !r) {
        return (
            <div className="py-16 text-center text-[13px] text-muted-foreground">
                Request not found. <Link href="/dashboard/allocation-requests" className="font-semibold text-primary hover:underline">Back to Requests</Link>
            </div>
        );
    }

    const days = r.days ?? [];
    const total = daysBetween(r.start_date, r.end_date);
    const exDates = r.decision?.dates ?? [];
    const slots = r.decision?.exception_slots ?? 1;
    const expired = !!r.decision?.expires_at && Date.parse(r.decision.expires_at) < now;
    const used = !!r.decision?.used_event_id;
    const createHref = `/dashboard/events/create?start=${r.start_date}${r.end_date !== r.start_date ? `&end=${r.end_date}` : ""}`;
    const title = r.status === "pending" ? "Event Allocation Request – Tracking" : r.status === "approved" ? "Event Allocation Request" : "Event Allocation Request Details";
    const subtitle = r.status === "pending" ? "Track the status of your event booking allocation request."
        : r.status === "approved" ? "Track the status of your event availability request and continue creating your event after approval."
            : "Track the status of your event date allocation request and take the next action.";

    return (
        <div className="flex flex-col gap-4 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></span>
                    <div>
                        <h1 className="text-[20px] font-bold leading-tight text-foreground">{title}</h1>
                        <p className="text-[12.5px] text-muted-foreground">{subtitle}</p>
                    </div>
                </div>
                <Button asChild variant="outline" className="h-9 text-[12.5px]"><Link href="/dashboard/allocation-requests"><ArrowLeft className="mr-1.5 h-4 w-4" />Back to Requests</Link></Button>
            </div>

            {r.status === "approved" && (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                    <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" />
                    <div><p className="text-[16px] font-bold text-foreground">Your Request Has Been Approved!</p>
                        <p>An exception allocation has been granted for the unavailable date(s) in your request.</p></div>
                </div>
            )}

            {/* Summary strip */}
            <Card className="grid gap-4 rounded-lg border p-4 shadow-none md:grid-cols-2 xl:grid-cols-4">
                <div><p className="text-[11.5px] text-muted-foreground">Request ID</p><p className="mt-0.5 inline-block rounded bg-primary/10 px-2 py-0.5 text-[13px] font-bold text-primary">{r.ticket_no}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">{r.booking_type === "multiple" ? "Multi Date Event" : "Single Date Event"}</p></div>
                <div><p className="text-[11.5px] text-muted-foreground">Contact Details</p><p className="mt-0.5 flex items-center gap-1.5 font-semibold"><User className="h-3.5 w-3.5" />{r.contact_name}</p>
                    {r.contact_mobile && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{r.contact_mobile}</p>}
                    {r.contact_email && <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{r.contact_email}</p>}</div>
                <div><p className="text-[11.5px] text-muted-foreground">Requested Date Range</p><p className="mt-0.5 text-[14px] font-bold">{prettyRange(r.start_date, r.end_date)}</p>
                    <span className="mt-1 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">{total} {total === 1 ? "Day" : "Days"}</span></div>
                <div><RequestStatusChip status={r.status} big />
                    <p className="mt-1 text-[12px] text-muted-foreground">
                        {r.status === "pending" ? "Your request is under review by the Super Admin." : `Decision on ${prettyDateTime(r.decided_at)}`}
                    </p></div>
            </Card>

            {r.status === "pending" && <Pending r={r} days={days} />}
            {r.status === "approved" && <Approved r={r} days={days} exDates={exDates} slots={slots} expired={expired} used={used} createHref={createHref} />}
            {r.status === "rejected" && <Rejected r={r} days={days} total={total} />}
        </div>
    );
}

type Day = NonNullable<AllocationRequest["days"]>[number];

function Section({ icon, title, children, className }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
    return (
        <Card className={cn("gap-0 rounded-lg border p-4 shadow-none", className)}>
            <h2 className="mb-2.5 flex items-center gap-2 text-[14.5px] font-semibold text-foreground [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-primary">{icon}{title}</h2>
            {children}
        </Card>
    );
}

function StatusPill({ d }: { d: Day }) {
    return open(d.status)
        ? <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Available</span>
        : <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-600"><XCircle className="h-3 w-3" />{DAY_TEXT[d.status] ?? "Not Available"}</span>;
}

/* ───────────────────────────── pending: tracking ───────────────────────────── */

function Pending({ r, days }: { r: AllocationRequest; days: Day[] }) {
    const steps = [
        { label: "Request Submitted", sub: prettyDateTime(r.created_at), state: "done" },
        { label: "Under Review", sub: "", state: "current" },
        { label: "Decision", sub: "(Approval / Rejection)", state: "todo" },
        { label: "Completed", sub: "", state: "todo" },
    ];
    return (
        <>
            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr] xl:items-start">
                <Section icon={<CalendarDays />} title="Daily Availability (Requested Dates)">
                    <div className="overflow-hidden rounded-lg border">
                        <table className="w-full text-[12.5px]">
                            <thead className="bg-muted/40 text-left text-[11.5px] font-semibold text-muted-foreground">
                                <tr>{["Date", "Day", "Daily Limit", "Booked", "Available", "Status"].map((h) => <th key={h} className="px-2.5 py-2">{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {days.map((d) => (
                                    <tr key={d.date} className={cn("border-t", !open(d.status) && "bg-red-50/50")}>
                                        <td className="px-2.5 py-2 font-semibold">{prettyDate(d.date)}</td>
                                        <td className="px-2.5 py-2">{weekday(d.date).slice(0, 3)}</td>
                                        <td className="px-2.5 py-2">{d.status === "not_configured" ? "—" : d.daily_max}</td>
                                        <td className="px-2.5 py-2">{d.booked}</td>
                                        <td className="px-2.5 py-2"><span className={cn("rounded px-2 py-0.5 font-semibold", open(d.status) ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>{d.balance}</span></td>
                                        <td className="px-2.5 py-2"><StatusPill d={d} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>
                <Section icon={<Layers />} title="Request Progress">
                    <Stepper steps={steps} />
                    <p className="mt-3 flex items-start gap-2 rounded-md bg-primary/5 px-3 py-2 text-[12.5px]">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span><b className="text-primary">Current Step: Under Review.</b> The Super Admin is reviewing your request and checking availability, event limits and capacity for the selected dates.</span>
                    </p>
                </Section>
            </div>
            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr] xl:items-start">
                <Section icon={<FileText />} title="Request Information">
                    <dl className="divide-y">
                        <Line icon={<CalendarDays />} label="Submitted On" value={prettyDateTime(r.created_at)} />
                        <Line icon={r.contact_method === "call" ? <Phone /> : <Mail />} label="Contact Method" value={r.contact_method === "call" ? `Call back · ${r.preferred_call_time ?? ""}` : `Email · ${r.subject ?? ""}`} />
                        <Line icon={<MessageSquare />} label="Request Reason" value={r.message} />
                    </dl>
                </Section>
                <Section icon={<Clock />} title="Expected Response" className="bg-sky-50/40">
                    <p>You will receive a decision (Approval or Rejection) within <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary">24 – 48 hours</span> from the time of submission.</p>
                </Section>
            </div>
            <div><Button asChild variant="outline" className="h-9 border-primary/50 text-[12.5px] font-semibold text-primary hover:bg-primary/5 hover:text-primary">
                <Link href="/dashboard/events/check-availability"><CalendarRange className="mr-1.5 h-4 w-4" />Check Other Dates</Link></Button></div>
        </>
    );
}

/* ───────────────────────────── approved ───────────────────────────── */

function Approved({ r, days, exDates, slots, expired, used, createHref }: { r: AllocationRequest; days: Day[]; exDates: string[]; slots: number; expired: boolean; used: boolean; createHref: string }) {
    const steps = [
        { label: "Request Submitted", sub: prettyDateTime(r.created_at), state: "done" },
        { label: "Under Review", sub: "", state: "done" },
        { label: "Approved", sub: prettyDateTime(r.decided_at), state: "done" },
        { label: "Event Creation", sub: used ? `Done · ${prettyDateTime(r.decision?.used_at)}` : "(Pending)", state: used ? "done" : "todo" },
    ];
    return (
        <>
            <Section icon={<Layers />} title="Daily Availability Summary">
                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full whitespace-nowrap text-[12.5px]">
                        <thead className="bg-muted/40 text-left text-[11.5px] font-semibold text-muted-foreground">
                            <tr>{["Date", "Day", "Configured Limit", "Booked", "Balance (Before)", "Allocation (Exception)", "Final Balance", "Status"].map((h) => <th key={h} className="px-2.5 py-2">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                            {days.map((d) => {
                                const ex = exDates.includes(d.date);
                                return (
                                    <tr key={d.date} className={cn("border-t", ex && "bg-primary/5")}>
                                        <td className="px-2.5 py-2 font-semibold">{prettyDate(d.date)}</td>
                                        <td className="px-2.5 py-2">{weekday(d.date).slice(0, 3)}</td>
                                        <td className="px-2.5 py-2">{d.status === "not_configured" ? "—" : d.daily_max}</td>
                                        <td className="px-2.5 py-2">{d.booked}</td>
                                        <td className="px-2.5 py-2">{d.balance}</td>
                                        <td className="px-2.5 py-2">{ex ? <span className="rounded bg-primary/10 px-2 py-0.5 text-[11.5px] font-semibold text-primary">+{slots} (Approved)</span> : "–"}</td>
                                        <td className="px-2.5 py-2 font-semibold">{ex ? d.balance + slots : d.balance}</td>
                                        <td className="px-2.5 py-2">{ex
                                            ? <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary"><ShieldCheck className="h-3 w-3" />Exception Allocated</span>
                                            : <StatusPill d={d} />}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-[12.5px]">
                    <b className="flex items-center gap-1.5"><Layers className="h-4 w-4 text-primary" />Exception Allocation Details</b>
                    <span>Approved for: <b>{exDates.map(prettyDate).join(", ")}</b></span>
                    <span>Additional Slots: <b>{slots}</b></span>
                    <span>Valid Till: <b className={expired && !used ? "text-red-600" : ""}>{prettyDateTime(r.decision?.expires_at)}</b></span>
                </p>
            </Section>

            <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
                <Section icon={<Gavel />} title="Approval Reason">
                    <p className="rounded-md bg-primary/5 px-3 py-2">{r.decision_reason || "Approved."}</p>
                </Section>
                <Section icon={<Bell />} title="Notification Message">
                    <p className="rounded-md bg-primary/5 px-3 py-2 italic">&ldquo;Your event allocation request ({r.ticket_no}) for {prettyRange(r.start_date, r.end_date)} has been approved. {slots > 1 ? `${slots} additional event slots have` : "An additional event slot has"} been allocated for {exDates.map(prettyDate).join(", ")}. You can now continue to create your event.&rdquo;</p>
                </Section>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr] xl:items-center">
                <Section icon={<Clock />} title="Request Timeline"><Stepper steps={steps} green /></Section>
                <div className="flex flex-col gap-2">
                    {used ? (
                        <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Your event has been created with this allocation.</p>
                    ) : expired ? (
                        <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50/70 px-3 py-2.5 text-red-600"><Info className="mt-0.5 h-4 w-4 shrink-0" />This reservation expired on {prettyDateTime(r.decision?.expires_at)}. Please send a new request from Check Event Availability.</p>
                    ) : (
                        <Button asChild className="h-10 text-[13.5px] font-semibold"><Link href={createHref}><CalendarPlus className="mr-1.5 h-4 w-4" />Continue Event Creation</Link></Button>
                    )}
                    <Button asChild variant="outline" className="h-9 text-[12.5px]"><Link href="/dashboard/events/check-availability"><CalendarRange className="mr-1.5 h-4 w-4" />Check Event Availability</Link></Button>
                </div>
            </div>
        </>
    );
}

/* ───────────────────────────── rejected ───────────────────────────── */

function Rejected({ r, days, total }: { r: AllocationRequest; days: Day[]; total: number }) {
    const unavailable = days.filter((d) => !open(d.status)).length;
    return (
        <>
            <div className="grid gap-4 xl:grid-cols-[1fr_260px] xl:items-start">
                <Section icon={<CalendarDays />} title="Requested Dates & Availability">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {days.map((d) => (
                            <div key={d.date} className={cn("rounded-lg border p-2.5 text-center", open(d.status) ? "border-emerald-200" : "border-red-200 bg-red-50/60")}>
                                <p className={cn("font-bold", !open(d.status) && "text-red-600")}>{prettyDate(d.date)}</p>
                                <p className="text-[12px] text-muted-foreground">({weekday(d.date).slice(0, 3)})</p>
                                <p className={cn("mt-1.5 rounded px-2 py-1 text-[12px] font-semibold", open(d.status) ? "bg-emerald-50 text-emerald-700" : "text-red-600")}>
                                    {open(d.status) ? "Available" : <>Not Available<br /><span className="text-[11px] font-normal">({DAY_TEXT[d.status] ?? "Not Available"})</span></>}
                                </p>
                            </div>
                        ))}
                    </div>
                </Section>
                <Section icon={<CalendarDays />} title="Request Summary">
                    <dl className="divide-y">
                        <Line label="Total Days" value={total} />
                        <Line label="Available Days" value={total - unavailable} />
                        <Line label={<span className="font-semibold text-red-600">Unavailable Days</span>} value={<span className="text-red-600">{unavailable}</span>} />
                    </dl>
                </Section>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/60 px-4 py-3">
                <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-500" />
                <div><p className="text-[14.5px] font-bold text-foreground">Rejection Reason</p>
                    <p>{r.decision_reason || "The request could not be approved."}</p>
                    {r.decision?.category && <p className="mt-1 text-[12px] text-muted-foreground">Category: {r.decision.category}</p>}</div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
                <Section icon={<Headphones />} title="Contact Support Team">
                    <p>If you still wish to proceed for the same date or need a special allocation, send a new request from Check Event Availability → Contact Support. Our team will check the possibility and guide you with the next steps.</p>
                </Section>
                <Section icon={<Bell />} title="Notification Message">
                    <p className="rounded-md bg-primary/5 px-3 py-2 italic">&ldquo;Your event date allocation request ({r.ticket_no}) for {prettyRange(r.start_date, r.end_date)} has been rejected. Please choose alternative dates or contact our Support Team for assistance.&rdquo;</p>
                </Section>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
                <Button asChild variant="outline" className="h-10 border-primary/50 text-[13px] font-semibold text-primary hover:bg-primary/5 hover:text-primary">
                    <Link href="/dashboard/events/check-availability"><CalendarRange className="mr-1.5 h-4 w-4" />Choose Alternative Dates</Link></Button>
            </div>
        </>
    );
}

/* ───────────────────────────── bits ───────────────────────────── */

function Stepper({ steps, green }: { steps: { label: string; sub: string; state: string }[]; green?: boolean }) {
    return (
        <ol className="flex items-start">
            {steps.map((s, i) => {
                const done = s.state === "done";
                const current = s.state === "current";
                return (
                    <li key={s.label} className="relative flex flex-1 flex-col items-center text-center">
                        {i > 0 && <span className={cn("absolute right-1/2 top-3.5 h-0.5 w-full", done || current ? (green ? "bg-emerald-500" : "bg-primary") : "bg-border")} />}
                        <span className={cn("relative z-10 grid h-7 w-7 place-items-center rounded-full border-2 bg-background text-[12px] font-bold",
                            done ? (green ? "border-emerald-500 bg-emerald-500 text-white" : "border-primary bg-primary text-primary-foreground")
                                : current ? "border-primary text-primary" : "border-border text-muted-foreground")}>
                            {done ? <Check className="h-4 w-4" /> : i + 1}
                        </span>
                        <span className={cn("mt-1.5 text-[12px] font-semibold", current && "rounded bg-primary/10 px-1.5 py-0.5 text-primary")}>{s.label}</span>
                        {s.sub && <span className="text-[11px] text-muted-foreground">{s.sub}</span>}
                    </li>
                );
            })}
        </ol>
    );
}

function Line({ icon, label, value }: { icon?: React.ReactNode; label: React.ReactNode; value: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 py-2">
            <dt className="flex shrink-0 items-center gap-2 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}{label}</dt>
            <dd className="text-right font-medium text-foreground">{value}</dd>
        </div>
    );
}
