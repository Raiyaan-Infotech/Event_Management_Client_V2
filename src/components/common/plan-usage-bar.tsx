"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * One plan limit as a labelled bar — "Participants · 7 / 10". Amber on the
 * last place, red when full (with an Upgrade link). Renders nothing when the
 * plan has no limit (`limit` null), so an unlimited plan shows no noise.
 */
export function PlanUsageBar({
    label, used, limit, unit = "", className,
}: {
    label: string;
    used: number;
    limit: number | null | undefined;
    /** Shown after both numbers, e.g. "MB". */
    unit?: string;
    className?: string;
}) {
    if (limit === null || limit === undefined) return null;
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
    const full = used >= limit;
    const near = !full && limit - used <= 1;
    const tone = full ? "bg-red-500" : near ? "bg-amber-500" : "bg-primary";
    const u = unit ? ` ${unit}` : "";

    return (
        <div className={cn("min-w-0", className)}>
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-muted-foreground">{label}</span>
                <span className={cn("text-[12px] font-semibold tabular-nums", full ? "text-red-600" : "text-foreground")}>
                    {used}{u} / {limit}{u}
                </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
            </div>
            {full && (
                <p className="mt-1 text-[11px] text-red-600">
                    Limit reached.{" "}
                    <Link href="/dashboard/billing" className="font-semibold underline underline-offset-2">
                        Upgrade your plan
                    </Link>{" "}
                    to add more.
                </p>
            )}
        </div>
    );
}
