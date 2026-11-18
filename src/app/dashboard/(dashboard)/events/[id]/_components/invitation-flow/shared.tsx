"use client";

import { Check, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientEvent } from "@/hooks/use-client-events";
import type { TemplateOption } from "@/hooks/use-client-portal";
import type { InvitationData } from "@/components/common/invitation-card";

/**
 * Shared pieces of the Invitations flow (Jamal's "Template" designs, 2026-11-18):
 * the header card, the 4-step bar, and the invitation DESIGN the host edits —
 * only the old invitation-form fields (template, component switches + order,
 * primary + secondary colour, QR style, own picture, event logo).
 */

export const FLOW_STEPS = [
    { n: 1, label: "Choose Template" },
    { n: 2, label: "Customize & Save" },
    { n: 3, label: "Share with Guests" },
] as const;
/**
 * 1-3 = the wizard. 4 = the Shared Invitations list — its own page, not a
 * wizard step (Jamal, 2026-11-18: no step bar or "STEP 4" there, list only).
 */
export type FlowStep = 1 | 2 | 3 | 4;

/* ── The design ───────────────────────────────────────────────────────── */

/** The invitation components, canonical order. Mirrors the backend's list. */
export const COMPONENT_KEYS = [
    "event_title", "host_names", "date_time", "venue", "event_qr_code", "organizer",
    "event_photos", "contact_details", "invitation_message",
    "footer_note", "decoration_elements",
] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

/**
 * The on/off switches — the same seven the old Card Settings had (a switch may
 * cover two sections). Event Photos and Decoration have no switch: they follow
 * the template.
 */
export const COMPONENT_SWITCHES: { label: string; keys: ComponentKey[] }[] = [
    { label: "Title & Names", keys: ["event_title", "host_names"] },
    { label: "Invitation Message", keys: ["invitation_message"] },
    { label: "Date & Time", keys: ["date_time"] },
    { label: "Venue", keys: ["venue"] },
    { label: "Event QR Code", keys: ["event_qr_code"] },
    { label: "Organizer & Contact", keys: ["organizer", "contact_details"] },
    { label: "Footer (Thanks / Note)", keys: ["footer_note"] },
];

export interface InvitationDesign {
    theme_id: string;
    primary_color: string;
    /** "" = the template's own secondary colour. */
    secondary_color: string;
    qr_style: number;
    custom_image: string;
    logo_image: string;
    /** null = follow the template. */
    components: Record<ComponentKey, boolean> | null;
    component_order: ComponentKey[] | null;
}

export const designFromEvent = (e: ClientEvent): InvitationDesign => {
    const comps = e.components
        ? (Object.fromEntries(COMPONENT_KEYS.map((k) => [k, !!Number(e.components?.[k] ?? 1)])) as Record<ComponentKey, boolean>)
        : null;
    const order = e.component_order?.length
        ? (e.component_order.filter((k): k is ComponentKey => (COMPONENT_KEYS as readonly string[]).includes(k)))
        : null;
    return {
        theme_id: e.theme_id || "",
        primary_color: e.primary_color || "#E91E63",
        secondary_color: e.secondary_color || "",
        qr_style: e.qr_style ?? 0,
        custom_image: e.custom_image || "",
        logo_image: e.logo_image || "",
        components: comps,
        component_order: order,
    };
};

/** What the template says before any override. */
export const templateComponents = (t: TemplateOption | null): Record<ComponentKey, boolean> => {
    const map = {} as Record<ComponentKey, boolean>;
    for (const key of COMPONENT_KEYS) {
        const v = t?.components?.[key];
        map[key] = v === undefined || !!Number(v);
    }
    // On by default, whatever the template says; the host may switch it off.
    map.event_qr_code = true;
    return map;
};
export const templateOrder = (t: TemplateOption | null): ComponentKey[] => {
    const given = (t?.component_order ?? []).filter((k): k is ComponentKey => (COMPONENT_KEYS as readonly string[]).includes(k));
    return [...given, ...COMPONENT_KEYS.filter((k) => !given.includes(k))];
};

/** The design as an event PUT payload. */
export const designPayload = (d: InvitationDesign) => ({
    theme_id: d.theme_id || null,
    primary_color: d.primary_color,
    secondary_color: d.secondary_color || null,
    qr_style: d.qr_style,
    custom_image: d.custom_image || null,
    logo_image: d.logo_image || null,
    components: d.components ? Object.fromEntries(COMPONENT_KEYS.map((k) => [k, d.components![k] ? 1 : 0])) : null,
    component_order: d.component_order,
});

/** What is printed on the card for this event. */
export const invitationDataFor = (e: ClientEvent, d: InvitationDesign): InvitationData => ({
    name: e.name,
    hostOne: e.host_one,
    hostTwo: e.host_two,
    tagline: e.tagline,
    description: e.description,
    startDate: e.start_date,
    startTime: e.start_time,
    endTime: e.end_time,
    venueName: e.venue_name,
    venueAddress: e.venue_address,
    organizer: e.organizer,
    contact: e.contact_phone,
    footerNote: e.footer_note,
    primaryColor: d.primary_color,
    qrToken: e.qr_token,
    qrStyle: d.qr_style,
    logoImage: d.logo_image || null,
});

/* ── Formatting ───────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const prettyDate = (d?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
};
export const weekday = (d?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
    return m ? DAYS[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()] : "";
};
export const prettyTime = (t?: string | null) => {
    const m = /^(\d{2}):(\d{2})/.exec(String(t ?? ""));
    if (!m) return "";
    const h = Number(m[1]);
    return `${String(h % 12 || 12).padStart(2, "0")}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};
/** "15 Nov, 10:24 AM" from an ISO timestamp, in the viewer's time. */
export const prettyStamp = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const h = d.getHours();
    return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(h % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const hostsOf = (e: ClientEvent) => [e.host_one, e.host_two].map((v) => (v ?? "").trim()).filter(Boolean).join(" & ");
export const initials = (name?: string | null) =>
    (name ?? "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

/* ── Header card + step bar ───────────────────────────────────────────── */

export function FlowHeader({
    title, subtitle, event, code, step,
}: { title: string; subtitle: string; event: ClientEvent; code: string; step: FlowStep }) {
    const category = (event.category?.name ?? "").toUpperCase();
    return (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-5 py-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Mail className="size-6" /></span>
            <div className="min-w-0 flex-1">
                <h1 className="text-[20px] font-bold leading-tight text-foreground">{title}</h1>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {subtitle} • {hostsOf(event) || event.name}
                </p>
            </div>
            <span className="hidden text-[11.5px] font-medium tracking-wide text-muted-foreground sm:inline">
                {[category, `EVENT ${code.replace(/^#/, "")}`].filter(Boolean).join(" · ")}
            </span>
            {step <= FLOW_STEPS.length && (
                <span className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-[12px] font-bold text-primary">
                    STEP {step} OF {FLOW_STEPS.length}
                </span>
            )}
        </div>
    );
}

export function FlowStepper({
    step, done, onStep,
}: { step: FlowStep; done: (n: FlowStep) => boolean; onStep: (n: FlowStep) => void }) {
    return (
        <nav aria-label="Invitation steps" className="rounded-xl border border-border bg-card px-4 py-3">
            <ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                {FLOW_STEPS.map((s, i) => {
                    const n = s.n as FlowStep;
                    const current = step === n;
                    const complete = !current && done(n);
                    return (
                        <li key={s.n} className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => onStep(n)}
                                aria-current={current ? "step" : undefined}
                                className="flex items-center gap-2 rounded-md px-1 py-0.5 text-[13px] font-semibold transition hover:opacity-80"
                            >
                                <span className={cn(
                                    "grid size-6 place-items-center rounded-full text-[11.5px] font-bold",
                                    current ? "bg-primary text-primary-foreground"
                                        : complete ? "bg-emerald-500 text-white"
                                            : "border border-border text-muted-foreground",
                                )}>
                                    {complete ? <Check className="size-3.5" /> : s.n}
                                </span>
                                <span className={cn(current ? "text-primary" : complete ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                            </button>
                            {i < FLOW_STEPS.length - 1 && <span className="hidden h-px w-10 bg-border md:block lg:w-24" aria-hidden />}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
