'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Save } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
    SPLASH_HIDDEN_KEYS, SPLASH_SWITCHES, useCreateSplashScreen, useSplashScreen, useSplashScreens,
    useUpdateSplashScreen, type SplashScreen, type SplashStatus,
} from '@/hooks/use-splash-screens';
import { useClientEvent, useClientEvents, type ClientEvent } from '@/hooks/use-client-events';
import { useEventOptions } from '@/hooks/use-client-portal';
import { eventCustomImage, resolveArtwork } from '@/lib/event-templates';
import { SplashPreviewCard } from './splash-preview';

/**
 * Add / Edit Splash Screen.
 *
 * ── THE SPLASH IS THE EVENT'S INVITATION ────────────────────────────────────
 * Rebuilt to match the mobile app (session 57, §756). There is no background,
 * sound, animation or button to design any more: the splash is the invitation
 * the host already chose for the event, and this screen only sets
 *   1. the Primary Colour   (names and QR),
 *   2. the Secondary Colour (every other section),
 *   3. the section switches — Title, Names, Message, Date & Time, Venue, Footer.
 * The QR code and Organizer & Contact are not offered and never drawn.
 *
 * ── ONE EVENT, ONE SPLASH ───────────────────────────────────────────────────
 * The event is chosen on create (an event that already has a splash is not
 * offered) and locked on edit. The form below it is seeded from PROPS and
 * re-mounted by `key` when the event changes, never by an effect.
 */

const FALLBACK_PRIMARY = '#8B1E3F';
const FALLBACK_SECONDARY = '#D97706';
const HEX = /^#[0-9a-fA-F]{6}$/;

const PRIMARY_SWATCHES = ['#8B1E3F', '#E91E63', '#2457D6', '#22C55E', '#F59E0B'];
const SECONDARY_SWATCHES = ['#D97706', '#8B5CF6', '#EC4899', '#06B6D4', '#10B981'];


/**
 * Every section the invitation has. The splash row must carry ALL of them: the
 * app uses a saved `components` map as it stands, so a key left out (event
 * photos, decoration) is drawn as hidden. The six with a switch come from the
 * form; the rest keep the invitation's own value; the QR code, Organizer and
 * Contact are forced off.
 */
const ALL_COMPONENT_KEYS = [
    'event_title', 'host_names', 'date_time', 'venue', 'event_qr_code', 'organizer',
    'event_photos', 'contact_details', 'invitation_message', 'footer_note', 'decoration_elements',
] as const;

export function SplashForm({ splashId }: { splashId?: number }) {
    const isEdit = !!splashId;
    const splashQuery = useSplashScreen(splashId);
    const splash = splashQuery.data;

    // Create only: which event.
    const [pickedEventId, setPickedEventId] = useState<number | null>(null);
    const eventId = isEdit ? (splash?.event_id ?? null) : pickedEventId;

    const eventQuery = useClientEvent(eventId);
    const options = useEventOptions();

    const eventsQuery = useClientEvents({ limit: 100 });
    const splashes = useSplashScreens({ limit: 100 });
    const taken = new Set((splashes.data?.data ?? []).map((s) => s.event_id).filter(Boolean));
    const selectable = (eventsQuery.data?.data ?? []).filter((e) => !taken.has(e.id));

    if (isEdit && splashQuery.isLoading) {
        return (
            <div className="flex flex-col gap-5">
                <Skeleton className="h-9 w-64" />
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <Skeleton className="h-[480px] rounded-xl" />
                    <Skeleton className="h-[480px] rounded-xl" />
                </div>
            </div>
        );
    }

    if (isEdit && (splashQuery.isError || !splash)) {
        return (
            <Card className="py-0">
                <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                    <p className="text-[15px] font-semibold">Splash screen not found</p>
                    <Button asChild variant="outline" size="sm"><Link href="/dashboard/splash-screens">Back to Splash Screens</Link></Button>
                </CardContent>
            </Card>
        );
    }

    const event = eventQuery.data ?? null;
    const ready = !!event && !!options.data;

    return (
        <div className="flex flex-col gap-5">
            <div className="min-w-0">
                <Button asChild variant="link" size="sm" className="h-auto w-fit p-0 text-[12.5px]">
                    <Link href="/dashboard/splash-screens">← Back to Splash Screens</Link>
                </Button>
                <h1 className="mt-1 text-2xl font-bold tracking-tight">
                    {isEdit ? 'Edit Splash Screen' : 'New Splash Screen'}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    The splash is the invitation you already chose for the event — set its colours and which sections show.
                </p>
            </div>

            {!isEdit && (
                <Card className="py-0">
                    <CardContent className="flex flex-col gap-1.5 p-5">
                        <Label className="text-[12.5px] font-medium">Event <span className="text-destructive">*</span></Label>
                        <Select
                            value={pickedEventId ? String(pickedEventId) : ''}
                            onValueChange={(v) => setPickedEventId(Number(v))}
                        >
                            <SelectTrigger className="w-full max-w-md">
                                <SelectValue placeholder={eventsQuery.isLoading ? 'Loading events…' : 'Choose an event'} />
                            </SelectTrigger>
                            <SelectContent>
                                {selectable.length === 0 && !eventsQuery.isLoading ? (
                                    <div className="px-2 py-3 text-sm text-muted-foreground">Every event already has a splash screen.</div>
                                ) : selectable.map((ev) => (
                                    <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
            )}

            {!eventId && !isEdit ? (
                <p className="text-[13px] text-muted-foreground">Choose an event to design its splash.</p>
            ) : !ready ? (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <Skeleton className="h-[480px] rounded-xl" />
                    <Skeleton className="h-[480px] rounded-xl" />
                </div>
            ) : (
                <SplashEditor
                    // Re-seeds from the new event / the saved row, never by effect.
                    key={`${splash?.id ?? 'new'}-${event.id}-${splash?.updated_at ?? ''}`}
                    event={event}
                    splash={splash ?? null}
                    templates={options.data?.templates ?? []}
                />
            )}
        </div>
    );
}

type Templates = NonNullable<ReturnType<typeof useEventOptions>['data']>['templates'];

/** The invitation's own colours and switches — what Reset returns to. */
function invitationDefaults(event: ClientEvent, templates: Templates) {
    const artwork = resolveArtwork(event.theme_id, templates, eventCustomImage(event));
    const template = artwork.kind === 'template' ? artwork.template : null;

    const baseComponents = (event.components ?? template?.components ?? {}) as Record<string, boolean | number>;
    const components: Record<string, boolean> = {};
    for (const key of ALL_COMPONENT_KEYS) {
        const v = baseComponents[key];
        components[key] = v === undefined || v === null ? true : v === true || v === 1;
    }
    const order = (event.component_order?.length ? event.component_order : template?.component_order) ?? null;

    return {
        primary: event.primary_color || FALLBACK_PRIMARY,
        secondary: template?.secondary_color || FALLBACK_SECONDARY,
        components,
        order,
    };
}

function SplashEditor({
    event, splash, templates,
}: { event: ClientEvent; splash: SplashScreen | null; templates: Templates }) {
    const router = useRouter();
    const base = invitationDefaults(event, templates);

    const [primary, setPrimary] = useState(splash?.primary_color || base.primary);
    const [secondary, setSecondary] = useState(splash?.secondary_color || base.secondary);
    const [components, setComponents] = useState<Record<string, boolean>>(() => {
        const saved = splash?.components;
        const out: Record<string, boolean> = {};
        for (const key of ALL_COMPONENT_KEYS) {
            out[key] = saved && key in saved ? saved[key] === true || saved[key] === 1 : base.components[key];
        }
        return out;
    });
    const [status, setStatus] = useState<SplashStatus>(splash?.status ?? 'active');
    const [name, setName] = useState(splash?.name ?? `${event.name} splash`);
    const [nameError, setNameError] = useState(false);

    const create = useCreateSplashScreen(() => router.push('/dashboard/splash-screens'));
    const update = useUpdateSplashScreen(() => router.push('/dashboard/splash-screens'));
    const saving = create.isPending || update.isPending;

    const reset = () => {
        setPrimary(base.primary);
        setSecondary(base.secondary);
        setComponents(base.components);
    };

    const submit = () => {
        if (!name.trim()) { setNameError(true); toast.error('Please fill all mandatory fields.'); return; }
        if (!HEX.test(primary) || !HEX.test(secondary)) {
            toast.error('Colours must be hex values like #8B1E3F.');
            return;
        }
        const hostLine = [event.host_one, event.host_two].filter(Boolean).join(' & ') || event.name;
        const body = {
            name: name.trim(),
            main_title: hostLine.slice(0, 60),
            background_type: 'solid_color',
            // The invitation it mirrors, and the splash's own colours and switches.
            theme_id: event.theme_id,
            primary_color: primary,
            secondary_color: secondary,
            // All eleven sections: the form's switches plus the invitation's own
            // photos / decoration; the three that never show are forced off (the
            // server forces them off as well).
            components: {
                ...components,
                ...Object.fromEntries(SPLASH_HIDDEN_KEYS.map((k) => [k, false])),
            },
            component_order: base.order,
            // No frame, background colour or picture of its own.
            bg_color: null,
            decoration_url: null,
            background_config: {
                theme_id: event.theme_id, primary_color: primary, secondary_color: secondary, show_organizer: false,
            },
            status,
        } as const;

        if (splash) update.mutate({ id: splash.id, data: body });
        else create.mutate({ ...body, event_id: event.id, loader_enabled: true });
    };

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-5">
                <Card className="py-0">
                    <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px] font-medium">Event</Label>
                            <Input value={event.name} disabled />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px] font-medium">Splash name <span className="text-destructive">*</span></Label>
                            <Input
                                value={name}
                                maxLength={150}
                                onChange={(e) => { setName(e.target.value); setNameError(false); }}
                                className={cn(nameError && 'border-destructive')}
                            />
                            {nameError && <p className="text-[11.5px] text-destructive">This field is required</p>}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[12.5px] font-medium">Status</Label>
                            <Select value={status} onValueChange={(v) => setStatus(v as SplashStatus)}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active — guests see it</SelectItem>
                                    <SelectItem value="draft">Draft — hidden from guests</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                <Card className="py-0">
                    <CardContent className="flex flex-col gap-5 p-5">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[13.5px] font-bold">Colours</p>
                            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={reset}>
                                <RotateCcw className="size-3.5" /> Reset to the invitation&apos;s own
                            </Button>
                        </div>
                        <ColourRow label="Primary Colour" hint="Names and QR" value={primary} onChange={setPrimary} swatches={PRIMARY_SWATCHES} />
                        <ColourRow label="Secondary Colour" hint="Accents and details" value={secondary} onChange={setSecondary} swatches={SECONDARY_SWATCHES} />
                    </CardContent>
                </Card>

                <Card className="py-0">
                    <CardContent className="flex flex-col gap-1 p-5">
                        <p className="mb-2 text-[13.5px] font-bold">Sections</p>
                        {SPLASH_SWITCHES.map((s) => (
                            <div key={s.key} className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
                                <Label htmlFor={`sw-${s.key}`} className="text-[13px] font-medium">{s.label}</Label>
                                <Switch
                                    id={`sw-${s.key}`}
                                    checked={components[s.key]}
                                    onCheckedChange={(v) => setComponents((c) => ({ ...c, [s.key]: v }))}
                                />
                            </div>
                        ))}
                        <p className="pt-2 text-[11.5px] text-muted-foreground">
                            The QR code and Organizer &amp; Contact are never shown on a splash.
                        </p>
                    </CardContent>
                </Card>

                <div className="flex flex-wrap items-center justify-end gap-3">
                    <Button asChild variant="outline"><Link href="/dashboard/splash-screens">Cancel</Link></Button>
                    <Button disabled={saving} onClick={submit}>
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                        {splash ? 'Save Changes' : 'Save Splash'}
                    </Button>
                </div>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
                <SplashPreviewCard
                    event={event}
                    look={{ themeId: event.theme_id, primary, secondary, components, order: base.order }}
                />
            </div>
        </div>
    );
}

function ColourRow({
    label, hint, value, onChange, swatches,
}: { label: string; hint: string; value: string; onChange: (v: string) => void; swatches: string[] }) {
    return (
        <div className="flex flex-col gap-2">
            <div>
                <p className="text-[12.5px] font-medium">{label}</p>
                <p className="text-[11.5px] text-muted-foreground">{hint}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {swatches.map((c) => (
                    <button
                        key={c}
                        type="button"
                        aria-label={`${label} ${c}`}
                        onClick={() => onChange(c)}
                        className={cn(
                            'size-8 rounded-full border-2 transition',
                            value.toLowerCase() === c.toLowerCase() ? 'border-foreground ring-2 ring-primary/30' : 'border-transparent',
                        )}
                        style={{ backgroundColor: c }}
                    />
                ))}
                <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-full border">
                    <span className="absolute inset-0" style={{ backgroundColor: HEX.test(value) ? value : '#000000' }} />
                    <input
                        type="color"
                        value={HEX.test(value) ? value : '#000000'}
                        onChange={(e) => onChange(e.target.value.toUpperCase())}
                        className="absolute inset-0 cursor-pointer opacity-0"
                    />
                </label>
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="#8B1E3F"
                    className="h-8 w-28 font-mono text-[12px]"
                />
            </div>
        </div>
    );
}
