"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowLeft,
    faArrowRight,
    faCheck,
    faCircleInfo,
    faCalendarDays,
    faClock,
    faQrcode,
    faLink,
    faEnvelope,
    faPalette,
    faGripVertical,
    faRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp as faWhatsappBrand } from "@fortawesome/free-brands-svg-icons";
import { ChevronDown, ChevronUp, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import { useEventOptions, type MenuOption } from "@/hooks/use-client-portal";
import {
    useCreateEvent,
    useUpdateEvent,
    useClientEvent,
    useUploadEventCover,
    useUploadInvitationImage,
    type ClientEvent,
} from "@/hooks/use-client-events";
import { PRIMARY_SWATCHES } from "@/lib/event-themes";
import { HomeTemplatePicker } from "./home-template-picker";
import {
    resolveArtwork,
    suitsScope,
    templatesForEvent,
} from "@/lib/event-templates";
import { downloadNodeAsImage, downloadQrAsPng, downloadQrAsSvg, fileSlug, nodeToPngBlob } from "@/lib/export-invitation";
import { EventQr } from "@/components/common/event-qr";
import { InvitationCard, type InvitationData } from "@/components/common/invitation-card";
import { TemplateArtwork } from "@/components/common/template-artwork";
import { DownloadFormatButton, DownloadingOverlay, type DownloadKind } from "@/components/common/invitation-download";
import { SignInPrompt } from '@/components/common/sign-in-prompt';
import { ImageCropDialog } from '@/components/common/image-crop-dialog';
import { formatDate } from '@/lib/format';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * The six-step event wizard, used by BOTH routes.
 *
 *   /dashboard/events/create        <EventWizard />
 *   /dashboard/events/[id]/edit     <EventWizard eventId={n} />
 *
 * It lives here rather than in the create route because "Continue Editing" on a
 * draft has to reopen the very same form. Duplicating 800 lines to change a
 * POST into a PUT is how the two drift until a field added to one is missing
 * from the other.
 *
 * ── EDIT MODE ────────────────────────────────────────────────────────────────
 * `eventId` switches three things and nothing else: where the initial values
 * come from, whether step 5 POSTs or PUTs, and the wording. The steps, the
 * validation and the plan gating are shared, which is the point.
 *
 * The prefill runs ONCE, guarded by a ref. Re-running it on every render of the
 * query would overwrite whatever the user had just typed each time TanStack
 * refetched in the background.
 *
 *
 * ALL SIX STEPS ARE REAL. Steps 1 and 3 read the plan-scoped taxonomy and menus
 * from `/client/event-options`; step 5's "Create Event" POSTs to
 * `/client/events` and only advances to step 6 when the server answers.
 *
 * THE QR CODE. The backend issues it inside the same transaction that writes
 * the row, so the create response already carries `qr_token` and step 6 renders
 * the code with no second request. What the image encodes is the ENCRYPTED
 * token itself — a scanner returns an opaque `EVQ1.…` string, and only
 * `POST /client/events/qr/decode` can turn it back into event details.
 *
 * STILL PRESENTATIONAL: the invitation layout in step 5 (its QR is a
 * placeholder, because no event exists to encode until step 5 is submitted) and
 * the share tiles on step 6.
 *
 * PLAN GATING IS ENFORCED TWICE. The dropdowns only offer what the plan allows,
 * and the server re-checks every id on the way in — so a hand-rolled POST
 * cannot buy more than the UI shows.
 */

/**
 * Same order as the mobile app's Create Event (V2, 2026-10-31). The invitation
 * design steps were taken out — the invitation becomes its own module later.
 */
const STEPS = [
    "Event Type",
    "Basic Details",
    "Date & Time",
    "Venue",
    "Menus",
    "Settings",
    "Organizer Settings",
    "Review",
    "Event Created",
] as const;

/** Step numbers, so nothing below depends on a bare 5 or 6. */
const S_TYPE = 1;
const S_BASIC = 2;
const S_DATE = 3;
const S_VENUE = 4;
const S_MENUS = 5;
const S_SETTINGS = 6;
const S_ORGANIZER = 7;
const S_REVIEW = 8;
const S_CREATED = 9;
/** The invitation pages — reachable only from Edit Event → Invitation Card. */
const S_DESIGN = 10;
const S_PREVIEW = 11;

/**
 * Edit Event sections, as in the mobile app's Edit Event hub: each opens on its
 * own with Cancel / Save, and the save is the same full update.
 */
export type EditSectionKey = "basic" | "date" | "venue" | "menus" | "organizer" | "invitation";

const SECTION_PAGES: Record<EditSectionKey, { title: string; subtitle: string; pages: number[] }> = {
    basic: { title: "Basic Details", subtitle: "Update title, hosts and photo.", pages: [S_BASIC] },
    date: { title: "Date & Time", subtitle: "Edit event date and time.", pages: [S_DATE] },
    venue: { title: "Venue", subtitle: "Edit venue details and map location.", pages: [S_VENUE] },
    menus: { title: "Event App Menu", subtitle: "Manage app menus and features.", pages: [S_MENUS] },
    organizer: { title: "Organizer Settings", subtitle: "Hosted by, contact and footer note.", pages: [S_ORGANIZER] },
    invitation: { title: "Invitation Card", subtitle: "Choose template, card settings and colour.", pages: [S_DESIGN, S_PREVIEW] },
};

export const EDIT_SECTION_KEYS = Object.keys(SECTION_PAGES) as EditSectionKey[];

// Themes and swatches live in lib/event-themes.ts because the dashboard cards
// render an event's artwork from the same list. They were two copies before,
// which is how a card and its own preview showed different gradients.

/**
 * A Default menu (Menu Management → Default) is always on and cannot be
 * switched off; an Add-on can. Read from the menu, never from a slug list, so
 * a menu added tomorrow follows the same rule without a code change.
 */
const isDefaultMenu = (m: Pick<MenuOption, "is_default">) => Number(m.is_default) === 1;

const ALL_STYLES = "all";

/**
 * The four template types — a template's `background_type`, in the admin
 * form's order. The same four the mobile app shows as tabs over its template
 * list, so the two filter the same way (Jamal, 2026-10-05).
 */
const TEMPLATE_TYPES = [
    { value: "color", label: "Color" },
    { value: "image", label: "Image" },
    { value: "gradient", label: "Gradient" },
    { value: "custom", label: "Custom" },
] as const;

const templateTypeLabel = (type: string | null | undefined) =>
    TEMPLATE_TYPES.find((t) => t.value === type)?.label ?? null;

const TIME_ZONES = [
    "(GMT +05:30) India Standard Time",
    "(GMT +04:00) Gulf Standard Time",
    "(GMT +00:00) Greenwich Mean Time",
    "(GMT -05:00) Eastern Standard Time",
];

interface FormState {
    category_id: string;
    name: string;
    host_one: string;
    host_two: string;
    tagline: string;
    description: string;
    start_date: string;
    end_date: string;
    start_time: string;
    end_time: string;
    timezone: string;
    venue_name: string;
    venue_address: string;
    venue_landmark: string;
    venue_map_link: string;
    /** Stored URL of the venue photo; "" = none. */
    venue_image: string;
    /** Map pin, as typed; both blank = no pin. */
    venue_lat: string;
    venue_lng: string;
    /** The event's ONE ceremony; it has no date/time of its own. */
    ceremony_title: string;
    ceremony_venue: string;
    ceremony_description: string;
    organizer: string;
    contact_phone: string;
    contact_email: string;
    footer_note: string;
    privacy: string;
    status: string;
    theme_id: string;
    /** Mobile app home screen design picked in Step 1; "" = none. */
    home_screen_template_id: string;
    primary_color: string;
    /** The invitation's secondary colour (accents and details); "" = follow the template. */
    secondary_color: string;
    /** How the invitation draws its QR code: 0 classic, 1 rounded, 2 heart. */
    qr_style: number;
    /** Stored URL of the event's own photo; "" = none. See CoverImageField. */
    cover_image: string;
    /** The host's own picture for a custom-type template. "" = the template's own. */
    custom_image: string;
}

/** The app's own secondary swatches (Create Event, Card Settings). */
const SECONDARY_SWATCHES = ["#D97706", "#8B5CF6", "#EC4899", "#06B6D4", "#10B981"];

/** `events.qr_style`: 0 classic, 1 rounded, 2 heart, the same three the app offers. */
const QR_STYLES = [
    { value: 0, label: "Classic" },
    { value: 1, label: "Rounded" },
    { value: 2, label: "Heart" },
] as const;

const EMPTY: FormState = {
    category_id: "",
    name: "", host_one: "", host_two: "", tagline: "", description: "",
    start_date: "", end_date: "", start_time: "", end_time: "",
    timezone: TIME_ZONES[0],
    venue_name: "", venue_address: "",
    venue_landmark: "", venue_map_link: "", venue_image: "", venue_lat: "", venue_lng: "",
    ceremony_title: "", ceremony_venue: "", ceremony_description: "",
    organizer: "", contact_phone: "", contact_email: "", footer_note: "",
    privacy: "public", status: "upcoming",
    // Blank, not a hardcoded slug: the theme catalogue is whatever the client's
    // PLAN grants, so nothing can be preselected until those templates load.
    theme_id: "", primary_color: PRIMARY_SWATCHES[0],
    home_screen_template_id: "",
    secondary_color: "", qr_style: 0,
    cover_image: "",
    custom_image: "",
};

/** The invitation components, canonical order. Mirrors the backend's list. */
const COMPONENT_KEYS = [
    "event_title", "host_names", "date_time", "venue", "event_qr_code", "organizer",
    "event_photos", "contact_details", "invitation_message",
    "footer_note", "decoration_elements",
] as const;

type ComponentKey = (typeof COMPONENT_KEYS)[number];


/**
 * The invitation's on/off switches — EIGHT, the same eight the mobile app
 * offers (Jamal, 2026-10-05), over the eleven sections the admin's template
 * builder has. A switch that covers two sections reads on when either is on,
 * and sets both.
 *
 * The QR code is ON BY DEFAULT — it starts on whatever the template says —
 * and the client may switch it off.
 *
 * The client gets the SAME rows the admin's template builder shows for that
 * template (Jamal, 2026-10-06), and may switch each on or off and reorder
 * them: Decoration Elements has NO switch (the admin's builder has none either: it is
 * on when the template has a decoration), and neither has Event Photos
 * (Jamal, 2026-10-07): on a Custom template the host MUST upload their own
 * picture and it is always drawn; every other type's picture comes from the
 * template. The Component Order list shows the same rows; a merged pair
 * moves together.
 */
const COMPONENT_SWITCHES: { label: string; keys: ComponentKey[] }[] = [
    { label: "Title & Names", keys: ["event_title", "host_names"] },
    { label: "Invitation Message", keys: ["invitation_message"] },
    { label: "Date & Time", keys: ["date_time"] },
    { label: "Venue", keys: ["venue"] },
    { label: "Event QR Code", keys: ["event_qr_code"] },
    { label: "Organizer & Contact", keys: ["organizer", "contact_details"] },
    { label: "Footer (Thanks / Note)", keys: ["footer_note"] },
];

export function EventWizard({
    eventId,
    initialThemeId,
    section,
}: {
    eventId?: number;
    /** Edit one section (Edit Event hub) instead of the whole wizard. */
    section?: EditSectionKey;
    /**
     * Preselected template code, from `/dashboard/events/create?theme=<code>` —
     * what "Use Template" on the Templates screen hands over. It cannot be
     * validated here (the plan's templates have not loaded yet), so it is held
     * as-is and checked against the real catalogue by the effect below.
     */
    initialThemeId?: string;
}) {
    const isEdit = !!eventId;
    const router = useRouter();

    /** The Exit button's question — new events only. */
    const [exitOpen, setExitOpen] = useState(false);
    /** Set by "Save as Draft" on that question: leave once the save lands. */
    const exitAfterSave = useRef(false);

    const sectionPages = section ? SECTION_PAGES[section].pages : null;
    const [step, setStep] = useState(sectionPages ? sectionPages[0] : 1);
    const pageIndex = sectionPages ? sectionPages.indexOf(step) : -1;
    const hubHref = eventId ? `/dashboard/events/${eventId}/edit` : "/dashboard/events";
    const [form, setForm] = useState<FormState>(EMPTY);
    const [errors, setErrors] = useState<Record<string, boolean>>({});
    /** One dialog, driven by whatever needs confirming: a date, or the save. */
    const [confirm, setConfirm] = useState<{
        title: string;
        body: string;
        action: string;
        onConfirm: () => void;
    } | null>(null);
    const [menus, setMenus] = useState<Record<number, boolean>>({});
    /** Menu ids in the host's order (`menu_order`); [] = the admin's order. */
    const [menuOrder, setMenuOrder] = useState<number[]>([]);
    /** Step 4's own narrowing, on top of the plan + event-category scoping
     * `dbTemplates` already does — see the Template Type filter below. */
    const [styleFilter, setStyleFilter] = useState<string>(ALL_STYLES);
    /** The first of the two filters: the template's design style. */
    const [designFilter, setDesignFilter] = useState<string>(ALL_STYLES);

    /**
     * The client's own component overrides for THIS event.
     *
     * Null means "inherit from the template" — the state the wizard starts in
     * and the state Reset returns to. Only once the client actually touches a
     * toggle or drags a chip do these become a real override that is sent, so
     * an untouched event keeps following the template as the admin edits it.
     */
    const [compOverride, setCompOverride] = useState<Record<ComponentKey, boolean> | null>(null);
    const [orderOverride, setOrderOverride] = useState<ComponentKey[] | null>(null);
    /** The switch being dragged in Component Order, by its label. */
    const [dragLabel, setDragLabel] = useState<string | null>(null);

    /**
     * Download.
     *
     * `previewWrapRef` wraps step 5's preview and `qrWrapRef` step 6's code; the
     * capture targets `[data-invitation-card]` INSIDE the wrapper rather than
     * the wrapper itself, so the caption and the button around it are not part
     * of the image. Same marker the admin panel's export uses.
     */
    const previewWrapRef = useRef<HTMLDivElement>(null);
    const qrWrapRef = useRef<HTMLDivElement>(null);
    /**
     * Step 6's own capture target.
     *
     * The exporter rasterises a real DOM node — it cannot draw an invitation
     * from data alone — and step 6 shows a QR and a summary, not the card. So
     * the card is mounted off-canvas there purely to be captured, the same
     * pattern `InvitationDownload` uses on the detail page.
     */
    const exportCardRef = useRef<HTMLDivElement>(null);
    const [downloading, setDownloading] = useState<DownloadKind | null>(null);
    /** The saved row. Null until step 5 succeeds; step 6 renders from it. */
    const [created, setCreated] = useState<ClientEvent | null>(null);

    // Edit mode only. `enabled` is false for a create, so this costs nothing.
    const existing = useClientEvent(eventId ?? null);

    // Advancing is the mutation's onDone, not something goNext() does on its
    // own — the step must not move until the server has actually written the
    // row, or a failed save leaves the user looking at a success screen.
    const createEvent = useCreateEvent((event) => {
        // Saved as a draft from the Exit question: back to the list, not on
        // to the "Event Created" step — a draft is not created yet.
        if (exitAfterSave.current) {
            exitAfterSave.current = false;
            router.push("/dashboard/events");
            return;
        }
        setCreated(event);
        setStep(S_CREATED);
    });
    const updateEvent = useUpdateEvent((event) => {
        if (section) {
            router.push(`/dashboard/events/${event.id}/edit`);
            return;
        }
        setCreated(event);
        setStep(S_CREATED);
    });
    const saving = createEvent.isPending || updateEvent.isPending;

    /*
      ── THE FINISHED INVITATION, STORED SILENTLY ─────────────────────────
      Once the save lands, step 6 shows the real card (with its live QR). It is
      rendered to PNG here and stored on the event (`invitation_image`), which
      is what the mobile app's View Invitation shows. No toast, no spinner: the
      event is already saved, and a failed upload only means the app falls back
      to its drawn card until the next save. Once per saved version, keyed on
      id + updated_at, so a re-render does not upload twice.
    */
    const uploadInvitation = useUploadInvitationImage();
    const uploadedFor = useRef<string | null>(null);
    useEffect(() => {
        if (step !== S_CREATED || !created?.id) return;
        const key = `${created.id}:${created.updated_at ?? ""}`;
        if (uploadedFor.current === key) return;
        uploadedFor.current = key;

        // A beat for the card's QR and artwork to mount before capturing.
        const timer = window.setTimeout(async () => {
            const card = exportCardRef.current?.querySelector<HTMLElement>("[data-invitation-card]");
            if (!card) return;
            try {
                const image = await nodeToPngBlob(card);
                await uploadInvitation.mutateAsync({ eventId: created.id, image });
            } catch (error) {
                console.error("[event-wizard] invitation image not stored", error);
            }
        }, 800);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, created?.id, created?.updated_at]);

    /**
     * Prefill from the loaded row, exactly once.
     *
     * Without the ref this re-ran on every background refetch and threw away
     * whatever the user had typed since. `menus` is seeded here too, so an
     * unticked menu stays unticked instead of being re-defaulted to on by the
     * seeding effect further down.
     */
    const prefilled = useRef(false);
    useEffect(() => {
        if (!isEdit || prefilled.current) return;
        const row = existing.data;
        if (!row) return;
        prefilled.current = true;

        setForm({
            category_id: row.event_category_id ? String(row.event_category_id) : "",
            name: row.name ?? "",
            host_one: row.host_one ?? "",
            host_two: row.host_two ?? "",
            tagline: row.tagline ?? "",
            description: row.description ?? "",
            start_date: row.start_date ?? "",
            end_date: row.end_date ?? "",
            // The stored value is HH:MM:SS; <input type="time"> wants HH:MM and
            // silently shows nothing at all if handed the seconds.
            start_time: (row.start_time ?? "").slice(0, 5),
            end_time: (row.end_time ?? "").slice(0, 5),
            timezone: row.timezone || TIME_ZONES[0],
            venue_name: row.venue_name ?? "",
            venue_address: row.venue_address ?? "",
            venue_landmark: row.venue_landmark ?? "",
            venue_map_link: row.venue_map_link ?? "",
            venue_image: row.venue_image ?? "",
            venue_lat: row.venue_lat != null ? String(Number(row.venue_lat)) : "",
            venue_lng: row.venue_lng != null ? String(Number(row.venue_lng)) : "",
            ceremony_title: row.ceremony_title ?? "",
            ceremony_venue: row.ceremony_venue ?? "",
            ceremony_description: row.ceremony_description ?? "",
            organizer: row.organizer ?? "",
            contact_phone: row.contact_phone ?? "",
            contact_email: row.contact_email ?? "",
            footer_note: row.footer_note ?? "",
            privacy: row.privacy ?? "public",
            status: row.status ?? "upcoming",
            theme_id: row.theme_id || "",
            home_screen_template_id: row.home_screen_template_id ? String(row.home_screen_template_id) : "",
            primary_color: row.primary_color || PRIMARY_SWATCHES[0],
            secondary_color: row.secondary_color ?? "",
            qr_style: row.qr_style ?? 0,
            cover_image: row.cover_image ?? "",
            custom_image: row.custom_image ?? "",
        });

        const picked: Record<number, boolean> = {};
        for (const id of row.menu_ids ?? []) picked[id] = true;
        setMenus(picked);
        setMenuOrder(row.menu_order ?? []);

        // Restore an override only if the row HAS one. A null stays null, so
        // an event that was following its template carries on following it.
        if (row.components) {
            setCompOverride(
                Object.fromEntries(
                    COMPONENT_KEYS.map((k) => [k, !!Number(row.components?.[k] ?? 1)])
                ) as Record<ComponentKey, boolean>
            );
        }
        if (row.component_order?.length) {
            const given = row.component_order.filter(
                (k): k is ComponentKey => (COMPONENT_KEYS as readonly string[]).includes(k)
            );
            setOrderOverride([...given, ...COMPONENT_KEYS.filter((k) => !given.includes(k))]);
        }
    }, [isEdit, existing.data]);

    // Functional updater — a picker or async field would otherwise write back a
    // stale snapshot of the whole form.
    const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => (prev[key as string] ? { ...prev, [key]: false } : prev));
    };

    const categoryId = form.category_id ? Number(form.category_id) : null;

    // One request. Everything here is already narrowed to the client's plan by
    // the backend, so the wizard cannot offer an option they have not paid for.
    const options = useEventOptions();
    const opts = options.data;

    /**
     * The menus on offer for THIS event: what the plan grants, narrowed to the
     * category picked in step 1. A NULL category on a menu means "any". The server applies the same check
     * on save.
     */
    const menuRows = useMemo(
        () => (opts?.menus ?? []).filter((m) => suitsScope(m, { categoryId })),
        [opts?.menus, categoryId]
    );

    /**
     * menuRows in the host's order (`menu_order`): ids it names first, the
     * rest after in the admin's order. This order is what the app's Explore
     * grid shows.
     */
    const orderedMenuRows = useMemo(() => {
        const rank = (id: number) => {
            const i = menuOrder.indexOf(id);
            return i < 0 ? menuOrder.length : i;
        };
        return [...menuRows].sort((a, b) => rank(a.id) - rank(b.id));
    }, [menuRows, menuOrder]);

    /** Move a menu one place up/down within its own panel. */
    const moveMenu = (rows: readonly { id: number }[], id: number, dir: -1 | 1) => {
        const i = rows.findIndex((r) => r.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= rows.length) return;
        const all = orderedMenuRows.map((m) => m.id);
        const a = all.indexOf(rows[i].id);
        const b = all.indexOf(rows[j].id);
        [all[a], all[b]] = [all[b], all[a]];
        setMenuOrder(all);
    };

    /** Every menu the plan grants, split by its own Default flag. */
    const defaultRows = useMemo(() => orderedMenuRows.filter(isDefaultMenu), [orderedMenuRows]);
    const addonRows = useMemo(() => orderedMenuRows.filter((m) => !isDefaultMenu(m)), [orderedMenuRows]);
    useEffect(() => {
        if (!menuRows.length) return;
        // In edit mode the saved selection IS the answer — defaulting unknown
        // menus to on would silently re-add every menu the client had removed.
        if (isEdit && !prefilled.current) return;
        setMenus((prev) => {
            const next = { ...prev };
            let changed = false;
            for (const m of menuRows) {
                if (next[m.id] === undefined) { next[m.id] = isEdit ? false : true; changed = true; }
            }
            return changed ? next : prev;
        });
    }, [menuRows, isEdit]);

    // Already plan-scoped by the backend; `?? []` only guards the pre-load render.
    const categoryRows = opts?.categories ?? [];

    const selectedCategory = categoryRows.find((c) => String(c.id) === form.category_id);
    /** Wedding-type events name a couple (Groom / Bride), as the mobile app does. */
    const isCouple = /wedding|marriage|engage|nikah/i.test(selectedCategory?.name ?? "");
    /**
     * The admin-authored templates on offer for THIS event.
     *
     * The backend already narrowed them to the client's plan; this narrows
     * again by the category picked in step 1, which is why it is done here
     * rather than server-side — changing the category must not cost a round
     * trip in the middle of the wizard.
     */
    const dbTemplates = useMemo(
        () => templatesForEvent(opts?.templates, { categoryId }),
        [opts?.templates, categoryId]
    );

    /**
     * The design styles actually on offer at this scope — never a hardcoded
     * list, so a style with nothing in it (for this plan + event category)
     * does not show up as a filter option with an empty result behind it.
     */
    /**
     * TWO filters (Jamal, 2026-10-05), the second inside the first:
     *   1. Design Style  — the template's `style` (Classic, Royal, Floral, …)
     *   2. Template Type — its `background_type` (Color, Image, Gradient,
     *      Custom), offering only the types the chosen style actually has —
     *      so "Classic" narrows to Classic Color / Classic Image / …
     */
    const designOptions = useMemo(
        () => Array.from(new Set(dbTemplates.map((t) => t.style).filter((v): v is string => !!v))).sort(),
        [dbTemplates]
    );
    const designTemplates = useMemo(
        () => (designFilter === ALL_STYLES ? dbTemplates : dbTemplates.filter((t) => t.style === designFilter)),
        [dbTemplates, designFilter]
    );
    const styleOptions = useMemo(
        () => TEMPLATE_TYPES.filter((type) => designTemplates.some((t) => t.background_type === type.value)),
        [designTemplates]
    );
    const styleFilteredTemplates = useMemo(
        () => (styleFilter === ALL_STYLES ? designTemplates : designTemplates.filter((t) => t.background_type === styleFilter)),
        [designTemplates, styleFilter]
    );

    // The picture is asked for ONLY while Template Type is set to Custom
    // (Jamal, 2026-10-07) — not on All Types, and not on Color / Image /
    // Gradient, whatever template happens to be selected.
    const customImageAsked = styleFilter === "custom";

    // The style filter only makes sense within the current category's
    // catalogue — switching categories (or a plan change) can leave it
    // pointing at a style no longer on offer, which would silently hide
    // everything instead of showing the reset list.
    useEffect(() => {
        if (styleFilter !== ALL_STYLES && !styleOptions.some((o) => o.value === styleFilter)) {
            setStyleFilter(ALL_STYLES);
        }
    }, [styleOptions, styleFilter]);
    useEffect(() => {
        if (designFilter !== ALL_STYLES && !designOptions.includes(designFilter)) {
            setDesignFilter(ALL_STYLES);
        }
    }, [designOptions, designFilter]);

    /**
     * Step 5's preview artwork.
     *
     * `resolveArtwork` still falls back to the built-in catalogue, and must:
     * an event SAVED before this feature holds a legacy slug in `theme_id`, and
     * reopening it for edit has to show the design it actually has rather than
     * a blank card. What changed is that step 4 no longer OFFERS those — the
     * fallback is for rendering history, not for picking something new.
     */
    // What the Primary Colour's Reset goes back to.
    const templatePrimary =
        opts?.templates?.find((t) => t.code === form.theme_id)?.secondary_color || PRIMARY_SWATCHES[0];
    // A CUSTOM template is the one type the host adds a picture to — and must
    // (Jamal, 2026-10-07). It is always drawn; there is no switch for it.
    const isCustomTemplate =
        opts?.templates?.find((t) => t.code === form.theme_id)?.background_type === "custom";
    const shownSwitches = COMPONENT_SWITCHES;
    const artwork = resolveArtwork(form.theme_id, opts?.templates, form.custom_image);
    const selectedTheme = artwork.kind === "legacy" ? artwork.theme : undefined;

    /**
     * What gets PRINTED on the invitation, wherever one is drawn.
     *
     * Defined once because it feeds two places that must agree: the template
     * tiles on step 4 and the full card on step 5. A tile carrying sample names
     * while the card carries the client's own would make choosing a design a
     * guess — the tile is there to answer "what will MY invitation look like".
     *
     * Blanks are passed through as blanks. `InvitationCard` has placeholders for
     * them; filling a missing venue with a plausible one would print something
     * about their event that is not true.
     */
    const invitationData: InvitationData = {
        name: form.name,
        hostOne: form.host_one,
        hostTwo: form.host_two,
        tagline: form.tagline,
        description: form.description,
        startDate: form.start_date,
        startTime: form.start_time,
        endTime: form.end_time,
        venueName: form.venue_name,
        venueAddress: form.venue_address,
        organizer: form.organizer,
        contact: form.contact_phone,
        footerNote: form.footer_note,
        primaryColor: form.primary_color,
        // Only exists once the event has been saved. Step 5's preview therefore
        // draws the labelled placeholder code and step 6's export draws the real
        // one — which is correct, and is why the token is read from `created`
        // rather than from the form.
        qrToken: created?.qr_token,
        qrStyle: form.qr_style,
    };

    // The card drawn with the event's own secondary colour on top of the template's.
    const cardTemplate = artwork.kind === "template"
        ? { ...artwork.template, secondary_color: form.secondary_color || artwork.template.secondary_color }
        : null;

    /**
     * What the template says, before any override — the baseline the toggles
     * start from and the thing "Reset to template" returns to.
     */
    const templateComponents = useMemo(() => {
        const map = {} as Record<ComponentKey, boolean>;
        for (const key of COMPONENT_KEYS) {
            const v = artwork.kind === "template" ? artwork.template.components?.[key] : undefined;
            // Absent means on, matching every other renderer.
            map[key] = v === undefined || !!Number(v);
        }
        // On by default, whatever the template says; the client may turn it off.
        map.event_qr_code = true;
        return map;
    }, [artwork]);

    const templateOrder = useMemo(() => {
        const given = (artwork.kind === "template" ? artwork.template.component_order ?? [] : [])
            .filter((k): k is ComponentKey => (COMPONENT_KEYS as readonly string[]).includes(k));
        return [...given, ...COMPONENT_KEYS.filter((k) => !given.includes(k))];
    }, [artwork]);

    // The override when the client has made one, the template otherwise.
    const effectiveComponents = compOverride ?? templateComponents;
    const effectiveOrder = orderOverride ?? templateOrder;
    const hasOverride = compOverride !== null || orderOverride !== null;

    /** Switching a switch starts an override from the template's baseline. */
    const toggleComponents = (keys: ComponentKey[], value: boolean) => {
        setCompOverride((prev) => ({
            ...(prev ?? templateComponents),
            ...Object.fromEntries(keys.map((k) => [k, value])),
        }));
    };

    /**
     * Component Order is arranged as the SEVEN switches, not the eleven
     * sections behind them. The stored order is still all eleven keys, so it
     * is read as a row of units: a switch (its one or two sections, kept side
     * by side) or a section that has no switch (QR code, decorations).
     */
    type OrderUnit = { label: string | null; keys: ComponentKey[] };
    const orderUnits: OrderUnit[] = [];
    for (const key of effectiveOrder) {
        const owner = COMPONENT_SWITCHES.find((item) => item.keys.includes(key));
        if (!owner) orderUnits.push({ label: null, keys: [key] });
        else if (!orderUnits.some((u) => u.label === owner.label)) {
            orderUnits.push({ label: owner.label, keys: owner.keys });
        }
    }
    /** The seven, in the order they appear on the card. */
    const orderedSwitches = orderUnits.filter(
        (u): u is { label: string; keys: ComponentKey[] } =>
            u.label !== null && shownSwitches.some((item) => item.label === u.label)
    );

    /** Drop the dragged switch in front of `target`; the rest keep their place. */
    const moveSwitch = (target: string) => {
        if (!dragLabel || dragLabel === target) return;
        const units = [...orderUnits];
        const from = units.findIndex((u) => u.label === dragLabel);
        if (from < 0) return;
        const [moved] = units.splice(from, 1);
        const to = units.findIndex((u) => u.label === target);
        if (to < 0) return;
        units.splice(to, 0, moved);
        setOrderOverride(units.flatMap((u) => u.keys));
    };

    const resetComponents = () => {
        setCompOverride(null);
        setOrderOverride(null);
    };

    /**
     * Capture the invitation card, or the QR, and hand the file to the browser.
     *
     * The event may not be saved yet on step 5, so the filename falls back to
     * whatever has been typed — a file called "invitation.png" tells whoever
     * opens the downloads folder nothing.
     */
    const downloadInvitation = async (kind: DownloadKind) => {
        if (downloading) return;
        const baseName = fileSlug(created?.name ?? form.name, "invitation");

        setDownloading(kind);
        try {
            if (kind === "qr" || kind === "qr-svg") {
                const wrap = qrWrapRef.current;
                if (!wrap) throw new Error("The QR code is not ready yet.");
                if (kind === "qr-svg") downloadQrAsSvg(wrap, baseName);
                else await downloadQrAsPng(wrap, baseName);
            } else {
                /*
                  Step 5's card is UNMOUNTED by the time step 6 renders, so its
                  ref is null and the old fallback to it could never resolve —
                  "Download Invitation" on the success screen threw "There is no
                  invitation to download yet" every time. Step 6 therefore mounts
                  its own off-canvas copy (`exportCardRef`), and that is checked
                  first because it is the one that exists there.
                */
                const card =
                    exportCardRef.current?.querySelector<HTMLElement>("[data-invitation-card]")
                    ?? previewWrapRef.current?.querySelector<HTMLElement>("[data-invitation-card]");
                if (!card) throw new Error("There is no invitation to download yet.");
                await downloadNodeAsImage(card, baseName, kind);
            }
            toast.success("Invitation downloaded.");
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Could not download the invitation."
            );
        } finally {
            setDownloading(null);
        }
    };

    /**
     * If the selected template stops being on offer — the category changed, or
     * an admin unpublished it — step 4 would highlight nothing and the event
     * would save against a template the client can no longer see. Snap to the
     * first one that IS on offer.
     *
     * Guarded on a non-empty list so it never fires while the options request
     * is still in flight, which would overwrite a restored edit value with a
     * default before the real list had arrived.
     */
    useEffect(() => {
        if (dbTemplates.length === 0) return;
        if (dbTemplates.some((t) => t.code === form.theme_id)) return;

        // A `?theme=` deep link may name an ADMIN template, which the initial
        // state could not validate — the catalogue had not loaded yet. Honour it
        // here before falling back, or "Use Template" would silently land on a
        // different design than the one that was clicked.
        const deepLinked =
            !isEdit && initialThemeId
                ? dbTemplates.find((t) => t.code === initialThemeId)
                : undefined;

        setField("theme_id", (deepLinked ?? dbTemplates[0]).code);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dbTemplates, form.theme_id]);

    const validate = (target: number) => {
        const next: Record<string, boolean> = {};
        // Whole wizard: every step before `target`. One section: its page only.
        const need = (s: number) => (sectionPages ? step === s : target > s);
        if (need(S_TYPE)) {
            if (!form.category_id) next.category_id = true;
        }
        if (need(S_BASIC)) {
            if (!form.name.trim()) next.name = true;
            if (!form.cover_image) next.cover_image = true;
        }
        if (need(S_DATE)) {
            if (!form.start_date) next.start_date = true;
            if (!form.end_date) next.end_date = true;
            if (!form.start_time) next.start_time = true;
            if (!form.end_time) next.end_time = true;
        }
        if (need(S_DESIGN)) {
            if (isCustomTemplate && !form.custom_image) {
                next.custom_image = true;
                // The upload control shows while Custom is being browsed.
                setDesignFilter(ALL_STYLES);
                setStyleFilter("custom");
            }
        }
        if (Object.keys(next).length) {
            setErrors(next);
            toast.error("Please fill all mandatory fields.");
            return false;
        }

        /**
         * Format checks, reported separately from the mandatory-field toast.
         *
         * Both are OPTIONAL fields, so an empty one is fine — this only fires on
         * something that was typed and is malformed. The server rejects the same
         * two, and catching it here saves a round trip that would land the user
         * back on a step they had already left.
         */
        if (need(S_ORGANIZER)) {
            const phone = form.contact_phone.trim();
            const email = form.contact_email.trim();
            if (phone && !/^[\d\s+()-]{6,30}$/.test(phone)) {
                setErrors({ contact_phone: true });
                toast.error("Please enter a valid contact number.");
                return false;
            }
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                setErrors({ contact_email: true });
                toast.error("Please enter a valid contact email address.");
                return false;
            }
        }

        return true;
    };

    /**
     * A date is confirmed as it is picked, because on a new event it is the one
     * field that cannot be corrected later. Only a complete date asks — a native
     * date input reports every partial keystroke, and prompting on "0002-01-01"
     * on the way to typing a year would be unusable.
     */
    const confirmDate = (field: "start_date" | "end_date", value: string) => {
        const complete = /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) > 1900;
        if (!complete || value === form[field]) {
            setField(field, value);
            return;
        }
        const label = field === "start_date" ? "start" : "end";
        setConfirm({
            title: `Use this ${label} date?`,
            body: `${formatDate(value)} will be set as the event ${label} date. It cannot be changed once the event is created.`,
            action: "Yes, use this date",
            onConfirm: () => {
                setField(field, value);
                setConfirm(null);
            },
        });
    };

    /** Step 5's actual save, run only once the review screen is confirmed. */
    const submitEvent = (statusOverride?: string) => {
        if (saving) return;
        {
            const payload = {
                event_category_id: Number(form.category_id),
                name: form.name.trim(),
                host_one: form.host_one.trim() || null,
                host_two: form.host_two.trim() || null,
                tagline: form.tagline.trim() || null,
                description: form.description.trim() || null,
                start_date: form.start_date,
                end_date: form.end_date,
                start_time: form.start_time,
                end_time: form.end_time,
                timezone: form.timezone,
                venue_name: form.venue_name.trim() || null,
                venue_address: form.venue_address.trim() || null,
                venue_landmark: form.venue_landmark.trim() || null,
                venue_map_link: form.venue_map_link.trim() || null,
                venue_image: form.venue_image || null,
                // A pin is a pair; the server refuses half of one.
                venue_lat: form.venue_lat.trim() && form.venue_lng.trim() ? Number(form.venue_lat) : null,
                venue_lng: form.venue_lat.trim() && form.venue_lng.trim() ? Number(form.venue_lng) : null,
                ceremony_title: form.ceremony_title.trim() || null,
                ceremony_venue: form.ceremony_venue.trim() || null,
                ceremony_description: form.ceremony_description.trim() || null,
                organizer: form.organizer.trim() || null,
                contact_phone: form.contact_phone.trim() || null,
                contact_email: form.contact_email.trim() || null,
                footer_note: form.footer_note.trim() || null,
                privacy: form.privacy,
                status: statusOverride ?? form.status,
                // Only the menus still toggled on, and only ones the plan
                // actually returned — a stale key from a previous plan would be
                // rejected by the server rather than silently dropped.
                menu_ids: menuRows
                    .filter((m) => isDefaultMenu(m) || (menus[m.id] ?? true))
                    .map((m) => m.id),
                menu_order: orderedMenuRows.map((m) => m.id),
                theme_id: form.theme_id,
                home_screen_template_id: form.home_screen_template_id
                    ? Number(form.home_screen_template_id)
                    : null,
                primary_color: form.primary_color,
                // "" → null: follow the template's own secondary colour.
                secondary_color: form.secondary_color || null,
                qr_style: form.qr_style,
                // "" → null, so removing the photo in edit mode clears it.
                cover_image: form.cover_image || null,
                // Sent whatever the template's type, so switching away from a
                // custom template and back does not lose the picture; only a
                // custom template draws it. "" → null clears it.
                custom_image: form.custom_image || null,
                // null means "keep following the template". Sent explicitly so
                // that clearing an override actually clears it server-side
                // rather than leaving the old one in place.
                components: compOverride
                    ? Object.fromEntries(COMPONENT_KEYS.map((k) => [k, compOverride[k] ? 1 : 0]))
                    : null,
                component_order: orderOverride,
            };

            if (isEdit && eventId) updateEvent.mutate({ id: eventId, data: payload });
            else createEvent.mutate(payload);
            // onDone advances to step 6
        }
    };

    /**
     * The Exit button. Editing an event, or a new one nothing has been entered
     * on, simply leaves. A new event with something on it is saved nowhere
     * yet, so it asks first (the mobile app asks the same): save a draft, exit
     * without saving, or stay.
     */
    const started = !!form.category_id || step > 1;
    const askExit = () => {
        if (isEdit || !started || step === S_CREATED) {
            router.push(isEdit ? hubHref : "/dashboard/events");
            return;
        }
        setExitOpen(true);
    };

    /** What the server needs before it stores an event at all, draft included. */
    const canDraft =
        !!form.category_id && !!form.name.trim() &&
        !!form.start_date && !!form.end_date && !!form.start_time && !!form.end_time;

    const saveDraftAndExit = () => {
        setExitOpen(false);
        exitAfterSave.current = true;
        submitEvent("draft");
    };

    const goNext = () => {
        if (!validate(step + 1)) return;

        // One section: Next between its pages, Save on the last (as in the app).
        if (sectionPages) {
            if (pageIndex < sectionPages.length - 1) {
                setStep(sectionPages[pageIndex + 1]);
                return;
            }
            submitEvent();
            return;
        }

        // The review screen is the last chance to change anything — and on a new
        // event the date cannot be changed at all afterwards — so it asks before
        // it saves rather than acting on a single click.
        if (step === S_REVIEW) {
            if (saving) return;
            setConfirm({
                title: isEdit ? "Save these changes?" : "Create this event?",
                body: isEdit
                    ? "Your changes will be saved and shown to your guests."
                    : `${form.name || "This event"} will be created for ${form.start_date || "the selected date"}. The event date cannot be changed afterwards.`,
                action: isEdit ? "Save Changes" : "Create Event",
                onConfirm: () => {
                    setConfirm(null);
                    submitEvent();
                },
            });
            return;
        }

        setStep((s) => Math.min(STEPS.length, s + 1));
    };

    // Rendering the form before the row arrives would flash an empty wizard and
    // then repopulate it, which reads as the edit having lost everything.
    if (isEdit && existing.isLoading) {
        return (
            <div className="flex flex-col gap-6">
                <Skeleton className="h-8 w-[220px]" />
                <Skeleton className="h-[70px] w-full rounded-md" />
                <Skeleton className="h-[420px] w-full rounded-xl" />
            </div>
        );
    }

    if (isEdit && existing.isError) {
        return (
            <Card className="border border-border shadow-none py-0">
                <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                    <p className="text-[15px] font-semibold text-foreground">Event not found</p>
                    <p className="text-[13px] text-muted-foreground">
                        {existing.error instanceof ApiError && existing.error.isAuthError
                            ? "Your session has ended. Sign in again to carry on."
                            : "It may have been deleted."}
                    </p>
                    {existing.error instanceof ApiError && existing.error.isAuthError && (
                        <SignInPrompt className="mt-2" />
                    )}
                    <Button asChild variant="outline" size="sm" className="mt-2 h-9 text-[12.5px]">
                        <Link href="/dashboard/events">Back to My Events</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-[22px] font-bold tracking-tight text-foreground">
                            {section ? `Edit ${SECTION_PAGES[section].title}` : isEdit ? "Edit Event" : "Create New Event"}
                        </h1>
                        <p className="mt-1 text-[13.5px] text-muted-foreground">
                            {section
                                ? form.name || "Update this part of your event."
                                : isEdit
                                    ? "Update your event. Changes are saved on the last step."
                                    : "Follow the steps below to create your perfect event."}
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={askExit}
                        disabled={saving}
                        className="h-9 shrink-0 rounded-md text-[12.5px] font-medium"
                    >
                        <X className="mr-1.5 size-4" />
                        Exit
                    </Button>
                </div>

                {/* Confirms the template came across. Without it the choice made
                    on the Templates screen is invisible until step 4, which reads
                    as the button having done nothing. */}
                {!isEdit && initialThemeId && dbTemplates.some((t) => t.code === initialThemeId) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-primary/5 px-3 py-2">
                        <span className="text-[12px] text-muted-foreground">Starting from</span>
                        <Badge variant="ghost" className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            {dbTemplates.find((t) => t.code === initialThemeId)?.name}
                        </Badge>
                        <Link href="/dashboard/templates" className="text-[11.5px] font-semibold text-primary hover:underline">
                            Change template
                        </Link>
                    </div>
                )}
            </div>

            {/* Stepper — whole wizard only; a single section has none. */}
            {!section && (
            <div className="overflow-x-auto">
                <ol className="flex min-w-[680px] items-start">
                    {STEPS.map((label, i) => {
                        const n = i + 1;
                        const done = n < step;
                        const current = n === step;
                        return (
                            <li key={label} className="relative flex flex-1 flex-col items-center gap-2">
                                {/* Connector sits behind the circle and stops at the
                                    row edges, so it never pokes out past step 1 or 6. */}
                                {i > 0 && (
                                    <span
                                        className={cn(
                                            "absolute left-0 top-[15px] h-[2px] w-1/2 -translate-x-1/2",
                                            done || current ? "bg-primary" : "bg-border"
                                        )}
                                        aria-hidden
                                    />
                                )}
                                {i < STEPS.length - 1 && (
                                    <span
                                        className={cn(
                                            "absolute right-0 top-[15px] h-[2px] w-1/2 translate-x-1/2",
                                            done ? "bg-primary" : "bg-border"
                                        )}
                                        aria-hidden
                                    />
                                )}
                                <span
                                    className={cn(
                                        "relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-[12.5px] font-semibold transition-colors",
                                        done && "border-primary bg-primary text-primary-foreground",
                                        current && "border-primary bg-primary text-primary-foreground",
                                        !done && !current && "border-border bg-card text-muted-foreground"
                                    )}
                                >
                                    {done ? <FontAwesomeIcon icon={faCheck} className="!size-[12px]" /> : n}
                                </span>
                                <span
                                    className={cn(
                                        "px-1 text-center text-[12px] leading-tight",
                                        current ? "font-semibold text-primary" : "text-muted-foreground"
                                    )}
                                >
                                    {label}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            </div>
            )}

            <Card className="border border-border shadow-none py-0">
                <CardContent className="p-6">
                    {section ? (
                        <>
                            {sectionPages && sectionPages.length > 1 && (
                                <p className="text-[12px] font-medium text-muted-foreground">
                                    Page {pageIndex + 1} of {sectionPages.length}
                                </p>
                            )}
                            <h2 className="mt-0.5 text-[17px] font-bold text-primary">{SECTION_PAGES[section].title}</h2>
                            <p className="mt-1 text-[13px] text-muted-foreground">{SECTION_PAGES[section].subtitle}</p>
                        </>
                    ) : (
                        <>
                            <p className="text-[12px] font-medium text-muted-foreground">Step {step}</p>
                            <h2 className="mt-0.5 text-[17px] font-bold text-primary">{STEPS[step - 1]}</h2>
                            <p className="mt-1 text-[13px] text-muted-foreground">{SUBTITLES[step - 1]}</p>
                        </>
                    )}

                    <div className="mt-6">
                        {/* ── Step 1 — real taxonomy ─────────────────────────── */}
                        {step === S_TYPE && (
                            // Full card width, not capped: three selects in a row
                            // need the room, and any max-w leaves a dead gutter
                            // down the right of a wide card.
                            <div className="grid gap-5">
                                {/* An empty dropdown with no explanation reads as a broken
                                    form. The taxonomy endpoints require a session, and this
                                    panel has no login of its own, so 401 is the likely
                                    failure — say so instead of showing nothing. */}
                                {(options.isError || opts?.reason) && (
                                    <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3">
                                        <p className="text-[12.5px] font-semibold text-foreground">
                                            {options.error instanceof ApiError && options.error.isAuthError
                                                ? "You are not signed in"
                                                : opts?.reason
                                                    ? "No options available"
                                                    : "Could not load your plan"}
                                        </p>
                                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                                            {options.error instanceof ApiError && options.error.isAuthError
                                                ? "Your session has ended. Sign in again to carry on."
                                                : opts?.reason
                                                    ? opts.reason
                                                    : options.error instanceof Error
                                                        ? options.error.message
                                                        : "Unknown error."}
                                        </p>
                                        {options.error instanceof ApiError && options.error.isAuthError && (
                                            <SignInPrompt className="mt-2.5" />
                                        )}
                                    </div>
                                )}

                                <div className="grid gap-5 md:grid-cols-3">
                                    <Field label="Event Category" required error={errors.category_id}>
                                        <TaxonomySelect
                                            value={form.category_id}
                                            onChange={(v) => setField("category_id", v)}
                                            loading={options.isLoading}
                                            rows={categoryRows}
                                            placeholder="Select category"
                                            invalid={errors.category_id}
                                        />
                                    </Field>
                                    {form.category_id && (
                                        <p className="self-end rounded-md bg-muted/50 px-3 py-2 text-[12px] text-muted-foreground md:col-span-2 md:justify-self-end">
                                            Colours, images and content can be customised later.
                                        </p>
                                    )}
                                </div>

                                {/* Mobile app home design — templates from the admin's
                                    Home Screen Templates; style chips from the Template
                                    Categories master table. Optional: choosable later. */}
                                {form.category_id && (
                                    <HomeTemplatePicker
                                        categoryId={form.category_id}
                                        categoryName={selectedCategory?.name}
                                        value={form.home_screen_template_id}
                                        onChange={(id) => setField("home_screen_template_id", id)}
                                        hostNames={
                                            form.host_one.trim() && form.host_two.trim()
                                                ? `${form.host_one.trim()} & ${form.host_two.trim()}`
                                                : undefined
                                        }
                                    />
                                )}
                            </div>
                        )}

                        {/* ── Step 2 ─────────────────────────────────────────── */}
                        {/* ── Step 2 — Basic Details ─────────────────────────── */}
                        {step === S_BASIC && (
                            <div className="grid max-w-3xl gap-5">
                                <Field label="Event Title" required error={errors.name}>
                                    <Input
                                        value={form.name}
                                        onChange={(e) => setField("name", e.target.value.slice(0, 100))}
                                        placeholder={isCouple ? "e.g. Arjun weds Priya" : "Please enter the event title"}
                                        className={cn("h-11 rounded-md", errors.name && "border-destructive")}
                                    />
                                    <Counter value={form.name.length} max={100} />
                                </Field>

                                {/* Two fields: the app and the invitation print them
                                    either side of an ampersand. */}
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field label={isCouple ? "Groom Name (Optional)" : "First Host (Optional)"}>
                                        <Input
                                            value={form.host_one}
                                            onChange={(e) => setField("host_one", e.target.value.slice(0, 120))}
                                            placeholder={isCouple ? "Groom's name" : "First host's name"}
                                            className="h-11 rounded-md"
                                        />
                                    </Field>
                                    <Field label={isCouple ? "Bride Name (Optional)" : "Second Host (Optional)"}>
                                        <Input
                                            value={form.host_two}
                                            onChange={(e) => setField("host_two", e.target.value.slice(0, 120))}
                                            placeholder={isCouple ? "Bride's name" : "Second host's name"}
                                            className="h-11 rounded-md"
                                        />
                                    </Field>
                                </div>

                                <Field label="Tagline (Optional)">
                                    <Input
                                        value={form.tagline}
                                        onChange={(e) => setField("tagline", e.target.value.slice(0, 100))}
                                        placeholder="Please enter a tagline"
                                        className="h-11 rounded-md"
                                    />
                                    <Counter value={form.tagline.length} max={100} />
                                </Field>

                                <Field label="Short Description (Optional)">
                                    <Textarea
                                        value={form.description}
                                        onChange={(e) => setField("description", e.target.value.slice(0, 300))}
                                        placeholder="Please enter a short description"
                                        className="min-h-[90px] rounded-md"
                                    />
                                    <Counter value={form.description.length} max={300} />
                                </Field>

                                {/* Event Status — the app's two cards. */}
                                <Field label="Event Status" required>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {([
                                            { value: "public", title: "Public", text: "Anyone with the link or QR" },
                                            { value: "private", title: "Private", text: "Invite only" },
                                        ] as const).map((o) => {
                                            const active = form.privacy === o.value;
                                            return (
                                                <button
                                                    key={o.value}
                                                    type="button"
                                                    onClick={() => setField("privacy", o.value)}
                                                    aria-pressed={active}
                                                    className={cn(
                                                        "rounded-lg border p-3 text-left transition",
                                                        active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/50"
                                                    )}
                                                >
                                                    <p className={cn("text-[13.5px] font-semibold", active ? "text-primary" : "text-foreground")}>{o.title}</p>
                                                    <p className="mt-0.5 text-[12px] text-muted-foreground">{o.text}</p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="mt-2 text-[11.5px] text-muted-foreground">
                                        {form.privacy === "private"
                                            ? "A guest is counted as a participant only after completing check-in at the event."
                                            : "A guest is counted as a participant once they complete the RSVP."}
                                    </p>
                                </Field>

                                <CoverImageField
                                    label="Upload Event Photo"
                                    value={form.cover_image}
                                    onChange={(url) => setField("cover_image", url)}
                                    error={errors.cover_image}
                                />
                            </div>
                        )}

                        {/* ── Step 3 — Date & Time ───────────────────────────── */}
                        {step === S_DATE && (
                            <div className="grid max-w-3xl gap-5">
                                <Field label="Event Time Zone">
                                    <Select value={form.timezone} onValueChange={(v) => setField("timezone", v)}>
                                        <SelectTrigger className="h-11 w-full rounded-md"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {TIME_ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field label="Start Date" required error={errors.start_date}
                                        hint={isEdit ? "The event date cannot be changed after it is created." : undefined}>
                                        <IconInput icon={faCalendarDays} type="date" value={form.start_date}
                                            disabled={isEdit}
                                            onChange={(v) => confirmDate("start_date", v)} invalid={errors.start_date} />
                                    </Field>
                                    <Field label="End Date" required error={errors.end_date}>
                                        <IconInput icon={faCalendarDays} type="date" value={form.end_date}
                                            disabled={isEdit}
                                            onChange={(v) => confirmDate("end_date", v)} invalid={errors.end_date} />
                                    </Field>
                                    <Field label="Start Time" required error={errors.start_time}>
                                        <IconInput icon={faClock} type="time" value={form.start_time}
                                            onChange={(v) => setField("start_time", v)} invalid={errors.start_time} />
                                    </Field>
                                    <Field label="End Time" required error={errors.end_time}>
                                        <IconInput icon={faClock} type="time" value={form.end_time}
                                            onChange={(v) => setField("end_time", v)} invalid={errors.end_time} />
                                    </Field>
                                </div>
                            </div>
                        )}

                        {/* ── Step 4 — Venue ─────────────────────────────────── */}
                        {step === S_VENUE && (
                            <div className="grid max-w-3xl gap-5">
                                <Field label="Venue Name">
                                    <Input
                                        value={form.venue_name}
                                        onChange={(e) => setField("venue_name", e.target.value.slice(0, 255))}
                                        placeholder="e.g. The Grand Palace"
                                        className="h-11 rounded-md"
                                    />
                                </Field>
                                <Field label="Address">
                                    <Textarea
                                        value={form.venue_address}
                                        onChange={(e) => setField("venue_address", e.target.value.slice(0, 500))}
                                        placeholder="Please enter the venue address"
                                        className="min-h-[90px] rounded-md"
                                    />
                                    <Counter value={form.venue_address.length} max={500} />
                                </Field>
                                <Field label="Landmark (Optional)">
                                    <Input
                                        value={form.venue_landmark}
                                        onChange={(e) => setField("venue_landmark", e.target.value.slice(0, 255))}
                                        placeholder="e.g. Near Marina Beach"
                                        className="h-11 rounded-md"
                                    />
                                </Field>
                                <Field label="Google Map Link (Optional)">
                                    <Input
                                        value={form.venue_map_link}
                                        onChange={(e) => setField("venue_map_link", e.target.value.slice(0, 500))}
                                        placeholder="https://maps.google.com/..."
                                        className="h-11 rounded-md"
                                    />
                                </Field>
                                {/* The app drops this pin on its map; here it is typed. */}
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field label="Latitude (Optional)">
                                        <Input
                                            inputMode="decimal"
                                            value={form.venue_lat}
                                            onChange={(e) => setField("venue_lat", e.target.value.replace(/[^0-9.-]/g, "").slice(0, 12))}
                                            placeholder="13.0827"
                                            className="h-11 rounded-md"
                                        />
                                    </Field>
                                    <Field label="Longitude (Optional)">
                                        <Input
                                            inputMode="decimal"
                                            value={form.venue_lng}
                                            onChange={(e) => setField("venue_lng", e.target.value.replace(/[^0-9.-]/g, "").slice(0, 12))}
                                            placeholder="80.2707"
                                            className="h-11 rounded-md"
                                        />
                                    </Field>
                                </div>
                                <CoverImageField
                                    label="Venue Image (Optional)"
                                    required={false}
                                    hint="JPG, PNG or WEBP. A photo of the venue, shown to guests in the app."
                                    value={form.venue_image}
                                    onChange={(url) => setField("venue_image", url)}
                                />
                            </div>
                        )}

                        {/* ── Step 6 — Settings ──────────────────────────────── */}
                        {step === S_SETTINGS && (
                            <div className="grid max-w-3xl gap-4">
                                <PanelHeading label="Guest Registration" />
                                {/* Shown as in the app, where these are not saved yet
                                    either — so they are marked rather than pretending. */}
                                {[
                                    "Allow new participants to RSVP",
                                    "Require approval for participants",
                                ].map((label, i) => (
                                    <div key={label} className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
                                        <span className="text-[13.5px] font-medium text-foreground">{label}</span>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="rounded px-1.5 py-0 text-[10px] font-semibold uppercase">Soon</Badge>
                                            <Switch checked={i === 0} disabled aria-label={label} />
                                        </div>
                                    </div>
                                ))}
                                <p className="text-[12px] text-muted-foreground">
                                    These settings are coming soon. For now every event accepts RSVPs without approval.
                                </p>
                            </div>
                        )}

                        {/* ── Step 7 — Organizer Settings ────────────────────── */}
                        {step === S_ORGANIZER && (
                            <div className="grid max-w-3xl gap-5">
                                <Field label="Organizer / Hosted By">
                                    <Input
                                        value={form.organizer}
                                        onChange={(e) => setField("organizer", e.target.value.slice(0, 200))}
                                        placeholder="Please enter who is hosting this event"
                                        className="h-11 rounded-md"
                                    />
                                </Field>
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field label="Contact Number" error={errors.contact_phone}>
                                        <Input
                                            value={form.contact_phone}
                                            onChange={(e) => setField("contact_phone", e.target.value.slice(0, 30))}
                                            placeholder="Please enter a contact number"
                                            inputMode="tel"
                                            className={cn("h-11 rounded-md", errors.contact_phone && "border-destructive")}
                                        />
                                    </Field>
                                    <Field label="Contact Email" error={errors.contact_email}>
                                        <Input
                                            value={form.contact_email}
                                            onChange={(e) => setField("contact_email", e.target.value.slice(0, 150))}
                                            placeholder="Please enter a contact email address"
                                            inputMode="email"
                                            className={cn("h-11 rounded-md", errors.contact_email && "border-destructive")}
                                        />
                                    </Field>
                                </div>
                                <Field label="Footer Note">
                                    <Input
                                        value={form.footer_note}
                                        onChange={(e) => setField("footer_note", e.target.value.slice(0, 300))}
                                        placeholder="Please enter a footer note"
                                        className="h-11 rounded-md"
                                    />
                                    <Counter value={form.footer_note.length} max={300} />
                                </Field>
                            </div>
                        )}

                        {/* ── Step 5 — Menus (real event_menus) ───────────────── */}
                        {step === S_MENUS && (
                            <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
                                {/*
                                  Every menu the plan grants, in two panels by the
                                  menu's own Default flag: Default = always on,
                                  Add-on = the client switches it per event.
                                */}
                                {([
                                    { key: "addon", title: "Additional Menus", rows: addonRows, empty: "No additional menus in your plan." },
                                    { key: "default", title: "Default Menus", rows: defaultRows, empty: "No menus are configured for this event type yet." },
                                ] as const).map((panel) => (
                                    <div key={panel.key} className="flex min-w-0 flex-col gap-3">
                                        <h3 className="text-[13px] font-semibold text-foreground">{panel.title}</h3>
                                        {options.isLoading ? (
                                            <div className="flex flex-col gap-3">
                                                {Array.from({ length: 6 }).map((_, i) => (
                                                    <Skeleton key={i} className="h-11 w-full rounded-md" />
                                                ))}
                                            </div>
                                        ) : panel.rows.length === 0 ? (
                                            <p className="py-10 text-center text-[13px] text-muted-foreground">
                                                {panel.empty}
                                            </p>
                                        ) : (
                                            <ul className="flex flex-col divide-y divide-border">
                                                {panel.rows.map((m, idx) => {
                                                    const locked = isDefaultMenu(m);
                                                    return (
                                                        <li key={m.id} className="flex items-center justify-between gap-4 py-3">
                                                            <span className="min-w-0 text-[13.5px] font-medium text-foreground break-words">
                                                                {m.name}
                                                                {locked && (
                                                                    <span className="block text-[11.5px] font-normal text-muted-foreground">
                                                                        Always included
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <div className="flex shrink-0 items-center gap-1">
                                                                <Button
                                                                    type="button" size="icon" variant="ghost" className="size-7"
                                                                    aria-label={`Move ${m.name} up`}
                                                                    disabled={idx === 0}
                                                                    onClick={() => moveMenu(panel.rows, m.id, -1)}
                                                                >
                                                                    <ChevronUp className="size-4" />
                                                                </Button>
                                                                <Button
                                                                    type="button" size="icon" variant="ghost" className="size-7"
                                                                    aria-label={`Move ${m.name} down`}
                                                                    disabled={idx === panel.rows.length - 1}
                                                                    onClick={() => moveMenu(panel.rows, m.id, 1)}
                                                                >
                                                                    <ChevronDown className="size-4" />
                                                                </Button>
                                                                <Switch
                                                                    checked={locked || (menus[m.id] ?? true)}
                                                                    disabled={locked}
                                                                    onCheckedChange={(v) => setMenus((p) => ({ ...p, [m.id]: v }))}
                                                                    aria-label={m.name}
                                                                />
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── Invitation Card page 1 (Edit Event only) — presentational ────────────────────────── */}
                        {step === S_DESIGN && (
                            /*
                              Theme & Colour, and nothing else.

                              The component toggles used to sit in a second panel
                              on this step, which put two unrelated decisions on one
                              screen: WHICH design, and WHAT that design carries.
                              The second one is only answerable next to a picture of
                              the result, so it moved to step 5 where the preview is.
                            */
                            <div className="grid gap-x-10 gap-y-8">
                                <div className="flex min-w-0 flex-col gap-3">
                                    <PanelHeading label="Theme & Colour" />
                                    <p className="text-[12px] text-muted-foreground">
                                        Pick the invitation design. Your plan decides what is on offer.
                                    </p>

                                {/* Both filters, side by side, whenever there are
                                    templates to filter — shown even with a single
                                    option, so it is plain which style and type the
                                    designs below belong to. */}
                                {dbTemplates.length > 0 && (
                                    <div className="flex flex-wrap gap-3">
                                        <div className="w-full max-w-[220px]">
                                            <Label className="text-[11px] font-medium text-muted-foreground">Design Style</Label>
                                            <Select value={designFilter} onValueChange={setDesignFilter}>
                                                <SelectTrigger className="h-9 w-full rounded-md text-[12.5px]"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={ALL_STYLES}>All Styles</SelectItem>
                                                    {designOptions.map((d) => (
                                                        <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="w-full max-w-[220px]">
                                            <Label className="text-[11px] font-medium text-muted-foreground">Template Type</Label>
                                            <Select value={styleFilter} onValueChange={setStyleFilter}>
                                                <SelectTrigger className="h-9 w-full rounded-md text-[12.5px]"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={ALL_STYLES}>All Types</SelectItem>
                                                    {styleOptions.map((o) => (
                                                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {/*
                                          The host's own picture for a CUSTOM
                                          template (Jamal, 2026-10-05; required
                                          2026-10-07), as a third control in this
                                          row, the dropdowns' size (2026-10-07).
                                          No preview of its own: every custom tile
                                          below draws the picture. Shown ONLY while
                                          Template Type is Custom.
                                        */}
                                        {customImageAsked && (
                                            <CustomImageButton
                                                value={form.custom_image}
                                                onChange={(url) => setField("custom_image", url)}
                                                error={errors.custom_image}
                                            />
                                        )}
                                    </div>
                                )}

                                {/* ONLY the admin catalogue, narrowed to this client's
                                    plan, to the category picked in
                                    step 1, and to the style filter above. There is
                                    deliberately no built-in fallback:
                                    offering designs the plan does not grant is exactly
                                    the mis-sell the plan gating exists to prevent, and
                                    a hardcoded grid made an empty catalogue look full. */}
                                {options.isLoading ? (
                                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                                        {Array.from({ length: 6 }).map((_, i) => (
                                            <Skeleton key={i} className="aspect-[4/5] w-full rounded-md" />
                                        ))}
                                    </div>
                                ) : dbTemplates.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                                        {styleFilteredTemplates.map((t) => {
                                            const active = form.theme_id === t.code;
                                            return (
                                                <button
                                                    key={t.code}
                                                    type="button"
                                                    onClick={() => {
                                                        setField("theme_id", t.code);
                                                        // A new template starts on ITS secondary colour again (as the app
                                                        // does); the host can pick their own after.
                                                        setField("secondary_color", "");
                                                        // The template's own accent becomes the
                                                        // starting primary colour, so the card
                                                        // on step 5 does not immediately clash
                                                        // with the design just chosen.
                                                        if (t.secondary_color) {
                                                            setField("primary_color", t.secondary_color);
                                                        }
                                                    }}
                                                    aria-pressed={active}
                                                    className={cn(
                                                        "group rounded-md border-2 p-1.5 text-left transition-colors",
                                                        active ? "border-primary" : "border-border hover:border-primary/40"
                                                    )}
                                                >
                                                    {/* Matted, not edge to edge — see the
                                                        note on the catalogue tile. The
                                                        template's own frame reaches its
                                                        corners, so an overlay placed there
                                                        lands on the artwork. */}
                                                    <span
                                                        className="relative block aspect-[4/5] w-full overflow-hidden rounded bg-muted/40"
                                                    >
                                                        {/* The design itself — frame, decorations
                                                            and its enabled components — so what is
                                                            picked here is what step 5 then shows.
                                                            It used to be the background colour and
                                                            a style word, which made every template
                                                            in the plan look like the same swatch. */}
                                                        <TemplateArtwork
                                                            // EVERY custom tile draws the host's own
                                                            // picture once one is added — it is what
                                                            // each of them would look like if picked.
                                                            template={
                                                                t.background_type === "custom" && form.custom_image
                                                                    ? { ...t, background_image: form.custom_image }
                                                                    : t
                                                            }
                                                            data={invitationData}
                                                            className="inset-2"
                                                            cardClassName="rounded-[3px] shadow-sm"
                                                        />
                                                        {/* Only the SELECTED state stays over
                                                            the artwork: it has to be readable
                                                            at a glance across the grid, and it
                                                            is the one thing here that is about
                                                            the tile rather than the design.
                                                            "Featured" moved below with the
                                                            name — it is a label, not a state. */}
                                                        {active && (
                                                            <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                                                                <FontAwesomeIcon icon={faCheck} className="!size-[9px]" />
                                                            </span>
                                                        )}
                                                    </span>
                                                    {/* break-words, not truncate: an admin can
                                                        name a template anything, and a clipped
                                                        name is how you pick the wrong one. */}
                                                    <span className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                                                        <span className="break-words text-center text-[12px] font-medium text-foreground">
                                                            {t.name}
                                                        </span>
                                                        {t.is_featured ? (
                                                            <span className="rounded bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
                                                                Featured
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                    {/* Below the tile, not written across it —
                                                        the tile now holds the invitation, and a
                                                        label over it lands on the footer line. */}
                                                    {(t.style || templateTypeLabel(t.background_type)) && (
                                                        <span className="mt-0.5 block break-words text-center text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                                            {[t.style, templateTypeLabel(t.background_type)].filter(Boolean).join(" · ")}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    /* An empty catalogue is stated, not papered over with
                                       stand-in designs. The two cases have different
                                       answers — narrow the event, or ask for more — so
                                       they are worded differently rather than merged. */
                                    <div className="rounded-md border border-dashed border-border px-6 py-10 text-center">
                                        <FontAwesomeIcon icon={faPalette} className="!size-[24px] text-muted-foreground/40" />
                                        <p className="mt-3 text-[13.5px] font-semibold text-foreground">
                                            No templates available
                                        </p>
                                        <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-muted-foreground">
                                            {opts?.templates && opts.templates.length > 0
                                                ? "None of your plan’s templates match the category selected in Event Basics. Go back and change your selection, or contact us for more designs."
                                                : "Your subscription plan doesn’t include any invitation templates yet. Please contact us to have them added to your plan."}
                                        </p>
                                        <p className="mt-3 text-[11.5px] text-muted-foreground/80">
                                            You can still continue — a template can be chosen later by editing the event.
                                        </p>
                                    </div>
                                )}

                                    {/* What this colour ACTUALLY drives: the
                                        event / host names on the invitation and on
                                        every thumbnail of it. Nothing else reads it —
                                        the card's background, frame and accents all
                                        come from the template. It is held to a 4.5:1
                                        contrast floor at render time, because it is
                                        picked from a swatch row that knows nothing
                                        about the design behind it. */}
                                    <p className="mb-1 mt-6 text-[12.5px] font-semibold text-foreground">Primary Colour</p>
                                    <p className="mb-3 text-[12px] text-muted-foreground">
                                        Used for the names and the QR code printed on your invitation.
                                    </p>
                                <div className="flex flex-wrap items-center gap-3">
                                    {PRIMARY_SWATCHES.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setField("primary_color", c)}
                                            aria-label={`Primary colour ${c}`}
                                            aria-pressed={form.primary_color === c}
                                            style={{ backgroundColor: c }}
                                            className={cn(
                                                "grid h-8 w-8 place-items-center rounded-full ring-offset-2 ring-offset-card transition-shadow",
                                                form.primary_color === c && "ring-2 ring-foreground/40"
                                            )}
                                        >
                                            {form.primary_color === c && (
                                                <FontAwesomeIcon icon={faCheck} className="!size-[11px] text-white" />
                                            )}
                                        </button>
                                    ))}
                                    <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-border">
                                        <span
                                            className="absolute inset-0"
                                            style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
                                        />
                                        <input
                                            type="color"
                                            value={form.primary_color}
                                            onChange={(e) => setField("primary_color", e.target.value)}
                                            className="absolute inset-0 cursor-pointer opacity-0"
                                            aria-label="Custom primary colour"
                                        />
                                    </label>
                                    {/* Back to the colour the selected template
                                        starts with (what clicking its tile sets);
                                        the first swatch when it has none. Always
                                        shown, greyed when there is nothing to undo. */}
                                    <button
                                        type="button"
                                        onClick={() => setField("primary_color", templatePrimary)}
                                        disabled={form.primary_color.toLowerCase() === templatePrimary.toLowerCase()}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <FontAwesomeIcon icon={faRotateLeft} className="!size-[11px]" />
                                        Reset
                                    </button>
                                </div>
                                </div>

                                {/* Secondary Colour: the accents and details. "Follow template"
                                    clears it so the template's own secondary colour is used. */}
                                {artwork.kind === "template" && (
                                    <>
                                        <p className="mb-1 mt-6 text-[12.5px] font-semibold text-foreground">Secondary Colour</p>
                                        <p className="mb-3 text-[12px] text-muted-foreground">
                                            Used for the accents and details of your invitation.
                                        </p>
                                        <div className="flex flex-wrap items-center gap-3">
                                            {SECONDARY_SWATCHES.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => setField("secondary_color", c)}
                                                    aria-label={`Secondary colour ${c}`}
                                                    aria-pressed={form.secondary_color.toLowerCase() === c.toLowerCase()}
                                                    style={{ backgroundColor: c }}
                                                    className={cn(
                                                        "grid h-8 w-8 place-items-center rounded-full ring-offset-2 ring-offset-card transition-shadow",
                                                        form.secondary_color.toLowerCase() === c.toLowerCase() && "ring-2 ring-foreground/40"
                                                    )}
                                                >
                                                    {form.secondary_color.toLowerCase() === c.toLowerCase() && (
                                                        <FontAwesomeIcon icon={faCheck} className="!size-[11px] text-white" />
                                                    )}
                                                </button>
                                            ))}
                                            <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-border">
                                                <span
                                                    className="absolute inset-0"
                                                    style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
                                                />
                                                <input
                                                    type="color"
                                                    value={/^#[0-9a-fA-F]{6}$/.test(form.secondary_color) ? form.secondary_color : "#D97706"}
                                                    onChange={(e) => setField("secondary_color", e.target.value)}
                                                    className="absolute inset-0 cursor-pointer opacity-0"
                                                    aria-label="Custom secondary colour"
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setField("secondary_color", "")}
                                                disabled={!form.secondary_color}
                                                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <FontAwesomeIcon icon={faRotateLeft} className="!size-[11px]" />
                                                Follow template
                                            </button>
                                        </div>
                                    </>
                                )}

                                {/* QR Code Style: how the invitation draws its QR code. */}
                                <p className="mb-1 mt-6 text-[12.5px] font-semibold text-foreground">QR Code Style</p>
                                <p className="mb-3 text-[12px] text-muted-foreground">
                                    The look of the QR code on your invitation. It scans the same in every style.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {QR_STYLES.map((q) => (
                                        <button
                                            key={q.value}
                                            type="button"
                                            onClick={() => setField("qr_style", q.value)}
                                            aria-pressed={form.qr_style === q.value}
                                            className={cn(
                                                "rounded-lg border px-4 py-2 text-[12.5px] font-medium transition",
                                                form.qr_style === q.value
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border bg-card text-foreground hover:bg-muted"
                                            )}
                                        >
                                            {q.label}
                                        </button>
                                    ))}
                                </div>

                            </div>
                        )}

                        {/* ── Step 5 — what the invitation carries, beside it ── */}
                        {step === S_PREVIEW && (
                            /*
                              Two panels: the component toggles on the left, the
                              invitation they build on the right. They were on
                              separate steps, so every toggle was a decision taken
                              blind — you flipped Event QR Code off on step 4 and
                              found out what that did on step 5.

                              A legacy theme has no components to control, so it
                              gets the single centred column it always had rather
                              than an empty panel beside the card.
                            */
                            <div className={cn(
                                "grid gap-x-10 gap-y-8",
                                artwork.kind === "template" && "xl:grid-cols-[minmax(0,1fr)_300px]"
                            )}>
                                {artwork.kind === "template" && (
                                    <div className="flex min-w-0 flex-col gap-3">
                                        <PanelHeading label="Invitation Components" />

                                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-[12px] text-muted-foreground">
                                                    {hasOverride
                                                        ? "Customised for this event."
                                                        : `Following the ${artwork.template.name} template.`}
                                                </p>
                                            </div>
                                            {hasOverride && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={resetComponents}
                                                    className="h-8 rounded-md text-[12px]"
                                                >
                                                    Reset to template
                                                </Button>
                                            )}
                                        </div>

                                        <ul className="grid gap-x-6 sm:grid-cols-2">
                                            {shownSwitches.map((item) => (
                                                <li
                                                    key={item.label}
                                                    className="flex items-center justify-between gap-3 border-b border-border py-2.5"
                                                >
                                                    <span className="min-w-0 text-[12.5px] text-foreground break-words">
                                                        {item.label}
                                                    </span>
                                                    <Switch
                                                        checked={item.keys.some((k) => effectiveComponents[k])}
                                                        onCheckedChange={(v) => toggleComponents(item.keys, v)}
                                                        aria-label={item.label}
                                                    />
                                                </li>
                                            ))}
                                        </ul>

                                        <p className="mb-2 mt-6 text-[12.5px] font-semibold text-foreground">
                                            Component Order
                                        </p>
                                        <p className="mb-3 text-[11.5px] text-muted-foreground">
                                            Drag the chips to arrange the order components appear on the
                                            invitation. Components switched off keep their place. The
                                            decorations stay where the template puts them.
                                        </p>
                                        <ul className="flex flex-wrap gap-2">
                                            {orderedSwitches.map((item, index) => (
                                                <li
                                                    key={item.label}
                                                    draggable
                                                    onDragStart={() => setDragLabel(item.label)}
                                                    onDragEnd={() => setDragLabel(null)}
                                                    // Both are required: without preventDefault on
                                                    // dragOver the browser refuses the drop outright.
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        moveSwitch(item.label);
                                                        setDragLabel(null);
                                                    }}
                                                    className={cn(
                                                        "flex cursor-grab items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11.5px] transition-colors active:cursor-grabbing",
                                                        dragLabel === item.label
                                                            ? "border-primary bg-primary/10"
                                                            : "border-border bg-card",
                                                        // Struck through rather than hidden: an off
                                                        // component keeps its place in the order, and
                                                        // dropping it from the list would make turning
                                                        // it back on land it somewhere unexpected.
                                                        !item.keys.some((k) => effectiveComponents[k]) && "opacity-50"
                                                    )}
                                                >
                                                    <FontAwesomeIcon
                                                        icon={faGripVertical}
                                                        className="!size-[10px] text-muted-foreground"
                                                    />
                                                    <span className="grid h-4 w-4 place-items-center rounded bg-foreground/80 text-[9px] font-semibold text-background">
                                                        {index + 1}
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            "break-words",
                                                            !item.keys.some((k) => effectiveComponents[k]) && "line-through"
                                                        )}
                                                    >
                                                        {item.label}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div ref={previewWrapRef} className="flex flex-col items-center gap-4 xl:sticky xl:top-4 xl:self-start">
                                    {/* Headed like the panel beside it, so the two read
                                        as one screen rather than a card floating next to
                                        a list. Full width, or the column's `items-center`
                                        would centre the heading while its twin on the left
                                        sits against the margin. */}
                                    <div className="w-full">
                                        <PanelHeading label="Invitation Preview" />
                                    </div>
                                    {/*
                                      The real invitation, not a summary of it.

                                      This was a hand-rolled card that drew a
                                      background, the name, the date and nothing
                                      else — so the same template that renders a
                                      framed, decorated invitation in the admin
                                      panel showed the client an almost empty
                                      swatch, one step before they approve it.

                                      InvitationCard applies the template properly:
                                      frame artwork, decorations, the components the
                                      design enables, in its own component_order —
                                      filled with what was typed on steps 1-4.
                                    */}
                                    {artwork.kind === "template" ? (
                                        <InvitationCard
                                            template={cardTemplate ?? artwork.template}
                                            // Whatever step 4 was left showing — so the
                                            // preview and the toggles cannot disagree.
                                            componentsOverride={
                                                compOverride
                                                    ? Object.fromEntries(
                                                        COMPONENT_KEYS.map((k) => [k, compOverride[k] ? 1 : 0])
                                                    )
                                                    : null
                                            }
                                            orderOverride={orderOverride}
                                            data={invitationData}
                                        />
                                    ) : (
                                        /* A legacy theme has no template row to render
                                           from — only a gradient — so the older card
                                           stays for events created before the admin
                                           catalogue existed. */
                                        <div
                                            className={cn(
                                                "w-full max-w-[248px] overflow-hidden rounded-md border border-border p-6 text-center shadow-sm bg-gradient-to-br",
                                                selectedTheme?.swatch
                                            )}
                                        >
                                            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-foreground/70">
                                                You&rsquo;re invited to
                                            </p>
                                            <p
                                                className="mt-2 text-[22px] font-bold leading-tight break-words"
                                                style={{ color: form.primary_color }}
                                            >
                                                {form.name || "Your Event Name"}
                                            </p>
                                            {form.tagline && (
                                                <p className="mt-1.5 text-[12px] text-foreground/70 break-words">{form.tagline}</p>
                                            )}
                                            <div className="my-4 flex items-center justify-center gap-3 border-y border-foreground/10 py-3">
                                                <span className="text-[26px] font-bold tabular-nums text-foreground">
                                                    {form.start_date ? form.start_date.slice(8, 10) : "--"}
                                                </span>
                                                <span className="text-left text-[11px] font-semibold uppercase leading-tight text-foreground/70">
                                                    {form.start_date ? form.start_date.slice(5, 7) : "--"}
                                                    <br />
                                                    {form.start_date ? form.start_date.slice(0, 4) : "----"}
                                                </span>
                                            </div>
                                            <p className="text-[11.5px] text-foreground/70">
                                                {form.start_time || "--:--"} &ndash; {form.end_time || "--:--"}
                                            </p>
                                        </div>
                                    )}

                                    {/*
                                      No download here, deliberately.

                                      The event does not exist yet, so the card's QR
                                      is the labelled preview code — a file saved
                                      from this step would look finished and carry a
                                      code that scans to "PREVIEW ONLY". Both
                                      downloads live on step 6, once a real token has
                                      been issued.
                                    */}
                                    <p className="text-center text-[11px] text-muted-foreground">
                                        The QR code is generated when you create the event.
                                        You can download the invitation on the next step.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ── Step 8 — Review ────────────────────────────────── */}
                        {step === S_REVIEW && (
                            <div className="grid gap-4 lg:grid-cols-2">
                                {([
                                    {
                                        title: "Basic Details", go: S_BASIC, rows: [
                                            ["Event Type", selectedCategory?.name ?? "—"],
                                            ["Event Title", form.name || "—"],
                                            [isCouple ? "Couple" : "Hosts", [form.host_one, form.host_two].filter((v) => v.trim()).join(" & ") || "—"],
                                            ["Tagline", form.tagline || "—"],
                                            ["Event Status", form.privacy === "private" ? "Private" : "Public"],
                                            ["Event Photo", form.cover_image ? "Added" : "—"],
                                        ],
                                    },
                                    {
                                        title: "Date & Time", go: S_DATE, rows: [
                                            ["Starts", [form.start_date ? formatDate(form.start_date) : "", form.start_time].filter(Boolean).join(", ") || "—"],
                                            ["Ends", [form.end_date ? formatDate(form.end_date) : "", form.end_time].filter(Boolean).join(", ") || "—"],
                                            ["Time Zone", form.timezone],
                                        ],
                                    },
                                    {
                                        title: "Venue", go: S_VENUE, rows: [
                                            ["Venue", form.venue_name || "—"],
                                            ["Address", form.venue_address || "—"],
                                            ["Landmark", form.venue_landmark || "—"],
                                        ],
                                    },
                                    {
                                        title: "Menus", go: S_MENUS, rows: [
                                            ["Menus on", String(menuRows.filter((m) => isDefaultMenu(m) || (menus[m.id] ?? true)).length)],
                                        ],
                                    },
                                    {
                                        title: "Organizer Settings", go: S_ORGANIZER, rows: [
                                            ["Hosted By", form.organizer || "—"],
                                            ["Contact Number", form.contact_phone || "—"],
                                            ["Contact Email", form.contact_email || "—"],
                                            ["Footer Note", form.footer_note || "—"],
                                        ],
                                    },
                                ] as const).map((section) => (
                                    <div key={section.title} className="min-w-0 rounded-lg border border-border p-4">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <p className="text-[13px] font-bold text-foreground">{section.title}</p>
                                            <button
                                                type="button"
                                                onClick={() => setStep(section.go)}
                                                className="text-[12px] font-semibold text-primary hover:underline"
                                            >
                                                Edit
                                            </button>
                                        </div>
                                        <dl className="flex flex-col gap-1.5">
                                            {section.rows.map(([label, value]) => (
                                                <SummaryRow key={label} label={label} value={value} />
                                            ))}
                                        </dl>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── Step 9 — Event Created ─────────────────────────── */}
                        {step === S_CREATED && (
                            <div className="flex flex-col gap-6">
                                {/* ── Celebration Header ─────────────────────── */}
                                <div className="mx-auto flex max-w-lg flex-col items-center gap-3 text-center">
                                    <span className="grid h-16 w-16 place-items-center rounded-full bg-success/15">
                                        <FontAwesomeIcon icon={faCheck} className="!size-[26px] text-success" />
                                    </span>
                                    <div>
                                        <p className="text-[20px] font-bold text-success">
                                            {isEdit ? "Changes saved" : "Congratulations!"}
                                        </p>
                                        <p className="mt-1 text-[13px] text-muted-foreground">
                                            {isEdit
                                                ? "Your event has been updated. Its QR code was reissued, so please use the new one."
                                                : "Your event is ready. You can now share it with your guests."}
                                        </p>
                                    </div>
                                </div>

                                <div className="mx-auto w-full max-w-xl">
                                    {/* The invitation preview / download left with the
                                        invitation steps; it returns with that module. */}
                                    <div className="flex min-w-0 flex-col gap-4">
                                        {/* Event Quick Summary */}
                                        <div className="w-full rounded-md border border-border p-4 text-left">
                                            <p className="mb-3 text-[13px] font-bold text-foreground">Event Quick Summary</p>
                                            <dl className="flex flex-col gap-2">
                                                <SummaryRow label="Event Name" value={created?.name ?? form.name ?? "—"} />
                                                <SummaryRow
                                                    label="Date & Time"
                                                    value={
                                                        created?.start_date
                                                            ? `${created.start_date} | ${(created.start_time ?? "").slice(0, 5)} – ${(created.end_time ?? "").slice(0, 5)}`
                                                            : "—"
                                                    }
                                                />
                                                <SummaryRow label="Category" value={created?.category?.name ?? selectedCategory?.name ?? "—"} />
                                                <SummaryRow label="Menus Included" value={String(created?.menu_ids?.length ?? 0)} />
                                                <SummaryRow
                                                    label="Status"
                                                    value={
                                                        <Badge
                                                            variant="ghost"
                                                            className="rounded bg-success/15 px-2 py-0.5 text-[11px] font-semibold capitalize text-success"
                                                        >
                                                            {created?.status ?? form.status}
                                                        </Badge>
                                                    }
                                                />
                                            </dl>
                                        </div>

                                        {/* Event QR Code */}
                                        <div ref={qrWrapRef} id="event-qr" className="w-full rounded-md border border-border p-4">
                                            <p className="mb-1 text-left text-[13px] font-bold text-foreground">Event QR Code</p>
                                            <p className="mb-4 text-left text-[11.5px] text-muted-foreground">
                                                Print this on your invitation. The code carries only your event&apos;s
                                                encrypted id &mdash; only this app can read it back, and it stays the same when you edit the event.
                                            </p>
                                            <EventQr
                                                token={created?.qr_token}
                                                qrStyle={created?.qr_style}
                                                eventName={created?.name}
                                                size={190}
                                                showDownload={false}
                                            />
                                        </div>

                                        {/* Download buttons */}
                                        <DownloadingOverlay busy={downloading} />
                                        <div className="flex w-full flex-col gap-2">
                                            {!!created?.qr_token && (
                                                <DownloadFormatButton
                                                    target="qr"
                                                    label="Download QR Code"
                                                    icon={faQrcode}
                                                    busy={downloading}
                                                    onPick={downloadInvitation}
                                                />
                                            )}
                                        </div>

                                        {/* Share Tiles */}
                                        <div className="w-full">
                                            <p className="mb-3 text-left text-[13px] font-bold text-foreground">Share your event</p>
                                            <div className="grid grid-cols-4 gap-3">
                                                <ShareTile
                                                    icon={faWhatsappBrand}
                                                    label="WhatsApp"
                                                    className="bg-success/15 text-success"
                                                    soon
                                                />
                                                <ShareTile
                                                    icon={faEnvelope}
                                                    label="Email"
                                                    className="bg-primary/10 text-primary"
                                                    soon
                                                />
                                                <ShareTile
                                                    icon={faLink}
                                                    label="Copy Link"
                                                    className="bg-accent/15 text-accent"
                                                    onClick={() => {
                                                        if (!created) return;
                                                        navigator.clipboard
                                                            .writeText(`${window.location.origin}/dashboard/events/${created.id}`)
                                                            .then(() => toast.success("Event link copied"))
                                                            .catch(() => toast.error("Your browser blocked clipboard access."));
                                                    }}
                                                />
                                                <ShareTile
                                                    icon={faQrcode}
                                                    label="QR Code"
                                                    className="bg-warning/15 text-warning"
                                                    onClick={() => {
                                                        document
                                                            .getElementById("event-qr")
                                                            ?.scrollIntoView({ behavior: "smooth", block: "center" });
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <Button asChild className="mt-2 h-11 w-full rounded-md text-[13px] font-semibold">
                                            <Link href="/dashboard">Go to My Events</Link>
                                        </Button>
                                    </div>

                                </div>
                            </div>
                        )}
                    </div>

                    {/* Nav — hidden on the success step, which has its own action. */}
                    {(step < S_CREATED || !!section) && (
                        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    if (sectionPages) {
                                        // First page: Cancel back to the hub.
                                        if (pageIndex <= 0) router.push(hubHref);
                                        else setStep(sectionPages[pageIndex - 1]);
                                        return;
                                    }
                                    setStep((s) => Math.max(1, s - 1));
                                }}
                                disabled={(!sectionPages && step === 1) || saving}
                                className="h-10 rounded-md text-[13px] font-medium"
                            >
                                <FontAwesomeIcon icon={faArrowLeft} className="mr-2 !size-[12px]" />
                                {sectionPages && pageIndex <= 0 ? "Cancel" : "Back"}
                            </Button>
                            <Button
                                onClick={goNext}
                                disabled={saving}
                                className="h-10 rounded-md px-5 text-[13px] font-semibold"
                            >
                                {saving
                                    ? (isEdit ? "Saving Changes..." : "Creating Event...")
                                    : sectionPages
                                        ? (pageIndex < sectionPages.length - 1 ? "Next" : "Save")
                                    : step === S_REVIEW
                                        ? (isEdit ? "Save Changes" : "Create Event")
                                        : "Next"}
                                {!saving && (
                                    <FontAwesomeIcon icon={faArrowRight} className="ml-2 !size-[12px]" />
                                )}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-2.5 rounded-md bg-primary/5 px-4 py-3 text-center">
                <FontAwesomeIcon icon={faCircleInfo} className="!size-[13px] shrink-0 text-primary" />
                <p className="text-[12.5px] text-muted-foreground">
                    You can save your progress at any time and continue later from{" "}
                    <Link href="/dashboard/events" className="font-semibold text-primary hover:underline">
                        My Events
                    </Link>
                    .
                </p>
            </div>

            <Dialog open={exitOpen} onOpenChange={setExitOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[15px]">Exit Create Event?</DialogTitle>
                        <DialogDescription className="text-[13px]">
                            {canDraft
                                ? "Your event is not saved yet. Save it as a draft to finish later, or exit without saving."
                                : "Your event is not saved yet. A draft needs the event type, name, date and time — fill those in to save one. Exiting now will lose what you entered."}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-col gap-2 sm:flex-col sm:gap-2">
                        {canDraft && (
                            <Button
                                className="h-10 w-full rounded-md text-[13px] font-semibold"
                                onClick={saveDraftAndExit}
                            >
                                Save as Draft
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            className="h-10 w-full rounded-md text-[13px] text-destructive hover:text-destructive"
                            onClick={() => {
                                setExitOpen(false);
                                router.push("/dashboard/events");
                            }}
                        >
                            Exit without Saving
                        </Button>
                        <Button
                            variant="ghost"
                            className="h-10 w-full rounded-md text-[13px]"
                            onClick={() => setExitOpen(false)}
                        >
                            Keep Editing
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[15px]">{confirm?.title}</DialogTitle>
                        <DialogDescription className="text-[13px]">{confirm?.body}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            variant="outline"
                            className="h-10 rounded-md text-[13px]"
                            onClick={() => setConfirm(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="h-10 rounded-md text-[13px] font-semibold"
                            onClick={() => confirm?.onConfirm()}
                        >
                            {confirm?.action}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

const SUBTITLES_LAST = "Your event has been saved successfully.";

const SUBTITLES = [
    "Choose the type of event you want to create.",
    "Tell your guests what the event is.",
    "When the event starts and ends.",
    "Where the event takes place.",
    "Choose the menus to show on the participant home.",
    "How guests join and register.",
    "Who is hosting, and how guests can reach you.",
    "Check everything before you create the event.",
    SUBTITLES_LAST,
];

/* ── small building blocks ──────────────────────────────────────────────── */

function Field({
    label, required, error, hint, children,
}: {
    label: string; required?: boolean; error?: boolean; hint?: string; children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2">
            <Label className="text-[12.5px] font-medium">
                {label} {required && <span className="text-destructive">*</span>}
            </Label>
            {children}
            {hint && !error && <p className="text-[11.5px] text-muted-foreground">{hint}</p>}
            {error && <p className="text-[11.5px] text-destructive">This field is required.</p>}
        </div>
    );
}

/**
 * The event's own photo — shown on the mobile app's event card and at the top
 * of the event screen. Mandatory: every event needs a cover.
 *
 * Cropped to 16:9 BEFORE upload — same crop-then-upload pattern as
 * `ProfileAvatar` — so a raw multi-MB camera photo never reaches the server;
 * `ImageCropDialog` downscales to `outputSize`'s longest edge and re-encodes
 * as JPEG @0.9, which is what keeps the stored file small. The URL is saved
 * with the rest of the event on step 5.
 */
function CoverImageField({
    value, onChange, error, label = "Event Image", required = true,
    hint = "JPG, PNG or WEBP. Cropped to 16:9 before upload. Shown on the event card and event page in the app.",
    aspect = 16 / 9, outputSize = 1280,
    previewClassName = "aspect-[16/9] max-w-sm", cropTitle = "Crop event image",
}: {
    value: string; onChange: (url: string) => void; error?: boolean;
    label?: string; required?: boolean; hint?: string;
    /** The crop's width / height, and the longest side of the saved file. */
    aspect?: number; outputSize?: number;
    /** The preview's shape and width — keep it the same shape as `aspect`. */
    previewClassName?: string; cropTitle?: string;
}) {
    const upload = useUploadEventCover();
    const inputRef = useRef<HTMLInputElement>(null);
    const [picked, setPicked] = useState<File | null>(null);

    return (
        <div className="flex flex-col gap-2">
            <Label className="text-[12.5px] font-medium">
                {label} {required && <span className="text-destructive">*</span>}
            </Label>
            {value ? (
                // Capped width so a wide 16:9 photo does not dominate the full-width
                // step — the raw <img> used to be shown at the card's full width.
                <div className={cn("relative overflow-hidden rounded-lg border", previewClassName)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={value} alt={label} className="h-full w-full object-cover" />
                    <div className="absolute right-2 top-2 flex gap-1.5">
                        <Button
                            type="button" size="sm" variant="secondary" className="h-8"
                            disabled={upload.isPending}
                            onClick={() => inputRef.current?.click()}
                        >
                            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                            Change
                        </Button>
                        <Button
                            type="button" size="icon" variant="secondary" className="size-8"
                            aria-label="Remove image"
                            onClick={() => onChange("")}
                        >
                            <X className="size-4" />
                        </Button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    disabled={upload.isPending}
                    onClick={() => inputRef.current?.click()}
                    className={cn(
                        "flex max-w-sm flex-col items-center gap-1.5 rounded-lg border border-dashed p-6 text-center transition-colors hover:bg-muted/40 disabled:opacity-60",
                        error && "border-destructive"
                    )}
                >
                    {upload.isPending
                        ? <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        : <Upload className="size-5 text-muted-foreground" />}
                    <span className="text-[12.5px] font-medium">
                        {upload.isPending ? "Uploading…" : "Click to upload an image"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                        {hint}
                    </span>
                </button>
            )}
            {error && <p className="text-[11.5px] text-destructive">This field is required.</p>}
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Reset FIRST, so re-picking the same file after cancelling a
                    // crop still fires `change`.
                    e.target.value = "";
                    if (!file) return;
                    // Checked here too, so an absurdly large file fails instantly
                    // instead of after the crop step.
                    if (file.size > 25 * 1024 * 1024) {
                        toast.error("That image is larger than 25MB.");
                        return;
                    }
                    setPicked(file);
                }}
            />
            <ImageCropDialog
                file={picked}
                open={picked !== null}
                onOpenChange={(o) => { if (!o) setPicked(null); }}
                aspect={aspect}
                outputSize={outputSize}
                title={cropTitle}
                onCropped={(cropped) => {
                    setPicked(null);
                    upload.mutate(cropped, { onSuccess: onChange });
                }}
            />
        </div>
    );
}

/**
 * The host's own picture for a custom template, as one control the size of
 * the filter dropdowns beside it: Upload / Change, a thumbnail of what is
 * there, and the same crop (tall, the invitation's shape) as before.
 * No Remove — the picture is required on a custom template.
 */
function CustomImageButton({
    value, onChange, error,
}: { value: string; onChange: (url: string) => void; error?: boolean }) {
    const upload = useUploadEventCover();
    const inputRef = useRef<HTMLInputElement>(null);
    const [picked, setPicked] = useState<File | null>(null);

    return (
        <div className="w-full max-w-[220px]">
            <Label className="text-[11px] font-medium text-muted-foreground">
                Your Image <span className="text-destructive">*</span>
            </Label>
            <button
                type="button"
                disabled={upload.isPending}
                onClick={() => inputRef.current?.click()}
                className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-[12.5px] shadow-xs transition-colors hover:bg-muted/40 disabled:opacity-60",
                    error && "border-destructive"
                )}
            >
                {upload.isPending ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : value ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={value} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                ) : (
                    <Upload className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">
                    {upload.isPending ? "Uploading…" : value ? "Change Image" : "Upload Image"}
                </span>
            </button>
            {error && <p className="mt-1 text-[11.5px] text-destructive">This field is required.</p>}
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Reset FIRST, so re-picking the same file after cancelling a
                    // crop still fires `change`.
                    e.target.value = "";
                    if (!file) return;
                    if (file.size > 25 * 1024 * 1024) {
                        toast.error("That image is larger than 25MB.");
                        return;
                    }
                    setPicked(file);
                }}
            />
            <ImageCropDialog
                file={picked}
                open={picked !== null}
                onOpenChange={(o) => { if (!o) setPicked(null); }}
                aspect={9 / 16}
                outputSize={1080}
                title="Crop your image"
                onCropped={(cropped) => {
                    setPicked(null);
                    upload.mutate(cropped, { onSuccess: onChange });
                }}
            />
        </div>
    );
}

/**
 * The title at the top of one of step 2's two panels.
 *
 * Left-aligned with a short accent rule under it, deliberately unlike
 * `SectionRule` — a centred rule at the top of a column reads as a divider
 * BETWEEN two things rather than as the heading OF the one below it.
 */
function PanelHeading({ label }: { label: string }) {
    return (
        <div className="flex flex-col gap-1.5">
            <p className="text-[13px] font-bold text-foreground">{label}</p>
            <span className="h-0.5 w-8 rounded-full bg-primary" />
        </div>
    );
}

/**
 * A titled rule between groups of fields INSIDE a panel.
 *
 * `col-span-full` so it still spans correctly if it ever sits in a grid rather
 * than a flex column — a heading occupying one grid cell would sit beside an
 * unrelated input and read as that field's label.
 */
function SectionRule({ label }: { label: string }) {
    return (
        <div className="relative col-span-full pt-2">
            <Separator className="absolute inset-x-0 top-1/2" />
            <span className="relative mx-auto block w-fit bg-card px-3 text-[12.5px] font-semibold text-primary">
                {label}
            </span>
        </div>
    );
}

function Counter({ value, max }: { value: number; max: number }) {
    return (
        <p className="text-right text-[11px] tabular-nums text-muted-foreground">
            {value}/{max}
        </p>
    );
}

function IconInput({
    icon, type, value, onChange, invalid, disabled,
}: {
    icon: typeof faCalendarDays; type: string; value: string;
    onChange: (v: string) => void; invalid?: boolean; disabled?: boolean;
}) {
    return (
        <div className="relative">
            <FontAwesomeIcon
                icon={icon}
                className="pointer-events-none absolute left-3.5 top-1/2 !size-[13px] -translate-y-1/2 text-muted-foreground"
            />
            <Input
                type={type}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className={cn("h-11 rounded-md pl-10", invalid && "border-destructive")}
            />
        </div>
    );
}

function TaxonomySelect({
    value, onChange, rows, loading, disabled, placeholder, invalid,
}: {
    value: string;
    onChange: (v: string) => void;
    rows?: { id: number; name: string }[];
    loading?: boolean;
    disabled?: boolean;
    placeholder: string;
    invalid?: boolean;
}) {
    if (loading && !disabled) return <Skeleton className="h-11 w-full rounded-md" />;
    return (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className={cn("h-11 w-full rounded-md", invalid && "border-destructive")}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {(rows ?? []).length === 0 ? (
                    <div className="px-3 py-2 text-[12.5px] text-muted-foreground">No options available</div>
                ) : (
                    rows!.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                    ))
                )}
            </SelectContent>
        </Select>
    );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
            <dd className="text-right text-[12.5px] font-medium text-foreground break-words">{value}</dd>
        </div>
    );
}

/**
 * One share target.
 *
 * `soon` renders it visibly unavailable instead of as a live button. These were
 * all four plain <button>s with no handler — indistinguishable from working
 * ones until you clicked and nothing happened.
 */
function ShareTile({
    icon, label, className, onClick, soon,
}: {
    icon: typeof faEnvelope;
    label: string;
    className: string;
    onClick?: () => void;
    soon?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={soon}
            title={soon ? "Not available yet" : undefined}
            className={cn(
                "flex flex-col items-center gap-1.5",
                soon ? "cursor-not-allowed opacity-45" : "group"
            )}
        >
            <span
                className={cn(
                    "grid h-11 w-11 place-items-center rounded-md transition-transform",
                    !soon && "group-hover:-translate-y-0.5",
                    className
                )}
            >
                <FontAwesomeIcon icon={icon} className="!size-[16px]" />
            </span>
            <span className="text-[11px] text-muted-foreground">{label}</span>
            {soon && (
                <Badge variant="secondary" className="rounded px-1 py-0 text-[8.5px] font-semibold uppercase">
                    Soon
                </Badge>
            )}
        </button>
    );
}
