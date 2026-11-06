"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Mail, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/module-kit";
import { useRsvpBoard } from "@/hooks/use-rsvp-board";

/**
 * RSVP Summary — donut (Confirmed / Pending / Declined / Maybe, % of invited)
 * + Total Invited / Responded. Moved from the RSVP Responses page to the event
 * Dashboard (Jamal, 2026-11-06). Reads the RSVP board's stats (event-wide).
 */

const DONUT: { key: "confirmed" | "pending" | "declined" | "maybe"; label: string; color: string }[] = [
    { key: "confirmed", label: "Confirmed", color: "#22C55E" },
    { key: "pending", label: "Pending", color: "#F59E0B" },
    { key: "declined", label: "Declined", color: "#EF4444" },
    { key: "maybe", label: "Maybe / Not Attending", color: "#A855F7" },
];

export function RsvpSummary({ eventId }: { eventId: number }) {
    const board = useRsvpBoard(eventId, { limit: 1 });
    const s = board.data?.stats;

    if (board.isLoading) return <Skeleton className="h-[200px] w-full rounded-md" />;
    if (board.isError) return <p className="py-6 text-center text-[12.5px] text-muted-foreground">Could not load the RSVP summary.</p>;

    const slices = DONUT.map((x) => ({ ...x, value: s?.[x.key] ?? 0 }));
    const any = slices.some((x) => x.value);
    const pct = (n: number) => (s?.invited ? `${Math.round((n / s.invited) * 1000) / 10}%` : "0%");

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
                <div className="relative size-[130px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={any ? slices : [{ key: "none", value: 1, color: "#E5E7EB" }]} dataKey="value" innerRadius={48} outerRadius={64} paddingAngle={1} stroke="none">
                                {(any ? slices : [{ color: "#E5E7EB" }]).map((x, i) => <Cell key={i} fill={x.color} />)}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                        <div><p className="text-[20px] leading-5 font-bold">{s?.responded ?? 0}</p><p className="text-[10.5px] text-muted-foreground">Responded<br />({s?.responded_pct ?? 0}%)</p></div>
                    </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 text-[12px]">
                    {slices.map((x) => (
                        <p key={x.key} className="flex items-center gap-1.5">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: x.color }} />
                            <span className="min-w-0 flex-1 truncate" title={x.label}>{x.label}</span>
                            <span className="font-semibold">{x.value}</span> <span className="text-muted-foreground">({pct(x.value)})</span>
                        </p>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <StatTile icon={Mail} value={s?.invited ?? 0} label="Total Invited" tone="violet" />
                <StatTile icon={Users} value={s?.responded ?? 0} label="Responded" tone="primary" />
            </div>
        </div>
    );
}
