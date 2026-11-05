import Page from "@/app/dashboard/(dashboard)/rsvps/[id]/edit/page";

/** Same page as /dashboard/rsvps/[id]/edit, inside the event workspace (see lib/event-workspace.ts). */
export default async function WorkspacePage({ params }: { params: Promise<{ rsvpId: string }> }) {
    const { rsvpId } = await params;
    return <Page params={Promise.resolve({ id: rsvpId })} />;
}
