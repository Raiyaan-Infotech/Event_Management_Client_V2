'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRightToBracket } from '@fortawesome/free-solid-svg-icons';

import { Button } from '@/components/ui/button';
import { loginUrl, currentUrl } from '@/lib/site';

/** A "Sign in" button for panels that need a session. Opens this portal's /login. */
export function SignInPrompt({ className }: { className?: string }) {
    return (
        <Button
            size="sm"
            className={className}
            onClick={() => window.location.assign(loginUrl(currentUrl()))}
        >
            <FontAwesomeIcon icon={faArrowRightToBracket} className="!size-[12px]" />
            Sign in
        </Button>
    );
}
