'use client';

import { useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRightToBracket, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { loginUrl, currentUrl, isSiteConfigured, SITE_URL_ENV } from '@/lib/site';
import { useClientProfile } from '@/hooks/use-client-portal';

/**
 * Nothing signed-in renders until the backend confirms a session.
 *
 * ── WHAT THIS FIXES ──────────────────────────────────────────────────────────
 * There was no gate at all. `/` redirected to `/dashboard`, the shell rendered
 * for anyone, and each panel independently discovered its own 401 and printed
 * "Sign in on the website" with no link. On the live deployment that reads as a
 * broken admin dashboard, not as a portal nobody has signed into.
 *
 * ── WHY A REDIRECT AND NOT A LOGIN FORM ──────────────────────────────────────
 * This portal deliberately has no credentials UI. The session cookie is issued
 * by the backend when the visitor signs in on the tenant's WEBSITE, so the only
 * correct move is to send them there. Building a form here would mean a second
 * place that handles passwords, and it must never point at the ADMIN panel's
 * login — that issues an admin JWT, a different identity entirely.
 *
 * ── WHY `window.location` AND NOT `router.push` ──────────────────────────────
 * The website is a different origin. Next's router cannot navigate to it, and a
 * push would silently do nothing.
 */
export function ClientAuthGate({ children }: { children: React.ReactNode }) {
    const { data: client, isLoading, isError, error } = useClientProfile();

    // 401/403 is "not signed in". Anything else — the backend being down, CORS,
    // a network drop — must NOT bounce the visitor to a login page, because
    // logging in again cannot fix it and the loop hides the real fault.
    const notSignedIn = isError && error instanceof ApiError && error.isAuthError;
    const otherFailure = isError && !notSignedIn;

    useEffect(() => {
        if (!notSignedIn) return;
        const target = loginUrl(currentUrl());
        // No configured website means there is nowhere correct to go. Falling
        // back to a guessed domain is what shipped `localhost:3005` to
        // production, so this stops and says so instead.
        if (!target) return;
        // Replace, not assign: the signed-out dashboard must not sit in history
        // for the back button to return to after signing in.
        window.location.replace(target);
    }, [notSignedIn]);

    if (isLoading) {
        return (
            <Centered>
                <FontAwesomeIcon icon={faSpinner} spin className="!size-[22px] text-primary" />
                <p className="mt-3 text-[13px] text-muted-foreground">Checking your session…</p>
            </Centered>
        );
    }

    if (notSignedIn) {
        /**
         * A deployment that never had `NEXT_PUBLIC_SITE_URL` set. Naming the
         * variable turns a mystery into a two-minute fix; sending the visitor
         * to a hardcoded domain would look like it worked and quietly be wrong
         * the day that domain changes.
         */
        if (!isSiteConfigured) {
            return (
                <Centered>
                    <FontAwesomeIcon icon={faTriangleExclamation} className="!size-[24px] text-warning" />
                    <h1 className="mt-3 text-[17px] font-bold text-foreground">You are not signed in</h1>
                    <p className="mt-1.5 text-[13px] text-muted-foreground">
                        This portal does not know which website to send you to, so it cannot open the
                        sign-in page.
                    </p>
                    <p className="mt-3 rounded-md bg-muted px-3 py-2 font-mono text-[11.5px] text-foreground">
                        {SITE_URL_ENV} is not set
                    </p>
                    <p className="mt-2 text-[11.5px] text-muted-foreground">
                        Set it to the website&rsquo;s address and redeploy — it is read at build time.
                    </p>
                </Centered>
            );
        }

        /**
         * The redirect above is already running. This is what shows during it,
         * and the fallback if the browser blocks the navigation — so it carries
         * a real button rather than an instruction nobody can act on.
         */
        return (
            <Centered>
                <h1 className="text-[17px] font-bold text-foreground">You are not signed in</h1>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                    Taking you to the website to sign in…
                </p>
                <Button
                    className="mt-5 w-full"
                    onClick={() => {
                        const target = loginUrl(currentUrl());
                        if (target) window.location.replace(target);
                    }}
                >
                    <FontAwesomeIcon icon={faArrowRightToBracket} className="!size-[13px]" />
                    Go to sign in
                </Button>
            </Centered>
        );
    }

    if (otherFailure) {
        return (
            <Centered>
                <h1 className="text-[17px] font-bold text-foreground">Cannot reach the server</h1>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                    Your session could not be checked. This is not a sign-in problem — retrying
                    usually helps.
                </p>
                <Button variant="outline" className="mt-5 w-full" onClick={() => window.location.reload()}>
                    Try again
                </Button>
            </Centered>
        );
    }

    // A 200 with no client is not a session. Treated as signed out rather than
    // rendering a shell whose every query will 401 a moment later.
    if (!client) return null;

    return <>{children}</>;
}

function Centered({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid min-h-screen place-items-center bg-background px-6">
            <div className="w-full max-w-sm text-center">{children}</div>
        </div>
    );
}
