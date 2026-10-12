'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    Sparkles, Plus, Search, Pencil, Trash2, MoreVertical, Eye,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
    useSplashScreens, useDeleteSplashScreen, type SplashScreen,
} from '@/hooks/use-splash-screens';
import { useClientEvent } from '@/hooks/use-client-events';
import { useDateFormatter } from '@/hooks/use-client-settings';
import { SplashPreviewFrame } from './_components/splash-preview';

/**
 * Splash Screens.
 *
 * The splash is the event's own invitation, drawn with the splash's Primary and
 * Secondary colour and its own section switches (rebuilt to match the mobile
 * app, session 57 §756). One splash per event; `status` decides whether guests
 * actually see it. The old background / sound / animation / button design is
 * gone — those columns were dropped.
 */

const PAGE_SIZE = 12;

export default function SplashScreensPage() {
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [page, setPage] = useState(1);
    const [pendingDelete, setPendingDelete] = useState<SplashScreen | null>(null);
    const [viewing, setViewing] = useState<SplashScreen | null>(null);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(search.trim()), 350);
        return () => clearTimeout(t);
    }, [search]);

    // Adjusted during render, not in a second effect — a new search term is
    // "derived state" React's own docs point at handling this way, and it
    // avoids the extra render pass a setState-in-effect would cost here.
    const [seenSearch, setSeenSearch] = useState(debounced);
    if (debounced !== seenSearch) {
        setSeenSearch(debounced);
        setPage(1);
    }

    const list = useSplashScreens({ search: debounced || undefined, page, limit: PAGE_SIZE });
    const remove = useDeleteSplashScreen();

    const rows = list.data?.data ?? [];
    const pagination = list.data?.pagination;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight">Splash Screens</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Design the splash screen guests see when they open an event in the app.
                    </p>
                </div>
                <Button asChild>
                    <Link href="/dashboard/splash-screens/create">
                        <Plus className="size-4" /> New Splash Screen
                    </Link>
                </Button>
            </div>

            <div className="relative max-w-sm">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, title or event..."
                    className="pl-9"
                />
            </div>

            {list.isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
                </div>
            ) : rows.length === 0 ? (
                <Card className="py-0">
                    <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
                        <span className="grid size-14 place-items-center rounded-full bg-primary/10">
                            <Sparkles className="size-6 text-primary" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold">No splash screens yet</p>
                            <p className="mt-1 text-[13px] text-muted-foreground">
                                Create your first splash screen to welcome guests into an event.
                            </p>
                        </div>
                        <Button asChild className="mt-2">
                            <Link href="/dashboard/splash-screens/create">
                                <Plus className="size-4" /> New Splash Screen
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((splash) => (
                        <SplashCard
                            key={splash.id}
                            splash={splash}
                            onView={() => setViewing(splash)}
                            onDelete={() => setPendingDelete(splash)}
                        />
                    ))}
                </div>
            )}

            {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <Button
                        variant="outline" size="sm" disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                    >
                        Previous
                    </Button>
                    <span className="text-[12.5px] text-muted-foreground">
                        Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                        variant="outline" size="sm" disabled={page >= pagination.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next
                    </Button>
                </div>
            )}

            <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this splash screen?</DialogTitle>
                        <DialogDescription>
                            &quot;{pendingDelete?.name}&quot; will be permanently deleted. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            disabled={remove.isPending}
                            onClick={() => {
                                if (!pendingDelete) return;
                                remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
                            }}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{viewing?.name}</DialogTitle>
                        <DialogDescription>
                            {viewing?.event_name} · {viewing?.status === 'active' ? 'Active' : 'Draft'}
                        </DialogDescription>
                    </DialogHeader>
                    {viewing && <ViewPreview splash={viewing} />}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
                        {viewing && (
                            <Button asChild>
                                <Link href={`/dashboard/splash-screens/${viewing.id}`}>
                                    <Pencil className="size-3.5" /> Edit
                                </Link>
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** The View dialog: the real invitation, drawn with the splash's own look. */
function ViewPreview({ splash }: { splash: SplashScreen }) {
    const event = useClientEvent(splash.event_id);
    return (
        <SplashPreviewFrame
            event={event.data}
            look={{
                themeId: splash.theme_id,
                primary: splash.primary_color,
                secondary: splash.secondary_color,
                components: splash.components,
                order: splash.component_order,
            }}
            className="aspect-[9/19] max-w-[240px]"
        />
    );
}

function SplashCard({
    splash, onView, onDelete,
}: { splash: SplashScreen; onView: () => void; onDelete: () => void }) {
    const fmt = useDateFormatter();
    const primary = splash.primary_color || '#8B1E3F';
    const secondary = splash.secondary_color || '#D97706';
    const shown = splash.components
        ? Object.entries(splash.components).filter(([k, v]) => (v === true || v === 1) && !['event_qr_code', 'organizer', 'contact_details'].includes(k)).length
        : null;

    return (
        <Card className="overflow-hidden py-0">
            <button
                type="button"
                onClick={onView}
                aria-label={`View ${splash.name}`}
                className="group relative flex h-32 w-full items-center justify-center text-white"
                style={{ backgroundImage: `linear-gradient(135deg, ${primary}, ${secondary})` }}
            >
                <Sparkles className="relative size-8 opacity-90 transition-opacity group-hover:opacity-0" />
                {/* Revealed on hover — the whole swatch is already the click target. */}
                <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Eye className="size-6" />
                </span>
                <Badge variant="secondary" className="absolute top-2.5 right-2.5">
                    {splash.status === 'active' ? 'Active' : 'Draft'}
                </Badge>
            </button>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{splash.name}</p>
                        <p className="truncate text-[12px] text-muted-foreground">{splash.event_name}</p>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label="More actions">
                                <MoreVertical className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onView}>
                                <Eye className="size-3.5" /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href={`/dashboard/splash-screens/${splash.id}`}>
                                    <Pencil className="size-3.5" /> Edit
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={onDelete}>
                                <Trash2 className="size-3.5" /> Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="size-4 rounded-full border" style={{ backgroundColor: primary }} title="Primary colour" />
                    <span className="size-4 rounded-full border" style={{ backgroundColor: secondary }} title="Secondary colour" />
                    {shown !== null && (
                        <Badge variant="outline" className="text-[10.5px]">{shown} section{shown === 1 ? '' : 's'} shown</Badge>
                    )}
                </div>

                <p className="mt-3 text-[11px] text-muted-foreground">
                    Updated {fmt(splash.updated_at, true)}
                </p>
            </CardContent>
        </Card>
    );
}
