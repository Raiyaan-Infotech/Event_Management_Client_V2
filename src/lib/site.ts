/**
 * Sign-in addresses, plus where the tenant's WEBSITE lives (optional).
 *
 * ── V2 CHANGE (2026-10-31) ───────────────────────────────────────────────────
 * V2 has no public website or Website Builder, so this portal now has its OWN
 * `/login` page ([loginUrl] below). `NEXT_PUBLIC_SITE_URL` is therefore OPTIONAL:
 * it only feeds the footer links and the "create a new account" link, and is
 * hidden when unset. The notes below describe V1, where sign-in lived on the
 * website — kept because they explain the redirect-loop traps.
 *
 * ── WHY THIS FILE EXISTS (V1) ────────────────────────────────────────────────
 * This portal had no login screen of its own, and it must never send anyone to
 * one that belongs to the ADMIN panel. A visitor signed in on the tenant's
 * public website — the site the Website Builder produces — and arrived here
 * with the backend's session cookie already set.
 *
 * Before this, an unauthenticated visitor landed on `/dashboard`, got the full
 * signed-in shell, and every panel showed "Sign in on the website" with no link
 * and nowhere to go.
 *
 * ── NEXT_PUBLIC_SITE_URL IS THE WEBSITE, NOT THIS APP ────────────────────────
 * The name reads like "this app's own origin", and it is not — `useLogout` has
 * always used it as the place to RETURN to, which only makes sense if it is the
 * website. Pointing it at this portal produces a logout that bounces straight
 * back in, and a login redirect that loops forever.
 *
 * ── THERE IS NO HARDCODED FALLBACK, DELIBERATELY ─────────────────────────────
 * An earlier version of this file defaulted to the current Vercel URL. That is
 * the same mistake that put `http://localhost:3005/dashboard` into the live
 * website's login button: a literal that is right on the day it is written,
 * inlined into a production bundle, and wrong the moment a domain changes —
 * silently, because a wrong redirect still looks like a working redirect.
 *
 * So when the variable is missing, this returns null and the callers SAY SO.
 * A visitor seeing "the site address is not configured" gets someone to fix it
 * in minutes. A visitor being sent to a stale domain reports nothing at all.
 */

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

/**
 * Trusted only if it is a real absolute http(s) URL.
 *
 * A half-set variable (`NEXT_PUBLIC_SITE_URL=` or a bare host with no scheme)
 * would otherwise be used verbatim and produce a relative redirect back into
 * this portal — the loop described above.
 */
function resolveWebsiteUrl(): string | null {
    const raw = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) return null;
    return stripTrailingSlash(raw);
}

/** The website's origin, or null when NEXT_PUBLIC_SITE_URL is unset/malformed. */
export const WEBSITE_URL = resolveWebsiteUrl();

/** True when the portal knows where its website is. */
export const isSiteConfigured = WEBSITE_URL !== null;

/** The name of the variable to set, so an error message can name it exactly. */
export const SITE_URL_ENV = 'NEXT_PUBLIC_SITE_URL';

/**
 * A path on THIS portal that is safe to open after signing in.
 *
 * ── VALIDATED, BECAUSE `next` COMES FROM THE ADDRESS BAR ─────────────────────
 * Anyone can put anything in `?next=`. Following it blindly would make the
 * login page a redirector to any site on the internet, firing right after a
 * successful sign-in — when nobody is checking the address. Only a path on this
 * portal's own origin is accepted; everything else becomes the dashboard.
 * `/login` itself is refused too, or signing in would loop back to the form.
 */
export function safeNextPath(raw: string | null | undefined): string {
    const fallback = '/dashboard';
    if (!raw) return fallback;
    try {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const url = new URL(raw, origin);
        if (url.origin !== origin) return fallback;
        const path = `${url.pathname}${url.search}${url.hash}`;
        if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/login')) return fallback;
        return path;
    } catch {
        return fallback;
    }
}

/**
 * This portal's own sign-in page, carrying where the visitor was trying to go.
 *
 * V2 has no public website, so sign-in lives here at `/login`. `returnTo` may be
 * a full URL (see [currentUrl]) or a path; it is reduced to a safe same-origin
 * path, so the result is always a relative `/login?next=...` link.
 */
export function loginUrl(returnTo?: string): string {
    const path = returnTo ? safeNextPath(returnTo) : null;
    return path && path !== '/dashboard' ? `/login?next=${encodeURIComponent(path)}` : '/login';
}

export function signupUrl(returnTo?: string): string | null {
    if (!WEBSITE_URL) return null;
    const url = new URL('/signup', `${WEBSITE_URL}/`);
    if (returnTo) url.searchParams.set('next', returnTo);
    return url.toString();
}

/**
 * The current page as an absolute URL, for the `next` parameter.
 *
 * Undefined on the server, where there is no location to read — callers pass it
 * straight through, so a server render omits `next` rather than guessing an
 * origin that may not match the deployment.
 */
export function currentUrl(): string | undefined {
    if (typeof window === 'undefined') return undefined;
    return window.location.href;
}
