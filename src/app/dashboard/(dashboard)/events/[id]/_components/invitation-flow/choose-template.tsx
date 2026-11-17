"use client";

import { useMemo, useState } from "react";
import { Check, Info, Pencil, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TemplateOption } from "@/hooks/use-client-portal";
import type { InvitationData } from "@/components/common/invitation-card";
import { TemplateArtwork } from "@/components/common/template-artwork";

/**
 * Step 1 — Choose Template (design 001.png). The admin's invitation templates
 * the plan allows: search, event category, sort, style chips, the grid, and the
 * Selected Template panel with "Customize This Template".
 */

const ALL = "all";
const SORTS = [
    { value: "popular", label: "Most Popular" },
    { value: "name", label: "Name A–Z" },
    { value: "newest", label: "Newest" },
] as const;

const HOW = [
    { title: "Select a design", text: "Filter by category or style and preview the template." },
    { title: "Edit & save", text: "Customize the invitation parts, colors and QR style." },
    { title: "Share with guests", text: "Send via WhatsApp or email to your guest list." },
    { title: "Track responses", text: "See who it was shared with and on which channel." },
];

export function ChooseTemplate({
    templates, loading, categories, eventCategoryId, selected, customImage, data, onPick, onCustomize,
}: {
    /** Every template on the plan. */
    templates: TemplateOption[];
    loading: boolean;
    categories: { id: number; name: string }[];
    eventCategoryId: number | null;
    selected: TemplateOption | null;
    customImage: string;
    data: InvitationData;
    onPick: (t: TemplateOption) => void;
    onCustomize: () => void;
}) {
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState<string>(eventCategoryId ? String(eventCategoryId) : ALL);
    const [sort, setSort] = useState<string>("popular");
    const [style, setStyle] = useState<string>(ALL);

    // Narrowed by category (a template with no category suits every one).
    const inCategory = useMemo(
        () => templates.filter((t) => category === ALL || !t.event_category_id || String(t.event_category_id) === category),
        [templates, category],
    );
    const styles = useMemo(() => [...new Set(inCategory.map((t) => t.style).filter(Boolean) as string[])], [inCategory]);
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = inCategory
            .filter((t) => style === ALL || t.style === style)
            .filter((t) => !q || `${t.name} ${t.style ?? ""} ${t.description ?? ""}`.toLowerCase().includes(q));
        const byName = (a: TemplateOption, b: TemplateOption) => a.name.localeCompare(b.name);
        if (sort === "name") return [...list].sort(byName);
        if (sort === "newest") return [...list].sort((a, b) => Number(b.id) - Number(a.id));
        // Most Popular = featured first, then the admin's own order.
        return [...list].sort((a, b) => Number(!!b.is_featured) - Number(!!a.is_featured) || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || byName(a, b));
    }, [inCategory, style, search, sort]);

    const artFor = (t: TemplateOption) => (t.background_type === "custom" && customImage ? { ...t, background_image: customImage } : t);
    const categoryLabel = categories.find((c) => String(c.id) === category)?.name ?? "All";

    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            {/* ── Browse ─────────────────────────────────────────────── */}
            <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h2 className="text-[16px] font-bold text-foreground">Browse Invitation Templates</h2>
                        <p className="text-[12.5px] text-muted-foreground">Choose from designs published by the Super Admin</p>
                    </div>
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11.5px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                        {styles.length} Style{styles.length === 1 ? "" : "s"} Available
                    </span>
                </div>

                <div className="flex flex-wrap gap-2.5">
                    <div className="relative min-w-[220px] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates by name or theme..." className="h-10 pl-9 text-[13px]" />
                    </div>
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-10 min-w-[210px] text-[13px]" aria-label="Event category">
                            <span className="text-muted-foreground">Event Category:</span>
                            <SelectValue>{categoryLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All</SelectItem>
                            {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={sort} onValueChange={setSort}>
                        <SelectTrigger className="h-10 min-w-[150px] text-[13px]" aria-label="Sort"><SelectValue /></SelectTrigger>
                        <SelectContent>{SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>

                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Template style">
                    {[ALL, ...styles].map((s) => {
                        const n = s === ALL ? inCategory.length : inCategory.filter((t) => t.style === s).length;
                        const on = style === s;
                        return (
                            <button key={s} type="button" role="tab" aria-selected={on} onClick={() => setStyle(s)}
                                className={cn("h-9 rounded-md border px-3.5 text-[12.5px] font-semibold capitalize transition",
                                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted")}>
                                {s === ALL ? `All Templates (${n})` : s}
                            </button>
                        );
                    })}
                </div>

                {loading ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />)}
                    </div>
                ) : shown.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border py-12 text-center">
                        <p className="text-[13.5px] font-semibold text-foreground">No templates match</p>
                        <p className="mt-1 text-[12.5px] text-muted-foreground">
                            {templates.length ? "Try another style, category or search." : "Your plan has no invitation templates yet. Please contact us to add them."}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                        {shown.map((t) => {
                            const on = selected?.code === t.code;
                            return (
                                <button key={t.code} type="button" aria-pressed={on} onClick={() => onPick(t)} data-template={t.code}
                                    className={cn("group flex flex-col rounded-lg border-2 bg-card p-2 text-left transition",
                                        on ? "border-primary shadow-sm" : "border-border hover:border-primary/40")}>
                                    <span className="flex items-start justify-between gap-1 px-0.5">
                                        <span className="min-w-0">
                                            <span className="block truncate text-[12.5px] font-semibold text-foreground" title={t.name}>{t.name}</span>
                                            {t.style && <span className="block text-[10.5px] font-semibold capitalize text-primary">{t.style}</span>}
                                        </span>
                                        {on && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>}
                                    </span>
                                    <span className="relative mt-1.5 block aspect-[4/5] w-full overflow-hidden rounded bg-muted/40">
                                        <TemplateArtwork template={artFor(t)} data={data} className="inset-1.5" cardClassName="rounded-[3px] shadow-sm" />
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-[12px] text-muted-foreground">
                    <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                    Each template contains your event&apos;s unique QR code. Your edits save as an event-specific copy; the admin&apos;s master designs remain unchanged.
                </p>
            </section>

            {/* ── Side ──────────────────────────────────────────────── */}
            <aside className="flex flex-col gap-4">
                <section className="rounded-xl border border-border bg-card p-5">
                    <h2 className="text-[16px] font-bold text-foreground">Selected Template</h2>
                    {selected ? (
                        <>
                            <div className="mt-3 flex gap-3 border-b border-border pb-4">
                                <span className="relative block h-[120px] w-[92px] shrink-0 overflow-hidden rounded-md bg-muted/40">
                                    <TemplateArtwork template={artFor(selected)} data={data} className="inset-0" cardClassName="rounded-[3px]" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-[14px] font-bold text-foreground">{selected.name}</p>
                                    <p className="mt-0.5 line-clamp-3 text-[12px] text-muted-foreground">
                                        {selected.description || [selected.style, selected.background_type].filter(Boolean).join(" · ")}
                                    </p>
                                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                        <Check className="size-3" />QR Enabled
                                    </span>
                                </div>
                            </div>
                            <Button className="mt-4 h-10 w-full text-[13px] font-semibold" onClick={onCustomize}>
                                <Pencil className="size-4" />Customize This Template
                            </Button>
                        </>
                    ) : (
                        <p className="mt-2 text-[12.5px] text-muted-foreground">Pick a design from the list to continue.</p>
                    )}
                </section>

                <section className="rounded-xl border border-border bg-card p-5">
                    <h2 className="text-[16px] font-bold text-foreground">How It Works</h2>
                    <ol className="mt-3 flex flex-col gap-3">
                        {HOW.map((h, i) => (
                            <li key={h.title} className="flex gap-3">
                                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11.5px] font-bold text-primary-foreground">{i + 1}</span>
                                <span>
                                    <span className="block text-[13px] font-semibold text-foreground">{h.title}</span>
                                    <span className="block text-[12px] text-muted-foreground">{h.text}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>

                <p className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-[12px] text-primary">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                    Organizers can edit only the properties enabled by the Admin.
                </p>
            </aside>
        </div>
    );
}
