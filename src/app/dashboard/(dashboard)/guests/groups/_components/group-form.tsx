"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faPeopleGroup, faGear, faLightbulb, faCircleCheck, faEye,
    faLock, faGlobe, faCheck, faPalette, faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    useCreateGuestGroup, useUpdateGuestGroup, useGuestGroups,
    type GroupPayload,
} from "@/hooks/use-guests";
import { useEventHref } from "@/lib/event-workspace";

/**
 * Add / Edit Group.
 *
 * The live preview on the right is the point of the screen: colour and
 * visibility are choices with no obvious consequence until you see the chip
 * they produce, which is exactly how the group will appear in every picker and
 * on every guest row.
 */

const COLORS = [
    "#EC4899", "#A855F7", "#3B82F6", "#22C55E", "#EAB308",
    "#F97316", "#EF4444", "#64748B", "#06B6D4",
];

interface FormState {
    name: string;
    description: string;
    color: string;
    visibility: "private" | "public";
    is_default: boolean;
}

const EMPTY: FormState = {
    name: "",
    description: "",
    color: COLORS[0],
    visibility: "private",
    is_default: false,
};

export function GroupForm({ groupId }: { groupId?: number }) {
    const wsHref = useEventHref();
    const router = useRouter();
    const isEdit = !!groupId;

    const [form, setForm] = useState<FormState>(EMPTY);
    const [errors, setErrors] = useState<Record<string, boolean>>({});

    // The detail endpoint exists, but the list is already cached from the page
    // that linked here — reading it avoids a second round trip for one row.
    const groups = useGuestGroups({ limit: 100 });
    const existing = groups.data?.data.find((g) => g.id === groupId);

    const create = useCreateGuestGroup(() => router.push(wsHref("/dashboard/guests/groups")));
    const update = useUpdateGuestGroup(() => router.push(wsHref("/dashboard/guests/groups")));
    const saving = create.isPending || update.isPending;

    const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => (prev[key as string] ? { ...prev, [key]: false } : prev));
    };

    /** Prefill once — a background refetch must not discard what was typed. */
    const [prefilled, setPrefilled] = useState(false);
    useEffect(() => {
        if (!isEdit || prefilled || !existing) return;
        setPrefilled(true);
        setForm({
            name: existing.name,
            description: existing.description ?? "",
            color: existing.color ?? COLORS[0],
            visibility: existing.visibility,
            is_default: !!existing.is_default,
        });
    }, [isEdit, prefilled, existing]);

    const submit = () => {
        if (saving) return;
        if (!form.name.trim()) {
            setErrors({ name: true });
            toast.error("Please fill all mandatory fields.");
            return;
        }

        const payload: GroupPayload = {
            name: form.name.trim(),
            description: form.description.trim() || null,
            color: form.color,
            visibility: form.visibility,
            is_default: form.is_default,
        };

        if (isEdit && groupId) update.mutate({ id: groupId, data: payload });
        else create.mutate(payload);
    };

    if (isEdit && groups.isLoading) {
        return (
            <div className="flex flex-col gap-3.5">
                <Skeleton className="h-8 w-[200px]" />
                <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <Skeleton className="h-[360px] rounded-xl" />
                    <Skeleton className="h-[260px] rounded-xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3.5">
            <div className="min-w-0">
                <h1 className="text-[20px] font-bold leading-tight tracking-tight text-foreground">
                    {isEdit ? "Edit Group" : "Add New Group"}
                </h1>
                <p className="mt-1 text-[13.5px] text-muted-foreground">
                    {isEdit ? "Update this group’s details." : "Create a group to organize your guests easily."}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="flex min-w-0 flex-col gap-3.5">
                    {/* ── Group information ───────────────────────────────── */}
                    <Card className="border border-border py-0 shadow-none">
                        <CardContent className="p-3.5">
                            <div className="mb-3 flex items-center gap-2.5">
                                <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10">
                                    <FontAwesomeIcon icon={faPeopleGroup} className="!size-[12px] text-primary" />
                                </span>
                                <p className="text-[13.5px] font-bold text-foreground">Group Information</p>
                            </div>

                            <div className="flex flex-col gap-3.5">
                                <div className="flex flex-col gap-2">
                                    <Label className="text-[12.5px] font-medium">
                                        Group Name <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        value={form.name}
                                        onChange={(e) => setField("name", e.target.value.slice(0, 120))}
                                        placeholder="Enter group name"
                                        className={cn("h-10 rounded-md", errors.name && "border-destructive")}
                                    />
                                    <p className="text-[11.5px] text-muted-foreground">
                                        Choose a name that helps you identify this group.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-[12.5px] font-medium">Group Description (Optional)</Label>
                                    <Textarea
                                        value={form.description}
                                        onChange={(e) => setField("description", e.target.value.slice(0, 500))}
                                        placeholder="Add a short description about this group"
                                        className="min-h-[92px] rounded-md"
                                    />
                                    <p className="text-[11.5px] text-muted-foreground">
                                        This will help you and your team understand the purpose of this group.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-[12.5px] font-medium">Group Color</Label>
                                    <p className="text-[11.5px] text-muted-foreground">
                                        Choose a color to easily identify this group.
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-3">
                                        {COLORS.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setField("color", c)}
                                                aria-label={`Colour ${c}`}
                                                aria-pressed={form.color === c}
                                                style={{ backgroundColor: c }}
                                                className={cn(
                                                    "grid h-8 w-8 place-items-center rounded-full ring-offset-2 ring-offset-card transition-shadow",
                                                    form.color === c && "ring-2 ring-foreground/40"
                                                )}
                                            >
                                                {form.color === c && (
                                                    <FontAwesomeIcon icon={faCheck} className="!size-[11px] text-white" />
                                                )}
                                            </button>
                                        ))}
                                        {/* A free colour picker beside the swatches — the
                                            palette covers the common cases, this covers a
                                            brand colour the palette does not have. */}
                                        <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-border">
                                            <span
                                                className="absolute inset-0"
                                                style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
                                            />
                                            <input
                                                type="color"
                                                value={form.color}
                                                onChange={(e) => setField("color", e.target.value)}
                                                className="absolute inset-0 cursor-pointer opacity-0"
                                                aria-label="Custom group colour"
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── Group settings ──────────────────────────────────── */}
                    <Card className="border border-border py-0 shadow-none">
                        <CardContent className="p-3.5">
                            <div className="mb-3 flex items-center gap-2.5">
                                <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10">
                                    <FontAwesomeIcon icon={faGear} className="!size-[12px] text-primary" />
                                </span>
                                <p className="text-[13.5px] font-bold text-foreground">Group Settings</p>
                            </div>

                            <div className="grid gap-3.5 sm:grid-cols-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <Label className="text-[12.5px] font-medium">Make Group Default</Label>
                                        <p className="text-[11.5px] text-muted-foreground break-words">
                                            New guests will be added to this group by default.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={form.is_default}
                                        onCheckedChange={(v) => setField("is_default", v)}
                                        aria-label="Make this the default group"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-[12.5px] font-medium">Group Visibility</Label>
                                    <Select
                                        value={form.visibility}
                                        onValueChange={(v) => setField("visibility", v as "private" | "public")}
                                    >
                                        <SelectTrigger className="h-10 w-full rounded-md text-[13px]">
                                            <FontAwesomeIcon
                                                icon={form.visibility === "private" ? faLock : faGlobe}
                                                className="mr-2 !size-[12px] text-muted-foreground"
                                            />
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="private">Private (Only you can view)</SelectItem>
                                            <SelectItem value="public">Public (Visible to others)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11.5px] text-muted-foreground">
                                        You can change this later from group settings.
                                    </p>
                                </div>
                            </div>

                            {form.is_default && (
                                <p className="mt-3 rounded-md bg-primary/5 px-3 py-2 text-[11.5px] text-muted-foreground">
                                    {/* Saying it out loud beats a silent side effect on a
                                        group the user is not looking at. */}
                                    Only one group can be the default — setting this will clear it from any
                                    other group.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Button asChild variant="outline" className="h-10 rounded-md px-4 text-[13px] font-medium">
                            <Link href={wsHref("/dashboard/guests/groups")}>Cancel</Link>
                        </Button>
                        <Button onClick={submit} disabled={saving} className="h-10 rounded-md px-4 text-[13px] font-semibold">
                            {saving ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Create Group")}
                            {!saving && <FontAwesomeIcon icon={faPeopleGroup} className="ml-2 !size-[12px]" />}
                        </Button>
                    </div>
                </div>

                {/* ── Right rail ──────────────────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-3.5">
                    <Card className="border-primary/20 bg-primary/5 py-0 shadow-none">
                        <CardContent className="p-3.5">
                            <div className="mb-2 flex items-center gap-2">
                                <FontAwesomeIcon icon={faLightbulb} className="!size-[12px] text-primary" />
                                <p className="text-[12.5px] font-bold text-primary">Pro Tip</p>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                                Groups help you organize guests better. You can:
                            </p>
                            <ul className="mt-2 flex flex-col gap-1.5">
                                {[
                                    "Send messages to group members",
                                    "View group-wise RSVP reports",
                                    "Import guests directly into a group",
                                    "Filter your guest list by group",
                                ].map((line) => (
                                    <li key={line} className="flex items-start gap-2 text-[11.5px] text-muted-foreground">
                                        <FontAwesomeIcon icon={faCircleCheck} className="mt-0.5 !size-[10px] shrink-0 text-primary" />
                                        <span className="min-w-0 break-words">{line}</span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>

                    {/* Live preview — exactly how this group will render everywhere. */}
                    <Card className="border border-border py-0 shadow-none">
                        <CardContent className="p-3.5">
                            <div className="mb-3 flex items-center gap-2">
                                <FontAwesomeIcon icon={faEye} className="!size-[12px] text-muted-foreground" />
                                <p className="text-[13px] font-bold text-foreground">Group Preview</p>
                            </div>

                            <div className="flex flex-col items-center gap-2 pb-4 text-center">
                                <span
                                    className="grid h-14 w-14 place-items-center rounded-full"
                                    style={{ backgroundColor: `${form.color}1A` }}
                                >
                                    <FontAwesomeIcon icon={faPeopleGroup} className="!size-[18px]" style={{ color: form.color }} />
                                </span>
                                <p className="text-[13px] font-bold text-foreground break-words">
                                    {form.name.trim() || "Group Name"}
                                </p>
                                <span className="h-[3px] w-8 rounded-full" style={{ backgroundColor: form.color }} />
                                <p className="text-[11.5px] text-muted-foreground break-words">
                                    {form.description.trim() || "No description added"}
                                </p>
                            </div>

                            <Separator />

                            <dl className="flex flex-col gap-2.5 pt-3">
                                <PreviewRow icon={faUsers} label="Members" value={String(existing?.members_count ?? 0)} />
                                <PreviewRow
                                    icon={form.visibility === "private" ? faLock : faGlobe}
                                    label="Visibility"
                                    value={form.visibility === "private" ? "Private" : "Public"}
                                />
                                <div className="flex items-center justify-between gap-2">
                                    <dt className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                                        <FontAwesomeIcon icon={faPalette} className="!size-[11px]" />
                                        Color
                                    </dt>
                                    <dd>
                                        <span
                                            className="block h-4 w-4 rounded-full border border-border"
                                            style={{ backgroundColor: form.color }}
                                        />
                                    </dd>
                                </div>
                            </dl>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function PreviewRow({ icon, label, value }: { icon: typeof faUsers; label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                <FontAwesomeIcon icon={icon} className="!size-[11px]" />
                {label}
            </dt>
            <dd className="text-[12px] font-medium text-foreground">{value}</dd>
        </div>
    );
}
