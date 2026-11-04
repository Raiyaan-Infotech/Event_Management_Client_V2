/**
 * The colours the module designs use for pills, icons and tiles — one table so
 * "Confirmed" is the same green on Guests, RSVP and Participants.
 */
export type Tone = "primary" | "violet" | "success" | "warning" | "danger" | "info" | "amber" | "muted" | "plain";

export const TONE_TEXT: Record<Tone, string> = {
    primary: "text-primary",
    violet: "text-violet-600 dark:text-violet-400",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    info: "text-info",
    amber: "text-amber-600 dark:text-amber-400",
    muted: "text-muted-foreground",
    plain: "text-foreground",
};

export const TONE_PILL: Record<Tone, string> = {
    primary: "bg-primary/10 text-primary",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-destructive/10 text-destructive",
    info: "bg-info/10 text-info",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    muted: "bg-muted text-muted-foreground",
    plain: "bg-muted text-foreground",
};
