import Page from "@/app/dashboard/(dashboard)/participants/[id]/edit/page";

/** Same page as /dashboard/participants/[id]/edit, inside the event workspace (see lib/event-workspace.ts). */
export default async function WorkspacePage({ params }: { params: Promise<{ participantId: string }> }) {
    const { participantId } = await params;
    return <Page params={Promise.resolve({ id: participantId })} />;
}
