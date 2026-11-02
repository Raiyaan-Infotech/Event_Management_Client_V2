import {
    getCountries,
    getCountryCallingCode,
    isValidPhoneNumber,
    parsePhoneNumberFromString,
    type CountryCode,
} from 'libphonenumber-js/mobile';
import { Metadata } from 'libphonenumber-js/core';
import mobileMetadata from 'libphonenumber-js/metadata.mobile.json';

/**
 * Phone numbers, the same rules as the mobile app (`core/utils/phone_countries.dart`):
 * every country, India first, a per-country digit limit, and a MOBILE-number
 * check from Google's libphonenumber data (the backend uses the same library).
 */

export interface PhoneCountry {
    iso: CountryCode;
    name: string;
    flag: string;
    /** "+91" */
    dial: string;
}

const flagOf = (iso: string) =>
    String.fromCodePoint(...iso.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

/** Countries that share a dial code: the one the number is filed under. */
const MAIN_FOR_DIAL: Record<string, CountryCode> = { '+1': 'US', '+44': 'GB', '+7': 'RU', '+61': 'AU', '+47': 'NO', '+590': 'GP', '+262': 'RE', '+599': 'CW', '+212': 'MA', '+358': 'FI' };

let cache: PhoneCountry[] | null = null;

/** Every country, India first, then A–Z by name. */
export function phoneCountries(): PhoneCountry[] {
    if (cache) return cache;
    let names: Intl.DisplayNames | null = null;
    try {
        names = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
        names = null;
    }
    const all = getCountries().map((iso) => ({
        iso,
        name: names?.of(iso) ?? iso,
        flag: flagOf(iso),
        dial: `+${getCountryCallingCode(iso)}`,
    }));
    all.sort((a, b) => a.name.localeCompare(b.name));
    const india = all.find((c) => c.iso === 'IN')!;
    cache = [india, ...all.filter((c) => c.iso !== 'IN')];
    return cache;
}

export const DEFAULT_PHONE_COUNTRY: CountryCode = 'IN';

/** The country for a stored dial code ("+1" → United States). Unknown → India. */
export function countryForDial(dial: string | null | undefined): CountryCode {
    const code = `+${String(dial ?? '').replace(/\D/g, '')}`;
    if (MAIN_FOR_DIAL[code]) return MAIN_FOR_DIAL[code];
    return phoneCountries().find((c) => c.dial === code)?.iso ?? DEFAULT_PHONE_COUNTRY;
}

export function dialOf(iso: CountryCode): string {
    return `+${getCountryCallingCode(iso)}`;
}

/** Most digits a mobile number has in this country (India 10). 15 when unknown. */
export function mobileMaxDigits(iso: CountryCode): number {
    try {
        const m = new Metadata(mobileMetadata as never);
        m.selectNumberingPlan(iso);
        const plan = m.numberingPlan as unknown as { type?: (t: string) => { possibleLengths(): number[] } | undefined; possibleLengths(): number[] };
        const lengths = plan.type?.('MOBILE')?.possibleLengths() ?? plan.possibleLengths();
        return lengths.length ? Math.max(...lengths) : 15;
    } catch {
        return 15;
    }
}

/**
 * Error text for a mobile number in its country, or null when valid.
 * Empty → null: the caller decides whether the field is required.
 */
export function mobileNumberError(iso: CountryCode, number: string | null | undefined): string | null {
    const digits = String(number ?? '').replace(/\D/g, '');
    if (!digits) return null;
    try {
        if (isValidPhoneNumber(digits, iso)) return null;
    } catch {
        /* unparseable → invalid */
    }
    const c = phoneCountries().find((x) => x.iso === iso);
    return `Enter a valid mobile number for ${c?.name ?? iso} (${dialOf(iso)}).`;
}

/** The national number to save: digits only, a leading trunk 0 dropped. */
export function nationalMobile(iso: CountryCode, number: string): string {
    const digits = number.replace(/\D/g, '');
    if (!digits) return '';
    return parsePhoneNumberFromString(digits, iso)?.nationalNumber ?? digits;
}

/** "+91 8220348702" → { iso: 'IN', number: '8220348702' }; a bare number → India. */
export function splitPhone(value: string | null | undefined): { iso: CountryCode; number: string } {
    const raw = String(value ?? '').trim();
    if (!raw) return { iso: DEFAULT_PHONE_COUNTRY, number: '' };
    if (raw.startsWith('+')) {
        const parsed = parsePhoneNumberFromString(raw);
        if (parsed?.country) return { iso: parsed.country, number: parsed.nationalNumber };
        const m = raw.match(/^\+(\d{1,4})[\s-]*(.*)$/);
        if (m) return { iso: countryForDial(m[1]), number: m[2].replace(/\D/g, '') };
    }
    return { iso: DEFAULT_PHONE_COUNTRY, number: raw.replace(/\D/g, '') };
}

/** { iso, number } → "+91 8220348702" (empty number → ""). */
export function joinPhone(iso: CountryCode, number: string): string {
    const digits = number.replace(/\D/g, '');
    return `${dialOf(iso)} ${digits}`.trim();
}
