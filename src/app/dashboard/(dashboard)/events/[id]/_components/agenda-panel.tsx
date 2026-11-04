"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, CalendarPlus, Clock, Download, ExternalLink, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
    useDeleteAgendaItem, useEventAgenda, useSaveAgendaItem, type AgendaItem,
} from "@/hooks/use-event-modules";
import type { ClientEvent } from "@/hooks/use-client-events";
import { CharCount, DatePickerField, DayCalendar, FormField, FormPanel, ModuleHeader } from "@/components/module-kit";
import { Empty, PanelLoading, Section } from "./module-ui";

/**
 * Event Agenda — Jamal's web design (2026-11-04), exactly as drawn:
 *   · "Event Agenda" + Export Agenda + View Agenda (Guest);
 *   · a card per day ("Mon, 10 Nov 2026 · 6 Sessions") and + Add Date (another
 *     event day that has no session yet);
 *   · the chosen day: Total Sessions / Total Overlap Groups, a timeline (time,
 *     dot, card with Edit / Delete); sessions at the same time sit together in
 *     an "Overlap Sessions (n)" box;
 *   · right: Add Agenda Session — Date, Start Time, End Time, Title (100),
 *     Description (200, the column's size); Clear / Save Session. Edit fills
 *     the same form.
 * Same endpoints as the app; a session's location / images are left as they are.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parse = (d: string) => { const [y, m, day] = d.split("-").map(Number); return new Date(y, (m ?? 1) - 1, day ?? 1); };
const dayLabel = (d: string) => { const x = parse(d); return `${WEEKDAYS[x.getDay()]}, ${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const mins = (t: string | null) => { const [h, m] = hhmm(t).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
function timeLabel(t: string | null) {
    if (!t) return "--:--";
    const [h, m] = t.split(":").map(Number);
    return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
/** A session's span in minutes; an end before the start runs past midnight. */
const span = (i: AgendaItem): [number, number] => {
    const s = mins(i.start_time);
    let e = mins(i.end_time);
    if (e <= s) e += 24 * 60;
    return [s, e];
};

/** The day's sessions in time order, overlapping ones gathered into groups. */
function groupDay(items: AgendaItem[]) {
    const sorted = [...items].sort((a, b) => span(a)[0] - span(b)[0] || span(a)[1] - span(b)[1]);
    const groups: { items: AgendaItem[]; end: number }[] = [];
    for (const it of sorted) {
        const [s, e] = span(it);
        const last = groups[groups.length - 1];
        if (last && s < last.end) { last.items.push(it); last.end = Math.max(last.end, e); }
        else groups.push({ items: [it], end: e });
    }
    return groups;
}

type FormState = { id?: number; date: string; start: string; end: string; title: string; description: string };

export function AgendaPanel({ event }: { event: ClientEvent }) {
    const query = useEventAgenda(event.id);
    const save = useSaveAgendaItem(event.id);
    const remove = useDeleteAgendaItem(event.id);
    const [picked, setPicked] = useState<string | null>(null);
    const [extraDays, setExtraDays] = useState<string[]>([]);
    const [form, setForm] = useState<FormState | null>(null);
    const [tried, setTried] = useState(false);
    const [deleting, setDeleting] = useState<AgendaItem | null>(null);
    const [guestView, setGuestView] = useState(false);
    const [formOpen, setFormOpen] = useState(false);

    const items = useMemo(() => query.data?.items ?? [], [query.data]);
    const eventDays = useMemo(() => query.data?.days ?? [], [query.data]);
    const byDay = useMemo(() => {
        const m = new Map<string, AgendaItem[]>();
        for (const i of items) m.set(i.agenda_date, [...(m.get(i.agenda_date) ?? []), i]);
        return m;
    }, [items]);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Event Agenda"><Empty title="Could not load the agenda">Please try again in a moment.</Empty></Section>;
    }

    // Day cards: days with sessions, plus days added with + Add Date.
    const shownDays = [...new Set([...byDay.keys(), ...extraDays])].sort();
    const day = picked && shownDays.includes(picked) ? picked : shownDays[0] ?? eventDays[0] ?? null;
    const remaining = eventDays.filter((d) => !shownDays.includes(d));
    const groups = day ? groupDay(byDay.get(day) ?? []) : [];
    const overlapGroups = groups.filter((g) => g.items.length > 1).length;
    const f: FormState = form ?? { date: day ?? "", start: "", end: "", title: "", description: "" };
    const set = (patch: Partial<FormState>) => setForm({ ...f, ...patch });

    const clear = () => { setForm(null); setTried(false); setFormOpen(false); };
    /** A fresh session for `d` — "+ Add Session" on the day, and after each save. */
    const newFor = (d: string) => {
        setTried(false);
        setForm({ date: d, start: "", end: "", title: "", description: "" });
        setFormOpen(true);
        setTimeout(() => document.getElementById("agenda-title")?.focus(), 0);
    };
    /** Day card: show that day; a new (unsaved) session moves to it too. */
    const pickDay = (d: string) => {
        setPicked(d);
        if (form && !form.id) setForm({ ...form, date: d });
    };
    const edit = (i: AgendaItem) => {
        setTried(false);
        setFormOpen(true);
        setForm({ id: i.id, date: i.agenda_date, start: hhmm(i.start_time), end: hhmm(i.end_time), title: i.title, description: i.description ?? "" });
    };
    const submit = () => {
        setTried(true);
        if (!f.date || !f.start || !f.end || !f.title.trim()) return toast.warning("Please complete all required fields.");
        if (f.start === f.end) return toast.warning("The end time must be different from the start time.");
        save.mutate({
            id: f.id,
            data: { agenda_date: f.date, start_time: f.start, end_time: f.end, title: f.title.trim(), description: f.description.trim() },
            done: f.id ? "Session updated" : "Session added",
        }, {
            // Stay on that day with an empty form, ready for the next session.
            onSuccess: () => { setPicked(f.date); if (f.id) clear(); else newFor(f.date); },
        });
    };

    const exportAgenda = () => {
        const rows = [["Date", "Start Time", "End Time", "Title", "Description"]];
        for (const d of [...byDay.keys()].sort()) {
            for (const g of groupDay(byDay.get(d) ?? [])) {
                for (const i of g.items) rows.push([dayLabel(d), timeLabel(i.start_time), timeLabel(i.end_time), i.title, i.description ?? ""]);
            }
        }
        const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = `${event.name.replace(/[^\w]+/g, "-")}-agenda.csv`;
        a.click();
    };

    const bad = (v: string) => tried && !v.trim();

    return (
        <div className="flex min-w-0 flex-col gap-4">
            {/* ── Left: header, days, timeline ── */}
            <div className="flex min-w-0 flex-col gap-4">
                <ModuleHeader
                    title="Event Agenda"
                    subtitle="Manage event sessions, timings and activities for each day."
                    actions={(
                        <>
                            <Button variant="outline" size="sm" onClick={exportAgenda} disabled={!items.length}><Download className="size-3.5" /> Export Agenda</Button>
                            <Button variant="outline" size="sm" onClick={() => setGuestView(true)}><ExternalLink className="size-3.5" /> View Agenda (Guest)</Button>
                            <Button size="sm" onClick={() => newFor(day ?? eventDays[0] ?? "")} disabled={!eventDays.length}><Plus className="size-3.5" /> Add Session</Button>
                        </>
                    )}
                />

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {shownDays.map((d) => {
                        const n = byDay.get(d)?.length ?? 0;
                        const on = d === day;
                        return (
                            <button key={d} type="button" onClick={() => pickDay(d)}
                                className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition",
                                    on ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted")}>
                                <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                                    <CalendarDays className="size-4" />
                                </span>
                                <span className="min-w-0">
                                    <span className={cn("block truncate text-[13px] font-semibold", on && "text-primary")}>{dayLabel(d)}</span>
                                    <span className={cn("block text-[12px]", on ? "text-primary" : "text-muted-foreground")}>{n} {n === 1 ? "Session" : "Sessions"}</span>
                                </span>
                            </button>
                        );
                    })}
                    <Popover>
                        <PopoverTrigger asChild>
                            <button type="button" disabled={!remaining.length}
                                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-[13px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-50">
                                <Plus className="size-4" /> Add Date
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <p className="border-b border-border px-3 py-2 text-[12px] text-muted-foreground">Pick an event day to add sessions to</p>
                            <DayCalendar allowed={remaining} onChange={(d) => { setExtraDays((x) => [...x, d]); setPicked(d); newFor(d); }} />
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="rounded-xl border border-border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                        <p className="flex items-center gap-2 text-[16px] font-bold">
                            <CalendarDays className="size-5 text-primary" /> {day ? dayLabel(day) : "No dates"}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
                            <span className="rounded-full bg-muted px-3 py-1">Total Sessions: {byDay.get(day ?? "")?.length ?? 0}</span>
                            <span className="rounded-full bg-muted px-3 py-1">Total Overlap Groups: {overlapGroups}</span>
                            {day && (
                                <Button size="sm" variant="outline" className="h-7 border-primary/40 text-primary hover:bg-primary/5 hover:text-primary" onClick={() => newFor(day)}>
                                    <Plus className="size-3.5" /> Add Session
                                </Button>
                            )}
                        </div>
                    </div>
                    {groups.length === 0 ? (
                        <Empty title="No sessions on this day">Add a session with the form.</Empty>
                    ) : (
                        <div className="relative px-4 py-4">
                            {/* The timeline's line */}
                            <span className="absolute bottom-6 left-[133px] top-6 w-px bg-primary/30" />
                            <div className="flex flex-col gap-3">
                                {groups.map((g) => g.items.length === 1 ? (
                                    <Row key={g.items[0].id} item={g.items[0]} onEdit={edit} onDelete={setDeleting} />
                                ) : (
                                    // The overlap box wraps the group's cards; the times stay outside it.
                                    <div key={g.items.map((i) => i.id).join("-")} className="relative flex flex-col gap-3 pb-2">
                                        <span className="absolute inset-y-0 left-[144px] right-0 rounded-xl border border-violet-300 bg-violet-50/70 dark:bg-violet-950/30" />
                                        <div className="relative ml-[156px] pt-2.5">
                                            <span className="mr-3 rounded-full bg-violet-100 px-2.5 py-0.5 text-[12.5px] font-semibold text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                                                Overlap Sessions ({g.items.length})
                                            </span>
                                            <span className="text-[12.5px] font-medium text-violet-700 dark:text-violet-300">
                                                {timeLabel(g.items[0].start_time)} – {timeLabel(g.items.reduce((a, i) => (span(i)[1] > span(a)[1] ? i : a)).end_time)}
                                            </span>
                                        </div>
                                        {g.items.map((i) => <Row key={i.id} item={i} overlap onEdit={edit} onDelete={setDeleting} />)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Right: Add / Edit Agenda Session ── */}
            <FormPanel
                sheet={{ open: formOpen, onClose: clear }}
                icon={CalendarPlus}
                title={f.id ? "Edit Agenda Session" : "Add Agenda Session"}
                subtitle={f.id ? "Change this session." : `Create a new session for ${f.date ? dayLabel(f.date) : "a day"}.`}
                footer={(
                    <>
                        <Button variant="outline" onClick={clear}>Clear</Button>
                        <Button disabled={save.isPending} onClick={submit}><Save className="size-3.5" /> {f.id ? "Update Session" : "Save Session"}</Button>
                    </>
                )}
            >
                <FormField label="Date" required>
                    <DatePickerField value={f.date} onChange={(v) => set({ date: v })} allowed={eventDays} label={dayLabel}
                        placeholder="Choose a day" invalid={bad(f.date)} />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                    <FormField label="Start Time" required>
                        <Input type="time" value={f.start} onChange={(e) => set({ start: e.target.value })} className={cn("h-9", bad(f.start) && "border-destructive")} />
                    </FormField>
                    <FormField label="End Time" required>
                        <Input type="time" value={f.end} onChange={(e) => set({ end: e.target.value })} className={cn("h-9", bad(f.end) && "border-destructive")} />
                    </FormField>
                </div>
                <FormField label="Title" required>
                    <Input id="agenda-title" value={f.title} maxLength={100} placeholder="Enter session title (e.g., Haldi Ceremony)"
                        onChange={(e) => set({ title: e.target.value })} className={cn("h-9", bad(f.title) && "border-destructive")} />
                    <CharCount value={f.title} max={100} />
                </FormField>
                <FormField label="Description">
                    <Textarea value={f.description} maxLength={200} rows={4} placeholder="Add session details, notes or instructions..."
                        onChange={(e) => set({ description: e.target.value })} />
                    <CharCount value={f.description} max={200} />
                </FormField>
            </FormPanel>

            <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this session?</DialogTitle>
                        <DialogDescription>&quot;{deleting?.title}&quot; will be removed from the agenda.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={remove.isPending}
                            onClick={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { if (form?.id === deleting.id) clear(); setDeleting(null); } })}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {guestView && (
                <Dialog open onOpenChange={(o) => !o && setGuestView(false)}>
                    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Agenda</DialogTitle>
                            <DialogDescription>What your guests see in the app.</DialogDescription>
                        </DialogHeader>
                        {[...byDay.keys()].sort().map((d) => (
                            <div key={d} className="flex flex-col gap-2">
                                <p className="text-[13px] font-bold text-primary">{dayLabel(d)}</p>
                                {groupDay(byDay.get(d) ?? []).flatMap((g) => g.items).map((i) => (
                                    <div key={i.id} className="rounded-lg border border-border p-3">
                                        <p className="text-[13px] font-semibold">{i.title}</p>
                                        <p className="flex items-center gap-1 text-[12px] text-muted-foreground"><Clock className="size-3" /> {timeLabel(i.start_time)} - {timeLabel(i.end_time)}</p>
                                        {i.description && <p className="mt-1 text-[12px] text-foreground/80">{i.description}</p>}
                                    </div>
                                ))}
                            </div>
                        ))}
                        {!items.length && <Empty title="No agenda yet" />}
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

/** One timeline row: time · dot · card (title, description, Edit / Delete). */
function Row({
    item, overlap, onEdit, onDelete,
}: { item: AgendaItem; overlap?: boolean; onEdit: (i: AgendaItem) => void; onDelete: (i: AgendaItem) => void }) {
    return (
        <div className="relative flex items-center gap-3">
            <div className="w-[100px] shrink-0 text-[12.5px] font-semibold leading-5">
                {timeLabel(item.start_time)} –<br />{timeLabel(item.end_time)}
            </div>
            <span className={cn("relative z-10 size-3 shrink-0 rounded-full ring-4 ring-card", overlap ? "bg-violet-500" : "bg-primary")} />
            {/* The card's pointer towards the dot, as in the design. */}
            <div className={cn("relative ml-2 flex min-w-0 flex-1 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm",
                overlap ? "mr-3 border-violet-200" : "border-border")}>
                <span aria-hidden className={cn("absolute top-1/2 -left-[7px] size-3 -translate-y-1/2 rotate-45 rounded-bl-[3px] border-b border-l bg-card",
                    overlap ? "border-violet-200" : "border-border")} />
                <div className="min-w-0 flex-1">
                    <p className="break-words text-[14px] font-semibold">{item.title}</p>
                    {item.description && <p className="break-words text-[12.5px] text-muted-foreground">{item.description}</p>}
                </div>
                <Button size="sm" variant="outline" className="h-8" onClick={() => onEdit(item)}>Edit</Button>
                <Button size="sm" variant="outline" className="h-8 border-primary/40 text-primary hover:bg-primary/5 hover:text-primary" onClick={() => onDelete(item)}>Delete</Button>
            </div>
        </div>
    );
}
