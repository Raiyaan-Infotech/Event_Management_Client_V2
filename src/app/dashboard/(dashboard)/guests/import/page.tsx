"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCloudArrowUp, faFileCsv, faCheck, faArrowRight, faArrowLeft,
    faDownload, faCircleInfo, faTriangleExclamation, faCircleCheck,
    faCircleXmark, faForward, faLightbulb, faHeadset,
    faUsers, faFileImport, faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { GuestLimitGate } from "../_components/guest-limit-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGuestStats, useDownloadSampleCsv } from "@/hooks/use-guests";

/**
 * Import Guests — the four-step wizard.
 *
 * ── NOTHING IS WRITTEN UNTIL STEP 4 ──────────────────────────────────────────
 * Steps 2 and 3 call `/guests/import/preview`, which parses and validates and
 * writes nothing. You see exactly what would be created, and which rows would
 * be refused and why, BEFORE anything touches the database. Step 4 re-parses on
 * the server rather than posting the preview back — the preview is a display,
 * and accepting rows straight from the browser would let a crafted request file
 * guests against another account's event.
 *
 * ── THE FILE IS READ IN THE BROWSER ──────────────────────────────────────────
 * `FileReader`, then the text is posted. The cap is 10 MB, the browser has to
 * read it anyway to show a preview, and multipart would mean wiring multer into
 * a route that never needs the file on disk.
 */

const STEPS = [
    { n: 1, title: "Upload File", caption: "Upload your CSV file" },
    { n: 2, title: "Map Fields", caption: "Match columns" },
    { n: 3, title: "Review & Preview", caption: "Verify your data" },
    { n: 4, title: "Import", caption: "Complete import" },
];

const MAX_BYTES = 10 * 1024 * 1024;

interface PreviewResult {
    delimiter: string;
    mapping: { index: number; header: string; field: string | null }[];
    unmapped: string[];
    total_rows: number;
    valid_count: number;
    skipped_count: number;
    error_count: number;
    new_groups: string[];
    preview: Record<string, unknown>[];
    skipped: { row: number; name: string; email: string; reason: string }[];
    errors: { row: number; name: string; errors: string[] }[];
}

interface CommitResult {
    imported: number;
    skipped: number;
    failed: number;
    created_groups: { id: number; name: string }[];
    errors: { row: number; name: string; errors: string[] }[];
}

/** Canonical field name -> the label the design uses. */
const FIELD_LABELS: Record<string, string> = {
    first_name: "First Name", last_name: "Last Name", email: "Email",
    mobile: "Phone Number", whatsapp: "WhatsApp Number",
    group_name: "Guest Group",
        company: "Company / Organization", title: "Title / Salutation",
    address_line1: "Address Line 1", address_line2: "Address Line 2",
    city: "City", state: "State / Province", postal_code: "PIN / ZIP Code",
    country: "Country", dietary_preference: "Dietary Preference",
    special_requirements: "Special Requirements", notes: "Notes",
};

export default function ImportGuestsPage() {
    return (
        <GuestLimitGate>
            <ImportGuests />
        </GuestLimitGate>
    );
}

function ImportGuests() {
    const router = useRouter();
    // V2: guests belong to an event — the Guests list passes it as ?event=.
    const importEventId = () =>
        typeof window === "undefined" ? null : Number(new URLSearchParams(window.location.search).get("event")) || null;
    const qc = useQueryClient();
    const inputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState(1);
    const [file, setFile] = useState<File | null>(null);
    const [content, setContent] = useState("");
    const [createGroups, setCreateGroups] = useState(true);
    const [dragging, setDragging] = useState(false);
    const [preview, setPreview] = useState<PreviewResult | null>(null);
    const [result, setResult] = useState<CommitResult | null>(null);

    const stats = useGuestStats();
    const downloadSample = useDownloadSampleCsv();

    const analyse = useMutation({
        mutationFn: (body: { content: string }) =>
            api.post<PreviewResult>("/client/guests/import/preview", { ...body, event_id: importEventId() }),
        onSuccess: (data) => { setPreview(data); setStep(3); },
        onError: (e) => {
            toast.error(e instanceof Error ? e.message : "Could not read that file.");
        },
    });

    const commit = useMutation({
        mutationFn: (body: { content: string; create_groups: boolean }) =>
            api.post<CommitResult>("/client/guests/import", { ...body, event_id: importEventId() }),
        onSuccess: (data) => {
            setResult(data);
            setStep(4);
            // 'all' so the guest list, the tiles and the group counts all pick
            // it up even while unmounted.
            qc.invalidateQueries({ queryKey: ["client", "guests"], refetchType: "all" });
            qc.invalidateQueries({ queryKey: ["client", "guest-groups"], refetchType: "all" });
            toast.success(`${data.imported} guest(s) imported`);
        },
        onError: (e) => {
            if (e instanceof ApiError && e.isAuthError) {
                toast.error("Your session has expired. Please sign in again.");
                return;
            }
            toast.error(e instanceof Error ? e.message : "Import failed.");
        },
    });

    const readFile = useCallback((picked: File) => {
        if (!/\.csv$/i.test(picked.name)) {
            toast.error("Only CSV files are supported.");
            return;
        }
        if (picked.size > MAX_BYTES) {
            toast.error("That file is larger than 10 MB.");
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => toast.error("Could not read that file.");
        reader.onload = () => {
            setFile(picked);
            setContent(String(reader.result ?? ""));
            setPreview(null);
            setResult(null);
        };
        // Explicit UTF-8: the default guesses from the OS locale, and a guessed
        // encoding is how an imported name arrives as mojibake.
        reader.readAsText(picked, "utf-8");
    }, []);

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) readFile(dropped);
    };

    const goToMapping = () => {
        if (!content) {
            toast.error("Choose a CSV file first.");
            return;
        }
        analyse.mutate({ content });
        // analyse.onSuccess jumps to step 3; step 2 renders from the same result
        // so the mapping is visible on the way through.
        setStep(2);
    };

    const mapped = useMemo(
        () => (preview?.mapping ?? []).filter((m) => m.field),
        [preview]
    );


    return (
        <div className="flex flex-col gap-5">
            <div className="min-w-0">
                <h1 className="text-[24px] font-bold leading-tight tracking-tight text-foreground">Import Guests</h1>
                <p className="mt-1 text-[13.5px] text-muted-foreground">
                    Import guests in bulk using a CSV file. It&rsquo;s quick and easy!
                </p>
            </div>

            {/* ── Stepper ─────────────────────────────────────────────────── */}
            <div className="overflow-x-auto">
                <ol className="flex min-w-[620px] items-start">
                    {STEPS.map((s, i) => {
                        const done = s.n < step;
                        const current = s.n === step;
                        return (
                            <li key={s.n} className="relative flex flex-1 flex-col items-center gap-1.5">
                                {/* Connectors stop at the row edges so they never
                                    poke out past step 1 or 4. */}
                                {i > 0 && (
                                    <span aria-hidden className={cn(
                                        "absolute left-0 top-[15px] h-[2px] w-1/2 -translate-x-1/2",
                                        done || current ? "bg-primary" : "bg-border"
                                    )} />
                                )}
                                {i < STEPS.length - 1 && (
                                    <span aria-hidden className={cn(
                                        "absolute right-0 top-[15px] h-[2px] w-1/2 translate-x-1/2",
                                        done ? "bg-primary" : "bg-border"
                                    )} />
                                )}
                                <span className={cn(
                                    "relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-[12.5px] font-semibold",
                                    done || current
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-card text-muted-foreground"
                                )}>
                                    {done ? <FontAwesomeIcon icon={faCheck} className="!size-[12px]" /> : s.n}
                                </span>
                                <span className={cn("text-center text-[12px] font-semibold",
                                    current ? "text-primary" : "text-foreground")}>
                                    {s.title}
                                </span>
                                <span className="text-center text-[10.5px] text-muted-foreground">{s.caption}</span>
                            </li>
                        );
                    })}
                </ol>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
                <div className="flex min-w-0 flex-col gap-5">
                    {/* ── Step 1 ──────────────────────────────────────────── */}
                    {step === 1 && (
                        <>
                            <Card className="border border-border py-0 shadow-none">
                                <CardContent className="p-5">
                                    <div className="mb-4 flex items-center gap-2.5">
                                        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                                            1
                                        </span>
                                        <p className="text-[13.5px] font-bold text-foreground">Upload CSV File</p>
                                    </div>

                                    <div
                                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                        onDragLeave={() => setDragging(false)}
                                        onDrop={onDrop}
                                        className={cn(
                                            "flex flex-col items-center gap-3 rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors",
                                            dragging ? "border-primary bg-primary/5" : "border-border"
                                        )}
                                    >
                                        <FontAwesomeIcon icon={faCloudArrowUp} className="!size-[30px] text-primary" />
                                        {file ? (
                                            <>
                                                <p className="text-[13.5px] font-bold text-foreground break-all">{file.name}</p>
                                                <p className="text-[11.5px] text-muted-foreground">
                                                    {(file.size / 1024).toFixed(1)} KB · ready to map
                                                </p>
                                                <Button variant="outline" size="sm" className="h-8 text-[12px]"
                                                    onClick={() => { setFile(null); setContent(""); }}>
                                                    Choose a different file
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-[13.5px] font-bold text-foreground">
                                                    Drag and drop your CSV file here
                                                </p>
                                                <p className="text-[12px] text-muted-foreground">or</p>
                                                <Button variant="outline"
                                                    className="h-10 rounded-md border-primary/40 px-5 text-[13px] font-semibold text-primary hover:bg-primary/5 hover:text-primary"
                                                    onClick={() => inputRef.current?.click()}>
                                                    Browse Files
                                                </Button>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Only CSV files are supported
                                                </p>
                                            </>
                                        )}
                                        <input
                                            ref={inputRef}
                                            type="file"
                                            accept=".csv,text/csv"
                                            className="hidden"
                                            onChange={(e) => {
                                                const picked = e.target.files?.[0];
                                                if (picked) readFile(picked);
                                                // Reset so re-picking the SAME file fires
                                                // change again.
                                                e.target.value = "";
                                            }}
                                        />
                                    </div>

                                    <div className="mt-5 grid gap-5 sm:grid-cols-2">
                                        <div className="min-w-0">
                                            <p className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-foreground">
                                                <FontAwesomeIcon icon={faFileCsv} className="!size-[12px] text-success" />
                                                CSV File Guidelines
                                            </p>
                                            <ul className="flex flex-col gap-1.5">
                                                {[
                                                    "File must be in CSV format",
                                                    "Maximum file size: 10 MB",
                                                    "First row should contain column headers",
                                                    "Duplicate email addresses will be skipped",
                                                ].map((line) => (
                                                    <li key={line} className="flex items-start gap-2 text-[11.5px] text-muted-foreground">
                                                        <FontAwesomeIcon icon={faCheck} className="mt-0.5 !size-[10px] shrink-0 text-success" />
                                                        <span className="min-w-0 break-words">{line}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <Button
                                                variant="link"
                                                disabled={downloadSample.isPending}
                                                onClick={() => downloadSample.mutate()}
                                                className="mt-2 h-auto p-0 text-[11.5px] font-semibold text-primary"
                                            >
                                                <FontAwesomeIcon icon={faDownload} className="mr-1.5 !size-[10px]" />
                                                Download Sample CSV
                                            </Button>
                                        </div>

                                        <div className="min-w-0">
                                            <p className="mb-2 text-[12.5px] font-semibold text-foreground">Required Columns</p>
                                            <div className="flex flex-wrap gap-2">
                                                {["First Name*", "Email*"].map((c) => (
                                                    <Badge key={c} variant="ghost" className="rounded bg-primary/10 text-[10.5px] font-semibold text-primary">
                                                        {c}
                                                    </Badge>
                                                ))}
                                            </div>
                                            <p className="mt-2 text-[11px] text-muted-foreground">
                                                At least these columns are required.
                                            </p>

                                            <p className="mb-2 mt-4 text-[12.5px] font-semibold text-foreground">Recommended Columns</p>
                                            <div className="flex flex-wrap gap-2">
                                                {["Last Name", "WhatsApp Number", "Email", "Guest Group", "City"].map((c) => (
                                                    <Badge key={c} variant="secondary" className="rounded text-[10.5px]">{c}</Badge>
                                                ))}
                                            </div>
                                            <p className="mt-2 text-[11px] text-muted-foreground">
                                                <span className="font-semibold text-foreground">Phone Number</span> is
                                                the key: a number already in your guest list is skipped. Email is optional.
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border border-border py-0 shadow-none">
                                <CardContent className="p-5">
                                    <div className="grid gap-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <Label className="text-[12.5px] font-medium">Create missing groups</Label>
                                                <p className="text-[11.5px] text-muted-foreground break-words">
                                                    A Guest Group name that does not exist yet will be created.
                                                </p>
                                            </div>
                                            <Switch checked={createGroups} onCheckedChange={setCreateGroups}
                                                aria-label="Create missing groups" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-warning/40 bg-warning/5 py-0 shadow-none">
                                <CardContent className="flex items-start gap-3 p-4">
                                    <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 !size-[13px] shrink-0 text-warning" />
                                    <div className="min-w-0">
                                        <p className="text-[12.5px] font-semibold text-foreground">Important</p>
                                        <p className="mt-0.5 text-[11.5px] text-muted-foreground break-words">
                                            Please review your data carefully in the next steps. You will have a chance to
                                            review and confirm before the data is imported — nothing is written until the
                                            final step.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {/* ── Step 2 ──────────────────────────────────────────── */}
                    {step === 2 && (
                        <Card className="border border-border py-0 shadow-none">
                            <CardContent className="p-5">
                                <div className="mb-4 flex items-center gap-2.5">
                                    <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>
                                    <p className="text-[13.5px] font-bold text-foreground">Map Fields</p>
                                </div>

                                {analyse.isPending ? (
                                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                                        <FontAwesomeIcon icon={faSpinner} className="!size-[22px] animate-spin text-primary" />
                                        <p className="text-[13px] text-muted-foreground">Reading your file…</p>
                                    </div>
                                ) : analyse.isError ? (
                                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                                        <FontAwesomeIcon icon={faTriangleExclamation} className="!size-[24px] text-destructive/70" />
                                        <p className="text-[13.5px] font-semibold text-foreground">Could not read that file</p>
                                        <p className="max-w-md text-[12px] text-muted-foreground break-words">
                                            {analyse.error instanceof Error ? analyse.error.message : "Unknown error."}
                                        </p>
                                        <Button variant="outline" size="sm" className="mt-2 h-8 text-[12px]"
                                            onClick={() => setStep(1)}>
                                            Back to upload
                                        </Button>
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>
                    )}

                    {/* ── Step 3 ──────────────────────────────────────────── */}
                    {step === 3 && preview && (
                        <>
                            <Card className="border border-border py-0 shadow-none">
                                <CardContent className="p-5">
                                    <div className="mb-4 flex items-center gap-2.5">
                                        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">3</span>
                                        <p className="text-[13.5px] font-bold text-foreground">Review &amp; Preview</p>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        <ReviewTile label="Ready to import" value={preview.valid_count}
                                            icon={faCircleCheck} tone="text-success" bg="bg-success/10" />
                                        <ReviewTile label="Will be skipped" value={preview.skipped_count}
                                            icon={faForward} tone="text-warning" bg="bg-warning/10" />
                                        <ReviewTile label="Have errors" value={preview.error_count}
                                            icon={faCircleXmark} tone="text-destructive" bg="bg-destructive/10" />
                                    </div>

                                    <Separator className="my-5" />

                                    <p className="mb-3 text-[12.5px] font-semibold text-foreground">
                                        Columns matched ({mapped.length} of {preview.mapping.length})
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {preview.mapping.map((m) => (
                                            <Badge
                                                key={`${m.index}-${m.header}`}
                                                variant="ghost"
                                                className={cn(
                                                    "rounded px-2 py-0.5 text-[10.5px] font-medium",
                                                    m.field ? "bg-success/12 text-success" : "bg-muted text-muted-foreground line-through"
                                                )}
                                                title={m.field ? `Maps to ${FIELD_LABELS[m.field] ?? m.field}` : "Not recognised — this column is ignored"}
                                            >
                                                {m.header || "(blank)"}
                                            </Badge>
                                        ))}
                                    </div>
                                    {preview.unmapped.length > 0 && (
                                        <p className="mt-2 text-[11px] text-muted-foreground">
                                            {preview.unmapped.length} column(s) were not recognised and will be ignored.
                                        </p>
                                    )}

                                    {preview.new_groups.length > 0 && (
                                        <p className="mt-3 rounded-md bg-primary/5 px-3 py-2 text-[11.5px] text-muted-foreground">
                                            New groups in this file:{" "}
                                            <span className="font-semibold text-foreground">{preview.new_groups.join(", ")}</span>
                                            {createGroups ? " — these will be created." : " — these will be left blank."}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>

                            {preview.preview.length > 0 && (
                                <Card className="border border-border py-0 shadow-none">
                                    <CardContent className="p-0">
                                        <p className="px-5 pt-5 text-[12.5px] font-semibold text-foreground">
                                            First {preview.preview.length} row(s)
                                        </p>
                                        <div className="mt-3 overflow-x-auto">
                                            <table className="w-full min-w-[620px] border-collapse">
                                                <thead>
                                                    <tr className="border-y border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                                                        <th className="py-2.5 pl-5 text-left font-medium">Row</th>
                                                        <th className="py-2.5 text-left font-medium">Name</th>
                                                        <th className="py-2.5 text-left font-medium">Email</th>
                                                        <th className="py-2.5 text-left font-medium">Status</th>
                                                        <th className="py-2.5 pr-5 text-left font-medium">Group</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {preview.preview.map((row, i) => (
                                                        <tr key={i} className="border-b border-border last:border-0">
                                                            <td className="py-2.5 pl-5 text-[12px] tabular-nums text-muted-foreground">
                                                                {String(row.row ?? "")}
                                                            </td>
                                                            <td className="py-2.5 pr-3 text-[12px] font-medium text-foreground break-words">
                                                                {String(row.name ?? "")}
                                                            </td>
                                                            <td className="py-2.5 pr-3 text-[12px] text-muted-foreground break-all">
                                                                {String(row.email ?? "")}
                                                            </td>
                                                            <td className="py-2.5 pr-3 text-[12px] capitalize text-muted-foreground">
                                                                {String(row.rsvp_status ?? "").replace("_", " ")}
                                                            </td>
                                                            <td className="py-2.5 pr-5 text-[12px] text-muted-foreground break-words">
                                                                {String(row.group_name ?? "") || "—"}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {preview.errors.length > 0 && (
                                <Card className="border-destructive/30 py-0 shadow-none">
                                    <CardContent className="p-5">
                                        <p className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-destructive">
                                            <FontAwesomeIcon icon={faCircleXmark} className="!size-[12px]" />
                                            {preview.error_count} row(s) will not be imported
                                        </p>
                                        <ul className="flex flex-col gap-2">
                                            {preview.errors.map((err) => (
                                                <li key={err.row} className="rounded-md bg-destructive/5 px-3 py-2">
                                                    <p className="text-[12px] font-medium text-foreground">
                                                        Row {err.row} — {err.name}
                                                    </p>
                                                    <p className="text-[11.5px] text-muted-foreground break-words">
                                                        {err.errors.join(" ")}
                                                    </p>
                                                </li>
                                            ))}
                                        </ul>
                                        {/* Partial success stated plainly. */}
                                        <p className="mt-3 text-[11.5px] text-muted-foreground">
                                            The other {preview.valid_count} row(s) will still be imported.
                                        </p>
                                    </CardContent>
                                </Card>
                            )}

                            {preview.skipped.length > 0 && (
                                <Card className="border-warning/30 py-0 shadow-none">
                                    <CardContent className="p-5">
                                        <p className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-warning">
                                            <FontAwesomeIcon icon={faForward} className="!size-[12px]" />
                                            {preview.skipped_count} duplicate(s) will be skipped
                                        </p>
                                        <ul className="flex flex-col gap-1.5">
                                            {preview.skipped.slice(0, 10).map((s) => (
                                                <li key={s.row} className="text-[11.5px] text-muted-foreground break-words">
                                                    Row {s.row} — {s.name} ({s.email}): {s.reason}
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}

                    {/* ── Step 4 ──────────────────────────────────────────── */}
                    {step === 4 && result && (
                        <Card className="border border-border py-0 shadow-none">
                            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                                <span className="grid h-16 w-16 place-items-center rounded-full bg-success/15">
                                    <FontAwesomeIcon icon={faCheck} className="!size-[26px] text-success" />
                                </span>
                                <p className="text-[18px] font-bold text-success">Import complete</p>
                                <p className="text-[13px] text-muted-foreground">
                                    {result.imported} guest(s) added
                                    {result.skipped ? `, ${result.skipped} skipped as duplicates` : ""}
                                    {result.failed ? `, ${result.failed} had errors` : ""}.
                                </p>

                                {result.created_groups.length > 0 && (
                                    <p className="text-[12px] text-muted-foreground break-words">
                                        Groups created: {result.created_groups.map((g) => g.name).join(", ")}
                                    </p>
                                )}

                                <div className="mt-3 flex flex-wrap justify-center gap-2">
                                    <Button asChild className="h-10 rounded-md px-5 text-[13px] font-semibold">
                                        <Link href="/dashboard/guests">View Guest List</Link>
                                    </Button>
                                    <Button
                                        variant="outline" className="h-10 rounded-md px-5 text-[13px] font-medium"
                                        onClick={() => {
                                            setStep(1); setFile(null); setContent("");
                                            setPreview(null); setResult(null);
                                        }}
                                    >
                                        Import another file
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ── Nav ─────────────────────────────────────────────── */}
                    {step < 4 && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <Button
                                variant="outline"
                                className="h-11 rounded-md px-5 text-[13px] font-medium"
                                disabled={analyse.isPending || commit.isPending}
                                onClick={() => (step === 1 ? router.push("/dashboard/guests") : setStep(step - 1))}
                            >
                                {step > 1 && <FontAwesomeIcon icon={faArrowLeft} className="mr-2 !size-[12px]" />}
                                {step === 1 ? "Cancel" : "Back"}
                            </Button>

                            {step === 1 && (
                                <Button onClick={goToMapping} disabled={!content || analyse.isPending}
                                    className="h-11 rounded-md px-6 text-[13px] font-semibold">
                                    Next: Map Fields
                                    <FontAwesomeIcon icon={faArrowRight} className="ml-2 !size-[12px]" />
                                </Button>
                            )}

                            {step === 3 && preview && (
                                <Button
                                    onClick={() => commit.mutate({
                                        content,
                                        create_groups: createGroups,
                                    })}
                                    disabled={commit.isPending || preview.valid_count === 0}
                                    className="h-11 rounded-md px-6 text-[13px] font-semibold"
                                >
                                    {commit.isPending
                                        ? "Importing..."
                                        : preview.valid_count === 0
                                            ? "Nothing to import"
                                            : `Import ${preview.valid_count} guest(s)`}
                                    {!commit.isPending && preview.valid_count > 0 && (
                                        <FontAwesomeIcon icon={faFileImport} className="ml-2 !size-[12px]" />
                                    )}
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Right rail ──────────────────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-5">
                    <Card className="border border-border py-0 shadow-none">
                        <CardContent className="p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10">
                                    <FontAwesomeIcon icon={faFileCsv} className="!size-[11px] text-primary" />
                                </span>
                                <p className="text-[13px] font-bold text-foreground">Import Summary</p>
                            </div>

                            <dl className="flex flex-col gap-2.5">
                                <SummaryRow icon={faUsers} label="Guests in your list"
                                    value={String(stats.data?.total_guests ?? 0)} />
                                <SummaryRow icon={faFileCsv} label="File"
                                    value={file?.name ?? "None chosen"} />
                                <SummaryRow icon={faCircleCheck} label="Rows in file"
                                    value={preview ? String(preview.total_rows) : "—"} />
                            </dl>
                        </CardContent>
                    </Card>

                    <Card className="border-primary/20 bg-primary/5 py-0 shadow-none">
                        <CardContent className="p-4">
                            <div className="mb-2 flex items-center gap-2">
                                <FontAwesomeIcon icon={faLightbulb} className="!size-[12px] text-primary" />
                                <p className="text-[12.5px] font-bold text-primary">Pro Tip</p>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                                Make sure your CSV file follows the recommended format to avoid import errors.
                                Formatting the phone column as <span className="font-semibold text-foreground">Text</span>{" "}
                                in Excel stops it turning +91… into 9.19E+11.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border border-border py-0 shadow-none">
                        <CardContent className="p-4">
                            <div className="mb-2 flex items-center gap-2">
                                <FontAwesomeIcon icon={faHeadset} className="!size-[12px] text-primary" />
                                <p className="text-[13px] font-bold text-foreground">Need Help?</p>
                            </div>
                            <ul className="flex flex-col gap-2">
                                <li>
                                    <button
                                        onClick={() => downloadSample.mutate()}
                                        disabled={downloadSample.isPending}
                                        className="flex w-full items-center gap-2 text-left text-[11.5px] font-medium text-primary hover:underline"
                                    >
                                        <FontAwesomeIcon icon={faDownload} className="!size-[10px]" />
                                        Download a sample CSV
                                    </button>
                                </li>
                                <li className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                                    <FontAwesomeIcon icon={faCircleInfo} className="!size-[10px]" />
                                    Required: First Name, Email
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function ReviewTile({
    label, value, icon, tone, bg,
}: {
    label: string; value: number; icon: typeof faCheck; tone: string; bg: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-md border border-border p-3">
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md", bg)}>
                <FontAwesomeIcon icon={icon} className={cn("!size-[13px]", tone)} />
            </span>
            <div className="min-w-0">
                <p className="text-[18px] font-bold leading-none tabular-nums text-foreground">{value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground break-words">{label}</p>
            </div>
        </div>
    );
}

function SummaryRow({ icon, label, value }: { icon: typeof faCheck; label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <dt className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                <FontAwesomeIcon icon={icon} className="!size-[11px]" />
                {label}
            </dt>
            <dd className="min-w-0 max-w-[55%] text-right text-[12px] font-medium text-foreground break-words">
                {value}
            </dd>
        </div>
    );
}
