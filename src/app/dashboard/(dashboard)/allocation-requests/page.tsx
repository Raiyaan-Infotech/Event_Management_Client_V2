"use client";

import Link from "next/link";
import { CalendarRange, Eye, Inbox, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyAllocationRequests } from "@/hooks/use-event-availability";
import { RequestStatusChip, prettyDate, prettyDateTime, prettyRange } from "./shared";

/**
 * Allocation Requests — the client's own Contact Support requests for unavailable dates
 * (Jamal's designs Organizer\Event Allocation, 2026-11-14). Each opens its Tracking / Approved /
 * Rejected page.
 */
export default function AllocationRequestsPage() {
    const { data, isLoading, isError, refetch } = useMyAllocationRequests();
    const rows = data ?? [];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-[20px] font-bold leading-tight text-foreground">Allocation Requests</h1>
                    <p className="text-[12.5px] text-muted-foreground">Track the requests you sent to the support team for unavailable event dates.</p>
                </div>
                <Button asChild className="h-9 text-[12.5px] font-semibold">
                    <Link href="/dashboard/events/check-availability"><CalendarRange className="mr-1.5 h-4 w-4" />Check Event Availability</Link>
                </Button>
            </div>

            <Card className="gap-0 rounded-lg border p-4 shadow-none">
                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full whitespace-nowrap text-[12.5px]">
                        <thead className="bg-muted/40 text-left text-[11.5px] font-semibold text-muted-foreground">
                            <tr>{["Request ID", "Requested Dates", "Unavailable", "Contact", "Status", "Submitted", ""].map((h) => <th key={h} className="px-2.5 py-2.5">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => <tr key={i} className="border-t"><td colSpan={7} className="px-2.5 py-2"><Skeleton className="h-5 w-full" /></td></tr>)
                            ) : isError ? (
                                <tr><td colSpan={7} className="py-14 text-center text-muted-foreground">Could not load your requests. <button className="font-semibold text-primary hover:underline" onClick={() => refetch()}>Try again</button></td></tr>
                            ) : !rows.length ? (
                                <tr><td colSpan={7} className="py-14 text-center text-muted-foreground">
                                    <Inbox className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
                                    No requests yet. When a date you need is unavailable, use <b>Contact Support</b> on Check Event Availability.
                                </td></tr>
                            ) : rows.map((r) => (
                                <tr key={r.id} className="border-t hover:bg-muted/20">
                                    <td className="px-2.5 py-2 font-semibold"><Link href={`/dashboard/allocation-requests/${r.id}`} className="text-primary hover:underline">{r.ticket_no}</Link></td>
                                    <td className="px-2.5 py-2">{prettyRange(r.start_date, r.end_date)}<span className="ml-1.5 text-[11px] text-muted-foreground">{r.booking_type === "multiple" ? "Multi Date" : "Single Date"}</span></td>
                                    <td className="px-2.5 py-2">
                                        <span className="flex gap-1">
                                            {r.unavailable_dates.slice(0, 2).map((u) => <span key={u.date} className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">{prettyDate(u.date)}</span>)}
                                            {r.unavailable_dates.length > 2 && <span className="text-[11px] text-muted-foreground">+{r.unavailable_dates.length - 2}</span>}
                                        </span>
                                    </td>
                                    <td className="px-2.5 py-2"><span className="inline-flex items-center gap-1">{r.contact_method === "call" ? <><Phone className="h-3.5 w-3.5" />Call back</> : <><Mail className="h-3.5 w-3.5" />Email</>}</span></td>
                                    <td className="px-2.5 py-2"><RequestStatusChip status={r.status} /></td>
                                    <td className="px-2.5 py-2 text-muted-foreground">{prettyDateTime(r.created_at)}</td>
                                    <td className="px-2.5 py-2 text-right">
                                        <Button asChild variant="outline" size="sm" className="h-7 text-[11.5px]"><Link href={`/dashboard/allocation-requests/${r.id}`}><Eye className="mr-1 h-3.5 w-3.5" />View</Link></Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
