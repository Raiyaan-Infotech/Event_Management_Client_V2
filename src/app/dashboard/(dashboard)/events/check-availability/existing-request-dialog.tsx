"use client";

import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, ExternalLink, FileText, Headphones, Info, PhoneCall, PlusCircle, Trash2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExistingRequestConflict } from "@/hooks/use-event-availability";
import { prettyDate, prettyRange } from "../../allocation-requests/shared";

/**
 * Existing support request flow (Jamal's designs 2026-11-14, three images):
 *   found     → "Existing Support Request Found" — existing vs current selection, Cancel Existing Request
 *   confirm   → "Cancel Existing Support Request?" — Keep / Yes, Cancel Request
 *   cancelled → "Previous Request Cancelled Successfully" — Create New Support Request
 */
export type ExistingStep = "found" | "confirm" | "cancelled";

export function ExistingRequestDialog({
    step, conflict, start, end, cancelling, onClose, onAskCancel, onKeep, onConfirmCancel, onCreateNew,
}: {
    step: ExistingStep | null;
    conflict: ExistingRequestConflict | null;
    start: string;
    end: string;
    cancelling: boolean;
    onClose: () => void;
    onAskCancel: () => void;
    onKeep: () => void;
    onConfirmCancel: () => void;
    onCreateNew: () => void;
}) {
    if (!conflict) return null;
    const ex = conflict.existing;
    const type = ex.contact_method === "call" ? "Call Back" : "Email Support";
    const exUnavailable = conflict.conflict_dates.length ? conflict.conflict_dates : ex.unavailable_dates.map((u) => u.date);
    const exDates = exUnavailable.map(prettyDate).join(", ");
    const today = prettyDate(new Date().toISOString().slice(0, 10));
    const reason = (ex.unavailable_dates.find((u) => exUnavailable.includes(u.date))?.status ?? "full") === "full" ? "Fully Booked" : "Not Available";

    return (
        <Dialog open={!!step} onOpenChange={(v) => !v && !cancelling && onClose()}>
            <DialogContent className="gap-3 p-5 text-[13px] sm:max-w-[640px]">
                {step === "found" && (
                    <>
                        <Head icon={<AlertTriangle className="h-5 w-5" />} tone="red" title="Existing Support Request Found" />
                        <Note tone="pink">You have already requested Call Back or Email Support for an unavailable date in this selected range. Before raising a new ticket, please cancel the existing request.</Note>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Box icon={<PhoneCall />} title="Existing Request">
                                <Row label="Request ID" value={ex.ticket_no} />
                                <Row label="Request Type" value={type} />
                                <Row label="Submitted On" value={prettyDate(ex.created_at)} />
                                <Row label="Status" value={<Pill tone="amber"><Clock className="h-3 w-3" />Pending</Pill>} />
                                <Row label="Previous Requested Dates" value={prettyRange(ex.start_date, ex.end_date)} />
                                <Row label="Unavailable Date" value={<Pill tone="red">{exDates}</Pill>} />
                            </Box>
                            <Box icon={<CalendarDays />} title="Current Selection">
                                <Row label="Current Requested Dates" value={prettyRange(start, end)} />
                                <Row label="Conflict Date" value={<Pill tone="red">{exDates}</Pill>} />
                                <Row label="Reason" value={<Pill tone="red"><XCircle className="h-3 w-3" />{reason}</Pill>} />
                            </Box>
                        </div>
                        <Note tone="muted" icon>If you no longer need the previous request, cancel it first and then create a new support request.</Note>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <Link href={`/dashboard/allocation-requests/${ex.id}`} target="_blank" className="inline-flex items-center gap-1.5 font-semibold text-primary underline-offset-2 hover:underline">
                                <ExternalLink className="h-4 w-4" />View Existing Request
                            </Link>
                            <div className="flex gap-2">
                                <Button variant="outline" className="h-9" onClick={onClose}>Close</Button>
                                <Button className="h-9" onClick={onAskCancel}><Trash2 className="mr-1.5 h-4 w-4" />Cancel Existing Request</Button>
                            </div>
                        </div>
                    </>
                )}

                {step === "confirm" && (
                    <>
                        <Head icon={<Trash2 className="h-5 w-5" />} tone="red" title="Cancel Existing Support Request?" />
                        <Note tone="pink">Canceling the existing request will allow you to raise a new support ticket for the newly selected date range.</Note>
                        <Box icon={<CalendarDays />} title="Previous Request Details">
                            <Row label="Request ID" value={ex.ticket_no} />
                            <Row label="Request Type" value={type} />
                            <Row label="Previous Requested Dates" value={prettyRange(ex.start_date, ex.end_date)} />
                            <Row label="Unavailable Date" value={<Pill tone="red">{exDates}</Pill>} />
                            <Row label="Status" value={<Pill tone="amber"><Clock className="h-3 w-3" />Pending</Pill>} />
                        </Box>
                        <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            This action will remove the pending {ex.contact_method === "call" ? "callback" : "email"} request and its support queue position.
                        </p>
                        <Note tone="muted" icon>You can create a new support request immediately after cancellation.</Note>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <Button variant="outline" className="h-10" disabled={cancelling} onClick={onKeep}>Keep Existing Request</Button>
                            <Button className="h-10" disabled={cancelling} onClick={onConfirmCancel}>
                                <Trash2 className="mr-1.5 h-4 w-4" />{cancelling ? "Cancelling..." : "Yes, Cancel Request"}
                            </Button>
                        </div>
                    </>
                )}

                {step === "cancelled" && (
                    <>
                        <Head icon={<CheckCircle2 className="h-5 w-5" />} tone="green" title="Previous Request Cancelled Successfully" />
                        <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-900">Your previous support request for {exDates} has been canceled. You can now raise a new ticket for the currently selected dates.</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Box icon={<FileText />} title="Canceled Request">
                                <Row label="Request ID" value={ex.ticket_no} />
                                <Row label="Type" value={type} />
                                <Row label="Canceled Date" value={today} />
                                <Row label="Unavailable Date" value={<Pill tone="red">{exDates}</Pill>} />
                            </Box>
                            <Box icon={<CalendarDays />} title="New Selection Ready">
                                <Row label="Current Requested Dates" value={prettyRange(start, end)} />
                                <Row label="Conflict Date" value={<Pill tone="red">{exDates}</Pill>} />
                                <Row label="Support Option" value={<Pill tone="red"><Headphones className="h-3 w-3" />Required</Pill>} />
                            </Box>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <Link href="/dashboard/allocation-requests" target="_blank" className="inline-flex items-center gap-1.5 font-semibold text-primary underline-offset-2 hover:underline">
                                <ExternalLink className="h-4 w-4" />View Request History
                            </Link>
                            <div className="flex gap-2">
                                <Button variant="outline" className="h-9" onClick={onClose}>Close</Button>
                                <Button className="h-9" onClick={onCreateNew}><PlusCircle className="mr-1.5 h-4 w-4" />Create New Support Request</Button>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function Head({ icon, tone, title }: { icon: React.ReactNode; tone: "red" | "green"; title: string }) {
    return (
        <div className="flex items-center gap-3 pr-6">
            <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", tone === "red" ? "bg-red-50 text-red-600" : "bg-emerald-100 text-emerald-600")}>{icon}</span>
            <DialogTitle className="text-[18px] font-bold">{title}</DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
        </div>
    );
}

function Note({ tone, icon, children }: { tone: "pink" | "muted"; icon?: boolean; children: React.ReactNode }) {
    return (
        <p className={cn("flex items-start gap-2 rounded-md px-3 py-2", tone === "pink" ? "bg-primary/5 text-foreground" : "bg-muted/50")}>
            {icon && <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            <span>{children}</span>
        </p>
    );
}

function Box({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <div className="overflow-hidden rounded-lg border">
            <p className="flex items-center gap-2 border-b bg-primary/5 px-3 py-2 text-[14px] font-semibold [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-primary">{icon}{title}</p>
            <dl className="divide-y px-3">{children}</dl>
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 py-1.5">
            <dt className="text-[12px] font-medium text-muted-foreground">{label}</dt>
            <dd className="text-right text-[12.5px] font-medium">{value}</dd>
        </div>
    );
}

function Pill({ tone, children }: { tone: "red" | "amber"; children: React.ReactNode }) {
    return (
        <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-semibold", tone === "red" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700")}>{children}</span>
    );
}
