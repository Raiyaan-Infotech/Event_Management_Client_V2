'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';

/**
 * Wraps the app in a TanStack Query client, matching the other three frontends
 * in this stack so the data-fetching pattern transfers between them.
 *
 * The client is created inside useState rather than at module scope: at module
 * scope a single client would be shared across every request on the server,
 * leaking one user's cached data into another's render.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Long enough that moving between pages does not refetch
                        // everything, short enough that data is not visibly stale.
                        staleTime: 60 * 1000,
                        refetchOnWindowFocus: false,
                        retry: (failureCount, error) => {
                            // Retrying a 401/403/404 just repeats the same answer
                            // three times and delays the error the user needs to see.
                            // Status 0 = the request never got an answer (dropped connection,
                            // ECONNRESET on Render) — that one IS worth retrying.
                            if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
                            return failureCount < 2;
                        },
                    },
                },
            })
    );

    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
