"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The event page's tab bar (Jamal, 2026-11-04): one row that scrolls sideways
 * — by wheel, swipe, or the ‹ › buttons, which show only when there is more to
 * see. The active tab is scrolled into view when it changes.
 */
export function ScrollTabs<T extends string>({
    tabs, value, onChange,
}: { tabs: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
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

    const arrow = "absolute top-0 bottom-px z-10 grid w-8 place-items-center bg-background/95 text-muted-foreground hover:text-primary";
    return (
        <div className="relative border-b border-border">
            {edge.left && <button type="button" aria-label="Scroll tabs left" onClick={() => nudge(-1)} className={cn(arrow, "left-0 shadow-[8px_0_8px_-6px_rgba(0,0,0,0.12)]")}><ChevronLeft className="size-4" /></button>}
            <div ref={ref} role="tablist" onWheel={onWheel} className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tabs.map((t) => {
                    const on = t.value === value;
                    return (
                        <button
                            key={t.value} type="button" role="tab" aria-selected={on} data-tab={t.value}
                            onClick={() => onChange(t.value)}
                            className={cn(
                                "relative shrink-0 whitespace-nowrap px-3 py-2.5 text-[13px] transition-colors",
                                on ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {t.label}
                            {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
                        </button>
                    );
                })}
            </div>
            {edge.right && <button type="button" aria-label="Scroll tabs right" onClick={() => nudge(1)} className={cn(arrow, "right-0 shadow-[-8px_0_8px_-6px_rgba(0,0,0,0.12)]")}><ChevronRight className="size-4" /></button>}
        </div>
    );
}
