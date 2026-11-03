'use client';

/**
 * Venue map — drop the event's pin on a Google map, as the mobile app does.
 *
 * Key: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (a WEB key: Maps JavaScript API, plus
 * Places API (New) for the search box, plus Geocoding API for address lookup).
 *
 * Like the app, every pin (click, drag, search, current location):
 *   1. reports its coordinates at once (`onPick`), and
 *   2. is looked up for its place — venue name, address, landmark — and those
 *      go to `onAddress`. Google's geocoder first; if the key does not allow
 *      it, OpenStreetMap (Nominatim, no key) instead. Only the LATEST pin's
 *      answer is used, so a slow lookup never overwrites a newer pin.
 */

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCrosshairs, faLocationDot, faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
const DEFAULT_CENTER = { lat: 13.0827, lng: 80.2707 }; // Chennai

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type G = any;

let loader: Promise<G> | null = null;

/** Loads the Maps JavaScript API once per page. */
function loadGoogleMaps(): Promise<G> {
    if (typeof window === 'undefined') return Promise.reject(new Error('server'));
    const w = window as unknown as { google?: G; __gmapsReady?: () => void };
    if (w.google?.maps?.Map) return Promise.resolve(w.google);
    if (loader) return loader;
    loader = new Promise((resolve, reject) => {
        w.__gmapsReady = () => resolve(w.google);
        const script = document.createElement('script');
        script.src =
            `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}` +
            '&v=weekly&loading=async&callback=__gmapsReady';
        script.async = true;
        script.onerror = () => {
            loader = null;
            reject(new Error('Could not load Google Maps.'));
        };
        document.head.appendChild(script);
    });
    return loader;
}

export interface PickedPlace {
    name?: string;
    address?: string;
    landmark?: string;
}

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** A "name" that is really a plus code or a house number is not a venue name. */
const looksLikeName = (v?: string) => !!v && !v.includes('+') && !/^[\d\s/,-]+$/.test(v);

/** Google geocoder (needs Geocoding API on the key). */
async function lookupGoogle(g: G, lat: number, lng: number): Promise<PickedPlace | null> {
    const geocoder = new g.maps.Geocoder();
    const { results } = await geocoder.geocode({ location: { lat, lng } });
    const top = results?.[0];
    if (!top) return null;
    const comp = (type: string) =>
        top.address_components?.find((c: G) => c.types?.includes(type))?.long_name as string | undefined;
    const isPlace = (top.types ?? []).some((t: string) => ['establishment', 'point_of_interest', 'premise'].includes(t));
    return {
        name: isPlace ? clean(comp('premise') ?? comp('point_of_interest') ?? top.address_components?.[0]?.long_name) : undefined,
        address: clean(top.formatted_address),
        // The City box (stored in venue_landmark): the town, not the neighbourhood.
        landmark: clean(comp('locality') ?? comp('postal_town') ?? comp('administrative_area_level_3') ?? comp('administrative_area_level_2')),
    };
}

type LatLng = { lat: number; lng: number };
type SearchHit = LatLng & { name?: string; address?: string; km?: number };

/** Straight-line distance in km. */
function distanceKm(a: LatLng, b: LatLng): number {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** How far around the person a search looks first (Google's maximum bias radius). */
const NEAR_RADIUS_M = 50000;

/** Google Places (New) text search, biased to `near`. */
async function searchGooglePlaces(g: G, text: string, near: LatLng): Promise<SearchHit[]> {
    const { Place } = await g.maps.importLibrary('places');
    const { places } = await Place.searchByText({
        textQuery: text,
        fields: ['displayName', 'formattedAddress', 'location'],
        locationBias: { center: near, radius: NEAR_RADIUS_M },
        maxResultCount: 8,
    });
    return (places ?? [])
        .filter((p: G) => p.location)
        .map((p: G) => ({
            lat: p.location.lat(),
            lng: p.location.lng(),
            name: clean(p.displayName),
            address: clean(p.formattedAddress),
        }));
}

/** Google geocoder, biased to a box around `near`. */
async function searchGoogleGeocoder(g: G, text: string, near: LatLng): Promise<SearchHit[]> {
    const d = 0.45; // ~50 km
    const bounds = new g.maps.LatLngBounds(
        { lat: near.lat - d, lng: near.lng - d },
        { lat: near.lat + d, lng: near.lng + d },
    );
    const { results } = await new g.maps.Geocoder().geocode({ address: text, bounds });
    return (results ?? [])
        .filter((r: G) => r.geometry?.location)
        .map((r: G) => ({
            lat: r.geometry.location.lat(),
            lng: r.geometry.location.lng(),
            address: clean(r.formatted_address),
        }));
}

/** OpenStreetMap — no key. Looks around `near` first, then anywhere. */
async function searchOsm(text: string, near: LatLng): Promise<SearchHit[]> {
    const d = 0.45;
    const viewbox = [near.lng - d, near.lat + d, near.lng + d, near.lat - d].join(',');
    const get = async (extra: string) => {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&q=${encodeURIComponent(text)}${extra}`,
            { headers: { Accept: 'application/json' } },
        );
        if (!res.ok) return [];
        const rows = (await res.json()) as { lat: string; lon: string; name?: string; display_name?: string }[];
        return (rows ?? []).map((r) => ({
            lat: Number(r.lat),
            lng: Number(r.lon),
            name: clean(r.name),
            address: clean(r.display_name),
        }));
    };
    const nearby = await get(`&viewbox=${viewbox}&bounded=1`);
    return nearby.length ? nearby : get('');
}

/**
 * Typed place → matching places, NEAREST to `near` first. Google Places
 * first (gives the venue's name), then Google's geocoder, then OpenStreetMap —
 * whichever the key allows. Every one is biased to `near`, so "JK Mahal"
 * finds the one near you, not the best-known one in another city.
 */
async function searchPlaces(g: G | null, text: string, near: LatLng): Promise<SearchHit[]> {
    let hits: SearchHit[] = [];
    if (g?.maps?.importLibrary) {
        try {
            hits = await searchGooglePlaces(g, text, near);
        } catch {
            hits = []; // Places API (New) not allowed for the key
        }
    }
    if (!hits.length) {
        // No Places: a geocoder finds a bare name only where it is best known
        // (often another city), so also ask for "<text>, <your town>".
        const town = await townAt(g, near);
        const queries = town && !text.toLowerCase().includes(town.toLowerCase()) ? [`${text}, ${town}`, text] : [text];
        for (const q of queries) {
            if (g?.maps?.Geocoder) {
                try {
                    hits.push(...(await searchGoogleGeocoder(g, q, near)));
                } catch {
                    /* Geocoding API not enabled for the key */
                }
            }
            try {
                hits.push(...(await searchOsm(q, near)));
            } catch {
                /* OpenStreetMap unreachable */
            }
        }
    }
    // The same spot from two sources (within ~150 m): keep the one with a name.
    const unique: SearchHit[] = [];
    for (const h of hits) {
        const i = unique.findIndex((u) => distanceKm(u, h) < 0.15);
        if (i < 0) unique.push(h);
        else if (!unique[i].name && h.name) unique[i] = h;
    }
    return unique
        .map((h) => ({ ...h, km: distanceKm(near, h) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, 6);
}

/** The town at a point (Google's geocoder, else OpenStreetMap), or undefined. */
async function townAt(g: G | null, p: LatLng): Promise<string | undefined> {
    try {
        if (g?.maps?.Geocoder) {
            const t = (await lookupGoogle(g, p.lat, p.lng))?.landmark;
            if (t) return t;
        }
    } catch {
        /* fall through */
    }
    try {
        return (await lookupOsm(p.lat, p.lng))?.landmark;
    } catch {
        return undefined;
    }
}

/** The browser's location, or null (denied / unavailable / too slow). */
function getPosition(timeoutMs: number): Promise<LatLng | null> {
    return new Promise((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: timeoutMs },
        );
    });
}

const formatKm = (km?: number) =>
    km === undefined ? '' : km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;

async function lookupOsm(lat: number, lng: number): Promise<PickedPlace | null> {
    const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`,
        { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const d = await res.json();
    const a = d?.address ?? {};
    return {
        name: clean(d?.name),
        address: clean(d?.display_name),
        landmark: clean(a.city ?? a.town ?? a.village ?? a.county ?? a.state_district),
    };
}

export function VenueMapPicker({
    lat,
    lng,
    onPick,
    onAddress,
    onClear,
}: {
    lat: string;
    lng: string;
    /** The pin's coordinates, at once. */
    onPick: (lat: number, lng: number) => void;
    /** The pin's place, once looked up (venue name, address, landmark). */
    onAddress?: (place: PickedPlace) => void;
    onClear: () => void;
}) {
    const mapDiv = useRef<HTMLDivElement>(null);
    const mapRef = useRef<G>(null);
    const markerRef = useRef<G>(null);
    const pickRef = useRef(onPick);
    pickRef.current = onPick;
    const addressRef = useRef(onAddress);
    addressRef.current = onAddress;
    const lookupSeq = useRef(0);

    const [state, setState] = useState<'loading' | 'ready' | 'failed'>(KEY ? 'loading' : 'failed');
    const [locating, setLocating] = useState(false);
    const [looking, setLooking] = useState(false);
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [hits, setHits] = useState<SearchHit[] | null>(null);
    /** Where the person is, once known — searches look around it. */
    const nearRef = useRef<LatLng | null>(null);
    /** The location prompt is shown at most once per page from a search. */
    const askedRef = useRef(false);

    const hasPin = lat.trim() !== '' && lng.trim() !== '' && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));

    /** Looks the pin up; only the latest pin's answer is passed on. */
    const lookup = async (g: G | null, p: { lat: number; lng: number }, known?: PickedPlace) => {
        const seq = ++lookupSeq.current;
        setLooking(true);
        let found: PickedPlace | null = null;
        try {
            if (g) found = await lookupGoogle(g, p.lat, p.lng);
        } catch {
            found = null; // key without Geocoding API — fall back below
        }
        if (!found) {
            try {
                found = await lookupOsm(p.lat, p.lng);
            } catch {
                found = null;
            }
        }
        if (seq !== lookupSeq.current) return; // a newer pin is on the map
        setLooking(false);
        const name = known?.name ?? (looksLikeName(found?.name) ? found?.name : undefined);
        const place: PickedPlace = {
            name,
            address: known?.address ?? found?.address,
            landmark: found?.landmark,
        };
        if (place.name || place.address || place.landmark) addressRef.current?.(place);
    };

    /** Puts (or moves) the pin; `notify` reports it and looks it up. */
    const placePin = (g: G, position: { lat: number; lng: number }, notify: boolean, known?: PickedPlace) => {
        const map = mapRef.current;
        if (!map) return;
        if (!markerRef.current) {
            markerRef.current = new g.maps.Marker({ map, position, draggable: true });
            markerRef.current.addListener('dragend', (e: G) => {
                const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                pickRef.current(p.lat, p.lng);
                void lookup(g, p);
            });
        } else {
            markerRef.current.setPosition(position);
            markerRef.current.setMap(map);
        }
        if (notify) {
            pickRef.current(position.lat, position.lng);
            void lookup(g, position, known);
        }
    };

    // Map + search, once.
    useEffect(() => {
        if (!KEY) return;
        let cancelled = false;
        loadGoogleMaps()
            .then(async (g) => {
                if (cancelled || !mapDiv.current) return;
                const start = hasPin ? { lat: Number(lat), lng: Number(lng) } : DEFAULT_CENTER;
                mapRef.current = new g.maps.Map(mapDiv.current, {
                    center: start,
                    zoom: hasPin ? 16 : 11,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    clickableIcons: false,
                });
                if (hasPin) placePin(g, start, false);
                mapRef.current.addListener('click', (e: G) => {
                    placePin(g, { lat: e.latLng.lat(), lng: e.latLng.lng() }, true);
                });
                setState('ready');

                // Location already allowed: learn it quietly (no prompt) and, with
                // no pin yet, open the map there instead of on Chennai.
                try {
                    const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
                    if (perm?.state !== 'granted') return;
                    const me = await getPosition(8000);
                    if (!me || cancelled) return;
                    nearRef.current = me;
                    if (!markerRef.current?.getMap?.() && mapRef.current) {
                        mapRef.current.setCenter(me);
                        mapRef.current.setZoom(13);
                    }
                } catch {
                    /* Permissions API not supported — searches will ask instead */
                }
            })
            .catch(() => {
                if (!cancelled) setState('failed');
            });
        return () => {
            cancelled = true;
        };
        // Runs once: later pin changes are pushed by the effect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Pin removed from outside (Remove pin, or the fields cleared).
    useEffect(() => {
        if (!hasPin && markerRef.current) markerRef.current.setMap(null);
    }, [hasPin]);

    // Pin set from OUTSIDE — the saved event loading after the map was built
    // (Edit Venue opened on Chennai with the pin elsewhere), or typed lat/lng.
    // A pin the map itself placed is already there, so it is left alone.
    useEffect(() => {
        if (!hasPin || state !== 'ready' || !mapRef.current) return;
        const g = (window as unknown as { google?: G }).google;
        if (!g) return;
        const p = { lat: Number(lat), lng: Number(lng) };
        const cur = markerRef.current?.getMap?.() ? markerRef.current.getPosition?.() : null;
        if (cur && Math.abs(cur.lat() - p.lat) < 1e-5 && Math.abs(cur.lng() - p.lng) < 1e-5) return;
        placePin(g, p, false);
        mapRef.current.setCenter(p);
        mapRef.current.setZoom(16);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lat, lng, hasPin, state]);

    /** Where to search around: the person's location, else what the map shows. */
    const searchCentre = async (): Promise<LatLng> => {
        if (nearRef.current) return nearRef.current;
        if (!askedRef.current) {
            askedRef.current = true;
            const me = await getPosition(8000);
            if (me) {
                nearRef.current = me;
                return me;
            }
        }
        const c = mapRef.current?.getCenter?.();
        if (c) return { lat: c.lat(), lng: c.lng() };
        if (hasPin) return { lat: Number(lat), lng: Number(lng) };
        return DEFAULT_CENTER;
    };

    const choose = (hit: SearchHit) => {
        setHits(null);
        const g = (window as unknown as { google?: G }).google ?? null;
        const p = { lat: hit.lat, lng: hit.lng };
        const known = { name: hit.name, address: hit.address };
        if (g && mapRef.current) {
            mapRef.current.setCenter(p);
            mapRef.current.setZoom(16);
            placePin(g, p, true, known);
        } else {
            onPick(p.lat, p.lng);
            void lookup(null, p, known);
        }
    };

    const runSearch = async () => {
        const text = query.trim();
        if (!text || searching) return;
        setSearching(true);
        setHits(null);
        try {
            const g = (window as unknown as { google?: G }).google ?? null;
            const found = await searchPlaces(g, text, await searchCentre());
            if (!found.length) {
                toast.error('No place found. Try another name or address.');
                return;
            }
            // One match: straight to it. Several: let the person pick (nearest first).
            if (found.length === 1) choose(found[0]);
            else setHits(found);
        } catch {
            toast.error('Search failed. Please try again.');
        } finally {
            setSearching(false);
        }
    };

    /**
     * A laptop has no GPS: the browser guesses from Wi-Fi / the internet
     * connection, and the FIRST answer is often a city or two away. So watch
     * for up to 10 s and keep the most accurate reading (stop early under
     * 100 m), never reuse a cached one, and say so when it is still rough.
     */
    const useCurrentLocation = () => {
        if (!navigator.geolocation) {
            toast.error('Your browser cannot share its location. Please search the venue instead.');
            return;
        }
        setLocating(true);
        let best: GeolocationPosition | null = null;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            navigator.geolocation.clearWatch(watchId);
            window.clearTimeout(timer);
            setLocating(false);
            if (!best) {
                toast.error('Could not get your location. Please search the venue or tap it on the map.');
                return;
            }
            const g = (window as unknown as { google?: G }).google;
            const p = { lat: best.coords.latitude, lng: best.coords.longitude };
            nearRef.current = p; // later searches look around here
            const accuracy = best.coords.accuracy;
            if (g && mapRef.current) {
                mapRef.current.setCenter(p);
                mapRef.current.setZoom(accuracy > 1000 ? 12 : 16);
                placePin(g, p, true);
            } else {
                onPick(p.lat, p.lng);
                void lookup(null, p);
            }
            if (accuracy > 1000) {
                toast.warning(
                    'Approximate location (±' + Math.round(accuracy / 1000) + ' km). Please search the venue or tap the exact spot on the map.',
                );
            }
        };
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
                if (pos.coords.accuracy <= 100) finish();
            },
            () => finish(),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
        );
        const timer = window.setTimeout(finish, 10000);
    };

    if (!KEY) {
        return (
            <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-[12px] text-muted-foreground">
                Map unavailable: <span className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> is not set. You can
                still type the latitude and longitude below.
            </p>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <p className="text-[13px] text-foreground">
                {hasPin ? 'Pin dropped - tap again to move it' : 'Tap the map to drop the venue pin'}
            </p>
            <form
                className="flex min-w-0 overflow-hidden rounded-md border border-border"
                onSubmit={(e) => {
                    e.preventDefault();
                    void runSearch();
                }}
            >
                <span className="grid w-10 shrink-0 place-items-center text-muted-foreground">
                    <FontAwesomeIcon icon={faMagnifyingGlass} className="!size-[14px]" />
                </span>
                <input
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setHits(null);
                    }}
                    placeholder="Search a venue, area or address"
                    className="h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                />
                <Button type="submit" disabled={searching || !query.trim()} className="h-10 shrink-0 rounded-none px-5 text-[13px]">
                    {searching ? 'Searching…' : 'Search'}
                </Button>
            </form>
            {hits && hits.length > 0 && (
                <div className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background">
                    <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-[11.5px] text-muted-foreground">
                        <span>Nearest to you first - pick the venue</span>
                        <button type="button" onClick={() => setHits(null)} aria-label="Close results" className="p-1 hover:text-foreground">
                            <FontAwesomeIcon icon={faXmark} className="!size-[11px]" />
                        </button>
                    </div>
                    {hits.map((h, i) => (
                        <button
                            key={`${h.lat},${h.lng},${i}`}
                            type="button"
                            onClick={() => choose(h)}
                            className="flex min-w-0 items-start gap-2.5 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted"
                        >
                            <FontAwesomeIcon icon={faLocationDot} className="mt-0.5 !size-[12px] shrink-0 text-primary" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium text-foreground">
                                    {h.name ?? h.address?.split(',')[0] ?? 'Unnamed place'}
                                </span>
                                {h.address && (
                                    <span className="block truncate text-[11.5px] text-muted-foreground">{h.address}</span>
                                )}
                            </span>
                            <span className="shrink-0 text-[11.5px] text-muted-foreground">{formatKm(h.km)}</span>
                        </button>
                    ))}
                </div>
            )}
            <div className="relative overflow-hidden rounded-lg border border-border">
                <div ref={mapDiv} className="h-[340px] w-full bg-muted xl:h-[400px]" />
                {state === 'loading' && (
                    <div className="absolute inset-0 grid place-items-center text-[12px] text-muted-foreground">
                        Loading map…
                    </div>
                )}
                {state === 'failed' && (
                    <div className="absolute inset-0 grid place-items-center px-4 text-center text-[12px] text-muted-foreground">
                        The map could not be loaded. You can still type the latitude and longitude below.
                    </div>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 text-[12px]" onClick={useCurrentLocation} disabled={locating}>
                    <FontAwesomeIcon icon={faCrosshairs} className="!size-[11px]" />
                    {locating ? 'Finding you…' : 'Use My Current Location'}
                </Button>
                {hasPin && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-[12px] text-destructive hover:text-destructive" onClick={onClear}>
                        <FontAwesomeIcon icon={faXmark} className="!size-[11px]" />
                        Remove Pin
                    </Button>
                )}
                <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <FontAwesomeIcon icon={faLocationDot} className="!size-[11px] text-primary" />
                    {looking
                        ? 'Finding the address…'
                        : hasPin
                            ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
                            : 'Click the map to drop the venue pin'}
                </span>
            </div>
        </div>
    );
}
