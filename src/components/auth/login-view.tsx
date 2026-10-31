'use client';

/**
 * The /login page: a welcome panel on the left, the sign-in card on the right.
 *
 * Also the place Google sign-in COMES BACK to. The backend returns the visitor
 * here with `?auth=success|cancelled|error` (and `needs_mobile` + `link_token`
 * when the Google account has no phone number yet); this reads that, tells the
 * visitor, strips it from the address bar, and carries on to `next`.
 */

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faChartLine,
    faLock,
    faUsers,
    faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

import { useClientProfile } from '@/hooks/use-client-portal';
import { safeNextPath } from '@/lib/site';
import { LoginCard } from './login-card';

const NEXT_KEY = 'portal_login_next';

const FEATURES: { icon: IconDefinition; title: string; text: string }[] = [
    { icon: faWandMagicSparkles, title: 'Beautiful Invitations', text: 'Create stunning invitations for any event in minutes.' },
    { icon: faUsers, title: 'Manage Easily', text: 'Manage guests, RSVPs and communications all in one place.' },
    { icon: faChartLine, title: 'Track & Analyze', text: 'Get real-time insights and analytics for your events.' },
    { icon: faLock, title: 'Secure & Private', text: 'Your data is safe with us. We never share your information.' },
];

/** sessionStorage can throw (private mode, blocked storage) — never let it break sign-in. */
function remember(value: string) {
    try {
        sessionStorage.setItem(NEXT_KEY, value);
    } catch {
        /* the round trip then lands on the dashboard — acceptable */
    }
}
function recall(): string | null {
    try {
        return sessionStorage.getItem(NEXT_KEY);
    } catch {
        return null;
    }
}

export function LoginView() {
    const search = useSearchParams();

    // `next` survives a Google round trip (which returns to a bare /login) by
    // being parked in sessionStorage first.
    const next = React.useMemo(() => {
        const fromUrl = search.get('next');
        return safeNextPath(fromUrl ?? recall());
    }, [search]);

    React.useEffect(() => {
        const fromUrl = search.get('next');
        if (fromUrl) remember(safeNextPath(fromUrl));
    }, [search]);

    const [mobileToken, setMobileToken] = React.useState<string | null>(null);
    const pendingSuccess = React.useRef<string | null>(null);

    const go = React.useCallback(() => {
        window.location.assign(safeNextPath(recall() ?? next));
    }, [next]);

    // Already signed in? Don't show a login form — go where they were headed.
    const { data: client } = useClientProfile();
    React.useEffect(() => {
        if (client) go();
    }, [client, go]);

    // Google sign-in coming back.
    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const outcome = params.get('auth');
        if (!outcome) return;

        // Raised on the next tick: the Toaster in the root layout subscribes
        // in its own effect, which runs AFTER this one on first mount.
        const announce = (fn: () => void) => setTimeout(fn, 0);

        if (outcome === 'success') {
            const name = params.get('name');
            const greeting = name ? `, ${name}` : '';
            const message =
                params.get('mode') === 'signup'
                    ? `Account created${greeting}. You are signed in.`
                    : `Login successful${greeting}`;
            const token = params.get('needs_mobile') === '1' ? params.get('link_token') : null;

            if (token) {
                // The account still needs a phone number — stay on this page for that.
                pendingSuccess.current = message;
                setMobileToken(token);
            } else {
                announce(() => toast.success(message));
                window.setTimeout(go, 600);
            }
        } else if (outcome === 'cancelled') {
            announce(() => toast.message('Sign-in was cancelled.'));
        } else {
            const detail = params.get('message');
            announce(() => toast.error(detail || 'Sign-in failed. Please try again.'));
        }

        // `link_token` must not stay in the address bar: it authorises writing
        // a phone number onto the account, so a pasted URL would carry that power.
        ['auth', 'mode', 'provider', 'name', 'message', 'needs_mobile', 'link_token'].forEach((key) =>
            params.delete(key),
        );
        const query = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
        // Runs once, on arrival.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const finishMobileStep = React.useCallback(() => {
        setMobileToken(null);
        const message = pendingSuccess.current;
        pendingSuccess.current = null;
        if (message) toast.success(message);
        window.setTimeout(go, 600);
    }, [go]);

    return (
        <main className="min-h-screen bg-background">
            <div className="mx-auto grid min-h-screen w-full max-w-[1280px] lg:grid-cols-2">
                {/* Welcome panel — wide screens only */}
                <aside className="relative hidden min-w-0 flex-col justify-center gap-8 bg-gradient-to-br from-primary/15 via-primary/5 to-background p-10 lg:flex">
                    <div className="min-w-0">
                        <h1 className="break-words text-[34px] font-black leading-tight tracking-tight text-foreground">
                            Welcome Back! <span aria-hidden="true">👋</span>
                        </h1>
                        <p className="mt-3 max-w-md break-words text-[14px] leading-6 text-muted-foreground">
                            Log in to your Event Invit account and continue creating unforgettable moments.
                        </p>
                    </div>
                    <ul className="flex min-w-0 flex-col gap-4">
                        {FEATURES.map((feature) => (
                            <li key={feature.title} className="flex min-w-0 items-start gap-3">
                                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                                    <FontAwesomeIcon icon={feature.icon} className="!size-[16px] text-primary" />
                                </span>
                                <div className="min-w-0">
                                    <p className="break-words text-[13.5px] font-bold text-foreground">{feature.title}</p>
                                    <p className="break-words text-[12.5px] leading-5 text-muted-foreground">{feature.text}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </aside>

                {/* Sign-in card */}
                <section className="flex min-w-0 flex-col items-center justify-center gap-5 px-4 py-10 sm:px-6">
                    {/* Small screens have no welcome panel, so say it here. */}
                    <h1 className="text-center text-[22px] font-black tracking-tight text-foreground lg:hidden">
                        Welcome Back! <span aria-hidden="true">👋</span>
                    </h1>
                    <LoginCard next={next} mobileLinkToken={mobileToken} onMobileLinkDone={finishMobileStep} />
                </section>
            </div>
        </main>
    );
}
