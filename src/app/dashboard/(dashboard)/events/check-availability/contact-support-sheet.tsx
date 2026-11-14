"use client";

import { useRef, useState } from "react";
import { CalendarDays, Headphones, Info, Mail, Paperclip, Phone, PhoneCall, User, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageLoader } from "@/components/common/page-loader";
import { cn } from "@/lib/utils";
import { useClientProfile } from "@/hooks/use-client-portal";
import { toast } from "sonner";
import {
    existingRequestConflict, useCancelAvailabilityRequest, useCreateAvailabilityRequest,
    type AvailabilityRequest, type ExistingRequestConflict,
} from "@/hooks/use-event-availability";
import { ExistingRequestDialog, type ExistingStep } from "./existing-request-dialog";

/**
 * Contact Support Team (Jamal's designs: Call Support + Email Support, 2026-11-13).
 * Saved as an allocation request (POST /client/availability/requests) — the super admin sees it in
 * Allocation Requests. Name / mobile / email are filled from the client's profile.
 */

export interface UnavailableDay { date: string; label: string }

const CALL_TIMES = [
    "Today, 10:00 AM – 12:00 PM", "Today, 12:00 PM – 3:00 PM", "Today, 3:00 PM – 5:00 PM", "Today, 5:00 PM – 7:00 PM",
    "Tomorrow, 10:00 AM – 12:00 PM", "Tomorrow, 12:00 PM – 3:00 PM", "Tomorrow, 3:00 PM – 5:00 PM", "Tomorrow, 5:00 PM – 7:00 PM",
];
const MAX_MSG = 500;
const ATTACH_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export function ContactSupportSheet({
    open, onClose, onSubmitted, bookingType, start, end, unavailable, rangeLabel,
}: {
    open: boolean;
    onClose: () => void;
    onSubmitted: (r: AvailabilityRequest) => void;
    bookingType: "single" | "multiple";
    start: string;
    end: string;
    unavailable: UnavailableDay[];
    /** "24 Nov 2026" or "24 Nov 2026 to 27 Nov 2026" */
    rangeLabel: string;
}) {
    const profile = useClientProfile();
    const create = useCreateAvailabilityRequest();
    // Mounted fresh each time the panel opens (the page renders it only while open), so the form
    // starts from the profile and the selected dates without an effect.
    const p = profile.data;
    const blocked = unavailable.map((u) => u.label.split(" — ")[0]).join(", ");
    const what = bookingType === "multiple" ? `a multi-date event from ${rangeLabel}` : `an event on ${rangeLabel}`;
    const are = unavailable.length > 1 ? "are" : "is";
    const [tab, setTab] = useState<"call" | "email">("call");
    const [name, setName] = useState(() => p?.name ?? "");
    const [mobile, setMobile] = useState(() => (p?.mobile ? `${p.dial_code ? `${p.dial_code} ` : ""}${p.mobile}` : ""));
    const [email, setEmail] = useState(() => p?.email ?? "");
    const [callTime, setCallTime] = useState(CALL_TIMES[2]);
    const [subject, setSubject] = useState(() => `Event Allocation Request – ${rangeLabel}`.slice(0, 200));
    const [callMsg, setCallMsg] = useState(() => `I would like to create ${what}, but ${blocked} ${are} unavailable. Please call me to discuss the options.`.slice(0, MAX_MSG));
    const [mailMsg, setMailMsg] = useState(() => `I would like to create ${what}, but ${blocked} ${are} not available. Please assist me with event allocation.`.slice(0, MAX_MSG));
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState("");
    const cancel = useCancelAvailabilityRequest();
    const [conflict, setConflict] = useState<ExistingRequestConflict | null>(null);
    const [step, setStep] = useState<ExistingStep | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const submit = () => {
        setError("");
        if (!name.trim()) return setError("Please enter your name.");
        if (tab === "call") {
            if (mobile.replace(/\D/g, "").length < 10) return setError("Please enter a valid mobile number.");
            if (!callMsg.trim()) return setError("Please enter the message / details.");
        } else {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Please enter a valid email address.");
            if (!subject.trim()) return setError("Please enter the subject.");
            if (!mailMsg.trim()) return setError("Please enter the message / details.");
        }
        const form = new FormData();
        form.append("booking_type", bookingType);
        form.append("start_date", start);
        form.append("end_date", end);
        form.append("contact_method", tab);
        form.append("contact_name", name.trim());
        if (tab === "call") {
            form.append("contact_mobile", mobile.trim());
            form.append("preferred_call_time", callTime);
            form.append("message", callMsg.trim());
        } else {
            form.append("contact_email", email.trim());
            form.append("subject", subject.trim());
            form.append("message", mailMsg.trim());
            if (file) form.append("attachment", file);
        }
        create.mutate(form, {
            onSuccess: (r) => onSubmitted(r),
            onError: (e) => {
                const c = existingRequestConflict(e);
                if (c) { setConflict(c); setStep("found"); return; }
                setError(e instanceof Error ? e.message : "The request could not be sent. Please try again.");
            },
        });
    };

    const confirmCancel = () => {
        if (!conflict) return;
        cancel.mutate(conflict.existing.id, {
            onSuccess: () => { setStep("cancelled"); toast.success("Support request canceled"); },
            onError: (e) => { setStep(null); setError(e instanceof Error ? e.message : "The request could not be cancelled."); },
        });
    };
    const closeExisting = () => { setStep(null); setConflict(null); };

    const pickFile = (f: File | undefined) => {
        if (!f) return;
        if (!ATTACH_TYPES.includes(f.type)) return setError("Attach a PDF, JPG or PNG file.");
        if (f.size > 5 * 1024 * 1024) return setError("The attachment is larger than 5 MB.");
        setError("");
        setFile(f);
    };

    return (
        <Sheet open={open} onOpenChange={(v) => !v && !create.isPending && !step && onClose()}>
            <PageLoader open={create.isPending} text="Submitting..." />
            <ExistingRequestDialog
                step={step} conflict={conflict} start={start} end={end} cancelling={cancel.isPending}
                onClose={closeExisting} onAskCancel={() => setStep("confirm")} onKeep={() => setStep("found")}
                onConfirmCancel={confirmCancel} onCreateNew={() => { closeExisting(); submit(); }}
            />
            <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[440px]">
                <SheetHeader className="border-b p-4">
                    <SheetTitle className="flex items-center gap-2 text-[16px]">
                        <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary"><Headphones className="h-4 w-4" /></span>
                        Contact Support Team
                    </SheetTitle>
                    <SheetDescription className="sr-only">Ask the support team for help with unavailable dates.</SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-3 p-4 text-[13px]">
                    <p className="flex items-start gap-2 rounded-md bg-primary/5 px-3 py-2 text-[12.5px] text-foreground">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        One or more selected dates are unavailable. Please contact our support team for assistance.
                    </p>

                    <div className="rounded-md border p-3">
                        <p className="mb-1.5 text-[12.5px] font-semibold">Unavailable {unavailable.length > 1 ? "Dates" : "Date"}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {unavailable.map((u) => (
                                <span key={u.date} className="rounded bg-red-50 px-2 py-0.5 text-[12px] font-medium text-red-600">{u.label}</span>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1 rounded-md border p-1">
                        {([["call", "Request a Call Back", Phone], ["email", "Email Support", Mail]] as const).map(([k, label, Icon]) => (
                            <button key={k} type="button" onClick={() => { setTab(k); setError(""); }}
                                className={cn("flex h-8 items-center justify-center gap-1.5 rounded text-[12.5px] font-medium", tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                                <Icon className="h-3.5 w-3.5" />{label}
                            </button>
                        ))}
                    </div>

                    {tab === "call" ? (
                        <div className="space-y-3 rounded-md border p-3">
                            <div className="flex items-start gap-2.5">
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><PhoneCall className="h-4 w-4" /></span>
                                <div>
                                    <p className="text-[14px] font-semibold">Request a Call Back</p>
                                    <p className="text-[12px] text-muted-foreground">Share your details and our support team will call you at the earliest.</p>
                                </div>
                            </div>
                            <Field label="Your Name"><IconInput icon={<User className="h-3.5 w-3.5" />} value={name} onChange={setName} max={150} /></Field>
                            <Field label="Mobile Number"><IconInput icon={<Phone className="h-3.5 w-3.5" />} value={mobile} onChange={setMobile} max={30} /></Field>
                            <Field label="Preferred Call Time">
                                <div className="relative">
                                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <select value={callTime} onChange={(e) => setCallTime(e.target.value)}
                                        className="h-9 w-full appearance-none rounded-md border bg-background pl-8 pr-3 text-[13px] outline-none focus:border-primary">
                                        {CALL_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </Field>
                            <Field label="Message / Details">
                                <Textarea rows={4} maxLength={MAX_MSG} value={callMsg} onChange={(e) => setCallMsg(e.target.value)} className="text-[13px]" />
                                <p className="mt-1 text-right text-[11px] text-muted-foreground">{callMsg.length} / {MAX_MSG}</p>
                            </Field>
                            <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                                <Mail className="h-4 w-4 shrink-0 text-primary" />
                                <p className="flex-1 text-[12px]"><b>Prefer to write to us?</b> Send your request and our support team will respond via email.</p>
                                <button type="button" onClick={() => setTab("email")} className="shrink-0 rounded-md border border-primary/40 px-2 py-1 text-[11.5px] font-semibold text-primary hover:bg-primary/5">Go to Email Support</button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3 rounded-md border p-3">
                            <div>
                                <p className="text-[14px] font-semibold">Email Support</p>
                                <p className="text-[12px] text-muted-foreground">Send your request to our Support Team. We will reply to your email address.</p>
                            </div>
                            <Field label="Organizer Name"><Input value={name} maxLength={150} onChange={(e) => setName(e.target.value)} className="h-9 text-[13px]" /></Field>
                            <Field label="Email Address"><Input type="email" value={email} maxLength={190} onChange={(e) => setEmail(e.target.value)} className="h-9 text-[13px]" /></Field>
                            <Field label="Subject"><Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className="h-9 text-[13px]" /></Field>
                            <Field label="Message / Details">
                                <Textarea rows={4} maxLength={MAX_MSG} value={mailMsg} onChange={(e) => setMailMsg(e.target.value)} className="text-[13px]" />
                                <p className="mt-1 text-right text-[11px] text-muted-foreground">{mailMsg.length} / {MAX_MSG}</p>
                            </Field>
                            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
                            {file ? (
                                <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-[12.5px]">
                                    <span className="flex min-w-0 items-center gap-1.5"><Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{file.name}</span></span>
                                    <button type="button" onClick={() => setFile(null)} aria-label="Remove attachment"><X className="h-3.5 w-3.5" /></button>
                                </div>
                            ) : (
                                <button type="button" onClick={() => fileRef.current?.click()}
                                    className="flex w-full items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-[12px] text-muted-foreground hover:bg-muted/40">
                                    + Attach file (optional) <span className="text-muted-foreground/70">· PDF, JPG, PNG · Max 5 MB</span>
                                </button>
                            )}
                        </div>
                    )}

                    {error && <p className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-600">{error}</p>}
                </div>

                <div className="flex justify-end gap-2 border-t p-4">
                    <Button variant="outline" className="h-9" disabled={create.isPending} onClick={onClose}>Cancel</Button>
                    <Button className="h-9" disabled={create.isPending} onClick={submit}>
                        {tab === "call" ? <><Phone className="mr-1.5 h-4 w-4" />Submit Call Request</> : <><Mail className="mr-1.5 h-4 w-4" />Send Email Request</>}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="mb-1 text-[12.5px] font-medium text-foreground">{label} <span className="text-destructive">*</span></p>
            {children}
        </div>
    );
}

function IconInput({ icon, value, onChange, max }: { icon: React.ReactNode; value: string; onChange: (v: string) => void; max: number }) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
            <Input value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} className="h-9 pl-8 text-[13px]" />
        </div>
    );
}
