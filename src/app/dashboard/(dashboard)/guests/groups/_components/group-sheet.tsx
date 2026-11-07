"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Globe, Lock, Pencil, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CharCount, FormField, FormPanel } from "@/components/module-kit";
import { cn } from "@/lib/utils";
import { useCreateGuestGroup, useUpdateGuestGroup, type GroupPayload, type GuestGroup } from "@/hooks/use-guests";

const COLORS = ["#EC4899", "#A855F7", "#3B82F6", "#22C55E", "#EAB308", "#F97316", "#EF4444", "#64748B", "#06B6D4"];

/**
 * Add Group / Edit Group as the module's slide-in panel — the same panel as Add Guest
 * (Jamal, 2026-11-07; was its own page). Fields: Name *, Description, Colour, Default, Visibility.
 */
export function GroupSheet({ group, onClose, onSaved }: { group?: GuestGroup | null; onClose: () => void; onSaved?: () => void }) {
    const isEdit = !!group;
    const [name, setName] = useState(group?.name ?? "");
    const [description, setDescription] = useState(group?.description ?? "");
    const [color, setColor] = useState(group?.color ?? COLORS[0]);
    const [visibility, setVisibility] = useState<"private" | "public">(group?.visibility ?? "private");
    const [isDefault, setIsDefault] = useState(!!group?.is_default);
    const [error, setError] = useState(false);
    const done = () => { onSaved?.(); onClose(); };
    const create = useCreateGuestGroup(done);
    const update = useUpdateGuestGroup(done);
    const saving = create.isPending || update.isPending;

    const save = () => {
        if (saving) return;
        if (!name.trim()) { setError(true); toast.error("Please enter the group name."); return; }
        const payload: GroupPayload = {
            name: name.trim(), description: description.trim() || null, color, visibility, is_default: isDefault,
        };
        if (isEdit && group) update.mutate({ id: group.id, data: payload });
        else create.mutate(payload);
    };

    return (
        <FormPanel
            icon={isEdit ? Pencil : UsersRound} title={isEdit ? "Edit Group" : "Add Group"}
            subtitle={isEdit ? "Update this group's details." : "Create a group to organize your guests easily."}
            sheet={{ open: true, onClose }}
            footer={(
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={saving} onClick={save}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Create Group"}</Button>
                </>
            )}
        >
            {/* Preview — how the group chip looks everywhere. */}
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${color}1A` }}>
                    <UsersRound className="size-5" style={{ color }} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold">{name.trim() || "Group Name"}</p>
                    <p className="truncate text-[11.5px] text-muted-foreground">{description.trim() || "No description added"}</p>
                </div>
                <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                    {visibility === "private" ? <Lock className="size-3.5" /> : <Globe className="size-3.5" />} {visibility === "private" ? "Private" : "Public"}
                </span>
            </div>

            <FormField label="Group Name" required>
                <Input value={name} maxLength={120} placeholder="Enter group name" onChange={(e) => { setName(e.target.value); setError(false); }}
                    className={cn("h-9", error && "border-destructive")} />
            </FormField>
            <FormField label="Description" hint=" (Optional)">
                <Textarea value={description} maxLength={500} rows={3} placeholder="Add a short description about this group" onChange={(e) => setDescription(e.target.value)} />
                <CharCount value={description} max={500} />
            </FormField>
            <FormField label="Group Color">
                <div className="flex flex-wrap items-center gap-2.5">
                    {COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} style={{ backgroundColor: c }}
                            className={cn("grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-card transition-shadow", color === c && "ring-2 ring-foreground/40")}>
                            {color === c && <Check className="size-3.5 text-white" />}
                        </button>
                    ))}
                    <label className="relative size-7 cursor-pointer overflow-hidden rounded-full border border-border" title="Custom colour">
                        <span className="absolute inset-0" style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }} />
                        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom group colour" />
                    </label>
                </div>
            </FormField>
            <FormField label="Group Visibility">
                <Select value={visibility} onValueChange={(v) => setVisibility(v as "private" | "public")}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="private">Private (Only you can view)</SelectItem>
                        <SelectItem value="public">Public (Visible to others)</SelectItem>
                    </SelectContent>
                </Select>
            </FormField>
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold">Make Group Default</p>
                    <p className="text-[11.5px] text-muted-foreground">New guests are added to this group by default. Only one group can be the default.</p>
                </div>
                <Switch checked={isDefault} onCheckedChange={setIsDefault} aria-label="Make this the default group" />
            </div>
        </FormPanel>
    );
}
