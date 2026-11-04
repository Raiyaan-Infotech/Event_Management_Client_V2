"use client";

import { useState } from "react";
import { ChevronDown, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_TEXT, type Tone } from "./tones";

/**
 * Page-level pieces of the event module designs (Agenda, Family, Guests,
 * Participants, RSVP, Wishes, Gallery — Jamal's 2026-11-03 web mockups).
 * Every module page is: ModuleHeader → OverviewCard → CountTabs + toolbar →
 * ListCard(s) → Pager, with a FormPanel on the right or an ActionSheet.
 */

/** "Event Guests" + subtitle, actions on the right. */
export function ModuleHeader({
    title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
                <h3 className="text-[22px] leading-tight font-bold">{title}</h3>
                {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
    );
}

/** The pink "Guest Overview" box that holds the stat tiles. Without `title`, just the tiles. */
export function OverviewCard({
    title, icon: Icon, children, columns = 4,
}: { title?: string; icon?: LucideIcon; children: React.ReactNode; columns?: 3 | 4 | 5 | 6 }) {
    const grid = { 3: "xl:grid-cols-3", 4: "xl:grid-cols-4", 5: "xl:grid-cols-5", 6: "xl:grid-cols-6" }[columns];
    return (
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
            {title && (
                <p className="mb-3 flex items-center gap-2 text-[16px] font-bold text-primary">
                    {Icon && <Icon className="size-5" />} {title}
                </p>
            )}
            <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", grid)}>{children}</div>
        </div>
    );
}

/** One stat tile: icon, number, label, optional caption ("84.4% response rate"). */
export function StatTile({
    icon: Icon, value, label, caption, tone = "primary", active, onClick,
}: {
    icon: LucideIcon; value: number | string; label: string; caption?: string;
    tone?: Tone; active?: boolean; onClick?: () => void;
}) {
    const Comp = onClick ? "button" : "div";
    return (
        <Comp
            type={onClick ? "button" : undefined}
            onClick={onClick}
            className={cn(
                "flex min-w-0 items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left",
                active ? "border-primary ring-1 ring-primary/30" : "border-border",
                onClick && "transition hover:border-primary/40",
            )}
        >
            <Icon className={cn("size-7 shrink-0", TONE_TEXT[tone])} />
            <div className="min-w-0">
                <p className="text-[20px] leading-6 font-bold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
                <p className="text-[12.5px] leading-4 text-muted-foreground">{label}</p>
                {caption && <p className="mt-0.5 text-[11px] text-muted-foreground">{caption}</p>}
            </div>
        </Comp>
    );
}

/**
 * A list card with the pink header: "Guest List (48)" + an info note on the
 * right. `collapsible` = the header toggles the body (Family's side groups).
 */
export function ListCard({
    title, icon: Icon, count, note, actions, collapsible, defaultOpen = true, children, className,
}: {
    title: string; icon?: LucideIcon; count?: number; note?: React.ReactNode; actions?: React.ReactNode;
    collapsible?: boolean; defaultOpen?: boolean; children: React.ReactNode; className?: string;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const head = (
        <>
            <span className="flex min-w-0 items-center gap-2 text-[16px] font-bold text-primary">
                {Icon && <Icon className="size-5 shrink-0" />}
                <span className="truncate">{title}{count !== undefined && ` (${count.toLocaleString()})`}</span>
            </span>
            <span className="flex items-center gap-3">
                {note && <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground md:flex"><Info className="size-3.5" /> {note}</span>}
                {actions}
                {collapsible && <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />}
            </span>
        </>
    );
    const headClass = "flex w-full items-center justify-between gap-3 border-b border-border bg-primary/5 px-4 py-3 text-left";
    return (
        <div className={cn("min-w-0 overflow-hidden rounded-xl border border-border bg-card", className)}>
            {collapsible
                ? <button type="button" className={headClass} onClick={() => setOpen((o) => !o)}>{head}</button>
                : <div className={headClass}>{head}</div>}
            {(!collapsible || open) && children}
        </div>
    );
}

/**
 * The right-hand Add / Edit panel (Add Family Member, Add Guest, Add Agenda
 * Session, Create Folder): pink header with an icon, body, a footer row.
 */
export function FormPanel({
    title, icon: Icon, subtitle, children, footer, className, panelRef,
}: {
    title: string; icon?: LucideIcon; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode;
    className?: string; panelRef?: React.Ref<HTMLDivElement>;
}) {
    return (
        <div ref={panelRef} className={cn("flex h-fit min-w-0 flex-col overflow-hidden rounded-xl border border-primary/15 bg-card lg:sticky lg:top-4", className)}>
            <div className="border-b border-primary/15 bg-primary/5 px-4 py-3">
                <p className="flex items-center gap-2 text-[17px] font-bold text-primary">{Icon && <Icon className="size-5" />} {title}</p>
                {subtitle && <p className="text-[12.5px] text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="flex flex-col gap-3 p-4">{children}</div>
            {footer && <div className="grid grid-cols-[1fr_1.6fr] gap-3 border-t border-border p-4">{footer}</div>}
        </div>
    );
}

/** Page grid: the list on the left, a FormPanel on the right. */
export function SplitLayout({ children, aside, asideWidth = 360 }: { children: React.ReactNode; aside: React.ReactNode; asideWidth?: number }) {
    return (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_var(--aside)]" style={{ "--aside": `${asideWidth}px` } as React.CSSProperties}>
            <div className="flex min-w-0 flex-col gap-4">{children}</div>
            {aside}
        </div>
    );
}

/** A tinted notice ("This action cannot be undone.", "The guest will remain…"). */
export function Notice({
    tone = "info", icon: Icon = Info, title, children,
}: { tone?: "info" | "success" | "danger" | "warning" | "primary"; icon?: LucideIcon; title?: string; children?: React.ReactNode }) {
    const box = {
        info: "border-border bg-muted/50 text-foreground/80",
        primary: "border-primary/20 bg-primary/5 text-foreground/80",
        success: "border-success/30 bg-success/10 text-foreground/80",
        warning: "border-warning/30 bg-warning/10 text-foreground/80",
        danger: "border-destructive/30 bg-destructive/5 text-destructive",
    }[tone];
    return (
        <div className={cn("flex gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px]", box)}>
            <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : tone === "primary" ? "text-primary" : "text-muted-foreground")} />
            <div className="min-w-0">
                {title && <p className="font-semibold">{title}</p>}
                {children}
            </div>
        </div>
    );
}
