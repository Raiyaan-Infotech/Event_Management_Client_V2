"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    CheckCircle2, Clock, Download, Eye, EyeOff, FileUp, Mail, Pencil, Star, Trash2, User, UserPlus, Users, UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    CheckChoices, ChoiceRadio, CountTabs, FormField, FormPanel, ListCard, ModuleHeader, OverviewCard, Pager, PersonCell,
    PhotoDropzone, RowActions, SearchBox, SortSelect, StarBadge, StatTile, StatusPill, SwitchField, Toolbar,
} from "@/components/module-kit";
import { SignInPrompt } from "@/components/common/sign-in-prompt";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    useBulkGuests, useCreateGuest, useExportGuests, useGuestCapacity, useGuests, useGuestStats, useUpdateGuest,
    type Guest, type GuestListParams,
} from "@/hooks/use-guests";
import { CHANNELS, GuestFields, blankDraft, draftError, payloadOf, useRelationsFor, type GuestDraft } from "./guest-fields";
import { GuestActionSheet, StatusPillFor, guestMenu, sideLabel, type GuestAction } from "./guest-actions";
import { useEventHref } from "@/lib/event-workspace";

/**
 * Event Guests — Jamal's web design (2026-11-04), built from the module kit:
 *   · "Event Guests" + Guest Overview (Total, Invited, Confirmed, Pending RSVP);
 *   · tabs All Guests / Bride Side / Groom Side / VIP / Hidden, search, Sort by;
 *   · Guest List (photo, name + VIP, relationship, side, invite count, RSVP
 *     status, app visibility, ⋯ = View / Edit / Send Invitation / View RSVP
 *     Response / Mark as VIP / Hide / Delete — each a slide-in panel);
 *   · right: Add Guest (type, name, mobile, email, relationship, side, invite
 *     count, address, notes, photo, RSVP Required, Visibility, VIP, Send
 *     Invitation via). Saving with channels marks the guest invited and offers
 *     to open WhatsApp / Email with the message.
 * Kept from before, as header buttons: Import, Export, Manage Groups.
 * Not in the design, so gone: the group filter and the bulk checkboxes.
 */

type Tab = "all" | "bride" | "groom" | "vip" | "hidden";
type Sort = NonNullable<GuestListParams["sort"]>;
const PAGE = 10;
const SORTS: { value: Sort; label: string }[] = [
    { value: "name_asc", label: "Sort by Name (A – Z)" },
    { value: "name_desc", label: "Sort by Name (Z – A)" },
    { value: "recent", label: "Sort by Recently Added" },
    { value: "oldest", label: "Sort by Oldest First" },
    { value: "invite_count", label: "Sort by Invite Count" },
];

export function GuestsView({ eventId }: { eventId: number }) {
    const wsHref = useEventHref();
    const [tab, setTab] = useState<Tab>("all");
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [sort, setSort] = useState<Sort>("name_asc");
    const [page, setPage] = useState(1);
    const [action, setAction] = useState<{ a: GuestAction; g: Guest } | null>(null);
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    const params = useMemo<GuestListParams>(() => ({
        event_id: eventId, search: debounced || undefined, sort, page, limit: PAGE,
        ...(tab === "bride" || tab === "groom" ? { side: tab } : {}),
        ...(tab === "vip" ? { vip: true } : {}),
        ...(tab === "hidden" ? { visibility: "hidden" as const } : {}),
    }), [eventId, debounced, sort, page, tab]);

    const guests = useGuests(params);
    const stats = useGuestStats(eventId);
    const exportGuests = useExportGuests();
    const update = useUpdateGuest();

    const rows = guests.data?.data ?? [];
    const total = guests.data?.pagination?.totalItems ?? 0;
    const s = stats.data;
    const st = (k: "added" | "invited" | "pending" | "confirmed" | "declined") => s?.statuses?.[k] ?? 0;
    const all = s?.total_guests ?? 0;
    const authError = (guests.error instanceof ApiError && guests.error.isAuthError) || (stats.error instanceof ApiError && stats.error.isAuthError);

    // Selected guest kept fresh after a save (the list refetches).
    const current = action ? (rows.find((g) => g.id === action.g.id) ?? action.g) : null;
    const open = (a: GuestAction, g: Guest) => setAction({ a, g });

    return (
        <div className="flex flex-col gap-4">
                <ModuleHeader
                    title="Event Guests"
                    subtitle="Manage guest information, invitation status, and RSVP tracking."
                    actions={(
                        <>
                            <Button asChild variant="outline" size="sm"><Link href={wsHref(`/dashboard/guests/import?event=${eventId}`)}><FileUp className="size-3.5" /> Import</Link></Button>
                            <Button variant="outline" size="sm" disabled={exportGuests.isPending || all === 0} onClick={() => exportGuests.mutate({ event_id: eventId })}>
                                <Download className="size-3.5" /> {exportGuests.isPending ? "Exporting…" : "Export"}
                            </Button>
                            <Button asChild variant="outline" size="sm"><Link href={wsHref("/dashboard/guests/groups")}><UsersRound className="size-3.5" /> Manage Groups</Link></Button>
                            <Button size="sm" onClick={() => setAdding(true)}><UserPlus className="size-3.5" /> Add Guest</Button>
                        </>
                    )}
                />

                {authError && (
                    <div className="rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-[12.5px]">
                        <p className="font-semibold">You are not signed in</p>
                        <p className="text-muted-foreground">Your session has ended. Sign in again to carry on.</p>
                        <SignInPrompt className="mt-2.5" />
                    </div>
                )}

                <OverviewCard title="Guest Overview" icon={Users}>
                    <StatTile icon={Users} value={all} label="Total Guests" tone="primary" />
                    <StatTile icon={Mail} value={all - st("added")} label="Invited" tone="violet" />
                    <StatTile icon={CheckCircle2} value={st("confirmed")} label="Confirmed" tone="success" />
                    <StatTile icon={Clock} value={st("invited") + st("pending")} label="Pending RSVP" tone="warning" />
                </OverviewCard>

                <CountTabs<Tab>
                    value={tab} onChange={(v) => { setTab(v); setPage(1); }}
                    tabs={[
                        { value: "all", label: "All Guests", count: all },
                        { value: "bride", label: "Bride Side", count: s?.bride ?? 0, icon: User },
                        { value: "groom", label: "Groom Side", count: s?.groom ?? 0, icon: User },
                        { value: "vip", label: "VIP", count: s?.vip ?? 0, icon: Star },
                        { value: "hidden", label: "Hidden", count: s?.hidden ?? 0, icon: EyeOff },
                    ]}
                />

                <Toolbar>
                    <SearchBox value={search} onChange={setSearch} placeholder="Search guests by name, relationship, or mobile..." />
                    <SortSelect value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORTS} />
                </Toolbar>

                <ListCard icon={Users} title="Guest List" count={total} note="Showing all guests for this event.">
                    {guests.isLoading ? (
                        <div className="flex flex-col gap-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
                    ) : guests.isError && !authError ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center">
                            <p className="text-[14px] font-semibold">Could not load your guests</p>
                            <Button variant="outline" size="sm" onClick={() => guests.refetch()}>Try again</Button>
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="flex flex-col items-center gap-1 py-10 text-center">
                            <p className="text-[14px] font-semibold">No guests here</p>
                            <p className="text-[13px] text-muted-foreground">{debounced || tab !== "all" ? "Try another tab or search." : "Add your first guest with the form."}</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            {/* Fits the column beside the form — no fixed min width (Jamal, 2026-11-04).
                                Under xl the Relationship column folds under the name. */}
                            <table className="w-full border-collapse text-[12px]">
                                <thead>
                                    <tr className="border-b border-border text-[11.5px] font-semibold text-foreground/80">
                                        <th className="py-2 pr-2 pl-3 text-left font-semibold">Guest Name</th>
                                        <th className="hidden py-2 pr-2 text-left font-semibold xl:table-cell">Relationship</th>
                                        <th className="py-2 pr-2 text-left font-semibold">Side</th>
                                        <th className="py-2 pr-2 text-center font-semibold whitespace-nowrap">Invite Count</th>
                                        <th className="py-2 pr-2 text-left font-semibold">RSVP Status</th>
                                        <th className="py-2 pr-2 text-left font-semibold whitespace-nowrap">App Visibility</th>
                                        <th className="py-2 pr-3 text-center font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((g) => (
                                        <tr key={g.id} className={cn("border-b border-border last:border-0 hover:bg-muted/30", current?.id === g.id && "bg-primary/5")}>
                                            <td className="py-1.5 pr-2 pl-3">
                                                <PersonCell name={g.name} photo={g.photo} onClick={() => open("view", g)}
                                                    sub={g.relationship ? <span className="xl:hidden">{g.relationship}</span> : undefined}
                                                    badge={g.is_vip ? <StarBadge>{g.vip_label && g.vip_label.length <= 12 ? g.vip_label : "VIP"}</StarBadge> : undefined} />
                                            </td>
                                            <td className="hidden py-1.5 pr-2 xl:table-cell">{g.relationship || "—"}</td>
                                            <td className="py-1.5 pr-2">
                                                {g.side ? <StatusPill tone={g.side === "bride" ? "primary" : "violet"}>{sideLabel(g.side)}</StatusPill> : "—"}
                                            </td>
                                            <td className="py-1.5 pr-2 text-center"><span className="inline-flex items-center gap-1"><Users className="size-3.5 text-muted-foreground" /> {g.invite_count ?? 1}</span></td>
                                            <td className="py-1.5 pr-2"><StatusPillFor status={g.status} /></td>
                                            <td className="py-1.5 pr-2">
                                                {g.is_visible === false
                                                    ? <StatusPill tone="muted" icon={EyeOff}>Hidden</StatusPill>
                                                    : <StatusPill tone="success" icon={Eye}>Visible</StatusPill>}
                                            </td>
                                            <td className="py-1.5 pr-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11.5px]" onClick={() => open("edit", g)}>
                                                        <Pencil className="size-3" /> Edit
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="h-7 gap-1 border-destructive/40 px-2 text-[11.5px] text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => open("delete", g)}>
                                                        <Trash2 className="size-3" /> Delete
                                                    </Button>
                                                    {/* The other actions (View, Send Invitation, RSVP, VIP, Hide). */}
                                                    <RowActions compact label={`More actions for ${g.name}`}
                                                        items={guestMenu(g, (x) => open(x, g), () => update.mutate({ id: g.id, data: { is_visible: true } }))
                                                            .filter((i) => i.label !== "Edit Guest" && i.label !== "Delete Guest")} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </ListCard>

                <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} noun="guests" />

            {/* Forms and actions open as slide-in panels (Jamal, 2026-11-04). */}
            {adding && <AddGuestPanel eventId={eventId} onClose={() => setAdding(false)} />}
            <GuestActionSheet
                action={action?.a ?? null} guest={current} eventId={eventId}
                onClose={() => setAction(null)}
                onSwitch={(a) => setAction((x) => (x ? { ...x, a } : x))}
            />

        </div>
    );
}

/** Add Guest — a slide-in panel from the header's Add Guest button. */
function AddGuestPanel({ eventId, onClose }: { eventId: number; onClose: () => void }) {
    const capacity = useGuestCapacity();
    const bulk = useBulkGuests();
    const [d, setD] = useState<GuestDraft>(blankDraft);
    const [tried, setTried] = useState(false);
    const set = (p: Partial<GuestDraft>) => setD((x) => ({ ...x, ...p }));
    const rel = useRelationsFor(d.side, d.relation);
    const clear = () => { setD(blankDraft()); setTried(false); };
    const create = useCreateGuest((g) => {
        // "Send Invitation via": mark invited with the channels, then offer to open them (a click, so it is not blocked).
        const channels = d.channels;
        if (!channels.length) { clear(); return onClose(); }
        const message = `Dear ${g.name.split(/\s+/)[0]}, you are warmly invited to our event. We look forward to celebrating with you!`;
        bulk.mutate({ guest_ids: [g.id], action: "invite", value: { channels, message } });
        const phone = `${g.dial_code || "+91"}${g.mobile ?? ""}`.replace(/\D/g, "");
        if (channels.includes("whatsapp") && g.mobile) {
            toast("Send the invitation on WhatsApp", { action: { label: "Open WhatsApp", onClick: () => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank") }, duration: 10000 });
        }
        if (channels.includes("email") && g.email) {
            toast("Send the invitation by email", { action: { label: "Open Email", onClick: () => { window.location.href = `mailto:${g.email}?subject=${encodeURIComponent("You're Invited")}&body=${encodeURIComponent(message)}`; } }, duration: 10000 });
        }
        clear();
        onClose();
    });
    const full = capacity.data && capacity.data.limit !== null && capacity.data.used >= capacity.data.limit;

    const save = () => {
        setTried(true);
        const err = draftError(d, { needChannel: true });
        if (err) return toast.error(err);
        create.mutate({ ...payloadOf(d, rel.idOf(d.relation)), event_id: eventId } as Parameters<typeof create.mutate>[0]);
    };

    return (
        <FormPanel
            icon={UserPlus} title="Add Guest" subtitle="Add a guest to this event and send the invitation" sheet={{ open: true, onClose }}
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={create.isPending || bulk.isPending || !!full} onClick={save}>Save Guest</Button>
                </>
            )}
        >
            {full && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-[12px]">
                    Guest limit reached ({capacity.data?.used} of {capacity.data?.limit}). <Link href="/dashboard/billing" className="font-semibold text-primary">Upgrade your plan</Link> to add more.
                </p>
            )}
            <GuestFields d={d} set={set} tried={tried} />
            <FormField label="Photo Upload">
                <PhotoDropzone value={d.photo} onChange={(url) => set({ photo: url })} recommend={null} />
            </FormField>
            <SwitchField id="guest-rsvp" label="RSVP Required" hint="Ask this guest to confirm their attendance." checked={d.rsvpRequired} onChange={(v) => set({ rsvpRequired: v })} />
            <FormField label="Visibility" required note="Control whether this guest appears in the event app guest list.">
                <ChoiceRadio name="guest-visibility" value={d.visible} onChange={(v) => set({ visible: v })}
                    options={[{ value: true, label: "Show in App" }, { value: false, label: "Hide from App" }]} />
            </FormField>
            <SwitchField id="guest-vip" label="Mark as VIP Guest" hint="Highlight as a VIP guest (e.g. close family, special guest, etc.)." checked={d.vip} onChange={(v) => set({ vip: v })} />
            <FormField label="Send Invitation via" required note="Select one or more channels to send the invitation.">
                <CheckChoices value={d.channels} onChange={(v) => set({ channels: v })} options={CHANNELS} />
            </FormField>
        </FormPanel>
    );
}
