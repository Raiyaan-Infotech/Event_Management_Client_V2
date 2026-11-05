"use client";

import { cn } from "@/lib/utils";

/**
 * The one loading visual for the whole app. Everything that needs to say
 * "working" uses this, so loading never looks different from page to page.
 *
 * By default it covers only the MAIN CONTENT (the `#main-content` box of the
 * dashboard and event-workspace layouts): the sidebar and top bar stay usable
 * while a page or a form loads (Jamal, 2026-11-05). `fullScreen` covers the
 * whole window — for the moments before a layout exists.
 */
export const MAIN_CONTENT_ID = "main-content";

export function PageLoader({
    open = true,
    text = "Loading...",
    fullScreen = false,
    className,
}: {
    open?: boolean;
    text?: string;
    fullScreen?: boolean;
    className?: string;
}) {
    if (!open) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className={cn(
                "bg-background/70 backdrop-blur-[2px]",
                fullScreen ? "fixed inset-0 z-[9999] grid place-items-center" : "absolute inset-0 z-40 flex justify-center",
                className
            )}
        >
            {/* Sticky, so the spinner stays in view on a long, scrolled page. */}
            <div className={cn("flex flex-col items-center justify-center gap-3", !fullScreen && "sticky top-0 h-full max-h-[calc(100vh-7rem)]")}>
                <span className="h-9 w-9 animate-spin rounded-full border-2 border-border border-t-primary" />
                <span className="text-[12.5px] font-medium text-muted-foreground">{text}</span>
            </div>
            <span className="sr-only">{text}</span>
        </div>
    );
}
