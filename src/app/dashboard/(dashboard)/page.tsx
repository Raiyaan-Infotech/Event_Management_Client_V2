"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
    AlertTriangle, BarChart3, CalendarCheck, CalendarDays, CheckCircle2, Clock, Download, Eye,
    Hourglass, Mail, MessageCircle, MoreVertical, Pencil, PlayCircle, QrCode, Search, Share2, Trash2, Users,
    UserCog, XCircle, ListChecks, Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ShareEventDialog } from "@/components/common/share-event-dialog";
import { DeleteEventDialog } from "@/components/common/delete-event-dialog";
import {
    useClientEvents, useDashboardStats, useDeleteEvent, useUpdateEvent,
    type ClientEvent, type DerivedStatus,
} from "@/hooks/use-client-events";
import { ApiError } from "@/lib/api-client";
import { SignInPrompt } from "@/components/common/sign-in-prompt";
import { DashboardBookingState } from "./_components/dashboard-booking-state";
import { PageLoader } from "@/components/common/page-loader";

/**
 * Organizer dashboard — the client portal's first page (Jamal's design, 2026-11-13).
 *
 *   header   GET /client/me                         the signed-in client's name + photo
 *   tiles    GET /client/events/stats?year=          totals, status split, events by month
 *   table    GET /client/events?from&to&status&search  one row per event with its counts
 *
 * Every figure comes from the API. "Messages" = invitations that actually left (same meaning as
 * the event rows); "Downloads" = file downloads from the Downloads menu.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAGE_SIZE = 10;

const STATUS: Record<DerivedStatus, { label: string; cls: string; Icon: typeof PlayCircle }> = {
    live: { label: "Current", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: PlayCircle },
    upcoming: { label: "Upcoming", cls: "bg-sky-50 text-sky-700 border-sky-200", Icon: Clock },
    past: { label: "Completed", cls: "bg-muted text-muted-foreground border-border", Icon: CheckCircle2 },
    draft: { label: "Draft", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Pencil },
    cancelled: { label: "Cancelled", cls: "bg-red-50 text-red-600 border-red-200", Icon: XCircle },
};

const FILTERS: { value: "all" | DerivedStatus; label: string }[] = [
    { value: "all", label: "All Statuses" },
    { value: "live", label: "Current" },
    { value: "upcoming", label: "Upcoming" },
    { value: "past", label: "Completed" },
    { value: "draft", label: "Draft" },
];

const pretty = (d: string | null) => {
    if (!d) return "Date not set";
    const [y, m, day] = d.split("-").map(Number);
    return `${String(day).padStart(2, "0")} ${MONTHS[(m || 1) - 1]} ${y}`;
};
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();

export default function DashboardPage() {
    const router = useRouter();
    const thisYear = new Date().getFullYear();
    const [range, setRange] = useState<string>(String(thisYear));
    const [filter, setFilter] = useState<"all" | DerivedStatus>("all");
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [page, setPage] = useState(1);
    const [chartMode, setChartMode] = useState<"events" | "guests">("events");

    useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(t); }, [search]);

    const chartYear = range === "all" ? thisYear : Number(range);
    const stats = useDashboardStats(chartYear);
    const events = useClientEvents({
        status: filter,
        search: debounced || undefined,
        from: range === "all" ? undefined : `${range}-01-01`,
        to: range === "all" ? undefined : `${range}-12-31`,
        page,
        limit: PAGE_SIZE,
    });

    const remove = useDeleteEvent();
    const publish = useUpdateEvent();
    const [pendingDelete, setPendingDelete] = useState<ClientEvent | null>(null);
    const [shareFor, setShareFor] = useState<ClientEvent | null>(null);

    const s = stats.data;
    const rows = events.data?.data ?? [];
    const pagination = events.data?.pagination;
    const authError = (events.error instanceof ApiError && events.error.isAuthError) || (stats.error instanceof ApiError && stats.error.isAuthError);

    const guestSlices = [
        { key: "Confirmed", value: s?.rsvp_going ?? 0, color: "#16A34A" },
        { key: "Pending", value: s?.rsvp_pending ?? 0, color: "#EAB308" },
        { key: "Declined", value: s?.rsvp_declined ?? 0, color: "#F43F5E" },
    ];
    const statusSlices = [
        { key: "Current", value: s?.live_events ?? 0, color: "#3B82F6" },
        { key: "Upcoming", value: s?.upcoming_events ?? 0, color: "#A855F7" },
        { key: "Completed", value: s?.past_events ?? 0, color: "#E5E7EB" },
        ...(s?.draft_events ? [{ key: "Draft", value: s.draft_events, color: "#F59E0B" }] : []),
    ];
    const monthData = useMemo(
        () => (s?.events_by_month ?? Array.from({ length: 12 }, (_, i) => ({ month: i + 1, events: 0, guests: 0 })))
            .map((m) => ({ name: MONTHS[m.month - 1], value: chartMode === "events" ? m.events : m.guests })),
        [s?.events_by_month, chartMode],
    );
    const yearOptions = [thisYear - 1, thisYear, thisYear + 1];

    return (
        <div className="flex flex-col gap-4">
            {/* Saving loader for the row actions (publish / delete). */}
            <PageLoader open={publish.isPending || remove.isPending}
                text={remove.isPending ? "Deleting..." : "Publishing..."} />
            {/* Booked dates + the 4 tiles (Create Event updated v4, 2026-11-19). */}
            <DashboardBookingState loading={stats.isLoading} counts={{
                total: s?.total_events ?? 0,
                draft: s?.draft_events ?? 0,
                published: (s?.live_events ?? 0) + (s?.upcoming_events ?? 0),
                past: s?.past_events ?? 0,
            }} />

            {authError && (
                <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div>
                        <p className="text-[12.5px] font-semibold text-foreground">You are not signed in</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">Your session has ended. Sign in again to carry on.</p>
                        <SignInPrompt className="mt-2.5" />
                    </div>
                </div>
            )}

            {/* Charts + the events table: once there is an event. */}
            {(s?.total_events ?? 0) > 0 && (<>
            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr]">
                <ChartCard title="Guest Responses (All Events)">
                    <Donut slices={guestSlices} centre={fmt(s?.total_guests)} sub="Guests" loading={stats.isLoading} />
                    <Legend slices={guestSlices} total={s?.total_guests ?? 0} />
                </ChartCard>
                <ChartCard title="Event Status">
                    <Donut slices={statusSlices} centre={fmt(s?.total_events)} sub="Events" loading={stats.isLoading} />
                    <Legend slices={statusSlices} total={s?.total_events ?? 0} />
                </ChartCard>
                <Card className="gap-0 rounded-lg border p-4 shadow-none lg:col-span-2 xl:col-span-1">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <h2 className="text-[14px] font-semibold text-foreground">Events by Month <span className="text-[11.5px] font-normal text-muted-foreground">({chartYear})</span></h2>
                        <Select value={chartMode} onValueChange={(v) => setChartMode(v as "events" | "guests")}>
                            <SelectTrigger className="h-8 w-[130px] text-[12px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="events">Events Count</SelectItem>
                                <SelectItem value="guests">Guests Count</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="h-[130px]">
                        {stats.isLoading ? <Skeleton className="h-full w-full" /> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={monthData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                                    <Tooltip cursor={{ fill: "rgba(168,85,247,0.08)" }} formatter={(v: number) => [v, chartMode === "events" ? "Events" : "Guests"]} />
                                    <Bar dataKey="value" fill="#C084FC" radius={[3, 3, 0, 0]} maxBarSize={28} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </Card>
            </div>

            {/* Events overview */}
            <Card className="gap-0 rounded-lg border p-4 shadow-none">
                <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary"><CalendarDays className="h-4 w-4" /></span>
                        <h2 className="text-[14px] font-semibold text-foreground">Events Overview (All Events)</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={range} onValueChange={(v) => { setRange(v); setPage(1); }}>
                            <SelectTrigger className="h-9 w-[230px] text-[12px]">
                                <CalendarDays className="mr-1 h-4 w-4 text-muted-foreground" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>01 Jan {y} – 31 Dec {y}</SelectItem>)}
                                <SelectItem value="all">All Dates</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search event by name..." className="h-9 w-[220px] pl-9 text-[12px]" />
                        </div>
                        <Select value={filter} onValueChange={(v) => { setFilter(v as "all" | DerivedStatus); setPage(1); }}>
                            <SelectTrigger className="h-9 w-[130px] text-[12px]"><SelectValue placeholder="Filter" /></SelectTrigger>
                            <SelectContent>{FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Fits the card: no side scroll (Jamal, 2026-11-14). Small type, tight cells,
                    the RSVP key on its own line. */}
                <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-[11px]">
                        <thead className="bg-muted/40 text-left align-bottom text-[10.5px] font-semibold text-muted-foreground">
                            <tr>
                                <th className="px-2 py-2">#</th>
                                <th className="px-2 py-2">Event Name</th>
                                <th className="px-2 py-2">Event Date</th>
                                <th className="px-2 py-2">Status</th>
                                <th className="px-2 py-2">Guests</th>
                                <th className="px-2 py-2">RSVPs <span className="block text-[9.5px] font-normal">Confirmed | Pending | Declined</span></th>
                                <th className="px-2 py-2">Messages</th>
                                <th className="px-2 py-2">Downloads</th>
                                <th className="px-2 py-2">Response Rate</th>
                                <th className="px-2 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.isLoading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i} className="border-t"><td colSpan={10} className="px-3 py-2"><Skeleton className="h-5 w-full" /></td></tr>
                                ))
                            ) : events.isError && !authError ? (
                                <tr><td colSpan={10} className="py-14 text-center text-muted-foreground">
                                    Could not load your events. <button className="font-semibold text-primary hover:underline" onClick={() => events.refetch()}>Try again</button>
                                </td></tr>
                            ) : !rows.length ? (
                                <tr><td colSpan={10} className="py-14 text-center text-muted-foreground">
                                    {debounced || filter !== "all" ? "No events match these filters." : <>No events in this period. <Link href="/dashboard/events/check-availability" className="font-semibold text-primary hover:underline">Create an event</Link></>}
                                </td></tr>
                            ) : rows.map((e, i) => {
                                const st = STATUS[e.derived_status] ?? STATUS.upcoming;
                                const guests = e.guest_count ?? 0;
                                const confirmed = e.confirmed_count ?? 0;
                                const declined = e.declined_count ?? 0;
                                const rate = pct(confirmed + declined, guests);
                                return (
                                    <tr key={e.id} className="border-t hover:bg-muted/20">
                                        <td className="px-2 py-1.5 font-semibold">{(page - 1) * PAGE_SIZE + i + 1}</td>
                                        <td className="px-2 py-1.5 font-semibold text-foreground"><span className="block max-w-[150px] truncate" title={e.name}>{e.name}</span></td>
                                        <td className="whitespace-nowrap px-2 py-1.5"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />{pretty(e.start_date)}</span></td>
                                        <td className="px-2 py-1.5"><span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", st.cls)}><st.Icon className="h-3.5 w-3.5" />{st.label}</span></td>
                                        <td className="px-2 py-1.5"><span className="inline-flex items-center gap-1.5 font-semibold"><Users className="h-3.5 w-3.5 text-muted-foreground" />{fmt(guests)}</span></td>
                                        <td className="whitespace-nowrap px-2 py-1.5">
                                            <span className="inline-flex items-center gap-2.5">
                                                <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{fmt(confirmed)}</span>
                                                <span className="inline-flex items-center gap-1"><Hourglass className="h-3.5 w-3.5 text-amber-500" />{fmt(e.pending_count)}</span>
                                                <span className="inline-flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-rose-500" />{fmt(declined)}</span>
                                            </span>
                                        </td>
                                        <td className="px-2 py-1.5"><span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5 text-violet-500" />{fmt(e.messages_count)}</span></td>
                                        <td className="px-2 py-1.5"><span className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5 text-sky-600" />{fmt(e.downloads_count)}</span></td>
                                        <td className="px-2 py-1.5">
                                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                                <span className="w-8 text-right font-semibold tabular-nums">{rate}%</span>
                                                <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} /></span>
                                            </span>
                                        </td>
                                        <td className="px-2 py-1.5 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${e.name}`}><MoreVertical className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-[190px]">
                                                    <DropdownMenuItem asChild><Link href={`/event/${e.id}`} target="_blank" rel="noopener"><Eye />View Details</Link></DropdownMenuItem>
                                                    <DropdownMenuItem asChild><Link href={`/dashboard/events/${e.id}/edit`}><Pencil />Edit Event</Link></DropdownMenuItem>
                                                    <DropdownMenuItem asChild><Link href={`/event/${e.id}?tab=guests`} target="_blank" rel="noopener"><UserCog />Manage Guests</Link></DropdownMenuItem>
                                                    <DropdownMenuItem asChild><Link href={`/event/${e.id}?tab=rsvps`} target="_blank" rel="noopener"><ListChecks />View RSVPs</Link></DropdownMenuItem>
                                                    <DropdownMenuItem asChild><Link href={`/event/${e.id}?tab=messages`} target="_blank" rel="noopener"><Mail />Send Message</Link></DropdownMenuItem>
                                                    <DropdownMenuItem asChild><Link href="/dashboard/events/check-availability"><CalendarCheck />Event Availability</Link></DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => router.push(`/dashboard/events/${e.id}/analytics`)}><BarChart3 />Analytics</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setShareFor(e)}><QrCode />Download QR</DropdownMenuItem>
                                                    {e.status === "draft" && (
                                                        <DropdownMenuItem disabled={publish.isPending} onClick={() => publish.mutate({ id: e.id, data: { status: "upcoming" } })}><Rocket />Publish Event</DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => setShareFor(e)}><Share2 />Share Event</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setPendingDelete(e)}><Trash2 className="text-destructive" />Delete Event</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {pagination && pagination.totalItems > 0 && (
                    <div className="mt-4 flex flex-col gap-3 text-[12.5px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <span>Showing {(page - 1) * PAGE_SIZE + 1} – {Math.min(page * PAGE_SIZE, pagination.totalItems)} of {pagination.totalItems} events</span>
                        {pagination.totalPages > 1 && (
                            <div className="flex items-center gap-1.5">
                                <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                                <span className="px-2">Page {page} of {pagination.totalPages}</span>
                                <Button variant="outline" size="sm" className="h-8" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                            </div>
                        )}
                    </div>
                )}
            </Card>

            </>)}

            {/* Share Event / Download QR — link, QR, share via, guests */}
            <ShareEventDialog event={shareFor} onClose={() => setShareFor(null)} />

            {/* Delete Event — centre popup, same look as Share Event */}
            <DeleteEventDialog event={pendingDelete} busy={remove.isPending} onClose={() => setPendingDelete(null)}
                // onSettled: a failed delete must close the popup too.
                onConfirm={(e) => remove.mutate(e.id, { onSettled: () => setPendingDelete(null) })} />
        </div>
    );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card className="gap-0 rounded-lg border p-4 shadow-none">
            <h2 className="mb-2 text-[14px] font-semibold text-foreground">{title}</h2>
            <div className="flex items-center gap-4">{children}</div>
        </Card>
    );
}

function Donut({ slices, centre, sub, loading }: { slices: { key: string; value: number; color: string }[]; centre: string; sub: string; loading: boolean }) {
    const any = slices.some((x) => x.value > 0);
    return (
        <div className="relative h-[120px] w-[120px] shrink-0">
            {loading ? <Skeleton className="h-full w-full rounded-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={any ? slices : [{ key: "none", value: 1, color: "#E5E7EB" }]} dataKey="value" innerRadius={42} outerRadius={58} paddingAngle={any ? 1 : 0} stroke="none" startAngle={90} endAngle={-270}>
                            {(any ? slices : [{ color: "#E5E7EB" }]).map((x, i) => <Cell key={i} fill={x.color} />)}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            )}
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div><p className="text-[17px] font-bold leading-none text-foreground">{centre}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p></div>
            </div>
        </div>
    );
}

function Legend({ slices, total }: { slices: { key: string; value: number; color: string }[]; total: number }) {
    return (
        <ul className="flex flex-1 flex-col gap-2 text-[12px]">
            {slices.map((x) => (
                <li key={x.key} className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />{x.key}</span>
                    <span className="tabular-nums text-foreground">{fmt(x.value)} ({pct(x.value, total)}%)</span>
                </li>
            ))}
        </ul>
    );
}
