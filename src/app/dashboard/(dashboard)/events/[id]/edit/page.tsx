import { EventWizard, type EditSectionKey } from "../../_components/event-wizard";
import { EditEventHub } from "../_components/edit-event-hub";

/**
 * /dashboard/events/:id/edit
 *
 *   (no section)        the Edit Event hub, as in the mobile app
 *   ?section=<key>      one section (basic, date, venue, menus, organizer,
 *                       invitation) with Cancel / Save
 *   ?section=all        the full Create Event steps — how a draft is finished
 *
 * In Next 16 `params` and `searchParams` are Promises and must be awaited.
 */

// Kept here, not imported: the wizard is a client module, and a server page
// cannot read a plain value exported from one. Must match SECTION_PAGES there.
const SECTIONS: EditSectionKey[] = ["basic", "date", "venue", "menus", "organizer", "invitation"];
export default async function EditEventPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ section?: string }>;
}) {
    const { id } = await params;
    const { section } = await searchParams;
    // A non-numeric id would become NaN and fire GET /client/events/NaN.
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) return <EventWizard />;

    if (section === "all") return <EventWizard eventId={eventId} />;
    if (section && (SECTIONS as string[]).includes(section)) {
        return <EventWizard key={section} eventId={eventId} section={section as EditSectionKey} />;
    }
    return <EditEventHub eventId={eventId} />;
}
