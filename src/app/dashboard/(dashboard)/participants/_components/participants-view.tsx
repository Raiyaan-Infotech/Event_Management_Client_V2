"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Camera, Check, Eye, MoreVertical, Pencil, Plus, Search, Trash2, User, UserPlus, Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EventMiniCard } from "@/components/common/event-mini-card";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ImageCropDialog } from "@/components/common/image-crop-dialog";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import { useClientEvents } from "@/hooks/use-client-events";
import { useGuests, useParticipantCapacity } from "@/hooks/use-guests";
import { useUploadPhoto } from "@/hooks/use-event-modules";
import {
    useEventParticipants, useRemoveParticipant, useSetParticipantPhoto, type ParticipantRow,
} from "@/hooks/use-event-participants";

/**
 * Participants — the app's Manage Participants on the web (Jamal, 2026-11-02).
 *
 * One event at a time (picked here, as the app's selected event). Tabs with
 * counts — All / Active / Pending: Active = signed in to the app at least once,
 * Pending = added and not signed in yet. A row: photo, name, phone,
 * "relation • side", and ⋮ → View RSVP, Edit, Change Photo, Remove.
 * Add Participant asks Add from Guest or Add Manually.
 *
 * Not here (as in the app, these are not saved on the server yet): Block and
 * Show in Participant List.
 */
type Tab = "all" | "active" | "pending";

const last10 = (v?: string | null) => String(v ?? "").replace(/\D/g, "").slice(-10);
const sideLabel = (s?: string | null) => (s === "bride" ? "Bride Side" : s === "groom" ? "Groom Side" : "");

/** One event's participants — opened from the event view's Participants tab (2026-11-02). */
export function ParticipantsView({ eventId: fixedId }: { eventId: number }) {
    const router = useRouter();
    const [eventId] = useState(String(fixedId));
    const events = useClientEvents({ status: "all", limit: 100 });
    const eventRows = useMemo(() => events.data?.data ?? [], [events.data]);
    useEffect(() => {
        // The event is fixed by the page.
    }, [eventRows, eventId]);
    const eventNum = eventId ? Number(eventId) : null;

    const list = useEventParticipants(eventNum);
    const capacity = useParticipantCapacity(eventNum);
    const remove = useRemoveParticipant();
    const setPhoto = useSetParticipantPhoto();
    const upload = useUploadPhoto();

    const [tab, setTab] = useState<Tab>("all");
    const [search, setSearch] = useState("");
    const [pendingDelete, setPendingDelete] = useState<ParticipantRow | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [pickGuest, setPickGuest] = useState(false);

    // Change Photo: pick → crop → upload → save on the participant.
    const fileRef = useRef<HTMLInputElement>(null);
    const [photoFor, setPhotoFor] = useState<ParticipantRow | null>(null);
    const [cropFile, setCropFile] = useState<File | null>(null);

    const rows = useMemo(() => list.data ?? [], [list.data]);
    const counts = useMemo(() => ({
        all: rows.length,
        active: rows.filter((r) => r.has_joined).length,
        pending: rows.filter((r) => !r.has_joined).length,
    }), [rows]);
    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            if (tab === "active" && !r.has_joined) return false;
            if (tab === "pending" && r.has_joined) return false;
            if (!q) return true;
            return [r.name, r.email, r.mobile, r.relationship].some((v) => String(v ?? "").toLowerCase().includes(q));
        });
    }, [rows, tab, search]);

    const full = !!capacity.data?.full;
    const eventName = eventRows.find((e) => String(e.id) === eventId)?.name;

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {/* Header */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[20px] font-bold leading-tight tracking-tight text-foreground">Participants</h1>
                    <p className="text-[12.5px] text-muted-foreground">The people attending this event.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => setAddOpen(true)} disabled={!eventNum || full} className="h-10 rounded-md text-[13px] font-semibold">
                        <Plus className="size-4" /> Add Participant
                    </Button>
                </div>
            </div>

            <EventMiniCard eventId={fixedId} />

            {!events.isLoading && eventRows.length === 0 && (
                <Card className="border border-border py-0 shadow-none">
                    <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3.5">
                        <p className="text-[13px] text-muted-foreground">Participants belong to an event. Create an event first.</p>
                        <Button asChild size="sm" className="h-8 text-[12px]"><Link href="/dashboard/events/create">Create Event</Link></Button>
                    </CardContent>
                </Card>
            )}

            {capacity.data?.limit != null && (
                <p className={cn("rounded-md px-3 py-2 text-[12px]", full ? "bg-destructive/10 text-destructive" : "bg-primary/5 text-muted-foreground")}>
                    <span className="font-semibold text-foreground">{capacity.data.used} / {capacity.data.limit}</span> participants on this event
                    {full ? " — the plan's limit is reached. Upgrade your plan to add more." : ""}
                </p>
            )}

            <Card className="min-w-0 gap-0 border border-border p-0 shadow-none">
                {/* Tabs + search */}
                <div className="flex flex-col gap-2 border-b p-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex gap-1">
                        {(["all", "active", "pending"] as Tab[]).map((t) => (
                            <button
                                key={t} type="button" onClick={() => setTab(t)}
                                className={cn(
                                    "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                                    tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {t === "all" ? "All" : t === "active" ? "Active" : "Pending"} ({counts[t]})
                            </button>
                        ))}
                    </div>
                    <div className="relative md:w-[300px]">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search participants..." className="h-9 rounded-md pl-8 text-[13px]" />
                    </div>
                </div>

                <CardContent className="p-0">
                    {list.isLoading ? (
                        <div className="flex flex-col gap-2 p-3">
                            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-md" />)}
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="flex flex-col items-center gap-1.5 py-10 text-center">
                            <Users className="size-7 text-muted-foreground" />
                            <p className="text-[13.5px] font-semibold">
                                {rows.length === 0 ? "No participants yet" : "No participants match"}
                            </p>
                            <p className="text-[12px] text-muted-foreground">
                                {rows.length === 0 ? "Add participants from your guests or one by one." : "Try another tab or search."}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-[12.5px]">
                                <thead>
                                    <tr className="border-b bg-muted/40 text-[11.5px] text-muted-foreground">
                                        <th className="py-2 pl-3 text-left font-medium">Participant</th>
                                        <th className="py-2 text-left font-medium">Phone</th>
                                        <th className="py-2 text-left font-medium">Relation</th>
                                        <th className="py-2 text-left font-medium">Members</th>
                                        <th className="py-2 text-left font-medium">Status</th>
                                        <th className="py-2 pr-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((p) => {
                                        const relationLine = [p.relationship, sideLabel(p.rsvp_side ?? p.side)].filter(Boolean).join(" • ");
                                        return (
                                            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                                                <td className="py-2 pl-3">
                                                    <div className="flex min-w-0 items-center gap-2.5">
                                                        <Avatar className="size-8">
                                                            {p.photo ? <AvatarImage key={p.photo} src={mediaUrl(p.photo)} alt="" /> : null}
                                                            <AvatarFallback className="text-[11px]">{p.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0">
                                                            <p className="max-w-[220px] font-semibold break-words line-clamp-1" title={p.name}>
                                                                {p.title ? `${p.title} ` : ""}{p.name}
                                                            </p>
                                                            {p.email ? <p className="max-w-[220px] text-[11px] break-all text-muted-foreground line-clamp-1">{p.email}</p> : null}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-2 whitespace-nowrap">{p.mobile ? `${p.dial_code ?? ""} ${p.mobile}`.trim() : "—"}</td>
                                                <td className="py-2"><span className="line-clamp-1 max-w-[200px] break-words">{relationLine || "—"}</span></td>
                                                <td className="py-2 tabular-nums">{p.party_size || 1}</td>
                                                <td className="py-2">
                                                    <span className={cn(
                                                        "rounded px-2 py-0.5 text-[11px] font-semibold",
                                                        p.has_joined ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600",
                                                    )}>
                                                        {p.has_joined ? "Active" : "Pending"}
                                                    </span>
                                                </td>
                                                <td className="py-2 pr-3 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${p.name}`}>
                                                                <MoreVertical className="size-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-[170px]">
                                                            <DropdownMenuItem asChild className="text-[12.5px]">
                                                                <Link href={`/dashboard/rsvps/${p.id}`}><Eye className="size-3.5" /> View Details</Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild className="text-[12.5px]">
                                                                <Link href={`/dashboard/participants/${p.id}/edit`}><Pencil className="size-3.5" /> Edit</Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem className="text-[12.5px]" onClick={() => { setPhotoFor(p); fileRef.current?.click(); }}>
                                                                <Camera className="size-3.5" /> Change Photo
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-[12.5px] text-destructive focus:text-destructive" onClick={() => setPendingDelete(p)}>
                                                                <Trash2 className="size-3.5" /> Remove
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <input
                ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = ""; }}
            />
            <ImageCropDialog
                file={cropFile}
                open={!!cropFile}
                onOpenChange={(o) => { if (!o) { setCropFile(null); setPhotoFor(null); } }}
                aspect={1}
                title="Crop Photo"
                onCropped={(file) => {
                    const target = photoFor;
                    setCropFile(null);
                    setPhotoFor(null);
                    if (!target) return;
                    upload.mutate(file, { onSuccess: (url) => setPhoto.mutate({ id: target.id, photo: url }) });
                }}
            />

            {/* Add Participant: from Guest or Manually (the app's sheet) */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Add Participant</DialogTitle>
                        <DialogDescription>{eventName ? `To ${eventName}` : "Choose how to add"}</DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2">
                        <button type="button" onClick={() => { setAddOpen(false); setPickGuest(true); }}
                            className="flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5">
                            <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><UserPlus className="size-4" /></span>
                            <span><span className="block text-[13px] font-semibold">Add from Guest</span>
                                <span className="block text-[11.5px] text-muted-foreground">Pick one of this event&apos;s guests</span></span>
                        </button>
                        <button type="button" onClick={() => { setAddOpen(false); router.push(`/dashboard/participants/add?event=${eventId}`); }}
                            className="flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5">
                            <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><User className="size-4" /></span>
                            <span><span className="block text-[13px] font-semibold">Add Manually</span>
                                <span className="block text-[11.5px] text-muted-foreground">Enter the participant&apos;s details</span></span>
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {pickGuest && eventNum && (
                <SelectGuestDialog
                    eventId={eventNum}
                    taken={new Set(rows.map((r) => last10(r.mobile)).filter(Boolean))}
                    onClose={() => setPickGuest(false)}
                    onPick={(guestId) => router.push(`/dashboard/participants/add?event=${eventId}&guest=${guestId}`)}
                />
            )}

            {/* Remove */}
            <Dialog open={!!pendingDelete} onOpenChange={(v) => { if (!v && !remove.isPending) setPendingDelete(null); }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Remove Participant?</DialogTitle>
                        <DialogDescription>
                            {pendingDelete?.name} will be removed from this event. Their place against the plan&apos;s limit is freed.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" disabled={remove.isPending} onClick={() => setPendingDelete(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={remove.isPending}
                            onClick={() => pendingDelete && remove.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) })}>
                            {remove.isPending ? "Removing..." : "Remove"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** Add from Guest: this event's guests; one already a participant shows "Added". */
function SelectGuestDialog({ eventId, taken, onClose, onPick }: {
    eventId: number;
    taken: Set<string>;
    onClose: () => void;
    onPick: (guestId: number) => void;
}) {
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [chosen, setChosen] = useState<number | null>(null);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);
    const guests = useGuests({ event_id: eventId, search: debounced || undefined, limit: 100 });
    const rows = guests.data?.data ?? [];

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle>Add from Guest</DialogTitle>
                    <DialogDescription>Choose a guest — their details fill the participant form.</DialogDescription>
                </DialogHeader>
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guests..." className="h-9 pl-8 text-[13px]" />
                </div>
                <div className="flex max-h-[340px] flex-col gap-1 overflow-y-auto">
                    {guests.isLoading ? (
                        Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-md" />)
                    ) : rows.length === 0 ? (
                        <p className="py-6 text-center text-[12.5px] text-muted-foreground">No guests on this event yet.</p>
                    ) : rows.map((g) => {
                        const added = taken.has(last10(g.mobile));
                        const on = chosen === g.id;
                        return (
                            <button
                                key={g.id} type="button" disabled={added} onClick={() => setChosen(g.id)}
                                className={cn(
                                    "flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors",
                                    on ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/60",
                                    added && "opacity-60",
                                )}
                            >
                                <Avatar className="size-8"><AvatarFallback className="text-[11px]">{g.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12.5px] font-semibold">{g.name}</span>
                                    <span className="block text-[11px] text-muted-foreground">{g.mobile ? `${g.dial_code ?? ""} ${g.mobile}`.trim() : "—"}</span>
                                </span>
                                {added ? (
                                    <span className="text-[11px] font-semibold text-muted-foreground">Added</span>
                                ) : (
                                    <span className={cn("grid size-5 place-items-center rounded-full border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                                        {on ? <Check className="size-3" /> : null}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={!chosen} onClick={() => chosen && onPick(chosen)}>Continue</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
