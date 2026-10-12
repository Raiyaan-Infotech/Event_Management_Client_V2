"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Camera, Pencil, Plus, Trash2, User } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import {
    relationSuitsSide, useDeleteFamilyMember, useEventFamily, useRelationOptions, useReorderFamily,
    useSaveFamilyMember, useSaveFamilySettings, useUploadPhoto, type FamilyMember, type FamilySettings,
} from "@/hooks/use-event-modules";
import type { ClientEvent } from "@/hooks/use-client-events";
import { Empty, FieldError, PanelLoading, Section, ShowInAppRow, SwitchRow } from "./module-ui";

/**
 * Family — the event's own family list, managed the way the app does it.
 *
 * ── NOT GUESTS (Jamal, 2026-10-12) ──────────────────────────────────────────
 * A family member is a record on the EVENT: no login, no RSVP, no guest group.
 * The organizer adds and edits; participants only view, in the app. Phone and
 * email are saved for the organizer and are never sent to a participant.
 *
 * Family Settings (the card at the bottom) decide what a participant is shown:
 * the photo, the relation, and whether a member's profile opens. The server
 * enforces them, so they are real switches and not hints.
 */

const TITLES = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];
const NONE = "__none__";

const sideLabel = (m: FamilyMember) => (m.side === "bride" ? "Bride Side" : "Groom Side");

export function FamilyPanel({ event }: { event: ClientEvent }) {
    const query = useEventFamily(event.id);
    const remove = useDeleteFamilyMember(event.id);
    const reorder = useReorderFamily(event.id);
    const [side, setSide] = useState<"all" | "groom" | "bride">("all");
    const [editing, setEditing] = useState<FamilyMember | "new" | null>(null);
    const [deleting, setDeleting] = useState<FamilyMember | null>(null);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Family"><Empty title="Could not load the family list">Please try again in a moment.</Empty></Section>;
    }
    const page = query.data;
    const all = page.items;
    const shown = side === "all" ? all : all.filter((m) => m.side === side);

    const move = (member: FamilyMember, delta: -1 | 1) => {
        const ids = all.map((m) => m.id);
        const from = ids.indexOf(member.id);
        const to = from + delta;
        if (to < 0 || to >= ids.length) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        reorder.mutate(ids);
    };

    const tabs = [
        { value: "all", label: `All (${all.length})` },
        { value: "groom", label: `Groom Side (${all.filter((m) => m.side === "groom").length})` },
        { value: "bride", label: `Bride Side (${all.filter((m) => m.side === "bride").length})` },
    ] as const;

    return (
        <div className="flex flex-col gap-5">
            <Section
                title="Family Members"
                action={<Button size="sm" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add Family Member</Button>}
            >
                <p className="mb-1 text-[12px] text-muted-foreground">
                    Manage the family members shown for this event. Participants can only view them.
                </p>
                <ShowInAppRow
                    eventId={event.id} menuIds={event.menu_ids ?? []} menuId={page.menu_id}
                    isDefault={page.is_default} show={page.show_in_app} label="Family"
                />

                <div className="my-3 flex flex-wrap gap-2">
                    {tabs.map((t) => (
                        <button
                            key={t.value} type="button" onClick={() => setSide(t.value)}
                            className={cn(
                                "rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition",
                                side === t.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {shown.length === 0 ? (
                    <Empty title="No family members yet">
                        {all.length === 0 ? "Click Add Family Member to add the first one." : "Nobody is on this side yet."}
                    </Empty>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {shown.map((m) => {
                            const place = all.indexOf(m) + 1;
                            return (
                                <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                                    <Avatar className="size-11">
                                        {m.photo ? <AvatarImage src={mediaUrl(m.photo)} alt="" /> : null}
                                        <AvatarFallback><User className="size-5" /></AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[13px] font-semibold">{[m.title, m.full_name].filter(Boolean).join(" ")}</p>
                                        <p className="truncate text-[12px] text-muted-foreground">
                                            {[m.relationship, sideLabel(m)].filter(Boolean).join(" • ")}
                                        </p>
                                    </div>
                                    <span className="w-6 text-center text-[12px] text-muted-foreground">{place}</span>
                                    <div className="flex shrink-0 gap-0.5">
                                        <Button size="icon" variant="ghost" className="size-8" aria-label="Move up" disabled={place === 1 || reorder.isPending} onClick={() => move(m, -1)}>
                                            <ArrowUp className="size-3.5" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="size-8" aria-label="Move down" disabled={place === all.length || reorder.isPending} onClick={() => move(m, 1)}>
                                            <ArrowDown className="size-3.5" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="size-8" aria-label="Edit" onClick={() => setEditing(m)}>
                                            <Pencil className="size-3.5" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="Delete" onClick={() => setDeleting(m)}>
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Section>

            <FamilySettingsCard
                // Re-seeds from props when the saved settings change.
                key={JSON.stringify(page.settings)}
                eventId={event.id}
                settings={page.settings}
            />

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
                            Delete Member
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** What a participant is shown — Profile Photo, Name (always), Relationship, and the profile page. */
function FamilySettingsCard({ eventId, settings }: { eventId: number; settings: FamilySettings }) {
    const save = useSaveFamilySettings(eventId);
    const [profileScreen, setProfileScreen] = useState(settings.profile_screen);
    const [photo, setPhoto] = useState(settings.profile_photo);
    const [relationship, setRelationship] = useState(settings.relationship);

    return (
        <Section title="Family Settings">
            <p className="text-[12px] text-muted-foreground">What a participant sees of the family list. The name is always shown.</p>
            <SwitchRow
                id="fam-profile" label="Family Profile Screen"
                hint="Let a family member be opened to see their profile"
                checked={profileScreen} onChange={setProfileScreen}
            />
            <div className="mt-1 flex flex-col gap-3 border-t pt-3">
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
            <div className="mt-4 flex justify-end">
                <Button
                    disabled={save.isPending}
                    onClick={() => save.mutate({ profile_screen: profileScreen, profile_photo: photo, relationship })}
                >
                    Save Settings
                </Button>
            </div>
        </Section>
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
    const [side, setSide] = useState<"groom" | "bride" | null>(member?.side ?? null);
    const [relation, setRelation] = useState<string>(member?.relationship ?? "");
    const [notes, setNotes] = useState(member?.notes ?? "");
    const [tried, setTried] = useState(false);

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
        const picked = (relations.data ?? []).find((o) => o.name === relation);
        save.mutate(
            {
                id: member?.id,
                data: {
                    first_name: first.trim(), last_name: last.trim() || null,
                    title: title === NONE ? null : title,
                    side, relationship: relation, relationship_option_id: picked?.id ?? null,
                    email: email.trim() || null, mobile: mobile.trim() || null, dial_code: "+91",
                    date_of_birth: dob || null, notes: notes.trim() || null,
                    // '' clears a photo that was removed.
                    photo: photo ?? "",
                },
            },
            { onSuccess: onClose },
        );
    };

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
                        <Input
                            inputMode="numeric" value={mobile} maxLength={15} placeholder="Digits only"
                            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
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
                        {member ? "Update Family Member" : "Add Family Member"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
