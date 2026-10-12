'use client';

import { Smartphone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { InvitationCard } from '@/components/common/invitation-card';
import { eventCustomImage, resolveArtwork } from '@/lib/event-templates';
import { useEventOptions } from '@/hooks/use-client-portal';
import type { ClientEvent } from '@/hooks/use-client-events';
import { SPLASH_HIDDEN_KEYS } from '@/hooks/use-splash-screens';

/**
 * The splash as a guest sees it: the event's invitation, drawn with the
 * splash's own Primary / Secondary colour and section switches.
 *
 * Same renderer the portal already uses for the invitation itself
 * ([InvitationCard]), so this is the real design and not a CSS imitation. The QR
 * code, Organizer and Contact are forced off — they never appear on a splash,
 * and the app draws it the same way.
 */
export interface SplashLook {
    themeId: string | null;
    primary: string | null;
    secondary: string | null;
    /** Section on/off; null = the invitation's own. */
    components: Record<string, boolean | number> | null;
    order: string[] | null;
}

/** The phone-frame renderer, shared by the editor (live) and the list's View dialog. */
export function SplashPreviewFrame({
    event, look, className,
}: { event: ClientEvent | null | undefined; look: SplashLook; className?: string }) {
    const { data: opts, isLoading } = useEventOptions();

    if (!event || isLoading) {
        return <Skeleton className={cn('mx-auto aspect-[9/19] w-full max-w-[240px] rounded-[28px]', className)} />;
    }

    const artwork = resolveArtwork(look.themeId ?? event.theme_id, opts?.templates, eventCustomImage(event));

    // The invitation's own switches, with the splash's on top and the three
    // sections that never show on a splash forced off.
    const base = (look.components ?? event.components ?? {}) as Record<string, boolean | number>;
    const components: Record<string, boolean | number> = { ...base };
    for (const key of SPLASH_HIDDEN_KEYS) components[key] = false;

    return (
        <div
            className={cn(
                'relative mx-auto aspect-[9/19] w-full max-w-[240px] overflow-hidden rounded-[28px] border-[6px] border-foreground/80 bg-background shadow-md',
                className,
            )}
        >
            <div className="absolute inset-0 grid place-items-center overflow-hidden p-2">
                {artwork.kind === 'template' ? (
                    <InvitationCard
                        template={{
                            ...artwork.template,
                            secondary_color: look.secondary || artwork.template.secondary_color,
                        }}
                        componentsOverride={components}
                        orderOverride={look.order ?? event.component_order}
                        className="w-full max-w-none shadow-none"
                        data={{
                            name: event.name,
                            hostOne: event.host_one,
                            hostTwo: event.host_two,
                            tagline: event.tagline,
                            description: event.description,
                            startDate: event.start_date,
                            startTime: event.start_time,
                            endTime: event.end_time,
                            venueName: event.venue_name,
                            venueAddress: event.venue_address,
                            footerNote: event.footer_note,
                            primaryColor: look.primary || event.primary_color,
                        }}
                    />
                ) : (
                    <p className="px-4 text-center text-[12px] text-muted-foreground">
                        This event&apos;s invitation template is no longer available, so the splash cannot be previewed.
                    </p>
                )}
            </div>
        </div>
    );
}

/** The editor's preview card: a title and the phone. */
export function SplashPreviewCard({
    event, look,
}: { event: ClientEvent | null | undefined; look: SplashLook }) {
    return (
        <Card className="py-0">
            <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                    <Smartphone className="size-4 text-primary" /> Live preview
                </div>
                <SplashPreviewFrame event={event} look={look} />
                <p className="text-center text-[11.5px] text-muted-foreground">
                    The splash is the event&apos;s invitation. The QR code, Organizer and Contact never show on it.
                </p>
            </CardContent>
        </Card>
    );
}
