'use client';

/**
 * Create Event → Step 1 → "Choose <Category> Mobile App Home Template".
 *
 * Templates come from the admin's Home Screen Templates (active ones, for the
 * picked event category). The style chips are DYNAMIC: they are the Home Screen
 * Categories master-table rows (admin Template → Home Screen Categories) those templates use — no
 * "Classic / Royal" list lives in this file.
 *
 *   Preview  shows a template in the side panel without choosing it
 *   Select   chooses it (saved on the event as home_screen_template_id)
 */

import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faEye, faCircleInfo, faMobileScreenButton } from '@fortawesome/free-solid-svg-icons';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { HomeScreenPreview } from '@/components/common/home-screen-preview';
import { useHomeScreenTemplates, type HomeScreenTemplate } from '@/hooks/use-home-screen-templates';

export function HomeTemplatePicker({
    categoryId,
    categoryName,
    value,
    onChange,
    hostNames,
}: {
    categoryId: string;
    categoryName?: string;
    /** Selected template id as a string; "" = none. */
    value: string;
    onChange: (id: string) => void;
    /** The event's own names once typed (edit mode), else a sample is shown. */
    hostNames?: string;
}) {
    const { data, isLoading, isError } = useHomeScreenTemplates(categoryId);
    const templates = useMemo(() => data?.templates ?? [], [data]);
    const styles = data?.styles ?? [];

    const [styleId, setStyleId] = useState<number | 'all'>('all');
    const [previewId, setPreviewId] = useState<number | null>(null);

    // A new category brings a new list: reset the filter and the preview.
    useEffect(() => {
        setStyleId('all');
        setPreviewId(null);
    }, [categoryId]);

    // A selection that is not in this category's list (category changed, or the
    // template was switched off) is cleared rather than silently kept.
    useEffect(() => {
        if (!data || !value) return;
        if (!templates.some((t) => String(t.id) === value)) onChange('');
    }, [data, templates, value, onChange]);

    const shown = styleId === 'all' ? templates : templates.filter((t) => t.home_screen_category_id === styleId);

    const selected = templates.find((t) => String(t.id) === value) ?? null;
    const previewed =
        templates.find((t) => t.id === previewId) ?? selected ?? shown[0] ?? templates[0] ?? null;

    const label = categoryName || 'Event';

    return (
        <section className="min-w-0 border-t border-border pt-5">
            <h3 className="text-[15px] font-bold text-foreground">Choose {label} Mobile App Home Template</h3>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                Pick a {label.toLowerCase()} home template, explore its colour palette, and preview how it will look
                in the mobile app. You can change it later.
            </p>

            {isLoading ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-[330px] rounded-xl" />
                    ))}
                </div>
            ) : isError ? (
                <p className="mt-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-[12.5px] text-muted-foreground">
                    Could not load the home templates. You can carry on and choose one later.
                </p>
            ) : templates.length === 0 ? (
                <p className="mt-4 rounded-md border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                    No home templates for {label} yet. You can carry on — one can be chosen later.
                </p>
            ) : (
                <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="min-w-0">
                        {/* Style chips — from the Home Screen Categories master table */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="mr-1 text-[12.5px] font-medium text-muted-foreground">Style:</span>
                            {[{ id: 'all' as const, name: 'All' }, ...styles].map((s) => {
                                const active = styleId === s.id;
                                return (
                                    <button
                                        key={String(s.id)}
                                        type="button"
                                        onClick={() => setStyleId(s.id)}
                                        aria-pressed={active}
                                        className={cn(
                                            'h-8 rounded-full border px-4 text-[12.5px] font-medium transition',
                                            active
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border bg-card text-foreground hover:bg-muted',
                                        )}
                                    >
                                        {s.name}
                                    </button>
                                );
                            })}
                        </div>

                        {shown.length === 0 ? (
                            <p className="mt-4 text-[12.5px] text-muted-foreground">No templates in this style.</p>
                        ) : (
                            <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                {shown.map((t) => (
                                    <TemplateCard
                                        key={t.id}
                                        template={t}
                                        selected={String(t.id) === value}
                                        previewing={previewed?.id === t.id}
                                        hostNames={hostNames}
                                        onPreview={() => setPreviewId(t.id)}
                                        onSelect={() => {
                                            onChange(String(t.id));
                                            setPreviewId(t.id);
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Side panel */}
                    <aside className="min-w-0 self-start rounded-xl border border-primary/20 bg-primary/5 p-4 lg:sticky lg:top-4">
                        <div className="flex items-center gap-2">
                            <FontAwesomeIcon icon={faMobileScreenButton} className="!size-[14px] text-primary" />
                            <p className="text-[13px] font-bold text-foreground">Mobile Home Preview</p>
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                            What your guests will see on the mobile app home.
                        </p>
                        {previewed && (
                            <>
                                <div className="mt-4 flex justify-center">
                                    <HomeScreenPreview
                                        imageUrl={previewed.image_url}
                                        colors={previewed.colors}
                                        title={hostNames || undefined}
                                    />
                                </div>
                                <p className="mt-3 break-words text-center text-[12.5px] font-semibold text-foreground">
                                    {previewed.name}
                                    {selected?.id === previewed.id ? (
                                        <span className="ml-1.5 text-[11px] font-medium text-primary">(selected)</span>
                                    ) : null}
                                </p>
                            </>
                        )}
                        <div className="mt-3 flex items-start gap-2 rounded-md bg-card px-3 py-2">
                            <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 !size-[12px] shrink-0 text-primary" />
                            <p className="text-[11px] leading-4 text-muted-foreground">
                                This is a live preview of the template. Colours, images and content can be customised later.
                            </p>
                        </div>
                    </aside>
                </div>
            )}
        </section>
    );
}

function TemplateCard({
    template,
    selected,
    previewing,
    hostNames,
    onPreview,
    onSelect,
}: {
    template: HomeScreenTemplate;
    selected: boolean;
    previewing: boolean;
    hostNames?: string;
    onPreview: () => void;
    onSelect: () => void;
}) {
    return (
        <div
            className={cn(
                'relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card p-3 transition',
                selected ? 'border-primary ring-2 ring-primary/30' : previewing ? 'border-primary/40' : 'border-border',
            )}
        >
            {template.style ? (
                <span className="absolute left-3 top-3 z-10 max-w-[70%] truncate rounded-full bg-primary/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-primary">
                    {template.style.name}
                </span>
            ) : null}
            {selected ? (
                <span className="absolute right-3 top-3 z-10 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                    <FontAwesomeIcon icon={faCheck} className="!size-[11px]" />
                </span>
            ) : null}

            <button
                type="button"
                onClick={onPreview}
                className="flex justify-center rounded-lg bg-muted/40 pb-2 pt-8"
                aria-label={`Preview ${template.name}`}
            >
                <HomeScreenPreview
                    imageUrl={template.image_url}
                    colors={template.colors}
                    title={hostNames || undefined}
                    size="sm"
                />
            </button>

            <p className="mt-3 break-words text-[13px] font-bold text-foreground line-clamp-1" title={template.name}>
                {template.name}
            </p>
            {template.description ? (
                <p className="mt-0.5 break-words text-[11.5px] leading-4 text-muted-foreground line-clamp-2" title={template.description}>
                    {template.description}
                </p>
            ) : null}

            <div className="mt-2 flex items-center gap-1.5">
                {template.colors.map((c) => (
                    <span
                        key={c.key}
                        title={`${c.label}: ${c.hex}`}
                        className="h-4 w-4 rounded-full border border-border"
                        style={{ backgroundColor: c.hex }}
                    />
                ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onPreview} className="h-8 text-[12px]">
                    <FontAwesomeIcon icon={faEye} className="!size-[11px]" />
                    Preview
                </Button>
                <Button
                    type="button"
                    size="sm"
                    onClick={onSelect}
                    className="h-8 text-[12px]"
                    variant={selected ? 'default' : 'default'}
                    disabled={selected}
                >
                    {selected ? (
                        <>
                            <FontAwesomeIcon icon={faCheck} className="!size-[11px]" />
                            Selected
                        </>
                    ) : (
                        'Select'
                    )}
                </Button>
            </div>
        </div>
    );
}
