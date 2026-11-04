"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** YYYY-MM-DD ↔ a local Date (no time-zone shift). */
export const parseDay = (d: string) => { const [y, m, day] = d.split("-").map(Number); return new Date(y, (m ?? 1) - 1, day ?? 1); };
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * A calendar for picking ONE day. `allowed` (YYYY-MM-DD) limits the choice —
 * e.g. the event's days; every other date is greyed out.
 */
export function DayCalendar({
    value, onChange, allowed, className,
}: { value?: string | null; onChange: (day: string) => void; allowed?: string[]; className?: string }) {
    const ok = allowed ? new Set(allowed) : null;
    const month = value ? parseDay(value) : allowed?.[0] ? parseDay(allowed[0]) : undefined;
    return (
        <Calendar
            mode="single"
            className={className}
            selected={value ? parseDay(value) : undefined}
            defaultMonth={month}
            onSelect={(d) => d && onChange(dayKey(d))}
            disabled={ok ? (d) => !ok.has(dayKey(d)) : undefined}
            modifiers={ok ? { allowed: (d) => ok.has(dayKey(d)) } : undefined}
            modifiersClassNames={ok ? { allowed: "font-semibold text-primary" } : undefined}
        />
    );
}

/** The form field: shows the chosen day, opens the calendar on click. */
export function DatePickerField({
    value, onChange, allowed, label, placeholder = "Choose a date", invalid,
}: {
    value: string; onChange: (day: string) => void; allowed?: string[];
    /** How the chosen day is written in the box. */
    label: (day: string) => string; placeholder?: string; invalid?: boolean;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "flex h-9 w-full items-center gap-2 rounded-md border bg-transparent px-3 text-left text-[13px] shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        invalid ? "border-destructive" : "border-input",
                    )}
                >
                    <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className={cn("flex-1 truncate", !value && "text-muted-foreground")}>{value ? label(value) : placeholder}</span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
                <DayCalendar value={value} allowed={allowed} onChange={(d) => { onChange(d); setOpen(false); }} />
            </PopoverContent>
        </Popover>
    );
}
