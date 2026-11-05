import Page from "@/app/dashboard/(dashboard)/guests/groups/[id]/page";

/** Same page as /dashboard/guests/groups/[id], inside the event workspace (see lib/event-workspace.ts). */
export default async function WorkspacePage({ params }: { params: Promise<{ groupId: string }> }) {
    const { groupId } = await params;
    return <Page params={Promise.resolve({ id: groupId })} />;
}
