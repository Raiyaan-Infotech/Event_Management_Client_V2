"use client";

import { useState } from "react";
import Link from "next/link";
import {
    ArrowLeft, Building2, CalendarDays, CalendarPlus, Check, CheckCircle2, Clock, CreditCard, Crown, Gem, Gift, Info, Layers,
    LayoutDashboard, Loader2, Lock, Mail, Phone, Receipt, Send, ShieldCheck, Tag, User, Wallet, Zap, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useClientProfile } from "@/hooks/use-client-portal";
import { CYCLE_SUFFIX, formatMoney, useBillingPlans, type AvailablePlans, type CheckoutBody } from "@/hooks/use-billing";
import { useCreateBooking, type BookingBody, type BookingResult } from "@/hooks/use-bookings";

/**
 * Book Event → Select Plan → (Review → Payment) → Date Booked → Create Event.
 * Per-event plans (Jamal, 2026-11-19, Create Event updated v4): EVERY event is booked with its own
 * plan. Free books the date at once; a paid plan goes through Review and Payment first.
 *
 * ⚠ No payment gateway yet ("just save payment details"): Pay saves the method as a PENDING payment
 * (Billing History shows it) and the date is reserved straight away. Card number / CVC / expiry stay
 * in this browser; only brand + last four + name are sent.
 */

type Plan = AvailablePlans["plans"][number];
type Stage = "plan" | "review" | "payment" | "done";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pretty = (d: string) => { const [y, m, day] = d.split("-").map(Number); return `${day} ${MONTHS[m - 1]} ${y}`; };
const withDay = (d: string) => `${pretty(d)} (${WEEK[new Date(`${d}T00:00:00`).getDay()]})`;
const PLAN_ICONS: LucideIcon[] = [Zap, Gem, Crown];
const planIcon = (p: Plan, i: number) => (Number(p.price) > 0 ? PLAN_ICONS[Math.max(0, i - 1) % PLAN_ICONS.length] : Gift);
const limitText = (n: number | null | undefined, unit: string) => (n && n > 0 ? `Up to ${n} ${unit}` : `Unlimited ${unit}`);

export function BookingFlow({ start, end }: { start: string; end?: string }) {
    const plans = useBillingPlans();
    const book = useCreateBooking();
    const [stage, setStage] = useState<Stage>("plan");
    const [planId, setPlanId] = useState<number | null>(null);
    const [result, setResult] = useState<BookingResult | null>(null);

    const list = plans.data?.plans ?? [];
    const chosen = list.find((p) => p.id === planId) ?? null;
    const dateLabel = end ? `${pretty(start)} – ${pretty(end)}` : withDay(start);
    const bookingType = end ? "Multi Date Event" : "Single Date Event";
    const stepIndex = stage === "plan" ? 2 : stage === "done" ? 4 : 3;
    const dates = { start_date: start, ...(end ? { end_date: end } : {}) };
    const done = (r: BookingResult) => { setResult(r); setStage("done"); };

    const summary = (
        <Card className="gap-0 rounded-xl border p-4 shadow-none">
            <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-foreground"><CalendarDays className="h-4.5 w-4.5 text-primary" />Booking Summary</h2>
            <div className="divide-y text-[13px]">
                <Row icon={<CalendarDays />} label={end ? "Selected Dates" : "Selected Event Date"} value={dateLabel} />
                <Row icon={<Layers />} label="Booking Type" value={bookingType} />
                <Row icon={<CheckCircle2 />} label="Availability Status" value={<span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Available</span>} />
            </div>
            {stage !== "plan" && (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2.5 text-[12.5px] text-foreground">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Your date is booked as soon as your payment details are saved.
                </p>
            )}
        </Card>
    );

    return (
        <div className="flex flex-col gap-5">
            <BookingStepper step={stepIndex} done={stage === "done"} />

            {plans.isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : plans.isError ? (
                <div role="alert" className="flex flex-col items-center gap-2 py-16 text-[13px] text-destructive">
                    Could not load the plans.
                    <Button variant="outline" size="sm" onClick={() => plans.refetch()}>Retry</Button>
                </div>
            ) : stage === "plan" ? (
                <SelectPlan
                    list={list} summary={summary} bookingFree={book.isPending ? planId : null}
                    onPick={(p) => {
                        setPlanId(p.id);
                        // Free: the date is booked at once. Paid: Review → Payment first.
                        if (Number(p.price) > 0) setStage("review");
                        else book.mutate({ ...dates, plan_id: p.id }, { onSuccess: done });
                    }}
                />
            ) : stage === "review" && chosen ? (
                <ReviewPlan plan={chosen} summary={summary} onBack={() => setStage("plan")} onNext={() => setStage("payment")} />
            ) : stage === "payment" && chosen ? (
                <PaymentStep plan={chosen} dateLabel={dateLabel} dates={dates} onBack={() => setStage("review")} onSaved={done} />
            ) : stage === "done" && result ? (
                <Booked result={result} dateLabel={dateLabel} />
            ) : null}
        </div>
    );
}

/* ── Stepper ─────────────────────────────────────────────────────────────── */

function BookingStepper({ step, done }: { step: number; done: boolean }) {
    const steps = ["Availability Check", "Select Plan", "Payment", "Create Event"];
    return (
        <nav aria-label="Booking steps">
            <ol className="flex items-center gap-2">
                {steps.map((label, i) => {
                    const n = i + 1;
                    const isDone = n < step || (done && n === 3);
                    const isCurrent = n === step && !done;
                    return (
                        <li key={label} className={cn("flex items-center gap-2", i < steps.length - 1 && "flex-1")}>
                            <span className={cn(
                                "grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-[13px] font-semibold",
                                isDone || isCurrent ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
                            )}>{isDone ? <Check className="h-4 w-4" /> : n}</span>
                            <span className={cn("hidden whitespace-nowrap text-[13px] sm:inline", isCurrent ? "font-semibold text-primary" : "text-foreground")}>{label}</span>
                            {i < steps.length - 1 && <span className={cn("h-[2px] flex-1 rounded", isDone ? "bg-primary" : "bg-border")} aria-hidden />}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

/* ── Step 2 — Select Plan ────────────────────────────────────────────────── */

function SelectPlan({ list, summary, onPick, bookingFree }: {
    list: Plan[]; summary: React.ReactNode; onPick: (p: Plan) => void; bookingFree: number | null;
}) {
    return (
        <>
            <div className="grid gap-4 xl:grid-cols-[1fr_380px] xl:items-start">
                <div className="flex flex-col gap-4">
                    <div>
                        <h1 className="text-[22px] font-bold leading-tight text-foreground">Choose a Plan for This Event</h1>
                        <p className="text-[13px] text-muted-foreground">Each event has its own plan. Start free, or pick a plan with more guests and features.</p>
                    </div>
                    <div className="flex items-center gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Crown className="h-7 w-7" /></span>
                        <div className="min-w-0 border-l border-primary/15 pl-4">
                            <p className="text-[17px] font-bold text-foreground">Confirm a plan to book this date</p>
                            <p className="text-[12.5px] text-muted-foreground">Your date is reserved as soon as you confirm. You can create the event any time before the event date.</p>
                        </div>
                    </div>
                </div>
                {summary}
            </div>

            {list.length === 0 ? (
                <p className="rounded-xl border border-dashed py-10 text-center text-[13px] text-muted-foreground">No plans are available right now. Please contact support.</p>
            ) : (
                <div className={cn("grid gap-4", list.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : list.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2")}>
                    {list.map((p, i) => {
                        const Icon = planIcon(p, i);
                        const free = !(Number(p.price) > 0);
                        const features = p.features.slice(0, 4);
                        return (
                            <Card key={p.id} className="relative gap-0 rounded-xl border p-5 shadow-none">
                                <div className="flex items-start gap-3">
                                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-6 w-6" /></span>
                                    <div className="min-w-0">
                                        <p className="text-[18px] font-bold text-foreground">{p.name}</p>
                                        <p className="line-clamp-2 text-[12.5px] text-muted-foreground">{p.short_description || (free ? "Get started with basic event booking." : "More events and more features.")}</p>
                                    </div>
                                </div>
                                <p className="mt-4 text-[30px] font-bold leading-none text-foreground">
                                    {formatMoney(p.price, p.currency_code)}
                                    <span className="ml-1 text-[14px] font-normal text-muted-foreground">{CYCLE_SUFFIX[p.billing_cycle] ?? ""}</span>
                                </p>
                                <p className="mt-4 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[13.5px] font-semibold text-foreground">
                                    <User className="h-4 w-4 text-primary" />{limitText(p.max_guests_per_event, "guests")}
                                </p>
                                <ul className="mt-3 flex flex-1 flex-col gap-1.5 text-[13px] text-foreground">
                                    <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-600" />One event on the booked date</li>
                                    <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-600" />Check event availability</li>
                                    {features.map((f) => <li key={f.id} className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-600" />{f.label}</li>)}
                                    {p.features.length > features.length && <li className="pl-6 text-[12px] font-medium text-primary">+{p.features.length - features.length} more features</li>}
                                </ul>
                                <div className="mt-5">
                                    {free ? (
                                        <Button variant="outline" className="h-10 w-full border-primary/50 text-[13.5px] font-semibold text-primary hover:bg-primary/5 hover:text-primary"
                                            disabled={bookingFree !== null} onClick={() => onPick(p)}>
                                            {bookingFree === p.id ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Booking...</> : `Book with ${p.name}`}
                                        </Button>
                                    ) : (
                                        <Button className="h-10 w-full text-[13.5px] font-semibold" disabled={bookingFree !== null} onClick={() => onPick(p)}>Select {p.name} Plan</Button>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2.5 text-[12.5px] text-foreground">
                    <Info className="h-4 w-4 shrink-0 text-primary" /><span><b>A free plan books the date straight away.</b> A paid plan continues to payment.</span>
                </p>
                <Button asChild variant="outline" className="h-10"><Link href="/dashboard/events/check-availability"><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Link></Button>
            </div>
        </>
    );
}

/* ── Step 3a — Review ────────────────────────────────────────────────────── */

function ReviewPlan({ plan, summary, onBack, onNext }: { plan: Plan; summary: React.ReactNode; onBack: () => void; onNext: () => void }) {
    const [agree, setAgree] = useState(false);
    const [coupon, setCoupon] = useState("");
    const cur = plan.currency_code;
    return (
        <>
            <div>
                <h1 className="text-[22px] font-bold leading-tight text-foreground">Review Your Plan Selection</h1>
                <p className="text-[13px] text-muted-foreground">Confirm your selected plan and booking details before proceeding to payment.</p>
            </div>
            <div className="grid gap-4 xl:grid-cols-[1fr_380px] xl:items-start">
                <div className="flex flex-col gap-4">
                    <div className="grid gap-4 rounded-xl border-2 border-primary/40 bg-primary/5 p-5 md:grid-cols-[1fr_1fr]">
                        <div>
                            <div className="flex items-start gap-3">
                                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Zap className="h-6 w-6" /></span>
                                <div>
                                    <p className="text-[18px] font-bold text-foreground">Selected Plan: {plan.name}</p>
                                    {plan.short_description && <p className="text-[12.5px] text-muted-foreground">{plan.short_description}</p>}
                                </div>
                            </div>
                            <p className="mt-4 text-[32px] font-bold leading-none text-foreground">{formatMoney(plan.price, cur)}<span className="ml-1 text-[15px] font-normal text-muted-foreground">{CYCLE_SUFFIX[plan.billing_cycle] ?? ""}</span></p>
                        </div>
                        <ul className="flex flex-col gap-1.5 text-[13px] md:border-l md:border-primary/15 md:pl-5">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" />One event on the booked date</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" />{limitText(plan.max_guests_per_event, "guests")}</li>
                            {plan.features.slice(0, 3).map((f) => <li key={f.id} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" />{f.label}</li>)}
                        </ul>
                    </div>

                    <Card className="gap-0 rounded-xl border p-4 shadow-none">
                        <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold"><Receipt className="h-4.5 w-4.5 text-primary" />Billing Summary</h2>
                        <div className="divide-y text-[13px]">
                            <Line label="Plan Price" value={formatMoney(plan.amount.subtotal, cur)} />
                            <Line label="Platform Fee" value={formatMoney(0, cur)} />
                            <Line label={`Tax / GST (${plan.amount.tax_rate}%)`} value={formatMoney(plan.amount.tax_amount, cur)} />
                        </div>
                        <div className="mt-2 flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2.5">
                            <span className="text-[15px] font-bold">Total Payable</span>
                            <span className="text-[18px] font-bold text-primary">{formatMoney(plan.amount.total, cur)}</span>
                        </div>
                        <p className="mb-1.5 mt-4 text-[13px] font-medium">Have a coupon or promo code?</p>
                        <div className="flex gap-2">
                            <span className="relative flex-1">
                                <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Enter coupon or promo code" aria-label="Coupon code"
                                    className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-[13px] outline-none focus:border-primary" />
                            </span>
                            <Button variant="outline" className="h-10 w-28 border-primary/50 text-primary hover:bg-primary/5 hover:text-primary" disabled={!coupon.trim()}
                                onClick={() => toast.info("Coupon codes are not available yet.")}>Apply</Button>
                        </div>
                    </Card>
                </div>
                {summary}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-5 w-5 accent-primary" />
                    I agree to the subscription terms and billing policy.
                </label>
                <div className="flex gap-2">
                    <Button variant="outline" className="h-10 w-36" onClick={onBack}>Back to Plans</Button>
                    <Button className="h-10 w-48 font-semibold" disabled={!agree} onClick={onNext}>Proceed to Payment</Button>
                </div>
            </div>
        </>
    );
}

/* ── Step 3b — Payment ───────────────────────────────────────────────────── */

const METHODS: { key: CheckoutBody["method"]; label: string; icon: LucideIcon }[] = [
    { key: "upi", label: "UPI", icon: Send },
    { key: "card", label: "Credit/Debit Card", icon: CreditCard },
    { key: "netbanking", label: "Net Banking", icon: Building2 },
    { key: "wallet", label: "Wallet", icon: Wallet },
];
const UPI_APPS = [{ key: "gpay", label: "GPay" }, { key: "phonepe", label: "PhonePe" }, { key: "paytm", label: "Paytm" }];
const BANKS = ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank", "Punjab National Bank", "Bank of Baroda", "Other bank"];
const WALLETS = ["Paytm", "PhonePe", "Amazon Pay", "MobiKwik"];

const digitsOnly = (v: string) => v.replace(/\D/g, "");
const cardBrand = (n: string) => (/^4/.test(n) ? "Visa" : /^(5[1-5]|2[2-7])/.test(n) ? "Mastercard" : /^3[47]/.test(n) ? "Amex" : /^(60|65|81|82|508)/.test(n) ? "RuPay" : n ? "Card" : "");
const luhn = (n: string) => {
    let sum = 0;
    for (let i = 0; i < n.length; i++) {
        let d = Number(n[n.length - 1 - i]);
        if (i % 2) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return sum % 10 === 0;
};

function PaymentStep({ plan, dateLabel, dates, onBack, onSaved }: {
    plan: Plan; dateLabel: string; dates: { start_date: string; end_date?: string }; onBack: () => void; onSaved: (r: BookingResult) => void;
}) {
    const me = useClientProfile();
    const checkout = useCreateBooking();
    const [method, setMethod] = useState<CheckoutBody["method"]>("upi");
    const [upiId, setUpiId] = useState("");
    const [upiApp, setUpiApp] = useState<string | null>(null);
    const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
    const [bank, setBank] = useState("");
    const [wallet, setWallet] = useState("");
    const [error, setError] = useState<string | null>(null);
    const cur = plan.currency_code;
    const num = digitsOnly(card.number);

    const validate = (): string | null => {
        if (method === "upi") {
            if (upiId.trim() && !/^[\w.-]{2,}@[a-zA-Z][\w.-]{1,}$/.test(upiId.trim())) return "Enter a valid UPI ID (e.g. name@okaxis).";
            if (!upiId.trim() && !upiApp) return "Enter your UPI ID or choose a UPI app.";
        } else if (method === "card") {
            if (num.length < 13 || num.length > 19 || !luhn(num)) return "Enter a valid card number.";
            const m = card.expiry.match(/^(\d{2})\s*\/\s*(\d{2})$/);
            if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return "Enter the expiry date as MM / YY.";
            const now = new Date();
            const yy = 2000 + Number(m[2]);
            if (yy < now.getFullYear() || (yy === now.getFullYear() && Number(m[1]) < now.getMonth() + 1)) return "This card has expired.";
            if (!/^\d{3,4}$/.test(card.cvv)) return "Enter the CVV.";
            if (!card.name.trim()) return "Enter the cardholder name.";
        } else if (method === "netbanking" && !bank) return "Choose your bank.";
        else if (method === "wallet" && !wallet) return "Choose a wallet.";
        return null;
    };

    const pay = () => {
        const problem = validate();
        setError(problem);
        if (problem) return;
        // Card number, CVV and expiry never leave the browser — only brand + last four + name.
        const body: BookingBody = { ...dates, plan_id: plan.id, method };
        if (method === "upi") { if (upiId.trim()) body.upi_id = upiId.trim(); else body.upi_app = upiApp ?? undefined; }
        if (method === "card") { body.card_brand = cardBrand(num); body.card_last4 = num.slice(-4); body.holder_name = card.name.trim(); }
        if (method === "netbanking") body.bank_name = bank;
        if (method === "wallet") body.wallet = wallet;
        checkout.mutate(body, { onSuccess: onSaved });
    };

    return (
        <>
            <div>
                <h1 className="text-[22px] font-bold leading-tight text-foreground">Complete Your Payment</h1>
                <p className="text-[13px] text-muted-foreground">Choose a payment method and save your payment details to book your event date.</p>
            </div>
            <div className="grid gap-4 xl:grid-cols-[1fr_400px] xl:items-start">
                <Card className="gap-0 rounded-xl border p-4 shadow-none">
                    <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></span>
                        <div><h2 className="text-[16px] font-bold">Payment Method</h2><p className="text-[12.5px] text-muted-foreground">Select your preferred payment method to pay for your subscription.</p></div>
                    </div>
                    <div role="tablist" className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                        {METHODS.map(({ key, label, icon: Icon }) => (
                            <button key={key} type="button" role="tab" aria-selected={method === key} onClick={() => { setMethod(key); setError(null); }}
                                className={cn("flex h-11 items-center justify-center gap-2 rounded-lg border text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                                    method === key ? "border-2 border-primary bg-primary/5 font-semibold text-primary" : "border-border bg-background text-foreground hover:bg-muted")}>
                                <Icon className="h-4 w-4" />{label}
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 rounded-xl bg-primary/5 p-4">
                        {method === "upi" && (
                            <>
                                <PanelTitle icon={<Send />} title="Pay via UPI" text="Enter your UPI ID or choose your UPI app." />
                                <FieldLabel>UPI ID</FieldLabel>
                                <IconInput icon={<span className="text-[13px] font-semibold">@</span>} value={upiId} onChange={(v) => { setUpiId(v); if (v) setUpiApp(null); }} placeholder="Enter your UPI ID (e.g. name@okaxis)" label="UPI ID" />
                                <p className="mb-2 mt-4 text-[13px] font-medium">Or pay quickly with</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {UPI_APPS.map((a) => (
                                        <button key={a.key} type="button" aria-pressed={upiApp === a.key} onClick={() => { setUpiApp(a.key); setUpiId(""); }}
                                            className={cn("h-11 rounded-lg border bg-background text-[14px] font-semibold transition-colors", upiApp === a.key ? "border-primary text-primary ring-2 ring-primary/20" : "hover:bg-muted")}>
                                            {a.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                        {method === "card" && (
                            <>
                                <PanelTitle icon={<CreditCard />} title="Credit/Debit Card" text="Visa, Mastercard, RuPay or other cards. Card details stay in your browser." />
                                <FieldLabel>Card Number</FieldLabel>
                                <IconInput icon={<CreditCard className="h-4 w-4" />} value={card.number} inputMode="numeric" autoComplete="cc-number" label="Card number"
                                    onChange={(v) => setCard((c) => ({ ...c, number: digitsOnly(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ") }))} placeholder="Enter card number"
                                    trailing={num ? <span className="text-[12px] font-semibold text-primary">{cardBrand(num)}</span> : null} />
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                    <div><FieldLabel>Expiry Date</FieldLabel>
                                        <IconInput icon={<CalendarDays className="h-4 w-4" />} value={card.expiry} inputMode="numeric" autoComplete="cc-exp" label="Expiry date" placeholder="MM / YY"
                                            onChange={(v) => { const d = digitsOnly(v).slice(0, 4); setCard((c) => ({ ...c, expiry: d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d })); }} /></div>
                                    <div><FieldLabel>CVV</FieldLabel>
                                        <IconInput icon={<Lock className="h-4 w-4" />} value={card.cvv} inputMode="numeric" autoComplete="cc-csc" label="CVV" placeholder="CVV" type="password"
                                            onChange={(v) => setCard((c) => ({ ...c, cvv: digitsOnly(v).slice(0, 4) }))} /></div>
                                </div>
                                <div className="mt-3"><FieldLabel>Cardholder Name</FieldLabel>
                                    <IconInput icon={<User className="h-4 w-4" />} value={card.name} autoComplete="cc-name" label="Cardholder name" placeholder="Enter cardholder name (as on card)"
                                        onChange={(v) => setCard((c) => ({ ...c, name: v.slice(0, 100) }))} /></div>
                            </>
                        )}
                        {method === "netbanking" && (
                            <>
                                <PanelTitle icon={<Building2 />} title="Net Banking" text="Choose your bank." />
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {BANKS.map((b) => <Choice key={b} active={bank === b} onClick={() => setBank(b)}>{b}</Choice>)}
                                </div>
                            </>
                        )}
                        {method === "wallet" && (
                            <>
                                <PanelTitle icon={<Wallet />} title="Wallet" text="Choose your wallet." />
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {WALLETS.map((w) => <Choice key={w} active={wallet === w} onClick={() => setWallet(w)}>{w}</Choice>)}
                                </div>
                            </>
                        )}
                    </div>
                    {error && <p role="alert" className="mt-3 text-[12.5px] font-medium text-destructive">{error}</p>}
                    <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Your payment details are saved securely. You will not be charged until online payment is enabled.</p>
                </Card>

                <div className="flex flex-col gap-4">
                    <Card className="gap-0 rounded-xl border p-4 shadow-none">
                        <h2 className="flex items-center gap-2 text-[16px] font-bold"><CalendarDays className="h-4.5 w-4.5 text-primary" />Order Summary</h2>
                        <p className="mb-1 text-[12px] text-muted-foreground">Review your subscription details and payment breakdown.</p>
                        <div className="divide-y text-[13px]">
                            <Row icon={<Layers />} label="Selected Plan" value={plan.name} />
                            <Row icon={<Clock />} label="Billing Cycle" value={plan.billing_cycle[0].toUpperCase() + plan.billing_cycle.slice(1)} />
                            <Row icon={<CalendarDays />} label="Selected Date" value={dateLabel} />
                            <Row icon={<Tag />} label="Plan Price" value={formatMoney(plan.amount.subtotal, cur)} />
                            <Row icon={<Receipt />} label="Platform Fee" value={formatMoney(0, cur)} />
                            <Row icon={<Info />} label={`Tax (${plan.amount.tax_rate}%)`} value={formatMoney(plan.amount.tax_amount, cur)} />
                        </div>
                        <div className="mt-2 flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2.5">
                            <span className="text-[15px] font-bold">Total</span><span className="text-[19px] font-bold text-primary">{formatMoney(plan.amount.total, cur)}</span>
                        </div>
                    </Card>
                    <Card className="gap-0 rounded-xl border p-4 shadow-none">
                        <h2 className="flex items-center gap-2 text-[16px] font-bold"><User className="h-4.5 w-4.5 text-primary" />Billing Contact</h2>
                        <p className="mb-1 text-[12px] text-muted-foreground">Contact details for billing and payment receipt.</p>
                        <div className="divide-y text-[13px]">
                            <Row icon={<User />} label="Name" value={me.data?.name || "—"} />
                            <Row icon={<Mail />} label="Email" value={<span className="break-all">{me.data?.email || "—"}</span>} />
                            <Row icon={<Phone />} label="Mobile" value={me.data?.mobile ? `${me.data.dial_code ?? ""} ${me.data.mobile}`.trim() : "—"} />
                        </div>
                    </Card>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" className="h-11 w-40 border-primary/50 text-primary hover:bg-primary/5 hover:text-primary" onClick={onBack} disabled={checkout.isPending}>Back</Button>
                <Button className="h-11 min-w-64 text-[14px] font-semibold" onClick={pay} disabled={checkout.isPending}>
                    {checkout.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Saving...</> : `Pay ${formatMoney(plan.amount.total, cur)} & Continue`}
                </Button>
                <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><Lock className="h-4 w-4" />Your details are encrypted and secure.</span>
            </div>
        </>
    );
}

/* ── Date Booked (the design's "Payment Successful") ─────────────────────── */

function Booked({ result, dateLabel }: { result: BookingResult; dateLabel: string }) {
    const b = result.booking;
    const t = result.transaction;
    const when = new Date(t?.occurred_at ?? b.booked_at);
    const at = `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}, ${when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    const methodName = t ? METHODS.find((m) => m.key === t.method)?.label ?? t.method : null;
    return (
        <>
            <div>
                <h1 className="text-[22px] font-bold leading-tight text-foreground">Your Event Date Is Booked</h1>
                <p className="text-[13px] text-muted-foreground">Your slot is reserved. Create your event now, or any time before the event date.</p>
            </div>
            <div className="grid gap-4 xl:grid-cols-[1fr_420px] xl:items-start">
                <Card className="gap-0 items-center rounded-xl border p-6 shadow-none">
                    <span className="grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-600"><Check className="h-10 w-10" strokeWidth={3} /></span>
                    <p className="mt-3 text-[24px] font-bold text-foreground">Event Date Booked</p>
                    {t ? (
                        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[13px] font-medium text-amber-800">
                            <Clock className="h-4 w-4" />Payment details saved — awaiting confirmation
                        </span>
                    ) : (
                        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[13px] font-medium text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />Slot Reserved
                        </span>
                    )}
                    <div className="mt-5 w-full divide-y rounded-xl border px-4 text-[13px]">
                        <Row icon={<CalendarDays />} label="Event Date" value={dateLabel} />
                        <Row icon={<Layers />} label="Booking Type" value={b.booking_type} />
                        <Row icon={<Crown />} label="Plan" value={b.plan.name} />
                        {t && <Row icon={<Receipt />} label="Transaction ID" value={t.reference} />}
                        {t && <Row icon={<Wallet />} label="Amount" value={formatMoney(t.amount.total, t.currency_code)} />}
                        {t && <Row icon={<CreditCard />} label="Payment Method" value={<span title={t.method_label}>{methodName}</span>} />}
                        <Row icon={<Clock />} label="Booked On" value={at} />
                    </div>
                    <p className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-[13px] font-medium text-emerald-800">
                        <CheckCircle2 className="h-5 w-5 shrink-0" />Your booking slot is secured. The event stays pending setup until you create it.
                    </p>
                    <div className="mt-4 grid w-full gap-3 sm:grid-cols-2">
                        <Button asChild variant="outline" className="h-11 border-primary/50 text-primary hover:bg-primary/5 hover:text-primary"><Link href="/dashboard"><LayoutDashboard className="mr-1.5 h-4 w-4" />Go to Dashboard</Link></Button>
                        <Button asChild className="h-11 font-semibold"><Link href={`/dashboard/events/create?booking=${b.id}`}><CalendarPlus className="mr-1.5 h-4 w-4" />Create Event Now</Link></Button>
                    </div>
                </Card>
                <Card className="gap-0 overflow-hidden rounded-xl border p-0 shadow-none">
                    <h2 className="flex items-center gap-3 bg-primary/5 px-5 py-4 text-[18px] font-bold"><CalendarPlus className="h-6 w-6 text-primary" />What happens next?</h2>
                    <div className="flex flex-col gap-5 p-5">
                        <Next icon={<CalendarPlus />} title="Create your event" text="Set up your event details like title, description, venue and more." />
                        <Next icon={<Layers />} title="Choose template/theme" text="Pick a beautiful template or theme that fits your event style." />
                        <Next icon={<Send />} title="Send invitations after publishing" text="Once your event is published, share invitations via link, email or WhatsApp." />
                    </div>
                </Card>
            </div>
        </>
    );
}

/* ── Small parts ─────────────────────────────────────────────────────────── */

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2.5">
            <span className="flex items-center gap-2 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}{label}</span>
            <span className="text-right font-semibold text-foreground">{value}</span>
        </div>
    );
}

function Line({ label, value }: { label: string; value: string }) {
    return <div className="flex items-center justify-between py-2"><span className="text-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function PanelTitle({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
    return (
        <div className="mb-3 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-background text-primary [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
            <div><p className="text-[15px] font-bold">{title}</p><p className="text-[12px] text-muted-foreground">{text}</p></div>
        </div>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <p className="mb-1 text-[12.5px] font-semibold text-foreground">{children}</p>;
}

function IconInput({ icon, value, onChange, placeholder, label, trailing, type = "text", inputMode, autoComplete }: {
    icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string; label: string; trailing?: React.ReactNode;
    type?: string; inputMode?: "numeric" | "text"; autoComplete?: string;
}) {
    return (
        <span className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 focus-within:border-primary">
            <span className="text-muted-foreground">{icon}</span>
            <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} type={type} inputMode={inputMode} autoComplete={autoComplete}
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
            {trailing}
        </span>
    );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" aria-pressed={active} onClick={onClick}
            className={cn("flex h-10 items-center justify-between rounded-lg border bg-background px-3 text-left text-[13px] font-medium transition-colors", active ? "border-primary text-primary ring-2 ring-primary/20" : "hover:bg-muted")}>
            {children}{active && <Check className="h-4 w-4" />}
        </button>
    );
}

function Next({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
    return (
        <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:h-6 [&_svg]:w-6">{icon}</span>
            <div><p className="text-[15px] font-bold">{title}</p><p className="text-[12.5px] text-muted-foreground">{text}</p></div>
        </div>
    );
}
