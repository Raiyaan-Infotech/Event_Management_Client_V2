"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useState } from "react";
import { Mail, MessageCircle, Smartphone, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile, TONE_TEXT } from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { useRsvpBoard } from "@/hooks/use-rsvp-board";
import { STATE_META } from "./rsvp-actions";

/**
 * The RSVP cards of the event Dashboard — moved from the RSVP Responses page
 * (Jamal, 2026-11-06): RSVP Summary, Invitation Channel Breakdown, Recent
 * Activity, Guest Response Notes. All read the RSVP board's event-wide stats
 * (one shared query: same key in every card).
 */

const useBoard = (eventId: number) => useRsvpBoard(eventId, { limit: 1 });

/** Invitation Channel Breakdown — WhatsApp / Email / In-App, share of invited. */
export function RsvpChannels({ eventId }: { eventId: number }) {
    const board = useBoard(eventId);
    if (board.isLoading) return <Skeleton className="h-[120px] w-full rounded-md" />;
    const s = board.data?.stats;
    const ch = board.data?.channels;
    return (
        <div className="flex flex-col gap-3">
            {([["whatsapp", "WhatsApp", MessageCircle], ["email", "Email", Mail], ["in_app", "In-App", Smartphone]] as const).map(([k, label, Icon]) => {
                const n = ch?.[k] ?? 0;
                const w = s?.invited ? Math.round((n / s.invited) * 100) : 0;
                return (
                    <div key={k} className="flex items-center gap-2.5">
                        <Icon className={cn("size-4 shrink-0", k === "whatsapp" ? "text-success" : "text-muted-foreground")} />
                        <div className="min-w-0 flex-1">
                            <p className="flex justify-between text-[12.5px]"><span className="font-semibold">{label}</span><span><b>{n}</b> <span className="text-muted-foreground">({w}%)</span></span></p>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${w}%` }} /></div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/** Recent Activity — the latest answers; a click opens the RSVPs section. */
export function RsvpRecent({ eventId, onOpen }: { eventId: number; onOpen: () => void }) {
    const board = useBoard(eventId);
    // "Now" read once when the card mounts — fine for "10 min ago" labels.
    const [now] = useState(() => Date.now());
    if (board.isLoading) return <Skeleton className="h-[120px] w-full rounded-md" />;
    const recent = board.data?.recent ?? [];
    const ago = (iso: string) => {
        const m = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60000));
        return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} d ago`;
    };
    if (recent.length === 0) return <p className="text-[12.5px] text-muted-foreground">No responses yet.</p>;
    return (
        <div className="flex flex-col gap-2.5">
            {recent.map((x) => {
                const m = STATE_META[x.state];
                const verb = x.state === "confirmed" ? (x.attending_count && x.attending_count > 1 ? `confirmed for ${x.attending_count} invitees.` : "confirmed their attendance.")
                    : x.state === "declined" ? "declined the invitation." : x.state === "maybe" ? "marked Maybe." : "is pending a response.";
                return (
                    <button key={`${x.guest_id}-${x.at}`} type="button" onClick={onOpen} className="flex items-start gap-2 text-left text-[12.5px] hover:text-primary">
                        <m.icon className={cn("mt-0.5 size-3.5 shrink-0", TONE_TEXT[m.tone])} />
                        <span className="min-w-0 flex-1"><b>{x.name}</b> {verb}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{ago(x.at)}</span>
                    </button>
                );
            })}
        </div>
    );
}

/** Guest Response Notes — fixed tips. */
export function RsvpNotes() {
    return (
        <ul className="list-disc pl-5 text-[12.5px] text-foreground/80">
            <li>Guests can respond for multiple invitees (e.g., spouse, family, +1).</li>
            <li>Use &ldquo;Send Reminder&rdquo; on the RSVPs page to follow up with pending guests.</li>
        </ul>
    );
}

/** RSVP Summary — donut (Confirmed / Pending / Declined / Maybe, % of invited) + Total Invited / Responded. */

const DONUT: { key: "confirmed" | "pending" | "declined" | "maybe"; label: string; color: string }[] = [
    { key: "confirmed", label: "Confirmed", color: "#22C55E" },
    { key: "pending", label: "Pending", color: "#F59E0B" },
    { key: "declined", label: "Declined", color: "#EF4444" },
    { key: "maybe", label: "Maybe / Not Attending", color: "#A855F7" },
];

export function RsvpSummary({ eventId }: { eventId: number }) {
    const board = useBoard(eventId);
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
