"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneInput } from "@/components/common/phone-input";
import { CharCount, FormField, FormPanel } from "@/components/module-kit";
import { countryForDial, dialOf, mobileNumberError, nationalMobile } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { GroupSheet } from "../groups/_components/group-sheet";
import { useAllGuestGroups, useCreateGuest, useGuestCapacity, useUpdateGuest, type Guest } from "@/hooks/use-guests";

/**
 * Add Guest / Edit Guest as the module's slide-in panel (uniform with the other modules — Jamal,
 * 2026-11-06), with the MOBILE APP's fields only: Full Name *, Mobile Number *, Group *, Email
 * (Optional), Note (Optional). The name is kept whole in first_name (last_name cleared), as the
 * app's form does; Edit sends only these fields, so anything else stored on the guest stays.
 */
export function GuestSheet({ eventId, guest, defaultGroup, onClose }: {
    eventId: number; guest?: Guest | null; defaultGroup?: string; onClose: () => void;
}) {
    const isEdit = !!guest;
    const groups = useAllGuestGroups();
    const capacity = useGuestCapacity();
    const [name, setName] = useState(guest ? [guest.first_name, guest.last_name].filter(Boolean).join(" ") || guest.name : "");
    const [dial, setDial] = useState(guest?.dial_code || "+91");
    const [mobile, setMobile] = useState(guest?.mobile ?? "");
    const [group, setGroup] = useState(guest?.group_id ? String(guest.group_id) : defaultGroup ?? "");
    const [email, setEmail] = useState(guest?.email ?? "");
    const [note, setNote] = useState(guest?.notes ?? "");
    const [errors, setErrors] = useState<Record<string, boolean>>({});
    const [addingGroup, setAddingGroup] = useState(false);
    const create = useCreateGuest(() => onClose());
    const update = useUpdateGuest(() => onClose());
    const saving = create.isPending || update.isPending;
    const full = !isEdit && !!capacity.data?.full;
    const list = groups.data ?? [];

    const save = () => {
        const bad: Record<string, boolean> = {};
        if (!name.trim()) bad.name = true;
        if (!mobile.trim()) bad.mobile = true;
        if (!group) bad.group = true;
        if (Object.keys(bad).length) { setErrors(bad); toast.error("Please fill all mandatory fields."); return; }
        const phone = mobileNumberError(countryForDial(dial), mobile);
        if (phone) { setErrors({ mobile: true }); toast.error(phone); return; }
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setErrors({ email: true }); toast.error("Please enter a valid email address."); return; }
        setErrors({});
        const data = {
            first_name: name.trim(), last_name: null, dial_code: dial, mobile: nationalMobile(countryForDial(dial), mobile),
            group_id: Number(group), email: email.trim() || null, notes: note.trim() || null,
        };
        if (isEdit && guest) update.mutate({ id: guest.id, data });
        else create.mutate({ ...data, event_id: eventId } as Parameters<typeof create.mutate>[0]);
    };

    return (
        <FormPanel
            icon={isEdit ? Pencil : UserPlus} title={isEdit ? "Edit Guest" : "Add Guest"}
            subtitle={isEdit ? "Update this guest's details." : "Add a new guest to your guest list."}
            sheet={{ open: true, onClose }}
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={saving || full} onClick={save}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Save Guest"}</Button>
                </>
            )}
        >
            {/* The "x / y guests used" line moved to the list's Plan Limit tile (Jamal, 2026-11-07); only the full warning stays. */}
            {full && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                    Guest limit reached — <Link href="/dashboard/billing" className="font-semibold text-primary">upgrade your plan</Link> to add more.
                </p>
            )}
            <FormField label="Full Name" required>
                <Input value={name} maxLength={100} placeholder="Enter full name" onChange={(e) => setName(e.target.value)} className={cn("h-9", errors.name && "border-destructive")} />
            </FormField>
            <FormField label="Mobile Number" required>
                <PhoneInput country={countryForDial(dial)} number={mobile} onChange={(iso, num) => { setDial(dialOf(iso)); setMobile(num); }}
                    placeholder="Enter mobile number" invalid={errors.mobile} />
            </FormField>
            <FormField label="Group" required>
                {!groups.isLoading && list.length === 0 ? (
                    <Button variant="outline" className="h-9 justify-start" onClick={() => setAddingGroup(true)}><Plus className="size-3.5" /> Create a group first</Button>
                ) : (
                    <Select value={group} onValueChange={setGroup}>
                        <SelectTrigger className={cn("h-9 w-full", errors.group && "border-destructive")}><SelectValue placeholder="Select group" /></SelectTrigger>
                        <SelectContent>{list.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}</SelectContent>
                    </Select>
                )}
            </FormField>
            <FormField label="Email" hint=" (Optional)">
                <Input type="email" value={email} maxLength={255} placeholder="Enter email address" onChange={(e) => setEmail(e.target.value)} className={cn("h-9", errors.email && "border-destructive")} />
            </FormField>
            <FormField label="Note" hint=" (Optional)">
                <Textarea value={note} maxLength={300} rows={3} placeholder="Add a note (e.g., relation, occasion)" onChange={(e) => setNote(e.target.value)} />
                <CharCount value={note} max={300} />
            </FormField>
            {addingGroup && <GroupSheet onClose={() => setAddingGroup(false)} />}
        </FormPanel>
    );
}
