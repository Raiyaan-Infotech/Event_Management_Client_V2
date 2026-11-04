"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageLoader } from "@/components/common/page-loader";

/**
 * The event's own page is the EVENT WORKSPACE now — `/event/:id` (Jamal,
 * 2026-11-04; "View Event" opens it in a new tab). This old address forwards
 * there with its `?tab=`, so every link, Save and Back that points here still
 * lands on the right section.
 */
export default function EventDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    useEffect(() => {
        router.replace(`/event/${id}${window.location.search}`);
    }, [id, router]);
    return <PageLoader />;
}
