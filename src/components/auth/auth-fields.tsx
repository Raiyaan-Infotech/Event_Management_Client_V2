'use client';

import * as React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';

import { cn } from '@/lib/utils';

/**
 * Country codes — the same short list as the public website's login, so the two
 * behave alike. The value sent to the backend is the dial code.
 */
export const COUNTRY_CODES = [
    { code: '+91', flag: '🇮🇳', label: 'India' },
    { code: '+1', flag: '🇺🇸', label: 'United States' },
    { code: '+44', flag: '🇬🇧', label: 'United Kingdom' },
    { code: '+971', flag: '🇦🇪', label: 'United Arab Emirates' },
    { code: '+65', flag: '🇸🇬', label: 'Singapore' },
];

export function FieldLabel({
    htmlFor,
    children,
    required,
}: {
    htmlFor?: string;
    children: React.ReactNode;
    required?: boolean;
}) {
    return (
        <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-bold text-foreground">
            {children} {required ? <span className="text-destructive">*</span> : null}
        </label>
    );
}

/** Country dial code + digits-only number, in one bordered box. */
export function MobileNumberField({
    id,
    label,
    value,
    onChange,
    dialCode,
    onDialCodeChange,
    error = false,
    disabled = false,
    autoFocus = false,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    dialCode: string;
    onDialCodeChange: (value: string) => void;
    error?: boolean;
    disabled?: boolean;
    autoFocus?: boolean;
}) {
    const selected = COUNTRY_CODES.find((entry) => entry.code === dialCode) || COUNTRY_CODES[0];

    return (
        <div className="min-w-0">
            <FieldLabel htmlFor={id} required>
                {label}
            </FieldLabel>
            <div
                className={cn(
                    'flex min-w-0 items-stretch overflow-hidden rounded-lg border bg-background focus-within:ring-2 focus-within:ring-primary/30',
                    error ? 'border-destructive' : 'border-input',
                    disabled && 'opacity-70',
                )}
            >
                {/* A native select keeps keyboard and mobile behaviour right. */}
                <div className="relative flex shrink-0 items-center gap-1 border-r border-input pl-3 pr-7">
                    <span aria-hidden="true">{selected.flag}</span>
                    <span className="text-[13px] font-semibold text-foreground">{selected.code}</span>
                    <FontAwesomeIcon
                        icon={faChevronDown}
                        className="pointer-events-none absolute right-2 !size-[11px] text-muted-foreground"
                    />
                    <select
                        aria-label="Country code"
                        value={dialCode}
                        disabled={disabled}
                        onChange={(event) => onDialCodeChange(event.target.value)}
                        className="absolute inset-0 cursor-pointer opacity-0"
                    >
                        {COUNTRY_CODES.map((entry) => (
                            <option key={entry.code} value={entry.code}>
                                {entry.flag} {entry.code} — {entry.label}
                            </option>
                        ))}
                    </select>
                </div>
                <input
                    id={id}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    autoFocus={autoFocus}
                    disabled={disabled}
                    value={value}
                    // Digits only — a phone box that accepts letters just fails later.
                    onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 15))}
                    placeholder="Enter your mobile number"
                    className="h-11 min-w-0 flex-1 bg-transparent px-3 text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
                />
            </div>
        </div>
    );
}

/** Six boxes for a one-time code. Paste fills forward; Backspace steps back. */
export const OtpInput = React.forwardRef<
    HTMLDivElement,
    { length?: number; value: string; onChange: (value: string) => void; autoFocus?: boolean }
>(function OtpInput({ length = 6, value, onChange, autoFocus = false }, ref) {
    const inputs = React.useRef<(HTMLInputElement | null)[]>([]);
    const digits = React.useMemo(
        () => Array.from({ length }, (_, index) => value[index] || ''),
        [value, length],
    );

    React.useEffect(() => {
        if (autoFocus) inputs.current[0]?.focus();
    }, [autoFocus]);

    const write = (index: number, digit: string) => {
        const next = digits.slice();
        next[index] = digit;
        onChange(next.join('').slice(0, length));
    };

    const handleChange = (index: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.value.replace(/\D/g, '');
        if (!raw) {
            write(index, '');
            return;
        }
        if (raw.length > 1) {
            const merged = (value.slice(0, index) + raw).slice(0, length);
            onChange(merged);
            inputs.current[Math.min(merged.length, length - 1)]?.focus();
            return;
        }
        write(index, raw);
        if (index < length - 1) inputs.current[index + 1]?.focus();
    };

    const handleKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
        if (event.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus();
        if (event.key === 'ArrowRight' && index < length - 1) inputs.current[index + 1]?.focus();
    };

    return (
        <div ref={ref} className="flex items-center justify-center gap-2">
            {digits.map((digit, index) => (
                <input
                    key={index}
                    ref={(node) => {
                        inputs.current[index] = node;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    value={digit}
                    onChange={handleChange(index)}
                    onKeyDown={handleKeyDown(index)}
                    aria-label={`Digit ${index + 1}`}
                    className={cn(
                        'h-11 w-10 rounded-lg border bg-background text-center text-[16px] font-bold text-foreground outline-none transition focus:ring-2 focus:ring-primary/30',
                        digit ? 'border-primary' : 'border-input',
                    )}
                />
            ))}
        </div>
    );
});
