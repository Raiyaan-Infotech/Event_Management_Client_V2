"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
    ArrowDown, ArrowLeft, ArrowUp, BarChart3, CalendarDays, CheckCircle2, Clock, Download, ExternalLink, FileText,
    Hourglass, Info, ListChecks, Mail, MailCheck, MailOpen, MapPin, MessageCircle, MessageSquare, MoreVertical,
    MousePointerClick, Pencil, PlayCircle, Sparkles, TrendingUp, UserCog, Users, XCircle,
    type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EventThumbnail } from "@/components/common/event-thumbnail";
import { eventCustomImage } from "@/lib/event-templates";
import { cn } from "@/lib/utils";
import { useClientEvent, type DerivedStatus } from "@/hooks/use-client-events";
import { useRsvpBoard } from "@/hooks/use-rsvp-board";
import { useCampaigns } from "@/hooks/use-messages";
import { useDownloads } from "@/hooks/use-event-engagement";
import { useDownloadLogs } from "@/hooks/use-event-download-logs";

/**
 * Event Analytics — the mockup's structure (Jamal, 2026-11-17), portal only, no new endpoint:
 *
 *   header + event card   GET /client/events/:id
 *   guests / RSVP figures GET /client/events/:id/rsvp-board (all rows: the trend is built from response dates)
 *   messages              GET /client/messages?event_id=   (this event's campaigns, summed)
 *   downloads             GET /client/events/:id/downloads (+ /download-logs for people who downloaded)
 *
 * A figure the server does not record ("Viewed Details", message clicks per event) shows an
 * em dash — never a made-up number or a 0.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;
const GREEN = "#16A34A", AMBER = "#EAB308", ROSE = "#F43F5E", PURPLE = "#A855F7";

const STATUS: Record<DerivedStatus, { label: string; cls: string; Icon: LucideIcon }> = {
    live: { label: "Current", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: PlayCircle },
    upcoming: { label: "Upcoming", cls: "bg-sky-50 text-sky-700 border-sky-200", Icon: Clock },
    past: { label: "Completed", cls: "bg-muted text-muted-foreground border-border", Icon: CheckCircle2 },
    draft: { label: "Draft", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Pencil },
    cancelled: { label: "Cancelled", cls: "bg-red-50 text-red-600 border-red-200", Icon: XCircle },
};

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString());
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const withPct = (n: number | null, total: number) => (n === null ? "—" : `${fmt(n)} (${pct(n, total)}%)`);

function prettyDate(d: string | null) {
    if (!d) return "Date not set";
    const [y, m, day] = d.split("-").map(Number);
    const wd = DAYS[new Date(y, (m || 1) - 1, day || 1).getDay()];
    return `${String(day).padStart(2, "0")} ${MONTHS[(m || 1) - 1]} ${y} (${wd})`;
}
function prettyTime(t: string | null) {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h)) return null;
    return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
const ms = (v: string | null | undefined) => { const t = v ? new Date(v).getTime() : NaN; return Number.isNaN(t) ? null : t; };

export function EventAnalyticsView({ eventId }: { eventId: number }) {
    const [bucket, setBucket] = useState<"week" | "day">("week");

    const event = useClientEvent(eventId);
    const board = useRsvpBoard(eventId, { limit: "all", show_uninvited: true });
    const campaigns = useCampaigns({ event_id: eventId, limit: 100 });
    const files = useDownloads(eventId);
    const logs = useDownloadLogs(eventId, { page: 1, limit: 1 });

    const e = event.data;
    const stats = board.data?.stats;
    const rows = board.data?.rows;

    /* ── Guests / RSVP ── */
    const total = stats?.total_guests ?? 0;
    const confirmed = stats?.confirmed ?? 0;
    const declined = stats?.declined ?? 0;
    const pending = Math.max(0, total - confirmed - declined);   // Maybe / not answered / not invited yet
    const responded = confirmed + declined;
    const rate = pct(responded, total);

    /* One point per guest: when they were added, and when (and what) they answered. */
    const points = useMemo(() => (rows ?? []).map((r) => {
        const added = ms(r.created_at) ?? 0;
        const answered = r.rsvp.state === "confirmed" || r.rsvp.state === "declined";
        return { added, state: r.rsvp.state, at: answered ? (ms(r.rsvp.responded_at) ?? ms(r.invited_at) ?? added) : null };
    }), [rows]);

    const trend = useMemo(() => {
        if (!points.length) return [];
        // eslint-disable-next-line react-hooks/purity -- "now" is the right edge of the chart
        const now = Date.now();
        const first = Math.min(...points.map((p) => p.added || now));
        const step = bucket === "week" ? 7 * DAY_MS : DAY_MS;
        const max = bucket === "week" ? 8 : 14;
        const ends: number[] = [];
        for (let t = now; ends.length < max && (t > first || ends.length < 2); t -= step) ends.unshift(t);
        return ends.map((end, i) => {
            const d = new Date(end);
            const c = points.filter((p) => p.state === "confirmed" && p.at !== null && p.at <= end).length;
            const x = points.filter((p) => p.state === "declined" && p.at !== null && p.at <= end).length;
            const added = points.filter((p) => p.added <= end).length;
            return {
                name: bucket === "week" ? `W${i + 1} (${d.getDate()} ${MONTHS[d.getMonth()]})` : `${d.getDate()} ${MONTHS[d.getMonth()]}`,
                Confirmed: c, Declined: x, Pending: Math.max(0, added - c - x),
            };
        });
    }, [points, bucket]);

    /* Response rate now against 7 days ago, in percentage points. Null = nobody was on the list then. */
    const delta = useMemo(() => {
        if (!points.length) return null;
        // eslint-disable-next-line react-hooks/purity
        const then = Date.now() - 7 * DAY_MS;
        const had = points.filter((p) => p.added <= then).length;
        if (!had) return null;
        const answered = points.filter((p) => p.at !== null && p.at <= then).length;
        return rate - pct(answered, had);
    }, [points, rate]);

    /* ── Engagement ── */
    const opened = rows ? rows.filter((r) => r.rsvp.joined).length : null;
    const downloaders = logs.data?.stats.unique_downloaders ?? null;

    /* ── Messages: this event's campaigns, summed ── */
    const msg = useMemo(() => {
        const list = campaigns.data?.campaigns;
        if (!list) return null;
        const sent = list.filter((c) => c.status === "sent" || c.status === "sending");
        return {
            total: sent.reduce((n, c) => n + (c.delivery?.total ?? c.recipients_count ?? 0), 0),
            delivered: sent.reduce((n, c) => n + (c.delivery?.delivered ?? 0), 0),
            opened: sent.reduce((n, c) => n + (c.delivery?.opened ?? 0), 0),
        };
    }, [campaigns.data]);

    /* ── Downloads ── */
    const dl = useMemo(() => {
        const list = files.data?.downloads;
        if (!list) return null;
        const top = [...list].sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0));
        return { total: files.data?.counts?.downloads ?? list.reduce((n, f) => n + (f.download_count ?? 0), 0), top: top.slice(0, 3) };
    }, [files.data]);

    const rsvpSlices = [
        { key: "Confirmed", value: confirmed, color: GREEN },
        { key: "Pending", value: pending, color: AMBER },
        { key: "Declined", value: declined, color: ROSE },
    ];

    const insights = useMemo(() => {
        const out: { Icon: LucideIcon; cls: string; title: string; text: string }[] = [];
        if (total > 0) {
            out.push({
                Icon: TrendingUp, cls: "bg-emerald-50 text-emerald-600", title: rate >= 50 ? "High Response Rate" : "Response Rate",
                text: `${rate}% of guests have responded${delta ? `, ${delta > 0 ? "up" : "down"} by ${Math.abs(delta)} percentage points` : ""}.`,
            });
            if (opened) out.push({ Icon: Users, cls: "bg-violet-50 text-violet-600", title: "Guest Engagement", text: `${pct(opened, total)}% of guests opened the event in the app.` });
        }
        if (msg && msg.delivered > 0) out.push({ Icon: MessageCircle, cls: "bg-sky-50 text-sky-600", title: "Message Reach", text: `${pct(msg.opened, msg.delivered)}% of delivered messages were opened.` });
        if (pending > 0) out.push({ Icon: Hourglass, cls: "bg-amber-50 text-amber-600", title: "Follow Up Pending", text: `${fmt(pending)} guests (${pct(pending, total)}%) haven't responded yet. Consider a reminder.` });
        if (dl && dl.total > 0 && dl.top[0]) out.push({ Icon: Download, cls: "bg-rose-50 text-rose-600", title: "Download Interest", text: `${fmt(dl.total)} downloads, mainly ${dl.top[0].title} (${fmt(dl.top[0].download_count ?? 0)}).` });
        return out;
    }, [total, rate, delta, opened, msg, pending, dl]);

    if (event.isError) {
        return (
            <Card className="items-center gap-2 rounded-lg border py-16 text-center shadow-none">
                <p className="text-[14px] font-semibold text-foreground">Could not load this event</p>
                <p className="text-[12.5px] text-muted-foreground">{event.error instanceof Error ? event.error.message : "Please try again."}</p>
                <Button asChild variant="outline" size="sm" className="mt-2 h-8"><Link href="/dashboard">Back to Dashboard</Link></Button>
            </Card>
        );
    }

    const st = e ? STATUS[e.derived_status] ?? STATUS.upcoming : null;
    const time = e ? [prettyTime(e.start_time), prettyTime(e.end_time)].filter(Boolean).join(" – ") : "";
    const ws = (tab?: string) => `/event/${eventId}${tab ? `?tab=${tab}` : ""}`;
    const loading = board.isLoading;

    const tiles = [
        { label: "Total Guests", value: fmt(total), Icon: Users, cls: "bg-indigo-50 text-indigo-600" },
        { label: "Confirmed", value: fmt(confirmed), extra: `(${pct(confirmed, total)}%)`, Icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-600" },
        { label: "Pending", value: fmt(pending), extra: `(${pct(pending, total)}%)`, Icon: Hourglass, cls: "bg-amber-50 text-amber-600" },
        { label: "Declined", value: fmt(declined), extra: `(${pct(declined, total)}%)`, Icon: XCircle, cls: "bg-rose-50 text-rose-600" },
        { label: "Messages Sent", value: fmt(msg?.total), Icon: MessageCircle, cls: "bg-violet-50 text-violet-600", busy: campaigns.isLoading },
        { label: "Downloads", value: fmt(dl?.total), Icon: Download, cls: "bg-sky-50 text-sky-600", busy: files.isLoading },
    ];

    const TABS: { label: string; Icon: LucideIcon; tab?: string }[] = [
        { label: "Analytics", Icon: BarChart3 },
        { label: "Event Details", Icon: CalendarDays, tab: "information" },
        { label: "Guest List", Icon: Users, tab: "guests" },
        { label: "RSVPs", Icon: ListChecks, tab: "rsvps" },
        { label: "Messages", Icon: MessageSquare, tab: "messages" },
        { label: "Downloads", Icon: Download, tab: "downloads" },
    ];

    return (
        <div className="flex flex-col gap-3">
            {/* Title row */}
            <div className="flex flex-wrap items-center gap-3">
                <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-[12px]">
                    <Link href={ws()}><ArrowLeft className="h-3.5 w-3.5" />Back to Event</Link>
                </Button>
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><BarChart3 className="h-4 w-4" /></span>
                    <div className="min-w-0">
                        <h1 className="text-[18px] font-bold leading-tight text-foreground">Event Analytics</h1>
                        <p className="text-[12px] text-muted-foreground">Track performance, guest responses, engagement, and event activity for your event.</p>
                    </div>
                </div>
            </div>

            {/* Event card */}
            <div className="flex flex-col gap-3 rounded-lg border border-primary/15 bg-gradient-to-r from-primary/[0.07] via-primary/[0.03] to-primary/[0.07] p-3 lg:flex-row lg:items-center">
                {e ? (
                    <EventThumbnail
                        themeId={e.theme_id} customImage={eventCustomImage(e)} name={e.name} primaryColor={e.primary_color}
                        startDate={e.start_date} venueName={e.venue_name}
                        className="h-[72px] w-full shrink-0 rounded-md border border-primary/10 lg:w-[96px]"
                    />
                ) : <Skeleton className="h-[72px] w-full shrink-0 rounded-md lg:w-[96px]" />}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {e && st ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="break-words text-[18px] font-bold leading-tight text-foreground">{e.name}</h2>
                                <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", st.cls)}><st.Icon className="h-3.5 w-3.5" />{st.label}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-foreground">
                                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />{prettyDate(e.start_date)}</span>
                                {time && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{time}</span>}
                                <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{e.venue_name || "Venue not set"}</span></span>
                            </div>
                        </>
                    ) : <><Skeleton className="h-6 w-[240px]" /><Skeleton className="h-4 w-[320px]" /></>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <HeaderLink href={ws()} Icon={ExternalLink} label="View Event" />
                    <HeaderLink href={ws("guests")} Icon={UserCog} label="Manage Guests" />
                    <HeaderLink href={ws("messages")} Icon={Mail} label="Send Message" />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8 border-primary/30 bg-card text-primary hover:bg-primary/5 hover:text-primary" aria-label="More actions"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[170px]">
                            <DropdownMenuItem asChild><Link href={`/dashboard/events/${eventId}/edit`}><Pencil />Edit Event</Link></DropdownMenuItem>
                            <DropdownMenuItem asChild><Link href={ws("rsvps")} target="_blank" rel="noopener"><ListChecks />View RSVPs</Link></DropdownMenuItem>
                            <DropdownMenuItem asChild><Link href={ws("downloads")} target="_blank" rel="noopener"><Download />Downloads</Link></DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Tabs — Analytics is this page; the others are the event's own sections */}
            <div className="flex gap-1 overflow-x-auto border-b">
                {TABS.map((t) => t.tab ? (
                    <Link key={t.label} href={ws(t.tab)} target="_blank" rel="noopener"
                        className="inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
                        <t.Icon className="h-4 w-4" />{t.label}
                    </Link>
                ) : (
                    <span key={t.label} aria-current="page" className="inline-flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 border-primary bg-primary/10 px-3 py-2 text-[12.5px] font-semibold text-primary">
                        <t.Icon className="h-4 w-4" />{t.label}
                    </span>
                ))}
            </div>

            {board.isError && (
                <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-foreground">
                    Could not load the guest figures. <button className="font-semibold text-primary hover:underline" onClick={() => board.refetch()}>Try again</button>
                </p>
            )}

            {/* Event Overview */}
            <Card className="gap-2.5 rounded-lg border p-3 shadow-none">
                <h2 className="text-[14px] font-semibold text-foreground">Event Overview</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    {tiles.map((t) => (
                        <div key={t.label} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2.5", t.cls.split(" ")[0])}>
                            <t.Icon className={cn("h-6 w-6 shrink-0", t.cls.split(" ")[1])} strokeWidth={1.8} />
                            <div className="min-w-0">
                                {loading || t.busy ? <Skeleton className="h-5 w-12" /> : (
                                    <p className="text-[18px] font-bold leading-none tabular-nums text-foreground">
                                        {t.value}{t.extra && <span className="ml-1 text-[12px] font-semibold text-muted-foreground">{t.extra}</span>}
                                    </p>
                                )}
                                <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{t.label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* RSVP Trend · Guest Engagement · Response Rate */}
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[1.25fr_1.1fr_1fr]">
                <Panel title="RSVP Trend" hint="Guests on the list and their answers, added up over time."
                    action={
                        <Select value={bucket} onValueChange={(v) => setBucket(v as "week" | "day")}>
                            <SelectTrigger className="h-7 w-[100px] text-[11.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="week">By Week</SelectItem><SelectItem value="day">By Day</SelectItem></SelectContent>
                        </Select>
                    }>
                    <div className="h-[150px]">
                        {loading ? <Skeleton className="h-full w-full" /> : !trend.length ? <Empty text="No guests yet." /> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trend} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} />
                                    <Tooltip contentStyle={{ fontSize: 12 }} />
                                    <Line type="monotone" dataKey="Confirmed" stroke={GREEN} strokeWidth={2} dot={{ r: 2.5 }} />
                                    <Line type="monotone" dataKey="Pending" stroke={AMBER} strokeWidth={2} dot={{ r: 2.5 }} />
                                    <Line type="monotone" dataKey="Declined" stroke={ROSE} strokeWidth={2} dot={{ r: 2.5 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        {rsvpSlices.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.key}</span>)}
                    </div>
                </Panel>

                <Panel title="Guest Engagement" hint="What guests did with this event. A dash means it is not recorded.">
                    <div className="flex items-center gap-4">
                        <Donut slices={[{ key: "Opened", value: opened ?? 0, color: PURPLE }, { key: "Rest", value: Math.max(0, total - (opened ?? 0)), color: "#EDE9FE" }]}
                            centre={fmt(total)} sub="Guests" loading={loading} />
                        <ul className="flex flex-1 flex-col gap-2.5 text-[12px]">
                            <Row Icon={MailOpen} cls="text-violet-600" label="Opened Event" value={withPct(opened, total)} />
                            <Row Icon={MousePointerClick} cls="text-violet-600" label="Viewed Details" value="—" title="Not recorded yet" />
                            <Row Icon={CheckCircle2} cls="text-rose-500" label="Responded (RSVP)" value={withPct(stats ? responded : null, total)} />
                            <Row Icon={Download} cls="text-sky-600" label="Clicked Downloads" value={withPct(downloaders, total)} />
                        </ul>
                    </div>
                </Panel>

                <Panel title="Response Rate" hint="Guests who answered Yes or No, out of all guests." className="lg:col-span-2 xl:col-span-1">
                    {loading ? <Skeleton className="h-[90px] w-full" /> : (
                        <>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-[30px] font-bold leading-none tabular-nums text-foreground">{rate}%</p>
                                    <p className="mt-1.5 text-[12px] text-muted-foreground">{fmt(responded)} of {fmt(total)} guests responded</p>
                                </div>
                                {delta !== null && (
                                    <div className="text-right">
                                        <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums", delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600")}>
                                            {delta >= 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}{delta >= 0 ? "+" : "−"}{Math.abs(delta)} pp
                                        </span>
                                        <p className="mt-1 text-[11px] text-muted-foreground">vs. last 7 days</p>
                                    </div>
                                )}
                            </div>
                            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} /></div>
                        </>
                    )}
                </Panel>
            </div>

            {/* Message Activity · Downloads · RSVP Breakdown */}
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[1.1fr_1.1fr_1fr]">
                <Panel title="Message Activity" hint="Messages sent for this event.">
                    <Split Icon={Mail} cls="bg-rose-50 text-rose-500" value={fmt(msg?.total)} label="Total Messages" loading={campaigns.isLoading}>
                        <Row Icon={MailCheck} cls="text-emerald-600" label="Delivered" value={msg ? withPct(msg.delivered, msg.total) : "—"} />
                        <Row Icon={MailOpen} cls="text-muted-foreground" label="Opened" value={msg ? withPct(msg.opened, msg.total) : "—"} />
                        <Row Icon={MousePointerClick} cls="text-muted-foreground" label="Clicked" value="—" title="Not recorded per event yet" />
                    </Split>
                </Panel>

                <Panel title="Downloads" hint="Files downloaded from this event's Downloads menu.">
                    <Split Icon={Download} cls="bg-sky-50 text-sky-600" value={fmt(dl?.total)} label="Total Downloads" loading={files.isLoading}>
                        {dl?.top.length ? dl.top.map((f) => (
                            <Row key={f.id} Icon={FileText} cls="text-muted-foreground" label={`${f.title}${f.file_type ? ` (${f.file_type.toUpperCase()})` : ""}`} value={fmt(f.download_count ?? 0)} />
                        )) : <li className="text-[12px] text-muted-foreground">No files added yet.</li>}
                    </Split>
                </Panel>

                <Panel title="RSVP Breakdown" className="lg:col-span-2 xl:col-span-1">
                    <div className="flex items-center gap-4">
                        <Donut slices={rsvpSlices} centre={fmt(total)} sub="Guests" loading={loading} />
                        <ul className="flex flex-1 flex-col gap-2.5 text-[12px]">
                            {rsvpSlices.map((s) => (
                                <li key={s.key} className="flex items-center justify-between gap-3">
                                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.key}</span>
                                    <span className="tabular-nums text-foreground">{fmt(s.value)} ({pct(s.value, total)}%)</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Panel>
            </div>

            {/* Useful Insights — only lines the figures above support */}
            {insights.length > 0 && (
                <Card className="gap-2.5 rounded-lg border p-3 shadow-none">
                    <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground"><Sparkles className="h-4 w-4 text-primary" />Useful Insights</h2>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        {insights.map((i) => (
                            <div key={i.title} className={cn("flex items-start gap-2.5 rounded-lg px-3 py-2.5", i.cls.split(" ")[0])}>
                                <i.Icon className={cn("mt-0.5 h-5 w-5 shrink-0", i.cls.split(" ")[1])} strokeWidth={1.8} />
                                <div className="min-w-0">
                                    <p className="text-[12.5px] font-semibold text-foreground">{i.title}</p>
                                    <p className="mt-0.5 break-words text-[11.5px] leading-snug text-muted-foreground">{i.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
}

function HeaderLink({ href, Icon, label }: { href: string; Icon: LucideIcon; label: string }) {
    return (
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 border-primary/30 bg-card text-[12px] font-semibold text-primary hover:bg-primary/5 hover:text-primary">
            <Link href={href} target="_blank" rel="noopener"><Icon className="h-3.5 w-3.5" />{label}</Link>
        </Button>
    );
}

function Panel({ title, hint, action, className, children }: { title: string; hint?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
    return (
        <Card className={cn("gap-0 rounded-lg border p-3 shadow-none", className)}>
            <div className="mb-2.5 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
                    {title}{hint && <span title={hint}><Info className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                </h2>
                {action}
            </div>
            {children}
        </Card>
    );
}

function Row({ Icon, cls, label, value, title }: { Icon: LucideIcon; cls: string; label: string; value: string; title?: string }) {
    return (
        <li className="flex items-center justify-between gap-3" title={title}>
            <span className="inline-flex min-w-0 items-center gap-2"><Icon className={cn("h-3.5 w-3.5 shrink-0", cls)} /><span className="truncate">{label}</span></span>
            <span className="shrink-0 tabular-nums text-foreground">{value}</span>
        </li>
    );
}

/** Big number on the left, a short list on the right (Message Activity, Downloads). */
function Split({ Icon, cls, value, label, loading, children }: { Icon: LucideIcon; cls: string; value: string; label: string; loading: boolean; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-4">
            <div className="flex shrink-0 items-center gap-3 border-r pr-4">
                <span className={cn("grid h-11 w-11 place-items-center rounded-lg", cls)}><Icon className="h-5 w-5" /></span>
                <div>
                    {loading ? <Skeleton className="h-6 w-10" /> : <p className="text-[22px] font-bold leading-none tabular-nums text-foreground">{value}</p>}
                    <p className="mt-1 text-[11.5px] text-muted-foreground">{label}</p>
                </div>
            </div>
            <ul className="flex min-w-0 flex-1 flex-col gap-2.5 text-[12px]">{children}</ul>
        </div>
    );
}

function Empty({ text }: { text: string }) {
    return <div className="grid h-full place-items-center text-[12px] text-muted-foreground">{text}</div>;
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
