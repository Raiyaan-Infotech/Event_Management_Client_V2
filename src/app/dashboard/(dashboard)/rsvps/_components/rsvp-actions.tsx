"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    ArrowRight, Bell, CheckCircle2, CircleHelp, Clock, Eye, FileText, Info, Mail, MessageSquare, Pencil, Send,
    Trash2, UserRound, X, XCircle, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    ActionSheet, CharCount, CheckChoices, ChoiceRadio, DetailSection, FormField, InfoGrid, Notice, NumberStepper,
    PersonSummary, StatusPill, TONE_TEXT, type Tone,
} from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { useDateFormatter } from "@/hooks/use-client-settings";
import { useClientEvent } from "@/hooks/use-client-events";
import { useBulkGuests, useGuestFormOptions, type InviteChannel } from "@/hooks/use-guests";
import { useCreateNote, useGuestProfile, type NoteCategory } from "@/hooks/use-guest-profile";
import { useClearRsvp, useHideRsvp, useUpdateRsvp, type RsvpAnswer, type RsvpRow, type RsvpState } from "@/hooks/use-rsvp-board";
import { CHANNELS, guestTypeLabel } from "../../guests/_components/guest-fields";
import { sideLabel } from "../../guests/_components/guest-actions";

/**
 * RSVP row actions (web design 2026-11-04), each a slide-in from the module kit:
 * View Response (RSVP Details / Guest Information / Activity), Send Reminder,
 * Update RSVP Status (= Mark as Confirmed / Pending / Declined), Add Note,
 * Hide Response, Delete Response. View Guest / Edit Guest reuse the Guests panels.
 */

export const STATE_META: Record<RsvpState, { label: string; tone: Tone; icon: LucideIcon }> = {
    confirmed: { label: "Confirmed", tone: "success", icon: CheckCircle2 },
    pending: { label: "Pending", tone: "warning", icon: Clock },
    declined: { label: "Declined", tone: "danger", icon: X },
    maybe: { label: "Maybe", tone: "amber", icon: CircleHelp },
    not_invited: { label: "Not Invited", tone: "muted", icon: Mail },
};

export function StatePill({ state }: { state: RsvpState }) {
    const m = STATE_META[state];
    return <StatusPill tone={m.tone} icon={m.icon}>{m.label}</StatusPill>;
}

export const responseType = (r: RsvpRow) => {
    const a = r.rsvp.answer;
    if (!a) return "Not Responded";
    if (a === "no") return "Not Attending";
    if (a === "maybe") return "Maybe";
    return (r.rsvp.attending_count ?? 1) > 1 ? "All Invitees" : "Self Only";
};

export const SOURCE_LABEL: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", in_app: "In-App", qr: "QR Scan", sms: "SMS", manual: "Manual", import: "Import" };

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export type RsvpAction = "response" | "reminder" | "status" | "note" | "hide" | "delete";

function Summary({ r }: { r: RsvpRow }) {
    return (
        <PersonSummary
            name={r.name} photo={r.photo}
            sub={[r.relationship, r.side ? sideLabel(r.side) : null, r.invite_count && r.invite_count > 1 ? `${r.invite_count} Invitees` : null].filter(Boolean).join(" · ")}
            pills={(
                <>
                    {r.is_vip && <StatusPill tone="primary">{r.vip_label && r.vip_label.length <= 12 ? r.vip_label : "VIP"}</StatusPill>}
                    <StatePill state={r.rsvp.state} />
                    {!r.rsvp.answer && r.rsvp.state !== "not_invited" && <StatusPill tone="muted">Not Responded</StatusPill>}
                </>
            )}
        />
    );
}

export function RsvpActionSheet({
    action, row, eventId, target, onClose, onEditGuest,
}: {
    action: RsvpAction | null; row: RsvpRow | null; eventId: number; target?: RsvpAnswer | "pending";
    onClose: () => void; onEditGuest: () => void;
}) {
    if (!action || !row) return null;
    const p = { r: row, eventId, onClose };
    switch (action) {
        case "response": return <ViewResponse {...p} onEditGuest={onEditGuest} />;
        case "reminder": return <SendReminder {...p} />;
        case "status": return <UpdateStatus key={target} {...p} target={target ?? "yes"} />;
        case "note": return <AddNote {...p} />;
        case "hide": return <HideResponse {...p} />;
        case "delete": return <DeleteResponse {...p} />;
    }
}

type P = { r: RsvpRow; eventId: number; onClose: () => void };

/* ── View RSVP Response ─────────────────────────────────────────────────── */

function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
    return (
        <div className="flex border-b border-border">
            {tabs.map((t) => (
                <button key={t.value} type="button" onClick={() => onChange(t.value)}
                    className={cn("relative flex-1 px-2 py-2 text-[12.5px]", value === t.value ? "font-semibold text-primary" : "text-muted-foreground")}>
                    {t.label}
                    {value === t.value && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
                </button>
            ))}
        </div>
    );
}

function ViewResponse({ r, onClose, onEditGuest }: P & { onEditGuest: () => void }) {
    const fmt = useDateFormatter();
    const [tab, setTab] = useState<"rsvp" | "guest" | "activity">("rsvp");
    const profile = useGuestProfile(tab === "activity" ? r.id : null);
    const at = r.rsvp.responded_at;
    return (
        <ActionSheet open onClose={onClose} icon={Info} title="View RSVP Response" subtitle="Guest response and attendance details"
            footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={onEditGuest}>Edit Guest Details</Button></>}>
            <Summary r={r} />
            <Tabs value={tab} onChange={setTab} tabs={[{ value: "rsvp", label: "RSVP Details" }, { value: "guest", label: "Guest Information" }, { value: "activity", label: "Activity" }]} />
            {tab === "rsvp" && (
                <>
                    <p className="text-[13.5px] font-bold">Attendance Summary</p>
                    <InfoGrid items={[
                        { label: "RSVP Status", value: <span className={TONE_TEXT[STATE_META[r.rsvp.state].tone]}>{STATE_META[r.rsvp.state].label}</span> },
                        { label: "Invitation Count", value: `${r.invite_count ?? 1} ${(r.invite_count ?? 1) === 1 ? "Guest" : "Guests"}` },
                        { label: "Attending Count", value: r.rsvp.attending_count === null ? "—" : `${r.rsvp.attending_count} ${r.rsvp.attending_count === 1 ? "Guest" : "Guests"}` },
                        { label: "Response Type", value: responseType(r) },
                    ]} />
                    <p className="text-[13.5px] font-bold">Preferences &amp; Invitation</p>
                    <InfoGrid items={[
                        { label: "Meal Preference", value: r.rsvp.meal_preference || "—" },
                        { label: "Invitation Channel", value: r.rsvp.source ? SOURCE_LABEL[r.rsvp.source] ?? r.rsvp.source : "—" },
                        { label: "Response Date", value: at ? fmt(at) : "—" },
                        { label: "Response Time", value: at ? time(at) : "—" },
                    ]} />
                    {r.rsvp.decline_reason && <InfoGrid items={[{ label: "Decline Reason", value: r.rsvp.decline_reason }, { label: "Joined the event", value: r.rsvp.joined ? "Yes" : "No" }]} />}
                    <p className="text-[13.5px] font-bold">Guest Message / Notes</p>
                    <p className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-[12.5px]">{r.rsvp.message || "No message."}</p>
                </>
            )}
            {tab === "guest" && (
                <InfoGrid items={[
                    { label: "Guest Type", value: guestTypeLabel(r.guest_type) },
                    { label: "Relationship", value: r.relationship || "—" },
                    { label: "Family Side", value: sideLabel(r.side) },
                    { label: "Mobile Number", value: r.mobile ? `${r.dial_code || ""} ${r.mobile}`.trim() : "—" },
                    { label: "Email Address", value: r.email || "—" },
                    { label: "Address", value: r.address_line1 || "—" },
                    { label: "Invite Count", value: `${r.invite_count ?? 1}` },
                    { label: "RSVP Required", value: r.rsvp_required === false ? "No" : "Yes" },
                    { label: "Invitation Channels", value: (r.invite_channels ?? []).map((c) => SOURCE_LABEL[c] ?? c).join(", ") || "—" },
                    { label: "Visibility Status", value: r.is_visible === false ? "Hidden" : "Visible" },
                ]} />
            )}
            {tab === "activity" && (
                <div className="flex flex-col gap-2">
                    <Timeline icon={Mail} title="Invitation Sent" sub={r.invited_at ? `via ${(r.invite_channels ?? []).map((c) => SOURCE_LABEL[c] ?? c).join(", ") || "share"}` : "Not sent yet"} at={r.invited_at ? fmt(r.invited_at, true) : null} />
                    {r.rsvp.joined && <Timeline icon={UserRound} title="Joined the event" sub="Scanned the invitation QR" at={null} />}
                    {r.rsvp.answer && <Timeline icon={STATE_META[r.rsvp.state].icon} title={`Responded: ${STATE_META[r.rsvp.state].label}`} sub={responseType(r)} at={at ? fmt(at, true) : null} />}
                    {(profile.data?.notes ?? []).map((n) => <Timeline key={n.id} icon={FileText} title={n.title} sub={n.body?.replace(/<[^>]+>/g, "") ?? ""} at={fmt(n.created_at, true)} />)}
                </div>
            )}
        </ActionSheet>
    );
}

function Timeline({ icon: Icon, title, sub, at }: { icon: LucideIcon; title: string; sub: string; at: string | null }) {
    return (
        <div className="flex gap-3 rounded-lg border border-border p-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">{title}</p>
                {sub && <p className="text-[12px] text-muted-foreground">{sub}</p>}
            </div>
            {at && <p className="shrink-0 text-[11.5px] text-muted-foreground">{at}</p>}
        </div>
    );
}

/* ── Send Reminder ──────────────────────────────────────────────────────── */

const REMINDERS = [
    { value: "standard", label: "RSVP Reminder (Standard)" },
    { value: "gentle", label: "Gentle Nudge" },
    { value: "last", label: "Last Call" },
] as const;

export function reminderText(kind: string, firstName: string, event?: { name?: string; when?: string; where?: string }) {
    const name = event?.name ?? "our event";
    const at = [event?.when, event?.where].filter(Boolean).join(" at ");
    if (kind === "gentle") return `Hi ${firstName}, we'd love to know if you can make it to ${name}${at ? ` on ${at}` : ""}. Just reply when you can!`;
    if (kind === "last") return `Hi ${firstName}, this is the last call to RSVP for ${name}${at ? ` on ${at}` : ""}. Please confirm today so we can plan for you.`;
    return `Hi ${firstName},\nJust a friendly reminder to RSVP for ${name}${at ? ` on ${at}` : ""}.\nPlease let us know if you and your family will be joining us.`;
}

function SendReminder({ r, eventId, onClose }: P) {
    const fmt = useDateFormatter();
    const event = useClientEvent(eventId).data;
    const bulk = useBulkGuests();
    const first = r.name.split(/\s+/)[0] || r.name;
    const info = { name: event?.name, when: event?.start_date ? fmt(event.start_date) : "", where: event?.venue_name ?? "" };
    const [channels, setChannels] = useState<InviteChannel[]>(r.invite_channels?.length ? r.invite_channels : ["whatsapp"]);
    const [kind, setKind] = useState<string>("standard");
    const [message, setMessage] = useState("");
    const text = message || reminderText(kind, first, info);
    const phone = `${r.dial_code || "+91"}${r.mobile ?? ""}`.replace(/\D/g, "");

    const send = () => {
        if (!channels.length) return toast.error("Please choose at least one channel.");
        if (channels.includes("email") && !r.email) return toast.error("This guest has no email address.");
        if (channels.includes("whatsapp") && r.mobile) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
        if (channels.includes("email") && r.email) window.location.href = `mailto:${r.email}?subject=${encodeURIComponent(`RSVP reminder — ${info.name ?? ""}`)}&body=${encodeURIComponent(text)}`;
        // Recorded like an invitation (the time and channels), so the board shows it was sent.
        bulk.mutate({ guest_ids: [r.id], action: "invite", value: { channels, message: text } }, { onSuccess: onClose });
    };

    return (
        <ActionSheet open onClose={onClose} icon={Send} title="Send Reminder" subtitle="Send a polite reminder to selected guest"
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={bulk.isPending} onClick={send}><Send className="size-3.5" /> Send Reminder</Button></>}>
            <Summary r={r} />
            <FormField label="Reminder Channels" note="Choose how to send the reminder">
                <CheckChoices boxed value={channels} onChange={setChannels} options={CHANNELS} />
            </FormField>
            <FormField label="Reminder Template" note="Select a pre-written message template">
                <Select value={kind} onValueChange={(v) => { setKind(v); setMessage(""); }}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{REMINDERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
            </FormField>
            <FormField label="Message Content" note="Edit the reminder message that will be sent">
                <Textarea value={text} maxLength={500} rows={4} onChange={(e) => setMessage(e.target.value)} />
                <CharCount value={text} max={500} />
            </FormField>
            <FormField label="Send Option">
                <ChoiceRadio name="reminder-when" value="now" onChange={() => undefined}
                    options={[{ value: "now", label: "Send Now" }, { value: "later", label: "Schedule Later (soon)" }]} />
            </FormField>
            <FormField label="Message Preview">
                <p className="whitespace-pre-line rounded-lg border border-primary/15 bg-primary/5 p-3 text-[12.5px]">{text}</p>
            </FormField>
            <p className="text-[11.5px] text-muted-foreground">WhatsApp and Email open with the message ready to send. In-App reaches guests who joined the event.</p>
        </ActionSheet>
    );
}

/* ── Update RSVP Status ─────────────────────────────────────────────────── */

const TARGETS: { value: RsvpAnswer | "pending"; label: string }[] = [
    { value: "yes", label: "Confirmed" }, { value: "pending", label: "Pending" },
    { value: "no", label: "Declined" }, { value: "maybe", label: "Maybe" },
];
const DECLINE = [
    { value: "Can't Attend", hint: "Not available on the event date." },
    { value: "Out of Town", hint: "Will be away during the event." },
    { value: "Health Reasons", hint: "Unable to attend due to health concerns." },
    { value: "Other", hint: "A different reason (please specify in the note)." },
];
const stateOf = (t: RsvpAnswer | "pending"): RsvpState => (t === "yes" ? "confirmed" : t === "no" ? "declined" : t === "maybe" ? "maybe" : "pending");

function UpdateStatus({ r, onClose, target: initial }: P & { target: RsvpAnswer | "pending" }) {
    const update = useUpdateRsvp();
    const meals = useGuestFormOptions().data?.food_preference_options ?? [];
    const [target, setTarget] = useState(initial);
    const [reason, setReason] = useState(r.rsvp.decline_reason || DECLINE[0].value);
    const [count, setCount] = useState<number>(initial === "no" ? 0 : r.rsvp.attending_count || r.invite_count || 1);
    const [meal, setMeal] = useState<string>(r.rsvp.meal_preference || "");
    const [note, setNote] = useState(r.rsvp.message || "");
    const [admin, setAdmin] = useState("");
    const next = STATE_META[stateOf(target)];
    const attending = target === "yes" || target === "maybe";
    const save = () => update.mutate({
        guestId: r.id, response: target,
        ...(attending ? { attending_count: Math.max(1, count), meal_preference: meal || null } : {}),
        response_note: note.trim() || null, decline_reason: target === "no" ? reason : null, admin_note: admin.trim() || null,
    }, { onSuccess: onClose });
    return (
        <ActionSheet open onClose={onClose} icon={next.icon} tone={next.tone} title="Update RSVP Status" subtitle="Change the guest's RSVP response and related details"
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={update.isPending} onClick={save}
                        className={cn(target === "yes" && "bg-success text-white hover:bg-success/90", target === "no" && "bg-destructive text-white hover:bg-destructive/90")}>
                        <CheckCircle2 className="size-3.5" /> Mark as {next.label}
                    </Button>
                </>
            )}>
            <Summary r={r} />
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <FormField label="Current Response"><div className="flex h-9 items-center rounded-md bg-muted/60 px-3"><StatePill state={r.rsvp.state} /></div></FormField>
                <ArrowRight className="mb-2.5 size-4 text-muted-foreground" />
                <FormField label="New Response" required>
                    <Select value={target} onValueChange={(v) => setTarget(v as RsvpAnswer | "pending")}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{TARGETS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                </FormField>
            </div>
            <Notice tone={next.tone === "success" ? "success" : next.tone === "danger" ? "danger" : "warning"} icon={next.icon}>
                {stateOf(target) === r.rsvp.state ? `The guest will remain marked as ${next.label}.` : `The guest will be marked as ${next.label}.`}
                {" "}{r.rsvp.joined ? "This updates the response they gave in the app." : "They have not joined yet, so this is recorded as your answer for them."}
            </Notice>
            {target === "no" && (
                <FormField label="Decline Reason" required>
                    <div className="flex flex-col gap-1.5">
                        {DECLINE.map((d) => (
                            <label key={d.value} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2", reason === d.value ? "border-primary bg-primary/5" : "border-border")}>
                                <input type="radio" name="decline" checked={reason === d.value} onChange={() => setReason(d.value)} className="mt-1 size-4 accent-[var(--primary)]" />
                                <span><span className="block text-[13px] font-semibold">{d.value}</span><span className="block text-[11.5px] text-muted-foreground">{d.hint}</span></span>
                            </label>
                        ))}
                    </div>
                </FormField>
            )}
            {attending && (
                <div className="grid grid-cols-2 gap-3">
                    <FormField label="Attendance Count" required><NumberStepper value={count} onChange={setCount} min={1} max={50} /></FormField>
                    <FormField label="Meal Preference">
                        <Select value={meal || "__none"} onValueChange={(v) => setMeal(v === "__none" ? "" : v)}>
                            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none">Not specified</SelectItem>
                                {meal && !meals.some((m) => m.name === meal) && <SelectItem value={meal}>{meal}</SelectItem>}
                                {meals.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </FormField>
                </div>
            )}
            <FormField label="Response Note">
                <Textarea value={note} maxLength={500} rows={2} placeholder="The guest's message, e.g. Looking forward to it!" onChange={(e) => setNote(e.target.value)} />
                <CharCount value={note} max={500} />
            </FormField>
            <FormField label="Admin Note" hint=" (Optional)">
                <Textarea value={admin} maxLength={300} rows={2} placeholder="Add an internal note (visible only to event admins)." onChange={(e) => setAdmin(e.target.value)} />
                <CharCount value={admin} max={300} />
            </FormField>
        </ActionSheet>
    );
}

/* ── Add Note ───────────────────────────────────────────────────────────── */

const NOTE_TYPES: { value: NoteCategory; label: string }[] = [
    { value: "general", label: "Internal Note" }, { value: "reminder", label: "Follow-up" },
    { value: "personal", label: "Guest Preference" }, { value: "dietary", label: "Dietary" }, { value: "logistics", label: "Logistics" },
];
const PRIORITIES = ["Normal", "Follow-up Required", "High Priority"];
const noteLabel = (c: NoteCategory) => NOTE_TYPES.find((t) => t.value === c)?.label ?? "Note";

function AddNote({ r, onClose }: P) {
    const fmt = useDateFormatter();
    const profile = useGuestProfile(r.id);
    const create = useCreateNote(onClose);
    const [type, setType] = useState<NoteCategory>("general");
    const [body, setBody] = useState("");
    const [priority, setPriority] = useState(PRIORITIES[0]);
    const notes = profile.data?.notes ?? [];
    const save = () => {
        if (!body.trim()) return toast.error("Please write the note.");
        create.mutate({
            id: r.id, title: priority === "Normal" ? noteLabel(type) : priority, body: body.trim(),
            category: type, visibility: "internal", is_pinned: priority === "High Priority",
        });
    };
    return (
        <ActionSheet open onClose={onClose} icon={Info} title="Add Note" subtitle="Add an internal note for this guest"
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={create.isPending} onClick={save}>Save Note</Button></>}>
            <Summary r={r} />
            <FormField label="Note Type" required>
                <Select value={type} onValueChange={(v) => setType(v as NoteCategory)}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{NOTE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
            </FormField>
            <FormField label="Internal Note" required>
                <Textarea value={body} maxLength={500} rows={3} placeholder="Add a note about this guest (e.g., special request, arrangement, follow-up, etc.)" onChange={(e) => setBody(e.target.value)} />
                <CharCount value={body} max={500} />
            </FormField>
            <FormField label="Priority / Follow-up">
                <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
            </FormField>
            <p className="text-[13.5px] font-bold">Previous Notes ({notes.length})</p>
            {profile.isLoading ? <p className="text-[12.5px] text-muted-foreground">Loading…</p> : notes.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">No notes yet.</p>
            ) : notes.slice(0, 5).map((n) => (
                <div key={n.id} className="flex gap-3 rounded-lg border border-border p-3">
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                        <StatusPill tone={n.category === "reminder" ? "warning" : "violet"}>{n.title}</StatusPill>
                        <p className="mt-1 text-[12.5px]">{n.body?.replace(/<[^>]+>/g, "")}</p>
                    </div>
                    <p className="shrink-0 text-[11px] text-muted-foreground">{fmt(n.created_at, true)}</p>
                </div>
            ))}
            <FormField label="Visibility">
                <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                    <input type="radio" checked readOnly className="mt-1 size-4 accent-[var(--primary)]" />
                    <span><span className="block text-[13px] font-semibold">Admin-only</span><span className="block text-[11.5px] text-muted-foreground">Only event admins can view this note.</span></span>
                </div>
            </FormField>
        </ActionSheet>
    );
}

/* ── Hide Response ──────────────────────────────────────────────────────── */

const HIDE_REASONS = ["Incorrect / Duplicate Response", "Test Response", "Guest Request", "Other"];

function HideResponse({ r, onClose }: P) {
    const hide = useHideRsvp();
    const [reason, setReason] = useState(HIDE_REASONS[0]);
    const [sure, setSure] = useState(true);
    return (
        <ActionSheet open onClose={onClose} icon={Eye} title="Hide Response" subtitle="Hide a guest's response from the main list"
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!sure || hide.isPending} onClick={() => hide.mutate({ guestId: r.id, hidden: true, reason }, { onSuccess: onClose })}>Hide Response</Button></>}>
            <Summary r={r} />
            <FormField label="Reason for Hiding" required>
                <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{HIDE_REASONS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                </Select>
            </FormField>
            <label className="flex items-start gap-2.5">
                <Checkbox checked={sure} onCheckedChange={(v) => setSure(v === true)} className="mt-0.5" />
                <span><span className="block text-[13px] font-semibold">Hide from the main list while retaining records</span>
                    <span className="block text-[11.5px] text-muted-foreground">The response will be removed from the visible list, but its data will still be saved in the event records.</span></span>
            </label>
            <Notice tone="info" title="What happens when a response is hidden?">
                <ul className="mt-1 list-disc pl-4">
                    <li>The guest&apos;s response will no longer appear in the main RSVP list.</li>
                    <li>All response details, counts, and reports will be retained.</li>
                    <li>You can view or restore hidden responses later from the Hidden tab.</li>
                </ul>
            </Notice>
            <Notice tone="danger" title="Note">Hiding a response is intended for duplicates, test responses, or incorrect entries. It does not delete the response or change the guest&apos;s original invitation.</Notice>
        </ActionSheet>
    );
}

/* ── Delete Response ────────────────────────────────────────────────────── */

function DeleteResponse({ r, onClose }: P) {
    const fmt = useDateFormatter();
    const clear = useClearRsvp();
    const [sure, setSure] = useState(false);
    const at = r.rsvp.responded_at;
    return (
        <ActionSheet open onClose={onClose} icon={Trash2} tone="danger" title="Delete Response" subtitle="Permanently remove this guest's RSVP response"
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="destructive" disabled={!sure || clear.isPending} onClick={() => clear.mutate(r.id, { onSuccess: onClose })}><Trash2 className="size-3.5" /> Delete Response</Button></>}>
            <Summary r={r} />
            <Notice tone="danger" title="This action cannot be undone.">
                This will permanently delete {r.name}&apos;s RSVP response and attendance details from this event. The guest stays on the list as Pending.
            </Notice>
            <DetailSection title="What will be deleted?">
                {[
                    `RSVP response and status (${STATE_META[r.rsvp.state].label})`,
                    `Attendance count (${r.rsvp.attending_count ?? 0} ${(r.rsvp.attending_count ?? 0) === 1 ? "guest" : "guests"})`,
                    `Meal preference (${r.rsvp.meal_preference || "none"})`,
                    `Response date and time (${at ? `${fmt(at)}, ${time(at)}` : "none"})`,
                ].map((t) => <p key={t} className="flex items-center gap-2 py-1.5 text-[12.5px]"><CheckCircle2 className="size-3.5 text-primary" /> {t}</p>)}
            </DetailSection>
            <label className="flex items-center gap-2.5 text-[13px]"><Checkbox checked={sure} onCheckedChange={(v) => setSure(v === true)} /> I understand that this action cannot be undone.</label>
        </ActionSheet>
    );
}

/** The ⋯ menu, in the design's order. */
export function rsvpMenu(r: RsvpRow, open: (a: RsvpAction, target?: RsvpAnswer | "pending") => void, guest: (a: "view" | "edit") => void, show: () => void) {
    return [
        { label: "View Response", icon: Eye, onClick: () => open("response") },
        { label: "View Guest", icon: UserRound, onClick: () => guest("view") },
        { label: "Edit Guest", icon: Pencil, onClick: () => guest("edit") },
        { label: "Send Reminder", icon: Send, onClick: () => open("reminder") },
        { label: "Mark as Confirmed", icon: CheckCircle2, onClick: () => open("status", "yes"), divider: true, hidden: r.rsvp.state === "confirmed" },
        { label: "Mark as Pending", icon: Clock, onClick: () => open("status", "pending"), hidden: r.rsvp.state === "pending" },
        { label: "Mark as Declined", icon: XCircle, onClick: () => open("status", "no"), hidden: r.rsvp.state === "declined" },
        { label: "Add Note", icon: MessageSquare, onClick: () => open("note"), divider: true },
        r.rsvp.hidden
            ? { label: "Show Response", icon: Bell, onClick: show }
            : { label: "Hide Response", icon: Eye, onClick: () => open("hide") },
        { label: "Delete", icon: Trash2, onClick: () => open("delete"), danger: true, divider: true },
    ];
}
