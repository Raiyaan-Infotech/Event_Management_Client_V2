"use client";

import { Suspense, use } from "react";
import { usePathname } from "next/navigation";
import { PlanSectionGate } from "@/components/common/plan-section-gate";
import { dashboardPathFor } from "@/lib/event-workspace";
import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ClientAuthGate } from "@/components/common/client-auth-gate";
import { ClientPlanGate } from "@/components/common/client-plan-gate";
import { ThemeSync } from "@/components/common/theme-sync";
import { EventSidebar, EventTopInfo, ExitEventButton } from "@/components/layout/EventWorkspace/EventWorkspace";

/**
 * The event workspace (`/event/:id?tab=…`) — opened in a new browser tab by
 * "View Event" (Jamal, 2026-11-04). Same sign-in, plan and theme gates as the
 * dashboard; its own sidebar (the event's sections) and a top bar that shows
 * the event instead of a breadcrumb.
 */
export default function EventWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const eventId = Number(id);
    const pathname = usePathname();
    return (
        <ClientAuthGate>
            <ClientPlanGate>
                <ThemeSync />
                <SidebarProvider style={{ "--sidebar-width": "13.5rem" } as React.CSSProperties}>
                    {/* The sidebar reads ?tab= (useSearchParams), hence the Suspense boundary. */}
                    <Suspense fallback={null}><EventSidebar eventId={eventId} /></Suspense>
                    <SidebarInset className="flex min-h-screen min-w-0 flex-col bg-background">
                        <Header left={<EventTopInfo eventId={eventId} />} exit={<ExitEventButton />} />
                        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
                            <div id="main-content" className="relative flex min-h-0 min-w-0 flex-1 flex-col px-4 pt-3 pb-4 sm:px-5">
                                <PlanSectionGate path={dashboardPathFor(pathname)}>{children}</PlanSectionGate>
                            </div>
                            <Footer />
                        </div>
                    </SidebarInset>
                </SidebarProvider>
            </ClientPlanGate>
        </ClientAuthGate>
    );
}
