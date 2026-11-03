"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, GripVertical, MoreVertical, Pencil, Plus, Settings, Trash2, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/common/phone-input";
import { countryForDial, dialOf, mobileNumberError, nationalMobile } from "@/lib/phone";
import { mediaUrl } from "@/lib/media-url";
import {
    relationSuitsSide, useDeleteFamilyMember, useEventFamily, useRelationOptions, useReorderFamily,
    useSaveFamilyMember, useSaveFamilySettings, useUploadPhoto, type FamilyMember, type FamilySettings,
} from "@/hooks/use-event-modules";
import type { ClientEvent } from "@/hooks/use-client-events";
import { Empty, FieldError, PanelLoading, Section, SwitchRow } from "./module-ui";

/**
 * Family — the SAME as the V1 app's organizer Family list (Jamal, 2026-11-03):
 * "Family Members / Manage family members for your event", the ⚙ settings icon
 * (Family Settings), All / Groom Side / Bride Side, a card per member (photo,
 * name, "Father • Groom Side", the number, ⋮ = Edit / Change Photo / Delete),
 * drag a card to change the order, + Add. A tap opens Family Details. No "Show
 * in Event App" switch — the app removed it (App Menus decides).
 *
 * A family member is a record on the EVENT: no login, no RSVP, not a guest.
 */

const TITLES = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];
const NONE = "__none__";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const sideLabel = (m: FamilyMember) => (m.side === "bride" ? "Bride Side" : "Groom Side");
const fullName = (m: FamilyMember) => [m.title, m.full_name].filter(Boolean).join(" ");
const dayText = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
    return Number.isNaN(d.getTime()) ? "—" : `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export function FamilyPanel({ event }: { event: ClientEvent }) {
    const query = useEventFamily(event.id);
    const remove = useDeleteFamilyMember(event.id);
    const reorder = useReorderFamily(event.id);
    const save = useSaveFamilyMember(event.id);
    const upload = useUploadPhoto();
    const [side, setSide] = useState<"all" | "groom" | "bride">("all");
    const [editing, setEditing] = useState<FamilyMember | "new" | null>(null);
    const [deleting, setDeleting] = useState<FamilyMember | null>(null);
    const [viewing, setViewing] = useState<FamilyMember | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [dragId, setDragId] = useState<number | null>(null);
    const [photoFor, setPhotoFor] = useState<FamilyMember | null>(null);
    const photoRef = useRef<HTMLInputElement>(null);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Family"><Empty title="Could not load the family list">Please try again in a moment.</Empty></Section>;
    }
    const page = query.data;
    const all = page.items;
    const shown = side === "all" ? all : all.filter((m) => m.side === side);

    /** Drop the dragged card where `target` is (the order is the whole list's). */
    const dropOn = (target: FamilyMember) => {
        if (dragId === null || dragId === target.id) return setDragId(null);
        const ids = all.map((m) => m.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(target.id);
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setDragId(null);
        reorder.mutate(ids);
    };

    /** ⋮ Change Photo — straight to the picker, as the app. */
    const changePhoto = (m: FamilyMember) => {
        setPhotoFor(m);
        photoRef.current?.click();
    };
    const photoPicked = (file: File | undefined) => {
        const m = photoFor;
        if (!file || !m) return;
        upload.mutate(file, {
            onSuccess: (url) => save.mutate({ id: m.id, data: { photo: url }, done: "Photo updated" }),
        });
    };

    const tabs = [
        { value: "all", label: "All" },
        { value: "groom", label: "Groom Side" },
        { value: "bride", label: "Bride Side" },
    ] as const;

    return (
        <div className="flex flex-col gap-5">
            <Section
                title="Family Members"
                action={(
                    <div className="flex gap-2">
                        <Button size="icon" variant="outline" className="size-8" aria-label="Family Settings" onClick={() => setSettingsOpen(true)}>
                            <Settings className="size-3.5" />
                        </Button>
                        <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add</Button>
                    </div>
                )}
            >
                <p className="mb-1 text-[12px] text-muted-foreground">Manage family members for your event</p>

                <div className="my-3 flex flex-wrap gap-2">
                    {tabs.map((t) => (
                        <button
                            key={t.value} type="button" onClick={() => setSide(t.value)}
                            className={cn(
                                "rounded-lg border px-4 py-1.5 text-[12px] font-semibold transition",
                                side === t.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <input
                    ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => { photoPicked(e.target.files?.[0]); e.target.value = ""; }}
                />

                {shown.length === 0 ? (
                    <Empty title="No family members yet">
                        {all.length === 0 ? "Click Add to add the first one." : "Nobody is on this side yet."}
                    </Empty>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {shown.map((m) => {
                            const place = all.indexOf(m) + 1;
                            return (
                                <li
                                    key={m.id}
                                    draggable
                                    onDragStart={() => setDragId(m.id)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => dropOn(m)}
                                    onDragEnd={() => setDragId(null)}
                                    className={cn(
                                        "flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition",
                                        dragId === m.id && "opacity-50",
                                    )}
                                >
                                    <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-label="Drag to change the order" />
                                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setViewing(m)}>
                                        <Avatar className="size-11">
                                            {m.photo ? <AvatarImage src={mediaUrl(m.photo)} alt="" /> : null}
                                            <AvatarFallback><User className="size-5" /></AvatarFallback>
                                        </Avatar>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13px] font-semibold">{fullName(m)}</span>
                                            <span className="block truncate text-[12px] text-muted-foreground">
                                                {[m.relationship, sideLabel(m)].filter(Boolean).join(" • ")}
                                            </span>
                                        </span>
                                    </button>
                                    <span className="w-6 text-center text-[12px] text-muted-foreground">{place}</span>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Actions"><MoreVertical className="size-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setEditing(m)}><Pencil className="size-3.5" /> Edit</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => changePhoto(m)}><Camera className="size-3.5" /> Change Photo</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(m)}>
                                                <Trash2 className="size-3.5" /> Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Section>

            {settingsOpen && (
                <FamilySettingsDialog eventId={event.id} settings={page.settings} onClose={() => setSettingsOpen(false)} />
            )}

            {viewing && (() => {
                const m = all.find((x) => x.id === viewing.id) ?? viewing;
                return (
                    <FamilyDetailsDialog
                        member={m}
                        onClose={() => setViewing(null)}
                        onEdit={() => { setViewing(null); setEditing(m); }}
                        onDelete={() => { setViewing(null); setDeleting(m); }}
                    />
                );
            })()}

            {editing && (
                <FamilyDialog
                    key={editing === "new" ? "new" : editing.id}
                    eventId={event.id}
                    member={editing === "new" ? null : editing}
                    onClose={() => setEditing(null)}
                />
            )}

            <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Family Member?</DialogTitle>
                        <DialogDescription>
                            {deleting?.full_name} will be removed from this event&apos;s family list. You can add them again later.
                        </DialogDescription>
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

/** Family Details — the organizer's view of one member, with Edit and Delete (as the app). */
function FamilyDetailsDialog({
    member, onClose, onEdit, onDelete,
}: { member: FamilyMember; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
    const row = (label: string, value: string | null | undefined) => (
        <div className="flex items-start justify-between gap-4 py-2 text-[12.5px]">
            <span className="text-muted-foreground">{label}</span>
            <span className="break-words text-right font-medium">{value || "—"}</span>
        </div>
    );
    const phone = member.mobile ? [member.dial_code, member.mobile].filter(Boolean).join(" ") : null;
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Family Details</DialogTitle>
                    <DialogDescription className="sr-only">{member.full_name}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-2 text-center">
                    <Avatar className="size-20">
                        {member.photo ? <AvatarImage src={mediaUrl(member.photo)} alt="" /> : null}
                        <AvatarFallback><User className="size-8" /></AvatarFallback>
                    </Avatar>
                    <p className="text-[16px] font-bold">{fullName(member)}</p>
                </div>
                <div className="divide-y divide-border rounded-lg border border-border px-3">
                    {row("Relation", member.relationship)}
                    {row("Side", sideLabel(member))}
                    {row("Phone", phone)}
                    {row("Email", member.email)}
                    {row("Date of Birth", member.date_of_birth ? dayText(member.date_of_birth) : null)}
                    {row("Added On", dayText(member.created_at))}
                    {row("Notes", member.notes)}
                </div>
                <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
                    <Button variant="outline" className="text-destructive" onClick={onDelete}><Trash2 className="size-3.5" /> Delete</Button>
                    <Button onClick={onEdit}><Pencil className="size-3.5" /> Edit</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Family Settings — the ⚙ on the list: what a participant is shown (as the app). */
function FamilySettingsDialog({ eventId, settings, onClose }: { eventId: number; settings: FamilySettings; onClose: () => void }) {
    const save = useSaveFamilySettings(eventId);
    const [profileScreen, setProfileScreen] = useState(settings.profile_screen);
    const [photo, setPhoto] = useState(settings.profile_photo);
    const [relationship, setRelationship] = useState(settings.relationship);

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Family Settings</DialogTitle>
                    <DialogDescription>What a participant sees of the family list. The name is always shown.</DialogDescription>
                </DialogHeader>
                <SwitchRow
                    id="fam-profile" label="Family Profile Screen"
                    hint="Let a family member be opened to see their profile"
                    checked={profileScreen} onChange={setProfileScreen}
                />
                <div className="flex flex-col gap-3 border-t pt-3">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Family fields</p>
                    <label className="flex items-center gap-2.5 text-[13px]">
                        <Checkbox checked={photo} onCheckedChange={(v) => setPhoto(v === true)} /> Profile Photo
                    </label>
                    <label className="flex items-center gap-2.5 text-[13px] opacity-70">
                        <Checkbox checked disabled /> Name <span className="text-[11.5px] text-muted-foreground">(always shown)</span>
                    </label>
                    <label className="flex items-center gap-2.5 text-[13px]">
                        <Checkbox checked={relationship} onCheckedChange={(v) => setRelationship(v === true)} /> Relationship
                    </label>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button
                        disabled={save.isPending}
                        onClick={() => save.mutate({ profile_screen: profileScreen, profile_photo: photo, relationship }, { onSuccess: onClose })}
                    >
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Add / Edit Family Member — the Add Participant form, minus what only a guest has. */
function FamilyDialog({
    eventId, member, onClose,
}: { eventId: number; member: FamilyMember | null; onClose: () => void }) {
    const save = useSaveFamilyMember(eventId);
    const upload = useUploadPhoto();
    const relations = useRelationOptions(eventId);
    const fileRef = useRef<HTMLInputElement>(null);

    const nameParts = (member?.full_name ?? "").trim().split(/\s+/);
    const [photo, setPhoto] = useState<string | null>(member?.photo ?? null);
    const [title, setTitle] = useState(member?.title ?? NONE);
    const [first, setFirst] = useState(nameParts[0] ?? "");
    const [last, setLast] = useState(nameParts.slice(1).join(" "));
    const [dob, setDob] = useState(member?.date_of_birth?.slice(0, 10) ?? "");
    const [email, setEmail] = useState(member?.email ?? "");
    const [mobile, setMobile] = useState(member?.mobile ?? "");
    const [dial, setDial] = useState(member?.dial_code || "+91");
    const [side, setSide] = useState<"groom" | "bride" | null>(member?.side ?? null);
    const [relation, setRelation] = useState<string>(member?.relationship ?? "");
    const [notes, setNotes] = useState(member?.notes ?? "");
    const [tried, setTried] = useState(false);
    const [done, setDone] = useState(false);

    // That side's relations only, each name once (the admin's list repeats some).
    const seen = new Set<string>();
    const options = (relations.data ?? []).filter((o) => {
        const key = o.name.trim().toLowerCase();
        if (!relationSuitsSide(o.name, side) || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    // An edited member's saved relation stays selectable even if the list changed.
    const relationItems = relation && !options.some((o) => o.name === relation)
        ? [{ id: 0, name: relation }, ...options]
        : options;

    const pickPhoto = (file: File | undefined) => {
        if (!file) return;
        upload.mutate(file, { onSuccess: (url) => setPhoto(url) });
    };

    const submit = () => {
        setTried(true);
        if (!first.trim() || !side || !relation) {
            toast.error("Please fill all mandatory fields.");
            return;
        }
        // Same per-country mobile check as the app (optional field).
        const phoneError = mobileNumberError(countryForDial(dial), mobile);
        if (phoneError) {
            toast.error(phoneError);
            return;
        }
        const picked = (relations.data ?? []).find((o) => o.name === relation);
        save.mutate(
            {
                id: member?.id,
                data: {
                    first_name: first.trim(), last_name: last.trim() || null,
                    title: title === NONE ? null : title,
                    side, relationship: relation, relationship_option_id: picked?.id ?? null,
                    email: email.trim() || null, mobile: nationalMobile(countryForDial(dial), mobile) || null, dial_code: dial,
                    date_of_birth: dob || null, notes: notes.trim() || null,
                    // '' clears a photo that was removed.
                    photo: photo ?? "",
                },
                done: null,
            },
            { onSuccess: () => setDone(true) },
        );
    };

    // The app's result page: "Family Member Added / Updated Successfully!".
    if (done) {
        return (
            <Dialog open onOpenChange={(o) => !o && onClose()}>
                <DialogContent className="sm:max-w-md">
                    <div className="flex flex-col items-center gap-3 py-4 text-center">
                        <CheckCircle2 className="size-16 text-success" />
                        <DialogTitle className="text-[18px]">
                            {member ? "Family Member Updated Successfully!" : "Family Member Added Successfully!"}
                        </DialogTitle>
                        <DialogDescription className="sr-only">Saved</DialogDescription>
                        <div className="mt-2 grid w-full gap-2">
                            {!member && (
                                <Button onClick={() => {
                                    setDone(false); setTried(false); setPhoto(null); setTitle(NONE); setFirst(""); setLast("");
                                    setDob(""); setEmail(""); setMobile(""); setSide(null); setRelation(""); setNotes("");
                                }}>
                                    Add Another
                                </Button>
                            )}
                            <Button variant="outline" onClick={onClose}>Back to Family List</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{member ? "Edit Family Member" : "Add Family Member"}</DialogTitle>
                    <DialogDescription>Saved and shown only — a family member has no login.</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center gap-2">
                    <button type="button" onClick={() => fileRef.current?.click()} className="relative rounded-full" aria-label="Choose a photo">
                        <Avatar className="size-24">
                            {photo ? <AvatarImage src={mediaUrl(photo)} alt="" /> : null}
                            <AvatarFallback><User className="size-10" /></AvatarFallback>
                        </Avatar>
                        <span className="absolute right-0 bottom-0 grid size-7 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                            <Camera className="size-3.5" />
                        </span>
                    </button>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
                    <div className="flex gap-3 text-[12px]">
                        <button type="button" className="text-primary" onClick={() => fileRef.current?.click()}>
                            {upload.isPending ? "Uploading…" : photo ? "Change Photo" : "Add Photo"}
                        </button>
                        {photo && <button type="button" className="text-destructive" onClick={() => setPhoto(null)}>Remove</button>}
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Title / Salutation</Label>
                        <Select value={title} onValueChange={setTitle}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Select (optional)" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>None</SelectItem>
                                {TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Date of Birth (optional)</Label>
                        <Input type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">First Name <span className="text-destructive">*</span></Label>
                        <Input value={first} onChange={(e) => setFirst(e.target.value)} className={cn(tried && !first.trim() && "border-destructive")} />
                        <FieldError show={tried && !first.trim()} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Last Name</Label>
                        <Input value={last} onChange={(e) => setLast(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Email (optional)</Label>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Phone Number (optional)</Label>
                        <PhoneInput
                            country={countryForDial(dial)}
                            number={mobile}
                            onChange={(iso, num) => { setDial(dialOf(iso)); setMobile(num); }}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label className="text-[12.5px]">Groom or Bride Side <span className="text-destructive">*</span></Label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["groom", "bride"] as const).map((s) => (
                                <button
                                    key={s} type="button"
                                    onClick={() => {
                                        setSide(s);
                                        // A relation of the other side does not carry over.
                                        if (relation && !relationSuitsSide(relation, s)) setRelation("");
                                    }}
                                    className={cn(
                                        "rounded-lg border px-3 py-2 text-[13px] font-medium transition",
                                        side === s ? "border-primary bg-primary/10 text-primary" : "border-border",
                                        tried && !side && "border-destructive",
                                    )}
                                >
                                    {s === "groom" ? "Groom" : "Bride"}
                                </button>
                            ))}
                        </div>
                        <FieldError show={tried && !side} />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label className="text-[12.5px]">
                            {side ? `Relation with ${side === "bride" ? "Bride" : "Groom"}` : "Relation"} <span className="text-destructive">*</span>
                        </Label>
                        <Select value={relation} onValueChange={setRelation} disabled={!side}>
                            <SelectTrigger className={cn("w-full", tried && !relation && "border-destructive")}>
                                <SelectValue placeholder={!side ? "Choose Groom or Bride first" : relations.isLoading ? "Loading…" : "Select relation"} />
                            </SelectTrigger>
                            <SelectContent>
                                {relationItems.map((o) => <SelectItem key={`${o.id}-${o.name}`} value={o.name}>{o.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <FieldError show={tried && !relation} />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label className="text-[12.5px]">Notes (optional)</Label>
                        <Textarea value={notes} maxLength={500} rows={3} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={save.isPending || upload.isPending} onClick={submit}>
                        {member ? "Update" : "Add Family Member"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
