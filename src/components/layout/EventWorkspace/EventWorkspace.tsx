"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Pencil, Tag } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGift } from "@fortawesome/free-solid-svg-icons";
import {
    Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { EventThumbnail } from "@/components/common/event-thumbnail";
import { eventCustomImage } from "@/lib/event-templates";
import { cn } from "@/lib/utils";
import { useClientEvent } from "@/hooks/use-client-events";
import { useDateFormatter } from "@/hooks/use-client-settings";
import {
    EVENT_STATUS, EVENT_TAB_ICONS, tabFrom, useVisibleEventTabs,
} from "@/app/dashboard/(dashboard)/events/[id]/_components/event-tabs";

/**
 * The EVENT WORKSPACE (Jamal's mockup, 2026-11-04): "View Event" opens the
 * event in its own browser tab. The sidebar is the event's menu (Dashboard,
 * Event Information, Agenda, Venue, Gallery, Family, Wed Wishes, Live Streaming,
 * Social Links, Guests, RSVPs, Participants, Settings…) and the top bar shows the
 * event — so every section gets the whole page.
 */

/** The event's sections, as a sidebar. Each one is `?tab=` on /event/:id. */
export function EventSidebar({ eventId }: { eventId: number }) {
    const tab = tabFrom(useSearchParams().get("tab"));
    const pathname = usePathname();
    const tabs = useVisibleEventTabs();
    const { state } = useSidebar();
    const collapsed = state === "collapsed";
    return (
        <Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
            <SidebarHeader className={cn("sticky top-0 z-50 flex h-[64px] flex-col justify-center border-b border-border bg-sidebar", collapsed ? "px-1.5" : "px-4")}>
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
                                    <Link href={t.value === "overview" ? pathname : `${pathname}?tab=${t.value}`} scroll={false}>
                                        <Icon className="size-[18px]" /> <span>{t.label}</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    })}
                </SidebarMenu>
            </SidebarContent>
            <SidebarFooter className="gap-1 border-t border-border p-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip="Edit Event" className="h-9 gap-3 text-[13px]">
                            <Link href={`/dashboard/events/${eventId}/edit`}><Pencil className="size-4" /> <span>Edit Event</span></Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip="Back to My Events" className="h-9 gap-3 text-[13px] text-muted-foreground">
                            <Link href="/dashboard/events"><ArrowLeft className="size-4" /> <span>Back to My Events</span></Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
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
            <EventThumbnail
                themeId={event.theme_id} customImage={eventCustomImage(event)} name={event.name}
                primaryColor={event.primary_color} startDate={event.start_date} venueName={event.venue_name}
                className="hidden h-12 w-[72px] shrink-0 rounded-md sm:block"
            />
            <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[17px] leading-tight font-bold" title={event.name}>{event.name}</span>
                    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold", status.className)}>
                        <span className={cn("size-1.5 rounded-full", status.dot)} /> {status.label}
                    </span>
                </p>
                <p className="hidden min-w-0 items-center gap-3 text-[12.5px] text-foreground/80 md:flex">
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
