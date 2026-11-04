"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CloudUpload, Info, Minus, Plus, type LucideIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageCropDialog } from "@/components/common/image-crop-dialog";
import { useUploadPhoto } from "@/hooks/use-event-modules";
import { mediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";

/** Label (red * when required, grey "(Optional)" hint) above a control, optional note under it. */
export function FormField({
    label, required, hint, note, children, className,
}: { label: string; required?: boolean; hint?: string; note?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
            <Label className="text-[13px] font-semibold">
                {label}{required && <span className="text-destructive">*</span>}
                {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
            </Label>
            {children}
            {note && <FieldNote>{note}</FieldNote>}
        </div>
    );
}

/** ⓘ grey help line under a field. */
export function FieldNote({ children }: { children: React.ReactNode }) {
    return <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Info className="size-3.5 shrink-0" /> {children}</p>;
}

/** The pink ⓘ side note next to a field ("Choose the guest type based on…"). */
export function SideNote({ children }: { children: React.ReactNode }) {
    return (
        <p className="flex gap-1.5 rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-2 text-[11.5px] text-foreground/75">
            <Info className="mt-px size-3.5 shrink-0 text-primary" /> {children}
        </p>
    );
}

/** "0/500" under a text box. */
export const CharCount = ({ value, max }: { value: string; max: number }) => (
    <p className="text-right text-[11px] text-muted-foreground">{value.length}/{max}</p>
);

/** − 1 + */
export function NumberStepper({
    value, onChange, min = 1, max = 99, invalid,
}: { value: number; onChange: (n: number) => void; min?: number; max?: number; invalid?: boolean }) {
    const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
    return (
        <div className={cn("flex h-9 items-stretch overflow-hidden rounded-md border", invalid ? "border-destructive" : "border-input")}>
            <button type="button" aria-label="Less" className="grid w-9 place-items-center text-primary hover:bg-muted disabled:opacity-40"
                disabled={value <= min} onClick={() => onChange(clamp(value - 1))}><Minus className="size-4" /></button>
            <input
                type="number" value={value} min={min} max={max}
                onChange={(e) => onChange(clamp(Number(e.target.value)))}
                className="w-full min-w-0 border-x border-input bg-transparent text-center text-[13px] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button type="button" aria-label="More" className="grid w-9 place-items-center text-primary hover:bg-muted disabled:opacity-40"
                disabled={value >= max} onClick={() => onChange(clamp(value + 1))}><Plus className="size-4" /></button>
        </div>
    );
}

/** ◉ Show in App  ○ Hide from App — a row of radio choices. */
export function ChoiceRadio<T extends string | boolean>({
    name, value, onChange, options,
}: { name: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
    return (
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
            {options.map((o) => (
                <label key={String(o.value)} className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} className="size-4 accent-[var(--primary)]" />
                    {o.label}
                </label>
            ))}
        </div>
    );
}

/** Bold label + grey line on the left, a switch on the right. */
export function SwitchField({
    id, label, hint, checked, onChange, disabled, icon: Icon,
}: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; icon?: LucideIcon }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-2">
                {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                    <Label htmlFor={id} className="text-[13px] font-semibold">{label}</Label>
                    {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
                </div>
            </div>
            <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
        </div>
    );
}

/** ☑ WhatsApp ☐ Email ☐ In-App — several checkboxes, each with an icon; `boxed` = one card each. */
export function CheckChoices<T extends string>({
    value, onChange, options, boxed,
}: { value: T[]; onChange: (v: T[]) => void; options: { value: T; label: string; icon?: LucideIcon }[]; boxed?: boolean }) {
    const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    return (
        <div className={cn("flex flex-wrap", boxed ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "gap-x-6 gap-y-2")}>
            {options.map((o) => (
                <label key={o.value} className={cn("flex cursor-pointer items-center gap-2 text-[13px]", boxed && "rounded-lg border border-border px-3 py-2.5 font-medium")}>
                    <Checkbox checked={value.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                    {o.icon && <o.icon className="size-4 text-muted-foreground" />} {o.label}
                </label>
            ))}
        </div>
    );
}

/**
 * Drag-and-drop photo box → square crop → upload. Shows the photo with
 * Change / Remove once there is one. `value` is the uploaded URL.
 */
export function PhotoDropzone({
    value, onChange, maxMb = 5, aspect = 1, outputSize = 500, recommend = "Recommended square photo (e.g. 1:1, 500 × 500 px).",
}: { value: string | null; onChange: (url: string | null) => void; maxMb?: number; aspect?: number; outputSize?: number; recommend?: string | null }) {
    const upload = useUploadPhoto();
    const ref = useRef<HTMLInputElement>(null);
    const [crop, setCrop] = useState<File | null>(null);
    const [over, setOver] = useState(false);

    const pick = (file: File | undefined) => {
        if (!file) return;
        if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return toast.error("Please choose a PNG, JPG or WEBP image.");
        if (file.size > maxMb * 1024 * 1024) return toast.error(`The photo must be ${maxMb} MB or smaller.`);
        setCrop(file);
    };

    return (
        <>
            <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            {value ? (
                <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(value)} alt="" className="size-16 rounded-md object-cover" />
                    <div className="flex flex-col items-start gap-1 text-[12.5px]">
                        <button type="button" className="font-medium text-primary" onClick={() => ref.current?.click()}>
                            {upload.isPending ? "Uploading…" : "Change Photo"}
                        </button>
                        <button type="button" className="text-destructive" onClick={() => onChange(null)}>Remove</button>
                    </div>
                </div>
            ) : (
                <button
                    type="button" onClick={() => ref.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                    onDragLeave={() => setOver(false)}
                    onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
                    className={cn("flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-4 text-center transition",
                        over ? "border-primary bg-primary/10" : "border-primary/40 bg-primary/[0.03] hover:bg-primary/5")}
                >
                    <CloudUpload className="size-6 text-primary" />
                    <span className="text-[12.5px] text-foreground/80">
                        {upload.isPending ? "Uploading…" : <>Drag and drop a photo here, or click to upload<br />PNG, JPG or WEBP (Max {maxMb} MB)</>}
                    </span>
                    {recommend && (
                        <span className="mt-1 flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11.5px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            <Info className="size-3" /> {recommend}
                        </span>
                    )}
                </button>
            )}
            <ImageCropDialog
                file={crop} open={!!crop} onOpenChange={(o) => !o && setCrop(null)}
                aspect={aspect} shape="rect" outputSize={outputSize} title="Crop photo"
                onCropped={(file) => { setCrop(null); upload.mutate(file, { onSuccess: (url) => onChange(url) }); }}
            />
        </>
    );
}
