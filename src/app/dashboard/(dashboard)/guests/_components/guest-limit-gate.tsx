"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserSlash } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGuestCapacity } from "@/hooks/use-guests";

/**
 * Stops Add Guest / Import Guests opening at all once the account is at its
 * plan's guest limit — the guest twin of EventLimitGate.
 *
 * The limit is ONE TOTAL for the account, not a number per event: guests are a
 * general list, so the answer does not depend on which event is picked.
 *
 * Numbers come from `/client/guests/capacity`, counted server-side exactly as
 * clientGuest.createGuest counts them. Removing a guest gives its place back.
 *
 * Fail-open: while loading, or on an older backend, the page opens — the
 * backend still refuses the save.
 */
export function GuestLimitGate({ children }: { children: ReactNode }) {
    const capacity = useGuestCapacity();

    const limit = capacity.data?.limit ?? null;
    const used = capacity.data?.used ?? null;
    const allFull = !capacity.isLoading && limit !== null && used !== null && used >= limit;

    if (!allFull) return <>{children}</>;

    return (
        <Card className="mx-auto mt-4 max-w-lg">
            <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                <FontAwesomeIcon icon={faUserSlash} className="!size-[26px] text-muted-foreground/40" />
                <p className="text-[14px] font-semibold text-foreground">Guest limit reached</p>
                <p className="max-w-sm text-[13px] text-muted-foreground">
                    Your plan allows {limit} guest{limit === 1 ? "" : "s"} in total and you have {used}.
                    Remove a guest or upgrade your plan to add more.
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <Button asChild size="sm" className="h-8 text-[12px]">
                        <Link href="/dashboard/billing">View Plan &amp; Billing</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-8 text-[12px]">
                        <Link href="/dashboard/guests">Back to Guests</Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
