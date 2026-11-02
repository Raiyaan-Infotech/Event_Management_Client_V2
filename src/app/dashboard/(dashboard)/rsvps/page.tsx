"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageLoader } from "@/components/common/page-loader";

/**
 * RSVPs moved inside the event (2026-11-02): `/dashboard/events/:id/rsvps`.
 * This old address forwards there (`?event=`), or to My Events to pick one.
 */
export default function RsvpsViewRedirect() {
    const router = useRouter();
    useEffect(() => {
        const ev = new URLSearchParams(window.location.search).get("event");
        router.replace(ev ? `/dashboard/events/${ev}/rsvps` : "/dashboard/events");
    }, [router]);
    return <PageLoader />;
}
