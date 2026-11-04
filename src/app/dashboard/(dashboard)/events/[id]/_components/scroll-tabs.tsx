"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The event page's tab bar (Jamal's mockup, 2026-11-04): a card with one row of
 * tabs (icon + label; the active one pink with an underline) that scrolls
 * sideways — wheel, swipe, or the ‹ › buttons, which show only when there is
 * more to see. The active tab is scrolled into view when it changes.
 */
export function ScrollTabs<T extends string>({
    tabs, value, onChange,
}: { tabs: readonly { value: T; label: string; icon?: LucideIcon }[]; value: T; onChange: (v: T) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const [edge, setEdge] = useState({ left: false, right: false });

    const measure = () => {
        const el = ref.current;
        if (!el) return;
        setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    };

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        el.addEventListener("scroll", measure, { passive: true });
        return () => { ro.disconnect(); el.removeEventListener("scroll", measure); };
    }, []);

    useEffect(() => {
        ref.current?.querySelector<HTMLElement>(`[data-tab="${value}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, [value]);

    const nudge = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
    // A vertical wheel moves the row sideways, so a mouse can scroll it too.
    const onWheel = (e: React.WheelEvent) => {
        const el = ref.current;
        if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) el.scrollLeft += e.deltaY;
    };

    const arrow = "absolute inset-y-0 z-10 grid w-8 place-items-center bg-card/95 text-muted-foreground hover:text-primary";
    return (
        <div className="relative overflow-hidden rounded-xl border border-primary/10 bg-card">
            {edge.left && <button type="button" aria-label="Scroll tabs left" onClick={() => nudge(-1)} className={cn(arrow, "left-0 shadow-[8px_0_8px_-6px_rgba(0,0,0,0.12)]")}><ChevronLeft className="size-4" /></button>}
            <div ref={ref} role="tablist" onWheel={onWheel} className="flex gap-1 overflow-x-auto px-1.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tabs.map((t) => {
                    const on = t.value === value;
                    return (
                        <button
                            key={t.value} type="button" role="tab" aria-selected={on} data-tab={t.value}
                            onClick={() => onChange(t.value)}
                            className={cn(
                                "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] transition-colors",
                                on ? "bg-primary/10 font-semibold text-primary" : "text-foreground/75 hover:bg-muted hover:text-foreground",
                            )}
                        >
                            {t.icon && <t.icon className="size-4 shrink-0" />}
                            {t.label}
                            {on && <span className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-primary" />}
                        </button>
                    );
                })}
            </div>
            {edge.right && <button type="button" aria-label="Scroll tabs right" onClick={() => nudge(1)} className={cn(arrow, "right-0 shadow-[-8px_0_8px_-6px_rgba(0,0,0,0.12)]")}><ChevronRight className="size-4" /></button>}
        </div>
    );
}
