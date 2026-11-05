'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';

import { Button } from '@/components/ui/button';
import { useEventOptions } from '@/hooks/use-client-portal';
import { grantedSections, sectionForPath } from '@/lib/navigation';

/**
 * Blocks a portal SECTION the client's plan does not include.
 *
 * The sidebar already hides such a section (see `section` in lib/navigation.ts);
 * this is the same rule for someone who types the URL or follows an old link.
 * Without it, hiding the row would be cosmetic — the page would still open.
 *
 * Not a security boundary on its own: the section's API calls are not gated by
 * the plan server-side. What this guarantees is that the portal never presents
 * a section the plan does not include.
 *
 * Paths outside every gated section (Dashboard, My Events, Billing, …) pass
 * straight through and never wait on the plan lookup.
 */
export function PlanSectionGate({ children, path }: { children: React.ReactNode; path?: string }) {
    const pathname = usePathname();
    // `path` = the dashboard page this one stands for (the event workspace's copies).
    const section = sectionForPath(path ?? pathname);
    const { data, isLoading } = useEventOptions();

    if (!section) return <>{children}</>;

    // Nothing rather than the page while the plan loads, so a section that is
    // about to be refused never flashes on screen.
    if (isLoading) return null;

    // The lookup failed outright — let the page show its own error rather than
    // locking the client out of something their plan may well include.
    if (!data) return <>{children}</>;

    if (grantedSections(data).has(section.slug)) return <>{children}</>;

    return (
        <div className="grid flex-1 place-items-center py-16">
            <div className="w-full max-w-md text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10">
                    <FontAwesomeIcon icon={faLock} className="!size-[18px] text-primary" />
                </span>
                <h1 className="mt-4 text-[17px] font-bold text-foreground">
                    {section.title} is not included in your plan
                </h1>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    Your subscription plan{data.plan?.name ? ` (${data.plan.name})` : ''} does not include this
                    section. Contact us to have it added, or see what each plan includes.
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <Button asChild>
                        <Link href="/dashboard/billing/features">Compare plan features</Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/dashboard">Back to dashboard</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
