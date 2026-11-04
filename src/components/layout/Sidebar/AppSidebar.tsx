"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faChevronDown, faGift, faHeadset } from "@fortawesome/free-solid-svg-icons"

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarGroup,
    useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { navMain, grantedSections } from "@/lib/navigation"
import { useEventOptions } from "@/hooks/use-client-portal"

/**
 * Client portal sidebar.
 *
 * Two differences from the template's version, both driven by the design:
 *  - Items are flat by default. Only an entry that actually has children gets
 *    a chevron and a collapsible; the template rendered a chevron on every row
 *    including ones with nothing to expand.
 *  - The footer carries the upgrade and help cards, hidden when collapsed.
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const pathname = usePathname()
    const { state } = useSidebar()
    const isCollapsed = state === "collapsed"
    const [openMenu, setOpenMenu] = React.useState<string | null>(null)
    const [mounted, setMounted] = React.useState(false)
    const options = useEventOptions()

    /**
     * The entries this client's PLAN allows.
     *
     * An entry with a `section` shows only when the plan grants that menu on the
     * website — see `section` in lib/navigation.ts. Until the options load, gated
     * entries stay hidden rather than appearing and then vanishing.
     */
    const visibleNav = React.useMemo(() => {
        const granted = grantedSections(options.data)
        return navMain.filter((item) => !item.section || (options.data && granted.has(item.section)))
    }, [options.data])

    React.useEffect(() => setMounted(true), [])

    /**
     * Which row to highlight.
     *
     * Exact match alone was wrong: on `/dashboard/events/5` NOTHING lit up, so
     * an event detail page looked like it belonged to no section at all.
     *
     * Prefix matching alone is wrong too, in the other direction — every
     * `/dashboard/...` route is a prefix match for `/dashboard`, which would
     * keep the Dashboard row lit on every screen in the app.
     *
     * So: exact always wins, and a prefix only counts when no OTHER nav entry
     * claims the path more specifically. That is what keeps
     * `/dashboard/events/create` on "Create New Event" rather than on
     * "My Events", which is also a prefix of it.
     */
    const allUrls = React.useMemo(
        () => navMain.flatMap((i) => [i.url, ...(i.items ?? []).map((s) => s.url)]).filter((u) => u && u !== "#"),
        []
    )


    const isActive = (url: string) => {
        if (!url || url === "#") return false
        if (pathname === url) return true
        if (!pathname.startsWith(`${url}/`)) return false
        // A longer entry that also matches owns the highlight instead.
        return !allUrls.some(
            (other) => other !== url && other.length > url.length &&
                (pathname === other || pathname.startsWith(`${other}/`))
        )
    }

    /**
     * Open the group the current route lives in.
     *
     * `openMenu` starts null, so landing on /dashboard/guests/groups left
     * "Guests" COLLAPSED with nothing visibly selected — the nav simply did not
     * reflect where you were. Keyed on `pathname` so it re-opens on every
     * navigation, including a browser back.
     *
     * It sets rather than merges, which also closes whichever group you came
     * from: two open groups on a ten-item sidebar means scrolling to find
     * anything.
     */
    React.useEffect(() => {
        const owner = navMain.find(
            (item) => (item.items?.length ?? 0) > 0
                && item.items.some((sub) => (sub as { ready?: boolean }).ready !== false && isActive(sub.url))
        )
        // Only auto-close for a route that belongs to a group. Navigating to a
        // flat item should leave a group the user opened by hand alone.
        if (owner) setOpenMenu(owner.title)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname])

    if (!mounted) return null

    return (
        <Sidebar collapsible="icon" className="border-r border-border bg-sidebar" {...props}>
            <SidebarHeader
                className={cn(
                    "sticky top-0 z-50 h-14 border-b border-border flex flex-col justify-center bg-sidebar",
                    isCollapsed ? "px-1.5" : "px-4"
                )}
            >
                <Link
                    href="/dashboard"
                    className={cn("flex items-center gap-2.5 no-underline", isCollapsed && "justify-center")}
                >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
                        <FontAwesomeIcon icon={faGift} className="!size-[16px]" />
                    </span>
                    {!isCollapsed && (
                        <span className="text-[17px] font-bold tracking-tight leading-none whitespace-nowrap">
                            <span className="text-foreground">Event</span>{" "}
                            <span className="text-primary">Invite</span>
                        </span>
                    )}
                </Link>
            </SidebarHeader>

            <SidebarContent className={cn("py-4 bg-sidebar", isCollapsed ? "px-1" : "px-3")}>
                <SidebarGroup className="p-0">
                    <SidebarMenu className="gap-1">
                        {visibleNav.map((item) => {
                            const hasChildren = (item.items?.length ?? 0) > 0
                            const selfActive = isActive(item.url)

                            // NOTE: a collapsible parent is deliberately never marked
                            // active, matching the admin panel. The open group and the
                            // highlighted child already say where you are; filling the
                            // header too made both look selected at once.

                            /*
                              NO className on the rows below, deliberately.

                              Height, padding, type scale, gaps and the active
                              fill all come from the shared primitive — the same
                              component the admin panel uses — so the two sidebars
                              cannot drift apart.

                              This used to override all of it: h-[38px], px-3,
                              text-[13px], gap-2.5, 15px icons, and a hand-rolled
                              active state that replaced the primitive's solid
                              bg-sidebar-primary fill with a faint accent tint.
                              That is why these rows read shorter and flatter than
                              the admin panel's.
                            */

                            // A row with nothing to expand is a plain link — no
                            // chevron, no collapsible, one click to navigate.
                            if (!hasChildren) {
                                return (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton asChild isActive={selfActive} tooltip={item.title}>
                                            <Link href={item.url} className="flex items-center gap-2">
                                                {item.icon && (
                                                    <FontAwesomeIcon icon={item.icon} className="!size-4 shrink-0" />
                                                )}
                                                <span className="truncate">{item.title}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )
                            }

                            return (
                                <Collapsible
                                    key={item.title}
                                    asChild
                                    open={openMenu === item.title}
                                    onOpenChange={(o) => setOpenMenu(o ? item.title : null)}
                                    className="group/collapsible"
                                >
                                    <SidebarMenuItem>
                                        <CollapsibleTrigger asChild>
                                            {/* The icon sat in its own flex wrapper with a
                                                gap and one child — the gap did nothing and the
                                                wrapper broke alignment against the flat rows,
                                                which put icon and label in ONE flex parent. */}
                                            <SidebarMenuButton tooltip={item.title}>
                                                {item.icon && (
                                                    <FontAwesomeIcon icon={item.icon} className="!size-4 shrink-0" />
                                                )}
                                                {/* truncate + shrink-0 on the icon: a long
                                                    label otherwise wraps and pushes the
                                                    chevron out of alignment. */}
                                                <span className="truncate">{item.title}</span>
                                                <FontAwesomeIcon
                                                    icon={faChevronDown}
                                                    className="ml-auto !size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180"
                                                />
                                            </SidebarMenuButton>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                            {/*
                                              ml-3.5 aligns the guide with the CENTRE of the
                                              parent's 15px icon rather than past it, so the
                                              line reads as descending from the parent row.
                                              gap-0.5 + py-1.5 stop the children stacking into
                                              one block.
                                              NO GEOMETRY OVERRIDES HERE, deliberately.
                                              Indent, gaps, row height, padding and type
                                              scale all come from the shared primitive —
                                              the same component the admin panel uses — so
                                              the two sidebars cannot drift apart.

                                              This block used to override nearly all of it
                                              (gap-0.5, py-1.5, pl-2 pr-0, h-[30px], px-2.5,
                                              12.5px text), which is exactly why these rows
                                              read as a tighter, narrower list than the
                                              admin panel's.
                                            */}
                                            <SidebarMenuSub>
                                                {item.items?.map((sub) => {
                                                    // Not built yet: shown, but not as a link.
                                                    if ((sub as { ready?: boolean }).ready === false) {
                                                        return (
                                                            <SidebarMenuSubItem key={sub.title}>
                                                                <div
                                                                    aria-disabled
                                                                    title="Not available yet"
                                                                    className="flex h-7 cursor-not-allowed items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/40"
                                                                >
                                                                    {sub.icon && (
                                                                        <FontAwesomeIcon icon={sub.icon} className="!size-4 shrink-0" />
                                                                    )}
                                                                    <span className="min-w-0 flex-1 truncate">{sub.title}</span>
                                                                    <span className="shrink-0 rounded bg-sidebar-accent px-1.5 py-0 text-[8.5px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">
                                                                        Soon
                                                                    </span>
                                                                </div>
                                                            </SidebarMenuSubItem>
                                                        )
                                                    }
                                                    return (
                                                    <SidebarMenuSubItem key={sub.title}>
                                                        <SidebarMenuSubButton
                                                            asChild
                                                            isActive={isActive(sub.url)}
                                                        >
                                                            <Link href={sub.url} className="flex items-center gap-2">
                                                                {sub.icon && (
                                                                    <FontAwesomeIcon icon={sub.icon} className="!size-4 shrink-0" />
                                                                )}
                                                                <span className="truncate">{sub.title}</span>
                                                            </Link>
                                                        </SidebarMenuSubButton>
                                                    </SidebarMenuSubItem>
                                                    )
                                                })}
                                            </SidebarMenuSub>
                                        </CollapsibleContent>
                                    </SidebarMenuItem>
                                </Collapsible>
                            )
                        })}
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="gap-3 p-3 group-data-[collapsible=icon]:hidden">
                {/* The plan card was removed (Jamal, 2026-11-04) to give the menu room — Billing is in the menu. */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/60 p-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-background">
                        <FontAwesomeIcon icon={faHeadset} className="!size-[13px] text-primary" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-foreground">Need Help?</p>
                        <p className="text-[11.5px] text-muted-foreground">
                            Visit{" "}
                            <Link href="/dashboard/help" className="text-primary hover:underline">
                                Help Center
                            </Link>
                        </p>
                    </div>
                </div>
            </SidebarFooter>
        </Sidebar>
    )
}
