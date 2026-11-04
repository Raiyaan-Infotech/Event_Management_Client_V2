"use client";

import { MapPin, Mail, MessageCircle, Smartphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneInput } from "@/components/common/phone-input";
import { FormField, NumberStepper, SideNote } from "@/components/module-kit";
import { countryForDial, dialOf, mobileNumberError, nationalMobile } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { relationSuitsSide } from "@/hooks/use-event-modules";
import {
    useGuestFormOptions, type Guest, type GuestPayload, type GuestType, type InviteChannel,
} from "@/hooks/use-guests";

/**
 * The guest fields of the Guests web design (2026-11-04), shared by the right
 * "Add Guest" panel and the "Edit Guest" slide-in: Guest Type, Guest Name,
 * Mobile, Email, Relationship, Family Side, Invite Count, Address, Notes.
 * The panels add their own extras (photo, RSVP Required, Visibility, VIP,
 * Send Invitation via) around these.
 */

export const GUEST_TYPES: { value: GuestType; label: string }[] = [
    { value: "individual", label: "Individual" },
    { value: "couple", label: "Couple" },
    { value: "family", label: "Family" },
    { value: "group", label: "Group" },
];
export const guestTypeLabel = (t?: GuestType | null) => GUEST_TYPES.find((x) => x.value === t)?.label ?? "Individual";

export const CHANNELS: { value: InviteChannel; label: string; icon: typeof Mail }[] = [
    { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    { value: "email", label: "Email", icon: Mail },
    { value: "in_app", label: "In-App", icon: Smartphone },
];

export type GuestDraft = {
    type: GuestType; name: string; dial: string; mobile: string; email: string;
    relation: string; side: "groom" | "bride" | ""; count: number; address: string; notes: string;
    photo: string | null; rsvpRequired: boolean; visible: boolean; vip: boolean; channels: InviteChannel[];
};

export const blankDraft = (): GuestDraft => ({
    type: "individual", name: "", dial: "+91", mobile: "", email: "", relation: "", side: "",
    count: 1, address: "", notes: "", photo: null, rsvpRequired: true, visible: true, vip: false, channels: ["whatsapp"],
});

export const draftOf = (g: Guest): GuestDraft => ({
    type: g.guest_type ?? "individual", name: g.name ?? "", dial: g.dial_code || "+91", mobile: g.mobile ?? "",
    email: g.email ?? "", relation: g.relationship ?? "", side: g.side ?? "", count: g.invite_count ?? 1,
    address: g.address_line1 ?? "", notes: g.notes ?? "", photo: g.photo ?? null,
    rsvpRequired: g.rsvp_required !== false, visible: g.is_visible !== false, vip: g.is_vip === true,
    channels: g.invite_channels?.length ? g.invite_channels : ["whatsapp"],
});

/** The first problem with a draft, or null. Same order and wording as the form's toasts. */
export function draftError(d: GuestDraft, { needChannel }: { needChannel: boolean }): string | null {
    if (!d.name.trim() || !d.mobile.trim() || !d.relation || !d.side || d.count < 1) return "Please fill all mandatory fields.";
    const phone = mobileNumberError(countryForDial(d.dial), d.mobile);
    if (phone) return phone;
    if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) return "Please enter a valid email address.";
    if (needChannel && d.channels.length === 0) return "Please choose how to send the invitation.";
    return null;
}

/** The API body. The name is kept whole in first_name (last_name cleared), as the app's form does. */
export function payloadOf(d: GuestDraft, relationId: number | null): Partial<GuestPayload> {
    return {
        guest_type: d.type, first_name: d.name.trim(), last_name: null,
        mobile: nationalMobile(countryForDial(d.dial), d.mobile) || d.mobile, dial_code: d.dial,
        email: d.email.trim() || null, relationship: d.relation, relationship_option_id: relationId,
        side: d.side || null, invite_count: d.count, address_line1: d.address.trim() || null,
        notes: d.notes.trim() || null, photo: d.photo ?? "",
        rsvp_required: d.rsvpRequired, is_visible: d.visible, is_vip: d.vip,
    };
}

/** The relation options for a side (each name once), keeping a saved relation selectable. */
export function useRelationsFor(side: GuestDraft["side"], current: string) {
    const opts = useGuestFormOptions();
    const seen = new Set<string>();
    const list = (opts.data?.relationship_options ?? []).filter((o) => {
        const k = o.name.trim().toLowerCase();
        if (!relationSuitsSide(o.name, side || null) || seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    const items = current && !list.some((o) => o.name === current) ? [{ id: 0, name: current }, ...list] : list;
    const idOf = (name: string) => (opts.data?.relationship_options ?? []).find((o) => o.name === name)?.id ?? null;
    return { items, idOf, loading: opts.isLoading };
}

export function GuestFields({
    d, set, tried, notes = true, sideNotes = true,
}: { d: GuestDraft; set: (p: Partial<GuestDraft>) => void; tried: boolean; notes?: boolean; sideNotes?: boolean }) {
    const rel = useRelationsFor(d.side, d.relation);
    const bad = (v: boolean) => tried && v;
    return (
        <>
            <div className={cn("grid gap-3", sideNotes && "sm:grid-cols-[1fr_1fr]")}>
                <FormField label="Guest Type" required>
                    <Select value={d.type} onValueChange={(v) => set({ type: v as GuestType })}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{GUEST_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                </FormField>
                {sideNotes && <SideNote>Choose the guest type based on how you want to invite them.</SideNote>}
            </div>
            <FormField label="Guest Name" required>
                <Input value={d.name} maxLength={200} placeholder="Enter full name (e.g. Amina Begum)" onChange={(e) => set({ name: e.target.value })}
                    className={cn("h-9", bad(!d.name.trim()) && "border-destructive")} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Mobile Number" required>
                    <PhoneInput country={countryForDial(d.dial)} number={d.mobile} onChange={(iso, num) => set({ dial: dialOf(iso), mobile: num })} />
                </FormField>
                <FormField label="Email Address" hint=" (Optional)">
                    <Input type="email" value={d.email} placeholder="Enter email address" onChange={(e) => set({ email: e.target.value })} className="h-9" />
                </FormField>
                <FormField label="Relationship" required>
                    <Select value={d.relation} onValueChange={(v) => set({ relation: v })}>
                        <SelectTrigger className={cn("h-9 w-full", bad(!d.relation) && "border-destructive")}>
                            <SelectValue placeholder={rel.loading ? "Loading…" : "Select relationship"} />
                        </SelectTrigger>
                        <SelectContent>{rel.items.map((o) => <SelectItem key={`${o.id}-${o.name}`} value={o.name}>{o.name}</SelectItem>)}</SelectContent>
                    </Select>
                </FormField>
                <FormField label="Family Side" required>
                    <Select value={d.side} onValueChange={(v) => {
                        const side = v as "groom" | "bride";
                        // A relation of the other side does not carry over.
                        set({ side, ...(d.relation && !relationSuitsSide(d.relation, side) ? { relation: "" } : {}) });
                    }}>
                        <SelectTrigger className={cn("h-9 w-full", bad(!d.side) && "border-destructive")}><SelectValue placeholder="Select family side" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="bride">Bride Side</SelectItem>
                            <SelectItem value="groom">Groom Side</SelectItem>
                        </SelectContent>
                    </Select>
                </FormField>
            </div>
            <div className={cn("grid gap-3", sideNotes && "sm:grid-cols-[1fr_1fr]")}>
                <FormField label="Number of Guests / Invite Count" required>
                    <NumberStepper value={d.count} onChange={(n) => set({ count: n })} min={1} max={50} />
                </FormField>
                {sideNotes && <SideNote>Set the total number of people included in this invitation (e.g. 1, 2, 5).</SideNote>}
            </div>
            <FormField label="Address" hint=" (Optional)">
                <div className="relative">
                    <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={d.address} maxLength={255} placeholder="Enter address (e.g. City, State)" onChange={(e) => set({ address: e.target.value })} className="h-9 pl-9" />
                </div>
            </FormField>
            {notes && (
                <FormField label="Notes / Special Instructions" hint=" (Optional)">
                    <Textarea value={d.notes} maxLength={500} rows={2} placeholder="E.g. Seating preference, special assistance, etc." onChange={(e) => set({ notes: e.target.value })} />
                </FormField>
            )}
        </>
    );
}
