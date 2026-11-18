"use client";

import { useState } from "react";
import {
    CalendarClock, ChevronLeft, ChevronRight, Copy, Download, Eye, Image as ImageIcon, Info, Layers, Loader2, Mail,
    MoreHorizontal, Pencil, Plus, Search, Send, Share2, Trash2, UserCheck, Users,
} from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import { api } from "@/lib/api-client";
import type { ClientEvent } from "@/hooks/use-client-events";
import type { TemplateOption } from "@/hooks/use-client-portal";
import type { InvitationData } from "@/components/common/invitation-card";
import { TemplateArtwork } from "@/components/common/template-artwork";
import {
    useInvitationSends, useRemoveInvitationRecipient, useResendInvitation,
    type InvitationSendList, type InvitationSendRow, type InviteStatus,
} from "@/hooks/use-invitation-sends";
import { hostsOf, initials, prettyDate, prettyStamp } from "./shared";

/**
 * Step 4 — Shared Invitations (designs 04.png, Event Invite Response Dashboard
 * 1 + 2). Who the invitation was shared with, on which channel, when, and its
 * delivery state. NO RSVP (Jamal, 2026-11-18): no RSVP column, card, breakdown
 * or reminder. "Joined in App" = the guest scanned the QR and joined the event.
 */

const STATUS_META: Record<InviteStatus, { label: string; cls: string }> = {
    recorded: { label: "Recorded", cls: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300" },
    scheduled: { label: "Scheduled", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
    sent: { label: "Sent", cls: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
    delivered: { label: "Delivered", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
    failed: { label: "Failed", cls: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};

export function TrackResponses({
    event, template, data, link, onShareAgain, onCreate, onViewTemplates,
}: {
    event: ClientEvent;
    template: TemplateOption | null;
    data: InvitationData;
    link: string;
    onShareAgain: () => void;
    onCreate: () => void;
    onViewTemplates: () => void;
}) {
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [channel, setChannel] = useState("all");
    const [page, setPage] = useState(1);
    const [checked, setChecked] = useState<Set<number>>(new Set());
    const [viewing, setViewing] = useState(false);
    const [removing, setRemoving] = useState<InvitationSendRow | null>(null);
    const q = useInvitationSends({
        eventId: event.id, search: search.trim(), page, limit: 10,
        status: status === "all" ? "" : status, channel: channel === "all" ? "" : channel,
    });
    const resend = useResendInvitation();
    const remove = useRemoveInvitationRecipient();

    const stats = q.data?.stats;
    const rows = q.data?.rows ?? [];
    const pg = q.data?.pagination;
    const empty = !q.isLoading && (stats?.total ?? 0) === 0;
    const image = mediaUrl(event.invitation_image) || "";

    const copyLink = async () => {
        try { await navigator.clipboard.writeText(link); toast.success("Guest link copied."); } catch { toast.error("Could not copy the link."); }
    };
    const download = async () => {
        if (!image) { toast.error("Save the invitation in Customize & Save first."); return; }
        try {
            const blob = await (await fetch(image)).blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${(event.name || "invitation").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-invitation.png`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch {
            window.open(image, "_blank", "noopener");
        }
    };

    /** Export = every row of the event matching the current filters, as CSV (opens in Excel). */
    const [exporting, setExporting] = useState(false);
    const exportCsv = async () => {
        setExporting(true);
        try {
            const all: InvitationSendRow[] = [];
            for (let p = 1; p <= 50; p++) {
                const d = await api.get<InvitationSendList>("/client/invitation-sends", {
                    event_id: event.id, page: p, limit: 100,
                    search: search.trim() || undefined,
                    status: status === "all" ? undefined : status,
                    channel: channel === "all" ? undefined : channel,
                });
                all.push(...d.rows);
                if (p >= d.pagination.totalPages) break;
            }
            if (!all.length) { toast.error("Nothing to export."); return; }
            const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
            const lines = [
                ["Guest Name", "Mobile", "Email", "Group", "Channel", "Sent On", "Scheduled For", "Delivery", "Joined in App"].map(cell).join(","),
                ...all.map((r) => [
                    r.guest?.name ?? "Removed guest",
                    r.guest?.mobile ? `${r.guest.dial_code ?? ""} ${r.guest.mobile}`.trim() : "",
                    r.guest?.email ?? "",
                    r.guest?.group?.name ?? "",
                    r.channel === "email" ? "Email" : "WhatsApp",
                    r.status === "scheduled" ? "" : prettyStamp(r.sent_at ?? r.created_at),
                    r.status === "scheduled" ? prettyStamp(r.scheduled_at) : "",
                    STATUS_META[r.status]?.label ?? r.status,
                    r.guest?.joined ? "Yes" : "No",
                ].map(cell).join(",")),
            ];
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
            a.download = `${(event.name || "event").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-shared-invitations.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
            toast.success(`${all.length} row${all.length === 1 ? "" : "s"} exported.`);
        } catch {
            toast.error("Could not export the list.");
        } finally {
            setExporting(false);
        }
    };

    const cards = [
        { icon: Send, value: stats?.shared ?? 0, label: "Invitations Sent" },
        { icon: UserCheck, value: stats?.delivered ?? 0, label: "Delivered" },
        { icon: Eye, value: stats?.joined ?? 0, label: "Joined in App" },
        { icon: CalendarClock, value: stats?.scheduled ?? 0, label: "Scheduled" },
    ];

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {cards.map((c) => (
                    <div key={c.label} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5" data-stat={c.label}>
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><c.icon className="size-5" /></span>
                        <span>
                            <span className="block text-[22px] font-bold leading-tight text-foreground">{q.isLoading ? "–" : c.value}</span>
                            <span className="block text-[12px] text-muted-foreground">{c.label}</span>
                        </span>
                    </div>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <section className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
                    <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5">
                        <div>
                            <h2 className="text-[16px] font-bold text-foreground">Shared Invitations</h2>
                            <p className="text-[12.5px] text-muted-foreground">Track individual guests, channels and delivery</p>
                        </div>
                        {!empty && (
                            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11.5px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                                {stats?.guests ?? 0} Recipient{stats?.guests === 1 ? "" : "s"}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2.5 px-5 py-4">
                        <div className="relative min-w-[220px] flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name, email or phone..." className="h-10 pl-9 text-[13px]" />
                        </div>
                        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                            <SelectTrigger className="h-10 w-[150px] text-[13px]" aria-label="Status"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {(Object.keys(STATUS_META) as InviteStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={channel} onValueChange={(v) => { setChannel(v); setPage(1); }}>
                            <SelectTrigger className="h-10 w-[150px] text-[13px]" aria-label="Channel"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Channel: All</SelectItem>
                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" className="h-10 text-[13px]" disabled={empty || exporting} onClick={() => void exportCsv()}>
                            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}Export
                        </Button>
                    </div>

                    {q.isLoading ? (
                        <div className="flex flex-col gap-2 px-5 pb-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : empty ? (
                        <div className="flex flex-col items-center gap-3 px-5 pb-8 pt-4 text-center">
                            <span className="relative grid size-28 place-items-center rounded-full bg-primary/10">
                                <Mail className="size-12 text-primary" />
                                <Send className="absolute right-4 top-4 size-6 text-primary" />
                            </span>
                            <h3 className="text-[22px] font-bold text-foreground">No invitations shared yet</h3>
                            <p className="max-w-md text-[13.5px] text-muted-foreground">Create and send your first invitation to start tracking who it was shared with.</p>
                            <div className="mt-1 flex flex-wrap justify-center gap-3">
                                <Button className="h-11 px-5 text-[13.5px] font-semibold" onClick={onCreate}><Plus className="size-4" />Create Invitation</Button>
                                <Button variant="outline" className="h-11 px-5 text-[13.5px]" onClick={onViewTemplates}><Layers className="size-4" />View Templates</Button>
                            </div>
                            <div className="mt-4 grid w-full max-w-2xl grid-cols-1 gap-3 rounded-xl bg-primary/5 p-4 text-left sm:grid-cols-3">
                                {[
                                    { icon: Layers, text: "Choose a beautiful template" },
                                    { icon: Pencil, text: "Customize with your event details" },
                                    { icon: Users, text: "Share with guests and track it" },
                                ].map((s) => (
                                    <span key={s.text} className="flex items-center gap-2.5 text-[12.5px] text-foreground">
                                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-primary"><s.icon className="size-4" /></span>{s.text}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[640px] text-[12.5px]">
                                    <thead className="bg-muted/40 text-left text-[11.5px] font-semibold text-muted-foreground">
                                        <tr>
                                            <th className="w-10 px-5 py-2.5">
                                                <Checkbox aria-label="Select all on this page" checked={rows.length > 0 && rows.every((r) => checked.has(r.id))}
                                                    onCheckedChange={(v) => setChecked(v === true ? new Set(rows.map((r) => r.id)) : new Set())} />
                                            </th>
                                            <th className="px-2 py-2.5">Guest Name</th>
                                            <th className="px-2 py-2.5">Channel</th>
                                            <th className="px-2 py-2.5">Sent On</th>
                                            <th className="px-2 py-2.5">Delivery</th>
                                            <th className="px-5 py-2.5 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.length === 0 ? (
                                            <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No invitations match these filters.</td></tr>
                                        ) : rows.map((r) => (
                                            <tr key={r.id} className={cn("border-t border-border", checked.has(r.id) && "bg-primary/5")} data-row={r.guest?.name ?? r.id}>
                                                <td className="px-5 py-3"><Checkbox aria-label="Select row" checked={checked.has(r.id)}
                                                    onCheckedChange={(v) => { const n = new Set(checked); if (v === true) n.add(r.id); else n.delete(r.id); setChecked(n); }} /></td>
                                                <td className="px-2 py-3">
                                                    <span className="flex items-center gap-2.5">
                                                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[10.5px] font-bold text-primary">{initials(r.guest?.name)}</span>
                                                        <span className="min-w-0">
                                                            <span className="block truncate font-semibold text-foreground">{r.guest?.name ?? "Removed guest"}</span>
                                                            {r.guest?.joined && <span className="text-[10.5px] font-semibold text-emerald-600">Joined in app</span>}
                                                        </span>
                                                    </span>
                                                </td>
                                                <td className="px-2 py-3">
                                                    <span className="flex items-center gap-1.5">
                                                        {r.channel === "email" ? <Mail className="size-4 text-sky-600" /> : <FontAwesomeIcon icon={faWhatsapp} className="!size-4 text-emerald-500" />}
                                                        {r.channel === "email" ? "Email" : "WhatsApp"}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-3 text-muted-foreground">
                                                    {r.status === "scheduled" ? <span title="Scheduled">{prettyStamp(r.scheduled_at)}</span> : prettyStamp(r.sent_at ?? r.created_at)}
                                                </td>
                                                <td className="px-2 py-3">
                                                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_META[r.status]?.cls)}>{STATUS_META[r.status]?.label ?? r.status}</span>
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="outline" size="icon" className="size-8" aria-label={`Actions for ${r.guest?.name ?? "invitation"}`}><MoreHorizontal className="size-4" /></Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-52">
                                                            <DropdownMenuItem onClick={() => setViewing(true)}><Eye className="size-4" />View Invitation</DropdownMenuItem>
                                                            <DropdownMenuItem disabled={resend.isPending || !r.guest} onClick={() => resend.mutate(r.id)}><Send className="size-4" />Resend Invitation</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={copyLink}><Copy className="size-4" />Copy Guest Link</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={download}><Download className="size-4" />Download Invitation</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem variant="destructive" onClick={() => setRemoving(r)}><Trash2 className="size-4" />Remove Recipient</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {pg && (
                                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-[12.5px] text-muted-foreground">
                                    <span>Showing {pg.totalItems ? (pg.page - 1) * pg.limit + 1 : 0}–{Math.min(pg.page * pg.limit, pg.totalItems)} of {pg.totalItems}</span>
                                    <span className="flex items-center gap-1">
                                        <Button variant="outline" size="icon" className="size-8" disabled={pg.page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                                        <span className="px-2 font-semibold text-foreground">{pg.page} / {pg.totalPages}</span>
                                        <Button variant="outline" size="icon" className="size-8" disabled={pg.page >= pg.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </section>

                <aside className="flex flex-col gap-4">
                    <section className="rounded-xl border border-border bg-card p-5">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-[16px] font-bold text-foreground">Invitation Overview</h2>
                            {template && (
                                <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-[12.5px] font-semibold" onClick={onViewTemplates} aria-label="Edit invitation">
                                    <Pencil className="size-3.5" />Edit
                                </Button>
                            )}
                        </div>
                        {template ? (
                            <>
                                <div className="mt-3 flex gap-3 border-b border-border pb-4">
                                    <span className="relative block h-[96px] w-[72px] shrink-0 overflow-hidden rounded-md bg-muted/40">
                                        {image
                                            // eslint-disable-next-line @next/next/no-img-element
                                            ? <img src={image} alt="" className="h-full w-full object-cover" />
                                            : <TemplateArtwork template={template} data={data} className="inset-0" cardClassName="rounded-[3px]" />}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[14px] font-bold text-foreground">{template.name}</p>
                                        <p className="text-[12px] text-muted-foreground">{hostsOf(event) || event.name}</p>
                                        <p className="text-[12px] text-muted-foreground">{[event.category?.name, prettyDate(event.start_date)].filter(Boolean).join(" · ")}</p>
                                        <span className="mt-1.5 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                            {image ? "Published" : "Saved"}
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-4 flex gap-2">
                                    <Button variant="outline" className="h-9 flex-1 text-[12.5px]" onClick={() => setViewing(true)}><Eye className="size-4" />View Invitation</Button>
                                    <Button className="h-9 flex-1 text-[12.5px] font-semibold" onClick={onShareAgain}><Share2 className="size-4" />Share Again</Button>
                                </div>
                            </>
                        ) : (
                            <div className="mt-3 flex flex-col gap-3">
                                <div className="flex gap-3">
                                    <span className="grid h-[86px] w-[86px] shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ImageIcon className="size-8" /></span>
                                    <div>
                                        <p className="text-[13.5px] font-bold text-foreground">No active invitation yet</p>
                                        <p className="text-[12px] text-muted-foreground">Create your first invitation to see a preview, event details, and sharing options here.</p>
                                    </div>
                                </div>
                                <Button variant="outline" className="h-10 border-primary text-[13px] font-semibold text-primary" onClick={onCreate}><Plus className="size-4" />Create Invitation</Button>
                            </div>
                        )}
                    </section>

                    <section className="rounded-xl border border-border bg-card p-5">
                        <h2 className="text-[16px] font-bold text-foreground">Delivery Snapshot</h2>
                        {(stats?.total ?? 0) === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-6 text-center">
                                <span className="flex items-end gap-1" aria-hidden>
                                    <span className="h-5 w-3 rounded bg-primary/20" /><span className="h-8 w-3 rounded bg-primary/30" /><span className="h-11 w-3 rounded bg-primary/40" />
                                </span>
                                <p className="text-[14px] font-bold text-foreground">No delivery data yet</p>
                                <p className="text-[12px] text-muted-foreground">Once you send invitations, you&apos;ll see the WhatsApp and email split here.</p>
                            </div>
                        ) : (
                            <div className="mt-3 flex flex-col gap-3">
                                {([
                                    { label: "WhatsApp", n: stats!.by_channel.whatsapp, cls: "bg-primary" },
                                    { label: "Email", n: stats!.by_channel.email, cls: "bg-sky-500" },
                                ]).map((b) => (
                                    <div key={b.label} className="grid grid-cols-[80px_1fr_36px] items-center gap-3 text-[12.5px]">
                                        <span className="font-medium text-foreground">{b.label}</span>
                                        <span className="h-2 overflow-hidden rounded-full bg-muted">
                                            <span className={cn("block h-full rounded-full", b.cls)} style={{ width: `${stats!.total ? (b.n / stats!.total) * 100 : 0}%` }} />
                                        </span>
                                        <span className="text-right font-semibold">{b.n}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-[11.5px] text-primary">
                            <Info className="mt-0.5 size-3.5 shrink-0" />
                            Delivered and read status appear once a WhatsApp / email provider is connected. Until then invitations are saved as Recorded.
                        </p>
                    </section>
                </aside>
            </div>

            <Dialog open={viewing} onOpenChange={setViewing}>
                <DialogContent className="w-auto max-w-none border-0 bg-transparent p-0 shadow-none" showCloseButton={false}>
                    <DialogTitle className="sr-only">Invitation</DialogTitle>
                    <div className="flex flex-col items-center gap-3">
                        {image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={image} alt="Invitation" className="max-h-[80vh] w-auto rounded-md shadow-lg" />
                            : template ? <span className="relative block h-[70vh] w-[min(380px,90vw)]"><TemplateArtwork template={template} data={data} className="inset-0" /></span> : null}
                        <Button type="button" variant="secondary" size="sm" onClick={() => setViewing(false)}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Remove Recipient — the centre confirmation popup (house rule). */}
            <Dialog open={!!removing} onOpenChange={(o) => { if (!o && !remove.isPending) setRemoving(null); }}>
                <DialogContent className="sm:max-w-[420px]">
                    <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-destructive text-white"><Trash2 className="size-5" /></span>
                        <div>
                            <DialogTitle className="text-[16px]">Remove Recipient</DialogTitle>
                            <DialogDescription className="mt-1 text-[12.5px]">
                                Remove <span className="font-semibold text-foreground">{removing?.guest?.name ?? "this recipient"}</span> from the shared list? The guest stays in your guest list.
                            </DialogDescription>
                        </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2.5">
                        <Button variant="outline" className="h-10" disabled={remove.isPending} onClick={() => setRemoving(null)}>Cancel</Button>
                        <Button variant="destructive" className="h-10 font-semibold" disabled={remove.isPending}
                            onClick={() => removing && remove.mutate(removing.id, { onSettled: () => setRemoving(null) })}>
                            {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{remove.isPending ? "Removing..." : "Remove"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
