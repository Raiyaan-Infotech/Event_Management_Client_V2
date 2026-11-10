"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ArrowDown, ArrowUp, Check, CircleCheck, ExternalLink, Eye, EyeOff, Info, LayoutGrid, List, Loader2, MapPin, MapPinned, Pencil, Plus,
    Search, Star, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    ActionSheet, DeleteSheet, DetailRow, DetailSection, FormField, ModuleHeader, Notice, OverviewCard, RowActions, SearchBox,
    StatTile, StatusPill,
} from "@/components/module-kit";
import { DynamicIcon } from "@/components/common/dynamic-icon";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/media-url";
import type { ClientEvent } from "@/hooks/use-client-events";
import {
    useAddNearbyPlaces, useDeleteNearbyPlace, useNearbyPlaces, useNearbySuggestions, useReorderNearbyPlaces, useUpdateNearbyPlace,
    type NearbyCategory, type NearbyPlace, type NearbySuggestion, type NearbyVenue,
} from "@/hooks/use-event-engagement";
import { Empty, PanelLoading, Section } from "./module-ui";

/**
 * Near By — Jamal's web design (2026-11-10): the places the organizer chooses for guests (hotel,
 * restaurant, hospital, parking…). Tiles (Total / Visible / Hidden), search + category + status, list or
 * grid, row menu (View Details, Move Up / Down, Delete Place). "Add Nearby Place" searches Google Maps
 * suggestions around the venue pin — by category tiles or typed text — and saves the chosen ones.
 * Categories come from the backend (nearby_categories); Google is called by the backend only.
 */

type View = "list" | "grid";
type StatusFilter = "all" | "visible" | "hidden";

const SOURCE_LABEL = { pin: "Venue map pin", map_link: "Venue map link", address: "Venue address (found on Google Maps)" } as const;

/** "Near: Aysha Mahal" — the event location Near By searches from, and where it came from. */
function VenueLocation({ venue }: { venue: NearbyVenue }) {
    const label = venue.name || venue.address || "Event venue";
    return (
        <span
            title={venue.source ? `Location from: ${SOURCE_LABEL[venue.source]}` : undefined}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-medium text-primary"
        >
            <MapPin className="size-3.5 shrink-0" /> <span className="truncate">Near {label}</span>
        </span>
    );
}

const SORT_LABEL: Record<string, string> = { distance: "Distance", rating: "Rating", name: "Name" };

export const distanceText = (km: number | null) => {
    if (km === null || km === undefined) return "—";
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
};

function CategoryChip({ category, fallback }: { category: NearbyCategory | undefined; fallback: string }) {
    const color = category?.color ?? "#6B7280";
    return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-medium" style={{ color, backgroundColor: `${color}18` }}>
            {category && <DynamicIcon name={category.icon} color={color} className="size-3.5" />}
            {category?.name ?? fallback}
        </span>
    );
}

/** The place's photo, or its category icon when it has none. */
function PlaceThumb({ photo, category, size = 44 }: { photo: string | null; category: NearbyCategory | undefined; size?: number }) {
    const box = { width: size, height: size };
    if (photo) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={photo.startsWith("http") ? photo : mediaUrl(photo)} alt="" className="shrink-0 rounded-md object-cover" style={box} />;
    }
    const color = category?.color ?? "#6B7280";
    return (
        <span className="grid shrink-0 place-items-center rounded-md" style={{ ...box, backgroundColor: `${color}14` }}>
            <DynamicIcon name={category?.icon ?? "mdi:map-marker"} color={color} className="size-[50%]" />
        </span>
    );
}

export function NearbyPanel({ event }: { event: ClientEvent }) {
    const query = useNearbyPlaces(event.id);
    const update = useUpdateNearbyPlace(event.id);
    const remove = useDeleteNearbyPlace(event.id);
    const reorder = useReorderNearbyPlaces(event.id);
    const [adding, setAdding] = useState(false);
    const [viewing, setViewing] = useState<NearbyPlace | null>(null);
    const [editing, setEditing] = useState<NearbyPlace | null>(null);
    const [deleting, setDeleting] = useState<NearbyPlace | null>(null);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [view, setView] = useState<View>("list");

    const rows = query.data?.places;
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (rows ?? []).filter((p) => (category === "all" || p.category_key === category)
            && (status === "all" || (status === "visible") === p.show_in_app)
            && (!q || `${p.name} ${p.description ?? ""} ${p.address ?? ""}`.toLowerCase().includes(q)));
    }, [rows, search, category, status]);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Near By"><Empty title="Could not load the nearby places">Please try again in a moment.</Empty></Section>;
    }
    const page = query.data;
    const all = page.places;
    const cats = page.categories;
    const catOf = (key: string) => cats.find((c) => c.key === key);
    const counts = page.counts ?? { total: all.length, visible: all.filter((p) => p.show_in_app).length, hidden: all.filter((p) => !p.show_in_app).length };

    const move = (p: NearbyPlace, dir: -1 | 1) => {
        const ids = all.map((x) => x.id);
        const i = ids.indexOf(p.id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        reorder.mutate(ids);
    };
    const actions = (p: NearbyPlace) => {
        const i = all.findIndex((x) => x.id === p.id);
        return [
            { label: "View Details", icon: Eye, onClick: () => setViewing(p) },
            { label: "Edit Place", icon: Pencil, onClick: () => setEditing(p), hidden: !page.can_edit },
            {
                label: p.show_in_app ? "Hide from App" : "Show in App", icon: p.show_in_app ? EyeOff : Eye, hidden: !page.can_edit,
                onClick: () => update.mutate({ id: p.id, data: { show_in_app: !p.show_in_app } }),
            },
            { label: "Move Up", icon: ArrowUp, onClick: () => move(p, -1), hidden: !page.can_edit || i <= 0 },
            { label: "Move Down", icon: ArrowDown, onClick: () => move(p, 1), hidden: !page.can_edit || i >= all.length - 1 },
            { label: "Delete Place", icon: Trash2, onClick: () => setDeleting(p), danger: true, divider: true, hidden: !page.can_edit },
        ];
    };
    const pill = (p: NearbyPlace) => (p.show_in_app
        ? <StatusPill tone="success" icon={Eye}>Visible</StatusPill>
        : <StatusPill tone="muted" icon={EyeOff}>Hidden</StatusPill>);

    return (
        <div className="flex flex-col gap-4">
            <ModuleHeader
                title="Near By"
                subtitle="Add and manage nearby places like hotels, restaurants, hospitals, parking and more."
                actions={page.can_edit && <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-3.5" /> Add Nearby Place</Button>}
            />

            <OverviewCard>
                <StatTile icon={MapPin} value={counts.total} label="Total Places" tone="primary" active={status === "all"} onClick={() => setStatus("all")} />
                <StatTile icon={Eye} value={counts.visible} label="Visible Places" tone="success" active={status === "visible"} onClick={() => setStatus("visible")} />
                <StatTile icon={EyeOff} value={counts.hidden} label={counts.hidden === 1 ? "Hidden Place" : "Hidden Places"} tone="warning" active={status === "hidden"} onClick={() => setStatus("hidden")} />
            </OverviewCard>

            {/* The event location is not written on the page (Jamal, 2026-11-11) — only a warning when it cannot be found. */}
            {!page.venue.has_location && (
                <Notice tone="warning" title="Event location not found">Set the venue pin on the map (Venue) so Google Maps can suggest places near it.</Notice>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <SearchBox value={search} onChange={setSearch} placeholder="Search nearby place..." />
                <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="!h-8 w-[160px] text-[12.5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {cats.map((c) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                    <SelectTrigger className="!h-8 w-[140px] text-[12.5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="visible">Visible</SelectItem>
                        <SelectItem value="hidden">Hidden</SelectItem>
                    </SelectContent>
                </Select>
                <div className="flex overflow-hidden rounded-md border border-border">
                    {([["list", List], ["grid", LayoutGrid]] as const).map(([v, Icon]) => (
                        <button
                            key={v} type="button" aria-label={v === "list" ? "List view" : "Grid view"} onClick={() => setView(v)}
                            className={cn("grid h-8 w-9 place-items-center", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                        >
                            <Icon className="size-4" />
                        </button>
                    ))}
                </div>
            </div>

            {all.length === 0 ? (
                <Empty title="No nearby places yet">Add hotels, restaurants, hospitals, parking and more from Google Maps suggestions.</Empty>
            ) : shown.length === 0 ? (
                <Empty title="No places match">Try another search, category or status.</Empty>
            ) : view === "list" ? (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full min-w-[680px] text-[12.5px]">
                        <thead className="bg-muted/50 text-left text-[12px] font-semibold">
                            <tr>
                                <th className="w-10 px-3 py-2.5">#</th>
                                <th className="px-3 py-2.5">Nearby Place</th>
                                <th className="px-3 py-2.5">Category</th>
                                <th className="px-3 py-2.5">Distance</th>
                                <th className="px-3 py-2.5">Status</th>
                                <th className="w-16 px-3 py-2.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {shown.map((p) => (
                                <tr key={p.id} className="hover:bg-muted/30">
                                    <td className="px-3 py-2.5 font-medium">{all.indexOf(p) + 1}</td>
                                    <td className="px-3 py-2.5">
                                        <button type="button" onClick={() => setViewing(p)} className="flex min-w-0 items-center gap-2.5 text-left">
                                            <PlaceThumb photo={p.photo_url} category={catOf(p.category_key)} />
                                            <span className="min-w-0">
                                                <span className="block truncate font-semibold">{p.name}</span>
                                                <span className="block max-w-[260px] truncate text-[11.5px] text-muted-foreground">{p.description || p.address}</span>
                                            </span>
                                        </button>
                                    </td>
                                    <td className="px-3 py-2.5"><CategoryChip category={catOf(p.category_key)} fallback={p.category_key} /></td>
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                        <span className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-primary" /> {distanceText(p.distance_km)}</span>
                                    </td>
                                    <td className="px-3 py-2.5">{pill(p)}</td>
                                    <td className="px-3 py-2.5 text-right"><RowActions compact items={actions(p)} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
                    {shown.map((p) => (
                        <div key={p.id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
                            <div className="flex items-start gap-2.5">
                                <PlaceThumb photo={p.photo_url} category={catOf(p.category_key)} size={48} />
                                <button type="button" onClick={() => setViewing(p)} className="min-w-0 flex-1 text-left">
                                    <p className="truncate text-[13px] font-semibold">{p.name}</p>
                                    <p className="truncate text-[11.5px] text-muted-foreground">{p.description || p.address}</p>
                                </button>
                                <RowActions compact items={actions(p)} />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <CategoryChip category={catOf(p.category_key)} fallback={p.category_key} />
                                {pill(p)}
                            </div>
                            <p className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1"><MapPin className="size-3 text-primary" /> {distanceText(p.distance_km)}</span>
                                {p.rating !== null && <span className="inline-flex items-center gap-1"><Star className="size-3 fill-amber-400 text-amber-400" /> {p.rating}</span>}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {adding && (
                <AddNearbySheet
                    eventId={event.id}
                    categories={cats}
                    radii={page.options?.radii_km ?? [1, 2, 3, 5, 10]}
                    defaultRadius={page.options?.default_radius_km ?? 2}
                    venue={page.venue}
                    onClose={() => setAdding(false)}
                />
            )}

            {viewing && (
                <PlaceDetails
                    place={all.find((p) => p.id === viewing.id) ?? viewing}
                    category={catOf(viewing.category_key)}
                    canEdit={page.can_edit}
                    onClose={() => setViewing(null)}
                    onEdit={() => { const p = viewing; setViewing(null); setEditing(p); }}
                    onDelete={() => { const p = viewing; setViewing(null); setDeleting(p); }}
                />
            )}

            {editing && (
                <EditPlaceSheet key={editing.id} eventId={event.id} place={editing} categories={cats} onClose={() => setEditing(null)} />
            )}

            <DeleteSheet
                open={!!deleting}
                onClose={() => setDeleting(null)}
                title="Delete Place"
                subtitle="The place is removed from Near By."
                summary={deleting && (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                        <PlaceThumb photo={deleting.photo_url} category={catOf(deleting.category_key)} size={40} />
                        <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold">{deleting.name}</p>
                            <p className="truncate text-[11.5px] text-muted-foreground">{deleting.address}</p>
                        </div>
                    </div>
                )}
                question="Delete this nearby place?"
                effects={[{ label: "Participants", value: "No longer see this place" }]}
                confirmLabel="Delete Place"
                busy={remove.isPending}
                onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
            />
        </div>
    );
}

/** Add Nearby Place — Google Maps suggestions around the venue; pick several, save once. */
function AddNearbySheet({
    eventId, categories, radii, defaultRadius, venue, onClose,
}: {
    eventId: number; categories: NearbyCategory[]; radii: number[]; defaultRadius: number; venue: NearbyVenue; onClose: () => void;
}) {
    const venueReady = venue.has_location;
    const add = useAddNearbyPlaces(eventId);
    const searchable = categories.filter((c) => c.searchable);
    const [text, setText] = useState("");
    const [q, setQ] = useState("");
    const [picked, setPicked] = useState<string[]>(() => searchable.slice(0, 2).map((c) => c.key));
    const [radius, setRadius] = useState(defaultRadius);
    const [sort, setSort] = useState("distance");
    const [selected, setSelected] = useState<NearbySuggestion[]>([]);

    // The typed search runs a moment after typing stops — not on every key.
    useEffect(() => {
        const t = setTimeout(() => setQ(text.trim()), 450);
        return () => clearTimeout(t);
    }, [text]);

    const found = useNearbySuggestions(eventId, { q, categories: picked, radius_km: radius, sort }, venueReady);
    const list = found.data?.suggestions ?? [];
    const catOf = (key: string) => categories.find((c) => c.key === key);
    const isSelected = (s: NearbySuggestion) => selected.some((x) => x.google_place_id === s.google_place_id);
    const toggle = (s: NearbySuggestion) => setSelected((cur) => (cur.some((x) => x.google_place_id === s.google_place_id)
        ? cur.filter((x) => x.google_place_id !== s.google_place_id)
        : [...cur, s]));
    const togglePick = (key: string) => setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

    return (
        <ActionSheet
            open onClose={onClose} icon={MapPinned} width={560}
            title="Add Nearby Place"
            subtitle="Search and add places from Google Maps suggestions."
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={!selected.length || add.isPending} onClick={() => add.mutate(selected, { onSuccess: onClose })}>
                        {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        Save Nearby Places{selected.length ? ` (${selected.length})` : ""}
                    </Button>
                </>
            )}
        >
            <div className="flex flex-col gap-4">
                {!venueReady && (
                    <Notice tone="warning" title="Event location not found">Set the venue pin on the map first (Venue), then come back to add nearby places.</Notice>
                )}

                <FormField label="Search Nearby Places">
                    <div className="relative">
                        <DynamicIcon name="logos:google-icon" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search hotel, restaurant, hospital, ATM..." className="h-9 pr-9 pl-9" disabled={!venueReady} />
                        {text
                            ? <button type="button" aria-label="Clear" onClick={() => setText("")} className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button>
                            : <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />}
                    </div>
                </FormField>

                <FormField label="Select Category (Google Maps)" note={q ? <span className="text-[11px] text-muted-foreground">Typed search is used while the box has text.</span> : undefined}>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {searchable.map((c) => {
                            const on = picked.includes(c.key);
                            return (
                                <button
                                    key={c.key} type="button" onClick={() => togglePick(c.key)} disabled={!venueReady}
                                    className={cn(
                                        "relative flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11.5px] font-medium transition-colors disabled:opacity-50",
                                        on ? "border-primary/40 bg-primary/10" : "border-border hover:bg-muted",
                                    )}
                                >
                                    {on && <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-2.5" /></span>}
                                    <DynamicIcon name={c.icon} color={c.color} className="size-5" />
                                    <span className="truncate">{c.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </FormField>

                <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
                    <VenueLocation venue={venue} />
                    <span className="flex items-center gap-2">
                        Radius
                        <Select value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
                            <SelectTrigger className="!h-8 w-[90px] text-[12.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{radii.map((r) => <SelectItem key={r} value={String(r)}>{r} km</SelectItem>)}</SelectContent>
                        </Select>
                    </span>
                    <span className="flex items-center gap-2">
                        Sort By
                        <Select value={sort} onValueChange={setSort}>
                            <SelectTrigger className="!h-8 w-[110px] text-[12.5px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{Object.entries(SORT_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                        </Select>
                    </span>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                            <DynamicIcon name="logos:google-icon" className="size-4" /> Google Maps Suggestions
                        </p>
                        {found.data && <span className="text-[11.5px] text-muted-foreground">{list.length} results</span>}
                    </div>
                    {!venueReady ? null : found.isFetching ? (
                        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-[12.5px] text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" /> Searching Google Maps…
                        </div>
                    ) : found.isError ? (
                        <Notice tone="danger">{found.error instanceof Error ? found.error.message : "Could not load suggestions."}</Notice>
                    ) : !q && !picked.length ? (
                        <p className="rounded-lg border border-dashed border-border py-6 text-center text-[12.5px] text-muted-foreground">Choose a category or type a search.</p>
                    ) : list.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border py-6 text-center text-[12.5px] text-muted-foreground">No places found within {radius} km. Try a bigger radius.</p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {list.map((s) => {
                                const on = isSelected(s);
                                const cat = catOf(s.category_key);
                                return (
                                    <li key={s.google_place_id} className={cn("flex items-center gap-3 rounded-lg border p-2.5", on ? "border-primary/40 bg-primary/5" : "border-border")}>
                                        <PlaceThumb photo={s.photo_uri} category={cat} size={52} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-semibold">{s.name}</p>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
                                                <CategoryChip category={cat} fallback={s.category_key} />
                                                {s.rating !== null && <span className="inline-flex items-center gap-0.5"><Star className="size-3 fill-amber-400 text-amber-400" /> {s.rating}</span>}
                                                <span className="inline-flex items-center gap-0.5"><MapPin className="size-3 text-primary" /> {distanceText(s.distance_km)}</span>
                                            </div>
                                            {s.address && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{s.address}</p>}
                                        </div>
                                        {s.already_added ? (
                                            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-success"><CircleCheck className="size-4" /> Added</span>
                                        ) : (
                                            <Button size="sm" variant={on ? "default" : "outline"} className={cn("shrink-0", !on && "border-primary/50 text-primary hover:bg-primary/5 hover:text-primary")} onClick={() => toggle(s)}>
                                                {on ? <><Check className="size-3.5" /> Selected</> : <><Plus className="size-3.5" /> Add</>}
                                            </Button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {selected.length > 0 && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-primary"><CircleCheck className="size-4" /> Selected Nearby Places ({selected.length})</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {selected.map((s) => (
                                <div key={s.google_place_id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                                    <PlaceThumb photo={s.photo_uri} category={catOf(s.category_key)} size={36} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[12px] font-semibold">{s.name}</p>
                                        <CategoryChip category={catOf(s.category_key)} fallback={s.category_key} />
                                    </div>
                                    <button type="button" aria-label={`Remove ${s.name}`} onClick={() => toggle(s)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </ActionSheet>
    );
}

/** Edit a saved place: its name, the short line under it, category and visibility. */
function EditPlaceSheet({ eventId, place, categories, onClose }: { eventId: number; place: NearbyPlace; categories: NearbyCategory[]; onClose: () => void }) {
    const update = useUpdateNearbyPlace(eventId);
    const [name, setName] = useState(place.name);
    const [description, setDescription] = useState(place.description ?? "");
    const [category, setCategory] = useState(place.category_key);
    const [showInApp, setShowInApp] = useState(place.show_in_app);
    const save = () => {
        if (!name.trim()) return;
        update.mutate(
            { id: place.id, data: { name: name.trim(), description: description.trim() || null, category_key: category, show_in_app: showInApp } },
            { onSuccess: onClose },
        );
    };
    return (
        <ActionSheet
            open onClose={onClose} icon={MapPinned} title="Edit Nearby Place" subtitle={place.address ?? undefined}
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={!name.trim() || update.isPending} onClick={save}>
                        {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save Changes
                    </Button>
                </>
            )}
        >
            <div className="flex flex-col gap-4">
                <FormField label="Place Name" required>
                    <Input value={name} maxLength={150} onChange={(e) => setName(e.target.value)} className={cn("h-9", !name.trim() && "border-destructive")} />
                </FormField>
                <FormField label="Short Description" note={<span className="text-[11px] text-muted-foreground">Shown under the name, e.g. &ldquo;Comfort stay near the venue&rdquo;.</span>}>
                    <Input value={description} maxLength={200} placeholder="e.g. 24/7 Emergency Services" onChange={(e) => setDescription(e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Category" required>
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="!h-9 w-full text-[12.5px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                </FormField>
                <label className="flex cursor-pointer items-center justify-between gap-3 text-[12.5px]">
                    Show in participant app
                    <Switch checked={showInApp} onCheckedChange={setShowInApp} />
                </label>
            </div>
        </ActionSheet>
    );
}

function PlaceDetails({
    place: p, category, canEdit, onClose, onEdit, onDelete,
}: {
    place: NearbyPlace; category: NearbyCategory | undefined; canEdit: boolean;
    onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
    return (
        <ActionSheet
            open onClose={onClose} icon={MapPinned} title="Place Details" subtitle={p.name}
            footer={canEdit ? (
                <>
                    <Button variant="outline" className="text-destructive" onClick={onDelete}><Trash2 className="size-3.5" /> Delete</Button>
                    <Button onClick={onEdit}><Pencil className="size-3.5" /> Edit</Button>
                </>
            ) : undefined}
        >
            <div className="flex flex-col gap-3">
                {p.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(p.photo_url)} alt="" className="h-40 w-full rounded-xl object-cover" />
                )}
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    {!p.photo_url && <PlaceThumb photo={null} category={category} size={44} />}
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold">{p.name}</p>
                        {p.description && <p className="truncate text-[12px] text-muted-foreground">{p.description}</p>}
                    </div>
                    {p.map_url && (
                        <Button asChild size="sm" variant="outline">
                            <a href={p.map_url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Map</a>
                        </Button>
                    )}
                </div>
                <DetailSection title="Details">
                    <DetailRow label="Category">{category?.name ?? p.category_key}</DetailRow>
                    <DetailRow label="Distance from venue">{distanceText(p.distance_km)}</DetailRow>
                    <DetailRow label="Rating">{p.rating !== null ? `${p.rating} ★${p.rating_count ? ` (${p.rating_count.toLocaleString()})` : ""}` : "—"}</DetailRow>
                    <DetailRow label="Address">{p.address}</DetailRow>
                    <DetailRow label="Status" tone={p.show_in_app ? "success" : "muted"}>{p.show_in_app ? "Visible" : "Hidden"}</DetailRow>
                </DetailSection>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Info className="size-3" /> From Google Maps when it was added.</p>
            </div>
        </ActionSheet>
    );
}
