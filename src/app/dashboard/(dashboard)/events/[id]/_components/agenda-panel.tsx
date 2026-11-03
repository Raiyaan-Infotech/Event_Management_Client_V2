"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Check, CheckCircle2, Clock, Copy, Loader2, MapPin, Pencil, Plus, Repeat, Trash2, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import {
    uploadAgendaImage, useDeleteAgendaItem, useDuplicateAgendaItem, useEventAgenda, useSaveAgendaItem,
    type AgendaItem,
} from "@/hooks/use-event-modules";
import type { ClientEvent } from "@/hooks/use-client-events";
import { Empty, PanelLoading, Section } from "./module-ui";

/**
 * Agenda — the SAME as the V1 app's organizer Agenda (Jamal, 2026-11-03: "like
 * the other modules, nothing special"):
 *   · list: + Add, pills All + one per event day ("d MMM"), a numbered card per
 *     item (title, "date, time", edit, delete). No "Show in Event App" switch —
 *     the app removed it (that is App Menus' job).
 *   · tap a card → Agenda Details: date, time, location, description, Gallery;
 *     Edit / Delete; Actions → Duplicate Agenda, Move to Another Day.
 *   · Add / Edit: Agenda Title * (100), Description (200), Date (an event day),
 *     Start / End Time, Location, Agenda Image (up to 10). "Session Time
 *     Overlap" before saving; Add ends on "Agenda Added Successfully!".
 */

const MAX_IMAGES = 10;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parse = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, day ?? 1);
};
const dMMM = (d: string) => { const x = parse(d); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; };
const dMMMyyyy = (d: string) => `${dMMM(d)} ${parse(d).getFullYear()}`;
const longDay = (d: string) => { const x = parse(d); return `${WEEKDAYS[x.getDay()]}, ${dMMMyyyy(d)}`; };
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

function timeLabel(t: string | null) {
    if (!t) return "--:--";
    const [h, m] = t.split(":").map(Number);
    return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** "15 Feb 2025" or "15 Feb – 16 Feb 2025" — as the app. */
const dateLabel = (i: AgendaItem) =>
    i.end_date ? `${dMMM(i.agenda_date)} – ${dMMMyyyy(i.end_date)}` : dMMMyyyy(i.agenda_date);
const itemTime = (i: AgendaItem) => `${timeLabel(i.start_time)} - ${timeLabel(i.end_time)}`;

/** Whether the item is on day `d` — a multi-day item is on every day it spans. */
const isOn = (i: AgendaItem, d: string) => i.agenda_date <= d && d <= (i.end_date ?? i.agenda_date);

/** Its span in minutes; an end before the start runs past midnight. */
function spanOf(date: string, endDate: string | null, start: string, end: string): [number, number] | null {
    if (!date || !start || !end) return null;
    const at = (d: string, t: string) => {
        const [h, m] = t.split(":").map(Number);
        return Date.UTC(parse(d).getFullYear(), parse(d).getMonth(), parse(d).getDate()) / 60000 + h * 60 + m;
    };
    const from = at(date, start);
    let to = at(endDate ?? date, end);
    if (to <= from) to += 24 * 60;
    return [from, to];
}
const overlaps = (a: [number, number] | null, b: [number, number] | null) => !!a && !!b && a[0] < b[1] && b[0] < a[1];

export function AgendaPanel({ event }: { event: ClientEvent }) {
    const query = useEventAgenda(event.id);
    const [day, setDay] = useState<string | null>(null); // null = All
    const [form, setForm] = useState<{ item: AgendaItem | null } | null>(null);
    const [details, setDetails] = useState<AgendaItem | null>(null);
    const [deleting, setDeleting] = useState<AgendaItem | null>(null);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Agenda"><Empty title="Could not load the agenda">Please try again in a moment.</Empty></Section>;
    }
    const page = query.data;
    const shown = day ? page.items.filter((i) => isOn(i, day)) : page.items;
    const canEdit = page.can_edit !== false;
    // Details follow the list, so an edit made there shows at once.
    const open = details ? page.items.find((i) => i.id === details.id) ?? null : null;

    return (
        <div className="flex flex-col gap-5">
            <Section
                title="Agenda"
                action={canEdit && <Button size="sm" onClick={() => setForm({ item: null })}><Plus className="size-3.5" /> Add</Button>}
            >
                {page.days.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {[null, ...page.days].map((d) => (
                            <button
                                key={d ?? "all"} type="button" onClick={() => setDay(d)}
                                className={cn(
                                    "shrink-0 rounded-md border px-4 py-1.5 text-[12px] font-semibold transition",
                                    day === d ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted",
                                )}
                            >
                                {d ? dMMM(d) : "All"}
                            </button>
                        ))}
                    </div>
                )}

                {page.items.length === 0 ? (
                    <Empty title="No agenda yet">Add the sessions of your event and guests will see them in the app.</Empty>
                ) : shown.length === 0 ? (
                    <Empty title="Nothing on this day" />
                ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                        {shown.map((item, i) => (
                            <li key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[12.5px] font-bold text-primary-foreground">
                                    {i + 1}
                                </span>
                                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetails(item)}>
                                    <p className="truncate text-[13px] font-semibold">{item.title}</p>
                                    <p className="truncate text-[12px] text-muted-foreground">{dateLabel(item)}, {itemTime(item)}</p>
                                </button>
                                {canEdit && (
                                    <div className="flex shrink-0 gap-1">
                                        <Button size="icon" variant="ghost" className="size-8" aria-label="Edit" onClick={() => setForm({ item })}>
                                            <Pencil className="size-3.5" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="Delete" onClick={() => setDeleting(item)}>
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </Section>

            {open && (
                <AgendaDetailsDialog
                    eventId={event.id} item={open} days={page.days} canEdit={canEdit}
                    onClose={() => setDetails(null)}
                    onEdit={() => { setDetails(null); setForm({ item: open }); }}
                    onDelete={() => { setDetails(null); setDeleting(open); }}
                />
            )}

            {form && (
                <AgendaFormDialog
                    key={form.item?.id ?? "new"}
                    eventId={event.id}
                    item={form.item}
                    days={page.days}
                    items={page.items}
                    initialDate={day}
                    onClose={() => setForm(null)}
                />
            )}

            <DeleteAgendaDialog eventId={event.id} item={deleting} onClose={() => setDeleting(null)} onDeleted={() => setDetails(null)} />
        </div>
    );
}

function AgendaDetailsDialog({
    eventId, item, days, canEdit, onClose, onEdit, onDelete,
}: {
    eventId: number; item: AgendaItem; days: string[]; canEdit: boolean;
    onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
    const duplicate = useDuplicateAgendaItem(eventId);
    const save = useSaveAgendaItem(eventId);
    const [moving, setMoving] = useState(false);

    const moveTo = (d: string) => {
        if (d === item.agenda_date) return setMoving(false);
        const data: { agenda_date: string; end_date?: string } = { agenda_date: d };
        // A multi-day item keeps its length.
        if (item.end_date) {
            const len = Math.round((parse(item.end_date).getTime() - parse(item.agenda_date).getTime()) / 86400000);
            const end = parse(d);
            end.setDate(end.getDate() + len);
            data.end_date = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
        }
        save.mutate({ id: item.id, data, done: "Agenda moved" }, { onSuccess: () => setMoving(false) });
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Agenda Details</DialogTitle>
                    <DialogDescription className="sr-only">{item.title}</DialogDescription>
                </DialogHeader>

                {moving ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-[13px] font-semibold">Move to Another Day</p>
                        {days.map((d, i) => (
                            <button
                                key={d} type="button" disabled={save.isPending} onClick={() => moveTo(d)}
                                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left hover:bg-muted"
                            >
                                <span>
                                    <span className="block text-[13px] font-medium">Day {i + 1}</span>
                                    <span className="block text-[12px] text-muted-foreground">{longDay(d)}</span>
                                </span>
                                {d === item.agenda_date && <Check className="size-4 text-primary" />}
                            </button>
                        ))}
                        <Button variant="outline" onClick={() => setMoving(false)}>Cancel</Button>
                    </div>
                ) : (
                    <>
                        <p className="break-words text-[18px] font-bold">{item.title}</p>
                        <div className="flex flex-col gap-2 text-[13px]">
                            <p className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" /> {dateLabel(item)}</p>
                            <p className="flex items-center gap-2"><Clock className="size-4 text-primary" /> {itemTime(item)}</p>
                            {item.location && <p className="flex items-start gap-2 break-words"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" /> {item.location}</p>}
                        </div>
                        {item.description && <p className="whitespace-pre-line break-words text-[13px] text-foreground/85">{item.description}</p>}
                        {item.images.length > 0 && (
                            <div>
                                <p className="mb-2 text-[13px] font-semibold">Gallery</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {item.images.map((u) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img key={u} src={mediaUrl(u)} alt="" className="aspect-[4/3] w-full rounded-md object-cover" />
                                    ))}
                                </div>
                            </div>
                        )}
                        {canEdit && (
                            <div className="flex flex-col gap-2 border-t border-border pt-3">
                                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Actions</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="outline" disabled={duplicate.isPending} onClick={() => duplicate.mutate(item.id, { onSuccess: onClose })}>
                                        <Copy className="size-3.5" /> Duplicate Agenda
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => days.length < 2
                                            ? toast.warning("This event has only one day, so there are no other days to move it to.")
                                            : setMoving(true)}
                                    >
                                        <Repeat className="size-3.5" /> Move to Another Day
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {canEdit && !moving && (
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button variant="outline" className="text-destructive" onClick={onDelete}><Trash2 className="size-3.5" /> Delete</Button>
                        <Button onClick={onEdit}><Pencil className="size-3.5" /> Edit</Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}

function AgendaFormDialog({
    eventId, item, days, items, initialDate, onClose,
}: {
    eventId: number; item: AgendaItem | null; days: string[]; items: AgendaItem[];
    initialDate: string | null; onClose: () => void;
}) {
    const save = useSaveAgendaItem(eventId);
    const editing = !!item;
    // A new agenda is always a single day; an item saved across days keeps its end date.
    const multiDay = !!item?.end_date;

    const blank = () => ({
        title: "", description: "", date: initialDate ?? days[0] ?? "", endDate: "",
        start: "", end: "", location: "", images: [] as string[],
    });
    const [f, setF] = useState(() => item ? {
        title: item.title, description: item.description ?? "", date: item.agenda_date, endDate: item.end_date ?? "",
        start: hhmm(item.start_time), end: hhmm(item.end_time), location: item.location ?? "", images: [...item.images],
    } : blank());
    const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
    const [tried, setTried] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [added, setAdded] = useState(false);
    const [overlap, setOverlap] = useState<{ clashes: AgendaItem[]; duplicate: boolean } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const startRef = useRef<HTMLInputElement>(null);

    const addImage = async (file: File | undefined) => {
        if (!file) return;
        if (f.images.length >= MAX_IMAGES) return toast.warning(`You can add a maximum of ${MAX_IMAGES} images.`);
        if (!file.type.startsWith("image/")) return toast.error("Please choose an image.");
        if (file.size > 2 * 1024 * 1024) return toast.error("That image is larger than 2MB.");
        setUploading(true);
        try {
            const url = await uploadAgendaImage(eventId, file);
            setF((p) => ({ ...p, images: [...p.images, url] }));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not upload the image");
        } finally {
            setUploading(false);
        }
    };

    const doSave = () => {
        setOverlap(null);
        save.mutate({
            id: item?.id,
            data: {
                title: f.title.trim(), description: f.description.trim(), agenda_date: f.date,
                end_date: multiDay ? f.endDate : null, start_time: f.start, end_time: f.end,
                location: f.location.trim(), images: f.images,
            },
            done: editing ? "Agenda updated" : null,
        }, { onSuccess: () => (editing ? onClose() : setAdded(true)) });
    };

    const submit = () => {
        setTried(true);
        if (!f.title.trim() || !f.date || (multiDay && !f.endDate) || !f.start || !f.end) {
            return toast.warning("Please complete all required fields.");
        }
        if (multiDay && !(f.endDate > f.date)) return toast.warning("The end date must be later than the start date.");
        if (!multiDay && f.start === f.end) return toast.warning("The end time must be different from the start time.");

        // "Session Time Overlap" — the same check as the app, before saving.
        const mine = spanOf(f.date, multiDay ? f.endDate : null, f.start, f.end);
        const clashes = items.filter((o) => o.id !== item?.id
            && overlaps(mine, spanOf(o.agenda_date, o.end_date, hhmm(o.start_time), hhmm(o.end_time))));
        if (clashes.length) {
            const same = (o: AgendaItem) => o.title.trim().toLowerCase() === f.title.trim().toLowerCase();
            const duplicate = clashes.some((o) => {
                const s = spanOf(o.agenda_date, o.end_date, hhmm(o.start_time), hhmm(o.end_time));
                return same(o) && !!s && !!mine && s[0] === mine[0] && s[1] === mine[1];
            });
            if (duplicate) clashes.sort((a, b) => Number(same(b)) - Number(same(a)));
            return setOverlap({ clashes, duplicate });
        }
        doSave();
    };

    const reset = () => { setF(blank()); setTried(false); setAdded(false); };
    const bad = (v: string) => tried && !v.trim();
    const pastMidnight = !multiDay && f.start && f.end && f.end < f.start;

    const dayField = (label: string, value: string, onChange: (v: string) => void) => (
        <div className="flex flex-col gap-1.5">
            <Label className="text-[12.5px]">{label} <span className="text-destructive">*</span></Label>
            {days.length > 0 ? (
                <Select value={value} onValueChange={onChange}>
                    <SelectTrigger className={cn("h-9 text-[13px]", bad(value) && "border-destructive")}><SelectValue placeholder="Choose a day" /></SelectTrigger>
                    <SelectContent>
                        {days.map((d, i) => <SelectItem key={d} value={d}>Day {i + 1} · {longDay(d)}</SelectItem>)}
                    </SelectContent>
                </Select>
            ) : (
                <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={cn(bad(value) && "border-destructive")} />
            )}
        </div>
    );

    if (added) {
        return (
            <Dialog open onOpenChange={(o) => !o && onClose()}>
                <DialogContent className="sm:max-w-md">
                    <div className="flex flex-col items-center gap-3 py-4 text-center">
                        <CheckCircle2 className="size-16 text-success" />
                        <DialogTitle className="text-[18px]">Agenda Added Successfully!</DialogTitle>
                        <DialogDescription>The agenda has been added to your event schedule.</DialogDescription>
                        <div className="mt-2 grid w-full gap-2">
                            <Button onClick={reset}>Add Another</Button>
                            <Button variant="outline" onClick={onClose}>Back to Agenda List</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <>
            <Dialog open={!overlap} onOpenChange={(o) => !o && !overlap && onClose()}>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit" : "Add"}</DialogTitle>
                        <DialogDescription className="sr-only">Agenda item</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Agenda Title <span className="text-destructive">*</span></Label>
                            <Input value={f.title} maxLength={100} placeholder="e.g. Reception" onChange={(e) => set("title", e.target.value)} className={cn(bad(f.title) && "border-destructive")} />
                            <p className={cn("text-right text-[11px]", bad(f.title) ? "text-destructive" : "text-muted-foreground")}>{f.title.length}/100</p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Description</Label>
                            <Textarea value={f.description} maxLength={200} rows={3} placeholder="A short note for your guests" onChange={(e) => set("description", e.target.value)} />
                            <p className="text-right text-[11px] text-muted-foreground">{f.description.length}/200</p>
                        </div>
                        {multiDay ? (
                            <div className="grid grid-cols-2 gap-3">
                                {dayField("Start Date", f.date, (v) => set("date", v))}
                                {dayField("End Date", f.endDate, (v) => set("endDate", v))}
                            </div>
                        ) : dayField("Date", f.date, (v) => set("date", v))}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-[12.5px]">Start Time <span className="text-destructive">*</span></Label>
                                <Input ref={startRef} type="time" value={f.start} onChange={(e) => set("start", e.target.value)} className={cn(bad(f.start) && "border-destructive")} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-[12.5px]">End Time <span className="text-destructive">*</span></Label>
                                <Input type="time" value={f.end} onChange={(e) => set("end", e.target.value)} className={cn(bad(f.end) && "border-destructive")} />
                            </div>
                        </div>
                        {pastMidnight && <p className="-mt-1 text-[11.5px] text-muted-foreground">Ends after midnight (next day).</p>}
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Location</Label>
                            <div className="relative">
                                <MapPin className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input value={f.location} maxLength={150} placeholder="e.g. Main Hall" className="pl-8" onChange={(e) => set("location", e.target.value)} />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px]">Agenda Image</Label>
                            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void addImage(e.target.files?.[0]); e.target.value = ""; }} />
                            <div className="flex flex-wrap gap-2">
                                {f.images.map((u) => (
                                    <div key={u} className="relative h-[66px] w-[88px] overflow-hidden rounded-md border border-border">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={mediaUrl(u)} alt="" className="h-full w-full object-cover" />
                                        <button type="button" aria-label="Remove image" onClick={() => set("images", f.images.filter((x) => x !== u))}
                                            className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white">
                                            <X className="size-3" />
                                        </button>
                                    </div>
                                ))}
                                {f.images.length < MAX_IMAGES && (
                                    <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
                                        className="grid h-[66px] w-[88px] place-items-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted">
                                        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                                    </button>
                                )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">{f.images.length}/{MAX_IMAGES} images</p>
                        </div>
                    </div>
                    <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button disabled={save.isPending || uploading} onClick={submit}>{editing ? "Update" : "Save"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {overlap && (
                <Dialog open onOpenChange={(o) => !o && setOverlap(null)}>
                    <DialogContent className="sm:max-w-md">
                        <div className="flex flex-col items-center gap-2 text-center">
                            <span className="grid size-12 place-items-center rounded-full bg-warning/15 text-warning"><TriangleAlert className="size-6" /></span>
                            <DialogTitle>{overlap.duplicate ? "Possible Duplicate Session" : "Session Time Overlap"}</DialogTitle>
                            <DialogDescription>
                                {overlap.duplicate
                                    ? `A session with the same name is already scheduled at this time. Do you want to ${editing ? "update" : "create"} it anyway?`
                                    : "Another session overlaps with this time slot. Do you want to schedule both sessions at the same time?"}
                            </DialogDescription>
                        </div>
                        <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-[12.5px]">
                            {overlap.clashes.slice(0, 2).map((c) => (
                                <div key={c.id}>
                                    <p className="text-[11px] font-semibold uppercase text-muted-foreground">Existing Session</p>
                                    <p className="font-semibold">{c.title}</p>
                                    <p className="text-muted-foreground">{itemTime(c)}</p>
                                </div>
                            ))}
                            {overlap.clashes.length > 2 && <p className="text-muted-foreground">+ {overlap.clashes.length - 2} more</p>}
                            <div>
                                <p className="text-[11px] font-semibold uppercase text-muted-foreground">New Session</p>
                                <p className="font-semibold">{f.title.trim()}</p>
                                <p className="text-muted-foreground">{timeLabel(f.start)} - {timeLabel(f.end)}</p>
                            </div>
                        </div>
                        <p className="text-center text-[11.5px] text-muted-foreground">Both sessions will appear in the Event Agenda with an overlapping time indicator.</p>
                        <div className="grid gap-2">
                            <Button disabled={save.isPending} onClick={doSave}>{editing ? "Update Anyway" : "Create Anyway"}</Button>
                            <Button variant="outline" onClick={() => { setOverlap(null); setTimeout(() => startRef.current?.focus(), 50); }}>Change Time</Button>
                            <Button variant="ghost" onClick={() => setOverlap(null)}>Cancel</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}

function DeleteAgendaDialog({
    eventId, item, onClose, onDeleted,
}: { eventId: number; item: AgendaItem | null; onClose: () => void; onDeleted: () => void }) {
    const remove = useDeleteAgendaItem(eventId);
    return (
        <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete</DialogTitle>
                    <DialogDescription>&quot;{item?.title}&quot; will be removed from the agenda.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" disabled={remove.isPending}
                        onClick={() => item && remove.mutate(item.id, { onSuccess: () => { onClose(); onDeleted(); } })}>
                        Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
