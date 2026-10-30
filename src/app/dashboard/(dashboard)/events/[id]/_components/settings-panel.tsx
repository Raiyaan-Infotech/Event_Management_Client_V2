"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import {
    useOrganizerContact, useParticipantSettings, useRsvpSettings, useSaveOrganizerContact,
    useSaveParticipantSettings, useSaveRsvpSettings, useUploadOrganizerPhoto,
    type OrganizerContact, type ParticipantSettings, type RsvpAnswer, type RsvpSettings,
} from "@/hooks/use-event-modules";
import type { ClientEvent } from "@/hooks/use-client-events";
import { Empty, PanelLoading, Section, SwitchRow } from "./module-ui";

/**
 * Event settings the mobile app already had and this portal did not:
 * Organizer Contact, Participants Settings and RSVP Settings.
 *
 * Each card loads from, and saves to, the same endpoint the app uses. A card's
 * form is seeded from props and re-mounted by `key` when the saved value
 * changes — never by an effect — so a save shows what the server stored.
 */

export function SettingsPanel({ event }: { event: ClientEvent }) {
    return (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
                <RsvpCard eventId={event.id} />
                <ParticipantsCard eventId={event.id} />
            </div>
            <ContactCard eventId={event.id} />
        </div>
    );
}

/* ── RSVP ──────────────────────────────────────────────────────────────────── */

const ANSWERS: { value: RsvpAnswer; label: string }[] = [
    { value: "yes", label: "Attending" },
    { value: "no", label: "Not Attending" },
    { value: "maybe", label: "Maybe" },
];

function RsvpCard({ eventId }: { eventId: number }) {
    const query = useRsvpSettings(eventId);
    if (query.isLoading) return <Section title="RSVP Settings"><PanelLoading /></Section>;
    if (query.isError || !query.data) {
        return <Section title="RSVP Settings"><Empty title="Could not load the RSVP settings" /></Section>;
    }
    return (
        <RsvpForm
            key={JSON.stringify(query.data.settings)}
            eventId={eventId}
            settings={query.data.settings}
            eventEnd={query.data.event_end_date}
        />
    );
}

function RsvpForm({
    eventId, settings, eventEnd,
}: { eventId: number; settings: RsvpSettings; eventEnd: string | null }) {
    const save = useSaveRsvpSettings(eventId);
    const [enabled, setEnabled] = useState(settings.enabled);
    const [options, setOptions] = useState<RsvpAnswer[]>(settings.response_options);
    const [deadline, setDeadline] = useState(settings.deadline ?? "");
    const [guestCount, setGuestCount] = useState(settings.allow_guest_count);
    const [requests, setRequests] = useState(settings.allow_special_requests);
    const [relationship, setRelationship] = useState(settings.allow_relationship);

    const toggleOption = (value: RsvpAnswer, on: boolean) => {
        const next = on ? [...options, value] : options.filter((o) => o !== value);
        if (next.length === 0) { toast.error("Keep at least one response option."); return; }
        setOptions(next);
    };

    return (
        <Section title="RSVP Settings">
            <SwitchRow id="rsvp-enabled" label="Enable RSVP" hint="Guests can answer from the app" checked={enabled} onChange={setEnabled} />
            <div className="flex flex-col gap-2.5 border-t py-3">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Response options</p>
                {ANSWERS.map((a) => (
                    <label key={a.value} className="flex items-center gap-2.5 text-[13px]">
                        <Checkbox checked={options.includes(a.value)} onCheckedChange={(v) => toggleOption(a.value, v === true)} /> {a.label}
                    </label>
                ))}
            </div>
            <div className="flex flex-col gap-1.5 border-t py-3">
                <Label className="text-[12.5px]">Response deadline</Label>
                <Input type="date" value={deadline} max={eventEnd ?? undefined} onChange={(e) => setDeadline(e.target.value)} className="max-w-[200px]" />
                <p className="text-[11.5px] text-muted-foreground">
                    Leave empty to close on the day the event ends{settings.effective_deadline ? ` (${settings.effective_deadline})` : ""}.
                </p>
            </div>
            <div className="border-t">
                <SwitchRow id="rsvp-count" label="Number of guests" hint="Ask how many are coming" checked={guestCount} onChange={setGuestCount} />
                <SwitchRow id="rsvp-requests" label="Special requests" hint="Let guests add a note" checked={requests} onChange={setRequests} />
                <SwitchRow id="rsvp-relation" label="Groom / Bride side and relationship" hint="Ask which side and how they are related" checked={relationship} onChange={setRelationship} />
            </div>
            <div className="mt-3 flex justify-end">
                <Button
                    disabled={save.isPending}
                    onClick={() => save.mutate({
                        enabled, response_options: options, deadline: deadline || null,
                        allow_guest_count: guestCount, allow_special_requests: requests, allow_relationship: relationship,
                    })}
                >
                    Save RSVP Settings
                </Button>
            </div>
        </Section>
    );
}

/* ── Participants ──────────────────────────────────────────────────────────── */

function ParticipantsCard({ eventId }: { eventId: number }) {
    const query = useParticipantSettings(eventId);
    if (query.isLoading) return <Section title="Participants Settings"><PanelLoading /></Section>;
    if (query.isError || !query.data) {
        return <Section title="Participants Settings"><Empty title="Could not load the participant settings" /></Section>;
    }
    return <ParticipantsForm key={JSON.stringify(query.data)} eventId={eventId} settings={query.data} />;
}

function ParticipantsForm({ eventId, settings }: { eventId: number; settings: ParticipantSettings }) {
    const save = useSaveParticipantSettings(eventId);
    const [profileScreen, setProfileScreen] = useState(settings.profile_screen);
    const [photo, setPhoto] = useState(settings.profile_photo);
    const [relationship, setRelationship] = useState(settings.relationship);
    const [attendance, setAttendance] = useState(settings.attendance_status);

    return (
        <Section title="Participants Settings">
            <SwitchRow
                id="part-profile" label="Participants Profile Screen"
                hint="Let a participant be opened to see their profile"
                checked={profileScreen} onChange={setProfileScreen}
            />
            <div className="flex flex-col gap-3 border-t pt-3">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Participant fields</p>
                <label className="flex items-center gap-2.5 text-[13px]"><Checkbox checked={photo} onCheckedChange={(v) => setPhoto(v === true)} /> Profile Photo</label>
                <label className="flex items-center gap-2.5 text-[13px] opacity-70"><Checkbox checked disabled /> Name <span className="text-[11.5px] text-muted-foreground">(always shown)</span></label>
                <label className="flex items-center gap-2.5 text-[13px]"><Checkbox checked={relationship} onCheckedChange={(v) => setRelationship(v === true)} /> Relationship</label>
                <label className="flex items-center gap-2.5 text-[13px]"><Checkbox checked={attendance} onCheckedChange={(v) => setAttendance(v === true)} /> Attendance Status</label>
            </div>
            <div className="mt-4 flex justify-end">
                <Button
                    disabled={save.isPending}
                    onClick={() => save.mutate({ profile_screen: profileScreen, profile_photo: photo, relationship, attendance_status: attendance })}
                >
                    Save Participant Settings
                </Button>
            </div>
        </Section>
    );
}

/* ── Organizer Contact ─────────────────────────────────────────────────────── */

function ContactCard({ eventId }: { eventId: number }) {
    const query = useOrganizerContact(eventId);
    if (query.isLoading) return <Section title="Organizer Contact"><PanelLoading /></Section>;
    if (query.isError || !query.data) {
        return <Section title="Organizer Contact"><Empty title="Could not load the organizer contact" /></Section>;
    }
    return <ContactForm key={JSON.stringify(query.data)} eventId={eventId} contact={query.data} />;
}

function ContactForm({ eventId, contact }: { eventId: number; contact: OrganizerContact }) {
    const save = useSaveOrganizerContact(eventId);
    const upload = useUploadOrganizerPhoto();
    const fileRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(contact.name ?? "");
    const [photo, setPhoto] = useState<string | null>(contact.photo);
    const [mobile, setMobile] = useState(contact.mobile ?? "");
    const [email, setEmail] = useState(contact.email ?? "");
    const [address, setAddress] = useState(contact.address ?? "");
    const [description, setDescription] = useState(contact.description ?? "");

    const submit = () => {
        const digits = mobile.replace(/\D/g, "");
        if (digits && (digits.length < 6 || digits.length > 15)) {
            toast.error("Please enter a valid mobile number.");
            return;
        }
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
            toast.error("Please enter a valid email address.");
            return;
        }
        // Empty strings clear a field; the server treats them as null.
        save.mutate({
            name: name.trim(), photo: photo ?? "", mobile: mobile.trim(),
            email: email.trim(), address: address.trim(), description: description.trim(),
        });
    };

    return (
        <Section title="Organizer Contact">
            <p className="mb-3 text-[12px] text-muted-foreground">
                The contact card guests see in the app&apos;s Contact Person section.
                The role, contact time, languages and responsibilities are edited in the mobile app.
            </p>
            <div className="flex flex-col items-center gap-2 pb-3">
                <button type="button" onClick={() => fileRef.current?.click()} className="relative rounded-full" aria-label="Choose a photo">
                    <Avatar className="size-20">
                        {photo ? <AvatarImage src={mediaUrl(photo)} alt="" /> : null}
                        <AvatarFallback><User className="size-8" /></AvatarFallback>
                    </Avatar>
                    <span className="absolute right-0 bottom-0 grid size-6 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                        <Camera className="size-3" />
                    </span>
                </button>
                <input
                    ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) upload.mutate(file, { onSuccess: (url) => setPhoto(url) });
                    }}
                />
                <div className="flex gap-3 text-[12px]">
                    <button type="button" className="text-primary" onClick={() => fileRef.current?.click()}>
                        {upload.isPending ? "Uploading…" : photo ? "Change Photo" : "Add Photo"}
                    </button>
                    {photo && <button type="button" className="text-destructive" onClick={() => setPhoto(null)}>Remove</button>}
                </div>
            </div>
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Name</Label>
                    <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Mobile</Label>
                        <Input value={mobile} maxLength={30} inputMode="tel" onChange={(e) => setMobile(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Email</Label>
                        <Input type="email" value={email} maxLength={150} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Address</Label>
                    <Input value={address} maxLength={500} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">About Contact Person</Label>
                    <Textarea value={description} rows={3} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
                </div>
            </div>
            <div className={cn("mt-4 flex justify-end")}>
                <Button disabled={save.isPending || upload.isPending} onClick={submit}>Save Organizer Contact</Button>
            </div>
        </Section>
    );
}
