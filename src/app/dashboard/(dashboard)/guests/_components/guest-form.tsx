"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faUser, faPeopleGroup, faCircleCheck,
    faPhone, faBuilding, faEnvelope, faPlus, faChevronDown, faLightbulb,
    faArrowRight, faMapLocationDot, faClipboardList, faUserPlus,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    useAllGuestGroups, useCreateGuest, useUpdateGuest, useGuest, useGuestCapacity,
    useGuestFormOptions,
    type GuestPayload,
} from "@/hooks/use-guests";
import { LocationPicker, locationPaths, useLocationId } from "@/components/common/location-picker";

/**
 * Add / Edit Guest — the same form for both.
 *
 * "Add More Details" is a COLLAPSIBLE section here rather than a second route.
 * The design shows it both ways (inline on Add Guest, and as its own
 * breadcrumbed step) but the fields are identical, and two pages editing one
 * record is how a field added to one goes missing from the other.
 *
 * ── STATUS AND RESPONSE ──────────────────────────────────────────────────────
 * The form offers both because they are two fields, and keeps them in step as
 * you change either — a guest must never read `Declined` beside a `Yes`. The
 * server enforces the same rule; this is the same decision made twice on
 * purpose, so the UI never shows a state the API would reject.
 */

const DIAL_CODES = ["+91", "+1", "+44", "+61", "+971", "+65"];

const TITLES = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];

interface FormState {
    group_id: string;
    title: string;
    date_of_birth: string;
    first_name: string;
    last_name: string;
    email: string;
    dial_code: string;
    mobile: string;
    whatsapp: string;
    company: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    dietary_preference: string;
    /** "" = none chosen. */
    food_preference_option_id: string;
    special_requirements: string;
    notes: string;
}

const EMPTY: FormState = {
    group_id: "", title: "", date_of_birth: "", first_name: "", last_name: "", email: "",
    dial_code: "+91", mobile: "", whatsapp: "", company: "",
    address_line1: "", address_line2: "", city: "", state: "", postal_code: "", country: "India",
    dietary_preference: "", food_preference_option_id: "", special_requirements: "", notes: "",
};

export function GuestForm({ guestId }: { guestId?: number }) {
    const router = useRouter();
    const isEdit = !!guestId;

    const [form, setForm] = useState<FormState>(EMPTY);
    const [errors, setErrors] = useState<Record<string, boolean>>({});
    const [detailsOpen, setDetailsOpen] = useState(false);

    const groups = useAllGuestGroups();
    const existing = useGuest(guestId ?? null);

    // The event the guest is added to — the Guests list passes it as ?event=.
    const eventParam = () => {
        if (typeof window === "undefined") return null;
        return Number(new URLSearchParams(window.location.search).get("event")) || null;
    };
    const create = useCreateGuest(() => {
        const ev = eventParam();
        router.push(ev ? `/dashboard/guests?event=${ev}` : "/dashboard/guests");
    });
    const update = useUpdateGuest(() => router.push("/dashboard/guests"));
    const saving = create.isPending || update.isPending;

    /*
      The plan caps guests IN TOTAL for the account — not per event — so the
      answer does not depend on which event is picked. Read from
      /client/guests/capacity, the server's own count, so the form blocks at
      exactly the number the save is refused at. Editing an existing guest adds
      nothing, so it is never blocked. When the account is full, GuestLimitGate
      stops this form opening at all.
    */
    const capacity = useGuestCapacity();
    const guestLimit = capacity.data?.limit ?? null;
    const guestLimitReached = !isEdit && !!capacity.data?.full;

    // Functional updater — a Select or a debounced field would otherwise write
    // back a stale snapshot of the whole form.
    const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => (prev[key as string] ? { ...prev, [key]: false } : prev));
    };

    /**
     * Dietary preference is chosen from the admin's Guest Food Preferences
     * list. A guest holds the option by id — or, from a CSV import or the old
     * typed box, by the words alone, which are matched to an option by name.
     * Words that match nothing stay shown and saved until another is chosen.
     */
    const formOptions = useGuestFormOptions();
    const foodOptions = formOptions.data?.food_preference_options ?? [];
    const chosenFood =
        foodOptions.find((o) => String(o.id) === form.food_preference_option_id) ??
        foodOptions.find((o) => o.name.toLowerCase() === form.dietary_preference.trim().toLowerCase()) ??
        null;

    /**
     * Country → State → City → PIN, each read from the Locations tables and
     * each depending on the one above. The guest stores the NAMES; these are
     * the table ids behind them — handed over by a pick, looked up by name
     * when an edit starts with names only.
     */
    const [picked, setPicked] = useState<{ country: number | null; state: number | null; city: number | null }>({
        country: null, state: null, city: null,
    });
    const countryId = useLocationId(locationPaths.countries(), form.country, picked.country);
    const stateId = useLocationId(countryId ? locationPaths.states(countryId) : null, form.state, picked.state);
    const cityId = useLocationId(stateId ? locationPaths.cities(stateId) : null, form.city, picked.city);

    /**
     * Prefill once. Without the guard this re-ran on every background refetch
     * and threw away whatever had been typed since.
     */
    const [prefilled, setPrefilled] = useState(false);
    useEffect(() => {
        if (!isEdit || prefilled || !existing.data) return;
        const g = existing.data;
        setPrefilled(true);
        setForm({
            group_id: g.group_id ? String(g.group_id) : "",
            title: g.title ?? "",
            // DATEONLY arrives as YYYY-MM-DD, which is what <input type="date"> takes.
            date_of_birth: g.date_of_birth ?? "",
            first_name: g.first_name ?? g.name ?? "",
            last_name: g.last_name ?? "",
            email: g.email ?? "",
            dial_code: g.dial_code || "+91",
            mobile: g.mobile ?? "",
            whatsapp: g.whatsapp ?? "",
            company: g.company ?? "",
            address_line1: g.address_line1 ?? "",
            address_line2: g.address_line2 ?? "",
            city: g.city ?? "",
            state: g.state ?? "",
            postal_code: g.postal_code ?? "",
            country: g.country ?? "India",
            dietary_preference: g.dietary_preference ?? "",
            food_preference_option_id: g.food_preference_option_id ? String(g.food_preference_option_id) : "",
            special_requirements: g.special_requirements ?? "",
            notes: g.notes ?? "",
        });
        // Open the extra section when it actually holds something, so an edit
        // does not hide half the record behind a collapsed header.
        if (g.address_line1 || g.city || g.dietary_preference || g.special_requirements || g.notes || g.date_of_birth) {
            setDetailsOpen(true);
        }
    }, [isEdit, prefilled, existing.data]);

    const selectedGroup = (groups.data ?? []).find((g) => String(g.id) === form.group_id);

    const validate = () => {
        const next: Record<string, boolean> = {};
        if (!form.first_name.trim()) next.first_name = true;
        // Mobile is mandatory, email optional: an invitation is shared to a
        // phone number, so that is the field a contact cannot be without.
        if (!form.mobile.trim()) next.mobile = true;
        if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) next.email = true;

        if (Object.keys(next).length) {
            setErrors(next);
            toast.error("Please fill all mandatory fields.");
            return false;
        }
        return true;
    };

    const submit = () => {
        if (saving || !validate()) return;

        const payload: GuestPayload = {
            group_id: form.group_id ? Number(form.group_id) : null,
            title: form.title || null,
            date_of_birth: form.date_of_birth || null,
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim() || null,
            email: form.email.trim() || null,
            dial_code: form.dial_code,
            mobile: form.mobile.trim(),
            whatsapp: form.whatsapp.trim() || null,
            company: form.company.trim() || null,
            address_line1: form.address_line1.trim() || null,
            address_line2: form.address_line2.trim() || null,
            city: form.city.trim() || null,
            state: form.state.trim() || null,
            postal_code: form.postal_code.trim() || null,
            country: form.country.trim() || null,
            // The chosen option's id and its words, both — the id joins back
            // to the admin's list, the words survive the option being renamed.
            food_preference_option_id: chosenFood?.id ?? null,
            dietary_preference: chosenFood?.name ?? (form.dietary_preference.trim() || null),
            special_requirements: form.special_requirements.trim() || null,
            notes: form.notes.trim() || null,
        };

        if (isEdit && guestId) update.mutate({ id: guestId, data: payload });
        else create.mutate({ ...payload, event_id: eventParam() });
    };

    if (isEdit && existing.isLoading) {
        return (
            <div className="flex flex-col gap-5">
                <Skeleton className="h-8 w-[200px]" />
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <Skeleton className="h-[420px] rounded-xl" />
                    <Skeleton className="h-[300px] rounded-xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="min-w-0">
                <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">
                    {isEdit ? "Edit Guest" : "Add Guest"}
                </h1>
                <p className="mt-1 text-[13.5px] text-muted-foreground">
                    {isEdit ? "Update this guest’s details." : "Add a new guest to your guest list."}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="flex min-w-0 flex-col gap-5">
                    {/* ── Guest information ───────────────────────────────── */}
                    <Card className="border border-border py-0 shadow-none">
                        <CardContent className="p-5">
                            <SectionHeader icon={faUser} title="Guest Information" />

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="First Name" required error={errors.first_name}>
                                    <Input
                                        value={form.first_name}
                                        onChange={(e) => setField("first_name", e.target.value.slice(0, 100))}
                                        placeholder="Enter first name"
                                        className={cn("h-11 rounded-md", errors.first_name && "border-destructive")}
                                    />
                                </Field>
                                <Field label="Last Name">
                                    <Input
                                        value={form.last_name}
                                        onChange={(e) => setField("last_name", e.target.value.slice(0, 100))}
                                        placeholder="Enter last name"
                                        className="h-11 rounded-md"
                                    />
                                </Field>

                                <Field label="Email Address" error={errors.email}>
                                    <div className="relative">
                                        <FontAwesomeIcon
                                            icon={faEnvelope}
                                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 !size-[12px] text-muted-foreground"
                                        />
                                        <Input
                                            type="email"
                                            value={form.email}
                                            onChange={(e) => setField("email", e.target.value.slice(0, 255))}
                                            placeholder="Enter email address"
                                            className={cn("h-11 rounded-md pl-9", errors.email && "border-destructive")}
                                        />
                                    </div>
                                </Field>

                                <Field label="Phone Number" required error={errors.mobile}>
                                    <div className="flex gap-2">
                                        <Select value={form.dial_code} onValueChange={(v) => setField("dial_code", v)}>
                                            <SelectTrigger className="h-11 w-[104px] shrink-0 rounded-md text-[13px]">
                                                <FontAwesomeIcon icon={faPhone} className="mr-1 !size-[11px] text-muted-foreground" />
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {DIAL_CODES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            value={form.mobile}
                                            // Digits only — a name in the phone box is
                                            // rejected by the server anyway, and stopping
                                            // it here beats a round trip to say so.
                                            onChange={(e) => setField("mobile", e.target.value.replace(/[^\d\s-]/g, "").slice(0, 20))}
                                            placeholder="Enter phone number"
                                            className={cn("h-11 min-w-0 flex-1 rounded-md", errors.mobile && "border-destructive")}
                                            inputMode="numeric"
                                        />
                                    </div>
                                </Field>

                                <Field label="Guest Group">
                                    <Select
                                        value={form.group_id || "none"}
                                        onValueChange={(v) => setField("group_id", v === "none" ? "" : v)}
                                    >
                                        <SelectTrigger className="h-11 w-full rounded-md text-[13px]">
                                            <FontAwesomeIcon icon={faPeopleGroup} className="mr-2 !size-[12px] text-muted-foreground" />
                                            <SelectValue placeholder="Select a group (optional)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No group</SelectItem>
                                            {(groups.data ?? []).map((g) => (
                                                <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>

                                <Field label="Company / Organization">
                                    <div className="relative">
                                        <FontAwesomeIcon
                                            icon={faBuilding}
                                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 !size-[12px] text-muted-foreground"
                                        />
                                        <Input
                                            value={form.company}
                                            onChange={(e) => setField("company", e.target.value.slice(0, 200))}
                                            placeholder="Enter company or organization"
                                            className="h-11 rounded-md pl-9"
                                        />
                                    </div>
                                </Field>
                            </div>

                            {/* ── Add More Details ────────────────────────── */}
                            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="mt-5">
                                <CollapsibleTrigger asChild>
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-3 rounded-md border border-dashed border-border px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                                    >
                                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10">
                                            <FontAwesomeIcon icon={faPlus} className="!size-[11px] text-primary" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[12.5px] font-semibold text-foreground">
                                                Add More Details (Optional)
                                            </span>
                                            <span className="block text-[11.5px] text-muted-foreground">
                                                Add address, title, date of birth, notes or any other information about this guest.
                                            </span>
                                        </span>
                                        <FontAwesomeIcon
                                            icon={faChevronDown}
                                            className={cn(
                                                "!size-[12px] shrink-0 text-muted-foreground transition-transform",
                                                detailsOpen && "rotate-180"
                                            )}
                                        />
                                    </button>
                                </CollapsibleTrigger>

                                <CollapsibleContent className="pt-5">
                                    <SectionHeader icon={faMapLocationDot} title="Address" />
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Field label="Address Line 1">
                                            <Input value={form.address_line1}
                                                onChange={(e) => setField("address_line1", e.target.value.slice(0, 255))}
                                                placeholder="House no., Building, Street" className="h-11 rounded-md" />
                                        </Field>
                                        <Field label="Address Line 2 (Optional)">
                                            <Input value={form.address_line2}
                                                onChange={(e) => setField("address_line2", e.target.value.slice(0, 255))}
                                                placeholder="Apartment, Suite, Floor, etc." className="h-11 rounded-md" />
                                        </Field>
                                        {/* Country first: each field below reads the list
                                            of the one above, and changing one clears those
                                            below it. */}
                                        <Field label="Country">
                                            <LocationPicker
                                                value={form.country}
                                                placeholder="Select country"
                                                path={locationPaths.countries()}
                                                onPick={(row) => {
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        country: row.name.slice(0, 100),
                                                        state: "", city: "", postal_code: "",
                                                    }));
                                                    setPicked({ country: row.id || null, state: null, city: null });
                                                }}
                                            />
                                        </Field>
                                        <Field label="State / Province">
                                            <LocationPicker
                                                value={form.state}
                                                placeholder="Select state"
                                                path={countryId ? locationPaths.states(countryId) : null}
                                                needs={form.country.trim() ? null : "Select a country first."}
                                                onPick={(row) => {
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        state: row.name.slice(0, 120),
                                                        city: "", postal_code: "",
                                                    }));
                                                    setPicked((prev) => ({ ...prev, state: row.id || null, city: null }));
                                                }}
                                            />
                                        </Field>
                                        <Field label="City">
                                            <LocationPicker
                                                value={form.city}
                                                placeholder="Select city"
                                                path={stateId ? locationPaths.cities(stateId) : null}
                                                needs={form.state.trim() ? null : "Select a state first."}
                                                onPick={(row) => {
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        city: row.name.slice(0, 120),
                                                        postal_code: "",
                                                    }));
                                                    setPicked((prev) => ({ ...prev, city: row.id || null }));
                                                }}
                                            />
                                        </Field>
                                        <Field label="PIN / Zip Code">
                                            <LocationPicker
                                                value={form.postal_code}
                                                placeholder="Select PIN / Zip code"
                                                searchPlaceholder="Search by area or PIN code"
                                                showPincode
                                                path={cityId ? locationPaths.pincodes(cityId) : null}
                                                needs={form.city.trim() ? null : "Select a city first."}
                                                onPick={(row) =>
                                                    setField(
                                                        "postal_code",
                                                        (row.pincode || row.name).replace(/[^\dA-Za-z\s-]/g, "").slice(0, 20)
                                                    )
                                                }
                                            />
                                        </Field>
                                    </div>

                                    <Separator className="my-5" />
                                    <SectionHeader icon={faClipboardList} title="Additional Information" />

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Field label="Title / Salutation">
                                            <Select value={form.title || "none"}
                                                onValueChange={(v) => setField("title", v === "none" ? "" : v)}>
                                                <SelectTrigger className="h-11 w-full rounded-md text-[13px]">
                                                    <SelectValue placeholder="Select (Optional)" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Not set</SelectItem>
                                                    {TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </Field>

                                        <Field label="Date of Birth (Optional)">
                                            {/* max = today: the server refuses a future date too. */}
                                            <Input type="date" value={form.date_of_birth}
                                                max={new Date().toISOString().slice(0, 10)}
                                                onChange={(e) => setField("date_of_birth", e.target.value)}
                                                className="h-11 rounded-md" />
                                        </Field>

                                        <Field label="Dietary Preference (Optional)">
                                            <Select
                                                value={chosenFood ? String(chosenFood.id) : "none"}
                                                onValueChange={(v) => {
                                                    const option = foodOptions.find((o) => String(o.id) === v);
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        food_preference_option_id: option ? String(option.id) : "",
                                                        dietary_preference: option?.name ?? "",
                                                    }));
                                                }}
                                            >
                                                <SelectTrigger className="h-11 w-full rounded-md text-[13px]">
                                                    <SelectValue
                                                        placeholder={
                                                            formOptions.isLoading
                                                                ? "Loading..."
                                                                : foodOptions.length === 0
                                                                    ? "No dietary preferences set up"
                                                                    : "Select dietary preference"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {/* Words stored earlier that match no option
                                                        read as "Not set" would lose them, so they
                                                        are named here until another is chosen. */}
                                                    <SelectItem value="none">
                                                        {!chosenFood && form.dietary_preference.trim()
                                                            ? form.dietary_preference.trim()
                                                            : "Not set"}
                                                    </SelectItem>
                                                    {foodOptions.map((o) => (
                                                        <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </Field>

                                        <Field label="Notes (Optional)">
                                            <Textarea value={form.notes}
                                                onChange={(e) => setField("notes", e.target.value.slice(0, 300))}
                                                placeholder="Add any notes about this guest..."
                                                className="min-h-[84px] rounded-md" />
                                            <Counter value={form.notes.length} max={300} />
                                        </Field>

                                        <Field label="Special Requirements (Optional)">
                                            <Textarea value={form.special_requirements}
                                                onChange={(e) => setField("special_requirements", e.target.value.slice(0, 500))}
                                                placeholder="E.g., Accessibility, Seating preference..."
                                                className="min-h-[84px] rounded-md" />
                                        </Field>
                                    </div>

                                </CollapsibleContent>
                            </Collapsible>
                        </CardContent>
                    </Card>

                    {/*
                      No RSVP here: a guest is a phone-book CONTACT (§581). RSVP,
                      party size and table belong to a participant of one event,
                      and are set on the RSVP screen once they join.
                    */}
                    {guestLimitReached && (
                        <p className="rounded-md bg-destructive/10 p-2.5 text-[12.5px] text-destructive">
                            Your plan allows {guestLimit} guests in total and you have reached that limit.
                            Remove a guest or upgrade your plan to add more.
                        </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Button asChild variant="outline" className="h-11 rounded-md px-5 text-[13px] font-medium">
                            <Link href="/dashboard/guests">Cancel</Link>
                        </Button>
                        <Button onClick={submit} disabled={saving || guestLimitReached} className="h-11 rounded-md px-6 text-[13px] font-semibold">
                            {saving ? (isEdit ? "Saving..." : "Adding...") : (isEdit ? "Save Changes" : "Add Guest")}
                            {!saving && <FontAwesomeIcon icon={faUserPlus} className="ml-2 !size-[12px]" />}
                        </Button>
                    </div>
                </div>

                {/* ── Right rail ──────────────────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-5">
                    <Card className="border border-border py-0 shadow-none">
                        <CardContent className="p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10">
                                    <FontAwesomeIcon icon={faUser} className="!size-[11px] text-primary" />
                                </span>
                                <p className="text-[13px] font-bold text-foreground">Guest Summary</p>
                            </div>

                            <dl className="flex flex-col gap-2.5">
                                <SummaryRow icon={faPeopleGroup} label="Group" value={selectedGroup?.name ?? "Not selected"} />
                            </dl>
                        </CardContent>
                    </Card>

                    <Card className="border border-border py-0 shadow-none">
                        <CardContent className="p-4">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <p className="text-[13px] font-bold text-foreground">Guest Groups</p>
                                <Link href="/dashboard/guests/groups/add"
                                    className="shrink-0 text-[11.5px] font-semibold text-primary hover:underline">
                                    + Add Group
                                </Link>
                            </div>

                            {groups.isLoading ? (
                                <div className="flex flex-col gap-2">
                                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-md" />)}
                                </div>
                            ) : (groups.data ?? []).length === 0 ? (
                                <p className="py-2 text-[12px] text-muted-foreground">No groups yet.</p>
                            ) : (
                                <ul className="flex flex-col gap-2">
                                    {(groups.data ?? []).slice(0, 5).map((g) => (
                                        <li key={g.id}>
                                            <button
                                                type="button"
                                                onClick={() => setField("group_id", String(g.id))}
                                                className={cn(
                                                    "flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted/50",
                                                    form.group_id === String(g.id) && "bg-primary/10"
                                                )}
                                            >
                                                <Avatar className="h-7 w-7">
                                                    <AvatarFallback
                                                        className="text-[10px] font-bold"
                                                        style={{ backgroundColor: `${g.color ?? "#CBD5E1"}1A`, color: g.color ?? "#64748B" }}
                                                    >
                                                        {g.name.slice(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">{g.name}</span>
                                                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                                    {g.members_count}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <Separator className="my-3" />
                            <Link href="/dashboard/guests/groups"
                                className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline">
                                View All Groups
                                <FontAwesomeIcon icon={faArrowRight} className="!size-[9px]" />
                            </Link>
                        </CardContent>
                    </Card>

                    <Card className="border-primary/20 bg-primary/5 py-0 shadow-none">
                        <CardContent className="p-4">
                            <div className="mb-2 flex items-center gap-2">
                                <FontAwesomeIcon icon={faLightbulb} className="!size-[12px] text-primary" />
                                <p className="text-[12.5px] font-bold text-primary">Pro Tip</p>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                                Add guests in bulk by importing from a CSV file.
                            </p>
                            <Button asChild variant="outline" size="sm"
                                className="mt-3 h-8 w-full rounded-md border-primary/40 text-[12px] font-semibold text-primary hover:bg-primary/10 hover:text-primary">
                                <Link href="/dashboard/guests/import">
                                    Import Guests
                                    <FontAwesomeIcon icon={faArrowRight} className="ml-1.5 !size-[10px]" />
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

/* ── building blocks ────────────────────────────────────────────────────── */

function SectionHeader({ icon, title }: { icon: typeof faUser; title: string }) {
    return (
        <div className="mb-4 flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10">
                <FontAwesomeIcon icon={icon} className="!size-[12px] text-primary" />
            </span>
            <p className="text-[13.5px] font-bold text-foreground">{title}</p>
        </div>
    );
}

function Field({
    label, required, error, children,
}: {
    label: string; required?: boolean; error?: boolean; children: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <Label className="text-[12.5px] font-medium">
                {label} {required && <span className="text-destructive">*</span>}
            </Label>
            {children}
            {error && <span className="text-[11px] text-destructive">This field is required.</span>}
        </div>
    );
}

function Counter({ value, max }: { value: number; max: number }) {
    return (
        <span className={cn("mt-1 self-end text-[11px]", value >= max ? "text-destructive" : "text-muted-foreground")}>
            {value}/{max}
        </span>
    );
}

function SummaryRow({ icon, label, value }: { icon: typeof faUser; label: string; value: string }) {
    return (
        <div className="flex items-start gap-2.5">
            <FontAwesomeIcon icon={icon} className="mt-0.5 !size-[11px] shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="text-[12px] font-medium text-foreground break-words">{value}</dd>
            </div>
        </div>
    );
}
