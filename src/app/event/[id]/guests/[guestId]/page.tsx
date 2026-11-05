import Page from "@/app/dashboard/(dashboard)/guests/[id]/page";

/** Same page as /dashboard/guests/[id], inside the event workspace (see lib/event-workspace.ts). */
export default async function WorkspacePage({ params }: { params: Promise<{ guestId: string }> }) {
    const { guestId } = await params;
    return <Page params={Promise.resolve({ id: guestId })} />;
}
