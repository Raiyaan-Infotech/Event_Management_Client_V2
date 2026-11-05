"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarDays, ChevronDown, LogOut, MapPin, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGift } from "@fortawesome/free-solid-svg-icons";
import {
    Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem,
    SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useClientEvent } from "@/hooks/use-client-events";
import { useDateFormatter } from "@/hooks/use-client-settings";
import {
    EVENT_STATUS, EVENT_TAB_ICONS, settingsFrom, tabFrom, useVisibleEventTabs, useVisibleSettingsPages,
} from "@/app/dashboard/(dashboard)/events/[id]/_components/event-tabs";

/**
 * The EVENT WORKSPACE (Jamal's mockup, 2026-11-04): "View Event" opens the
 * event in its own browser tab. The sidebar is the event's menu (Dashboard,
 * Event Information, Agenda, Venue, Gallery, Family, Wed Wishes, Live Streaming,
 * Social Links, Guests, RSVPs, Participants, Menu Settings [RSVP, Participants, Family, Wishes,
 * Contact Person]…) and the top bar shows the
 * event — so every section gets the whole page.
 */

/** The event's sections, as a sidebar. Each one is `?tab=` on /event/:id. */
export function EventSidebar({ eventId }: { eventId: number }) {
    const search = useSearchParams();
    const asked = search.get("tab");
    const pathname = usePathname();
    // A page under the event (/event/:id/guests/groups, …/rsvps/5) lights up its section.
    const base = `/event/${eventId}`;
    const sub = pathname.slice(base.length).match(/^\/(guests|rsvps|participants|messages)(\/|$)/);
    const tab = tabFrom(sub ? sub[1] : asked);
    const tabs = useVisibleEventTabs();
    const settingsPages = useVisibleSettingsPages();
    const settingsPage = settingsFrom(search.get("set"));
    // Menu Settings opens its list on its own page; the chevron opens / closes it anywhere.
    const [settingsToggled, setSettingsToggled] = useState<boolean | null>(null);
    const settingsOpen = settingsToggled ?? tab === "settings";
    const { state } = useSidebar();
    const collapsed = state === "collapsed";
    return (
        <Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
            <SidebarHeader className={cn("sticky top-0 z-50 flex h-14 flex-col justify-center border-b border-border bg-sidebar", collapsed ? "px-1.5" : "px-4")}>
                <Link href="/dashboard" className={cn("flex items-center gap-2.5 no-underline", collapsed && "justify-center")}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
                        <FontAwesomeIcon icon={faGift} className="!size-[16px]" />
                    </span>
                    {!collapsed && (
                        <span className="text-[17px] leading-none font-bold tracking-tight whitespace-nowrap">
                            <span className="text-foreground">Event</span> <span className="text-primary">Invite</span>
                        </span>
                    )}
                </Link>
            </SidebarHeader>
            <SidebarContent className="px-2 py-3">
                <SidebarMenu className="gap-0.5">
                    {tabs.map((t) => {
                        const Icon = EVENT_TAB_ICONS[t.value];
                        const on = tab === t.value;
                        return (
                            <SidebarMenuItem key={t.value}>
                                <SidebarMenuButton asChild isActive={on} tooltip={t.label}
                                    className={cn("h-9 gap-3 text-[13.5px]", on && "bg-primary/10 font-semibold text-primary hover:bg-primary/10 hover:text-primary")}>
                                    <Link href={t.value === "overview" ? base : `${base}?tab=${t.value}`} scroll={false}>
                                        <Icon className="size-[18px]" /> <span>{t.label}</span>
                                    </Link>
                                </SidebarMenuButton>
                                {t.value === "settings" && !collapsed && (
                                    <>
                                        <SidebarMenuAction aria-label={settingsOpen ? "Hide settings list" : "Show settings list"}
                                            onClick={() => setSettingsToggled(!settingsOpen)}>
                                            <ChevronDown className={cn("size-4 transition-transform", settingsOpen && "rotate-180")} />
                                        </SidebarMenuAction>
                                        {settingsOpen && (
                                            <SidebarMenuSub>
                                                {settingsPages.map((p) => {
                                                    const subOn = on && settingsPage === p.key;
                                                    return (
                                                        <SidebarMenuSubItem key={p.key}>
                                                            <SidebarMenuSubButton asChild isActive={subOn}
                                                                className={cn("h-8 text-[12.5px]", subOn && "font-semibold text-primary")}>
                                                                <Link href={`${base}?tab=settings&set=${p.key}`} scroll={false}>{p.label}</Link>
                                                            </SidebarMenuSubButton>
                                                        </SidebarMenuSubItem>
                                                    );
                                                })}
                                            </SidebarMenuSub>
                                        )}
                                    </>
                                )}
                            </SidebarMenuItem>
                        );
                    })}
                </SidebarMenu>
            </SidebarContent>
        </Sidebar>
    );
}

/** The top bar's left side: thumbnail, name + status, date, venue, category. */
export function EventTopInfo({ eventId }: { eventId: number }) {
    const fmt = useDateFormatter();
    const event = useClientEvent(eventId).data;
    if (!event) return <div className="min-w-0 flex-1" />;
    const status = EVENT_STATUS[event.derived_status];
    const venue = [event.venue_name, event.venue_landmark].filter(Boolean).join(" - ");
    return (
        <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] leading-tight font-bold" title={event.name}>{event.name}</span>
                    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold", status.className)}>
                        <span className={cn("size-1.5 rounded-full", status.dot)} /> {status.label}
                    </span>
                </p>
                <p className="hidden min-w-0 items-center gap-3 text-[12px] text-foreground/80 md:flex">
                    <span className="flex shrink-0 items-center gap-1"><CalendarDays className="size-3.5 text-primary" /> {event.start_date ? fmt(event.start_date) : "—"}</span>
                    {venue && <span className="flex min-w-0 items-center gap-1"><MapPin className="size-3.5 shrink-0 text-primary" /> <span className="truncate" title={venue}>{venue}</span></span>}
                    {event.category?.name && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11.5px] font-medium text-primary"><Tag className="size-3" /> {event.category.name}</span>
                    )}
                </p>
            </div>
        </div>
    );
}

/**
 * Exit Event — where the account menu is in the dashboard. The workspace was
 * opened in its own tab, so it closes that tab; if the browser keeps it open
 * (a tab not opened by the portal), it goes back to My Events instead.
 */
export function ExitEventButton() {
    const router = useRouter();
    const exit = () => {
        window.close();
        setTimeout(() => { if (!window.closed) router.push("/dashboard/events"); }, 150);
    };
    return (
        <Button size="sm" variant="outline" className="h-8 border-primary/40 text-primary hover:bg-primary/5 hover:text-primary" onClick={exit}>
            <LogOut className="size-3.5" /> Exit Event
        </Button>
    );
}
