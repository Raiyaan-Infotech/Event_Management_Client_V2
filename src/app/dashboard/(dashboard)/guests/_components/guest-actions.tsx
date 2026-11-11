"use client";

import { useState } from "react";
import Link from "next/link";
import { GuestSheet } from "./guest-sheet";
import { toast } from "sonner";
import {
    CheckCircle2, Clock, Eye, EyeOff, Mail, MessageSquare, Pencil, Star, Trash2, X, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    ActionSheet, CheckChoices, DeletePopup, DetailRow, DetailSection, FormField, InfoGrid, Notice, PersonSummary, StatusPill, TONE_TEXT, type Tone,
} from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { useDateFormatter } from "@/hooks/use-client-settings";
import { useClientEvent } from "@/hooks/use-client-events";
import {
    GUEST_STATUS_LABELS, useBulkGuests, useDeleteGuest, useGuest, useUpdateGuest,
    type Guest, type GuestStatus, type InviteChannel, type VipHighlight,
} from "@/hooks/use-guests";
import { CHANNELS } from "./guest-fields";
import { useEventHref } from "@/lib/event-workspace";

/**
 * The Guests row actions (web design 2026-11-04), each a slide-in panel:
 * View Guest, Edit Guest, Send Invitation, View RSVP Response, Mark as VIP,
 * Hide Guest, Delete Guest. Built from the module kit.
 */

export type GuestAction = "view" | "edit" | "invite" | "rsvp" | "vip" | "hide" | "delete";

export const STATUS_TONE: Record<GuestStatus, { tone: Tone; icon: LucideIcon }> = {
    added: { tone: "muted", icon: Clock },
    invited: { tone: "violet", icon: Mail },
    pending: { tone: "warning", icon: Clock },
    confirmed: { tone: "success", icon: CheckCircle2 },
    declined: { tone: "danger", icon: X },
};

export const sideLabel = (s?: string | null) => (s === "bride" ? "Bride Side" : s === "groom" ? "Groom Side" : "—");

export function StatusPillFor({ status }: { status?: GuestStatus | null }) {
    if (!status) return <span className="text-[12px] text-muted-foreground">—</span>;
    const t = STATUS_TONE[status];
    return <StatusPill tone={t.tone} icon={t.icon}>{GUEST_STATUS_LABELS[status]}</StatusPill>;
}

/** "Mother · Bride Side" + VIP / status pills — the card on top of every panel. */
function Summary({ g }: { g: Guest }) {
    return (
        <PersonSummary
            name={g.name}
            photo={g.photo}
            sub={[g.mobile ? `${g.dial_code || ""} ${g.mobile}`.trim() : null, g.group?.name].filter(Boolean).join(" · ")}
            pills={g.status ? <StatusPill tone={STATUS_TONE[g.status].tone}>{GUEST_STATUS_LABELS[g.status]}</StatusPill> : undefined}
        />
    );
}

const channelNames = (c?: InviteChannel[] | null) => (c ?? []).map((x) => CHANNELS.find((o) => o.value === x)?.label ?? x).join(", ");
const digits = (g: Guest) => `${g.dial_code || "+91"}${g.mobile ?? ""}`.replace(/\D/g, "");

export function GuestActionSheet({
    action, guest, eventId, onClose, onSwitch,
}: { action: GuestAction | null; guest: Guest | null; eventId: number; onClose: () => void; onSwitch: (a: GuestAction) => void }) {
    if (!action || !guest) return null;
    const props = { guest, eventId, onClose, onSwitch };
    switch (action) {
        case "view": return <ViewGuest {...props} />;
        case "edit": return <EditGuest {...props} />;
        case "invite": return <SendInvitation {...props} />;
        case "rsvp": return <ViewRsvp {...props} />;
        case "vip": return <MarkVip {...props} />;
        case "hide": return <HideGuest {...props} />;
        case "delete": return <DeleteGuest {...props} />;
    }
}

type P = { guest: Guest; eventId: number; onClose: () => void; onSwitch: (a: GuestAction) => void };

/* ── View Guest ─────────────────────────────────────────────────────────── */

function ViewGuest({ guest, onClose, onSwitch }: P) {
    const fmt = useDateFormatter();
    const full = useGuest(guest.id).data ?? guest;
    const g = { ...guest, ...full };
    const rsvp = full.rsvp;
    const visible = g.is_visible !== false;
    const count = g.invite_count ?? 1;
    const invitation = g.invited_at ? ["Sent", channelNames(g.invite_channels)].filter(Boolean).join(" · ") : "Not sent yet";
    const summary = g.status === "confirmed"
        ? `This guest has confirmed attendance for ${rsvp?.attending_count ?? count} ${(rsvp?.attending_count ?? count) === 1 ? "person" : "people"} and is ${visible ? "visible" : "hidden"} in the event mobile app.`
        : `This guest is ${GUEST_STATUS_LABELS[g.status ?? "added"].toLowerCase()} and ${visible ? "visible" : "hidden"} in the event mobile app.`;
    return (
        <ActionSheet open onClose={onClose} icon={Eye} title="View Guest" subtitle="Complete guest profile, invitation and RSVP details"
            footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => onSwitch("edit")}>Edit Guest</Button></>}>
            <Summary g={g} />
            {/* Relationship / Family Side / Invite Count / App Visibility removed — not in the app (2026-11-06). */}
            <InfoGrid items={[
                { label: "Group", value: g.group?.name ?? null },
                { label: "Status", value: g.status ? GUEST_STATUS_LABELS[g.status] : null },
            ]} />
            <DetailSection title="Contact Information">
                <DetailRow label="Mobile Number">{g.mobile ? `${g.dial_code || ""} ${g.mobile}`.trim() : null}</DetailRow>
                <DetailRow label="Email Address">{g.email}</DetailRow>
                <DetailRow label="Address">{g.address_line1}</DetailRow>
            </DetailSection>
            <DetailSection title="Invitation & RSVP Details">
                <DetailRow label="Invitation Status">{invitation}</DetailRow>
                <DetailRow label="RSVP Status" tone={g.status ? STATUS_TONE[g.status].tone : undefined}>{g.status ? GUEST_STATUS_LABELS[g.status] : null}</DetailRow>
                <DetailRow label="Attending Count">{rsvp ? `${rsvp.attending_count} ${rsvp.attending_count === 1 ? "guest" : "guests"}` : null}</DetailRow>
                <DetailRow label="Response Received">{rsvp?.responded_at ? fmt(rsvp.responded_at, true) : null}</DetailRow>
            </DetailSection>
            {g.notes && <DetailSection title="Notes"><p className="py-2 text-[12.5px]">{g.notes}</p></DetailSection>}
            <Notice tone="success">{summary}</Notice>
        </ActionSheet>
    );
}

/* ── Edit Guest ─────────────────────────────────────────────────────────── */

/** Edit Guest = the same slide-in panel as Add Guest, with the app's fields (Jamal, 2026-11-06). */
function EditGuest({ guest, eventId, onClose }: P) {
    return <GuestSheet eventId={eventId} guest={guest} onClose={onClose} />;
}

/* ── Send Invitation ────────────────────────────────────────────────────── */

const TEMPLATES = [
    { value: "classic", label: "Wedding Invitation – Classic" },
    { value: "warm", label: "Warm & Personal" },
    { value: "short", label: "Short Note" },
] as const;

function SendInvitation({ guest, eventId, onClose }: P) {
    const fmt = useDateFormatter();
    const bulk = useBulkGuests();
    const event = useClientEvent(eventId).data;
    const first = guest.name.split(/\s+/)[0] || guest.name;
    const when = event?.start_date ? fmt(event.start_date) : "";
    const where = event?.venue_name ?? "";
    const textFor = (t: string) => {
        const name = event?.name ?? "our event";
        if (t === "warm") return `Hi ${first}! It would mean so much to have you with us at ${name}${when ? ` on ${when}` : ""}${where ? ` at ${where}` : ""}. Please let us know if you can come.`;
        if (t === "short") return `${first}, you're invited to ${name}${when ? ` · ${when}` : ""}.`;
        return `Dear ${first}, you are warmly invited to ${name}${where ? ` at ${where}` : ""}${when ? ` on ${when}` : ""}.`;
    };
    const [channels, setChannels] = useState<InviteChannel[]>(guest.invite_channels?.length ? guest.invite_channels : ["whatsapp"]);
    const [template, setTemplate] = useState<string>("classic");
    const [message, setMessage] = useState<string>(guest.invite_message || "");
    const text = message || textFor(template);

    const send = () => {
        if (!channels.length) return toast.error("Please choose at least one channel.");
        if (channels.includes("email") && !guest.email) return toast.error("This guest has no email address — add one with Edit Guest.");
        // Opened in the click itself, so the browser does not block the window.
        if (channels.includes("whatsapp") && guest.mobile) window.open(`https://wa.me/${digits(guest)}?text=${encodeURIComponent(text)}`, "_blank");
        if (channels.includes("email") && guest.email) {
            window.location.href = `mailto:${guest.email}?subject=${encodeURIComponent(`You're Invited — ${event?.name ?? ""}`)}&body=${encodeURIComponent(text)}`;
        }
        bulk.mutate({ guest_ids: [guest.id], action: "invite", value: { channels, message: text } }, { onSuccess: onClose });
    };

    return (
        <ActionSheet open onClose={onClose} icon={Mail} title="Send Invitation" subtitle="Invite the selected guest through available channels"
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={bulk.isPending} onClick={send}>Send Invitation</Button></>}>
            <Summary g={guest} />
            <DetailSection title="Invitation Channels">
                <div className="pt-2"><CheckChoices boxed value={channels} onChange={setChannels} options={CHANNELS.map(({ value, label }) => ({ value, label }))} /></div>
            </DetailSection>
            <FormField label="Invitation Template">
                <Select value={template} onValueChange={(v) => { setTemplate(v); setMessage(""); }}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{TEMPLATES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
            </FormField>
            <FormField label="Personal Message">
                <Textarea value={text} maxLength={1000} rows={3} onChange={(e) => setMessage(e.target.value)} />
            </FormField>
            <DetailSection title="Delivery Options">
                <div className="grid grid-cols-2 gap-2 pt-2">
                    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-[13px] font-medium"><Checkbox checked disabled /> Send Now</label>
                    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                        <Checkbox disabled /> Schedule Later <span className="text-[11px]">(soon)</span>
                    </label>
                </div>
                <p className="pt-2 text-[11.5px] text-muted-foreground">
                    WhatsApp and Email open with the message ready to send. In-App reaches the guest once they join the event.
                </p>
            </DetailSection>
            <Notice tone="primary">
                Preview: “You&apos;re Invited — {event?.name ?? "your event"}”{when && ` · ${when}`}{where && ` · ${where}`}.
            </Notice>
        </ActionSheet>
    );
}

/* ── View RSVP Response ─────────────────────────────────────────────────── */

const ANSWER: Record<string, { text: string; tone: Tone }> = {
    yes: { text: "Yes, we will attend.", tone: "success" },
    no: { text: "Sorry, we cannot attend.", tone: "danger" },
    maybe: { text: "Maybe — not sure yet.", tone: "warning" },
};

function ViewRsvp({ guest, eventId, onClose }: P) {
    const wsHref = useEventHref();
    const fmt = useDateFormatter();
    const full = useGuest(guest.id);
    const rsvp = full.data?.rsvp;
    const status = full.data?.status ?? guest.status;
    const answer = rsvp ? ANSWER[rsvp.response_type] : undefined;
    const responseType = !rsvp || rsvp.response_type === "none" ? "Not Responded"
        : rsvp.response_type === "yes" ? (rsvp.attending_count > 1 ? "All Invitees" : "Self Only")
            : rsvp.response_type === "no" ? "Not Attending" : "Maybe";
    return (
        <ActionSheet open onClose={onClose} icon={CheckCircle2} title="View RSVP Response" subtitle="Review attendance confirmation and response details"
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button asChild><Link href={wsHref(`/dashboard/events/${eventId}/rsvps`)}>Open RSVP Management</Link></Button>
                </>
            )}>
            <Summary g={guest} />
            {full.isLoading ? <p className="py-6 text-center text-[13px] text-muted-foreground">Loading…</p> : !rsvp ? (
                <Notice tone="info" title="No response yet">
                    {guest.name} has not joined the event yet, so there is no RSVP. It appears here once they scan the invitation QR and answer.
                </Notice>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-lg bg-primary/5 px-3 py-2">
                            <p className="text-[11.5px] text-muted-foreground">RSVP Status</p>
                            <p className={cn("text-[18px] font-bold", status && TONE_TEXT[STATUS_TONE[status].tone])}>
                                {status ? GUEST_STATUS_LABELS[status] : "—"}
                            </p>
                        </div>
                        <div className="rounded-lg bg-primary/5 px-3 py-2">
                            <p className="text-[11.5px] text-muted-foreground">Attending Count</p>
                            <p className="text-[18px] font-bold">{rsvp.attending_count} {rsvp.attending_count === 1 ? "Guest" : "Guests"}</p>
                        </div>
                    </div>
                    <DetailSection title="Response Information">
                        <DetailRow label="Response Type">{responseType}</DetailRow>
                        <DetailRow label="Response Date">{rsvp.responded_at ? fmt(rsvp.responded_at) : null}</DetailRow>
                        <DetailRow label="Response Time">
                            {rsvp.responded_at ? new Date(rsvp.responded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null}
                        </DetailRow>
                        <DetailRow label="Meal Preference">{rsvp.meal_preference}</DetailRow>
                    </DetailSection>
                    <DetailSection title="Guest Response">
                        <div className="flex flex-col gap-2 py-2">
                            {answer && <Notice tone={answer.tone === "success" ? "success" : answer.tone === "danger" ? "danger" : "warning"} icon={CheckCircle2}>{answer.text}</Notice>}
                            <p className="min-h-12 rounded-lg border border-border p-3 text-[12.5px]">{rsvp.special_requests || rsvp.notes || "No message."}</p>
                        </div>
                    </DetailSection>
                </>
            )}
            <Notice tone="primary">The RSVP record is linked to this guest. Changes to guest details do not automatically change the submitted response.</Notice>
        </ActionSheet>
    );
}

/* ── Mark as VIP ────────────────────────────────────────────────────────── */

const VIP_CATEGORIES = ["Close Family", "Special Guest", "Elder", "Chief Guest", "Close Friend", "Colleague"];
const WHERE: { value: VipHighlight; label: string }[] = [
    { value: "organizer_list", label: "Organizer guest list" },
    { value: "app_directory", label: "Mobile app participant directory" },
    { value: "invitation_contacts", label: "Invitation contact list" },
];

function MarkVip({ guest, onClose }: P) {
    const update = useUpdateGuest(() => onClose());
    const [on, setOn] = useState(true);
    const [category, setCategory] = useState(guest.vip_category || VIP_CATEGORIES[0]);
    const [label, setLabel] = useState(guest.vip_label || "VIP Guest");
    const [where, setWhere] = useState<VipHighlight[]>(guest.vip_highlight?.length ? guest.vip_highlight : ["organizer_list", "app_directory"]);
    const was = guest.is_vip === true;
    const save = () => update.mutate({
        id: guest.id,
        data: on
            ? { is_vip: true, vip_category: category, vip_label: label.trim() || "VIP", vip_highlight: where }
            : { is_vip: false },
    });
    return (
        <ActionSheet open onClose={onClose} icon={Star} title="Mark as VIP" subtitle="Highlight a guest with a VIP badge"
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={update.isPending} onClick={save}>{!on ? "Remove VIP" : was ? "Save VIP Settings" : "Mark as VIP"}</Button>
                </>
            )}>
            <Summary g={guest} />
            <Notice tone="primary">A VIP guest is highlighted with a special badge in the organizer&apos;s guest list and, when visible, in the mobile app.</Notice>
            <DetailSection title="VIP Guest Settings">
                <div className="flex flex-col gap-3 py-2">
                    <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-[13px] font-semibold">
                        <Checkbox checked={on} onCheckedChange={(v) => setOn(v === true)} /> Enable VIP status
                    </label>
                    <FormField label="VIP Category">
                        <Select value={category} onValueChange={setCategory} disabled={!on}>
                            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>{VIP_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                    </FormField>
                    <FormField label="VIP Display Label">
                        <Input value={label} maxLength={60} disabled={!on} onChange={(e) => setLabel(e.target.value)} className="h-9" />
                    </FormField>
                    <FormField label="Where to highlight">
                        <div className="flex flex-col gap-2">
                            {WHERE.map((w) => (
                                <label key={w.value} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-[13px] font-semibold">
                                    <Checkbox disabled={!on} checked={where.includes(w.value)}
                                        onCheckedChange={(v) => setWhere((x) => (v === true ? [...x, w.value] : x.filter((y) => y !== w.value)))} />
                                    {w.label}
                                </label>
                            ))}
                        </div>
                    </FormField>
                </div>
            </DetailSection>
            <Notice tone="success">
                {on ? `${guest.name} will be marked as VIP.` : `${guest.name} will no longer be a VIP.`} Existing invitation and RSVP details remain unchanged.
            </Notice>
        </ActionSheet>
    );
}

/* ── Hide Guest ─────────────────────────────────────────────────────────── */

const HIDE_REASONS = ["Privacy request", "Duplicate entry", "Not attending", "Organizer's choice", "Other"];

function HideGuest({ guest, onClose }: P) {
    const update = useUpdateGuest(() => onClose());
    const [hide, setHide] = useState(true);
    const [reason, setReason] = useState(guest.hidden_reason || HIDE_REASONS[0]);
    const [note, setNote] = useState(guest.hidden_note || "");
    return (
        <ActionSheet open onClose={onClose} icon={EyeOff} title="Hide Guest" subtitle="Remove from public guest lists without deletion"
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={update.isPending || !hide}
                        onClick={() => update.mutate({ id: guest.id, data: { is_visible: false, hidden_reason: reason, hidden_note: note.trim() || null } })}>
                        Hide Guest
                    </Button>
                </>
            )}>
            <Summary g={guest} />
            <InfoGrid items={[
                { label: "Current Visibility", value: "Visible" },
                { label: "New Visibility", value: <span className="text-destructive">{hide ? "Hidden" : "Visible"}</span> },
            ]} />
            <DetailSection title="Hide Guest from App">
                <div className="flex flex-col gap-3 py-2">
                    <label className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
                        <Checkbox checked={hide} onCheckedChange={(v) => setHide(v === true)} className="mt-0.5" />
                        <span>
                            <span className="block text-[13px] font-semibold">Hide this guest from the mobile app</span>
                            <span className="block text-[11.5px] text-muted-foreground">Guest will no longer appear in participant-facing lists.</span>
                        </span>
                    </label>
                    <FormField label="Reason for Hiding">
                        <Select value={reason} onValueChange={setReason}>
                            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>{HIDE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                        </Select>
                    </FormField>
                    <FormField label="Internal Notes">
                        <Textarea value={note} maxLength={500} rows={2} placeholder="Visible only to the event organizer" onChange={(e) => setNote(e.target.value)} />
                    </FormField>
                </div>
            </DetailSection>
            <Notice tone="warning" title="What happens?">
                <ul className="mt-1 list-disc pl-4">
                    <li>Guest profile remains available to event organizers.</li>
                    <li>Invitations and RSVP records are retained.</li>
                    <li>You can restore visibility later from the Hidden filter.</li>
                </ul>
            </Notice>
        </ActionSheet>
    );
}

/* ── Delete Guest ───────────────────────────────────────────────────────── */

function DeleteGuest({ guest, onClose }: P) {
    const remove = useDeleteGuest();
    return (
        // The centre confirm popup of every module (Jamal, 2026-11-09 / 11-11).
        <DeletePopup
            open onClose={onClose} busy={remove.isPending} confirmLabel="Delete Guest"
            title="Delete Guest?"
            description={<>{guest.name} will be permanently deleted from this event. Their invitation link is removed; an RSVP they already gave and the audit history are kept.</>}
            onConfirm={() => remove.mutate(guest.id, { onSuccess: onClose })}
        />
    );
}

/**
 * The row menu's items. Mark as VIP and Hide / Show Guest removed (Jamal, 2026-11-06 — the app has
 * neither); `_g` kept so callers need not change.
 */
export function guestMenu(_g: Guest, open: (a: GuestAction) => void) {
    return [
        { label: "View Guest", icon: Eye, onClick: () => open("view") },
        { label: "Edit Guest", icon: Pencil, onClick: () => open("edit") },
        { label: "Send Invitation", icon: Mail, onClick: () => open("invite") },
        { label: "View RSVP Response", icon: MessageSquare, onClick: () => open("rsvp") },
        { label: "Delete Guest", icon: Trash2, onClick: () => open("delete"), danger: true, divider: true },
    ];
}
