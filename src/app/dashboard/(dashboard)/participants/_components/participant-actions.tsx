"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    Ban, CheckCircle2, CircleHelp, Clock, Eye, EyeOff, FileText, Mail, MessageSquare, Pencil, Phone, Send,
    Trash2, TriangleAlert, User, X, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    ActionSheet, CharCount, CheckChoices, DeleteSheet, DetailRow, DetailSection, FormField, Notice, PersonSummary,
    StatusPill, type Tone,
} from "@/components/module-kit";
import { PhoneInput } from "@/components/common/phone-input";
import { countryForDial, dialOf, mobileNumberError, nationalMobile } from "@/lib/phone";
import { useDateFormatter } from "@/hooks/use-client-settings";
import { useClientEvent } from "@/hooks/use-client-events";
import { relationSuitsSide } from "@/hooks/use-event-modules";
import { useGuestFormOptions, type InviteChannel } from "@/hooks/use-guests";
import { useRemoveParticipant, useSaveParticipant, type ParticipantRow } from "@/hooks/use-event-participants";
import { CHANNELS } from "../../guests/_components/guest-fields";

/**
 * Participants row actions (web design 2026-11-04), each a slide-in panel from
 * the module kit: View Participant, Edit Participant, Send Invitation, View RSVP
 * Response, Block Participant, Hide Participant, Delete Participant.
 */

export type Access = "active" | "pending" | "blocked";
export type PAction = "view" | "edit" | "invite" | "rsvp" | "block" | "hide" | "delete";
type Rsvp = "confirmed" | "pending" | "declined" | "maybe";

export const accessOf = (p: ParticipantRow): Access => (p.access as Access) ?? (p.is_blocked ? "blocked" : p.has_joined ? "active" : "pending");
export const rsvpOf = (p: ParticipantRow): Rsvp => {
    if (p.response_type === "no" || p.rsvp_status === "declined") return "declined";
    if (p.response_type === "yes" || p.rsvp_status === "accepted") return "confirmed";
    if (p.response_type === "maybe") return "maybe";
    if (p.response_type === "none" && p.rsvp_status === "invited" && p.has_joined) return "confirmed";
    return "pending";
};
const RSVP_META: Record<Rsvp, { label: string; tone: Tone; icon: LucideIcon }> = {
    confirmed: { label: "Confirmed", tone: "success", icon: CheckCircle2 },
    pending: { label: "Pending", tone: "warning", icon: Clock },
    declined: { label: "Declined", tone: "danger", icon: X },
    maybe: { label: "Maybe", tone: "amber", icon: CircleHelp },
};
const ACCESS_META: Record<Access, { label: string; tone: Tone; icon: LucideIcon }> = {
    active: { label: "Active", tone: "success", icon: CheckCircle2 },
    pending: { label: "Pending", tone: "warning", icon: Clock },
    blocked: { label: "Blocked", tone: "danger", icon: Ban },
};
export const sideName = (s?: string | null) => (s === "bride" ? "Bride Side" : s === "groom" ? "Groom Side" : null);

export const RsvpPill = ({ p }: { p: ParticipantRow }) => { const m = RSVP_META[rsvpOf(p)]; return <StatusPill tone={m.tone} icon={m.icon}>{m.label}</StatusPill>; };
export function AccessPill({ p }: { p: ParticipantRow }) {
    if (p.is_hidden) return <StatusPill tone="violet" icon={EyeOff}>Hidden</StatusPill>;
    const m = ACCESS_META[accessOf(p)];
    return <StatusPill tone={m.tone} icon={m.icon}>{m.label}</StatusPill>;
}
export const InvitePill = ({ p }: { p: ParticipantRow }) => (p.invite_status === "invited"
    ? <StatusPill tone="primary" icon={Mail}>Invited</StatusPill>
    : <StatusPill tone="warning" icon={Clock}>Pending</StatusPill>);
/** Linked Guest column: VIP, else the side. */
export function LinkedPill({ p }: { p: ParticipantRow }) {
    if (p.guest?.is_vip) return <StatusPill tone="amber">{p.guest.vip_label && p.guest.vip_label.length <= 12 ? p.guest.vip_label : "VIP"}</StatusPill>;
    const s = sideName(p.side ?? p.rsvp_side);
    return s ? <StatusPill tone={p.side === "bride" || p.rsvp_side === "bride" ? "primary" : "violet"}>{s}</StatusPill> : <span className="text-muted-foreground">—</span>;
}

function Summary({ p }: { p: ParticipantRow }) {
    return (
        <PersonSummary name={p.name} photo={p.photo} sub={p.relationship || undefined}
            pills={<>{sideName(p.side ?? p.rsvp_side) && <LinkedPill p={p} />}{rsvpOf(p) === "pending" && <RsvpPill p={p} />}<AccessPill p={p} /></>} />
    );
}

export function ParticipantSheet({ action, p, eventId, onClose, onSwitch }: {
    action: PAction | null; p: ParticipantRow | null; eventId: number; onClose: () => void; onSwitch: (a: PAction) => void;
}) {
    if (!action || !p) return null;
    const props = { p, eventId, onClose, onSwitch };
    switch (action) {
        case "view": return <ViewParticipant {...props} />;
        case "edit": return <EditParticipant {...props} />;
        case "invite": return <SendInvite {...props} />;
        case "rsvp": return <ViewRsvp {...props} />;
        case "block": return <BlockParticipant {...props} />;
        case "hide": return <HideParticipant {...props} />;
        case "delete": return <DeleteParticipant {...props} />;
    }
}

type P = { p: ParticipantRow; eventId: number; onClose: () => void; onSwitch: (a: PAction) => void };
const phoneOf = (p: ParticipantRow) => (p.mobile ? `${p.dial_code || "+91"} ${p.mobile}` : null);

/* ── View Participant ───────────────────────────────────────────────────── */

function ViewParticipant({ p, onClose, onSwitch }: P) {
    const fmt = useDateFormatter();
    return (
        <ActionSheet open onClose={onClose} icon={User} title="View Participant"
            footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => onSwitch("edit")}><Pencil className="size-3.5" /> Edit Participant</Button></>}>
            <Summary p={p} />
            <DetailSection title="Participant Details" icon={User}>
                <DetailRow label="Participant Name">{p.name}</DetailRow>
                <DetailRow label="Mobile Number">
                    {phoneOf(p) && <span className="inline-flex items-center gap-2">{phoneOf(p)}<a href={`tel:${(p.dial_code || "+91") + p.mobile}`} aria-label="Call" className="text-primary"><Phone className="size-3.5" /></a></span>}
                </DetailRow>
                <DetailRow label="Email Address">
                    {p.email && <span className="inline-flex items-center gap-2 break-all">{p.email}<a href={`mailto:${p.email}`} aria-label="Email" className="text-primary"><Mail className="size-3.5" /></a></span>}
                </DetailRow>
                <DetailRow label="Relationship">{p.relationship}</DetailRow>
                <DetailRow label="Linked Guest"><LinkedPill p={p} /></DetailRow>
                <DetailRow label="Badge">{p.guest?.is_vip ? (p.guest.vip_label || "VIP") : "—"}</DetailRow>
                <DetailRow label="Invite Status"><InvitePill p={p} /></DetailRow>
                <DetailRow label="RSVP Status"><RsvpPill p={p} /></DetailRow>
                <DetailRow label="Access Status"><AccessPill p={p} /></DetailRow>
                <DetailRow label="Joined Date">{p.created_at ? fmt(p.created_at, true) : null}</DetailRow>
                <DetailRow label="Visibility">{p.is_hidden ? <StatusPill tone="muted" icon={EyeOff}>Hidden</StatusPill> : <StatusPill tone="success" icon={Eye}>Visible</StatusPill>}</DetailRow>
                {p.is_blocked && <DetailRow label="Block Reason">{[p.block_reason, p.block_note].filter(Boolean).join(" — ")}</DetailRow>}
            </DetailSection>
            <DetailSection title="Additional Information" icon={FileText}>
                <DetailRow label="Notes">{p.notes}</DetailRow>
            </DetailSection>
        </ActionSheet>
    );
}

/* ── Edit Participant ───────────────────────────────────────────────────── */

const RSVP_TO_API: Record<Rsvp, { response_type: string; rsvp_status: string }> = {
    confirmed: { response_type: "yes", rsvp_status: "accepted" },
    pending: { response_type: "none", rsvp_status: "pending" },
    declined: { response_type: "no", rsvp_status: "declined" },
    maybe: { response_type: "maybe", rsvp_status: "pending" },
};

function EditParticipant({ p, eventId, onClose, onSwitch }: P) {
    const save = useSaveParticipant();
    const opts = useGuestFormOptions().data?.relationship_options ?? [];
    const event = useClientEvent(eventId).data;
    const [name, setName] = useState(p.name);
    const [dial, setDial] = useState(p.dial_code || "+91");
    const [mobile, setMobile] = useState(p.mobile ?? "");
    const [email, setEmail] = useState(p.email ?? "");
    const [relation, setRelation] = useState(p.relationship ?? "");
    const [side, setSide] = useState<"groom" | "bride" | "">((p.side ?? p.rsvp_side ?? "") as "groom" | "bride" | "");
    const [rsvp, setRsvp] = useState<Rsvp>(rsvpOf(p));
    const [blocked, setBlocked] = useState(!!p.is_blocked);
    const [notes, setNotes] = useState(p.notes ?? "");
    const [visible, setVisible] = useState(!p.is_hidden);
    const [invite, setInvite] = useState(false);
    const seen = new Set<string>();
    const relations = opts.filter((o) => { const k = o.name.toLowerCase(); if (!relationSuitsSide(o.name, side || null) || seen.has(k)) return false; seen.add(k); return true; });
    const items = relation && !relations.some((o) => o.name === relation) ? [{ id: 0, name: relation }, ...relations] : relations;

    const submit = () => {
        if (!name.trim() || !mobile.trim() || !relation || !side) return toast.error("Please complete all required fields.");
        const err = mobileNumberError(countryForDial(dial), mobile);
        if (err) return toast.error(err);
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return toast.error("Please enter a valid email address.");
        // Blocking needs a reason — that is the Block panel's job.
        if (blocked && !p.is_blocked) { onSwitch("block"); return; }
        save.mutate({
            id: p.id,
            data: {
                first_name: name.trim(), last_name: null, dial_code: dial, mobile: nationalMobile(countryForDial(dial), mobile) || mobile,
                email: email.trim() || null, relationship: relation, relationship_option_id: opts.find((o) => o.name === relation)?.id ?? null,
                side, rsvp_side: side, notes: notes.trim() || null,
                ...RSVP_TO_API[rsvp],
                ...(p.is_blocked && !blocked ? { is_blocked: false } : {}),
                is_hidden: !visible,
            } as never,
        }, {
            onSuccess: () => {
                if (invite && mobile) {
                    const text = `Dear ${name.split(/\s+/)[0]}, you are warmly invited to ${event?.name ?? "our event"}.`;
                    const to = `${dial}${nationalMobile(countryForDial(dial), mobile) || mobile}`.replace(/\D/g, "");
                    toast("Send the invitation on WhatsApp", { action: { label: "Open WhatsApp", onClick: () => window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank") }, duration: 10000 });
                }
                onClose();
            },
        });
    };

    const row = (label: string, required: boolean, control: React.ReactNode) => (
        <div className="grid grid-cols-[130px_1fr] items-center gap-3">
            <span className="text-[12.5px] font-medium">{label}{required && <span className="text-destructive">*</span>}</span>
            <div className="min-w-0">{control}</div>
        </div>
    );
    return (
        <ActionSheet open onClose={onClose} icon={Pencil} title="Edit Participant"
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.isPending} onClick={submit}>Save Changes</Button></>}>
            <Summary p={p} />
            <DetailSection title="Edit Participant Details" icon={Pencil}>
                <div className="flex flex-col gap-2.5 py-2">
                    {row("Participant Name", true, <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />)}
                    {row("Mobile Number", true, <PhoneInput country={countryForDial(dial)} number={mobile} onChange={(iso, n) => { setDial(dialOf(iso)); setMobile(n); }} />)}
                    {row("Email Address", false, <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />)}
                    {row("Relationship", true, (
                        <Select value={relation} onValueChange={setRelation}>
                            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Select relationship" /></SelectTrigger>
                            <SelectContent>{items.map((o) => <SelectItem key={`${o.id}-${o.name}`} value={o.name}>{o.name}</SelectItem>)}</SelectContent>
                        </Select>
                    ))}
                    {row("Linked Guest / Family Side", true, (
                        <Select value={side} onValueChange={(v) => { setSide(v as "groom" | "bride"); if (relation && !relationSuitsSide(relation, v as "groom" | "bride")) setRelation(""); }}>
                            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Select side" /></SelectTrigger>
                            <SelectContent><SelectItem value="bride">Bride Side</SelectItem><SelectItem value="groom">Groom Side</SelectItem></SelectContent>
                        </Select>
                    ))}
                    {row("Invite Status", false, <InvitePill p={p} />)}
                    {row("RSVP Status", true, (
                        <Select value={rsvp} onValueChange={(v) => setRsvp(v as Rsvp)}>
                            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>{(Object.keys(RSVP_META) as Rsvp[]).map((k) => <SelectItem key={k} value={k}>{RSVP_META[k].label}</SelectItem>)}</SelectContent>
                        </Select>
                    ))}
                    {row("Access Status", true, (
                        <Select value={blocked ? "blocked" : "active"} onValueChange={(v) => setBlocked(v === "blocked")}>
                            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="active">{p.has_joined ? "Active" : "Active (not joined yet)"}</SelectItem>
                                <SelectItem value="blocked">Blocked</SelectItem>
                            </SelectContent>
                        </Select>
                    ))}
                    {row("Notes", false, <Textarea value={notes} maxLength={500} rows={3} onChange={(e) => setNotes(e.target.value)} />)}
                    <label className="flex items-center gap-2.5 border-t border-border pt-2.5 text-[13px] font-medium"><Checkbox checked={visible} onCheckedChange={(v) => setVisible(v === true)} /> Visible in App</label>
                    <label className="flex items-center gap-2.5 text-[13px] font-medium"><Checkbox checked={invite} onCheckedChange={(v) => setInvite(v === true)} /> Send Invitation</label>
                </div>
            </DetailSection>
        </ActionSheet>
    );
}

/* ── Send Invitation ────────────────────────────────────────────────────── */

function SendInvite({ p, eventId, onClose }: P) {
    const fmt = useDateFormatter();
    const event = useClientEvent(eventId).data;
    const first = p.name.split(/\s+/)[0] || p.name;
    const when = event?.start_date ? fmt(event.start_date) : "";
    const [channels, setChannels] = useState<InviteChannel[]>(["whatsapp"]);
    const [message, setMessage] = useState(`Dear ${first}, you are warmly invited to ${event?.name ?? "our event"}${event?.venue_name ? ` at ${event.venue_name}` : ""}${when ? ` on ${when}` : ""}.`);
    const send = () => {
        if (!channels.length) return toast.error("Please choose at least one channel.");
        if (channels.includes("whatsapp") && p.mobile) window.open(`https://wa.me/${`${p.dial_code || "+91"}${p.mobile}`.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank");
        if (channels.includes("email")) {
            if (!p.email) return toast.error("This participant has no email address.");
            window.location.href = `mailto:${p.email}?subject=${encodeURIComponent(`You're Invited — ${event?.name ?? ""}`)}&body=${encodeURIComponent(message)}`;
        }
        if (channels.includes("in_app")) toast.info(p.has_joined ? "They already have the event in the app." : "In-App reaches them once they join the event.");
        onClose();
    };
    return (
        <ActionSheet open onClose={onClose} icon={Send} title="Send Invitation" subtitle="Invite the participant through available channels"
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={send}><Send className="size-3.5" /> Send Invitation</Button></>}>
            <Summary p={p} />
            <FormField label="Invitation Channels"><CheckChoices boxed value={channels} onChange={setChannels} options={CHANNELS} /></FormField>
            <FormField label="Personal Message">
                <Textarea value={message} maxLength={1000} rows={4} onChange={(e) => setMessage(e.target.value)} />
                <CharCount value={message} max={1000} />
            </FormField>
            <Notice tone="primary">WhatsApp and Email open with the message ready to send.</Notice>
        </ActionSheet>
    );
}

/* ── View RSVP Response ─────────────────────────────────────────────────── */

function ViewRsvp({ p, onClose, onSwitch }: P) {
    const fmt = useDateFormatter();
    const r = rsvpOf(p);
    const type = r === "confirmed" ? ((p.party_size ?? 1) > 1 ? "All Invitees" : "Self Only") : r === "declined" ? "Not Attending" : r === "maybe" ? "Maybe" : "Not Responded";
    const row = (label: string, value: React.ReactNode) => (
        <div className="grid grid-cols-[140px_12px_1fr] items-center py-1.5 text-[12.5px]"><span className="text-muted-foreground">{label}</span><span>:</span><span className="font-medium">{value || "—"}</span></div>
    );
    return (
        <ActionSheet open onClose={onClose} icon={MessageSquare} title="View RSVP Response"
            footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => onSwitch("invite")}><Send className="size-3.5" /> Send Reminder</Button></>}>
            <Summary p={p} />
            <DetailSection title="RSVP Response Details" icon={FileText}>
                <div className="py-1">
                    {row("Invite Status", <InvitePill p={p} />)}
                    {row("RSVP Status", <RsvpPill p={p} />)}
                    {row("Response Type", type)}
                    {row("Attending Count", r === "declined" ? 0 : p.party_size)}
                    {row("Meal Preference", p.dietary_preference)}
                    {row("Response Date", p.responded_at ? fmt(p.responded_at, true) : null)}
                    {row("Invitation Channel", p.invite_source === "qr" ? "QR Scan" : p.invite_source)}
                </div>
            </DetailSection>
            <DetailSection title="Notes / Response Message" icon={MessageSquare}>
                <p className="my-2 rounded-lg bg-muted/60 p-3 text-[12.5px]">{p.notes || p.special_requirements || "No message."}</p>
            </DetailSection>
            <DetailSection title="Activity Timeline" icon={Clock}>
                <div className="flex flex-col gap-2 py-2 text-[12.5px]">
                    <p className="flex justify-between"><span><b>Added to the event</b></span><span className="text-muted-foreground">{p.created_at ? fmt(p.created_at, true) : ""}</span></p>
                    {p.has_joined && <p><b>Joined through the app</b></p>}
                    {p.responded_at && <p className="flex justify-between"><span><b>Responded:</b> {RSVP_META[r].label}</span><span className="text-muted-foreground">{fmt(p.responded_at, true)}</span></p>}
                    {!p.responded_at && <p className="text-muted-foreground">No response yet.</p>}
                </div>
            </DetailSection>
        </ActionSheet>
    );
}

/* ── Block Participant ──────────────────────────────────────────────────── */

const BLOCK_REASONS = ["Misuse / Spam", "Duplicate Account", "Temporary Restriction", "Other"];

function BlockParticipant({ p, onClose }: P) {
    const save = useSaveParticipant();
    const [reason, setReason] = useState(BLOCK_REASONS[0]);
    const [note, setNote] = useState("");
    const [hideToo, setHideToo] = useState(false);
    const unblock = !!p.is_blocked;
    return (
        <ActionSheet open onClose={onClose} icon={Ban} tone="danger" title={unblock ? "Unblock Participant" : "Block Participant"}
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    {unblock
                        ? <Button disabled={save.isPending} onClick={() => save.mutate({ id: p.id, data: { is_blocked: false } as never }, { onSuccess: onClose })}>Unblock Participant</Button>
                        : <Button variant="destructive" disabled={save.isPending} onClick={() => save.mutate({ id: p.id, data: { is_blocked: true, block_reason: reason, block_note: note.trim() || null, ...(hideToo ? { is_hidden: true, hide_reason: "Blocked" } : {}) } as never }, { onSuccess: onClose })}>
                            <Ban className="size-3.5" /> Block Participant
                        </Button>}
                </>
            )}>
            <Summary p={p} />
            {unblock ? (
                <Notice tone="success" title={`Blocked for: ${p.block_reason ?? "—"}`}>Unblocking gives {p.name} their event access back, with their previous details and history.</Notice>
            ) : (
                <>
                    <Notice tone="danger" icon={Ban}>Blocked participants cannot access event features until unblocked.</Notice>
                    <FormField label="Block Reason" required>
                        <div className="flex flex-col gap-1 rounded-lg border border-border p-2">
                            {BLOCK_REASONS.map((b) => (
                                <label key={b} className="flex cursor-pointer items-center gap-2.5 px-1 py-1 text-[13px]">
                                    <input type="radio" name="block" checked={reason === b} onChange={() => setReason(b)} className="size-4 accent-[var(--primary)]" /> {b}
                                </label>
                            ))}
                        </div>
                    </FormField>
                    <FormField label="Admin Note or Reason Details">
                        <Textarea value={note} maxLength={500} rows={3} placeholder="Enter reason or additional details for blocking..." onChange={(e) => setNote(e.target.value)} />
                        <CharCount value={note} max={500} />
                    </FormField>
                    <label className="flex items-start gap-2.5">
                        <Checkbox checked={hideToo} onCheckedChange={(v) => setHideToo(v === true)} className="mt-0.5" />
                        <span><span className="block text-[13px] font-semibold">Hide from participant list after blocking</span>
                            <span className="block text-[11.5px] text-muted-foreground">The participant will be removed from the visible list (Hidden tab).</span></span>
                    </label>
                    <Notice tone="info" title="Effects of Blocking">
                        <ul className="mt-1 list-disc pl-4">
                            <li>The participant will be denied access to all event features (agenda, media, wishes, RSVP, messages…).</li>
                            <li>They cannot join again by scanning the invitation.</li>
                            <li>Their invitation and response history remain recorded; they can be unblocked later.</li>
                        </ul>
                    </Notice>
                </>
            )}
        </ActionSheet>
    );
}

/* ── Hide Participant ───────────────────────────────────────────────────── */

const HIDE_REASONS = ["Internal Tracking Only", "Duplicate / Test Participant", "Already Merged", "Other"];

function HideParticipant({ p, onClose }: P) {
    const save = useSaveParticipant();
    const [reason, setReason] = useState("");
    const [note, setNote] = useState("");
    const [keep, setKeep] = useState(true);
    return (
        <ActionSheet open onClose={onClose} icon={EyeOff} title="Hide Participant"
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={!reason || !keep || save.isPending}
                        onClick={() => save.mutate({ id: p.id, data: { is_hidden: true, hide_reason: reason, hide_note: note.trim() || null } as never }, { onSuccess: onClose })}>
                        <TriangleAlert className="size-3.5" /> Hide Participant
                    </Button>
                </>
            )}>
            <Summary p={p} />
            <FormField label="Hide Reason" required>
                <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Select hide reason..." /></SelectTrigger>
                    <SelectContent>{HIDE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
            </FormField>
            <Notice tone="primary">Hiding removes the participant from the visible main list and the app&apos;s participant directory, but preserves their records (profile, invitations and RSVP history). You can restore them later from the Hidden tab.</Notice>
            <FormField label="Admin Note" hint=" (Optional)">
                <Textarea value={note} maxLength={500} rows={3} placeholder="Add a note for internal reference (e.g., reason, context, or next steps)..." onChange={(e) => setNote(e.target.value)} />
            </FormField>
            <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-[13px] font-medium">
                <Checkbox checked={keep} onCheckedChange={(v) => setKeep(v === true)} /> Retain invitations and RSVP history
            </label>
        </ActionSheet>
    );
}

/* ── Delete Participant ─────────────────────────────────────────────────── */

function DeleteParticipant({ p, onClose }: P) {
    const remove = useRemoveParticipant();
    return (
        <DeleteSheet open onClose={onClose} title="Delete Participant" subtitle="Remove this participant from the event"
            summary={<Summary p={p} />}
            question={`Are you sure you want to remove ${p.name} from this event? Their place against the plan's limit is freed.`}
            effects={[
                { label: "Participant record & RSVP", value: "Will be removed" },
                { label: "Event access in the app", value: "Will be removed" },
                { label: "Phone-book guest", value: "Kept", keep: true },
            ]}
            confirmLabel="Delete Participant" busy={remove.isPending}
            onConfirm={() => remove.mutate(p.id, { onSuccess: onClose })} />
    );
}

/** The ⋯ menu, in the design's order. */
export function participantMenu(p: ParticipantRow, open: (a: PAction) => void, show: () => void) {
    return [
        { label: "View Participant", icon: Eye, onClick: () => open("view") },
        { label: "Edit Participant", icon: Pencil, onClick: () => open("edit") },
        { label: "Send Invitation", icon: Send, onClick: () => open("invite") },
        { label: "View RSVP Response", icon: MessageSquare, onClick: () => open("rsvp") },
        { label: p.is_blocked ? "Unblock Participant" : "Block Participant", icon: Ban, onClick: () => open("block") },
        p.is_hidden ? { label: "Show Participant", icon: Eye, onClick: show } : { label: "Hide Participant", icon: EyeOff, onClick: () => open("hide") },
        { label: "Delete Participant", icon: Trash2, onClick: () => open("delete"), danger: true, divider: true },
    ];
}

