import { Suspense } from 'react';
import type { Metadata } from 'next';

import { LoginView } from '@/components/auth/login-view';

export const metadata: Metadata = {
    title: 'Log in || Event Invite',
    description: 'Sign in to manage your events, guests and RSVPs.',
};

// useSearchParams needs a Suspense boundary or the route fails to prerender.
export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginView />
        </Suspense>
    );
}
