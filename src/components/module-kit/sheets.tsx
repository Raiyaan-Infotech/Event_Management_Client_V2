"use client";

import { createContext, useContext, useState } from "react";
import { Loader2, MoreHorizontal, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { TONE_TEXT, type Tone } from "./tones";
import { FormField } from "./form";

/**
 * Inside <InlineSheets>, an ActionSheet renders IN PLACE — a card in the page
 * (e.g. the right column where the Add Guest form sits, Jamal 2026-11-04) —
 * instead of sliding in over the page.
 */
const InlineContext = createContext(false);
export function InlineSheets({ children }: { children: React.ReactNode }) {
    return <InlineContext.Provider value>{children}</InlineContext.Provider>;
}

/**
 * The panel every row action opens (View Guest, Send Invitation, Update RSVP
 * Status, Block Participant, Delete …): pink header with a round icon, title,
 * subtitle and ✕; scrolling body; Cancel / main button at the foot. A slide-in
 * by default; in place inside <InlineSheets>.
 */
export function ActionSheet({
    open, onClose, icon: Icon, tone = "primary", title, subtitle, children, footer, width = 500, eyebrow, large,
}: {
    open: boolean; onClose: () => void; icon?: LucideIcon; tone?: Tone; title: string; subtitle?: string;
    children: React.ReactNode; footer?: React.ReactNode; width?: number;
    /**
     * The Wed Wishes panel designs (Jamal, 2026-11-09): a small pink line above a large title
     * ("QA TEST WEDDING · WED WISHES"), a floating rounded panel. `large` alone = same look with the icon.
     */
    eyebrow?: string; large?: boolean;
}) {
    const inline = useContext(InlineContext);
    if (!inline && (eyebrow || large)) {
        return (
            <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
                <SheetContent side="right" showCloseButton={false}
                    className="w-full gap-0 overflow-hidden p-0 sm:my-3 sm:mr-3 sm:h-[calc(100%-1.5rem)] sm:max-w-none sm:rounded-2xl sm:border"
                    style={{ maxWidth: width }}>
                    <div className="flex items-start gap-3 border-b border-border bg-gradient-to-b from-primary/[0.06] to-transparent px-5 pt-4 pb-3">
                        {Icon && !eyebrow && (
                            <span className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-primary/10", TONE_TEXT[tone])}>
                                <Icon className="size-5" />
                            </span>
                        )}
                        <div className="min-w-0 flex-1">
                            {eyebrow && <p className="mb-0.5 text-[10.5px] font-bold tracking-[0.08em] text-primary uppercase">{eyebrow}</p>}
                            <SheetTitle className="text-[18px] leading-tight font-bold">{title}</SheetTitle>
                            <SheetDescription className={cn("mt-0.5 text-[12px]", !subtitle && "sr-only")}>{subtitle || title}</SheetDescription>
                        </div>
                        <Button size="icon" variant="outline" className="size-8 shrink-0 rounded-lg" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto [&>*]:shrink-0 px-5 py-4 text-[12.5px]">{children}</div>
                    {footer && <div className="grid grid-cols-2 gap-2.5 border-t border-border px-5 py-3 [&>*]:h-9 [&>*]:text-[13px]">{footer}</div>}
                </SheetContent>
            </Sheet>
        );
    }
    const head = (titleEl: React.ReactNode, subEl: React.ReactNode) => (
        <div className="flex items-start gap-3 border-b border-primary/15 bg-primary/5 px-4 py-3">
            {Icon && (
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-card", TONE_TEXT[tone])}>
                    <Icon className="size-4" />
                </span>
            )}
            <div className="min-w-0 flex-1">{titleEl}{subEl}</div>
            <Button size="icon" variant="outline" className="size-8 shrink-0" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
        </div>
    );
    if (inline) {
        if (!open) return null;
        return (
            <div className="flex h-fit min-w-0 flex-col overflow-hidden rounded-xl border border-primary/15 bg-card lg:sticky lg:top-4">
                {head(
                    <p className="text-[15.5px] font-bold">{title}</p>,
                    subtitle ? <p className="text-[12px] text-muted-foreground">{subtitle}</p> : null,
                )}
                <div className="flex flex-col gap-3 p-4 text-[12.5px]">{children}</div>
                {footer && <div className="grid grid-cols-[1fr_1.6fr] gap-3 border-t border-border px-4 py-3">{footer}</div>}
            </div>
        );
    }
    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-none" style={{ maxWidth: width }}>
                {/* Compact (Jamal, 2026-11-10): 16px title, 12.5px body, 36px footer buttons — every module's slide-in. */}
                {head(
                    <SheetTitle className="text-[16px] leading-tight font-bold">{title}</SheetTitle>,
                    <SheetDescription className={cn("mt-0.5 text-[12px]", !subtitle && "sr-only")}>{subtitle || title}</SheetDescription>,
                )}
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto [&>*]:shrink-0 p-4 text-[12.5px]">{children}</div>
                {footer && <div className="grid grid-cols-[1fr_2fr] gap-3 border-t border-border px-4 py-3 [&>*]:h-9 [&>*]:text-[13px]">{footer}</div>}
            </SheetContent>
        </Sheet>
    );
}

/** A bordered block with a bold title and label / value rows ("Contact Information"). */
export function DetailSection({ title, icon: Icon, children }: { title?: string; icon?: LucideIcon; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-border bg-card p-4">
            {title && <p className="mb-1 flex items-center gap-2 text-[14px] font-bold">{Icon && <Icon className="size-4 text-primary" />} {title}</p>}
            <div className="divide-y divide-border">{children}</div>
        </div>
    );
}

export function DetailRow({ label, children, tone }: { label: string; children: React.ReactNode; tone?: Tone }) {
    return (
        <div className="flex items-start justify-between gap-4 py-2 text-[12.5px]">
            <span className="text-muted-foreground">{label}</span>
            <span className={cn("break-words text-right font-medium", tone && TONE_TEXT[tone])}>{children || "—"}</span>
        </div>
    );
}

/** 2×2 small boxes: "Relationship / Mother", "Invite Count / 2 guests". */
export function InfoGrid({ items }: { items: { label: string; value: React.ReactNode }[] }) {
    return (
        <div className="grid grid-cols-2 gap-2.5">
            {items.map((i) => (
                <div key={i.label} className="rounded-lg border border-border bg-card px-3 py-2">
                    <p className="text-[11.5px] text-muted-foreground">{i.label}</p>
                    <p className="text-[13px] font-semibold">{i.value || "—"}</p>
                </div>
            ))}
        </div>
    );
}

/**
 * THE delete confirmation of every module (Jamal, 2026-11-09, confirmed 2026-11-11): a small centred popup —
 * title, one line, Cancel + red Delete. The Delete button shows a spinner and both buttons lock while it runs.
 */
export function DeletePopup({
    open, onClose, title, description, confirmLabel = "Delete", busy, onConfirm,
}: {
    open: boolean; onClose: () => void; title: string; description: React.ReactNode;
    confirmLabel?: string; busy?: boolean; onConfirm: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" disabled={busy} onClick={onConfirm}>
                        {busy && <Loader2 className="size-3.5 animate-spin" />} {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * The Delete panel body: "This action cannot be undone", what is affected,
 * an optional reason, and "I understand…". The confirm button stays off
 * until the box is ticked; `onConfirm` gets the reason.
 */
export function DeleteSheet({
    open, onClose, title, subtitle, summary, question, effects, confirmLabel, busy, onConfirm,
}: {
    open: boolean; onClose: () => void; title: string; subtitle?: string; summary?: React.ReactNode;
    question: string; effects?: { label: string; value: string; keep?: boolean }[];
    confirmLabel: string; busy?: boolean; onConfirm: (reason: string) => void;
}) {
    const [reason, setReason] = useState("");
    const [sure, setSure] = useState(false);
    const close = () => { setReason(""); setSure(false); onClose(); };
    return (
        <ActionSheet
            open={open} onClose={close} icon={X} tone="danger" title={title} subtitle={subtitle}
            footer={(
                <>
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    <Button variant="destructive" disabled={!sure || busy} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
                </>
            )}
        >
            {summary}
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[12.5px] text-destructive">
                <p className="flex items-center gap-1.5 font-semibold"><TriangleAlert className="size-3.5" /> This action cannot be undone.</p>
                <p className="mt-1.5">{question}</p>
            </div>
            {effects && effects.length > 0 && (
                <DetailSection title="Data affected">
                    {effects.map((e) => <DetailRow key={e.label} label={e.label} tone={e.keep ? "plain" : "danger"}>{e.value}</DetailRow>)}
                </DetailSection>
            )}
            <FormField label="Reason" hint=" (optional)">
                <Textarea value={reason} maxLength={300} rows={2} onChange={(e) => setReason(e.target.value)} />
            </FormField>
            <label className="flex items-center gap-2.5 rounded-lg border border-border p-3 text-[13px] font-semibold">
                <Checkbox checked={sure} onCheckedChange={(v) => setSure(v === true)} /> I understand this action is permanent
            </label>
        </ActionSheet>
    );
}

export type RowAction = { label: string; icon: LucideIcon; onClick: () => void; danger?: boolean; divider?: boolean; hidden?: boolean };

/** The ⋯ button on a row and its menu (red item for Delete; `divider` draws a line above). */
export function RowActions({ items, label = "Actions", compact }: { items: RowAction[]; label?: string; compact?: boolean }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className={cn(compact ? "size-7" : "size-8", "border-primary/30 text-primary hover:bg-primary/5 hover:text-primary")} aria-label={label}>
                    <MoreHorizontal className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                {items.filter((i) => !i.hidden).map((i) => (
                    <div key={i.label}>
                        {i.divider && <DropdownMenuSeparator />}
                        <DropdownMenuItem onClick={i.onClick} className={cn("gap-2.5 py-2 text-[13px]", i.danger && "text-destructive focus:text-destructive")}>
                            <i.icon className={cn("size-4", i.danger ? "text-destructive" : "text-muted-foreground")} /> {i.label}
                        </DropdownMenuItem>
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
