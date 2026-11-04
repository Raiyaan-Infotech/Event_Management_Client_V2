"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faExpand,
    faCompress,
    faMoon,
    faSun,
    faBell,
    faChevronDown,
    faUser,
    faGear,
    faCreditCard,
    faRightFromBracket,
    faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import Breadcrumb from "@/components/layout/Breadcrumb/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import { useClientProfile, useLogout } from "@/hooks/use-client-portal";
import { useUnreadCount, useNotifications, timeAgo } from "@/hooks/use-messages";

/**
 * Top bar.
 *
 * ── WHAT WAS FAKE HERE, AND IS NOT ANY MORE ──────────────────────────────────
 * This file shipped with a `currentUser` constant reading "Rohan Mehta /
 * Premium Plan / RM" and three invented notification rows behind a red "3"
 * badge. Both looked exactly like working features. The identity now comes from
 * `GET /client/me` and the plan name is the client's real one.
 *
 * NOTIFICATIONS are real now. The badge is `GET /client/notifications/count`,
 * which is one indexed COUNT — this renders on every page, so it must not be
 * the whole feed fetched to draw one number.
 *
 * ⚠ The badge is rendered ONLY when the count is greater than zero, and never
 * from a guess. An unread count is a claim; the invented red "3" this file
 * shipped with is exactly what trains people to ignore a bell.
 *
 * The BREADCRUMB sits where the event search box was (Jamal, 2026-11-04); My
 * Events keeps its own search.
 *
 * SIGN OUT calls the real logout route and leaves the portal.
 */

/** Initials from a display name — "Test Client" → "TC", "Jamal" → "JA". */
function initialsOf(name: string | undefined): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * `left`: what sits where the breadcrumb is — the event workspace shows the event there
 * (and has no New Event button).
 */
export default function Header({ left, exit }: { left?: React.ReactNode; exit?: React.ReactNode } = {}) {

    const pathname = usePathname();
    /** Create / Edit Event wizard open: no "New Event" while one is in progress. */
    const inWizard = /^\/dashboard\/events\/(create|\d+\/edit)(\/|$)/.test(pathname ?? "");
    // resolvedTheme, not theme: with "system" stored, `theme` is "system" on a
    // dark OS — the icon showed a moon and the first click set "dark" again.
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);
    const [isFullscreen, setIsFullscreen] = React.useState(false);

    const profile = useClientProfile();

    /*
      Two queries, deliberately. The COUNT is one indexed lookup and renders on
      every page; the five most recent are fetched only for the dropdown's
      preview and are cheap to keep warm. Fetching the feed just to draw the
      badge would be a page of rows for one number.
    */
    const unread = useUnreadCount();
    const unreadCount = unread.data?.unread ?? 0;
    const recentFeed = useNotifications({ limit: 5 });
    const recent = recentFeed.data?.notifications ?? [];
    const logout = useLogout();

    React.useEffect(() => setMounted(true), []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen?.();
            setIsFullscreen(false);
        }
    };

    const client = profile.data;
    const planName = client?.plan?.name;

    return (
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-5">
            <SidebarTrigger className="h-9 w-9 shrink-0 rounded-md text-muted-foreground hover:bg-secondary dark:hover:bg-secondary" />

            {/* Breadcrumb in place of the old event search (Jamal, 2026-11-04) — more room,
                one bar less. It reads useSearchParams(), hence the Suspense boundary. */}
            {left ?? (
                <React.Suspense fallback={<div className="min-w-0 flex-1" />}>
                    <Breadcrumb inline />
                </React.Suspense>
            )}

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                {!inWizard && !left && (
                <Button
                    asChild
                    className="hidden h-9 rounded-md px-4 text-[12.5px] font-semibold sm:inline-flex"
                >
                    <Link href="/dashboard/events/create">
                        <FontAwesomeIcon icon={faPlus} className="mr-2 !size-[12px]" />
                        New Event
                    </Link>
                </Button>
                )}

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleFullscreen}
                    aria-label="Toggle fullscreen"
                    className="hidden h-9 w-9 rounded-md text-muted-foreground hover:bg-secondary lg:inline-flex"
                >
                    <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} className="!size-[14px]" />
                </Button>

                {/* Rendered only after mount — `theme` is undefined on the server,
                    so rendering the icon during SSR guarantees a hydration
                    mismatch on every load. */}
                {mounted && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                        aria-label="Toggle theme"
                        className="h-9 w-9 rounded-md text-muted-foreground hover:bg-secondary dark:hover:bg-secondary"
                    >
                        <FontAwesomeIcon icon={resolvedTheme === "dark" ? faSun : faMoon} className="!size-[14px]" />
                    </Button>
                )}

                {/* Notifications — a real count, and a real feed behind it. */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                            className="relative h-9 w-9 rounded-md text-muted-foreground hover:bg-secondary dark:hover:bg-secondary"
                        >
                            <FontAwesomeIcon icon={faBell} className="!size-[14px]" />
                            {/* Only when there IS something. A badge showing 0 is a
                                claim that something needs attention. */}
                            {unreadCount > 0 ? (
                                <span className="absolute -right-0.5 -top-0.5 grid min-w-[17px] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-[17px] text-primary-foreground">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            ) : null}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[320px] p-0">
                        <DropdownMenuLabel className="flex items-center justify-between px-4 py-3 text-[13px] font-bold">
                            Notifications
                            {unreadCount > 0 ? (
                                <span className="text-[11px] font-medium text-muted-foreground">
                                    {unreadCount} unread
                                </span>
                            ) : null}
                        </DropdownMenuLabel>
                        <Separator />
                        {recent.length === 0 ? (
                            <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                                <FontAwesomeIcon icon={faBell} className="!size-[18px] text-muted-foreground/40" />
                                <p className="text-[12.5px] font-semibold text-foreground">You&rsquo;re all caught up</p>
                                <p className="text-[11.5px] leading-snug text-muted-foreground">
                                    Event and RSVP notifications will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="flex max-h-[320px] flex-col overflow-y-auto">
                                {recent.map((n) => (
                                    <Link
                                        key={n.id}
                                        href="/dashboard/notifications"
                                        className="flex min-w-0 items-start gap-2.5 px-4 py-3 transition-colors hover:bg-muted/50"
                                    >
                                        <span className={cn(
                                            'mt-1.5 size-1.5 shrink-0 rounded-full',
                                            n.is_read ? 'bg-transparent' : 'bg-primary',
                                        )} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[12px] font-medium break-words">{n.title}</span>
                                            {n.body ? (
                                                <span className="mt-0.5 block line-clamp-2 text-[11px] break-words text-muted-foreground">
                                                    {n.body}
                                                </span>
                                            ) : null}
                                            <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                                                {timeAgo(n.created_at)}
                                            </span>
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        )}
                        <Separator />
                        <Link
                            href="/dashboard/notifications"
                            className="block px-4 py-2.5 text-center text-[12px] font-medium text-primary hover:underline"
                        >
                            View all notifications
                        </Link>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Profile — or, in the event workspace, Exit Event (2026-11-04). */}
                {exit ?? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className={cn(
                                "flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-secondary",
                                "!outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            )}
                        >
                            <Avatar className="h-8 w-8">
                                {/*
                                  Conditional, with a key — a bare src={undefined}
                                  does not reliably trigger the fallback.

                                  ⚠ mediaUrl(), not the raw value. `avatar_url`
                                  from the API is relative to the BACKEND
                                  (`/uploads/...`); rendered as-is it resolves
                                  against this app's own origin instead and
                                  404s on every single page load — the upload
                                  succeeded, the image is just being fetched
                                  from the wrong port.
                                */}
                                {client?.avatar_url && (
                                    <AvatarImage key={client.avatar_url} src={mediaUrl(client.avatar_url)} alt="" />
                                )}
                                <AvatarFallback className="bg-primary/10 text-[11px] font-bold text-primary">
                                    {initialsOf(client?.name)}
                                </AvatarFallback>
                            </Avatar>
                            <span className="hidden flex-col items-start leading-tight sm:flex">
                                {profile.isLoading ? (
                                    <>
                                        <Skeleton className="h-3 w-[86px]" />
                                        <Skeleton className="mt-1 h-2.5 w-[60px]" />
                                    </>
                                ) : (
                                    <>
                                        <span className="max-w-[140px] truncate text-[12.5px] font-semibold text-foreground">
                                            {client?.name ?? "Not signed in"}
                                        </span>
                                        <span className="max-w-[140px] truncate text-[10.5px] text-muted-foreground">
                                            {planName ?? "No plan assigned"}
                                        </span>
                                    </>
                                )}
                            </span>
                            <FontAwesomeIcon icon={faChevronDown} className="!size-[10px] text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[240px]">
                        <DropdownMenuLabel className="flex flex-col gap-0.5">
                            <span className="truncate text-[12.5px] font-semibold">
                                {client?.name ?? "Not signed in"}
                            </span>
                            {client?.email && (
                                <span className="truncate text-[11px] font-normal text-muted-foreground">
                                    {client.email}
                                </span>
                            )}
                            {planName && (
                                <Badge variant="secondary" className="mt-1 w-fit text-[10px]">
                                    {planName}
                                </Badge>
                            )}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link href="/dashboard/profile" className="text-[12.5px]">
                                <FontAwesomeIcon icon={faUser} className="mr-2.5 !size-[12px]" /> My Profile
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href="/dashboard/billing" className="text-[12.5px]">
                                <FontAwesomeIcon icon={faCreditCard} className="mr-2.5 !size-[12px]" /> Billing
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href="/dashboard/settings" className="text-[12.5px]">
                                <FontAwesomeIcon icon={faGear} className="mr-2.5 !size-[12px]" /> Settings
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            disabled={logout.isPending}
                            onSelect={(e) => { e.preventDefault(); logout.mutate(); }}
                            className="text-[12.5px] text-destructive focus:text-destructive"
                        >
                            <FontAwesomeIcon icon={faRightFromBracket} className="mr-2.5 !size-[12px]" />
                            {logout.isPending ? "Signing out..." : "Sign out"}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                )}
            </div>
        </header>
    );
}
