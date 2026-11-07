"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, EyeOff, Layers, Pencil, Settings, Smartphone, Trash2, User, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/common/phone-input";
import { countryForDial, dialOf, mobileNumberError, nationalMobile } from "@/lib/phone";
import {
    relationSuitsSide, useDeleteFamilyMember, useEventFamily, useRelationOptions, useReorderFamily,
    useSaveFamilyMember, useSaveFamilySettings, type FamilyMember, type FamilySettings,
} from "@/hooks/use-event-modules";
import type { ClientEvent } from "@/hooks/use-client-events";
import {
    ChoiceRadio, CountTabs, FormField, FormPanel, ListCard, ModuleHeader, OverviewCard, Pager, PersonCell,
    PhotoDropzone, SearchBox, SortSelect, StarBadge, StatTile, StatusPill, SwitchField, Toolbar,
} from "@/components/module-kit";
import { Empty, PanelLoading, Section, SettingsShell, SwitchRow } from "./module-ui";

/**
 * Event Family — Jamal's web design (2026-11-04), built from the module kit:
 *   · "Event Family" heading; Family Overview tiles (Total, Bride Side, Groom
 *     Side, Visible Groups = sides with a visible member);
 *   · tabs All Members / Bride Side / Groom Side / Close Family / Hidden, search,
 *     Sort by; a collapsible card per side ("Bride Side Family (3)") with a row
 *     per member: photo, name, relation, side pill, "#n Display Order" (place
 *     within the side), Visible / Hidden, what the app shows, Edit / Delete;
 *   · right: Add / Edit Family Member — Family Side, Member Name, Relationship,
 *     Photo (square crop), Mobile (optional), Display Order, Notes, Visibility
 *     (Show in App / Hide from App), Highlight as Key Family Member.
 * Visibility and Key are `is_visible` / `is_key` on the member (V2 backend,
 * 2026-11-04); a hidden member is never sent to a participant. Family Settings
 * (what participants see) stays behind the ⚙ button. Title, email and date of
 * birth are not in this form; an edited member keeps them as they are.
 */

type Side = "groom" | "bride";
type Tab = "all" | Side;
type Sort = "order" | "name" | "relation" | "recent";

const PAGE = 10;
const SIDES: Side[] = ["bride", "groom"];
const sideName = (s: Side) => (s === "bride" ? "Bride Side" : "Groom Side");
const SORTS: { value: Sort; label: string }[] = [
    { value: "order", label: "Sort by Display Order" },
    { value: "name", label: "Sort by Name" },
    { value: "relation", label: "Sort by Relationship" },
    { value: "recent", label: "Sort by Recently Added" },
];

type FormState = {
    id?: number; side: Side; name: string; relation: string; photo: string | null;
    dial: string; mobile: string; order: string; notes: string; visible: boolean; key: boolean;
};

/**
 * The event's full id order with `id` placed at `pos` (1-based) among its side.
 * The other side's members keep their places.
 */
function placeAt(all: FamilyMember[], id: number, side: Side, pos: number): number[] {
    const others = all.filter((m) => m.id !== id);
    const sideOthers = others.filter((m) => m.side === side);
    const ids = others.map((m) => m.id);
    if (pos - 1 < sideOthers.length) ids.splice(ids.indexOf(sideOthers[Math.max(0, pos - 1)].id), 0, id);
    else if (sideOthers.length) ids.splice(ids.indexOf(sideOthers[sideOthers.length - 1].id) + 1, 0, id);
    else ids.push(id);
    return ids;
}

export function FamilyPanel({ event }: { event: ClientEvent }) {
    const query = useEventFamily(event.id);
    const remove = useDeleteFamilyMember(event.id);
    const reorder = useReorderFamily(event.id);
    const save = useSaveFamilyMember(event.id);
    const relations = useRelationOptions(event.id);
    const [formOpen, setFormOpen] = useState(false);

    const [tab, setTab] = useState<Tab>("all");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<Sort>("order");
    const [page, setPage] = useState(1);
    const [form, setForm] = useState<FormState | null>(null);
    const [tried, setTried] = useState(false);
    const [deleting, setDeleting] = useState<FamilyMember | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // A backend without the 2026-11-04 columns sends neither field: treat as visible, not key.
    const all = useMemo(
        () => (query.data?.items ?? []).map((m) => ({ ...m, is_visible: m.is_visible !== false, is_key: m.is_key === true })),
        [query.data],
    );
    /** A member's place within its side (the "#n Display Order"). */
    const place = useMemo(() => {
        const m = new Map<number, number>();
        for (const s of SIDES) all.filter((x) => x.side === s).forEach((x, i) => m.set(x.id, i + 1));
        return m;
    }, [all]);

    if (query.isLoading) return <PanelLoading />;
    if (query.isError || !query.data) {
        return <Section title="Event Family"><Empty title="Could not load the family list">Please try again in a moment.</Empty></Section>;
    }

    const count = (s: Side) => all.filter((m) => m.side === s).length;

    // Filter → sort → page; the page's rows are then grouped by side.
    const q = search.trim().toLowerCase();
    const filtered = all.filter((m) => {
        if ((tab === "bride" || tab === "groom") && m.side !== tab) return false;
        return !q || m.full_name.toLowerCase().includes(q) || (m.relationship ?? "").toLowerCase().includes(q);
    });
    const sorter = (a: FamilyMember, b: FamilyMember) => {
        if (sort === "name") return a.full_name.localeCompare(b.full_name);
        if (sort === "relation") return (a.relationship ?? "").localeCompare(b.relationship ?? "") || a.full_name.localeCompare(b.full_name);
        if (sort === "recent") return String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")) || b.id - a.id;
        return (place.get(a.id) ?? 0) - (place.get(b.id) ?? 0);
    };
    const ordered = SIDES.flatMap((s) => filtered.filter((m) => m.side === s).sort(sorter));
    const pages = Math.max(1, Math.ceil(ordered.length / PAGE));
    const current = Math.min(page, pages);
    const pageRows = ordered.slice((current - 1) * PAGE, current * PAGE);
    const visibleGroups = SIDES.filter((s) => all.some((m) => m.side === s && m.is_visible)).length;

    // ── Form ──
    const blank = (side: Side = "bride"): FormState => ({
        side, name: "", relation: "", photo: null, dial: "+91", mobile: "",
        order: String(count(side) + 1), notes: "", visible: true, key: false,
    });
    const f = form ?? blank();
    // Functional, so a photo upload that ends while typing does not undo the typing.
    const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...(prev ?? blank()), ...patch }));
    const clear = () => { setForm(null); setTried(false); setFormOpen(false); };
    const addNew = () => { setForm(null); setTried(false); setFormOpen(true); };
    const edit = (m: FamilyMember) => {
        setTried(false);
        setForm({
            id: m.id, side: m.side, name: m.full_name, relation: m.relationship ?? "", photo: m.photo,
            dial: m.dial_code || "+91", mobile: m.mobile ?? "", order: String(place.get(m.id) ?? 1),
            notes: m.notes ?? "", visible: m.is_visible, key: m.is_key,
        });
        setFormOpen(true);
    };
    const changeSide = (side: Side) => {
        const patch: Partial<FormState> = { side };
        // A relation of the other side does not carry over; a new member goes last on its side.
        if (f.relation && !relationSuitsSide(f.relation, side)) patch.relation = "";
        if (!f.id) patch.order = String(count(side) + 1);
        set(patch);
    };

    // That side's relations only, each name once (the admin's list repeats some).
    const seen = new Set<string>();
    const options = (relations.data ?? []).filter((o) => {
        const k = o.name.trim().toLowerCase();
        if (!relationSuitsSide(o.name, f.side) || seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    const relationItems = f.relation && !options.some((o) => o.name === f.relation)
        ? [{ id: 0, name: f.relation }, ...options] : options;

    const orderNum = Number(f.order);
    const orderBad = !Number.isInteger(orderNum) || orderNum < 1;
    const submit = () => {
        setTried(true);
        if (!f.name.trim() || !f.relation || orderBad) return toast.error("Please fill all mandatory fields.");
        const phoneError = f.mobile ? mobileNumberError(countryForDial(f.dial), f.mobile) : null;
        if (phoneError) return toast.error(phoneError);
        const picked = (relations.data ?? []).find((o) => o.name === f.relation);
        const before = all;
        save.mutate(
            {
                id: f.id,
                data: {
                    name: f.name.trim(), side: f.side, relationship: f.relation, relationship_option_id: picked?.id ?? null,
                    mobile: f.mobile ? nationalMobile(countryForDial(f.dial), f.mobile) || null : null, dial_code: f.dial,
                    notes: f.notes.trim() || null, photo: f.photo ?? "", is_visible: f.visible, is_key: f.key,
                },
                done: f.id ? "Family member updated" : "Family member added",
            },
            {
                onSuccess: (res) => {
                    // Put the member at its Display Order within the side, when that changed the order.
                    const id = f.id ?? Number((res as { id?: number } | undefined)?.id);
                    if (id) {
                        const list = f.id ? before : [...before, { id, side: f.side } as FamilyMember];
                        const ids = placeAt(list, id, f.side, orderNum);
                        const now = (f.id ? before.map((m) => (m.id === id ? { ...m, side: f.side } : m)) : list).map((m) => m.id);
                        if (ids.join() !== now.join()) reorder.mutate(ids);
                    }
                    clear();
                },
            },
        );
    };

    const bad = (v: boolean) => tried && v;

    /** Export (Jamal, 2026-11-07): the list as shown — tab, search and sort, every page — as CSV. */
    const exportCsv = () => {
        const head = ["Name", "Family Side", "Relationship", "Mobile", "Display Order", "Visibility", "Key Family Member", "Notes"];
        const lines = ordered.map((m) => [
            m.full_name, m.side === "bride" ? "Bride Side" : "Groom Side", m.relationship ?? "",
            m.mobile ? `${m.dial_code ?? ""} ${m.mobile}`.trim() : "", place.get(m.id) ?? "",
            m.is_visible ? "Show in App" : "Hidden", m.is_key ? "Yes" : "No", m.notes ?? "",
        ]);
        const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
        const a = document.createElement("a");
        // BOM so Excel reads Tamil / other scripts correctly.
        a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
        a.download = `family-${(event.name || `event-${event.id}`).replace(/[^\w-]+/g, "-").toLowerCase()}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    const aside = (
        <FormPanel
            sheet={{ open: formOpen, onClose: clear }}
            icon={UserPlus}
            title={f.id ? "Edit Family Member" : "Add Family Member"}
            footer={(
                <>
                    <Button variant="outline" onClick={clear}>{f.id ? "Cancel" : "Clear"}</Button>
                    <Button disabled={save.isPending || reorder.isPending} onClick={submit}>
                        {f.id ? "Update Family Member" : "Save Family Member"}
                    </Button>
                </>
            )}
        >
            <FormField label="Family Side" required>
                <Select value={f.side} onValueChange={(v) => changeSide(v as Side)}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="bride">Bride Side</SelectItem>
                        <SelectItem value="groom">Groom Side</SelectItem>
                    </SelectContent>
                </Select>
            </FormField>
            <FormField label="Member Name" required>
                <Input value={f.name} maxLength={150} placeholder="Enter full name" onChange={(e) => set({ name: e.target.value })}
                    className={cn("h-9", bad(!f.name.trim()) && "border-destructive")} />
            </FormField>
            <FormField label="Relationship" required>
                <Select value={f.relation} onValueChange={(v) => set({ relation: v })}>
                    <SelectTrigger className={cn("h-9 w-full", bad(!f.relation) && "border-destructive")}>
                        <SelectValue placeholder={relations.isLoading ? "Loading…" : "Select relationship"} />
                    </SelectTrigger>
                    <SelectContent>
                        {relationItems.map((o) => <SelectItem key={`${o.id}-${o.name}`} value={o.name}>{o.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </FormField>
            <FormField label="Photo Upload">
                <PhotoDropzone value={f.photo} onChange={(url) => set({ photo: url })} />
            </FormField>
            <FormField label="Mobile Number" hint=" (Optional)">
                <PhoneInput country={countryForDial(f.dial)} number={f.mobile} onChange={(iso, num) => set({ dial: dialOf(iso), mobile: num })} />
            </FormField>
            <FormField label="Display Order" required note="Lower number appears first in the app.">
                <Input type="number" min={1} value={f.order} onChange={(e) => set({ order: e.target.value })}
                    className={cn("h-9", bad(orderBad) && "border-destructive")} />
            </FormField>
            <FormField label="Short Description / Notes">
                <Textarea value={f.notes} maxLength={500} rows={2} placeholder="E.g. Chief guest, elder brother, etc."
                    onChange={(e) => set({ notes: e.target.value })} />
            </FormField>
            <FormField label="Visibility" required note="You can hide a member without deleting them.">
                <ChoiceRadio name="family-visibility" value={f.visible} onChange={(v) => set({ visible: v })}
                    options={[{ value: true, label: "Show in App" }, { value: false, label: "Hide from App" }]} />
            </FormField>
            <SwitchField id="family-key" label="Highlight as Key Family Member" hint="Show special emphasis (e.g. with a badge) in the app."
                checked={f.key} onChange={(v) => set({ key: v })} />
        </FormPanel>
    );

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <ModuleHeader
                title="Event Family"
                subtitle="Manage bride and groom family members, relationships, and display order."
                actions={(
<>
                    <Button variant="outline" size="sm" className="h-8" onClick={exportCsv} disabled={!ordered.length}><Download className="size-3.5" /> Export</Button>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button size="icon" variant="outline" className="size-8" aria-label="Family Settings" onClick={() => setSettingsOpen(true)}>
                                <Settings className="size-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Family Settings</TooltipContent>
                    </Tooltip>
                    <Button size="sm" className="h-8" onClick={addNew}><UserPlus className="size-3.5" /> Add Family Member</Button>
                    </>
                )}
            />

            <OverviewCard title="Family Overview" icon={Users}>
                <StatTile icon={Users} value={all.length} label="Total Family Members" tone="primary" />
                <StatTile icon={User} value={count("bride")} label="Bride Side" tone="primary" />
                <StatTile icon={User} value={count("groom")} label="Groom Side" tone="violet" />
                <StatTile icon={Layers} value={visibleGroups} label="Visible Groups" tone="plain" />
            </OverviewCard>

            <CountTabs<Tab>
                value={tab}
                onChange={(v) => { setTab(v); setPage(1); }}
                tabs={[
                    { value: "all", label: "All Members", count: all.length },
                    { value: "bride", label: "Bride Side", count: count("bride") },
                    { value: "groom", label: "Groom Side", count: count("groom") },
                    // Close Family + Hidden tabs removed (Jamal, 2026-11-06).
                ]}
            />

            <Toolbar>
                <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search family members by name or relationship..." />
                <SortSelect value={sort} onChange={setSort} options={SORTS} />
            </Toolbar>

            {pageRows.length === 0 ? (
                <div className="rounded-xl border border-border bg-card">
                    <Empty title={all.length ? "No family members match" : "No family members yet"}>
                        {all.length ? "Try another tab or search." : "Add the first one with the form."}
                    </Empty>
                </div>
            ) : SIDES.map((s) => {
                const rows = pageRows.filter((m) => m.side === s);
                if (!rows.length) return null;
                return (
                    <ListCard key={s} collapsible icon={Users} title={`${sideName(s)} Family`} count={filtered.filter((m) => m.side === s).length}>
                        <ul className="divide-y divide-border">
                            {rows.map((m) => (
                                <MemberRow key={m.id} member={m} place={place.get(m.id) ?? 0} editing={f.id === m.id} onEdit={edit} onDelete={setDeleting} />
                            ))}
                        </ul>
                    </ListCard>
                );
            })}

            <Pager page={current} pageSize={PAGE} total={ordered.length} onPage={setPage} noun="family members" />

            {settingsOpen && <FamilySettingsDialog eventId={event.id} settings={query.data.settings} onClose={() => setSettingsOpen(false)} />}

            <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Family Member?</DialogTitle>
                        <DialogDescription>
                            {deleting?.full_name} will be removed from this event&apos;s family list. To keep them but not show them, choose Hide from App instead.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={remove.isPending}
                            onClick={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { if (form?.id === deleting.id) clear(); setDeleting(null); } })}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {aside}
        </div>
    );
}

/** One member row: photo · name / relation · side · display order · visibility · app note · Edit / Delete. */
function MemberRow({
    member: m, place, editing, onEdit, onDelete,
}: { member: FamilyMember; place: number; editing: boolean; onEdit: (m: FamilyMember) => void; onDelete: (m: FamilyMember) => void }) {
    return (
        <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-2 md:grid-cols-[minmax(160px,1fr)_92px_84px_80px_minmax(120px,1fr)_auto]",
            editing && "bg-primary/5")}>
            <PersonCell name={m.full_name} photo={m.photo} sub={m.relationship || "—"} badge={m.is_key ? <StarBadge>Key</StarBadge> : undefined} />
            <div className="hidden md:block">
                <StatusPill tone={m.side === "bride" ? "primary" : "violet"}>{sideName(m.side)}</StatusPill>
            </div>
            <div className="hidden border-l border-border pl-3 md:block">
                <p className="text-[12.5px] font-bold">#{place}</p>
                <p className="text-[11px] text-muted-foreground">Display Order</p>
            </div>
            <div className="hidden md:block">
                {m.is_visible
                    ? <StatusPill tone="success" icon={Eye}>Visible</StatusPill>
                    : <StatusPill tone="muted" icon={EyeOff}>Hidden</StatusPill>}
            </div>
            <p className="hidden items-center gap-1.5 text-[11px] leading-[14px] text-muted-foreground md:flex">
                <Smartphone className="size-3.5 shrink-0" />
                {m.is_visible ? "Appears in family section of the app" : "Not shown in the app"}
            </p>
            <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-[12px]" onClick={() => onEdit(m)}><Pencil className="size-3" /> Edit</Button>
                <Button size="sm" variant="outline" className="h-7 border-destructive/40 px-2.5 text-[12px] text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => onDelete(m)}>
                    <Trash2 className="size-3" /> Delete
                </Button>
            </div>
        </li>
    );
}

/** Family Settings — the ⚙ button (dialog) or a Menu Settings page (`inline`): what a participant sees of the list (as the app). */
function FamilySettingsDialog({ eventId, settings, onClose, inline }: { eventId: number; settings: FamilySettings; onClose: () => void; inline?: boolean }) {
    const save = useSaveFamilySettings(eventId);
    const [profileScreen, setProfileScreen] = useState(settings.profile_screen);
    const [photo, setPhoto] = useState(settings.profile_photo);
    const [relationship, setRelationship] = useState(settings.relationship);

    return (
        <SettingsShell inline={inline} title="Family Settings" description="What a participant sees of the family list. The name is always shown."
            onClose={onClose} busy={save.isPending}
            footer={<>
                {!inline && <Button variant="outline" onClick={onClose}>Cancel</Button>}
                <Button disabled={save.isPending}
                    onClick={() => save.mutate({ profile_screen: profileScreen, profile_photo: photo, relationship }, { onSuccess: onClose })}>
                    Save
                </Button>
            </>}>
            <SwitchRow id="fam-profile" label="Family Profile Screen" hint="Let a family member be opened to see their profile"
                checked={profileScreen} onChange={setProfileScreen} />
            <div className="flex flex-col gap-3 border-t pt-3">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Family fields</p>
                <label className="flex items-center gap-2.5 text-[13px]">
                    <Checkbox checked={photo} onCheckedChange={(v) => setPhoto(v === true)} /> Profile Photo
                </label>
                <label className="flex items-center gap-2.5 text-[13px] opacity-70">
                    <Checkbox checked disabled /> Name <span className="text-[11.5px] text-muted-foreground">(always shown)</span>
                </label>
                <label className="flex items-center gap-2.5 text-[13px]">
                    <Checkbox checked={relationship} onCheckedChange={(v) => setRelationship(v === true)} /> Relationship
                </label>
            </div>
        </SettingsShell>
    );
}

/** Family Settings as a card — the event's Menu Settings page. */
export function FamilySettingsCard({ eventId }: { eventId: number }) {
    const query = useEventFamily(eventId);
    if (query.isLoading) return <Section title="Family Settings"><PanelLoading /></Section>;
    if (!query.data) return <Section title="Family Settings"><Empty title="Could not load the family settings" /></Section>;
    return <FamilySettingsDialog inline eventId={eventId} settings={query.data.settings} onClose={() => undefined} />;
}
