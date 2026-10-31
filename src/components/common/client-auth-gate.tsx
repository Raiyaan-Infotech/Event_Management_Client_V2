'use client';

import { useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRightToBracket, faSpinner } from '@fortawesome/free-solid-svg-icons';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { loginUrl, currentUrl } from '@/lib/site';
import { useClientProfile } from '@/hooks/use-client-portal';

/**
 * Nothing signed-in renders until the backend confirms a session.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────
 * Without a gate the shell rendered for anyone and every panel discovered its
 * own 401 separately. A signed-out visitor now gets one clear move: the
 * portal's own `/login` page, carrying the page they were trying to reach.
 *
 * (V1 sent them to the public website's login. V2 has no public website, so
 * `/login` is part of this portal — see `components/auth/login-view.tsx`.)
 *
 * ── WHY `window.location` AND NOT `router.push` ──────────────────────────────
 * `replace` keeps the signed-out dashboard out of history, so the back button
 * after signing in does not return to it; a full navigation also starts the
 * signed-in session with a clean cache.
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
        window.location.replace(loginUrl(currentUrl()));
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
        return (
            <Centered>
                <h1 className="text-[17px] font-bold text-foreground">You are not signed in</h1>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                    Taking you to the sign-in page…
                </p>
                <Button
                    className="mt-5 w-full"
                    onClick={() => window.location.replace(loginUrl(currentUrl()))}
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
