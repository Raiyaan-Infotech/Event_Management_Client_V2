"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Eye, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/common/phone-input";
import { joinPhone, mobileNumberError, splitPhone } from "@/lib/phone";
import { mediaUrl } from "@/lib/media-url";
import {
    useOrganizerContact, useParticipantSettings, useRsvpSettings, useSaveOrganizerContact,
    useSaveParticipantSettings, useSaveRsvpSettings, useUploadOrganizerPhoto,
    type OrganizerContact, type ParticipantSettings, type RsvpAnswer, type RsvpSettings,
} from "@/hooks/use-event-modules";
import type { ClientEvent } from "@/hooks/use-client-events";
import { Empty, PanelLoading, Section, SwitchRow } from "./module-ui";
import { FamilySettingsCard } from "./family-panel";
import { WishSettingsCard } from "./wishes-panel";
import { useVisibleSettingsPages, type SettingsKey } from "./event-tabs";

/**
 * Menu Settings: RSVP, Participants, Family, Wish Settings and Contact Person.
 * RSVP Settings, Participants Settings and Contact Person — the SAME as the V1
 * app's screens (Jamal, 2026-11-03), each loading from and saving to the
 * endpoint the app uses:
 *   · RSVP: Response Options, Response Deadline, then Allow Number of Guests /
 *     Food Preference / to Specify the Relationship / Special Requests (the
 *     app's order); Save + Preview. No "Enable RSVP" — always on in the app.
 *   · Participants: Profile Screen + the fields other participants see
 *     (Profile Photo, Name, Relationship, Mobile, Email).
 *   · Contact Person: the app's Edit Contact — Full Name *, Designation / Role *,
 *     Mobile *, WhatsApp (Same as mobile), Email *, Address / Base Location,
 *     Preferred Contact Time *, Languages, About *.
 */

export function SettingsPanel({ event, only }: { event: ClientEvent; only?: SettingsKey | null }) {
    const pages = useVisibleSettingsPages();
    const card = (key: SettingsKey) => {
        if (!pages.some((p) => p.key === key)) return null;
        switch (key) {
            case "rsvp": return <RsvpCard key={key} eventId={event.id} />;
            case "participants": return <ParticipantsCard key={key} eventId={event.id} />;
            case "family": return <FamilySettingsCard key={key} eventId={event.id} />;
            case "wishes": return <WishSettingsCard key={key} eventId={event.id} />;
            case "contact": return <ContactCard key={key} eventId={event.id} />;
        }
    };
    // One page (Menu Settings → a sub-item).
    if (only) return <div className="max-w-3xl">{card(only) ?? <Empty title="Not included in your plan" />}</div>;
    // All of them: left column the module switches, right column Contact Person.
    return (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
                {card("rsvp")}
                {card("participants")}
                {card("family")}
            </div>
            <div className="flex flex-col gap-5">
                {card("contact")}
                {card("wishes")}
            </div>
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
    const [options, setOptions] = useState<RsvpAnswer[]>(settings.response_options);
    const [deadline, setDeadline] = useState(settings.deadline ?? "");
    const [guestCount, setGuestCount] = useState(settings.allow_guest_count);
    const [food, setFood] = useState(settings.allow_food_preference ?? false);
    const [relationship, setRelationship] = useState(settings.allow_relationship);
    const [requests, setRequests] = useState(settings.allow_special_requests);
    const [preview, setPreview] = useState(false);

    const toggleOption = (value: RsvpAnswer, on: boolean) => {
        const next = on ? [...options, value] : options.filter((o) => o !== value);
        if (next.length === 0) { toast.error("Keep at least one response option."); return; }
        setOptions(next);
    };

    return (
        <Section title="RSVP Settings">
            <div className="flex flex-col gap-2.5 pb-3">
                <div>
                    <p className="text-[13px] font-medium">Response Options</p>
                    <p className="text-[11.5px] text-muted-foreground">Allow guests to choose their response</p>
                </div>
                {ANSWERS.map((a) => (
                    <label key={a.value} className="flex items-center gap-2.5 text-[13px]">
                        <Checkbox checked={options.includes(a.value)} onCheckedChange={(v) => toggleOption(a.value, v === true)} /> {a.label}
                    </label>
                ))}
            </div>
            <div className="flex flex-col gap-1.5 border-t py-3">
                <Label className="text-[13px]">Response Deadline</Label>
                <Input type="date" value={deadline} max={eventEnd ?? undefined} onChange={(e) => setDeadline(e.target.value)} className="max-w-[200px]" />
                <p className="text-[11.5px] text-muted-foreground">
                    Leave empty to close on the day the event ends{settings.effective_deadline ? ` (${settings.effective_deadline})` : ""}.
                </p>
            </div>
            <div className="border-t">
                <SwitchRow id="rsvp-count" label="Allow Number of Guests" hint="Let guests specify total number" checked={guestCount} onChange={setGuestCount} />
                <SwitchRow id="rsvp-food" label="Allow Food Preference" hint="Let guests choose their food preference" checked={food} onChange={setFood} />
                <SwitchRow id="rsvp-relation" label="Allow to Specify the Relationship" hint="Let guests say how they are related" checked={relationship} onChange={setRelationship} />
                <SwitchRow id="rsvp-requests" label="Allow Special Requests" hint="Special needs, notes, etc." checked={requests} onChange={setRequests} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setPreview(true)}><Eye className="size-3.5" /> Preview</Button>
                <Button
                    disabled={save.isPending}
                    onClick={() => save.mutate({
                        enabled: true, response_options: options, deadline: deadline || null,
                        allow_guest_count: guestCount, allow_food_preference: food,
                        allow_relationship: relationship, allow_special_requests: requests,
                    })}
                >
                    Save
                </Button>
            </div>

            {preview && (
                <Dialog open onOpenChange={(o) => !o && setPreview(false)}>
                    <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                            <DialogTitle>RSVP Preview</DialogTitle>
                            <DialogDescription>What your guests see with these settings (not saved yet).</DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                            <p className="text-[13px] font-semibold">Will you attend?</p>
                            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
                                {ANSWERS.filter((a) => options.includes(a.value)).map((a, i) => (
                                    <span key={a.value} className={cn("rounded-md border px-2 py-2 text-center text-[12px] font-medium", i === 0 ? "border-primary bg-primary/10 text-primary" : "border-border")}>{a.label}</span>
                                ))}
                            </div>
                            {guestCount && <PreviewField label="Number of Guests" value="1" />}
                            {food && <PreviewField label="Food Preference" value="Choose…" />}
                            {relationship && <PreviewField label="Relationship" value="Choose…" />}
                            {requests && <PreviewField label="Special Requests" value="Any special needs…" tall />}
                            <span className="rounded-md bg-primary py-2 text-center text-[12.5px] font-semibold text-primary-foreground">Submit RSVP</span>
                            {deadline && <p className="text-center text-[11px] text-muted-foreground">Please respond by {deadline}</p>}
                        </div>
                        <DialogFooter><Button variant="outline" onClick={() => setPreview(false)}>Close</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </Section>
    );
}

function PreviewField({ label, value, tall }: { label: string; value: string; tall?: boolean }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[12px] font-medium">{label}</span>
            <span className={cn("rounded-md border border-border px-2.5 text-[12px] text-muted-foreground", tall ? "py-3" : "py-1.5")}>{value}</span>
        </div>
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
    const [mobile, setMobile] = useState(settings.mobile ?? false);
    const [email, setEmail] = useState(settings.email ?? false);

    const field = (label: string, checked: boolean, set?: (v: boolean) => void) => (
        <label className={cn("flex items-center gap-2.5 text-[13px]", !set && "opacity-70")}>
            <Checkbox checked={checked} disabled={!set} onCheckedChange={(v) => set?.(v === true)} /> {label}
            {!set && <span className="text-[11.5px] text-muted-foreground">(always shown)</span>}
        </label>
    );

    return (
        <Section title="Participants Settings">
            <SwitchRow
                id="part-profile" label="Participants Profile Screen"
                hint="Let a participant be opened to see their profile"
                checked={profileScreen} onChange={setProfileScreen}
            />
            <div className="flex flex-col gap-3 border-t pt-3">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Participant fields</p>
                {field("Profile Photo", photo, setPhoto)}
                {field("Name", true)}
                {field("Relationship", relationship, setRelationship)}
                {field("Mobile", mobile, setMobile)}
                {field("Email", email, setEmail)}
            </div>
            <div className="mt-4 flex justify-end">
                <Button
                    disabled={save.isPending}
                    onClick={() => save.mutate({ profile_screen: profileScreen, profile_photo: photo, relationship, mobile, email })}
                >
                    Save
                </Button>
            </div>
        </Section>
    );
}

/* ── Contact Person ────────────────────────────────────────────────────────── */

const LANGUAGES = ["English", "Tamil", "Hindi", "Malayalam", "Telugu", "Kannada", "Urdu", "Arabic", "Bengali", "Marathi", "Gujarati", "Punjabi"];

function ContactCard({ eventId }: { eventId: number }) {
    const query = useOrganizerContact(eventId);
    if (query.isLoading) return <Section title="Contact Person"><PanelLoading /></Section>;
    if (query.isError || !query.data) {
        return <Section title="Contact Person"><Empty title="Could not load the contact person" /></Section>;
    }
    return <ContactForm key={JSON.stringify(query.data)} eventId={eventId} contact={query.data} />;
}

function ContactForm({ eventId, contact }: { eventId: number; contact: OrganizerContact }) {
    const save = useSaveOrganizerContact(eventId);
    const upload = useUploadOrganizerPhoto();
    const fileRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(contact.name ?? "");
    const [photo, setPhoto] = useState<string | null>(contact.photo);
    const [designation, setDesignation] = useState(contact.designation ?? "");
    const [mobile, setMobile] = useState(contact.mobile ?? "");
    const [whatsapp, setWhatsapp] = useState(contact.whatsapp ?? "");
    const [sameAsMobile, setSameAsMobile] = useState(!!contact.whatsapp && contact.whatsapp === contact.mobile);
    const [email, setEmail] = useState(contact.email ?? "");
    const [address, setAddress] = useState(contact.address ?? "");
    const [from, setFrom] = useState(contact.time_from?.slice(0, 5) ?? "");
    const [to, setTo] = useState(contact.time_to?.slice(0, 5) ?? "");
    const [languages, setLanguages] = useState<string[]>(contact.languages ?? []);
    const [about, setAbout] = useState(contact.about ?? "");
    const [tried, setTried] = useState(false);

    const toggleLanguage = (l: string) =>
        setLanguages((p) => (p.includes(l) ? p.filter((x) => x !== l) : LANGUAGES.filter((x) => p.includes(x) || x === l)));

    const submit = () => {
        setTried(true);
        const phone = splitPhone(mobile);
        if (!name.trim() || !designation.trim() || !phone.number || !email.trim() || !from || !to || !about.trim()) {
            toast.error("Please fill all mandatory fields.");
            return;
        }
        const phoneError = mobileNumberError(phone.iso, phone.number);
        if (phoneError) return toast.error(phoneError);
        const wa = splitPhone(whatsapp);
        if (!sameAsMobile && wa.number) {
            const waError = mobileNumberError(wa.iso, wa.number);
            if (waError) return toast.error(`WhatsApp: ${waError}`);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return toast.error("Please enter a valid email address.");

        // Every key sent, so an emptied field is cleared — as the app.
        save.mutate({
            name: name.trim(), photo: photo ?? "", mobile: mobile.trim(), email: email.trim(),
            designation: designation.trim(),
            whatsapp: sameAsMobile ? mobile.trim() : (wa.number ? whatsapp.trim() : ""),
            address: address.trim(), time_from: from, time_to: to, languages, about: about.trim(),
        });
    };

    const bad = (v: string) => tried && !v.trim();
    const req = <span className="text-destructive">*</span>;

    return (
        <Section title="Contact Person">
            <p className="mb-3 text-[12px] text-muted-foreground">The contact card guests see in the app&apos;s Contact Person section.</p>
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
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Full Name {req}</Label>
                        <Input value={name} maxLength={200} placeholder="Enter full name" onChange={(e) => setName(e.target.value)} className={cn(bad(name) && "border-destructive")} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[12.5px]">Designation / Role {req}</Label>
                        <Input value={designation} maxLength={100} placeholder="Event Organizer" onChange={(e) => setDesignation(e.target.value)} className={cn(bad(designation) && "border-destructive")} />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Mobile Number {req}</Label>
                    <PhoneInput
                        country={splitPhone(mobile).iso}
                        number={splitPhone(mobile).number}
                        onChange={(iso, num) => setMobile(joinPhone(iso, num))}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">WhatsApp Number</Label>
                    {!sameAsMobile && (
                        <PhoneInput
                            country={splitPhone(whatsapp).iso}
                            number={splitPhone(whatsapp).number}
                            onChange={(iso, num) => setWhatsapp(joinPhone(iso, num))}
                        />
                    )}
                    <label className="flex items-center gap-2 text-[12.5px]">
                        <Checkbox checked={sameAsMobile} onCheckedChange={(v) => setSameAsMobile(v === true)} /> Same as mobile number
                    </label>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Email Address {req}</Label>
                    <Input type="email" value={email} maxLength={150} placeholder="contact@example.com" onChange={(e) => setEmail(e.target.value)} className={cn(bad(email) && "border-destructive")} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Address / Base Location</Label>
                    <Input value={address} maxLength={500} placeholder="City, State, Country" onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Preferred Contact Time {req}</Label>
                    <div className="grid grid-cols-2 gap-3">
                        <Input type="time" value={from} aria-label="From" onChange={(e) => setFrom(e.target.value)} className={cn(tried && !from && "border-destructive")} />
                        <Input type="time" value={to} aria-label="To" onChange={(e) => setTo(e.target.value)} className={cn(tried && !to && "border-destructive")} />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Languages</Label>
                    <div className="flex flex-wrap gap-1.5">
                        {LANGUAGES.map((l) => (
                            <button
                                key={l} type="button" onClick={() => toggleLanguage(l)}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-[12px] transition",
                                    languages.includes(l) ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-foreground hover:bg-muted",
                                )}
                            >
                                {l}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">About Contact Person {req}</Label>
                    <Textarea value={about} rows={3} maxLength={300} placeholder="How this person helps your guests" onChange={(e) => setAbout(e.target.value)} className={cn(bad(about) && "border-destructive")} />
                    <p className="text-right text-[11px] text-muted-foreground">{about.length}/300</p>
                </div>
            </div>
            <div className="mt-4 flex justify-end">
                <Button disabled={save.isPending || upload.isPending} onClick={submit}>Save Changes</Button>
            </div>
        </Section>
    );
}
