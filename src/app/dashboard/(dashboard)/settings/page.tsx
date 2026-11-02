'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
    User, Bell, ShieldCheck, SlidersHorizontal, ChevronRight,
    Download, Users, HelpCircle, MessageSquare, Check, Loader2,
    Fingerprint, Calendar, Crown, CalendarClock, Mail, CreditCard, Coins, Copy, Pencil,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileAvatar } from '@/components/common/profile-avatar';
import { useDateFormatter } from '@/hooks/use-client-settings';
import { useBillingOverview, usePaymentMethods } from '@/hooks/use-billing';
import { PreferencesTab } from './_components/preferences-tab';
import { NotificationsTab } from './_components/notifications-tab';
import { SecurityTab } from './_components/security-tab';
import { useClientProfile, useUpdateProfile } from '@/hooks/use-client-portal';
import { toast } from 'sonner';
import { PhoneInput } from '@/components/common/phone-input';
import { countryForDial, dialOf, mobileNumberError, nationalMobile } from '@/lib/phone';

/**
 * Settings.
 *
 * ── WHAT IS REAL ON THIS SCREEN ─────────────────────────────────────────────
 * Profile (name, email, phone, company, bio) writes to `PUT /client/me`.
 * Account reads the client's own row and plan. Change Password and Close
 * Account are real endpoints.
 *
 * ── WHAT IS NOT BUILT, AND WHY IT SAYS SO ───────────────────────────────────
 * Notifications, Preferences and Integrations have NO schema behind them — no
 * preference table, no notification table, no integration table. Rather than
 * render toggles that flip and forget, those tabs say what they are waiting on.
 *
 * That is a deliberate choice with history: this codebase has repeatedly shipped
 * admin screens whose Save button was a `setTimeout` and whose rows were
 * `Date.now()` ids, and every one of them read as working until somebody
 * reloaded the page. A control that cannot persist is worse than an absent one,
 * because it silently loses what was typed into it.
 *
 * Security is split: the password half is real and lives under Account.
 * Sessions, devices and 2FA are absent — sessions in particular are not just
 * unbuilt but currently impossible, since website-client refresh tokens are
 * stateless JWTs with no server-side store, so nothing can enumerate or revoke
 * them.
 */
const TAB_VALUES = ['profile', 'account', 'notifications', 'security', 'preferences'];

export default function SettingsPage() {
    return (
        <div className="flex flex-col gap-6">
            <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Manage your account, preferences, and application settings.
                </p>
            </div>

            {/* SettingsTabs reads useSearchParams(), which opts a page out of
                prerendering unless it sits behind a Suspense boundary — the same
                reason the layout wraps Breadcrumb. */}
            <Suspense fallback={<ProfileSkeleton />}>
                <SettingsTabs />
            </Suspense>
        </div>
    );
}

/**
 * The tab lives in the URL (`?tab=notifications`) so a link can point at one —
 * Preferences links across to Notifications rather than duplicating the email
 * switches. Kept as STATE as well, so clicking a tab does not push a history
 * entry for every glance; the effect only syncs when an incoming link changes
 * the parameter.
 */
function SettingsTabs() {
    const { isLoading } = useClientProfile();
    const params = useSearchParams();
    const requested = params.get('tab');
    const [tab, setTab] = useState(() =>
        requested && TAB_VALUES.includes(requested) ? requested : 'profile');

    const handleTabChange = (nextTab: string) => {
        setTab(nextTab);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', nextTab);
            window.history.replaceState(null, '', url.pathname + url.search);
        }
    };

    /*
      ADJUSTED DURING RENDER, not in an effect.

      An effect that calls setState runs after the browser has already painted
      the old tab, so an incoming ?tab= link flashes Profile and then switches.
      Comparing against the previous value during render is React's own
      documented pattern for deriving state from props, and is what §308 landed
      on for the Settings form after the same lint rule caught a real bug there.
    */
    const [seen, setSeen] = useState(requested);
    if (requested !== seen) {
        setSeen(requested);
        if (requested && TAB_VALUES.includes(requested)) setTab(requested);
    }

    return (
        <>
            <Tabs value={tab} onValueChange={handleTabChange} className="gap-6">
                <TabsList variant="line" className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="profile">Profile</TabsTrigger>
                    <TabsTrigger value="account">Account</TabsTrigger>
                    <TabsTrigger value="notifications">Notifications</TabsTrigger>
                    <TabsTrigger value="security">Security</TabsTrigger>
                    <TabsTrigger value="preferences">Preferences</TabsTrigger>
                </TabsList>

                <TabsContent value="profile">
                    {isLoading ? <ProfileSkeleton /> : <ProfileTab onSelectTab={handleTabChange} />}
                </TabsContent>

                <TabsContent value="account">
                    {isLoading ? <ProfileSkeleton /> : <AccountTab />}
                </TabsContent>

                <TabsContent value="notifications">
                    <NotificationsTab />
                </TabsContent>

                <TabsContent value="security">
                    {isLoading ? <ProfileSkeleton /> : <SecurityTab />}
                </TabsContent>


                <TabsContent value="preferences">
                    <PreferencesTab />
                </TabsContent>
            </Tabs>
        </>
    );
}

/* ── Profile ─────────────────────────────────────────────────────────────── */

function ProfileTab({ onSelectTab }: { onSelectTab?: (tab: string) => void }) {
    const { data: client } = useClientProfile();
    const save = useUpdateProfile();

    const [form, setForm] = useState({
        name: '', email: '', dial_code: '+91', mobile: '', company_name: '', bio: '',
    });

    /**
     * Seed from the server ONCE per account, adjusted during render rather than
     * in an effect.
     *
     * The effect version re-ran on every `client` object identity change — which
     * includes each background refetch — so a refetch landing mid-edit would
     * silently overwrite what was being typed. Keying on the id fixes that: it
     * seeds when the row first arrives and never again for the same account.
     *
     * Setting state during render is React's documented path for derived state:
     * it re-renders immediately without committing the first pass, so there is
     * no flash of unseeded inputs the way an effect produces.
     */
    const [seededFor, setSeededFor] = useState<number | null>(null);
    if (client && seededFor !== client.id) {
        setSeededFor(client.id);
        setForm({
            name: client.name ?? '',
            email: client.email ?? '',
            dial_code: client.dial_code ?? '+91',
            mobile: client.mobile ?? '',
            company_name: client.company_name ?? '',
            bio: client.bio ?? '',
        });
    }

    // Functional updater, not a `{ ...form }` spread — the latter reads a stale
    // snapshot when two fields change in the same tick.
    const set = (key: keyof typeof form) => (value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-4">
                <Card className="py-0">
                    <CardContent className="p-6">
                        <h2 className="text-base font-semibold">Profile Information</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Update your personal information and how it appears on your account.
                        </p>

                        <div className="mt-6 flex flex-col gap-6 sm:flex-row">
                            <ProfileAvatar client={client ?? null} />

                            <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
                                <Field label="Full Name">
                                    <Input value={form.name} onChange={(e) => set('name')(e.target.value)} />
                                </Field>
                                <Field label="Email Address">
                                    <Input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => set('email')(e.target.value)}
                                    />
                                </Field>
                                <Field label="Phone Number">
                                    <PhoneInput
                                        country={countryForDial(form.dial_code)}
                                        number={form.mobile}
                                        onChange={(iso, num) => setForm((prev) => ({ ...prev, dial_code: dialOf(iso), mobile: num }))}
                                    />
                                </Field>
                                <Field label="Company Name">
                                    <Input
                                        value={form.company_name}
                                        onChange={(e) => set('company_name')(e.target.value)}
                                    />
                                </Field>
                                <div className="sm:col-span-2">
                                    <Field label="Bio">
                                        <Textarea
                                            rows={3}
                                            value={form.bio}
                                            onChange={(e) => set('bio')(e.target.value)}
                                        />
                                    </Field>
                                </div>

                                <div className="sm:col-span-2">
                                    <Button
                                        disabled={save.isPending}
                                        onClick={() => {
                                            // Same per-country mobile check as the app.
                                            const iso = countryForDial(form.dial_code);
                                            const phoneError = mobileNumberError(iso, form.mobile);
                                            if (phoneError) {
                                                toast.error(phoneError);
                                                return;
                                            }
                                            save.mutate({ ...form, mobile: nationalMobile(iso, form.mobile) });
                                        }}
                                    >
                                        {save.isPending && <Loader2 className="size-4 animate-spin" />}
                                        Save Changes
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* The design's shortcut rows. Each points at its own tab rather
                    than a route, because these are tabs on this page. */}
                <div className="flex flex-col gap-3">
                    <ShortcutRow
                        icon={<User className="size-4" />}
                        title="Account"
                        body="Manage your account details, plan, and billing information."
                        onClick={() => onSelectTab?.('account')}
                    />
                    <ShortcutRow
                        icon={<Bell className="size-4" />}
                        title="Notifications"
                        body="Choose how and when you want to be notified."
                        onClick={() => onSelectTab?.('notifications')}
                    />
                    <ShortcutRow
                        icon={<ShieldCheck className="size-4" />}
                        title="Security"
                        body="Update your password and manage account security."
                        onClick={() => onSelectTab?.('security')}
                    />
                    <ShortcutRow
                        icon={<SlidersHorizontal className="size-4" />}
                        title="Preferences"
                        body="Customize your experience and default event settings."
                        onClick={() => onSelectTab?.('preferences')}
                    />
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <AccountOverview />
                <QuickLinks />
                <AccountStatus />
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
            {children}
        </div>
    );
}

function ShortcutRow({
    icon,
    title,
    body,
    onClick,
}: {
    icon: React.ReactNode;
    title: string;
    body: string;
    onClick?: () => void;
}) {
    return (
        <Card
            className="cursor-pointer py-0 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            tabIndex={0}
            role="button"
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick?.();
                }
            }}
        >
            <CardContent className="flex items-center gap-3 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    {icon}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-xs text-muted-foreground">{body}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </CardContent>
        </Card>
    );
}

/* ── Right rail ──────────────────────────────────────────────────────────── */

function AccountOverview() {
    const fmt = useDateFormatter();
    const { data: client } = useClientProfile();
    const { data: billing } = useBillingOverview();
    const next = billing?.subscription?.next_billing_date ?? null;

    return (
        <Card className="py-0">
            <CardContent className="p-5">
                <h3 className="text-sm font-semibold">Account Overview</h3>
                <dl className="mt-4 flex flex-col gap-3 text-sm">
                    <Row label="Plan" value={client?.plan?.name ?? 'No plan assigned'} />
                    <Row label="Member Since" value={fmt(client?.created_at)} />
                {/* Real since §313 — `client_subscriptions` records the term.
                    A cancelled or lifetime term has no next charge, and says so
                    rather than printing a dash that reads as missing data. */}
                    <Row
                        label="Next Billing Date"
                        value={next ? fmt(next) : 'No upcoming charge'}
                        muted={!next}
                    />
                </dl>
                {/* The billing screens exist now (§323), so this leads somewhere
                    instead of being disabled with a note that is no longer true. */}
                <Button asChild variant="outline" className="mt-4 w-full">
                    <Link href="/dashboard/billing">Manage Billing</Link>
                </Button>
            </CardContent>
        </Card>
    );
}

function QuickLinks() {
    // ⚠ None of these has an endpoint. Rendered disabled rather than as links
    // to nowhere — a shortcut that lands on a dead route reads as broken, one
    // that says it is not ready reads as honest.
    const links = [
        { icon: <Download className="size-4" />, title: 'Download My Data', body: 'Get a copy of your account data' },
        { icon: <Users className="size-4" />, title: 'Invite Team Members', body: 'Collaborate with your team' },
        { icon: <HelpCircle className="size-4" />, title: 'Help Center', body: 'Browse guides and FAQs' },
        { icon: <MessageSquare className="size-4" />, title: 'Contact Support', body: 'Get in touch with our team' },
    ];

    return (
        <Card className="py-0">
            <CardContent className="p-5">
                <h3 className="text-sm font-semibold">Quick Links</h3>
                <div className="mt-4 flex flex-col gap-3">
                    {links.map((l) => (
                        <div key={l.title} className="flex items-center gap-3 opacity-60">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                                {l.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">{l.title}</span>
                                <span className="block text-xs text-muted-foreground">{l.body}</span>
                            </span>
                            <Badge variant="secondary" className="shrink-0 text-[10px]">Soon</Badge>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function AccountStatus() {
    const { data: client } = useClientProfile();

    return (
        <Card className="py-0">
            <CardContent className="p-5">
                <h3 className="text-sm font-semibold">Account Status</h3>
                <div className="mt-4 flex flex-col gap-4">
                    <StatusRow
                        ok={!!Number(client?.email_verified)}
                        title="Email Verified"
                        yes="Your email address is verified."
                        no="Your email address is not verified yet."
                    />
                    <StatusRow
                        ok={!!Number(client?.mobile_verified)}
                        title="Phone Verified"
                        yes="Your phone number is verified."
                        // Worth stating plainly: with OTP_ACCEPT_ANY on, the login
                        // code proves nothing, so the flag is deliberately not set.
                        no="Your phone number is not verified yet."
                    />
                    {/* ⚠ NO DATA. There is no 2FA column and no TOTP anywhere in
                        this backend, so this cannot report a real state. */}
                    <StatusRow ok={null} title="Two-Factor Authentication" yes="" no="Not available yet." />
                </div>
            </CardContent>
        </Card>
    );
}

function StatusRow({ ok, title, yes, no }: { ok: boolean | null; title: string; yes: string; no: string }) {
    return (
        <div className="flex items-start gap-3">
            <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                    ok === true ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'
                }`}
            >
                {ok === true ? <Check className="size-3" /> : <span className="text-[11px] leading-none">—</span>}
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">{ok === true ? yes : no}</span>
            </span>
        </div>
    );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={`text-right font-medium ${muted ? 'text-muted-foreground' : ''}`}>{value}</dd>
        </div>
    );
}

/* ── Account ─────────────────────────────────────────────────────────────── */

function AccountTab() {
    const { data: client } = useClientProfile();
    const { data: billing } = useBillingOverview();
    // Real since the manual payment-methods feature shipped: a client can
    // record a UPI id / bank account / cash as "how they pay", even with no
    // gateway connected. Not a chargeable instrument — see PaymentMethodsPanel
    // — but it IS a real saved row, so this row must not keep claiming there
    // is none.
    const { data: pmData } = usePaymentMethods();
    const fmt = useDateFormatter();
    const [copied, setCopied] = useState(false);

    const sub = billing?.subscription ?? null;
    const accountId = client ? `EVT-${String(client.id).padStart(6, '0')}` : '—';
    const defaultMethod = pmData?.default_method ?? null;

    const copyAccountId = async () => {
        try {
            await navigator.clipboard.writeText(accountId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard access can be blocked (permissions, insecure context).
            // Failing silently beats throwing over a copy-to-clipboard nicety.
        }
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-4">
                <Card className="py-0">
                    <CardContent className="p-6">
                        <h2 className="text-base font-semibold">Account Details</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            View and manage your account information.
                        </p>

                        <div className="mt-4">
                            {/* Derived from the row id, not stored. A stable,
                                human-quotable handle for support, with no column
                                to drift from the record it names. */}
                            <AccountDetailRow
                                icon={Fingerprint}
                                iconClassName="bg-blue-500/10 text-blue-600"
                                label="Account ID"
                                value={accountId}
                                action={
                                    <Button
                                        size="icon" variant="ghost" className="size-7"
                                        onClick={copyAccountId} aria-label="Copy account ID"
                                    >
                                        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                                    </Button>
                                }
                            />
                            <AccountDetailRow
                                icon={Calendar}
                                iconClassName="bg-violet-500/10 text-violet-600"
                                label="Account Created"
                                value={fmt(client?.created_at, true)}
                            />
                            <AccountDetailRow
                                icon={Crown}
                                iconClassName="bg-amber-500/10 text-amber-600"
                                label="Current Plan"
                                value={client?.plan?.name ?? 'No plan assigned'}
                                action={
                                    <Button asChild size="sm" variant="outline">
                                        <Link href="/dashboard/billing/change-plan">Change Plan</Link>
                                    </Button>
                                }
                            />
                            <AccountDetailRow
                                icon={Users}
                                iconClassName="bg-emerald-500/10 text-emerald-600"
                                label="Member Since"
                                value={fmt(client?.created_at)}
                            />
                            {/* Real since §313 — `client_subscriptions` records the
                                term. Null is not "missing data": a cancelled or
                                lifetime term genuinely has no next charge, so it
                                says that rather than printing a dash. */}
                            <AccountDetailRow
                                icon={CalendarClock}
                                iconClassName="bg-sky-500/10 text-sky-600"
                                label="Next Billing Date"
                                value={sub?.next_billing_date ? fmt(sub.next_billing_date) : 'No upcoming charge'}
                                muted={!sub?.next_billing_date}
                            />
                            {/* There is no separate billing-email column, and
                                there does not need to be — invoices are addressed
                                to the account's own email, and that is what this
                                shows. Edit jumps to the Change Email card rather
                                than opening a second editor for the same field. */}
                            <AccountDetailRow
                                icon={Mail}
                                iconClassName="bg-rose-500/10 text-rose-600"
                                label="Billing Email"
                                value={client?.email ?? '—'}
                                action={
                                    <Button
                                        size="sm" variant="outline"
                                        onClick={() => document.getElementById('change-email-card')
                                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                    >
                                        <Pencil className="size-3.5" /> Edit
                                    </Button>
                                }
                            />
                            <AccountDetailRow
                                icon={CreditCard}
                                iconClassName="bg-indigo-500/10 text-indigo-600"
                                label="Payment Method"
                                value={defaultMethod ? defaultMethod.label : 'Not set up yet'}
                                muted={!defaultMethod}
                                action={
                                    <Button asChild size="sm" variant="outline">
                                        <Link href="/dashboard/billing?tab=payment">
                                            {defaultMethod ? 'Manage' : 'Add'}
                                        </Link>
                                    </Button>
                                }
                            />
                            {/* Every plan in the catalogue is priced in INR, and
                                the subscription snapshots its own currency at
                                purchase (§313.1). Read from the subscription so
                                it stays true if that ever stops being the case,
                                rather than being typed in here. No edit action:
                                there is no currency-change endpoint. */}
                            <AccountDetailRow
                                icon={Coins}
                                iconClassName="bg-teal-500/10 text-teal-600"
                                label="Currency"
                                value={`${sub?.currency_code ?? 'INR'} (₹)`}
                                last
                            />
                        </div>

                        <p className="mt-4 text-xs text-muted-foreground">
                            {defaultMethod
                                ? `${defaultMethod.type_label} is recorded for reference only — no payment provider is connected, so nothing is ever charged automatically.`
                                : 'Invoices go to your account email. There is no payment method on file yet, and no provider is connected, so nothing can be charged automatically.'}
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-destructive/40 py-0">
                    <CardContent className="p-6">
                        <h2 className="text-base font-semibold">Delete Account</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Once you delete your account, there is no going back. Please be certain.
                        </p>
                        {/*
                          A dedicated screen, not a dialog. The confirmation needs
                          a password (or an email for a social-only account), the
                          real consequences and the ones the design got wrong — too
                          much to read inside a modal, and the success state has to
                          live outside the authenticated shell anyway. One place
                          owns the flow, for the §308 reason a second editor is a
                          second place to diverge.
                        */}
                        <Button asChild variant="outline"
                            className="mt-4 border-destructive/50 text-destructive">
                            <Link href="/dashboard/settings/delete-account">Delete My Account</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/*
              Password and 2FA are NOT here. Both designs put them on this tab
              AND on Security; one credential with two editors is two sets of
              validation to keep in step (§308), so they live on Security with
              the sessions and devices they protect, and this tab keeps the
              account details, the email address and account closure.
            */}
            <div className="flex flex-col gap-4">
                <ChangeEmailCard client={client ?? null} />
                <AccountOverview />
                <AccountStatus />
            </div>

        </div>
    );
}

/** One row of the Account Details card: icon, label, value, optional action. */
function AccountDetailRow({
    icon: Icon,
    iconClassName,
    label,
    value,
    muted,
    action,
    last,
}: {
    icon: React.ComponentType<{ className?: string }>;
    iconClassName?: string;
    label: string;
    value: React.ReactNode;
    muted?: boolean;
    action?: React.ReactNode;
    last?: boolean;
}) {
    return (
        <div className={`flex flex-wrap items-center justify-between gap-3 py-3.5 ${last ? '' : 'border-b'}`}>
            <div className="flex min-w-0 items-center gap-3">
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${iconClassName ?? 'bg-primary/10 text-primary'}`}>
                    <Icon className="size-4" />
                </span>
                <span className="min-w-0 text-sm font-medium">{label}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className={`text-sm font-medium ${muted ? 'text-muted-foreground' : ''}`}>{value}</span>
                {action}
            </div>
        </div>
    );
}

/**
 * Change Email — a real write to `PUT /client/me`, the same endpoint the
 * Profile tab's Email field already uses. Kept as its own card (rather than
 * only the Profile tab's inline field) because that is where the design put
 * it, and a "Current Email" / "New Email" pair reads as a deliberate change
 * rather than an edit that can be left half-typed in a bigger form.
 */
function ChangeEmailCard({ client }: { client: { email: string | null } | null }) {
    const save = useUpdateProfile();
    const [newEmail, setNewEmail] = useState('');

    const submit = () => {
        const trimmed = newEmail.trim();
        if (!trimmed) return;
        save.mutate({ email: trimmed }, { onSuccess: () => setNewEmail('') });
    };

    return (
        <Card id="change-email-card" className="py-0">
            <CardContent className="p-5">
                <h3 className="text-sm font-semibold">Change Email Address</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                    Update your email address used for signing in and account notifications.
                </p>

                <div className="mt-4 flex flex-col gap-3">
                    <Field label="Current Email">
                        <Input value={client?.email ?? ''} disabled />
                    </Field>
                    <Field label="New Email Address">
                        <Input
                            type="email"
                            placeholder="Enter new email address"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                        />
                    </Field>
                </div>

                <Button
                    className="mt-4 w-full"
                    disabled={!newEmail.trim() || save.isPending}
                    onClick={submit}
                >
                    {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                    Update Email
                </Button>
            </CardContent>
        </Card>
    );
}


/* ── Shared ──────────────────────────────────────────────────────────────── */

function ProfileSkeleton() {
    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
        </div>
    );
}
