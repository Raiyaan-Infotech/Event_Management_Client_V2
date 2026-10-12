"use client";

import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSetMenuShown } from "@/hooks/use-event-modules";

/**
 * Small pieces shared by the event modules (Agenda, Family, Gallery, Settings).
 */

/** A titled card, the same chrome as the event detail's own panels. */
export function Section({
    title, action, children, className,
}: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <Card className={cn("min-w-0 border border-border py-0 shadow-none", className)}>
            <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-bold text-foreground">{title}</p>
                    {action}
                </div>
                <Separator className="my-3" />
                {children}
            </CardContent>
        </Card>
    );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-[13px] font-semibold text-foreground">{title}</p>
            {children && <p className="max-w-[360px] text-[12px] text-muted-foreground">{children}</p>}
        </div>
    );
}

export function PanelLoading() {
    return (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
        </div>
    );
}

export function FieldError({ show }: { show: boolean }) {
    return show ? <p className="text-[11.5px] text-destructive">This field is required</p> : null;
}

/** A labelled switch row. */
export function SwitchRow({
    id, label, hint, checked, onChange, disabled,
}: {
    id: string; label: string; hint?: string; checked: boolean;
    onChange: (v: boolean) => void; disabled?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
                <Label htmlFor={id} className="text-[13px] font-medium">{label}</Label>
                {hint && <p className="text-[11.5px] text-muted-foreground">{hint}</p>}
            </div>
            <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
        </div>
    );
}

/**
 * "Show in Event App" — the module's MENU in the event's `menu_ids`, saved with
 * the normal event update, exactly like the app. A Default menu is locked on.
 */
export function ShowInAppRow({
    eventId, menuIds, menuId, isDefault, show, label,
}: {
    eventId: number; menuIds: number[]; menuId: number | null;
    isDefault: boolean; show: boolean; label: string;
}) {
    const toggle = useSetMenuShown(eventId, menuIds);
    return (
        <SwitchRow
            id={`show-${label}`}
            label="Show in Event App"
            hint={isDefault ? `Always on — ${label} is a default menu` : `Make the ${label.toLowerCase()} section visible to all guests`}
            checked={show}
            disabled={isDefault || menuId === null || toggle.isPending}
            onChange={(v) => menuId !== null && toggle.mutate({ menuId, show: v })}
        />
    );
}
