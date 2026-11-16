"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Ban, CheckCircle2, Clock, Download, Eye, FileText, History, Laptop, MoreVertical, Smartphone, Tablet, Trash2, TriangleAlert, Users, XCircle,
    type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ActionSheet, DeletePopup, DetailRow, DetailSection, InfoGrid, ListCard, ModuleHeader, OverviewCard, Pager, PersonCell, PersonSummary,
    SearchBox, StatTile, StatusPill, Toolbar,
} from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { useDateFormatter } from "@/hooks/use-client-settings";
import type { ClientEvent } from "@/hooks/use-client-events";
import { useParticipantRow } from "@/hooks/use-event-participants";
import {
    fetchAllDownloadLogs, useDownloadHistory, useDownloadLogs, useRefreshDownloadLogs, useRemoveFromDownloads,
    type DownloadLogQuery, type DownloadLogRow,
} from "@/hooks/use-event-download-logs";
import { ParticipantSheet } from "../../../participants/_components/participant-actions";

/**
 * QR Code → File Downloads (Jamal's design, 2026-11-16): who downloaded which of the event's files.
 * The organizer uploads the files in Downloads; each participant download in the app is saved
 * (event_download_logs) and listed here. Menu (red lines applied): View Details, View Scan History,
 * Block Participant, Remove Participant. No Access Source (no QR points), no row eye icon.
 */

const PAGE_SIZE = 10;
const DEVICE: Record<string, { label: string; icon: LucideIcon }> = {
    mobile: { label: "Mobile", icon: Smartphone },
    tablet: { label: "Tablet", icon: Tablet },
    desktop: { label: "Desktop", icon: Laptop },
};
const CATEGORY: Record<string, string> = { invitation: "Invitation", travel: "Travel", stay: "Stay", agenda: "Agenda", info: "Event Info", other: "Other" };
const categoryOf = (k: string) => CATEGORY[k] ?? (k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/[-_]/g, " ") : "—");
const STATUS_OPTS = [["all", "All Statuses"], ["completed", "Completed"], ["failed", "Failed"]] as const;

type Mode = "view" | "history" | "block" | "remove";

export function FileDownloadsPanel({ event }: { event: ClientEvent }) {
    const eventId = event.id;
    const fmt = useDateFormatter();
    const [searchText, setSearchText] = useState("");
    const [search, setSearch] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [fileType, setFileType] = useState("all");
    const [status, setStatus] = useState<NonNullable<DownloadLogQuery["status"]>>("all");
    const [relationship, setRelationship] = useState("all");
    const [page, setPage] = useState(1);
    const [sheet, setSheet] = useState<{ mode: Mode; row: DownloadLogRow } | null>(null);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [searchText]);

    const query: DownloadLogQuery = {
        search: search || undefined, from: from || undefined, to: to || undefined,
        file_type: fileType === "all" ? undefined : fileType, status,
        relationship: relationship === "all" ? undefined : relationship, page, limit: PAGE_SIZE,
    };
    const list = useDownloadLogs(eventId, query);
    const stats = list.data?.stats;
    const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
    const total = list.data?.pagination.totalItems ?? 0;
    const filtered = !!(search || from || to || fileType !== "all" || status !== "all" || relationship !== "all");

    const reset = () => { setSearchText(""); setSearch(""); setFrom(""); setTo(""); setFileType("all"); setStatus("all"); setRelationship("all"); setPage(1); };

    const exportList = async () => {
        setExporting(true);
        try {
            const all = await fetchAllDownloadLogs(eventId, { ...query, page: undefined, limit: undefined });
            const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
            const head = ["#", "Participant", "Mobile", "Email", "File Name", "File Category", "Download Time", "Device", "Status", "Reason"];
            const lines = all.map((r, i) => [
                i + 1, r.participant?.name ?? "", r.participant?.mobile ? `${r.participant.dial_code} ${r.participant.mobile}` : "", r.participant?.email ?? "",
                r.file.file_name, categoryOf(r.file.category_key), fmt(r.downloaded_at, true), r.device ? DEVICE[r.device]?.label : "",
                r.status === "completed" ? "Completed" : "Failed", r.failed_reason ?? "",
            ].map(esc).join(","));
            const blob = new Blob(["﻿" + [head.map(esc).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${event.name.replace(/[^\w-]+/g, "-")}-file-downloads.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
            toast.success(`Exported ${all.length} download${all.length === 1 ? "" : "s"}`);
        } catch {
            toast.error("Could not export the list");
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <ModuleHeader
                title="Files Downloaded Participants List"
                subtitle="Track participants who downloaded the event's files."
                actions={(
                    <Button variant="outline" size="sm" className="h-8" disabled={exporting || !total} onClick={exportList}>
                        <Download className="size-3.5" /> {exporting ? "Exporting..." : "Export"}
                    </Button>
                )}
            />

            <OverviewCard>
                <StatTile icon={Download} value={stats?.total_downloads ?? 0} label="Total Downloads" />
                <StatTile icon={Users} tone="violet" value={stats?.unique_downloaders ?? 0} label="Unique Downloaders" />
                <StatTile icon={FileText} tone="info" value={stats?.most_downloaded?.title ?? "—"} label="Most Downloaded File"
                    caption={stats?.most_downloaded ? `${stats.most_downloaded.downloads} download${stats.most_downloaded.downloads === 1 ? "" : "s"}` : undefined} />
                <StatTile icon={TriangleAlert} tone="danger" value={stats?.failed_downloads ?? 0} label="Failed Downloads" />
            </OverviewCard>

            <Toolbar>
                <SearchBox value={searchText} onChange={setSearchText} placeholder="Search participants, file name, or email..." />
                <div className="flex items-center gap-1.5">
                    <Input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-8 w-[140px] text-[12.5px]" aria-label="From date" />
                    <span className="text-muted-foreground">–</span>
                    <Input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-8 w-[140px] text-[12.5px]" aria-label="To date" />
                </div>
                <FilterSelect label="File Type" value={fileType}
                    options={[["all", "All Types"], ...(list.data?.file_types ?? []).map((t) => [t, t.toUpperCase()] as const)]}
                    onChange={(v) => { setFileType(v); setPage(1); }} />
                <FilterSelect label="Download Status" value={status} options={STATUS_OPTS} onChange={(v) => { setStatus(v); setPage(1); }} />
                <FilterSelect label="Participant Category" value={relationship}
                    options={[["all", "All Categories"], ...(list.data?.relationships ?? []).map((r) => [r, r] as const)]}
                    onChange={(v) => { setRelationship(v); setPage(1); }} />
                <Button variant="outline" size="sm" className="h-8" onClick={reset}>Reset</Button>
            </Toolbar>

            <ListCard title="Files Downloaded Participants List" icon={Users} count={total}
                note={stats ? `Total: ${stats.unique_downloaders} participant${stats.unique_downloaders === 1 ? "" : "s"} · ${stats.total_downloads} download${stats.total_downloads === 1 ? "" : "s"}` : undefined}>
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead className="bg-muted/40 text-left text-[12px] font-semibold text-muted-foreground">
                            <tr>
                                <th className="w-10 px-3 py-2.5">#</th>
                                {["Participant", "File Name", "File Category", "Download Time", "Device", "Status"].map((h) => (
                                    <th key={h} className="whitespace-nowrap px-3 py-2.5">{h}</th>
                                ))}
                                <th className="px-3 py-2.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.isError ? (
                                <tr><td colSpan={8} className="py-14 text-center text-destructive">
                                    Could not load downloads. <Button variant="link" size="sm" className="px-1" onClick={() => list.refetch()}>Retry</Button>
                                </td></tr>
                            ) : !list.isLoading && !rows.length ? (
                                <tr><td colSpan={8} className="py-14 text-center text-muted-foreground">
                                    {filtered ? "No downloads match these filters." : "No downloads yet. When participants download the event's files in the app, they show here."}
                                </td></tr>
                            ) : rows.map((r, i) => {
                                const dev = r.device ? DEVICE[r.device] : null;
                                return (
                                    <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                                        <td className="px-3 py-2 text-muted-foreground">{(page - 1) * PAGE_SIZE + i + 1}</td>
                                        <td className="px-3 py-2">
                                            {r.participant ? (
                                                <PersonCell name={r.participant.name} photo={r.participant.photo} onClick={() => setSheet({ mode: "view", row: r })}
                                                    sub={r.participant.relation || r.participant.email || undefined}
                                                    badge={r.participant.is_blocked ? <StatusPill tone="danger">Blocked</StatusPill> : undefined} />
                                            ) : <span className="text-muted-foreground">Removed participant</span>}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className="flex items-center gap-2">
                                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-primary">{r.file.file_type}</span>
                                                <span className="max-w-[200px] truncate" title={r.file.file_name}>{r.file.file_name}</span>
                                            </span>
                                        </td>
                                        <td className="px-3 py-2"><StatusPill tone="violet">{categoryOf(r.file.category_key)}</StatusPill></td>
                                        <td className="whitespace-nowrap px-3 py-2 text-foreground/80">{fmt(r.downloaded_at, true)}</td>
                                        <td className="whitespace-nowrap px-3 py-2">
                                            {dev ? <span className="flex items-center gap-1.5"><dev.icon className="size-4 text-muted-foreground" />{dev.label}</span> : "—"}
                                        </td>
                                        <td className="px-3 py-2">
                                            {r.status === "completed"
                                                ? <StatusPill tone="success" icon={CheckCircle2}>Completed</StatusPill>
                                                : <span title={r.failed_reason ?? undefined}><StatusPill tone="danger" icon={XCircle}>Failed</StatusPill></span>}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {r.participant && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button size="icon" variant="outline" className="size-8" aria-label="Actions"><MoreVertical className="size-4" /></Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-auto min-w-48">
                                                        <DropdownMenuItem onClick={() => setSheet({ mode: "view", row: r })}><Eye className="size-4" /> View Details</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setSheet({ mode: "history", row: r })}><History className="size-4" /> View Scan History</DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setSheet({ mode: "block", row: r })}><Ban className="size-4" /> {r.participant.is_blocked ? "Unblock Participant" : "Block Participant"}</DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem variant="destructive" onClick={() => setSheet({ mode: "remove", row: r })}><Trash2 className="size-4" /> Remove Participant</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="border-t border-border px-4 py-3">
                    <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} noun="downloads" />
                </div>
            </ListCard>

            {sheet && sheet.row.participant && (sheet.mode === "view" || sheet.mode === "history") && (
                <HistorySheet eventId={eventId} participantId={sheet.row.participant.id} mode={sheet.mode} onClose={() => setSheet(null)}
                    onHistory={() => setSheet({ ...sheet, mode: "history" })} />
            )}
            {sheet?.mode === "block" && sheet.row.participant && (
                <BlockAction eventId={eventId} participantId={sheet.row.participant.id} onClose={() => setSheet(null)} />
            )}
            {sheet?.mode === "remove" && sheet.row.participant && (
                <RemovePopup eventId={eventId} row={sheet.row} onClose={() => setSheet(null)} />
            )}
        </div>
    );
}

function FilterSelect<T extends string>({ label, value, options, onChange }: {
    label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void;
}) {
    const current = options.find(([v]) => v === value)?.[1] ?? "All";
    return (
        <Select value={value} onValueChange={(v) => onChange(v as T)}>
            <SelectTrigger className="h-8 min-w-[150px] text-[12.5px]" aria-label={label}>
                <SelectValue>{current}</SelectValue>
            </SelectTrigger>
            <SelectContent>
                {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}

/* ── View Details / View Scan History ───────────────────────────────────── */

function HistorySheet({ eventId, participantId, mode, onClose, onHistory }: {
    eventId: number; participantId: number; mode: "view" | "history"; onClose: () => void; onHistory: () => void;
}) {
    const fmt = useDateFormatter();
    const q = useDownloadHistory(eventId, participantId);
    const h = q.data;
    const p = h?.participant;
    const view = mode === "view";
    return (
        <ActionSheet open onClose={onClose} icon={view ? Eye : History} title={view ? "Participant Details" : "Scan History"}
            subtitle={view ? "The participant's profile and download history." : "Every file download by this participant."}
            footer={<><Button variant="outline" onClick={onClose}>Close</Button>
                {view ? <Button onClick={onHistory}><History className="size-3.5" /> View Scan History</Button> : <Button onClick={onClose}>Done</Button>}</>}>
            {q.isLoading || !h ? <p className="py-6 text-center text-muted-foreground">Loading...</p> : (
                <>
                    {p && <PersonSummary name={p.name} photo={p.photo} sub={p.relation ?? undefined}
                        pills={p.is_blocked ? <StatusPill tone="danger" icon={Ban}>Blocked</StatusPill> : undefined} />}
                    <InfoGrid items={[
                        { label: "Total Downloads", value: String(h.summary.total) },
                        { label: "Files", value: String(h.summary.files) },
                        { label: "Completed", value: String(h.summary.completed) },
                        { label: "Failed", value: String(h.summary.failed) },
                    ]} />
                    {view && p && (
                        <DetailSection title="Contact Information">
                            <DetailRow label="Mobile">{p.mobile ? `${p.dial_code} ${p.mobile}` : null}</DetailRow>
                            <DetailRow label="Email">{p.email}</DetailRow>
                            <DetailRow label="First Download">{fmt(h.summary.first_at, true)}</DetailRow>
                            <DetailRow label="Last Download">{fmt(h.summary.last_at, true)}</DetailRow>
                        </DetailSection>
                    )}
                    <DetailSection title={view ? "Recent Downloads" : "Download Activity"} icon={Clock}>
                        {(view ? h.downloads.slice(0, 5) : h.downloads).map((d) => (
                            <div key={d.id} className="flex items-start justify-between gap-3 py-2">
                                <div className="min-w-0">
                                    <p className="truncate font-medium" title={d.file.file_name}>{d.file.file_name}</p>
                                    <p className="text-[11.5px] text-muted-foreground">
                                        {categoryOf(d.file.category_key)}{d.device ? ` · ${DEVICE[d.device]?.label ?? d.device}` : ""}{d.platform ? ` · ${d.platform}` : ""}
                                        {d.status === "failed" && d.failed_reason ? ` · ${d.failed_reason}` : ""}
                                    </p>
                                </div>
                                <div className="shrink-0 text-right">
                                    {d.status === "completed"
                                        ? <StatusPill tone="success" icon={CheckCircle2}>Completed</StatusPill>
                                        : <StatusPill tone="danger" icon={XCircle}>Failed</StatusPill>}
                                    <p className={cn("mt-1 text-[11.5px] text-muted-foreground")}>{fmt(d.downloaded_at, true)}</p>
                                </div>
                            </div>
                        ))}
                    </DetailSection>
                </>
            )}
        </ActionSheet>
    );
}

/* ── Block (the Participants module's own panel) / Remove from this list ─── */

function BlockAction({ eventId, participantId, onClose }: { eventId: number; participantId: number; onClose: () => void }) {
    const row = useParticipantRow(participantId);
    const refresh = useRefreshDownloadLogs(eventId);
    if (!row.data) return null;
    const close = () => { refresh(); onClose(); };
    return <ParticipantSheet action="block" p={row.data} eventId={eventId} onClose={close} onSwitch={() => close()} />;
}

function RemovePopup({ eventId, row, onClose }: { eventId: number; row: DownloadLogRow; onClose: () => void }) {
    const remove = useRemoveFromDownloads(eventId, onClose);
    return (
        <DeletePopup
            open onClose={onClose} title="Remove Participant"
            description={`Remove ${row.participant?.name ?? "this participant"} and all of their downloads from this list? They stay a participant of the event.`}
            confirmLabel="Remove Participant" busy={remove.isPending}
            onConfirm={() => row.participant && remove.mutate(row.participant.id)}
        />
    );
}
