"use client";

import { Star, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import { TONE_PILL, type Tone } from "./tones";

export const initialsOf = (name?: string | null) => {
    const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Photo, or the initials on pink ("AB") when there is none. */
export function PersonAvatar({
    name, photo, size = 40, rounded = "md",
}: { name?: string | null; photo?: string | null; size?: number; rounded?: "md" | "full" }) {
    return (
        <span
            className={cn("grid shrink-0 place-items-center overflow-hidden bg-primary/10 font-bold text-primary", rounded === "full" ? "rounded-full" : "rounded-md")}
            style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo ? <img src={mediaUrl(photo)} alt="" className="size-full object-cover" /> : initialsOf(name)}
        </span>
    );
}

/** A coloured pill: "Bride Side", "Confirmed", "Visible", "WhatsApp". */
export function StatusPill({
    tone = "muted", icon: Icon, children, className,
}: { tone?: Tone; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
    return (
        <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium", TONE_PILL[tone], className)}>
            {Icon && <Icon className="size-3" />} {children}
        </span>
    );
}

/** The small star badge under / beside a name: "VIP", "Key". */
export function StarBadge({ children = "VIP" }: { children?: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-px text-[10.5px] font-semibold text-primary">
            <Star className="size-2.5" /> {children}
        </span>
    );
}

/** Table cell: photo + name (+ badge) + a line under it. */
export function PersonCell({
    name, photo, sub, badge, onClick,
}: { name: string; photo?: string | null; sub?: React.ReactNode; badge?: React.ReactNode; onClick?: () => void }) {
    const body = (
        <>
            <PersonAvatar name={name} photo={photo} size={34} />
            <span className="min-w-0">
                {/* One line; a long name ends in … and shows whole on hover. */}
                <span className="block truncate text-[12.5px] font-semibold leading-4" title={name}>{name}</span>
                {badge && <span className="block">{badge}</span>}
                {sub && <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>}
            </span>
        </>
    );
    return onClick
        ? <button type="button" onClick={onClick} className="flex min-w-[130px] max-w-full items-center gap-2 text-left hover:[&_span]:text-primary">{body}</button>
        : <div className="flex min-w-[130px] max-w-full items-center gap-2">{body}</div>;
}

/** The card at the top of every action panel: avatar, name, "Mother · Bride Side", pills. */
export function PersonSummary({
    name, photo, sub, pills,
}: { name: string; photo?: string | null; sub?: React.ReactNode; pills?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <PersonAvatar name={name} photo={photo} size={60} rounded="full" />
            <div className="min-w-0">
                <p className="break-words text-[17px] font-bold">{name}</p>
                {sub && <p className="text-[12.5px] text-muted-foreground">{sub}</p>}
                {pills && <div className="mt-1.5 flex flex-wrap gap-1.5">{pills}</div>}
            </div>
        </div>
    );
}
