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
import { faCrosshairs, faLocationDot, faXmark } from '@fortawesome/free-solid-svg-icons';

import { Button } from '@/components/ui/button';

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
        landmark: clean(comp('sublocality') ?? comp('sublocality_level_1') ?? comp('neighborhood') ?? comp('locality')),
    };
}

/** OpenStreetMap fallback — no key. */
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
        landmark: clean(a.suburb ?? a.neighbourhood ?? a.city_district ?? a.city ?? a.town ?? a.village),
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
    const searchDiv = useRef<HTMLDivElement>(null);
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

                // Search box (Places API New). Optional: the map works without it.
                try {
                    const places = await g.maps.importLibrary('places');
                    if (cancelled || !searchDiv.current || !places?.PlaceAutocompleteElement) return;
                    const box = new places.PlaceAutocompleteElement();
                    box.style.width = '100%';
                    searchDiv.current.replaceChildren(box);
                    box.addEventListener('gmp-select', async (ev: G) => {
                        try {
                            const place = ev.placePrediction.toPlace();
                            await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
                            if (!place.location) return;
                            const pos = { lat: place.location.lat(), lng: place.location.lng() };
                            mapRef.current.setCenter(pos);
                            mapRef.current.setZoom(16);
                            // The searched name is a better venue name than the geocoder's.
                            placePin(g, pos, true, { name: clean(place.displayName), address: clean(place.formattedAddress) });
                        } catch {
                            /* a failed lookup leaves the pin where it was */
                        }
                    });
                } catch {
                    /* Places not enabled for the key — no search box */
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

    const useCurrentLocation = () => {
        if (!navigator.geolocation) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocating(false);
                const g = (window as unknown as { google?: G }).google;
                const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                if (g && mapRef.current) {
                    mapRef.current.setCenter(p);
                    mapRef.current.setZoom(16);
                    placePin(g, p, true);
                } else {
                    onPick(p.lat, p.lng);
                    void lookup(null, p);
                }
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 10000 },
        );
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
            <div ref={searchDiv} className="min-w-0" />
            <div className="relative overflow-hidden rounded-lg border border-border">
                <div ref={mapDiv} className="h-[280px] w-full bg-muted" />
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
