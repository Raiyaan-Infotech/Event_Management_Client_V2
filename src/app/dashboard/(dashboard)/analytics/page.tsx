"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faUsers,
    faCircleCheck,
    faEnvelope,
    faEnvelopeOpenText,
    faReply,
    faArrowPointer,
    faCalendarDays,
    faDownload,
    faArrowRight,
    faArrowUp,
    faArrowDown,
    faArrowTrendUp,
    faLink,
    faTriangleExclamation,
    faChartPie,
    faCommentSms,
} from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp as faWhatsappBrand } from "@fortawesome/free-brands-svg-icons";
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { EventThumbnail } from "@/components/common/event-thumbnail";
import {
    useEventAnalytics,
    type EventAnalytics,
    type RsvpStatus,
    type MessageChannel,
    type InviteSource,
} from "@/hooks/use-client-events";
import { ApiError } from "@/lib/api-client";
import { SignInPrompt } from '@/components/common/sign-in-prompt';

/**
 * Analytics — built to the supplied design, backed by real tables.
 *
 * `event_guests` and `event_messages` were created for this screen, so every
 * figure below is an aggregate over rows rather than a constant. The API owns
 * the arithmetic; this file only lays it out.
 *
 * ── THE ONE RULE THAT MATTERS HERE ───────────────────────────────────────────
 * `null` is not zero. A rate comes back null when its denominator was zero, and
 * SMS open/click are null ALWAYS — there is no pixel and no link wrapper, so an
 * open is unknowable rather than absent. Every null renders as an em dash,
 * exactly as the design's SMS row shows. Printing 0% would claim nobody opened
 * it, which is a different statement.
 *
 * The wording is the design's, not mine: "Total RSVPs", "RSVP Status Overview",
 * "RSVP Trend", "Response Rate". RSVP and guest are different counts — a guest
 * row can cover a party of four, so Total Guests (heads) is larger than Total
 * RSVPs (invitations). Do not swap the labels.
 */

const RSVP_META: Record<RsvpStatus, { label: string; color: string }> = {
    attending: { label: "Attending", color: "#22C55E" },
    not_attending: { label: "Not Attending", color: "#F59E0B" },
    maybe: { label: "Maybe", color: "#A78BFA" },
    no_response: { label: "No Response", color: "#CBD5E1" },
};

const CHANNEL_META: Record<MessageChannel, { label: string; color: string; icon: typeof faEnvelope }> = {
    whatsapp: { label: "WhatsApp", color: "#22C55E", icon: faWhatsappBrand },
    email: { label: "Email", color: "#3B82F6", icon: faEnvelope },
    sms: { label: "SMS", color: "#A78BFA", icon: faCommentSms },
};

const SOURCE_META: Record<InviteSource, { label: string; color: string }> = {
    whatsapp: { label: "WhatsApp Invite", color: "#22C55E" },
    email: { label: "Email Invite", color: "#3B82F6" },
    sms: { label: "SMS Invite", color: "#A78BFA" },
    manual: { label: "Manual / Other", color: "#CBD5E1" },
    import: { label: "Imported", color: "#F59E0B" },
};

/**
 * Looks up a key in one of the three maps above, and never throws.
 *
 * ── ⚠ WHY THIS EXISTS ────────────────────────────────────────────────────────
 * A raw `metaOf(SOURCE_META, row.key)` crashed the whole page once with "undefined is
 * not an object" — not reproducible on demand, only ever seen once under heavy
 * concurrent load, and the live API was independently confirmed to return only
 * the five keys this map already covers. The trigger was never pinned down.
 *
 * That is exactly the situation this guards against: these three maps happen
 * to mirror the backend's enums TODAY. "Happens to mirror" is not a guarantee
 * — a value added to one side before the other catches up is a real, if rare,
 * gap, and a crashed blank page is a strictly worse failure than a row that
 * reads "Unknown".
 */
const UNKNOWN_META = { label: "Unknown", color: "#94A3B8" };
function metaOf<T extends { label: string; color: string }>(
    map: Record<string, T>,
    key: string,
): T {
    return map[key] ?? (UNKNOWN_META as T);
}

const RANGES = [
    { value: "7", label: "Last 7 days" },
    { value: "31", label: "Last 31 days" },
    { value: "90", label: "Last 90 days" },
    { value: "365", label: "Last 12 months" },
];

const trendConfig = {
    attending: { label: "Attending", color: "#22C55E" },
    not_attending: { label: "Not Attending", color: "#F59E0B" },
    maybe: { label: "Maybe", color: "#A78BFA" },
    no_response: { label: "No Response", color: "#CBD5E1" },
} satisfies ChartConfig;

/** A rate, or the design's em dash when it is unknowable. */
const pct = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : `${value}%`;

/** "24 Apr – 24 May 2025" from the API's ISO bounds. */
function rangeLabel(from: string, to: string): string {
    const parse = (iso: string) => {
        const [y, m, d] = iso.split("-").map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    };
    const a = parse(from);
    const b = parse(to);
    const short = (d: Date) => `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
    return `${short(a)} – ${short(b)} ${b.getFullYear()}`;
}

export default function AnalyticsPage() {
    const [days, setDays] = useState("31");
    const analytics = useEventAnalytics(Number(days));
    const data = analytics.data;

    const rsvpSlices = useMemo(
        () =>
            (data?.rsvp_breakdown ?? [])
                // Recharts renders a zero slice as an invisible wedge that still
                // owns a tooltip target.
                .filter((r) => r.count > 0)
                .map((r) => ({ ...r, name: metaOf(RSVP_META, r.key).label, fill: metaOf(RSVP_META, r.key).color })),
        [data]
    );

    const channelSlices = useMemo(
        () =>
            (data?.messages_by_channel ?? [])
                .filter((c) => c.sent > 0)
                .map((c) => ({ ...c, name: metaOf(CHANNEL_META, c.key).label, fill: metaOf(CHANNEL_META, c.key).color })),
        [data]
    );

    const exportCsv = () => {
        if (!data) return;
        const rows: string[][] = [
            ["Section", "Label", "Value"],
            ["Totals", "Total Guests", String(data.totals.total_guests)],
            ["Totals", "Total RSVPs", String(data.totals.total_rsvps)],
            ["Totals", "Messages Sent", String(data.totals.messages_sent)],
            ["Totals", "Message Open Rate", pct(data.totals.open_rate)],
            ["Totals", "Response Rate", pct(data.totals.response_rate)],
            ["Totals", "Link Click Rate", pct(data.totals.click_rate)],
            ...data.rsvp_breakdown.map((r) => ["RSVP", metaOf(RSVP_META, r.key).label, `${r.count} (${r.percent}%)`]),
            ...data.messages_by_channel.map((c) => [
                "Channel", metaOf(CHANNEL_META, c.key).label,
                `sent ${c.sent}, delivered ${c.delivered}, open ${pct(c.open_rate)}, click ${pct(c.click_rate)}`,
            ]),
            ...data.engagement_by_source.map((s) => ["Source", metaOf(SOURCE_META, s.key).label, `${s.count} (${s.percent}%)`]),
            ...data.top_events.map((e) => [
                "Event", e.name,
                `guests ${e.guests}, rsvp ${pct(e.rsvp_rate)}, response ${pct(e.response_rate)}`,
            ]),
        ];
        // Quote every field and double inner quotes — an event named
        // `Ravi's "Big Day", Delhi` would otherwise shift every later column.
        const csv = rows
            .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
            .join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `analytics-${data.period.from}-to-${data.period.to}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Report exported");
    };

    if (analytics.isLoading) {
        return (
            <div className="flex flex-col gap-5">
                <Skeleton className="h-9 w-[180px]" />
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[96px] rounded-xl" />)}
                </div>
                <div className="grid gap-5 lg:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[280px] rounded-xl" />)}
                </div>
            </div>
        );
    }

    if (analytics.isError || !data) {
        const isAuth = analytics.error instanceof ApiError && analytics.error.isAuthError;
        return (
            <Card className="border border-border shadow-none py-0">
                <CardContent className="flex flex-col items-center gap-2 py-20 text-center">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="!size-[26px] text-warning/60" />
                    <p className="text-[15px] font-semibold text-foreground">
                        {isAuth ? "You are not signed in" : "Could not load analytics"}
                    </p>
                    <p className="max-w-sm text-[13px] text-muted-foreground">
                        {isAuth
                            ? "Your session has ended. Sign in again to carry on."
                            : analytics.error instanceof Error ? analytics.error.message : "Unknown error."}
                    </p>
                    {isAuth && <SignInPrompt className="mt-2" />}
                </CardContent>
            </Card>
        );
    }

    const { totals, deltas, period } = data;
    const hasData = totals.total_rsvps > 0 || totals.messages_sent > 0;

    const tiles = [
        { label: "Total Guests", value: totals.total_guests.toLocaleString(), delta: deltas.total_guests, icon: faUsers, color: "#7C5AED", bg: "bg-[#7C5AED]/10" },
        { label: "Total RSVPs", value: totals.total_rsvps.toLocaleString(), delta: deltas.total_rsvps, icon: faCircleCheck, color: "#22C55E", bg: "bg-[#22C55E]/10" },
        { label: "Messages Sent", value: totals.messages_sent.toLocaleString(), delta: deltas.messages_sent, icon: faEnvelope, color: "#3B82F6", bg: "bg-[#3B82F6]/10" },
        { label: "Message Open Rate", value: pct(totals.open_rate), delta: deltas.open_rate, icon: faEnvelopeOpenText, color: "#F59E0B", bg: "bg-[#F59E0B]/10" },
        { label: "Response Rate", value: pct(totals.response_rate), delta: deltas.response_rate, icon: faReply, color: "#EC4899", bg: "bg-[#EC4899]/10" },
        { label: "Link Click Rate", value: pct(totals.click_rate), delta: deltas.click_rate, icon: faArrowPointer, color: "#06B6D4", bg: "bg-[#06B6D4]/10" },
    ];

    return (
        <div className="flex flex-col gap-5">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">Analytics</h1>
                    <p className="mt-1 text-[13.5px] text-muted-foreground">
                        Track the performance of your events, RSVPs and messages.
                    </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select value={days} onValueChange={setDays}>
                        <SelectTrigger className="h-10 w-full rounded-md text-[13px] sm:w-[210px]">
                            <FontAwesomeIcon icon={faCalendarDays} className="mr-2 !size-[12px] text-muted-foreground" />
                            {/* The trigger shows the resolved dates, as the design
                                does — "Last 31 days" is the option, the range is
                                what you are actually looking at. */}
                            <span className="truncate">{rangeLabel(period.from, period.to)}</span>
                        </SelectTrigger>
                        <SelectContent>
                            {RANGES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        onClick={exportCsv}
                        className="h-10 shrink-0 rounded-md px-4 text-[12.5px] font-semibold"
                    >
                        <FontAwesomeIcon icon={faDownload} className="mr-2 !size-[12px]" />
                        Export Report
                    </Button>
                </div>
            </div>

            {/* ── Six tiles ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                {tiles.map((tile) => (
                    <Card key={tile.label} className="min-w-0 border border-border shadow-none py-0">
                        <CardContent className="flex flex-col gap-2.5 p-4">
                            <div className="flex items-center gap-2.5">
                                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", tile.bg)}>
                                    <FontAwesomeIcon icon={tile.icon} className="!size-[13px]" style={{ color: tile.color }} />
                                </span>
                                <p className="min-w-0 text-[12px] font-medium text-muted-foreground break-words">
                                    {tile.label}
                                </p>
                            </div>

                            <p className="text-[24px] font-bold leading-none tabular-nums text-foreground">
                                {tile.value}
                            </p>

                            <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                                {tile.delta === null ? (
                                    // No prior period is not a 0% change. Saying so
                                    // beats a grey arrow that implies flat growth.
                                    <span className="break-words">No prior period to compare</span>
                                ) : (
                                    <>
                                        <span
                                            className={cn(
                                                "inline-flex items-center gap-1 font-semibold tabular-nums",
                                                tile.delta >= 0 ? "text-success" : "text-destructive"
                                            )}
                                        >
                                            <FontAwesomeIcon
                                                icon={tile.delta >= 0 ? faArrowUp : faArrowDown}
                                                className="!size-[8px]"
                                            />
                                            {Math.abs(tile.delta)}%
                                        </span>
                                        <span className="break-words">vs previous {period.days} days</span>
                                    </>
                                )}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {!hasData ? (
                <Card className="border border-border shadow-none py-0">
                    <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                        <FontAwesomeIcon icon={faChartPie} className="!size-[26px] text-muted-foreground/40" />
                        <p className="text-[14px] font-semibold text-foreground">No RSVPs yet</p>
                        <p className="max-w-sm text-[13px] text-muted-foreground">
                            Once you invite guests to an event, their responses and your message
                            performance appear here.
                        </p>
                        <Button asChild size="sm" className="mt-2 h-8 text-[12px]">
                            <Link href="/dashboard/events">Go to My Events</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* ── RSVP overview · trend · channels ────────────────── */}
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
                        {/* RSVP Status Overview */}
                        <Card className="min-w-0 border border-border shadow-none py-0">
                            <CardContent className="flex h-full flex-col p-5">
                                <p className="mb-4 text-[13px] font-bold text-foreground">RSVP Status Overview</p>

                                <div className="flex flex-1 flex-wrap items-center justify-center gap-4">
                                    <div className="relative h-[130px] w-[130px] shrink-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={rsvpSlices}
                                                    dataKey="count"
                                                    nameKey="name"
                                                    innerRadius={44}
                                                    outerRadius={64}
                                                    strokeWidth={0}
                                                >
                                                    {rsvpSlices.map((s) => <Cell key={s.key} fill={s.fill} />)}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                        {/* Centre label as DOM, not SVG <text> — it
                                            inherits the app font and stays readable. */}
                                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-[19px] font-bold leading-none tabular-nums text-foreground">
                                                {totals.total_rsvps.toLocaleString()}
                                            </span>
                                            <span className="mt-0.5 text-[10px] text-muted-foreground">Total RSVPs</span>
                                        </div>
                                    </div>

                                    <ul className="flex min-w-[150px] flex-1 flex-col gap-3">
                                        {data.rsvp_breakdown.map((row) => (
                                            <li key={row.key} className="flex items-center gap-2 text-[12px]">
                                                <span
                                                    className="h-2 w-2 shrink-0 rounded-full"
                                                    style={{ background: metaOf(RSVP_META, row.key).color }}
                                                />
                                                <span className="min-w-0 flex-1 text-muted-foreground break-words">
                                                    {metaOf(RSVP_META, row.key).label}
                                                </span>
                                                <span className="shrink-0 whitespace-nowrap tabular-nums text-foreground">
                                                    {row.count} <span className="text-muted-foreground">({row.percent}%)</span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <Link
                                    href="/dashboard/rsvps"
                                    className="mt-4 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline"
                                >
                                    View RSVP Report
                                    <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                                </Link>
                            </CardContent>
                        </Card>

                        {/* RSVP Trend */}
                        <Card className="min-w-0 border border-border shadow-none py-0">
                            <CardContent className="flex h-full flex-col p-5">
                                <p className="text-[13px] font-bold text-foreground">RSVP Trend</p>

                                <div className="mb-2 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                                    {(Object.keys(RSVP_META) as RsvpStatus[]).map((key) => (
                                        <span key={key} className="flex items-center gap-1.5">
                                            <span className="h-2 w-2 rounded-full" style={{ background: metaOf(RSVP_META, key).color }} />
                                            {metaOf(RSVP_META, key).label}
                                        </span>
                                    ))}
                                </div>

                                <ChartContainer config={trendConfig} className="h-[172px] w-full flex-1">
                                    <LineChart data={data.rsvp_trend} margin={{ left: -24, right: 6, top: 4, bottom: 0 }}>
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="label"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            fontSize={10}
                                            // A 31-day axis cannot show 31 labels at this
                                            // width; every 7th keeps them upright and
                                            // legible instead of overlapping or rotated.
                                            interval={Math.max(0, Math.floor(data.rsvp_trend.length / 5) - 1)}
                                        />
                                        <YAxis tickLine={false} axisLine={false} fontSize={10} allowDecimals={false} />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        {(Object.keys(RSVP_META) as RsvpStatus[]).map((key) => (
                                            <Line
                                                key={key}
                                                type="monotone"
                                                dataKey={key}
                                                stroke={metaOf(RSVP_META, key).color}
                                                strokeWidth={2}
                                                dot={false}
                                            />
                                        ))}
                                    </LineChart>
                                </ChartContainer>

                                <Link
                                    href="/dashboard/rsvps"
                                    className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline"
                                >
                                    View Detailed Report
                                    <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                                </Link>
                            </CardContent>
                        </Card>

                        {/* Messages by Channel */}
                        <Card className="min-w-0 border border-border shadow-none py-0">
                            <CardContent className="flex h-full flex-col p-5">
                                <p className="mb-4 text-[13px] font-bold text-foreground">Messages by Channel</p>

                                <div className="flex flex-1 flex-wrap items-center justify-center gap-4">
                                    <div className="relative h-[130px] w-[130px] shrink-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={channelSlices}
                                                    dataKey="sent"
                                                    nameKey="name"
                                                    innerRadius={44}
                                                    outerRadius={64}
                                                    strokeWidth={0}
                                                >
                                                    {channelSlices.map((s) => <Cell key={s.key} fill={s.fill} />)}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-[19px] font-bold leading-none tabular-nums text-foreground">
                                                {totals.messages_sent.toLocaleString()}
                                            </span>
                                            <span className="mt-0.5 text-[10px] text-muted-foreground">Total Sent</span>
                                        </div>
                                    </div>

                                    <ul className="flex min-w-[150px] flex-1 flex-col gap-3">
                                        {data.messages_by_channel.map((row) => (
                                            <li key={row.key} className="flex items-center gap-2 text-[12px]">
                                                <span
                                                    className="h-2 w-2 shrink-0 rounded-full"
                                                    style={{ background: metaOf(CHANNEL_META, row.key).color }}
                                                />
                                                <span className="min-w-0 flex-1 text-muted-foreground break-words">
                                                    {metaOf(CHANNEL_META, row.key).label}
                                                </span>
                                                <span className="shrink-0 whitespace-nowrap tabular-nums text-foreground">
                                                    {row.sent} <span className="text-muted-foreground">({row.percent}%)</span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <Link
                                    href="/dashboard/messages"
                                    className="mt-4 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline"
                                >
                                    View Message Report
                                    <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                                </Link>
                            </CardContent>
                        </Card>
                    </div>

                    {/* ── Top events · message performance · sources ─────── */}
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
                        {/* Top Performing Events */}
                        <Card className="min-w-0 border border-border shadow-none py-0">
                            <CardContent className="flex h-full flex-col p-5">
                                <p className="mb-3 text-[13px] font-bold text-foreground">Top Performing Events</p>

                                <div className="-mx-1 flex-1 overflow-x-auto px-1">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="text-[11px] text-muted-foreground">
                                                <th className="pb-2 text-left font-normal">Event</th>
                                                <th className="pb-2 text-right font-normal">Guests</th>
                                                <th className="pb-2 text-right font-normal">RSVP Rate</th>
                                                <th className="pb-2 text-right font-normal">Response Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.top_events.map((event) => (
                                                <tr key={event.id} className="border-t border-border">
                                                    <td className="py-2.5 pr-2">
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            <EventThumbnail themeId={event.theme_id} className="h-8 w-8 shrink-0" />
                                                            <div className="min-w-0">
                                                                <Link
                                                                    href={`/dashboard/events/${event.id}`}
                                                                    className="block text-[12px] font-semibold text-foreground break-words hover:text-primary"
                                                                >
                                                                    {event.name}
                                                                </Link>
                                                                <span className="text-[10.5px] text-muted-foreground">
                                                                    {event.start_date ?? "—"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 text-right text-[12px] font-semibold tabular-nums text-foreground">
                                                        {event.guests}
                                                    </td>
                                                    <td className="py-2.5 text-right text-[12px] font-semibold tabular-nums text-success">
                                                        {pct(event.rsvp_rate)}
                                                    </td>
                                                    <td className="py-2.5 text-right text-[12px] font-semibold tabular-nums text-success">
                                                        {pct(event.response_rate)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <Link
                                    href="/dashboard/events"
                                    className="mt-4 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline"
                                >
                                    View All Events
                                    <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                                </Link>
                            </CardContent>
                        </Card>

                        {/* Message Performance */}
                        <Card className="min-w-0 border border-border shadow-none py-0">
                            <CardContent className="flex h-full flex-col p-5">
                                <p className="mb-3 text-[13px] font-bold text-foreground">Message Performance</p>

                                <div className="-mx-1 flex-1 overflow-x-auto px-1">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="text-[11px] text-muted-foreground">
                                                <th className="pb-2 text-left font-normal">Channel</th>
                                                <th className="pb-2 text-right font-normal">Sent</th>
                                                <th className="pb-2 text-right font-normal">Delivered</th>
                                                <th className="pb-2 text-right font-normal">Open Rate</th>
                                                <th className="pb-2 text-right font-normal">Click Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.messages_by_channel.map((row) => {
                                                const meta = metaOf(CHANNEL_META, row.key);
                                                return (
                                                    <tr key={row.key} className="border-t border-border">
                                                        <td className="py-3 pr-2">
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
                                                                    style={{ backgroundColor: `${meta.color}1A` }}
                                                                >
                                                                    <FontAwesomeIcon
                                                                        icon={meta.icon}
                                                                        className="!size-[12px]"
                                                                        style={{ color: meta.color }}
                                                                    />
                                                                </span>
                                                                <span className="text-[12px] font-medium text-foreground">
                                                                    {meta.label}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 text-right text-[12px] tabular-nums text-foreground">
                                                            {row.sent}
                                                        </td>
                                                        <td className="py-3 text-right text-[12px] tabular-nums text-foreground">
                                                            {row.delivered}{" "}
                                                            <span className="text-muted-foreground">({pct(row.delivery_rate)})</span>
                                                        </td>
                                                        {/* Em dash for SMS: no pixel, no link
                                                            wrapper. 0% would claim nobody
                                                            opened it. */}
                                                        <td className="py-3 text-right text-[12px] tabular-nums text-foreground">
                                                            {pct(row.open_rate)}
                                                        </td>
                                                        <td className="py-3 text-right text-[12px] tabular-nums text-foreground">
                                                            {pct(row.click_rate)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <Link
                                    href="/dashboard/messages"
                                    className="mt-4 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline"
                                >
                                    View All Messages
                                    <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                                </Link>
                            </CardContent>
                        </Card>

                        {/* Guest Engagement by Source */}
                        <Card className="min-w-0 border border-border shadow-none py-0">
                            <CardContent className="flex h-full flex-col p-5">
                                <p className="mb-4 text-[13px] font-bold text-foreground">Guest Engagement by Source</p>

                                <ul className="flex flex-1 flex-col gap-3.5">
                                    {data.engagement_by_source.map((row) => (
                                        <li key={row.key} className="flex items-center gap-3">
                                            <span className="w-[86px] shrink-0 text-[11.5px] text-muted-foreground">
                                                {metaOf(SOURCE_META, row.key).label}
                                            </span>
                                            {/* Each source keeps its own colour, as in the
                                                design. `indicatorColor` was added to the
                                                shared Progress for this — a Tailwind class
                                                cannot carry a runtime hex. */}
                                            <Progress
                                                value={row.percent}
                                                className="h-2 flex-1 bg-muted"
                                                indicatorColor={metaOf(SOURCE_META, row.key).color}
                                            />
                                            <span className="w-[42px] shrink-0 text-right text-[11.5px] tabular-nums text-foreground">
                                                {row.percent}%
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                <Link
                                    href="/dashboard/rsvps"
                                    className="mt-4 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline"
                                >
                                    View Source Report
                                    <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                                </Link>
                            </CardContent>
                        </Card>
                    </div>

                    <InsightsStrip data={data} />
                </>
            )}
        </div>
    );
}

/**
 * The design's Insights strip.
 *
 * Every line is derived from the payload on screen. A client with thin data
 * gets fewer cards rather than four filled with hedged phrasing, and the strip
 * hides itself when none apply.
 */
function InsightsStrip({ data }: { data: EventAnalytics }) {
    const insights = useMemo(() => {
        const out: { icon: typeof faArrowTrendUp; color: string; bg: string; title: string; detail: string }[] = [];
        const { totals, deltas, period, rsvp_breakdown, messages_by_channel, engagement_by_source } = data;

        if (deltas.total_rsvps !== null) {
            const up = deltas.total_rsvps >= 0;
            out.push({
                icon: faArrowTrendUp, color: up ? "#22C55E" : "#EF4444", bg: up ? "bg-[#22C55E]/10" : "bg-[#EF4444]/10",
                title: `RSVPs are ${Math.abs(deltas.total_rsvps)}% ${up ? "higher" : "lower"}`,
                detail: `compared to the previous ${period.days} days.`,
            });
        }

        const email = messages_by_channel.find((c) => c.key === "email");
        if (email && email.open_rate !== null) {
            out.push({
                icon: faEnvelopeOpenText, color: "#F59E0B", bg: "bg-[#F59E0B]/10",
                title: `Email open rate is ${email.open_rate}%`,
                detail: `${email.delivered} of ${email.sent} emails delivered.`,
            });
        }

        const attending = rsvp_breakdown.find((r) => r.key === "attending");
        if (attending) {
            out.push({
                icon: faUsers, color: "#7C5AED", bg: "bg-[#7C5AED]/10",
                title: `${attending.percent}% of invitees are attending`,
                detail: `${attending.count} confirmed across your events.`,
            });
        }

        // Best CLICK rate, not best open rate — clicks are the action that
        // matters, and a channel can be opened often and clicked rarely.
        const clickable = messages_by_channel.filter((c) => c.click_rate !== null);
        const best = clickable.sort((a, b) => (b.click_rate ?? 0) - (a.click_rate ?? 0))[0];
        if (best) {
            const share = engagement_by_source.find((s) => s.key === best.key);
            out.push({
                icon: faLink, color: "#06B6D4", bg: "bg-[#06B6D4]/10",
                title: `Links in ${metaOf(CHANNEL_META, best.key).label} messages`,
                detail: `have the highest click rate (${best.click_rate}%)${share ? `, and bring ${share.percent}% of guests` : ""}.`,
            });
        }

        return out;
    }, [data]);

    if (insights.length === 0) return null;

    return (
        <Card className="border border-border shadow-none py-0">
            <CardContent className="p-5">
                <p className="mb-4 text-[13px] font-bold text-foreground">Insights</p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    {insights.map((insight) => (
                        <div key={insight.title} className="flex min-w-0 items-start gap-2.5">
                            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", insight.bg)}>
                                <FontAwesomeIcon icon={insight.icon} className="!size-[13px]" style={{ color: insight.color }} />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[12px] font-semibold text-foreground break-words">{insight.title}</p>
                                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground break-words">
                                    {insight.detail}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
