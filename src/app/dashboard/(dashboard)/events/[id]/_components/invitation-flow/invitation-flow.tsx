"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEventOptions, type TemplateOption } from "@/hooks/use-client-portal";
import { useUpdateEvent, useUploadInvitationImage, type ClientEvent } from "@/hooks/use-client-events";
import type { SendInvitationResult } from "@/hooks/use-invitation-sends";
import { InvitationCard } from "@/components/common/invitation-card";
import { eventShareLink } from "@/components/common/share-event-dialog";
import { nodeToPngBlob } from "@/lib/export-invitation";
import { ChooseTemplate } from "./choose-template";
import { Customize } from "./customize";
import { SentScreen, ShareGuests } from "./share-guests";
import { TrackResponses } from "./track-responses";
import {
    FlowHeader, FlowStepper, designFromEvent, designPayload, invitationDataFor, templateComponents, templateOrder,
    type FlowStep, type InvitationDesign,
} from "./shared";

/**
 * The event's Invitation page = the Invitations flow (Jamal's "Template"
 * designs, 2026-11-18): a 3-step wizard — 1 Choose Template → 2 Customize & Save
 * → 3 Share with Guests — plus the Shared Invitations list (`step=4`), shown on
 * its own with no step bar. Replaces the embedded Edit Event invitation pages.
 *
 * The step lives in the address (`?tab=invitation&step=N`) so a reload or a
 * shared link lands on the same step. A new invitation opens on step 1; one
 * already designed opens on the Shared Invitations list.
 *
 * Saving writes the old invitation fields onto the event, then renders the card
 * off-screen and stores it as the event's invitation image — the picture the
 * app's View Invitation and the Share popup show.
 */

const TITLES: Record<FlowStep, [string, string]> = {
    1: ["Invitation Templates", "Admin-created templates"],
    2: ["Customize Invitation Template", "Edit permitted properties"],
    3: ["Share Invitation with Guests", "Send invitation & QR"],
    4: ["Shared Invitations", "Guest delivery"],
};

export function InvitationFlow({ event, code }: { event: ClientEvent; code: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const options = useEventOptions();
    const opts = options.data;
    const allTemplates = useMemo(() => opts?.templates ?? [], [opts?.templates]);

    const raw = Number(params.get("step"));
    const step: FlowStep = raw >= 1 && raw <= 4 ? (raw as FlowStep) : event.theme_id ? 4 : 1;
    const goStep = (n: FlowStep) => {
        const next = new URLSearchParams(params.toString());
        next.set("tab", "invitation");
        next.set("step", String(n));
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        setSent(null);
    };

    /* ── the design, loaded once per event ── */
    const [saved, setSaved] = useState<InvitationDesign>(() => designFromEvent(event));
    const [design, setDesignState] = useState<InvitationDesign>(saved);
    const loadedFor = useRef(event.id);
    useEffect(() => {
        if (loadedFor.current === event.id) return;
        loadedFor.current = event.id;
        const d = designFromEvent(event);
        setSaved(d);
        setDesignState(d);
    }, [event]);
    const setDesign = (fn: (d: InvitationDesign) => InvitationDesign) => setDesignState((d) => fn(d));
    const dirty = JSON.stringify(design) !== JSON.stringify(saved);

    const baseTemplate = allTemplates.find((t) => t.code === design.theme_id) ?? null;
    /** The card as drawn: the event's secondary colour and own picture applied. */
    const template: TemplateOption | null = baseTemplate
        ? {
            ...baseTemplate,
            secondary_color: design.secondary_color || baseTemplate.secondary_color,
            ...(baseTemplate.background_type === "custom" && design.custom_image ? { background_image: design.custom_image } : {}),
        }
        : null;
    const components = design.components ?? templateComponents(baseTemplate);
    const order = design.component_order ?? templateOrder(baseTemplate);
    const data = invitationDataFor(event, design);
    const link = eventShareLink(event.qr_token);

    /* ── save ── */
    const update = useUpdateEvent();
    const uploadImage = useUploadInvitationImage();
    const exportRef = useRef<HTMLDivElement>(null);
    const [savingImage, setSavingImage] = useState(false);

    const save = async (thenStep?: FlowStep) => {
        try {
            await update.mutateAsync({ id: event.id, data: designPayload(design) });
        } catch {
            return; // the hook already showed why
        }
        setSaved(design);
        // The finished card → the event's invitation image. Silent: the event is
        // already saved, and a failed upload only means the app draws its own card.
        setSavingImage(true);
        window.setTimeout(async () => {
            try {
                const card = exportRef.current?.querySelector<HTMLElement>("[data-invitation-card]");
                if (card) await uploadImage.mutateAsync({ eventId: event.id, image: await nodeToPngBlob(card) });
            } catch (e) {
                console.error("[invitation-flow] invitation image not stored", e);
            } finally {
                setSavingImage(false);
            }
        }, 700);
        if (thenStep) goStep(thenStep);
    };

    const [sent, setSent] = useState<SendInvitationResult | null>(null);
    const done = (n: FlowStep) => (n === 1 ? !!saved.theme_id : n === 2 ? !!saved.theme_id && !dirty : false);
    const [title, subtitle] = TITLES[step];

    return (
        <div className="flex flex-col gap-4" data-invitation-flow>
            <FlowHeader title={title} subtitle={subtitle} event={event} code={code} step={step} />
            {step !== 4 && <FlowStepper step={step} done={done} onStep={goStep} />}

            {step === 1 && (
                <ChooseTemplate
                    templates={allTemplates}
                    loading={options.isLoading}
                    categories={opts?.categories ?? []}
                    eventCategoryId={event.event_category_id ?? null}
                    selected={baseTemplate}
                    customImage={design.custom_image}
                    data={data}
                    onPick={(t) => setDesign((d) => ({
                        ...d,
                        theme_id: t.code,
                        // A new template starts on its own colours and its own parts.
                        secondary_color: "",
                        primary_color: t.secondary_color || d.primary_color,
                        components: d.theme_id === t.code ? d.components : null,
                        component_order: d.theme_id === t.code ? d.component_order : null,
                    }))}
                    onCustomize={() => goStep(2)}
                />
            )}

            {step === 2 && (
                <Customize
                    event={event}
                    design={design}
                    setDesign={setDesign}
                    template={template}
                    templates={allTemplates.filter((t) => !t.event_category_id || !event.event_category_id || Number(t.event_category_id) === Number(event.event_category_id))}
                    data={data}
                    components={components}
                    order={order}
                    dirty={dirty}
                    saving={update.isPending}
                    eventInfoHref={`${pathname}?tab=information`}
                    onReset={() => setDesignState(saved)}
                    onSaveDraft={() => void save()}
                    onSaveContinue={() => void save(3)}
                />
            )}

            {step === 3 && (sent
                ? <SentScreen result={sent} onAnother={() => setSent(null)} onView={() => goStep(4)} />
                : <ShareGuests event={event} link={link} code={code} onSent={setSent} />)}

            {step === 4 && (
                <TrackResponses
                    event={event}
                    template={saved.theme_id ? template : null}
                    data={data}
                    onShareAgain={() => goStep(3)}
                    onCreate={() => goStep(saved.theme_id ? 3 : 1)}
                    onViewTemplates={() => goStep(1)}
                />
            )}

            {/* Off-screen copy of the saved card, captured as the invitation image after Save. */}
            {template && (
                <div ref={exportRef} aria-hidden className="pointer-events-none fixed top-0" style={{ left: -10000 }} data-saving-image={savingImage || undefined}>
                    <InvitationCard template={template} data={data} componentsOverride={design.components} orderOverride={design.component_order} className="w-[360px]" />
                </div>
            )}
        </div>
    );
}
