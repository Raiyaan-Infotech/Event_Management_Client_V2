"use client";

import { ChevronLeft, ChevronRight, Search, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** "All Guests (48)  Bride Side (22)  VIP (6)  Hidden (2)" — the filled pill is the active tab. */
export function CountTabs<T extends string>({
    tabs, value, onChange, stretch = true,
}: {
    tabs: { value: T; label: string; count?: number; icon?: LucideIcon }[];
    value: T; onChange: (v: T) => void; stretch?: boolean;
}) {
    return (
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
            {tabs.map((t) => (
                <button
                    key={t.value} type="button" onClick={() => onChange(t.value)}
                    className={cn(
                        "flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[12px] font-medium transition",
                        stretch && "flex-1",
                        value === t.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                    )}
                >
                    {t.icon && <t.icon className="size-3" />} {t.label}{t.count !== undefined && ` (${t.count.toLocaleString()})`}
                </button>
            ))}
        </div>
    );
}

export function SearchBox({
    value, onChange, placeholder, className,
}: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
    return (
        <div className={cn("relative min-w-[200px] flex-1", className)}>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 pl-9 !text-[12.5px]" />
        </div>
    );
}

/** "Sort by Name (A – Z)" and the other dropdown filters ("Status: All"). */
export function SortSelect<T extends string>({
    value, onChange, options, className,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
    return (
        <Select value={value} onValueChange={(v) => onChange(v as T)}>
            <SelectTrigger className={cn("!h-8 w-[200px] text-[12.5px]", className)}><SelectValue /></SelectTrigger>
            <SelectContent>
                {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}

/** Search + sort (+ anything else) on one row. */
export function Toolbar({ children }: { children: React.ReactNode }) {
    return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

/** A windowed page list: 1 … 4 5 6 … 156 (`null` = the gap). */
export function pageWindow(current: number, total: number): (number | null)[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out: (number | null)[] = [1];
    const from = Math.max(2, Math.min(current - 1, total - 4));
    const to = Math.min(total - 1, Math.max(current + 1, 5));
    if (from > 2) out.push(null);
    for (let i = from; i <= to; i += 1) out.push(i);
    if (to < total - 1) out.push(null);
    out.push(total);
    return out;
}

/** "Showing 1 to 6 of 48 guests" + ‹ 1 2 3 … 8 ›. Renders nothing for an empty list. */
export function Pager({
    page, pageSize, total, onPage, noun = "items",
}: { page: number; pageSize: number; total: number; onPage: (p: number) => void; noun?: string }) {
    if (total <= 0) return null;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, page), pages);
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-muted-foreground">
                Showing {((current - 1) * pageSize + 1).toLocaleString()} to {Math.min(current * pageSize, total).toLocaleString()} of {total.toLocaleString()} {noun}
            </p>
            <div className="flex items-center gap-1.5">
                <Button size="icon" variant="outline" className="size-8" disabled={current <= 1} onClick={() => onPage(current - 1)} aria-label="Previous page">
                    <ChevronLeft className="size-4" />
                </Button>
                {pageWindow(current, pages).map((n, i) => n === null
                    ? <span key={`gap-${i}`} className="px-1 text-[12px] text-muted-foreground">…</span>
                    : (
                        <Button key={n} size="icon" variant={n === current ? "default" : "outline"} className="size-8 text-[12.5px]"
                            aria-current={n === current ? "page" : undefined} onClick={() => onPage(n)}>
                            {n}
                        </Button>
                    ))}
                <Button size="icon" variant="outline" className="size-8" disabled={current >= pages} onClick={() => onPage(current + 1)} aria-label="Next page">
                    <ChevronRight className="size-4" />
                </Button>
            </div>
        </div>
    );
}
