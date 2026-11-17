'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import { StyledQrSvg, toQrStyle } from '@/components/common/styled-qr';
import { cn } from '@/lib/utils';
import type { TemplateOption } from '@/hooks/use-client-portal';
import { mediaUrl } from '@/lib/media-url';
import { useTemplateFonts } from '@/hooks/use-template-fonts';

/**
 * The client's invitation, drawn from an admin template plus their own data.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The admin panel has `TemplatePreview`, which renders a template properly:
 * frame artwork, decorations, per-component blocks in `component_order`, and
 * ink chosen by measured contrast. The client portal had a hand-rolled card
 * that drew a background, a name, a date and nothing else — so the SAME
 * template looked like a finished invitation in the admin and like an empty
 * swatch to the client about to approve it.
 *
 * This is the portal's counterpart. Same rendering rules, with one deliberate
 * difference: the admin's version shows SAMPLE content (Rahul & Priya) because
 * a template has no event, whereas this one shows what the client actually
 * typed. Where a field is still blank it falls back to a placeholder, so the
 * card never renders as a hole mid-wizard.
 *
 * The two are separate repos, so this cannot import that component. What it
 * must not do is drift on the RULES — the contrast maths, the frame-replaces-
 * border rule and the decoration placements are copied deliberately and noted
 * as such.
 */

export interface InvitationData {
    name?: string | null;
    /**
     * The two host lines. When both are set the card prints them either side of
     * an ampersand, the way the admin's own preview draws Rahul & Priya; with
     * neither it falls back to the event name, which is what every event
     * created before these fields existed has.
     */
    hostOne?: string | null;
    hostTwo?: string | null;
    tagline?: string | null;
    description?: string | null;
    /** `YYYY-MM-DD`. */
    startDate?: string | null;
    /** `HH:MM` or `HH:MM:SS`. */
    startTime?: string | null;
    endTime?: string | null;
    venueName?: string | null;
    venueAddress?: string | null;
    organizer?: string | null;
    contact?: string | null;
    footerNote?: string | null;
    /** The client's chosen accent, from wizard step 4. */
    primaryColor?: string | null;
    /**
     * The event's `qr_token`, when one has been issued.
     *
     * Absent on a template in the catalogue and on the wizard before step 5 is
     * submitted — there is no event yet, so there is nothing to encode. The card
     * draws a clearly-labelled preview code in that case rather than the generic
     * QR glyph it used to, which made the block read as an icon rather than as
     * the code that will actually be printed there.
     */
    qrToken?: string | null;
    /** The event's `qr_style` (0 classic, 1 rounded, 2 heart). */
    qrStyle?: number | null;
    /**
     * The host's own event logo (`events.logo_image`). Drawn where the
     * template's Event Logo sits, in place of the template's sample.
     */
    logoImage?: string | null;
}

/** Where a corner / side Event Logo sits inside the safe area — same as the admin preview. */
const LOGO_CORNER: Record<string, string> = {
    'top-left': 'left-0 top-0',
    'top-right': 'right-0 top-0 justify-end',
    left: 'left-0 top-1/2 -translate-y-1/2',
    right: 'right-0 top-1/2 -translate-y-1/2 justify-end',
    'bottom-left': 'left-0 bottom-0',
    'bottom-right': 'right-0 bottom-0 justify-end',
};

const COMPONENT_KEYS = [
    'event_title', 'host_names', 'date_time', 'venue', 'event_qr_code', 'organizer',
    'event_photos', 'contact_details', 'invitation_message',
    'footer_note', 'decoration_elements',
] as const;

type ComponentKey = (typeof COMPONENT_KEYS)[number];

/**
 * What an unissued QR encodes.
 *
 * A REAL matrix, so the design reads truthfully — the old glyph was a picture of
 * a QR code, not one, and it made the block impossible to judge at design time.
 * But it is deliberately readable when scanned: anyone who points a phone at a
 * preview gets this sentence back, not a plausible-looking string of gibberish
 * they might mistake for a working code.
 */
const PREVIEW_QR_VALUE = 'PREVIEW ONLY - this event has no QR code yet';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * `2026-09-30` to its parts, by regex.
 *
 * Never `new Date(value)`: that applies the browser's timezone to a DATEONLY
 * string which never had one, and shows the day before its own date for anyone
 * west of UTC.
 */
const splitDate = (value?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
    if (!m) return null;
    return { year: m[1], month: MONTHS[Number(m[2]) - 1] ?? '---', day: m[3] };
};

/** A stored `HH:MM:SS` and a form's `HH:MM` both display as `HH:MM`. */
const hhmm = (value?: string | null) => (value ? String(value).slice(0, 5) : null);

/* ── contrast, mirrored from the admin preview ───────────────────────────── */

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const hex = (value: string | null | undefined, fallback: string) =>
    value && HEX.test(value) ? value : fallback;

const rgbTriple = (value: string | null | undefined): [number, number, number] | null => {
    const m = /^#([0-9a-fA-F]{6})$/.exec(String(value ?? '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const hexToRgbString = (value: string | null | undefined): string | null => {
    const t = rgbTriple(value);
    return t ? t.join(',') : null;
};

/** WCAG relative luminance — gamma-correct, so mid-blues are judged properly. */
const luminance = ([r, g, b]: [number, number, number]): number => {
    const f = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrastRatio = (a: [number, number, number], b: [number, number, number]) =>
    (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

/** Alpha-composite `fg` over `bg`, exactly as the overlay layer paints. */
const composite = (
    fg: [number, number, number],
    bg: [number, number, number],
    alpha: number
): [number, number, number] =>
    [0, 1, 2].map((i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha))) as [number, number, number];

const rgbToHsl = ([r, g, b]: [number, number, number]): [number, number, number] => {
    const R = r / 255, G = g / 255, B = b / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    return [h / 6, s, l];
};

const hslToRgb = ([h, s, l]: [number, number, number]): [number, number, number] => {
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
        let T = t; if (T < 0) T += 1; if (T > 1) T -= 1;
        if (T < 1 / 6) return p + (q - p) * 6 * T;
        if (T < 1 / 2) return q;
        if (T < 2 / 3) return p + (q - p) * (2 / 3 - T) * 6;
        return p;
    };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255)) as [number, number, number];
};

/**
 * The accent, nudged only as far as legibility demands.
 *
 * HUE AND SATURATION ARE PRESERVED — only lightness moves, and only until the
 * target is met, so the result still reads as the colour that was chosen rather
 * than a computed replacement.
 */
const readableOn = (
    colour: [number, number, number],
    backdrop: [number, number, number],
    target = 4.5
): [number, number, number] => {
    if (contrastRatio(colour, backdrop) >= target) return colour;
    const [h, sat] = rgbToHsl(colour);
    let best = colour;
    let bestRatio = contrastRatio(colour, backdrop);
    for (let step = 1; step <= 20; step += 1) {
        for (const l of [0.5 - step * 0.025, 0.5 + step * 0.025]) {
            if (l < 0 || l > 1) continue;
            const candidate = hslToRgb([h, sat, l]);
            const ratio = contrastRatio(candidate, backdrop);
            if (ratio >= target) return candidate;
            if (ratio > bestRatio) { bestRatio = ratio; best = candidate; }
        }
    }
    return best;
};

const INK_DARK: [number, number, number] = [58, 44, 34];
const INK_LIGHT: [number, number, number] = [247, 242, 234];
const toHexString = ([r, g, b]: [number, number, number]) =>
    `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

/** CSS angle for each stored gradient direction. Matches the backend's table. */
const GRADIENT_DEG: Record<string, number> = {
    top: 0, 'top-right': 45, right: 90, 'bottom-right': 135,
    bottom: 180, 'bottom-left': 225, left: 270, 'top-left': 315,
};

function backgroundStyle(t: TemplateOption): React.CSSProperties {
    const primary = hex(t.background_color, '#FFF7F0');

    // `custom` paints the uploaded design too — the Custom tab's upload writes
    // the same `background_image` column, masked to a shape.
    if ((t.background_type === 'image' || t.background_type === 'custom') && t.background_image) {
        const isCustom = t.background_type === 'custom';
        const position = isCustom ? t.background_position : t.image_position;
        const size = isCustom && Number(t.image_size) && Number(t.image_size) !== 100
            ? `${Number(t.image_size)}%`
            : (t.image_scale ?? 'cover');
        return {
            backgroundImage: `url(${mediaUrl(t.background_image)})`,
            backgroundSize: size,
            backgroundPosition: (position ?? 'center').replace(/-/g, ' '),
            backgroundRepeat: 'no-repeat',
        };
    }

    if (t.background_type === 'gradient') {
        const from = hex(t.gradient_from, primary);
        const to = hex(t.gradient_to, hex(t.secondary_color, '#F3E8DA'));
        // The third stop is omitted entirely when unset — a two-stop gradient
        // and one whose middle repeats an end are not the same picture.
        const stops = [from, t.gradient_via ? hex(t.gradient_via, from) : null, to].filter(Boolean).join(', ');
        if (t.gradient_type === 'radial') {
            // `circle at center`, not the default ellipse, which would stretch
            // with the card and look like a different gradient per orientation.
            return { backgroundImage: `radial-gradient(circle at center, ${stops})` };
        }
        const deg = GRADIENT_DEG[t.gradient_direction ?? 'bottom'] ?? 180;
        return { backgroundImage: `linear-gradient(${deg}deg, ${stops})` };
    }

    return { backgroundColor: primary };
}

/** The Custom background's shape mask. Only applies to `custom`. */
function shapeStyle(t: TemplateOption): React.CSSProperties {
    if (t.background_type !== 'custom') return {};
    const radius = `${Math.min(Math.max(Number(t.corner_radius) || 0, 0), 100) / 2}%`;
    switch (t.image_shape) {
        case 'circle': return { borderRadius: '50%' };
        // A heart as wide as the card and as tall as it is wide, centred in
        // the card's box — the box itself keeps its size, so everything that
        // scales or measures this card is unaffected. See `invHeartClip`.
        case 'heart': return { clipPath: 'url(#invHeartClip)' };
        // Arch as a border-radius, not a clip-path, so frame artwork drawn on
        // top follows the same silhouette instead of disagreeing at the curve.
        case 'arch': return { borderRadius: `999px 999px ${radius} ${radius}` };
        case 'square':
        case 'rectangle':
        default: return { borderRadius: radius };
    }
}

const BORDER_CLASS: Record<string, string> = {
    ornate: 'rounded-md border-[3px] border-double',
    corners: 'rounded-none border-2',
    arch: 'rounded-t-[999px] rounded-b-md border-2',
    'floral-top': 'rounded-md border-t-4 border-x border-b',
    none: 'border-0',
};

const normaliseOrder = (order?: string[] | null): ComponentKey[] => {
    const given = (order ?? []).filter((k): k is ComponentKey =>
        (COMPONENT_KEYS as readonly string[]).includes(k));
    // Anything the stored order omits is appended, so a template saved before a
    // component existed still renders it rather than dropping it silently.
    return [...given, ...COMPONENT_KEYS.filter((k) => !given.includes(k))];
};

export function InvitationCard({
    template,
    data,
    componentsOverride,
    orderOverride,
    className,
}: {
    template: TemplateOption;
    data: InvitationData;
    /**
     * The client's per-event override of which components show, and in what
     * order. Undefined or null means "inherit from the template" — which is
     * what every event that has never been customised means.
     */
    componentsOverride?: Record<string, number | boolean> | null;
    orderOverride?: string[] | null;
    className?: string;
}) {
    // A template may name a font the admin added; this tells the browser
    // where it lives.
    useTemplateFonts();
    /**
     * Scale the invitation down until it fits.
     *
     * A real invitation is a fixed canvas and everything on it is sized against
     * that canvas. Laying twelve components out at fixed sizes inside a small
     * card overflows equally top and bottom — the invite line disappears off the
     * top, the footer off the bottom, and the frame's rule appears to cut
     * through the text. A transform does not affect layout, so `scrollHeight`
     * stays the UNSCALED height and the measurement cannot feed back into itself.
     */
    const boxRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [fit, setFit] = useState(1);

    // The event's own order when it has one, the template's otherwise.
    const order = normaliseOrder(orderOverride?.length ? orderOverride : template.component_order);

    /**
     * Whether a component shows.
     *
     * The event's override wins outright when present — it is the client's
     * decision for this one invitation. With no override the template decides,
     * which keeps an uncustomised event following the design as the admin edits
     * it. Absent means on in both cases: a key that was never stored is not the
     * same as one deliberately switched off.
     */
    const on = (key: ComponentKey) => {
        // The QR code is ON BY DEFAULT: an event that follows its template
        // draws it whatever the template says. Only the client's own choice
        // (an override) can switch it off.
        if (key === 'event_qr_code' && !componentsOverride) return true;
        const source = componentsOverride ?? template.components;
        const v = source?.[key];
        return v === undefined || !!Number(v);
    };

    const headingFont = template.primary_font || 'Playfair Display';
    const bodyFont = template.secondary_font || 'Poppins';
    const frameUrl = mediaUrl(template.frame_url) || null;

    /**
     * Event Logo (2026-11-17): the host's own logo, else the template's sample.
     * Top / centre / bottom join the column of content so it never covers the
     * names; a corner or side pins it there. Same rule as the admin preview.
     */
    const logoUrl = mediaUrl(data.logoImage || template.logo_image) || null;
    const logoPos = template.logo_position || 'top';
    const logoInFlow = !!logoUrl && ['top', 'center', 'bottom'].includes(logoPos);
    const logoWidth = `${(18 * Math.min(Math.max(Number(template.logo_size) || 100, 60), 200)) / 100}%`;
    const logoEl = logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" data-event-logo
            className="pointer-events-none block h-auto object-contain"
            style={{ width: logoInFlow ? logoWidth : '100%' }} />
    ) : null;
    // Real artwork wins over the CSS fallback — drawing both gives a double edge.
    const borderClass = frameUrl ? 'border-0' : (BORDER_CLASS[template.border_style ?? 'none'] ?? 'border-0');

    const decorations = template.decorationItems ?? [];
    const placed = (type: string) => decorations.filter((d) => d.type === type && d.file_url);

    const hasTopArt = placed('top').length > 0 || placed('corner').length > 0;
    const hasBottomArt = placed('bottom').length > 0 || placed('corner').length > 0;

    /**
     * The safe area, as a PERCENTAGE of the card.
     *
     * Applied by absolute insets, not padding: CSS percentage padding resolves
     * against the containing block's WIDTH on all four sides, so `padding-top:
     * 8%` on a 9:16 card is 8% of the width — about half what it should be.
     */
    /**
     * A Custom template masks the card to a SHAPE, and the words have to stay
     * inside it (Jamal, 2026-10-06: on Heart the text ran outside the shape and
     * was cut off). The rectangle that fits inside each shape, as insets:
     *   heart  — (admin preview only; not drawn on this card, see below)
     *   circle — the square inside it;
     *   arch   — the curve takes the top corners.
     * Rectangle and square need nothing extra. Same numbers in the admin
     * preview and the client portal card.
     */
    const shapeBox =
        template.background_type === 'custom'
            ? ({
                  // The heart is drawn in the middle 56% of a portrait card's
                  // height, so its text box is measured inside that band.
                  heart: template.orientation === 'landscape'
                      ? { x: 28, top: 16, bottom: 13 }
                      : { x: 15, top: 31, bottom: 29 },
                  circle: { x: 17, top: 17, bottom: 17 },
                  arch: { x: 11, top: 17, bottom: 6 },
              } as Record<string, { x: number; top: number; bottom: number }>)[template.image_shape ?? ''] ?? null
            : null;
    // A shape leaves less room, so its card may shrink further before giving up.
    const minFit = shapeBox ? 0.3 : 0.45;
    const safeX = Math.max(frameUrl ? 11 : 6, shapeBox?.x ?? 0);
    // 13, not 9 (2026-10-06): many frames carry corner fans, an arch or a
    // head / foot ornament deeper than their rule, and the words ran into them.
    const safeTop = Math.max(frameUrl ? 13 : 4, hasTopArt ? 10 : 0, shapeBox?.top ?? 0);
    const safeBottom = Math.max(frameUrl ? 13 : 4, hasBottomArt ? 10 : 0, shapeBox?.bottom ?? 0);

    const overlay = Math.min(Math.max(Number(template.overlay_opacity) || 0, 0), 100) / 100;
    const overlayTint = hexToRgbString(template.overlay_color) ?? '0,0,0';
    const overlayDrawn = overlay > 0;

    /** The backdrop the text actually sits on, so the ink can be derived. */
    const backdrop = ((): [number, number, number] => {
        const base = rgbTriple(hex(template.background_color, '#FFF7F0')) ?? [255, 247, 240];
        if (template.background_type === 'gradient') {
            const stops = [template.gradient_from, template.gradient_via, template.gradient_to]
                .map((c) => rgbTriple(c ?? null))
                .filter(Boolean) as [number, number, number][];
            if (stops.length) {
                return [0, 1, 2].map((i) =>
                    Math.round(stops.reduce((sum, st) => sum + st[i], 0) / stops.length)
                ) as [number, number, number];
            }
        }
        // For a photo the pixels are unknowable; assume a mid tone so the
        // decision falls to the overlay, which exists for exactly that.
        if ((template.background_type === 'image' || template.background_type === 'custom') && template.background_image) {
            return template.background_color ? base : [128, 128, 128];
        }
        return base;
    })();

    const tintTriple = overlayTint.split(',').map(Number) as [number, number, number];
    const effective = overlayDrawn ? composite(tintTriple, backdrop, overlay) : backdrop;

    // Compared, not thresholded: a threshold gets mid-tones wrong in both
    // directions, picking light ink where dark would have contrasted more.
    const plainInk = [INK_DARK, INK_LIGHT]
        .map((candidate) => ({ candidate, ratio: contrastRatio(candidate, effective) }))
        .sort((a, b) => b.ratio - a.ratio)[0].candidate;

    /**
     * The words follow the template's Secondary Color (2026-10-06): the picked
     * colour in a shade strong enough to read (7:1, hue kept), not one of the
     * two fixed inks. The fixed ink is the fallback when no colour is set or
     * it cannot be made readable here. Same rule as the admin's
     * `template-preview.tsx` and the app's `designInk` — change all three
     * together.
     */
    const pickedAccent = rgbTriple(template.secondary_color);
    const tintedInk = pickedAccent ? readableOn(pickedAccent, effective, 7) : null;
    const ink = toHexString(
        tintedInk && contrastRatio(tintedInk, effective) >= 4.5 ? tintedInk : plainInk
    );

    const accent = hex(template.secondary_color, '#8A6A3B');
    const accentRgb = rgbTriple(accent) ?? [138, 106, 59];
    // Anything carrying WORDS has to be readable before it is on-brand.
    const accentInk = toHexString(readableOn(accentRgb, effective));
    // Small strokes need to be seen, not read — 3:1, the non-text WCAG bar.
    const accentLine = toHexString(readableOn(accentRgb, effective, 3));

    /**
     * The client's own accent, used for the event name.
     *
     * Held to the same legibility floor as everything else: it is picked from a
     * swatch row with no knowledge of the template behind it, so a mid-tone pick
     * on a mid-tone design would otherwise vanish.
     */
    const nameColour = data.primaryColor && rgbTriple(data.primaryColor)
        ? toHexString(readableOn(rgbTriple(data.primaryColor)!, effective))
        : ink;

    /**
     * The QR code is drawn in the client's Primary Colour too (Jamal,
     * 2026-10-07). It sits on its own WHITE tile whatever the design, so the
     * colour is darkened against white until 7:1 — a pale code does not scan.
     * No colour picked = black, as before.
     */
    const qrColour = data.primaryColor && rgbTriple(data.primaryColor)
        ? toHexString(readableOn(rgbTriple(data.primaryColor)!, [255, 255, 255], 7))
        : '#000000';

    const date = splitDate(data.startDate);
    const start = hhmm(data.startTime);
    const end = hhmm(data.endTime);

    const dividerArt = placed('divider')[0] ?? null;

    // The template's Border Color and font sizes (2026-10-06) — the same rules
    // as the admin's `template-preview.tsx`; change both together.
    const frameTint = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(template.frame_color ?? '')
        ? (template.frame_color as string)
        : null;
    const frameTintId = `frame-tint-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

    // Decoration Color: the decorations in one colour, the same way as the frame.
    const decorationTint = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(template.decoration_color ?? '')
        ? (template.decoration_color as string)
        : null;
    const decorationTintId = `${frameTintId}-decor`;
    const decoStyle = decorationTint ? { filter: `url(#${decorationTintId})` } : undefined;
    const pct = (value: number | null | undefined) => Math.min(Math.max(Number(value) || 100, 60), 160) / 100;
    // Names take the Primary Font's size, every other line of words the
    // Secondary Font's; the QR code and the decoration row are not text.
    const blockZoom = (key: ComponentKey) =>
        key === 'host_names'
            ? pct(template.primary_font_size)
            : key === 'event_qr_code' || key === 'decoration_elements'
              ? 1
              : pct(template.secondary_font_size);

    const blocks: Record<ComponentKey, React.ReactNode> = {
        event_title: (
            <div className="text-center">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.22em]"
                    style={{ color: accentInk, fontFamily: bodyFont }}>
                    You&rsquo;re invited to
                </div>
            </div>
        ),
        host_names: (
            <div className="text-center leading-tight" style={{ fontFamily: headingFont }}>
                {/* Two hosts print on their own lines round an ampersand, as the
                    admin preview draws them. With neither filled in, the event
                    name stands in — which is all an older event has. */}
                {data.hostOne || data.hostTwo ? (
                    <>
                        <div className="text-[26px] font-bold italic break-words" style={{ color: nameColour }}>
                            {data.hostOne || data.hostTwo}
                        </div>
                        {data.hostOne && data.hostTwo && (
                            <>
                                <div className="my-0.5 text-[12px]" style={{ color: accentInk }}>&amp;</div>
                                <div className="text-[26px] font-bold italic break-words" style={{ color: nameColour }}>
                                    {data.hostTwo}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="text-[28px] font-bold italic break-words" style={{ color: nameColour }}>
                        {data.name || 'Your Event Name'}
                    </div>
                )}
                {data.tagline && (
                    <div className="mt-1 text-[9.5px] break-words" style={{ color: ink, opacity: 0.8, fontFamily: bodyFont }}>
                        {data.tagline}
                    </div>
                )}
            </div>
        ),
        date_time: (
            <div className="text-center" style={{ fontFamily: bodyFont, color: ink }}>
                <div className="text-[13.5px] font-bold tracking-[0.14em]">
                    {date ? `${date.day} · ${date.month} · ${date.year}` : '-- · --- · ----'}
                </div>
                <div className="text-[9.5px] tracking-[0.12em] opacity-80">
                    {start || '--:--'} &ndash; {end || '--:--'}
                </div>
            </div>
        ),
        venue: (
            <div className="text-center" style={{ fontFamily: bodyFont, color: ink }}>
                <div className="text-[12px] font-semibold break-words">{data.venueName || 'Venue to be confirmed'}</div>
                {data.venueAddress && (
                    // Words only — no location pin, no phone icon, no camera
                    // boxes on this card (2026-10-06, as the admin preview).
                    <div className="text-[9.5px] opacity-80 break-words">{data.venueAddress}</div>
                )}
            </div>
        ),
        event_qr_code: (
            <div className="flex flex-col items-center gap-0.5">
                {/*
                  The real code, drawn as a real QR.

                  SVG rather than canvas: the card is scaled by a transform to
                  fit its box and exported at 3x for print, and a vector survives
                  both. A canvas would be resampled twice.

                  Always on its own white tile, even on a dark design — an
                  inverted QR is rejected by most scanners. The modules are the
                  client's Primary Colour, darkened to scan (`qrColour`).
                */}
                <div className="flex h-14 w-14 items-center justify-center rounded-sm border bg-white"
                    style={{ borderColor: accentLine }}>
                    <StyledQrSvg
                        value={data.qrToken || PREVIEW_QR_VALUE}
                        size={56}
                        qrStyle={toQrStyle(data.qrStyle)}
                        color={qrColour}
                        // Lowest error correction: the token is ~300 characters, which
                        // at level M needs an 85-module grid drawn in a 56px box —
                        // under a pixel per module on screen and too fine to scan off
                        // a print. Level L needs a smaller grid, so each module is
                        // bigger. The code is a clean vector, not a scuffed sticker,
                        // so the extra error correction bought little.
                        level="L"
                        // The quiet zone belongs INSIDE the code, not as CSS
                        // padding around it: measured in modules it scales with
                        // the code, so it stays correct at any printed size.
                        // A QR flush to its own edge scans poorly.
                        marginSize={2}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>
            </div>
        ),
        organizer: (
            <div className="text-center text-[9.5px] opacity-80" style={{ fontFamily: bodyFont, color: ink }}>
                {data.organizer || 'Hosted by the family'}
            </div>
        ),
        // Never a block of its own: the three camera boxes are gone. On a
        // Custom template the section still decides whether the host's own
        // picture is shown — that is worked out where the artwork is resolved.
        event_photos: null,
        contact_details: (
            <div className="text-center text-[9.5px] opacity-80" style={{ fontFamily: bodyFont, color: ink }}>
                {data.contact || '+91 00000 00000'}
            </div>
        ),
        invitation_message: (
            <div className="px-3 text-center text-[9.5px] italic leading-snug opacity-90 break-words"
                style={{ fontFamily: bodyFont, color: ink }}>
                {data.description || 'Together with our families, we request the honour of your presence.'}
            </div>
        ),
        footer_note: (
            <div className="text-center text-[8.5px] tracking-wide opacity-80 break-words"
                style={{ fontFamily: bodyFont, color: ink }}>
                {data.footerNote || 'Thank you for being part of our story.'}
            </div>
        ),
        // A chosen divider decoration is this row: its own line between two
        // sections, placed by Component Order. Same as the admin preview.
        decoration_elements: dividerArt ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(dividerArt.file_url)} alt="" style={decoStyle} data-tint={decorationTint ?? undefined} className="pointer-events-none mx-auto block w-24 opacity-80" />
        ) : (
            <div className="flex items-center justify-center gap-1.5" style={{ color: accentLine }}>
                <FontAwesomeIcon icon={faWandMagicSparkles} className="!size-[10px]" />
                <span className="h-px w-8" style={{ backgroundColor: accentLine }} />
                <FontAwesomeIcon icon={faWandMagicSparkles} className="!size-[10px]" />
            </div>
        ),
    };

    // On a custom template the picture fills the card — it IS the event
    // photo — so the Event Photos block is not drawn over it a second time.
    // The divider is the Decoration Elements row, so that switch (the
    // client's own, since 2026-10-06) shows and hides it.
    const visible = order.filter((key) => on(key) && key !== 'event_photos');
    // Extracted so the dependency array stays statically checkable.
    const visibleKey = visible.join(',');

    useLayoutEffect(() => {
        const box = boxRef.current;
        const content = contentRef.current;
        if (!box || !content) return;

        const measure = () => {
            const availH = box.clientHeight;
            const availW = box.clientWidth;
            const naturalH = content.scrollHeight;
            const naturalW = content.scrollWidth;
            if (!availH || !naturalH) return;
            const ratio = Math.min(availH / naturalH, availW / naturalW, 1);
            // Never shrink past legibility — below this the honest answer is
            // that too much is switched on.
            setFit(Math.max(ratio, minFit));
        };

        measure();
        // Cannot loop: a CSS transform changes no layout box, so applying the
        // scale produces no resize notification.
        const ro = new ResizeObserver(measure);
        ro.observe(box);
        ro.observe(content);
        return () => ro.disconnect();
    }, [
        visibleKey, template.orientation, template.primary_font, template.secondary_font,
        template.primary_font_size, template.secondary_font_size, safeX, safeTop, safeBottom,
    ]);

    return (
        <div
            data-invitation-card
            className={cn(
                'relative overflow-hidden shadow-md',
                template.orientation === 'landscape' ? 'aspect-[16/10] w-full max-w-[420px]' : 'aspect-[9/16] w-[248px]',
                borderClass,
                template.border_style && template.border_style !== 'none' && !frameUrl ? 'border-solid' : '',
                className
            )}
            style={{ ...backgroundStyle(template), ...shapeStyle(template), borderColor: accent }}
        >
            {/* Zero-size: only referenced by the Heart shape's clip-path. The
                path is drawn for a square and placed in the middle of the card. */}
            {template.background_type === 'custom' && template.image_shape === 'heart' && (
                <svg width="0" height="0" aria-hidden className="absolute">
                    <defs>
                        <clipPath id="invHeartClip" clipPathUnits="objectBoundingBox">
                            <path
                                transform={template.orientation === 'landscape'
                                    ? 'translate(0.1875 0) scale(0.625 1)'
                                    : 'translate(0 0.21875) scale(1 0.5625)'}
                                d="M0.5,0.97 C0.22,0.76 0.01,0.56 0.01,0.31 C0.01,0.14 0.14,0.03 0.28,0.03 C0.38,0.03 0.46,0.08 0.5,0.16 C0.54,0.08 0.62,0.03 0.72,0.03 C0.86,0.03 0.99,0.14 0.99,0.31 C0.99,0.56 0.78,0.76 0.5,0.97 Z"
                            />
                        </clipPath>
                    </defs>
                </svg>
            )}
            {overlayDrawn && (
                <div className="pointer-events-none absolute inset-0"
                    style={{ backgroundColor: `rgba(${overlayTint},${overlay})` }} />
            )}

            {/* Decorations sit UNDER the content: an ornament covering the
                couple's names is not a decoration. */}
            {placed('motif').slice(0, 1).map((d) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={d.id} src={mediaUrl(d.file_url)} alt="" style={decoStyle} data-tint={decorationTint ?? undefined}
                    className="pointer-events-none absolute left-1/2 top-1/2 w-2/3 -translate-x-1/2 -translate-y-1/2 opacity-20" />
            ))}
            {placed('top').slice(0, 1).map((d) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={d.id} src={mediaUrl(d.file_url)} alt="" style={decoStyle} data-tint={decorationTint ?? undefined} className="pointer-events-none absolute inset-x-0 top-0 w-full" />
            ))}
            {placed('bottom').slice(0, 1).map((d) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={d.id} src={mediaUrl(d.file_url)} alt="" style={decoStyle} data-tint={decorationTint ?? undefined} className="pointer-events-none absolute inset-x-0 bottom-0 w-full" />
            ))}
            {/* One uploaded corner, mirrored into all four. */}
            {placed('corner').slice(0, 1).map((d) =>
                (['left-0 top-0', 'right-0 top-0 -scale-x-100', 'left-0 bottom-0 -scale-y-100', 'right-0 bottom-0 -scale-100'] as const).map((pos) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${d.id}-${pos}`} src={mediaUrl(d.file_url)} alt="" style={decoStyle} data-tint={decorationTint ?? undefined}
                        className={cn('pointer-events-none absolute w-2/5', pos)} />
                ))
            )}
            {placed('ornament').slice(0, 1).map((d) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={d.id} src={mediaUrl(d.file_url)} alt="" style={decoStyle} data-tint={decorationTint ?? undefined}
                    className="pointer-events-none absolute inset-x-0 top-0 mx-auto w-3/5" />
            ))}
            {/* The divider is not drawn here any more (2026-10-06): pinned to
                the centre of the card it ran through whichever line of text was
                there. It is a row of the content — see `decoration_elements`. */}

            {/* The frame is drawn LAST, over the content: it occupies the margin,
                and a border under the text would be half-hidden by whatever
                component reaches the edge. */}
            {/* An SVG filter floods the frame's shape with the one colour — a
                CSS mask would need the image served with CORS headers. */}
            {decorationTint ? (
                <svg width="0" height="0" aria-hidden className="absolute">
                    <defs>
                        <filter id={decorationTintId} colorInterpolationFilters="sRGB">
                            <feFlood floodColor={decorationTint} result="colour" />
                            <feComposite in="colour" in2="SourceAlpha" operator="in" />
                        </filter>
                    </defs>
                </svg>
            ) : null}
            {frameUrl && frameTint && (
                <svg width="0" height="0" aria-hidden className="absolute">
                    <defs>
                        <filter id={frameTintId} colorInterpolationFilters="sRGB">
                            <feFlood floodColor={frameTint} result="colour" />
                            <feComposite in="colour" in2="SourceAlpha" operator="in" />
                        </filter>
                    </defs>
                </svg>
            )}
            {frameUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frameUrl} alt="" className="pointer-events-none absolute inset-0 z-10 h-full w-full object-fill"
                    style={frameTint ? { filter: `url(#${frameTintId})` } : undefined}
                    data-tint={frameTint ?? undefined} />
            )}

            <div
                ref={boxRef}
                className="absolute flex items-center justify-center overflow-hidden"
                style={{ left: `${safeX}%`, right: `${safeX}%`, top: `${safeTop}%`, bottom: `${safeBottom}%` }}
            >
                {/* The sections are spread down the card, not bunched in the
                    middle: a card with seven sections left the top and bottom
                    thirds empty. `min-height` only matters while the content is
                    SHORTER than the card — a taller one still scales to fit.
                    Admin preview and client portal use the same numbers. */}
                <div
                    ref={contentRef}
                    className="flex w-full flex-col items-center justify-evenly gap-1.5"
                    style={{ minHeight: '86%', transform: `scale(${fit})`, transformOrigin: 'center center' }}
                >
                    {logoInFlow && logoPos === 'top' && logoEl}
                    {visible.length === 0 && !logoUrl ? (
                        <div className="px-4 text-center text-[10px]" style={{ color: ink }}>
                            This template has every component switched off.
                        </div>
                    ) : (
                        visible.map((key, i) => (
                            <div key={key} className="contents">
                                {logoInFlow && logoPos === 'center' && i === Math.floor(visible.length / 2) && logoEl}
                                <div style={{ zoom: blockZoom(key) }}>
                                    {blocks[key]}
                                </div>
                            </div>
                        ))
                    )}
                    {logoInFlow && (logoPos === 'bottom' || (logoPos === 'center' && visible.length === 0)) && logoEl}
                </div>
                {logoUrl && !logoInFlow && (
                    <div className={cn('pointer-events-none absolute z-[5] flex', LOGO_CORNER[logoPos])} style={{ width: logoWidth }}>
                        {logoEl}
                    </div>
                )}
            </div>
        </div>
    );
}
