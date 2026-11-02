'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRightToBracket } from '@fortawesome/free-solid-svg-icons';

import { Button } from '@/components/ui/button';
import { loginUrl, currentUrl, isSiteConfigured, SITE_URL_ENV } from '@/lib/site';

/**
 * The button that was missing.
 *
 * Every panel used to say "Sign in on the website, then reopen this page." and
 * stop there — no link, no site named. The visitor was told to go somewhere
 * without being told where, on a portal that has no login screen of its own.
 *
 * `ClientAuthGate` catches the common case at mount. This is for the session
 * that dies WHILE the portal is open: the gate has already passed, so nothing
 * re-checks, and the panels are the only thing that notices.
 *
 * Deliberately not an automatic redirect from the API layer. A 401 can land
 * mid-form — half-filled guest details, a CSV part-way through review — and
 * yanking the page away loses that with no warning. The session is dead either
 * way; letting the visitor press the button keeps it their choice.
 */
export function SignInPrompt({ className }: { className?: string }) {
    // Nowhere to send them, so no button. A dead control is worse than none —
    // it reads as the app being broken rather than as a setting being missing.
    if (!isSiteConfigured) {
        return (
            <p className={`text-[11.5px] text-muted-foreground ${className ?? ''}`}>
                Sign-in is unavailable: <span className="font-mono">{SITE_URL_ENV}</span> is not set
                on this deployment.
            </p>
        );
    }

    return (
        <Button
            size="sm"
            className={className}
            onClick={() => {
                const target = loginUrl(currentUrl());
                if (target) window.location.assign(target);
            }}
        >
            <FontAwesomeIcon icon={faArrowRightToBracket} className="!size-[12px]" />
            Sign in on the website
        </Button>
    );
}
