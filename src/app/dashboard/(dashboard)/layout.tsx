"use client";



import { AppSidebar } from "@/components/layout/Sidebar/AppSidebar";
import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ClientAuthGate } from "@/components/common/client-auth-gate";
import { ClientPlanGate } from "@/components/common/client-plan-gate";
import { PlanSectionGate } from "@/components/common/plan-section-gate";
import { ThemeSync } from "@/components/common/theme-sync";

/**
 * The template shipped this layout with per-route special cases (chat, email,
 * tasks, notes, storage, calendar) that switched it into a full-height,
 * non-scrolling shell. Those demo routes are gone, so the branching went with
 * them — every page is now a normal scrolling document page.
 *
 * If a full-height app-style screen is needed later (a chat or calendar built
 * against the real backend), reintroduce the branch here rather than fighting
 * the scroll container from inside the page.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /* Nothing below renders until the backend confirms a session. Without this
       the whole signed-in shell painted for anyone who found the URL, and each
       panel discovered its own 401 separately — see ClientAuthGate. */
    <ClientAuthGate>
    {/* Inside the auth gate, never outside it: the plan is read off the signed-in
        client, so there is nothing to check until a session is confirmed. */}
    <ClientPlanGate>
    {/* Pushes the account's stored theme into next-themes, so the choice
        follows the client between their laptop and their phone rather than
        living in one browser's localStorage. Renders nothing. */}
    <ThemeSync />
    {/* Narrower sidebar (Jamal, 2026-11-04): 13.5rem instead of the default 16rem. */}
    <SidebarProvider style={{ "--sidebar-width": "13.5rem" } as React.CSSProperties}>
      <AppSidebar />
      <SidebarInset className="bg-background flex flex-col min-w-0 min-h-screen transition-all duration-300">
        <Header />
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* The breadcrumb is in the top bar now (Header), where the search box was. */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0 px-4 sm:px-5 lg:px-6 pt-3 pb-4">
            {/* A section the plan does not include is refused here, the same
                rule the sidebar uses to hide it — see PlanSectionGate. */}
            <PlanSectionGate>{children}</PlanSectionGate>
          </div>
          <Footer />
        </div>
      </SidebarInset>
    </SidebarProvider>
    </ClientPlanGate>
    </ClientAuthGate>
  );
}
