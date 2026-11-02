'use client';

import { useMemo, useState } from 'react';
import type { CountryCode } from 'libphonenumber-js/mobile';
import { ChevronDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { dialOf, mobileMaxDigits, phoneCountries } from '@/lib/phone';

/**
 * Country code + mobile number, as in the mobile app: every country (India
 * first, searchable), the number limited to that country's digits. Validation
 * is the caller's — `mobileNumberError(country, number)` from `@/lib/phone`.
 */
export function PhoneInput({
    country,
    number,
    onChange,
    invalid,
    placeholder = 'Mobile number',
    disabled,
    className,
}: {
    country: CountryCode;
    number: string;
    onChange: (country: CountryCode, number: string) => void;
    invalid?: boolean;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const countries = phoneCountries();
    const current = countries.find((c) => c.iso === country) ?? countries[0];
    const max = mobileMaxDigits(country);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return countries;
        return countries.filter(
            (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.iso.toLowerCase() === q,
        );
    }, [countries, query]);

    return (
        <div
            className={cn(
                'flex h-10 min-w-0 overflow-hidden rounded-md border border-input bg-transparent focus-within:ring-2 focus-within:ring-ring/30',
                invalid && 'border-destructive',
                disabled && 'opacity-60',
                className,
            )}
        >
            <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        disabled={disabled}
                        className="flex shrink-0 items-center gap-1.5 border-r border-input px-2.5 text-[13px] hover:bg-muted/50"
                        aria-label={`Country code ${current.dial}, ${current.name}`}
                    >
                        <span className="text-[16px] leading-none">{current.flag}</span>
                        <span className="font-medium">{current.dial}</span>
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[280px] p-0">
                    <div className="flex items-center gap-2 border-b border-border px-3">
                        <Search className="size-4 text-muted-foreground" />
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search country or code"
                            className="h-10 w-full bg-transparent text-[13px] outline-none"
                        />
                    </div>
                    <ul className="max-h-[260px] overflow-y-auto py-1">
                        {shown.length === 0 && (
                            <li className="px-3 py-2 text-[12.5px] text-muted-foreground">No country found.</li>
                        )}
                        {shown.map((c) => (
                            <li key={c.iso}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const digits = number.replace(/\D/g, '').slice(0, mobileMaxDigits(c.iso));
                                        onChange(c.iso, digits);
                                        setOpen(false);
                                        setQuery('');
                                    }}
                                    className={cn(
                                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted',
                                        c.iso === country && 'bg-primary/5 font-semibold text-primary',
                                    )}
                                >
                                    <span className="text-[16px] leading-none">{c.flag}</span>
                                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                                    <span className="text-muted-foreground">{c.dial}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </PopoverContent>
            </Popover>
            <input
                value={number}
                disabled={disabled}
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder={placeholder}
                onChange={(e) => onChange(country, e.target.value.replace(/\D/g, '').slice(0, max))}
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-[13.5px] outline-none placeholder:text-muted-foreground"
                aria-label={`Mobile number (${dialOf(country)})`}
            />
        </div>
    );
}
