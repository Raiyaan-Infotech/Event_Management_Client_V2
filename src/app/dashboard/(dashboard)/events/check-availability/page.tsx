"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle, CalendarCheck, CalendarDays, CalendarPlus, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Clock,
    Headphones, Info, Layers, Loader2, Scale, Tag, Users, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAvailabilityCalendar, type AvailabilityRequest, type CalendarDay } from "@/hooks/use-event-availability";
import { ContactSupportSheet } from "./contact-support-sheet";

/**
 * Check Event Availability (Jamal's designs, Create Event Updated v2, 2026-11-13).
 *
 * Event Booking Type: Single Date Event (one date → Book Event) or Multi Date Event (consecutive
 * start → end → Continue with N Dates). TOTAL slots per date from GET /client/availability; dates the
 * super admin has not configured are hidden on the calendar (and count as unavailable in a range).
 * Any unavailable day → Contact Support (call back / email) → saved as an allocation request with a
 * ticket number. Book / Continue opens the normal Create Event form with the dates filled.
 */

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
const pretty = (d: string) => { const [y, m, day] = d.split("-").map(Number); return `${pad(day)} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
const weekday = (d: string) => WEEK[new Date(`${d}T00:00:00`).getDay()];
const addDay = (d: string, n: number) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return iso(x.getFullYear(), x.getMonth(), x.getDate()); };
const time12 = (t: string | null) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${pad(h % 12 || 12)}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };
const isOpen = (d?: CalendarDay) => !!d && (d.status === "available" || d.status === "low");
const STATUS_TEXT: Record<string, string> = { full: "Fully Booked", disabled: "Not Available", not_configured: "Not Open" };

type Mode = "single" | "multiple";

export default function CheckAvailabilityPage() {
    const now = new Date();
    const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
    const [mode, setMode] = useState<Mode>("single");
    const [start, setStart] = useState<string | null>(null);
    const [end, setEnd] = useState<string | null>(null);
    const [supportOpen, setSupportOpen] = useState(false);
    const [submitted, setSubmitted] = useState<AvailabilityRequest | null>(null);
    const today = todayIso();

    const lastDay = new Date(ym.y, ym.m + 1, 0).getDate();
    const from = iso(ym.y, ym.m, 1);
    const to = iso(ym.y, ym.m, lastDay);
    const month = useAvailabilityCalendar(from, to);
    const selEnd = mode === "multiple" && start && end ? end : start;
    const range = useAvailabilityCalendar(start ?? from, selEnd ?? start ?? from);

    const byDate = useMemo(() => {
        const map = new Map<string, CalendarDay>();
        for (const d of month.data?.days ?? []) map.set(d.date, d);
        for (const d of range.data?.days ?? []) map.set(d.date, d);
        return map;
    }, [month.data, range.data]);

    const firstWeekday = new Date(ym.y, ym.m, 1).getDay();
    const cells: (string | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: lastDay }, (_, i) => iso(ym.y, ym.m, i + 1))];
    while (cells.length % 7) cells.push(null);

    const showMonthOf = (d: string) => setYm({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1 });
    const move = (n: number) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
    const reset = () => setSubmitted(null);
    const pick = (d: string) => {
        reset();
        if (mode === "single") { setStart(d); setEnd(null); return; }
        if (!start || end || d < start) { setStart(d); setEnd(null); return; }
        setEnd(d === start ? null : d);
    };
    const switchMode = (m: Mode) => { setMode(m); setEnd(null); reset(); };
    const setStartInput = (v: string) => { reset(); setStart(v || null); if (v) showMonthOf(v); if (end && v && end < v) setEnd(null); };
    const setEndInput = (v: string) => { reset(); setEnd(v && start && v > start ? v : null); };

    const selDays = useMemo(() => {
        if (!start) return [];
        const last = mode === "multiple" && end ? end : start;
        const out: string[] = [];
        for (let d = start; d <= last; d = addDay(d, 1)) out.push(d);
        return out;
    }, [start, end, mode]);
    const info = selDays.map((d) => byDate.get(d));
    const unavailable = selDays.filter((d, i) => !isOpen(info[i]));
    const checking = range.isFetching;
    const complete = !!start && (mode === "single" || !!end);
    const past = !!start && start < today;
    const allOpen = complete && !checking && !past && unavailable.length === 0;
    const blockedForSupport = complete && !checking && !past && unavailable.length > 0;
    const one = mode === "single" ? info[0] : undefined;
    const myEvents = info.flatMap((x) => (x?.my_events ?? []).map((e) => ({ ...e, date: x!.date })));
    const rangeLabel = !start ? "" : mode === "multiple" && end ? `${pretty(start)} to ${pretty(end)}` : pretty(start);
    const bookHref = start ? `/dashboard/events/create?start=${start}${mode === "multiple" && end ? `&end=${end}` : ""}` : "#";
    const unavailableItems = unavailable.map((d) => ({ date: d, label: `${pretty(d)} — ${STATUS_TEXT[byDate.get(d)?.status ?? "not_configured"] ?? "Not Available"}` }));
    const statusChip = (d?: CalendarDay) =>
        isOpen(d) ? <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />Available</span>
            : <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-600"><XCircle className="h-3 w-3" />{STATUS_TEXT[d?.status ?? "not_configured"] ?? "Not Available"}</span>;

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h1 className="text-[20px] font-bold leading-tight text-foreground">Check Event Availability</h1>
                <p className="text-[12.5px] text-muted-foreground">Choose a date or date range to see whether event slots are available before creating a new event.</p>
            </div>

            {/* Event booking type + dates */}
            <Card className="gap-0 rounded-lg border p-4 shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[13px] font-semibold text-foreground">Event Booking Type</span>
                        {([["single", "Single Date Event", CalendarDays], ["multiple", "Multi Date Event", CalendarRange]] as const).map(([m, label, Icon]) => (
                            <button key={m} type="button" onClick={() => switchMode(m)}
                                className={cn("flex h-9 items-center gap-2 rounded-md border px-3.5 text-[13px] font-medium transition-colors",
                                    mode === m ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                                <span className={cn("grid h-3.5 w-3.5 place-items-center rounded-full border", mode === m ? "border-primary-foreground" : "border-muted-foreground")}>
                                    {mode === m && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                                </span>
                                <Icon className="h-3.5 w-3.5" />{label}
                            </button>
                        ))}
                    </div>
                    {mode === "multiple" && <span className="text-[11.5px] text-muted-foreground">Consecutive dates only</span>}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                    <DateBox label={mode === "single" ? "Select Date" : "Start Date"} value={start ?? ""} min={today} onChange={setStartInput} />
                    {mode === "multiple" && (
                        <>
                            <span className="pb-2 text-muted-foreground">—</span>
                            <DateBox label="End Date" value={end ?? ""} min={start ? addDay(start, 1) : today} onChange={setEndInput} />
                            {start && end && <span className="pb-2 text-[12px] text-muted-foreground">Includes every day between start and end ({selDays.length} days)</span>}
                        </>
                    )}
                </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1fr_360px] xl:items-start">
                {/* Calendar */}
                <Card className="gap-0 rounded-lg border p-4 shadow-none">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                            <h2 className="w-[150px] text-center text-[15px] font-bold text-foreground">{MONTHS[ym.m]} {ym.y}</h2>
                            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
                            {month.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />C: Created</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />B: Balance</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-red-600"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />Fully Booked</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1.5">
                        {WEEK.map((w) => <div key={w} className="pb-1 text-center text-[12px] font-semibold text-muted-foreground">{w}</div>)}
                        {cells.map((d, i) => {
                            const dayInfo = d ? byDate.get(d) : undefined;
                            if (!d || !dayInfo || dayInfo.status === "not_configured") {
                                // Hidden (not configured) — but still marked when it falls inside a selected range.
                                const inRange = !!d && selDays.includes(d);
                                return <div key={i} className={cn("h-[74px] rounded-md", inRange && "border border-dashed border-red-300 bg-red-50/40")} />;
                            }
                            const isPast = d < today;
                            const selected = selDays.includes(d);
                            const full = dayInfo.status === "full";
                            const disabled = dayInfo.status === "disabled";
                            const tag = mode === "multiple" && end && selected ? (d === start ? "START" : d === end ? "END" : "RANGE") : null;
                            return (
                                <button key={d} type="button" onClick={() => pick(d)}
                                    className={cn(
                                        "relative flex h-[74px] flex-col items-start gap-1 rounded-md border p-1.5 text-left transition-colors hover:border-primary/60",
                                        full && "border-red-200 bg-red-50/70",
                                        disabled && "bg-muted/50",
                                        isPast && "opacity-50",
                                        selected && "border-primary bg-primary/5 ring-2 ring-primary/30",
                                    )}>
                                    {tag && <span className="absolute right-1 top-1 text-[8.5px] font-bold tracking-wide text-primary">{tag}</span>}
                                    <span className={cn("text-[13px] font-bold", selected ? "text-primary" : "text-foreground")}>{Number(d.slice(8))}</span>
                                    {disabled ? (
                                        <span className="text-[10.5px] font-medium text-muted-foreground">Disabled</span>
                                    ) : (
                                        <span className="flex flex-wrap gap-1">
                                            <span className={cn("rounded px-1 text-[10.5px] font-semibold", full ? "bg-red-100 text-red-600" : "bg-emerald-50 text-emerald-700")}>C: {dayInfo.booked}</span>
                                            <span className={cn("rounded px-1 text-[10.5px] font-semibold", full ? "bg-red-100 text-red-600" : dayInfo.status === "low" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700")}>B: {dayInfo.balance}</span>
                                        </span>
                                    )}
                                    {full && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600"><XCircle className="h-3 w-3" />Full</span>}
                                </button>
                            );
                        })}
                    </div>
                    {mode === "multiple" && start && end && (
                        <p className="mt-3 rounded-md bg-primary/5 px-3 py-1.5 text-[11.5px] text-muted-foreground">
                            Selected date range: {pretty(start)} – {pretty(end)} • Start and end dates plus all dates in between are included automatically.
                        </p>
                    )}
                    {month.data && !month.data.days.some((d) => d.status !== "not_configured") && (
                        <p className="mt-3 text-center text-[12.5px] text-muted-foreground">No dates are open for booking in {MONTHS[ym.m]}. Try another month, or contact support.</p>
                    )}
                    {month.isError && <p className="mt-3 text-center text-[12.5px] text-destructive">Could not load availability. Please try again.</p>}
                </Card>

                {/* Right card */}
                <Card className="gap-0 rounded-lg border p-4 shadow-none">
                    <div className="mb-3 flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary"><CalendarDays className="h-4 w-4" /></span>
                        <h2 className="text-[15px] font-semibold text-foreground">{mode === "single" ? "Selected Availability" : "Selected Date Range Availability"}</h2>
                    </div>

                    {!start ? (
                        <p className="py-8 text-center text-[12.5px] text-muted-foreground">
                            {mode === "single" ? "Select a date on the calendar or in Select Date." : "Select the start and end dates (on the calendar or above)."}
                        </p>
                    ) : mode === "single" ? (
                        <div className="divide-y text-[13px]">
                            <Row icon={<CalendarDays />} label="Event Date" value={`${pretty(start)} (${weekday(start)})`} />
                            <Row icon={<Layers />} label="Daily Max Events" value={one?.daily_max ?? "—"} />
                            <Row icon={<CalendarCheck />} label="Created Events" value={one?.booked ?? "—"} />
                            <Row icon={<Users />} label="Available Balance" value={<Chip ok={isOpen(one)}>{one ? one.balance : "—"}</Chip>} />
                            <Row icon={<Scale />} label="Status" value={checking ? <Loader2 className="h-4 w-4 animate-spin" /> : past ? <Chip ok={false}>Past Date</Chip> : statusChip(one)} />
                        </div>
                    ) : (
                        <>
                            <div className="divide-y text-[13px]">
                                <Row icon={<CalendarDays />} label="Start Date" value={pretty(start)} />
                                <Row icon={<CalendarDays />} label="End Date" value={end ? pretty(end) : <span className="text-muted-foreground">Select end date</span>} />
                                {end && <Row icon={<CalendarRange />} label="Total Selected Dates" value={selDays.length} />}
                                {end && <Row icon={<CheckCircle2 />} label="Available Dates" value={checking ? "…" : selDays.length - unavailable.length} />}
                                {end && <Row icon={<XCircle />} label="Unavailable Dates" value={checking ? "…" : unavailable.length} />}
                                {end && (
                                    <Row icon={<Scale />} label="Status" value={
                                        checking ? <Loader2 className="h-4 w-4 animate-spin" />
                                            : past ? <Chip ok={false}>Past Date</Chip>
                                                : unavailable.length === 0 ? <Chip ok>Available</Chip>
                                                    : unavailable.length < selDays.length
                                                        ? <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />Partially Available</span>
                                                        : <Chip ok={false}>Not Available</Chip>
                                    } />
                                )}
                            </div>
                            {end && (
                                <>
                                    <p className="mb-1.5 mt-3 text-[13px] font-semibold text-foreground">Date-wise Availability</p>
                                    <ul className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
                                        {selDays.map((d, i) => (
                                            <li key={d} className={cn("flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px]", !isOpen(info[i]) && "border-red-200 bg-red-50/50")}>
                                                <span className="flex items-center gap-1.5 font-medium"><CalendarDays className="h-3.5 w-3.5 text-primary" />{pretty(d)}</span>
                                                <span className="flex items-center gap-1.5">
                                                    {info[i] && info[i]!.status !== "not_configured" && <>
                                                        <span className="rounded bg-emerald-50 px-1 text-[11px] text-emerald-700">C: {info[i]!.booked}</span>
                                                        <span className="rounded bg-sky-50 px-1 text-[11px] text-sky-700">B: {info[i]!.balance}</span>
                                                    </>}
                                                    {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : statusChip(info[i])}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </>
                    )}

                    {start && myEvents.length > 0 && (
                        <>
                            <p className="mb-1.5 mt-3 text-[13px] font-semibold text-foreground">Your Events on {mode === "multiple" && end ? "These Dates" : pretty(start)} ({myEvents.length})</p>
                            <ul className="flex flex-col gap-1.5">
                                {myEvents.slice(0, 4).map((e) => (
                                    <li key={`${e.date}-${e.id}`} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px]">
                                        <span className="flex min-w-0 items-center gap-2"><Tag className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate font-medium">{e.name}</span></span>
                                        <span className="flex shrink-0 items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{mode === "multiple" ? pretty(e.date).slice(0, 6) : time12(e.start_time) || "—"}</span>
                                    </li>
                                ))}
                                {myEvents.length > 4 && <li className="text-[12px] font-semibold text-primary">+{myEvents.length - 4} more events</li>}
                            </ul>
                        </>
                    )}

                    {/* Actions */}
                    {start && submitted ? (
                        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                            <p className="flex items-center gap-2 text-[14px] font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" />Support Request Submitted</p>
                            <p className="mt-1 text-[12px] text-foreground">Our support team has been notified about the unavailable {submitted.unavailable_dates.length > 1 ? "dates" : "date"}. They will contact you shortly.</p>
                            <div className="mt-2 space-y-1 text-[12.5px]">
                                <p className="rounded bg-white/70 px-2 py-1"><b>Ticket ID:</b> {submitted.ticket_no}</p>
                                {submitted.unavailable_dates.map((u) => (
                                    <p key={u.date} className="rounded bg-white/70 px-2 py-1">{pretty(u.date)} — <span className="font-semibold text-red-600">{STATUS_TEXT[u.status] ?? "Not Available"}</span></p>
                                ))}
                            </div>
                            <Button asChild variant="outline" className="mt-3 h-9 w-full"><Link href="/dashboard">Back to Dashboard</Link></Button>
                            <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Event creation cannot continue until support assistance is completed.</p>
                        </div>
                    ) : start ? (
                        <>
                            {allOpen ? (
                                <Button asChild className="mt-4 h-10 w-full text-[13.5px] font-semibold">
                                    <Link href={bookHref}><CalendarPlus className="mr-1.5 h-4 w-4" />{mode === "single" ? "Book Event" : `Continue with ${selDays.length} Dates`}</Link>
                                </Button>
                            ) : (
                                <Button disabled className="mt-4 h-10 w-full bg-muted text-[13.5px] font-semibold text-muted-foreground">
                                    {checking ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Checking dates...</>
                                        : mode === "multiple" && !end ? <><CalendarRange className="mr-1.5 h-4 w-4" />Select End Date</>
                                            : mode === "multiple" ? <><CalendarPlus className="mr-1.5 h-4 w-4" />Continue with {selDays.length} Dates</>
                                                : <><CalendarPlus className="mr-1.5 h-4 w-4" />Date Not Available</>}
                                </Button>
                            )}
                            {past && <p className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2.5 py-2 text-[12px] text-red-600"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />This date has passed. Please select an upcoming date.</p>}
                            {blockedForSupport && (
                                <>
                                    <p className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2.5 py-2 text-[12px] font-medium text-red-600">
                                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        {mode === "single" ? "This date is not available." : "One or more selected dates are not available."} Please contact the Support Team for assistance.
                                    </p>
                                    <Button variant="outline" className="mt-2 h-10 w-full border-primary/50 text-[13.5px] font-semibold text-primary hover:bg-primary/5 hover:text-primary" onClick={() => setSupportOpen(true)}>
                                        <Headphones className="mr-1.5 h-4 w-4" />Contact Support
                                    </Button>
                                </>
                            )}
                            {allOpen && mode === "multiple" && (
                                <p className="mt-2 rounded-md bg-primary/5 px-2.5 py-2 text-[11.5px] text-muted-foreground">
                                    <b className="text-primary">Booking rule:</b> Every date from Start to End must have at least one available slot. If any day is fully booked or disabled, this range cannot be booked; choose another range.
                                </p>
                            )}
                        </>
                    ) : null}
                    <p className="mt-3 flex items-start gap-1.5 rounded-md bg-primary/5 px-2.5 py-2 text-[11.5px] text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Availability is based on limits configured in the Super Admin portal.</p>
                </Card>
            </div>

            {start && supportOpen && (
                <ContactSupportSheet
                    open={supportOpen}
                    onClose={() => setSupportOpen(false)}
                    onSubmitted={(r) => { setSupportOpen(false); setSubmitted(r); }}
                    bookingType={mode}
                    start={start}
                    end={mode === "multiple" && end ? end : start}
                    unavailable={unavailableItems}
                    rangeLabel={rangeLabel}
                />
            )}
        </div>
    );
}

function DateBox({ label, value, min, onChange }: { label: string; value: string; min: string; onChange: (v: string) => void }) {
    return (
        <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-foreground">{label} <span className="text-destructive">*</span></span>
            <span className="relative block">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)}
                    className="h-9 w-[200px] rounded-md border bg-background pl-8 pr-2 text-[13px] outline-none focus:border-primary" />
            </span>
        </label>
    );
}

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
    return <span className={cn("rounded px-2 py-0.5 text-[12px] font-semibold", ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>{children}</span>;
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2">
            <span className="flex items-center gap-2 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}{label}</span>
            <span className="text-right font-semibold text-foreground">{value}</span>
        </div>
    );
}
