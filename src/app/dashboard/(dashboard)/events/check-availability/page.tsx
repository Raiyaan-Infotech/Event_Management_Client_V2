"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarDays, CalendarPlus, CalendarRange, ChevronLeft, ChevronRight, Clock, Info, Layers, Loader2, Scale, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAvailabilityCalendar, type CalendarDay } from "@/hooks/use-event-availability";

/**
 * Check Event Availability (Jamal's design Organizer\02_1 / 02_2, 2026-11-13).
 *
 * Month calendar of TOTAL slots per date (C = events created, B = balance) from
 * GET /client/availability. Dates the super admin has not configured are hidden. The right card
 * shows the selected date (Single Date) or date range (Multiple Dates); Book Event opens the normal
 * Create Event form with those dates filled in Date & Time (?start=&end=). The event's category is
 * checked again when it is saved.
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

type Mode = "single" | "multiple";

export default function CheckAvailabilityPage() {
    const now = new Date();
    const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
    const [mode, setMode] = useState<Mode>("single");
    const [start, setStart] = useState<string | null>(null);
    const [end, setEnd] = useState<string | null>(null);
    const today = todayIso();

    const lastDay = new Date(ym.y, ym.m + 1, 0).getDate();
    const from = iso(ym.y, ym.m, 1);
    const to = iso(ym.y, ym.m, lastDay);
    const month = useAvailabilityCalendar(from, to);
    // A range can run past the visible month: its own days are read separately.
    const rangeEnd = mode === "multiple" && start && end ? end : null;
    const range = useAvailabilityCalendar(start ?? from, rangeEnd ?? start ?? from);

    const byDate = useMemo(() => {
        const map = new Map<string, CalendarDay>();
        for (const d of month.data?.days ?? []) map.set(d.date, d);
        for (const d of range.data?.days ?? []) map.set(d.date, d);
        return map;
    }, [month.data, range.data]);

    const firstWeekday = new Date(ym.y, ym.m, 1).getDay();
    const cells: (string | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: lastDay }, (_, i) => iso(ym.y, ym.m, i + 1))];
    while (cells.length % 7) cells.push(null);

    const move = (n: number) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
    const pick = (d: string) => {
        if (mode === "single") { setStart(d); setEnd(null); return; }
        if (!start || end || d < start) { setStart(d); setEnd(null); return; }
        setEnd(d === start ? null : d);
    };
    const switchMode = (m: Mode) => { setMode(m); setEnd(null); };

    // The selection: one day, or every day of the range.
    const selDays = useMemo(() => {
        if (!start) return [];
        const last = mode === "multiple" && end ? end : start;
        const out: string[] = [];
        for (let d = start; d <= last; d = addDay(d, 1)) out.push(d);
        return out;
    }, [start, end, mode]);
    const selInfo = selDays.map((d) => byDate.get(d));
    const blocked = selDays.find((d, i) => !isOpen(selInfo[i]));
    const blockedInfo = blocked ? byDate.get(blocked) : undefined;
    const loadingSel = range.isFetching && selDays.length > 1;
    const canBook = !!start && !blocked && !loadingSel && start >= today && (mode === "single" || !!end);
    const one = selDays.length === 1 ? selInfo[0] : undefined;
    const minBalance = selInfo.length ? Math.min(...selInfo.map((x) => x?.balance ?? 0)) : 0;
    const myEvents = selInfo.flatMap((x) => (x?.my_events ?? []).map((e) => ({ ...e, date: x!.date })));
    const bookHref = start ? `/dashboard/events/create?start=${start}${mode === "multiple" && end ? `&end=${end}` : ""}` : "#";

    const reason = !start ? "" : start < today ? "This date has passed. Please select an upcoming date."
        : blocked && !blockedInfo ? `${pretty(blocked)} is not open for booking. Please contact admin.`
            : blockedInfo?.status === "full" ? `${pretty(blocked!)} is fully booked. Please select another available date to continue.`
                : blockedInfo?.status === "disabled" ? `${pretty(blocked!)} is not available for booking. Please select another date.`
                    : blocked ? `${pretty(blocked)} is not open for booking. Please contact admin.` : "";

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h1 className="text-[20px] font-bold leading-tight text-foreground">Check Event Availability</h1>
                <p className="text-[12.5px] text-muted-foreground">Choose a date to see whether event slots are available before creating a new event.</p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_340px] xl:items-start">
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
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />C: Created (events)</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />B: Balance (available slots)</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-red-600"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />Fully Booked (B: 0)</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1.5">
                        {WEEK.map((w) => <div key={w} className="pb-1 text-center text-[12px] font-semibold text-muted-foreground">{w}</div>)}
                        {cells.map((d, i) => {
                            const info = d ? byDate.get(d) : undefined;
                            // Not configured (or not loaded) = hidden (Jamal 2026-11-13).
                            if (!d || !info || info.status === "not_configured") return <div key={i} className="h-[74px] rounded-md" />;
                            const past = d < today;
                            const selected = selDays.includes(d);
                            const full = info.status === "full";
                            const disabled = info.status === "disabled";
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => pick(d)}
                                    className={cn(
                                        "flex h-[74px] flex-col items-start gap-1 rounded-md border p-1.5 text-left transition-colors hover:border-primary/60",
                                        full && "border-red-200 bg-red-50/70",
                                        disabled && "bg-muted/50",
                                        past && "opacity-50",
                                        selected && "border-primary ring-2 ring-primary/30",
                                    )}
                                >
                                    <span className={cn("text-[13px] font-bold", selected ? "text-primary" : "text-foreground")}>{Number(d.slice(8))}</span>
                                    {disabled ? (
                                        <span className="text-[10.5px] font-medium text-muted-foreground">Disabled</span>
                                    ) : (
                                        <span className="flex flex-wrap gap-1">
                                            <span className={cn("rounded px-1 text-[10.5px] font-semibold", full ? "bg-red-100 text-red-600" : "bg-emerald-50 text-emerald-700")}>C: {info.booked}</span>
                                            <span className={cn("rounded px-1 text-[10.5px] font-semibold", full ? "bg-red-100 text-red-600" : info.status === "low" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700")}>B: {info.balance}</span>
                                        </span>
                                    )}
                                    {full && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600"><XCircle className="h-3 w-3" />Fully Booked</span>}
                                </button>
                            );
                        })}
                    </div>
                    {month.data && !month.data.days.some((d) => d.status !== "not_configured") && (
                        <p className="mt-3 text-center text-[12.5px] text-muted-foreground">No dates are open for booking in {MONTHS[ym.m]}. Try another month, or contact admin.</p>
                    )}
                    {month.isError && <p className="mt-3 text-center text-[12.5px] text-destructive">Could not load availability. Please try again.</p>}
                </Card>

                {/* Selected date availability */}
                <Card className="gap-0 rounded-lg border p-4 shadow-none">
                    <div className="mb-3 flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary"><CalendarDays className="h-4 w-4" /></span>
                        <h2 className="text-[15px] font-semibold text-foreground">Selected Date Availability</h2>
                    </div>

                    <div className="mb-3 grid grid-cols-2 gap-1 rounded-md border p-1">
                        {([["single", "Single Date", CalendarDays], ["multiple", "Multiple Dates", CalendarRange]] as const).map(([m, label, Icon]) => (
                            <button key={m} type="button" onClick={() => switchMode(m)}
                                className={cn("flex h-8 items-center justify-center gap-1.5 rounded text-[12.5px] font-medium", mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                                <Icon className="h-3.5 w-3.5" />{label}
                            </button>
                        ))}
                    </div>

                    {!start ? (
                        <p className="py-8 text-center text-[12.5px] text-muted-foreground">
                            {mode === "single" ? "Select a date on the calendar." : "Select the first and the last date on the calendar."}
                        </p>
                    ) : (
                        <>
                            <div className="divide-y text-[13px]">
                                <Row icon={<CalendarDays />} label={selDays.length > 1 ? "Selected Dates" : "Selected Date"}
                                    value={selDays.length > 1 ? `${pretty(selDays[0])} – ${pretty(selDays[selDays.length - 1])}` : `${pretty(start)} (${weekday(start)})`} />
                                {mode === "multiple" && !end && <Row icon={<CalendarRange />} label="Last Date" value={<span className="text-muted-foreground">Select on calendar</span>} />}
                                {selDays.length > 1 && <Row icon={<CalendarRange />} label="Days" value={selDays.length} />}
                                {one && <Row icon={<Layers />} label="Daily Max Events" value={one.daily_max} />}
                                {one && <Row icon={<CalendarCheck />} label="Created Events" value={one.booked} />}
                                <Row icon={<Users />} label={selDays.length > 1 ? "Lowest Balance" : "Available Balance"}
                                    value={<span className={cn("rounded px-2 py-0.5 text-[12px] font-semibold", canBook ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>{blocked && !blockedInfo ? "—" : minBalance}</span>} />
                                <Row icon={<Scale />} label="Status" value={
                                    loadingSel ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <span className={cn("rounded px-2 py-0.5 text-[12px] font-semibold", canBook ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
                                            {canBook ? "Available" : blockedInfo?.status === "full" ? "Fully Booked" : start < today ? "Past Date" : mode === "multiple" && !end ? "Select last date" : "Not Available"}
                                        </span>
                                } />
                            </div>

                            <p className="mb-1.5 mt-4 text-[13px] font-semibold text-foreground">Your Events on {selDays.length > 1 ? "These Dates" : pretty(start)} ({myEvents.length})</p>
                            {!myEvents.length ? (
                                <p className="rounded-md border border-dashed py-3 text-center text-[12px] text-muted-foreground">You have no events on {selDays.length > 1 ? "these dates" : "this date"}.</p>
                            ) : (
                                <ul className="flex flex-col gap-1.5">
                                    {myEvents.slice(0, 5).map((e) => (
                                        <li key={`${e.date}-${e.id}`} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px]">
                                            <span className="flex min-w-0 items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate font-medium">{e.name}</span></span>
                                            <span className="flex shrink-0 items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{selDays.length > 1 ? pretty(e.date).slice(0, 6) : time12(e.start_time) || "—"}</span>
                                        </li>
                                    ))}
                                    {myEvents.length > 5 && <li className="text-[12px] font-semibold text-primary">+{myEvents.length - 5} more events</li>}
                                </ul>
                            )}

                            {canBook ? (
                                <Button asChild className="mt-4 h-10 w-full text-[13.5px] font-semibold">
                                    <Link href={bookHref}><CalendarPlus className="mr-1.5 h-4 w-4" />Book Event</Link>
                                </Button>
                            ) : (
                                <Button disabled className="mt-4 h-10 w-full bg-muted text-[13.5px] font-semibold text-muted-foreground">
                                    <CalendarPlus className="mr-1.5 h-4 w-4" />{mode === "multiple" && !end && !blocked ? "Select Last Date" : "Date Not Available"}
                                </Button>
                            )}
                            {reason && <p className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2.5 py-2 text-[12px] text-red-600"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{reason}</p>}
                        </>
                    )}
                    <p className="mt-3 flex items-start gap-1.5 rounded-md bg-primary/5 px-2.5 py-2 text-[11.5px] text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Availability is based on limits configured in the Super Admin portal.</p>
                </Card>
            </div>
        </div>
    );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2">
            <span className="flex items-center gap-2 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}{label}</span>
            <span className="text-right font-semibold text-foreground">{value}</span>
        </div>
    );
}
