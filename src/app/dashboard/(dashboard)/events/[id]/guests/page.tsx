"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageLoader } from "@/components/common/page-loader";

/**
 * Event → Guests opens INSIDE the event page now, as a tab like Family
 * (Jamal, 2026-11-04). This old address forwards there, so every link and
 * Save / Back that points here keeps working.
 */
export default function EventGuestsRedirect({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    useEffect(() => { router.replace(`/dashboard/events/${id}?tab=guests`); }, [id, router]);
    return <PageLoader />;
}
