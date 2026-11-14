"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faSearch,
    faHeart as faHeartSolid,
    faEye,
    faSliders,
    faRotateRight,
    faLightbulb,
    faArrowRight,
    faLayerGroup,
    faChevronDown,
    faStar,
} from "@fortawesome/free-solid-svg-icons";
import { faHeart as faHeartOutline } from "@fortawesome/free-regular-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TemplateArtwork } from "@/components/common/template-artwork";
import { useEventAnalytics } from "@/hooks/use-client-events";
import {
    useClientProfile, useEventOptions, useSetFavouriteTemplates, type TemplateOption,
} from "@/hooks/use-client-portal";

/**
 * Templates — the invitation designs a client can build an event on.
 *
 * ── WHAT BACKS THIS ──────────────────────────────────────────────────────────
 * `event_templates` ONLY — admin-authored and plan-scoped.
 * `/client/event-options` has already narrowed the list to what THIS client's
 * plan entitles them to, so nothing shown here needs re-checking on "Use".
 *
 * ── WHY THERE IS NO HARDCODED FALLBACK ───────────────────────────────────────
 * `lib/event-themes.ts` used to fill this screen when a plan had no templates.
 * That was wrong twice over: it offered designs the plan does not grant (the
 * exact mis-sell the plan gating exists to prevent), and a full grid of
 * stand-ins made an empty catalogue look stocked, so nobody could tell a
 * misconfigured plan from a working one. An empty plan now SAYS it is empty.
 *
 * That file still exists, and must: an event saved earlier holds a legacy slug
 * in `theme_id`, and `resolveArtwork` needs the list to draw its artwork. It is
 * for rendering history, never for offering something new.
 *
 * ── FAVOURITES ───────────────────────────────────────────────────────────────
 * `website_clients.favourite_templates`, through `PUT /client/favourite-templates`,
 * keyed by the template's `code` — the same slug that ends up in `events.theme_id`.
 */

const PAGE_SIZE = 8;

type SortKey = "popular" | "newest" | "name";

const SORTS: { value: SortKey; label: string }[] = [
    { value: "popular", label: "Popular" },
    { value: "newest", label: "Newest" },
    { value: "name", label: "Name A–Z" },
];

export default function TemplatesPage() {
    const options = useEventOptions();
    const opts = options.data;
    const dbTemplates = opts?.templates ?? [];

    if (options.isLoading) return <TemplatesSkeleton />;

    // Stated plainly rather than backfilled with built-in designs — see the
    // "why there is no hardcoded fallback" note above. `reason` is the
    // backend's own words for a missing or inactive plan and outranks the
    // generic message, since it names the actual problem.
    if (dbTemplates.length === 0) {
        return (
            <div className="flex flex-col gap-5">
                <div className="min-w-0">
                    <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">Templates</h1>
                    <p className="mt-1 text-[13.5px] text-muted-foreground">
                        Choose a template and customize it to create your perfect invitation.
                    </p>
                </div>

                <Card className="border border-border shadow-none py-0">
                    <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                        <FontAwesomeIcon icon={faLayerGroup} className="!size-[26px] text-muted-foreground/40" />
                        <p className="text-[14px] font-semibold text-foreground">No templates available</p>
                        <p className="max-w-md text-[13px] text-muted-foreground">
                            {opts?.reason
                                ?? "Your subscription plan doesn’t include any invitation templates yet. Please contact us to have them added to your plan."}
                        </p>
                        <Button asChild variant="outline" size="sm" className="mt-2 h-9 text-[12.5px]">
                            <Link href="/dashboard/events/check-availability">Create an event anyway</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return <DbTemplates templates={dbTemplates} categories={opts?.categories ?? []} />;
}

function TemplatesSkeleton() {
    return (
        <div className="flex flex-col gap-5">
            <Skeleton className="h-8 w-[220px]" />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[4/5] w-full rounded-md" />
                ))}
            </div>
        </div>
    );
}

/* ── Admin-authored, plan-scoped catalogue ──────────────────────────────── */

function DbTemplates({
    templates, categories,
}: {
    templates: TemplateOption[];
    categories: { id: number; name: string }[];
}) {
    const [search, setSearch] = useState("");
    const [categoryId, setCategoryId] = useState<number | "all">("all");
    const [style, setStyle] = useState("all");
    const [sort, setSort] = useState<SortKey>("popular");
    const [favouritesOnly, setFavouritesOnly] = useState(false);
    const [featuredOnly, setFeaturedOnly] = useState(false);
    const [visible, setVisible] = useState(PAGE_SIZE);
    const [preview, setPreview] = useState<TemplateOption | null>(null);

    const profile = useClientProfile();
    const saveFavourites = useSetFavouriteTemplates();
    const favourites = useMemo(() => profile.data?.favourite_templates ?? [], [profile.data]);

    const toggleFavourite = (code: string) => {
        const next = favourites.includes(code)
            ? favourites.filter((f) => f !== code)
            : [...favourites, code];
        saveFavourites.mutate(next);
    };

    const analytics = useEventAnalytics();
    const usage = useMemo(() => {
        const map = new Map<string, number>();
        for (const row of analytics.data?.by_theme ?? []) map.set(row.theme_id, row.count);
        return map;
    }, [analytics.data]);

    // Every style at least one admin template claims — a hardcoded list would
    // offer styles nothing in this plan actually has.
    const styles = useMemo(
        () => [...new Set(templates.map((t) => t.style).filter(Boolean))].sort(),
        [templates]
    );

    /**
     * Any filter change resets the page size, or "Load More" appears to do
     * nothing when the new result set is smaller than what is already shown.
     *
     * Adjusted during render rather than in an effect: an effect would paint
     * the over-long list once and then correct it, and React flags the
     * cascading render it causes. Comparing against the previous key is the
     * documented way to reset state when inputs change.
     */
    const filterKey = [search, categoryId, style, sort, favouritesOnly, featuredOnly].join("|");
    const [lastFilterKey, setLastFilterKey] = useState(filterKey);
    if (lastFilterKey !== filterKey) {
        setLastFilterKey(filterKey);
        setVisible(PAGE_SIZE);
    }

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();

        const rows = templates.filter((t) => {
            if (term && !t.name.toLowerCase().includes(term) && !(t.style ?? "").toLowerCase().includes(term)) return false;
            // NULL on the template means "suits every category" — same rule the
            // wizard applies when narrowing by what step 1 picked.
            if (categoryId !== "all" && t.event_category_id && t.event_category_id !== categoryId) return false;
            if (style !== "all" && t.style !== style) return false;
            if (favouritesOnly && !favourites.includes(t.code)) return false;
            if (featuredOnly && !t.is_featured) return false;
            return true;
        });

        return [...rows].sort((a, b) => {
            if (sort === "name") return a.name.localeCompare(b.name);
            if (sort === "newest") return b.id - a.id; // no created_at on the row; insertion order is the best proxy
            // Popular: featured first, then whatever this client actually uses most.
            const rank = (t: TemplateOption) => (t.is_featured ? 0 : 1);
            return rank(a) - rank(b) || (usage.get(b.code) ?? 0) - (usage.get(a.code) ?? 0) || a.sort_order - b.sort_order;
        });
    }, [templates, search, categoryId, style, sort, usage, favouritesOnly, featuredOnly, favourites]);

    const shown = filtered.slice(0, visible);
    const activeFilters =
        (categoryId !== "all" ? 1 : 0) + (style !== "all" ? 1 : 0) + (favouritesOnly ? 1 : 0) + (featuredOnly ? 1 : 0);

    const resetFilters = () => {
        setCategoryId("all"); setStyle("all"); setFavouritesOnly(false); setFeaturedOnly(false);
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">Templates</h1>
                    <p className="mt-1 text-[13.5px] text-muted-foreground">
                        Choose a template and customize it to create your perfect invitation.
                    </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative min-w-0 sm:w-[210px]">
                        <FontAwesomeIcon
                            icon={faSearch}
                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 !size-[12px] text-muted-foreground"
                        />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search templates..."
                            aria-label="Search templates"
                            className="h-10 rounded-md pl-9 text-[13px]"
                        />
                    </div>

                    <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                        <SelectTrigger className="h-10 w-full rounded-md text-[13px] sm:w-[130px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {SORTS.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Tabs value={String(categoryId)} onValueChange={(v) => setCategoryId(v === "all" ? "all" : Number(v))} className="overflow-x-auto">
                <TabsList variant="line" className="h-auto flex-nowrap gap-2 p-0">
                    <TabsTrigger
                        value="all"
                        className="h-9 rounded-md border border-border px-4 text-[12.5px] data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:after:opacity-0"
                    >
                        All Templates
                    </TabsTrigger>
                    {categories.map((c) => (
                        <TabsTrigger
                            key={c.id}
                            value={String(c.id)}
                            className="h-9 rounded-md border border-border px-4 text-[12.5px] data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:after:opacity-0"
                        >
                            {c.name}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
                <div className="flex min-w-0 flex-col gap-5">
                    {shown.length === 0 ? (
                        <Card className="border border-border shadow-none py-0">
                            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                                <FontAwesomeIcon icon={faLayerGroup} className="!size-[26px] text-muted-foreground/40" />
                                <p className="text-[14px] font-semibold text-foreground">
                                    {favouritesOnly && favourites.length === 0 ? "No favourites yet" : "No templates match"}
                                </p>
                                <p className="text-[13px] text-muted-foreground">
                                    {favouritesOnly && favourites.length === 0
                                        ? "Tap the heart on a template to save it here."
                                        : "Try a different search, or reset the filters."}
                                </p>
                                <Button variant="outline" size="sm" className="mt-2 h-8 text-[12px]" onClick={resetFilters}>
                                    Reset filters
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {shown.map((template) => {
                                const used = usage.get(template.code) ?? 0;
                                const isFavourite = favourites.includes(template.code);
                                return (
                                    <Card
                                        key={template.id}
                                        className="min-w-0 gap-0 overflow-hidden border border-border p-0 shadow-none transition-shadow hover:shadow-md"
                                    >
                                        <div className="relative">
                                            {/* The real design — frame, decorations and the
                                                components the template enables — not the
                                                background colour with a name written on it.
                                                A 4:5 tile because an invitation is portrait:
                                                a square one squeezed the card so hard that
                                                InvitationCard hit its 0.45 scale floor and
                                                clipped its own content. */}
                                            {/* Inset, on a neutral ground.

                                                Edge to edge, the invitation's own
                                                frame ran into the tile's corners and
                                                the heart sat directly on the artwork —
                                                two borders and a control fighting for
                                                the same eight pixels. The card now
                                                floats on a mat, the way a framed print
                                                does, so its frame is readable and the
                                                one floating control has ground of its
                                                own to sit on. */}
                                            <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted/40">
                                                <TemplateArtwork
                                                    template={template}
                                                    className="inset-3.5"
                                                    cardClassName="rounded-[3px] shadow-sm"
                                                />
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => toggleFavourite(template.code)}
                                                aria-label={isFavourite ? `Remove ${template.name} from favourites` : `Add ${template.name} to favourites`}
                                                aria-pressed={isFavourite}
                                                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-background/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
                                            >
                                                <FontAwesomeIcon
                                                    icon={isFavourite ? faHeartSolid : faHeartOutline}
                                                    className={cn("!size-[12px]", isFavourite ? "text-destructive" : "text-muted-foreground")}
                                                />
                                            </button>
                                        </div>

                                        <div className="flex flex-col gap-3 p-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-[13px] font-bold text-foreground break-words">
                                                    {template.name}
                                                </p>
                                                {!!template.is_featured && (
                                                    <Badge variant="ghost" className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                                        <FontAwesomeIcon icon={faStar} className="mr-1 !size-[8px]" />
                                                        Featured
                                                    </Badge>
                                                )}
                                                {/* "Used N×" is metadata, not a control —
                                                    it belongs with the name rather than
                                                    stamped across the design. Floating it
                                                    over the artwork is what put a white
                                                    pill through the frame's top-left
                                                    corner. */}
                                                {used > 0 && (
                                                    <Badge variant="ghost" className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                                        Used {used}×
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Preview only. "Use" was removed from the card:
                                                the Preview dialog carries "Use this template",
                                                so the action still exists — one click later,
                                                after the design has actually been looked at. */}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setPreview(template)}
                                                className="h-8 w-full rounded-md text-[12px] font-medium"
                                            >
                                                <FontAwesomeIcon icon={faEye} className="mr-1.5 !size-[11px]" />
                                                Preview
                                            </Button>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}

                    {visible < filtered.length && (
                        <div className="flex justify-center">
                            <Button
                                variant="outline"
                                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                                className="h-10 rounded-md px-6 text-[13px] font-medium"
                            >
                                Load More Templates
                                <FontAwesomeIcon icon={faChevronDown} className="ml-2 !size-[11px]" />
                            </Button>
                        </div>
                    )}

                    {filtered.length > 0 && (
                        <p className="text-center text-[12px] text-muted-foreground">
                            Showing {shown.length} of {filtered.length} templates
                        </p>
                    )}
                </div>

                <div className="flex min-w-0 flex-col gap-5">
                    <Card className="border border-border shadow-none py-0">
                        <CardContent className="p-4">
                            <div className="mb-4 flex items-center justify-between gap-2">
                                <p className="text-[13px] font-bold text-foreground">Filter Templates</p>
                                <FontAwesomeIcon icon={faSliders} className="!size-[12px] text-muted-foreground" />
                            </div>

                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                    <Label className="text-[12px] font-medium">Event Type</Label>
                                    <Select value={String(categoryId)} onValueChange={(v) => setCategoryId(v === "all" ? "all" : Number(v))}>
                                        <SelectTrigger className="h-9 rounded-md text-[12.5px]">
                                            <SelectValue placeholder="All Event Types" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Event Types</SelectItem>
                                            {categories.map((c) => (
                                                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {styles.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                        <Label className="text-[12px] font-medium">Style</Label>
                                        <Select value={style} onValueChange={setStyle}>
                                            <SelectTrigger className="h-9 rounded-md text-[12.5px]">
                                                <SelectValue placeholder="All Styles" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Styles</SelectItem>
                                                {styles.map((v) => (
                                                    <SelectItem key={v} value={v}>{v}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="flex items-center justify-between gap-3">
                                    <Label className="text-[12px] font-medium">Featured Only</Label>
                                    <Switch checked={featuredOnly} onCheckedChange={setFeaturedOnly} aria-label="Show featured templates only" />
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <Label className="text-[12px] font-medium">Favourites Only</Label>
                                        <p className="text-[10.5px] text-muted-foreground">
                                            {favourites.length} saved
                                        </p>
                                    </div>
                                    <Switch
                                        checked={favouritesOnly}
                                        onCheckedChange={setFavouritesOnly}
                                        disabled={favourites.length === 0}
                                        aria-label="Show favourites only"
                                    />
                                </div>

                                <Separator />

                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={activeFilters === 0 && !search}
                                    onClick={() => { resetFilters(); setSearch(""); }}
                                    className="h-9 rounded-md border-primary/40 text-[12.5px] font-semibold text-primary hover:bg-primary/5 hover:text-primary"
                                >
                                    <FontAwesomeIcon icon={faRotateRight} className="mr-2 !size-[11px]" />
                                    Reset Filters
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-primary/20 bg-primary/5 shadow-none py-0">
                        <CardContent className="p-4">
                            <div className="mb-2 flex items-center gap-2">
                                <FontAwesomeIcon icon={faLightbulb} className="!size-[12px] text-primary" />
                                <p className="text-[12.5px] font-bold text-primary">Pro Tip</p>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                                Templates set your invitation&rsquo;s look. You can change the primary colour
                                after selecting one, and switch template at any time by editing the event.
                            </p>
                            <Link
                                href="/dashboard/events/check-availability"
                                className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline"
                            >
                                Start an event
                                <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                            </Link>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={!!preview} onOpenChange={(v) => { if (!v) setPreview(null); }}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>{preview?.name}</DialogTitle>
                        <DialogDescription>{preview?.style}</DialogDescription>
                    </DialogHeader>

                    {preview && (
                        <div className="flex flex-col gap-4">
                            {/* Natural size here: the dialog has room for the card
                                as it was authored, so nothing is scaled down and
                                every line reads at its designed size. */}
                            <div className="max-h-[62vh] overflow-y-auto py-1">
                                <TemplateArtwork template={preview} fit="natural" />
                            </div>
                            <Button asChild className="h-10 w-full rounded-md text-[13px] font-semibold">
                                <Link href={`/dashboard/events/create?theme=${preview.code}`}>
                                    Use this template
                                </Link>
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

