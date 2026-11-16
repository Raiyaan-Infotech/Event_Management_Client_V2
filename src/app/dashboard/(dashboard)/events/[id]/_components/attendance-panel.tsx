"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Bell, CalendarClock, CheckCircle2, ClipboardCheck, Clock, Download, Eye, Hourglass, Link2, ListChecks, Mail, MoreVertical, Pencil, Phone,
    QrCode, RotateCcw, Send, ShieldCheck, Trash2, UserRound, Users, XCircle, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ActionSheet, CharCount, CheckChoices, CountTabs, DetailRow, DetailSection, FormField, InfoGrid, ListCard, ModuleHeader, OverviewCard,
    Pager, PersonCell, PersonSummary, SearchBox, StatTile, StatusPill, Toolbar, type Tone,
} from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { useDateFormatter } from "@/hooks/use-client-settings";
import type { ClientEvent } from "@/hooks/use-client-events";
import { useParticipantRow } from "@/hooks/use-event-participants";
import {
    fetchAllAttendance, useAttendance, useAttendanceDetail, useBulkAttendance, useMarkAttendance, useNotifyParticipants, useVerifyParticipant,
    type AttendanceQuery, type AttendanceRow, type CheckInSource,
} from "@/hooks/use-event-attendance";
import { ParticipantSheet } from "../../../participants/_components/participant-actions";

/**
 * QR Code → Event Attendance (Jamal's design, 2026-11-16). The check-ins happen on the mobile side
 * (QR scan); this page LISTS them, and the organizer can Verify a participant, Mark Attendance by
 * hand, edit, notify or remove. Session QR is out; the red-lined menu items (Resend QR Code,
 * Download QR Code, Print ID Card) are not built.
 */

const PAGE_SIZE = 8;
const SOURCE: Record<CheckInSource, { label: string; icon: LucideIcon }> = {
    event_qr: { label: "Event QR", icon: QrCode },
    manual: { label: "Check-in (Manual)", icon: ClipboardCheck },
    self_link: { label: "Self Check-in (Link)", icon: Link2 },
};
const ATTENDANCE_OPTS = [["all", "All"], ["attended", "Attended"], ["not_attended", "Not Attended"]] as const;
const VERIFY_OPTS = [["all", "All"], ["verified", "Verified"], ["pending", "Pending"]] as const;

type Mode = "view" | "verify" | "mark" | "edit" | "notify" | "delete";

export function AttendancePanel({ event }: { event: ClientEvent }) {
    const eventId = event.id;
    const fmt = useDateFormatter();
    const [tab, setTab] = useState<"all" | "verified">("all");
    const [searchText, setSearchText] = useState("");
    const [search, setSearch] = useState("");
    const [attendance, setAttendance] = useState<NonNullable<AttendanceQuery["attendance"]>>("all");
    const [verification, setVerification] = useState<NonNullable<AttendanceQuery["verification"]>>("all");
    const [relationship, setRelationship] = useState("all");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [sheet, setSheet] = useState<{ mode: Mode; rows: AttendanceRow[] } | null>(null);
    const [exporting, setExporting] = useState(false);

    // Search waits until typing stops.
    useEffect(() => {
        const t = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [searchText]);

    const query: AttendanceQuery = {
        search: search || undefined,
        attendance,
        verification: tab === "verified" ? "verified" : verification,
        relationship: relationship === "all" ? undefined : relationship,
        page, limit: PAGE_SIZE,
    };
    const list = useAttendance(eventId, query);
    const stats = list.data?.stats;
    const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
    const total = list.data?.pagination.totalItems ?? 0;
    const bulk = useBulkAttendance(eventId, () => setSelected(new Set()));

    const reset = () => {
        setSearchText(""); setSearch(""); setAttendance("all"); setVerification("all"); setRelationship("all"); setPage(1); setSelected(new Set());
    };
    const pageIds = rows.map((r) => r.id);
    const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    const toggleAll = () => setSelected((s) => {
        const n = new Set(s);
        if (allOnPage) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id));
        return n;
    });
    const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const open = (mode: Mode, row: AttendanceRow) => setSheet({ mode, rows: [row] });
    const selectedRows = () => rows.filter((r) => selected.has(r.id));

    const exportList = async () => {
        setExporting(true);
        try {
            const all = await fetchAllAttendance(eventId, { ...query, page: undefined, limit: undefined });
            const head = ["#", "Participant", "Mobile", "Email", "Role / Relationship", "Scan Source", "Verification", "Attendance", "Scan Time"];
            const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
            const lines = all.map((r, i) => [
                i + 1, r.name, r.mobile ? `${r.dial_code} ${r.mobile}` : "", r.email ?? "", r.relation ?? "",
                r.check_in_source ? SOURCE[r.check_in_source].label : "", r.verification === "verified" ? "Verified" : "Pending",
                r.attendance === "attended" ? "Attended" : "Not Attended", r.checked_in_at ? fmt(r.checked_in_at, true) : "",
            ].map(esc).join(","));
            const blob = new Blob(["﻿" + [head.map(esc).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${event.name.replace(/[^\w-]+/g, "-")}-attendance.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
            toast.success(`Exported ${all.length} participant${all.length === 1 ? "" : "s"}`);
        } catch {
            toast.error("Could not export the list");
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <ModuleHeader
                title="Event Attendance"
                subtitle="View and manage participant attendance for this event using QR code scan."
                actions={(
                    <Button variant="outline" size="sm" className="h-8" disabled={exporting || !total} onClick={exportList}>
                        <Download className="size-3.5" /> {exporting ? "Exporting..." : "Export"}
                    </Button>
                )}
            />

            <OverviewCard>
                <StatTile icon={Users} value={stats?.total ?? 0} label="Total Participants" />
                <StatTile icon={CheckCircle2} tone="success" value={stats?.attended ?? 0} label={`Attended (${stats?.attended_pct ?? 0}%)`} />
                <StatTile icon={ShieldCheck} tone="info" value={stats?.verified ?? 0} label={`Verified (${stats?.verified_pct ?? 0}%)`} />
                <StatTile icon={Clock} tone="danger" value={stats?.not_attended ?? 0} label={`Not Attended (${stats?.not_attended_pct ?? 0}%)`} />
                <StatTile icon={QrCode} tone="violet" value={stats?.total_scans ?? 0} label="Total Scans" />
            </OverviewCard>

            <CountTabs
                stretch={false}
                value={tab}
                onChange={(v) => { setTab(v); setPage(1); setSelected(new Set()); }}
                tabs={[
                    { value: "all", label: "Event Attendance", icon: CalendarClock },
                    { value: "verified", label: "Verified Participants", icon: ShieldCheck },
                ]}
            />

            <Toolbar>
                <SearchBox value={searchText} onChange={setSearchText} placeholder="Search participant (name, email, mobile)..." />
                <FilterSelect label="Attendance" value={attendance} options={ATTENDANCE_OPTS} onChange={(v) => { setAttendance(v); setPage(1); }} />
                {tab === "all" && <FilterSelect label="Verification" value={verification} options={VERIFY_OPTS} onChange={(v) => { setVerification(v); setPage(1); }} />}
                <FilterSelect
                    label="Participant Type" value={relationship}
                    options={[["all", "All"], ...(list.data?.relationships ?? []).map((r) => [r, r] as const)]}
                    onChange={(v) => { setRelationship(v); setPage(1); }}
                />
                <Button variant="outline" size="sm" className="h-8" onClick={reset}><RotateCcw className="size-3.5" /> Reset</Button>
            </Toolbar>

            <ListCard title={tab === "verified" ? "Verified Participants" : "Attendance List"} icon={ListChecks} count={total}>
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead className="bg-muted/40 text-left text-[12px] font-semibold text-muted-foreground">
                            <tr>
                                <th className="w-10 px-3 py-2.5"><Checkbox checked={allOnPage} onCheckedChange={toggleAll} aria-label="Select all on this page" /></th>
                                <th className="w-10 px-2 py-2.5">#</th>
                                {["Participant", "Role / Relationship", "Scan Source", "Verification", "Attendance", "Scan Time"].map((h) => (
                                    <th key={h} className="whitespace-nowrap px-3 py-2.5">{h}</th>
                                ))}
                                <th className="px-3 py-2.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.isError ? (
                                <tr><td colSpan={9} className="py-14 text-center text-destructive">
                                    Could not load attendance. <Button variant="link" size="sm" className="px-1" onClick={() => list.refetch()}>Retry</Button>
                                </td></tr>
                            ) : !list.isLoading && !rows.length ? (
                                <tr><td colSpan={9} className="py-14 text-center text-muted-foreground">
                                    {search || attendance !== "all" || verification !== "all" || relationship !== "all" || tab === "verified"
                                        ? "No participants match these filters."
                                        : "No participants in this event yet."}
                                </td></tr>
                            ) : rows.map((r, i) => (
                                <tr key={r.id} className={cn("border-t border-border hover:bg-muted/20", selected.has(r.id) && "bg-primary/5")}>
                                    <td className="px-3 py-2"><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} /></td>
                                    <td className="px-2 py-2 text-muted-foreground">{(page - 1) * PAGE_SIZE + i + 1}</td>
                                    <td className="px-3 py-2">
                                        <PersonCell
                                            name={r.name} photo={r.photo} onClick={() => open("view", r)}
                                            sub={[r.mobile ? `${r.dial_code} ${r.mobile}` : null, r.email].filter(Boolean).join(" | ") || undefined}
                                            badge={r.is_blocked ? <StatusPill tone="danger">Blocked</StatusPill> : undefined}
                                        />
                                    </td>
                                    <td className="px-3 py-2">{r.relation ? <StatusPill tone="primary">{r.relation}</StatusPill> : <span className="text-muted-foreground">—</span>}</td>
                                    <td className="px-3 py-2"><SourcePill source={r.check_in_source} /></td>
                                    <td className="px-3 py-2"><VerifyPill row={r} /></td>
                                    <td className="px-3 py-2"><AttendPill row={r} /></td>
                                    <td className="whitespace-nowrap px-3 py-2 text-foreground/80">{r.checked_in_at ? fmt(r.checked_in_at, true) : "—"}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-1">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button size="icon" variant="outline" className="size-8" aria-label="Actions"><MoreVertical className="size-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-auto min-w-48">
                                                    <DropdownMenuItem onClick={() => open("view", r)}><Eye className="size-4" /> View Details</DropdownMenuItem>
                                                    <DropdownMenuItem disabled={r.is_blocked} onClick={() => open("verify", r)}><ShieldCheck className="size-4" /> Verify Participant</DropdownMenuItem>
                                                    <DropdownMenuItem disabled={r.is_blocked} onClick={() => open("mark", r)}><ClipboardCheck className="size-4" /> Mark Attendance</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => open("edit", r)}><Pencil className="size-4" /> Edit Participant</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => open("notify", r)}><Send className="size-4" /> Send Notification</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem variant="destructive" onClick={() => open("delete", r)}><Trash2 className="size-4" /> Remove Participant</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="mr-2 flex items-center gap-2 text-[12.5px]">
                            <Checkbox checked={allOnPage} onCheckedChange={toggleAll} /> Select All
                            {selected.size > 0 && <span className="text-muted-foreground">({selected.size} selected)</span>}
                        </label>
                        <Button size="sm" variant="outline" className="h-8 border-success/40 text-success hover:bg-success/5 hover:text-success"
                            disabled={!selected.size || bulk.isPending} onClick={() => bulk.mutate({ action: "verify", ids: [...selected] })}>
                            <ShieldCheck className="size-3.5" /> Mark as Verified
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 border-info/40 text-info hover:bg-info/5 hover:text-info"
                            disabled={!selected.size || bulk.isPending} onClick={() => bulk.mutate({ action: "attend", ids: [...selected] })}>
                            <CheckCircle2 className="size-3.5" /> Mark Attendance
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
                            disabled={!selectedRows().length} onClick={() => setSheet({ mode: "notify", rows: selectedRows() })}>
                            <Send className="size-3.5" /> Send Notification
                        </Button>
                        <Button size="sm" variant="outline" className="h-8" disabled={exporting || !total} onClick={exportList}>
                            <Download className="size-3.5" /> Export List
                        </Button>
                    </div>
                    <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={(p) => { setPage(p); setSelected(new Set()); }} noun="participants" />
                </div>
            </ListCard>

            {sheet?.mode === "view" && <ViewDetails eventId={eventId} row={sheet.rows[0]} onClose={() => setSheet(null)} onMode={(m) => setSheet({ mode: m, rows: sheet.rows })} />}
            {sheet?.mode === "verify" && <VerifySheet eventId={eventId} row={sheet.rows[0]} onClose={() => setSheet(null)} />}
            {sheet?.mode === "mark" && <MarkSheet eventId={eventId} row={sheet.rows[0]} onClose={() => setSheet(null)} />}
            {sheet?.mode === "notify" && <NotifySheet eventId={eventId} rows={sheet.rows} onClose={() => setSheet(null)} onSent={() => setSelected(new Set())} />}
            {(sheet?.mode === "edit" || sheet?.mode === "delete") && (
                <ParticipantAction eventId={eventId} id={sheet.rows[0].id} action={sheet.mode} onClose={() => setSheet(null)} />
            )}
        </div>
    );
}

/* ── small pieces ────────────────────────────────────────────────────────── */

function FilterSelect<T extends string>({ label, value, options, onChange }: {
    label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void;
}) {
    const current = options.find(([v]) => v === value)?.[1] ?? "All";
    return (
        <Select value={value} onValueChange={(v) => onChange(v as T)}>
            <SelectTrigger className="h-8 min-w-[150px] text-[12.5px]">
                <SelectValue>{label}: {current}</SelectValue>
            </SelectTrigger>
            <SelectContent>
                {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}

function SourcePill({ source }: { source: CheckInSource | null }) {
    if (!source) return <span className="text-muted-foreground">—</span>;
    const s = SOURCE[source];
    return <StatusPill tone="info" icon={s.icon}>{s.label}</StatusPill>;
}
function VerifyPill({ row }: { row: AttendanceRow }) {
    return row.verification === "verified"
        ? <StatusPill tone="success" icon={ShieldCheck}>Verified</StatusPill>
        : <StatusPill tone="warning" icon={Hourglass}>Pending</StatusPill>;
}
function AttendPill({ row }: { row: AttendanceRow }) {
    return row.attendance === "attended"
        ? <StatusPill tone="success" icon={CheckCircle2}>Attended</StatusPill>
        : <StatusPill tone="danger" icon={XCircle}>Not Attended</StatusPill>;
}
const subOf = (r: AttendanceRow) => [r.relation, `Participant ID: ${r.participant_code}`].filter(Boolean).join(" · ");

/* ── View Details ────────────────────────────────────────────────────────── */

function ViewDetails({ eventId, row, onClose, onMode }: { eventId: number; row: AttendanceRow; onClose: () => void; onMode: (m: Mode) => void }) {
    const fmt = useDateFormatter();
    const detail = useAttendanceDetail(eventId, row.id);
    const d = detail.data ?? { ...row, history: [] };
    const HISTORY_ICON: Record<string, LucideIcon> = { registered: UserRound, verified: ShieldCheck, checked_in: CheckCircle2 };
    const HISTORY_TONE: Record<string, Tone> = { registered: "muted", verified: "info", checked_in: "success" };
    return (
        <ActionSheet open onClose={onClose} icon={Eye} title="Participant Details" subtitle="Attendance and verification for this participant"
            footer={<><Button variant="outline" onClick={onClose}>Close</Button>
                <Button disabled={d.is_blocked} onClick={() => onMode(d.attendance === "attended" ? "verify" : "mark")}>
                    {d.attendance === "attended" ? <><ShieldCheck className="size-3.5" /> Verify Participant</> : <><ClipboardCheck className="size-3.5" /> Mark Attendance</>}
                </Button></>}>
            <PersonSummary name={d.name} photo={d.photo} sub={subOf(d)} pills={<><VerifyPill row={d} /><AttendPill row={d} /></>} />
            <InfoGrid items={[
                { label: "Attendance", value: d.attendance === "attended" ? "Attended" : "Not Attended" },
                { label: "Scan Source", value: d.check_in_source ? SOURCE[d.check_in_source].label : "—" },
                { label: "Scan Time", value: d.checked_in_at ? fmt(d.checked_in_at, true) : "—" },
                { label: "Verification", value: d.verification === "verified" ? `Verified (${d.verify_method === "qr" ? "QR code" : "manual"})` : "Pending" },
            ]} />
            <DetailSection title="Contact Information" icon={Phone}>
                <DetailRow label="Mobile">{d.mobile ? `${d.dial_code} ${d.mobile}` : null}</DetailRow>
                <DetailRow label="Email">{d.email}</DetailRow>
            </DetailSection>
            <DetailSection title="Event Status" icon={CalendarClock}>
                <DetailRow label="Registration">{d.joined_app ? "Joined through the app" : "Added by the organizer"}</DetailRow>
                <DetailRow label="Verified By">{d.verified_by_name}</DetailRow>
                <DetailRow label="Checked In By">{d.checked_in_by_name}</DetailRow>
                <DetailRow label="Party Size">{String(d.party_size)}</DetailRow>
            </DetailSection>
            <DetailSection title="Attendance History" icon={Clock}>
                {detail.isLoading ? <p className="py-2 text-muted-foreground">Loading...</p> : d.history.length ? d.history.map((h, i) => {
                    const Icon = HISTORY_ICON[h.type] ?? Clock;
                    return (
                        <div key={i} className="flex items-start gap-3 py-2">
                            <StatusPill tone={HISTORY_TONE[h.type] ?? "muted"} icon={Icon}>{h.label}</StatusPill>
                            <span className="ml-auto text-right text-[12px] text-muted-foreground">{fmt(h.at, true)}{h.by ? <><br />by {h.by}</> : null}</span>
                        </div>
                    );
                }) : <p className="py-2 text-muted-foreground">No activity yet.</p>}
            </DetailSection>
            {(d.check_in_note || d.verify_note) && (
                <DetailSection title="Notes" icon={Pencil}>
                    {d.check_in_note && <DetailRow label="Attendance">{d.check_in_note}</DetailRow>}
                    {d.verify_note && <DetailRow label="Verification">{d.verify_note}</DetailRow>}
                </DetailSection>
            )}
        </ActionSheet>
    );
}

/* ── Verify Participant ──────────────────────────────────────────────────── */

function VerifySheet({ eventId, row, onClose }: { eventId: number; row: AttendanceRow; onClose: () => void }) {
    const [method, setMethod] = useState<"qr" | "manual">(row.verify_method ?? "qr");
    const [note, setNote] = useState(row.verify_note ?? "");
    const verify = useVerifyParticipant(eventId, onClose);
    const isVerified = row.verification === "verified";
    const METHODS = [
        { value: "qr" as const, label: "QR Code Verification", hint: "Verified using the participant's QR code" },
        { value: "manual" as const, label: "Manual Verification", hint: "Verified using a government ID or other document" },
    ];
    return (
        <ActionSheet open onClose={onClose} icon={ShieldCheck} tone="success" title="Verify Participant"
            subtitle="Review participant details, confirm identity, and mark as verified."
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button disabled={verify.isPending} onClick={() => verify.mutate({ id: row.id, method, note })}>
                    <ShieldCheck className="size-3.5" /> {isVerified ? "Save Verification" : "Mark as Verified"}
                </Button></>}>
            <PersonSummary name={row.name} photo={row.photo} sub={subOf(row)} pills={<><VerifyPill row={row} /><AttendPill row={row} /></>} />
            <FormField label="Verification Method">
                <div className="flex flex-col gap-2">
                    {METHODS.map((m) => (
                        <label key={m.value} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5",
                            method === m.value ? "border-primary bg-primary/5" : "border-border")}>
                            <input type="radio" name="verify-method" className="mt-0.5 size-4 accent-[var(--primary)]"
                                checked={method === m.value} onChange={() => setMethod(m.value)} />
                            <span><span className="block text-[13px] font-semibold">{m.label}</span><span className="text-[12px] text-muted-foreground">{m.hint}</span></span>
                        </label>
                    ))}
                </div>
            </FormField>
            <FormField label="Notes (Optional)">
                <Textarea rows={3} maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Identity verified at the main entry." />
                <CharCount value={note} max={250} />
            </FormField>
            {isVerified && (
                <Button variant="link" className="h-auto self-start px-0 text-destructive" disabled={verify.isPending}
                    onClick={() => verify.mutate({ id: row.id, verified: false })}>
                    Remove verification (back to Pending)
                </Button>
            )}
        </ActionSheet>
    );
}

/* ── Mark Attendance ─────────────────────────────────────────────────────── */

const localInput = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function MarkSheet({ eventId, row, onClose }: { eventId: number; row: AttendanceRow; onClose: () => void }) {
    const [status, setStatus] = useState<"attended" | "not_attended">(row.attendance === "attended" ? "not_attended" : "attended");
    const [at, setAt] = useState(localInput(row.checked_in_at ? new Date(row.checked_in_at) : new Date()));
    const [note, setNote] = useState("");
    const mark = useMarkAttendance(eventId, onClose);
    const OPTIONS = [
        { value: "attended" as const, label: "Attended", hint: "Mark participant as attended for this event.", icon: CheckCircle2 },
        { value: "not_attended" as const, label: "Not Attended", hint: "Mark participant as not attended.", icon: XCircle },
    ];
    const submit = () => {
        if (status === "attended" && !at) { toast.error("Please enter the check-in date and time."); return; }
        mark.mutate({ id: row.id, status, at: status === "attended" ? new Date(at).toISOString() : undefined, note });
    };
    return (
        <ActionSheet open onClose={onClose} icon={ClipboardCheck} title="Mark Attendance" subtitle="Record or update the attendance of this participant."
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button disabled={mark.isPending} onClick={submit}><CheckCircle2 className="size-3.5" /> Confirm Attendance</Button></>}>
            <PersonSummary name={row.name} photo={row.photo} sub={subOf(row)} pills={<AttendPill row={row} />} />
            <FormField label="Attendance Status">
                <div className="flex flex-col gap-2">
                    {OPTIONS.map((o) => (
                        <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5",
                            status === o.value ? "border-primary bg-primary/5" : "border-border")}>
                            <input type="radio" name="attendance-status" className="mt-0.5 size-4 accent-[var(--primary)]"
                                checked={status === o.value} onChange={() => setStatus(o.value)} />
                            <span><span className="block text-[13px] font-semibold">{o.label}</span><span className="text-[12px] text-muted-foreground">{o.hint}</span></span>
                        </label>
                    ))}
                </div>
            </FormField>
            {status === "attended" && (
                <FormField label="Event Date & Time">
                    <Input type="datetime-local" value={at} max={localInput(new Date())} onChange={(e) => setAt(e.target.value)} className="h-9" />
                </FormField>
            )}
            <FormField label="Notes (Optional)">
                <Textarea rows={3} maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Arrived with family at the main entry." />
                <CharCount value={note} max={250} />
            </FormField>
        </ActionSheet>
    );
}

/* ── Send Notification ───────────────────────────────────────────────────── */

function NotifySheet({ eventId, rows, onClose, onSent }: { eventId: number; rows: AttendanceRow[]; onClose: () => void; onSent: () => void }) {
    const [channels, setChannels] = useState<("in_app" | "push")[]>(["in_app", "push"]);
    const [title, setTitle] = useState("Message from the organizer");
    const [message, setMessage] = useState("");
    const notify = useNotifyParticipants(eventId, () => { onSent(); onClose(); });
    const one = rows.length === 1 ? rows[0] : null;
    const send = () => {
        if (!channels.length) { toast.error("Please choose In-App, Push Notification or both."); return; }
        if (!title.trim()) { toast.error("Please enter a title."); return; }
        if (!message.trim()) { toast.error("Please write a message."); return; }
        notify.mutate({ ids: rows.map((r) => r.id), title, message, channels });
    };
    return (
        <ActionSheet open onClose={onClose} icon={Send} title="Send Notification"
            subtitle={one ? "Send a message to the selected participant." : `Send a message to ${rows.length} selected participants.`}
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button disabled={notify.isPending} onClick={send}><Send className="size-3.5" /> Send Notification</Button></>}>
            {one
                ? <PersonSummary name={one.name} photo={one.photo} sub={subOf(one)} />
                : <DetailSection title="Recipients" icon={Users}><p className="py-2">{rows.map((r) => r.name).join(", ")}</p></DetailSection>}
            <FormField label="Notification Channel">
                <CheckChoices boxed value={channels} onChange={setChannels}
                    options={[{ value: "in_app", label: "In-App", icon: Bell }, { value: "push", label: "Push Notification", icon: Mail }]} />
            </FormField>
            <FormField label="Title">
                <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="h-9" />
            </FormField>
            <FormField label="Message">
                <Textarea rows={5} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your message..." />
                <CharCount value={message} max={500} />
            </FormField>
        </ActionSheet>
    );
}

/* ── Edit / Remove — the Participants module's own panels ───────────────── */

function ParticipantAction({ eventId, id, action, onClose }: { eventId: number; id: number; action: "edit" | "delete"; onClose: () => void }) {
    const row = useParticipantRow(id);
    if (!row.data) return null;
    return <ParticipantSheet action={action} p={row.data} eventId={eventId} onClose={onClose} onSwitch={() => onClose()} />;
}
