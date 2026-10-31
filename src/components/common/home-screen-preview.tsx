'use client';

/**
 * The mobile app home screen, drawn from a Home Screen Template: the template's
 * image on top, then names, date, countdown and the menu grid in the
 * template's OWN colours. Same drawing as the admin's live preview, so what the
 * admin designs and what the client picks look the same.
 *
 * `size="sm"` is the card thumbnail; `"md"` is the side panel.
 */

import {
    BookOpen, CalendarDays, Images, MailCheck, MapPin, Users, MessageCircle, Phone, ImageOff,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { mediaUrl } from '@/lib/media-url';
import type { TemplateColor } from '@/hooks/use-home-screen-templates';

const MENUS = [
    { label: 'Our Story', Icon: BookOpen },
    { label: 'Events', Icon: CalendarDays },
    { label: 'Gallery', Icon: Images },
    { label: 'RSVP', Icon: MailCheck },
    { label: 'Venue', Icon: MapPin },
    { label: 'Family', Icon: Users },
    { label: 'Messages', Icon: MessageCircle },
    { label: 'Contact', Icon: Phone },
];

const COUNTDOWN = [
    { value: '25', label: 'Days' },
    { value: '12', label: 'Hrs' },
    { value: '30', label: 'Mins' },
    { value: '15', label: 'Secs' },
];

export function HomeScreenPreview({
    imageUrl,
    colors,
    title = 'Emma & David',
    subtitle = 'Are getting married',
    date = '25 Jan 2026',
    size = 'md',
    className,
}: {
    imageUrl: string | null | undefined;
    colors: TemplateColor[];
    title?: string;
    subtitle?: string;
    date?: string;
    size?: 'sm' | 'md';
    className?: string;
}) {
    const has = (key: TemplateColor['key']) => colors.some((c) => c.key === key);
    const pick = (key: TemplateColor['key']) => colors.find((c) => c.key === key)?.hex;
    const primary = pick('primary') || '#4F46E5';
    // A role the template doesn't define falls back to its own palette.
    const secondary = has('secondary') ? pick('secondary')! : `${primary}22`;
    const accent = has('accent') ? pick('accent')! : primary;
    const background = has('background') ? pick('background')! : '#FFFFFF';
    const text = has('text') ? pick('text')! : '#1F2937';
    const src = mediaUrl(imageUrl);
    const sm = size === 'sm';

    return (
        <div
            className={cn(
                'shrink-0 bg-neutral-900 shadow-lg',
                sm ? 'w-[120px] rounded-[1.3rem] border-[5px] border-neutral-900' : 'w-[210px] rounded-[2rem] border-[8px] border-neutral-900',
                className,
            )}
        >
            <div
                className={cn('relative flex aspect-[9/19] flex-col overflow-hidden', sm ? 'rounded-[0.95rem]' : 'rounded-[1.5rem]')}
                style={{ backgroundColor: background }}
            >
                <span
                    className={cn(
                        'absolute left-1/2 z-10 -translate-x-1/2 rounded-full bg-neutral-900',
                        sm ? 'top-1 h-2 w-10' : 'top-1.5 h-3.5 w-16',
                    )}
                />

                {/* image */}
                <div className="relative h-[50%] w-full shrink-0">
                    {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: secondary }}>
                            <ImageOff className={sm ? 'h-4 w-4' : 'h-6 w-6'} style={{ color: primary }} />
                        </div>
                    )}
                    <div
                        className="absolute inset-x-0 bottom-0 h-1/3"
                        style={{ backgroundImage: `linear-gradient(to bottom, transparent, ${background})` }}
                    />
                </div>

                {/* content */}
                <div className={cn('flex min-h-0 flex-1 flex-col items-center text-center', sm ? '-mt-3 px-1.5' : '-mt-5 px-3')}>
                    <p
                        className={cn('relative w-full break-words font-serif font-bold leading-tight', sm ? 'text-[9.5px]' : 'text-[15px]')}
                        style={{ color: primary }}
                    >
                        {title}
                    </p>
                    <p className={cn('uppercase tracking-wide', sm ? 'text-[5px]' : 'text-[8px]')} style={{ color: text }}>
                        {subtitle}
                    </p>
                    <span
                        className={cn('rounded-full border font-semibold', sm ? 'mt-0.5 px-1.5 text-[5.5px]' : 'mt-1.5 px-3 py-0.5 text-[9px]')}
                        style={{ borderColor: accent, color: text }}
                    >
                        {date}
                    </span>

                    <div className={cn('grid w-full grid-cols-4', sm ? 'mt-1 gap-0.5' : 'mt-2 gap-1')}>
                        {COUNTDOWN.map((c) => (
                            <div key={c.label} className="flex flex-col items-center">
                                <span className={cn('font-bold leading-none', sm ? 'text-[7.5px]' : 'text-[12px]')} style={{ color: text }}>
                                    {c.value}
                                </span>
                                <span className={sm ? 'text-[4.5px]' : 'text-[7.5px]'} style={{ color: text, opacity: 0.7 }}>
                                    {c.label}
                                </span>
                            </div>
                        ))}
                    </div>

                    <span className={cn('h-px w-3/4', sm ? 'my-1' : 'my-2')} style={{ backgroundColor: accent, opacity: 0.5 }} />

                    <div className={cn('grid w-full grid-cols-4', sm ? 'gap-x-0.5 gap-y-0.5' : 'gap-x-1 gap-y-1.5')}>
                        {MENUS.map(({ label, Icon }) => (
                            <div key={label} className="flex min-w-0 flex-col items-center">
                                <span
                                    className={cn('flex items-center justify-center', sm ? 'h-4 w-4 rounded' : 'h-7 w-7 rounded-lg')}
                                    style={{ backgroundColor: secondary, border: `1px solid ${accent}55` }}
                                >
                                    <Icon className={sm ? 'h-2 w-2' : 'h-3.5 w-3.5'} style={{ color: primary }} />
                                </span>
                                <span className={cn('w-full truncate', sm ? 'text-[4px]' : 'text-[7px]')} style={{ color: text }}>
                                    {label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
