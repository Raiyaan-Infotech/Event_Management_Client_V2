"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, MapPin, QrCode } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api-client";
import { mediaUrl } from "@/lib/media-url";
import { StyledQrSvg } from "@/components/common/styled-qr";

/**
 * The public invitation page behind Share Event's "Shareable Event Link" (2026-11-17).
 *
 * ── WHY THIS IS NOT UNDER /dashboard ────────────────────────────────────────
 * A guest opens it from WhatsApp or an email and has no session. It reads only
 * `POST /public/events/qr/resolve`, the same unauthenticated lookup the mobile app
 * makes after a scan — the token in the address is the capability, exactly as the
 * printed QR is, and the answer is the narrowed guest view of the event.
 *
 * The page shows the event and its QR code, because joining (and the RSVP) happens
 * in the Event Invite app by scanning that code.
 */

interface PublicEvent {
    id: number;
    name: string;
    tagline: string | null;
    start_date: string | null;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    venue_name: string | null;
    venue_address: string | null;
    host_one: string | null;
    host_two: string | null;
    organizer: string | null;
    category_name: string | null;
    cover_image: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (d?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
    return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
};
const prettyTime = (t?: string | null) => {
    const m = /^(\d{2}):(\d{2})/.exec(String(t ?? ""));
    if (!m) return "";
    const h = Number(m[1]);
    return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};

export default function PublicInvitationPage({ params }: { params: Promise<{ token: string }> }) {
    const token = decodeURIComponent(use(params).token);
    const query = useQuery({
        queryKey: ["public", "invite", token],
        queryFn: () => api.postPublic<{ event: PublicEvent }>("/public/events/qr/resolve", { token }),
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
        staleTime: 60_000,
    });
    const e = query.data?.event;
    const hosts = [e?.host_one, e?.host_two].filter(Boolean).join(" & ");
    const dates = e ? [prettyDate(e.start_date), e.end_date && e.end_date !== e.start_date ? prettyDate(e.end_date) : ""].filter(Boolean).join(" – ") : "";
    const times = e ? [prettyTime(e.start_time), prettyTime(e.end_time)].filter(Boolean).join(" – ") : "";

    return (
        <main className="grid min-h-screen place-items-center bg-gradient-to-b from-primary/10 to-background px-4 py-8">
            <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                {query.isLoading ? (
                    <div className="flex flex-col gap-4 p-6">
                        <Skeleton className="h-[180px] w-full" /><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="mx-auto h-[190px] w-[190px]" />
                    </div>
                ) : !e ? (
                    <div className="flex flex-col items-center gap-2 p-8 text-center">
                        <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><QrCode className="size-6" /></span>
                        <h1 className="text-[17px] font-bold text-foreground">Invitation not available</h1>
                        <p className="text-[13px] text-muted-foreground">
                            {query.error instanceof ApiError && query.error.status !== 0
                                ? "This invitation link is no longer valid. Please ask the organizer for a new one."
                                : "We could not load this invitation. Please check your connection and try again."}
                        </p>
                        {!(query.error instanceof ApiError && query.error.status !== 0) && (
                            <button className="mt-1 text-[13px] font-semibold text-primary hover:underline" onClick={() => query.refetch()}>Try again</button>
                        )}
                    </div>
                ) : (
                    <>
                        {e.cover_image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mediaUrl(e.cover_image)} alt="" className="h-[200px] w-full object-cover" />
                        )}
                        <div className="flex flex-col items-center gap-1 px-6 pt-6 text-center">
                            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">You&rsquo;re invited to</p>
                            <h1 className="text-[22px] leading-tight font-bold break-words text-primary">{e.name}</h1>
                            {hosts && hosts !== e.name && <p className="text-[13.5px] font-medium text-foreground">{hosts}</p>}
                            {e.tagline && <p className="text-[12.5px] text-muted-foreground">{e.tagline}</p>}
                        </div>

                        <ul className="mx-6 mt-4 flex flex-col gap-2 rounded-lg bg-muted/40 px-4 py-3 text-[13px] text-foreground">
                            {dates && <li className="flex items-start gap-2.5"><CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" />{dates}</li>}
                            {times && <li className="flex items-start gap-2.5"><Clock className="mt-0.5 size-4 shrink-0 text-primary" />{times}</li>}
                            {(e.venue_name || e.venue_address) && (
                                <li className="flex items-start gap-2.5">
                                    <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                                    <span className="min-w-0 break-words">{[e.venue_name, e.venue_address].filter(Boolean).join(", ")}</span>
                                </li>
                            )}
                        </ul>

                        <div className="flex flex-col items-center gap-3 px-6 pt-5 pb-6 text-center">
                            <div className="rounded-lg border border-border bg-white p-3">
                                <StyledQrSvg value={token} size={190} level="M" marginSize={2} style={{ width: 190, height: 190, display: "block" }} />
                            </div>
                            <p className="text-[12.5px] text-muted-foreground">
                                Open the <span className="font-semibold text-foreground">Event Invite</span> app and scan this code to join the event and send your RSVP.
                            </p>
                            {e.organizer && <p className="text-[11.5px] text-muted-foreground">Hosted by {e.organizer}</p>}
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
