"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Clock, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
    useDeleteAgendaItem, useEventAgenda, useSaveAgendaItem, type AgendaItem,
} from "@/hooks/use-event-modules";
import type { ClientEvent } from "@/hooks/use-client-events";
import { useDateFormatter } from "@/hooks/use-client-settings";
import { Empty, FieldError, PanelLoading, Section, ShowInAppRow } from "./module-ui";

/**
 * Agenda — the event's schedule, managed from the portal the same way the app
 * does it (it replaces the old "Single session" placeholder). Add, edit and
 * delete an item; the day, time and place are what the guest sees.
 *
 * Pictures on an agenda item are added from the app for now. Saving here keeps
 * whatever pictures the item already has, because the form never sends `images`.
 */

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

function timeLabel(t: string | null) {
    if (!t) return "—";
    const [h, m] = t.split(":").map(Number);
    return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function AgendaPanel({ event }: { event: ClientEvent }) {
    const fmt = useDateFormatter();
    const query = useEventAgenda(event.id);
    const remove = useDeleteAgendaItem(event.id);
    const [editing, setEditing] = useState<AgendaItem | "new" | null>(null);
    const [deleting, setDeleting] = useState<AgendaItem | null>(null);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Agenda"><Empty title="Could not load the agenda">Please try again in a moment.</Empty></Section>;
    }
    const page = query.data;

    // Grouped by the day they start, in the order the host set.
    const byDay = new Map<string, AgendaItem[]>();
    for (const item of page.items) {
        byDay.set(item.agenda_date, [...(byDay.get(item.agenda_date) ?? []), item]);
    }

    return (
        <div className="flex flex-col gap-5">
            <Section
                title="Agenda"
                action={<Button size="sm" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add Agenda</Button>}
            >
                <ShowInAppRow
                    eventId={event.id} menuIds={event.menu_ids ?? []} menuId={page.menu_id}
                    isDefault={page.is_default} show={page.show_in_app} label="Agenda"
                />
                {page.items.length === 0 ? (
                    <Empty title="No agenda yet">
                        Add the sessions of this event — mehendi, sangeet, ceremony, reception — and guests will see them in the app.
                    </Empty>
                ) : (
                    <div className="mt-2 flex flex-col gap-5">
                        {[...byDay.entries()].map(([day, items]) => (
                            <div key={day}>
                                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{fmt(day)}</p>
                                <ul className="flex flex-col gap-2">
                                    {items.map((item) => (
                                        <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                                            <div className="min-w-0">
                                                <p className="break-words text-[13px] font-semibold">{item.title}</p>
                                                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                                                    <Clock className="size-3.5" />
                                                    {timeLabel(item.start_time)} – {timeLabel(item.end_time)}
                                                    {item.end_date && <span>· until {fmt(item.end_date)}</span>}
                                                </p>
                                                {item.location && (
                                                    <p className="mt-0.5 flex items-center gap-1.5 break-words text-[12px] text-muted-foreground">
                                                        <MapPin className="size-3.5 shrink-0" /> {item.location}
                                                    </p>
                                                )}
                                                {item.description && (
                                                    <p className="mt-1 break-words text-[12px] text-foreground/80">{item.description}</p>
                                                )}
                                            </div>
                                            <div className="flex shrink-0 gap-1">
                                                <Button size="icon" variant="ghost" className="size-8" aria-label="Edit" onClick={() => setEditing(item)}>
                                                    <Pencil className="size-3.5" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="Delete" onClick={() => setDeleting(item)}>
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {editing && (
                <AgendaDialog
                    // A new form per item, so it seeds from props and never by effect.
                    key={editing === "new" ? "new" : editing.id}
                    event={event}
                    item={editing === "new" ? null : editing}
                    onClose={() => setEditing(null)}
                />
            )}

            <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this agenda item?</DialogTitle>
                        <DialogDescription>&quot;{deleting?.title}&quot; will be removed from the agenda.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
                        <Button
                            variant="destructive" disabled={remove.isPending}
                            onClick={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function AgendaDialog({
    event, item, onClose,
}: { event: ClientEvent; item: AgendaItem | null; onClose: () => void }) {
    const save = useSaveAgendaItem(event.id);
    const [title, setTitle] = useState(item?.title ?? "");
    const [date, setDate] = useState(item?.agenda_date ?? event.start_date ?? "");
    const [endDate, setEndDate] = useState(item?.end_date ?? "");
    const [start, setStart] = useState(hhmm(item?.start_time ?? null));
    const [end, setEnd] = useState(hhmm(item?.end_time ?? null));
    const [location, setLocation] = useState(item?.location ?? "");
    const [description, setDescription] = useState(item?.description ?? "");
    const [tried, setTried] = useState(false);

    const submit = () => {
        setTried(true);
        if (!title.trim() || !date || !start || !end) {
            toast.error("Please fill all mandatory fields.");
            return;
        }
        save.mutate(
            {
                id: item?.id,
                data: {
                    title: title.trim(), agenda_date: date, end_date: endDate || null,
                    start_time: start, end_time: end,
                    location: location.trim() || null, description: description.trim() || null,
                },
            },
            { onSuccess: onClose },
        );
    };

    const bad = (v: string) => tried && !v.trim();

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{item ? "Edit Agenda" : "Add Agenda"}</DialogTitle>
                    <DialogDescription>Dates must fall within the event ({event.start_date} – {event.end_date}).</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label className="text-[12.5px]">Title <span className="text-destructive">*</span></Label>
                        <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className={cn(bad(title) && "border-destructive")} />
                        <FieldError show={bad(title)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Date <span className="text-destructive">*</span></Label>
                        <Input type="date" value={date} min={event.start_date ?? undefined} max={event.end_date ?? undefined} onChange={(e) => setDate(e.target.value)} className={cn(bad(date) && "border-destructive")} />
                        <FieldError show={bad(date)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">End date (multi-day, optional)</Label>
                        <Input type="date" value={endDate} min={date || undefined} max={event.end_date ?? undefined} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Start time <span className="text-destructive">*</span></Label>
                        <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={cn(bad(start) && "border-destructive")} />
                        <FieldError show={bad(start)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">End time <span className="text-destructive">*</span></Label>
                        <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={cn(bad(end) && "border-destructive")} />
                        <FieldError show={bad(end)} />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label className="text-[12.5px]">Location (optional)</Label>
                        <Input value={location} maxLength={150} onChange={(e) => setLocation(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label className="text-[12.5px]">Description (optional)</Label>
                        <Textarea value={description} maxLength={200} rows={3} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={save.isPending} onClick={submit}>{item ? "Save Changes" : "Add Agenda"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
