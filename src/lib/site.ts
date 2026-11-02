/**
 * Where the tenant's WEBSITE BUILDER site lives.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * This portal has no login screen of its own, and it must never send anyone to
 * one that belongs to the ADMIN panel. A visitor signs in on the tenant's
 * public website — the site the Website Builder produces — and arrives here
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
 * The website's sign-in page, carrying where the visitor was trying to reach.
 * Null when the website URL is not configured — callers must handle that
 * rather than navigating to a guess.
 *
 * `next` is an ABSOLUTE url because the website is a different origin; a path
 * would resolve against the website and land on one of its own pages. The
 * website validates it against the portal's origin before using it, so this is
 * a request, not an instruction.
 */
export function loginUrl(returnTo?: string): string | null {
    if (!WEBSITE_URL) return null;
    const url = new URL('/login', `${WEBSITE_URL}/`);
    if (returnTo) url.searchParams.set('next', returnTo);
    return url.toString();
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
