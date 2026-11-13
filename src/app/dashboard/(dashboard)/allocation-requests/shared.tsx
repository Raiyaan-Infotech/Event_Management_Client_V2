import { Ban, CheckCircle2, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small shared bits of the Allocation Requests pages. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n: number) => String(n).padStart(2, "0");

export const prettyDate = (d?: string | null) => {
    if (!d) return "—";
    const [y, m, day] = d.slice(0, 10).split("-").map(Number);
    return `${pad(day)} ${MONTHS[m - 1]} ${y}`;
};
export const prettyRange = (a: string, b: string) => (a === b ? prettyDate(a) : `${prettyDate(a)} – ${prettyDate(b)}`);
export const weekday = (d: string) => DAYS[new Date(`${d.slice(0, 10)}T00:00:00`).getDay()];
export const prettyDateTime = (v?: string | null) => {
    if (!v) return "—";
    const x = new Date(v);
    if (Number.isNaN(x.getTime())) return "—";
    const h = x.getHours();
    return `${pad(x.getDate())} ${MONTHS[x.getMonth()]} ${x.getFullYear()}, ${pad(h % 12 || 12)}:${pad(x.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
};
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;

const STATUS = {
    pending: { label: "Pending Review", cls: "border-amber-200 bg-amber-50 text-amber-700", Icon: Hourglass },
    approved: { label: "Approved", cls: "border-emerald-200 bg-emerald-50 text-emerald-700", Icon: CheckCircle2 },
    rejected: { label: "Rejected", cls: "border-red-200 bg-red-50 text-red-600", Icon: Ban },
} as const;

export function RequestStatusChip({ status, big }: { status: "pending" | "approved" | "rejected"; big?: boolean }) {
    const s = STATUS[status] ?? STATUS.pending;
    return (
        <span className={cn("inline-flex items-center gap-1 rounded-md border font-semibold whitespace-nowrap", big ? "px-2.5 py-1 text-[13px]" : "px-1.5 py-0.5 text-[11px]", s.cls)}>
            <s.Icon className={big ? "h-4 w-4" : "h-3 w-3"} />{s.label}
        </span>
    );
}
