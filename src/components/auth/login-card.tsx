'use client';

/**
 * The portal's own sign-in card — Mobile | Email tabs, "Login with Google".
 *
 * Same layout as the Public Website's login card, in the portal's own theme.
 * V2 has no public website, so this is the front door: a signed-out visitor
 * lands here, signs in, and goes straight to the page they asked for.
 *
 *   Mobile  number -> Send OTP -> six code boxes -> Verify & Log In
 *   Email   email + password (+ authenticator code when the account has 2FA)
 *   Google  full-page trip to the backend and back to /login?auth=...
 */

import * as React from 'react';
import { toast } from 'sonner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft,
    faEnvelope,
    faEye,
    faEyeSlash,
    faKey,
    faLock,
    faMobileScreenButton,
    faPaperPlane,
    faShieldHalved,
    faSpinner,
} from '@fortawesome/free-solid-svg-icons';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
    loginWithEmail,
    mobileLinkStep,
    requestLoginOtp,
    startGoogleSignIn,
    verifyLoginOtp,
    verifyTwoFactor,
} from '@/lib/auth-client';
import { FieldLabel, MobileNumberField, OtpInput } from './auth-fields';

const RESEND_SECONDS = 30;

function GoogleMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path fill="#4285F4" d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.19a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.17-2 3.45-4.95 3.45-8.39Z" />
            <path fill="#34A853" d="M12 24c3.12 0 5.73-1.04 7.64-2.81l-3.72-2.9c-1.03.7-2.35 1.11-3.92 1.11-3.01 0-5.56-2.03-6.47-4.76H1.68v2.99A11.99 11.99 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.53 14.64a7.2 7.2 0 0 1 0-4.6V7.05H1.68a12 12 0 0 0 0 10.58l3.85-3Z" />
            <path fill="#EA4335" d="M12 4.77c1.7 0 3.22.58 4.42 1.72l3.3-3.3C17.73 1.24 15.12 0 12 0 7.4 0 3.42 2.64 1.68 6.47l3.85 3c.91-2.73 3.46-4.7 6.47-4.7Z" />
        </svg>
    );
}

function Spinner() {
    return <FontAwesomeIcon icon={faSpinner} spin className="!size-[14px]" />;
}

export function LoginCard({
    next,
    mobileLinkToken,
    onMobileLinkDone,
}: {
    /** Same-origin path to open after signing in. Already validated by the page. */
    next: string;
    /** Set after a Google sign-in whose account still needs a phone number. */
    mobileLinkToken: string | null;
    onMobileLinkDone: () => void;
}) {
    const [method, setMethod] = React.useState<'mobile' | 'email'>('mobile');

    // Held true across the page change so the form doesn't flash back.
    const [redirecting, setRedirecting] = React.useState(false);

    const finish = React.useCallback(
        (message?: string) => {
            toast.success(message || 'Login successful');
            setRedirecting(true);
            // A full navigation: the session cookie is set, and the portal's
            // data should load fresh under it.
            window.location.assign(next);
        },
        [next],
    );

    // 2FA step replaces the email form inside the same card.
    const [twoFa, setTwoFa] = React.useState<{ token: string } | null>(null);

    if (mobileLinkToken) {
        return (
            <CardShell>
                <MobileLinkStep token={mobileLinkToken} onDone={onMobileLinkDone} />
            </CardShell>
        );
    }

    if (twoFa) {
        return (
            <CardShell>
                <TwoFactorStep
                    challengeToken={twoFa.token}
                    onBack={() => setTwoFa(null)}
                    onSuccess={(message) => finish(message)}
                />
            </CardShell>
        );
    }

    return (
        <CardShell>
            <h2 className="break-words text-center text-[21px] font-black tracking-tight text-foreground">
                Log in to your account
            </h2>
            <p className="mt-1.5 break-words text-center text-[12.5px] text-muted-foreground">
                Welcome back. Choose how you want to sign in.
            </p>

            {/* Mobile | Email */}
            <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-border p-1">
                {(['mobile', 'email'] as const).map((key) => {
                    const active = method === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setMethod(key)}
                            className={cn(
                                'flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg text-[13px] font-bold transition',
                                active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
                            )}
                        >
                            <FontAwesomeIcon
                                icon={key === 'mobile' ? faMobileScreenButton : faEnvelope}
                                className="!size-[14px] shrink-0"
                            />
                            {key === 'mobile' ? 'Mobile' : 'Email'}
                        </button>
                    );
                })}
            </div>

            {method === 'mobile' ? (
                <MobileForm busyRedirect={redirecting} onSuccess={finish} />
            ) : (
                <EmailForm
                    busyRedirect={redirecting}
                    onSuccess={finish}
                    onTwoFactor={(token) => setTwoFa({ token })}
                />
            )}

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">OR</span>
                <span className="h-px flex-1 bg-border" />
            </div>

            <button
                type="button"
                disabled={redirecting}
                onClick={startGoogleSignIn}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-input bg-background text-[13px] font-semibold text-foreground transition hover:bg-muted active:scale-[0.99] disabled:opacity-60"
            >
                <GoogleMark className="h-[18px] w-[18px] shrink-0" />
                Login with Google
            </button>
        </CardShell>
    );
}

function CardShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="w-full min-w-0 max-w-[420px] rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            {children}
            <div className="mt-6 flex min-w-0 items-start justify-center gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <FontAwesomeIcon icon={faShieldHalved} className="!size-[13px] text-primary" />
                </span>
                <p className="break-words text-[11.5px] leading-4 text-muted-foreground">
                    We take your privacy seriously.
                    <br />
                    Your information is 100% secure.
                </p>
            </div>
        </div>
    );
}

// ── Mobile: number -> code ──────────────────────────────────────────────────

function MobileForm({
    onSuccess,
    busyRedirect,
}: {
    onSuccess: (message?: string) => void;
    busyRedirect: boolean;
}) {
    const [dialCode, setDialCode] = React.useState('+91');
    const [mobile, setMobile] = React.useState('');
    const [mobileError, setMobileError] = React.useState(false);
    const [otp, setOtp] = React.useState('');
    const [otpSent, setOtpSent] = React.useState(false);
    const [sending, setSending] = React.useState(false);
    const [verifying, setVerifying] = React.useState(false);
    const [resendIn, setResendIn] = React.useState(0);
    const otpBox = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (resendIn <= 0) return;
        const id = window.setTimeout(() => setResendIn((left) => left - 1), 1000);
        return () => window.clearTimeout(id);
    }, [resendIn]);

    const changeMobile = (value: string) => {
        setMobile(value);
        // A new number needs a new code.
        if (otpSent) {
            setOtpSent(false);
            setOtp('');
        }
    };

    const sendOtp = async () => {
        if (sending) return;
        if (mobile.trim().length < 6) {
            setMobileError(true);
            toast.error('Please enter your mobile number.');
            return;
        }
        setMobileError(false);
        setSending(true);
        const result = await requestLoginOtp(mobile.trim(), dialCode);
        setSending(false);
        if (!result.ok) {
            toast.error(result.message);
            return;
        }
        setOtp('');
        setOtpSent(true);
        setResendIn(RESEND_SECONDS);
        if (result.devCode) {
            toast.warning(`Use verification code ${result.devCode}. The code was not delivered.`);
        } else if (result.delivered === false) {
            toast.warning("We couldn't send your verification code. Please try again.");
        } else {
            toast.success(result.message);
        }
        // Point the visitor straight at the code boxes.
        window.setTimeout(() => {
            otpBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            otpBox.current?.querySelector('input')?.focus();
        }, 50);
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!otpSent) {
            await sendOtp();
            return;
        }
        if (verifying) return;
        if (otp.trim().length < 6) {
            toast.error('Please enter the 6-digit verification code.');
            return;
        }
        setVerifying(true);
        const result = await verifyLoginOtp(mobile.trim(), otp.trim());
        setVerifying(false);
        if (!result.ok) {
            toast.error(result.message);
            setOtp('');
            return;
        }
        onSuccess(result.message);
    };

    const busy = sending || verifying || busyRedirect;

    return (
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            <MobileNumberField
                id="login-mobile"
                label="Mobile Number"
                value={mobile}
                onChange={changeMobile}
                dialCode={dialCode}
                onDialCodeChange={setDialCode}
                error={mobileError}
                autoFocus
            />

            {otpSent && (
                <div className="min-w-0 rounded-lg border border-border p-3">
                    <p className="mb-2 text-[12.5px] font-bold text-foreground">Enter OTP</p>
                    <OtpInput ref={otpBox} value={otp} onChange={setOtp} autoFocus />
                    <div className="mt-2.5 flex min-w-0 flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                        <span className="min-w-0 break-words">
                            Sent to{' '}
                            <span className="font-semibold text-foreground">
                                {dialCode} {mobile}
                            </span>
                        </span>
                        {resendIn > 0 ? (
                            <span>Resend in {resendIn}s</span>
                        ) : (
                            <button
                                type="button"
                                onClick={sendOtp}
                                disabled={sending}
                                className="font-semibold text-primary hover:underline disabled:opacity-60"
                            >
                                Resend OTP
                            </button>
                        )}
                    </div>
                </div>
            )}

            <Button type="submit" disabled={busy || (otpSent && otp.length < 6)} className="h-11 w-full text-[13.5px] font-bold">
                {busy ? (
                    <Spinner />
                ) : (
                    <FontAwesomeIcon icon={otpSent ? faKey : faPaperPlane} className="!size-[14px]" />
                )}
                {busyRedirect
                    ? 'Taking you to your dashboard...'
                    : sending
                        ? 'Sending OTP...'
                        : verifying
                            ? 'Verifying...'
                            : otpSent
                                ? 'Verify & Log In'
                                : 'Send OTP'}
            </Button>
        </form>
    );
}

// ── Email + password ────────────────────────────────────────────────────────

function EmailForm({
    onSuccess,
    onTwoFactor,
    busyRedirect,
}: {
    onSuccess: (message?: string) => void;
    onTwoFactor: (challengeToken: string) => void;
    busyRedirect: boolean;
}) {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [showPassword, setShowPassword] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (submitting) return;
        if (!email.trim() || !password) {
            toast.error('Please enter your email and password.');
            return;
        }
        setSubmitting(true);
        const result = await loginWithEmail(email.trim(), password);
        setSubmitting(false);

        if (!result.ok) {
            toast.error(result.message);
            return;
        }
        // The password was right, but a second factor is still owed. NO session
        // exists yet, so the code step is the only thing that may happen next.
        if (result.requiresTwoFactor && result.challengeToken) {
            setPassword('');
            onTwoFactor(result.challengeToken);
            return;
        }
        setPassword('');
        onSuccess(result.message);
    };

    const busy = submitting || busyRedirect;

    return (
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            <div>
                <FieldLabel htmlFor="login-email" required>
                    Email Address
                </FieldLabel>
                <div className="relative">
                    <FontAwesomeIcon
                        icon={faEnvelope}
                        className="pointer-events-none absolute left-3 top-1/2 !size-[14px] -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Enter your email address"
                        className="h-11 pl-9"
                    />
                </div>
            </div>

            <div>
                <FieldLabel htmlFor="login-password" required>
                    Password
                </FieldLabel>
                {/* The eye button is positioned against THIS wrapper only. */}
                <div className="relative">
                    <FontAwesomeIcon
                        icon={faLock}
                        className="pointer-events-none absolute left-3 top-1/2 !size-[14px] -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        className="h-11 pl-9 pr-10"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((previous) => !previous)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                    >
                        <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="!size-[14px]" />
                    </button>
                </div>
            </div>

            <Button type="submit" disabled={busy} className="h-11 w-full text-[13.5px] font-bold">
                {busy ? <Spinner /> : <FontAwesomeIcon icon={faPaperPlane} className="!size-[14px]" />}
                {busyRedirect ? 'Taking you to your dashboard...' : submitting ? 'Logging in...' : 'Log In'}
            </Button>
        </form>
    );
}

// ── Two-factor code (email login on a 2FA account) ──────────────────────────

function TwoFactorStep({
    challengeToken,
    onBack,
    onSuccess,
}: {
    challengeToken: string;
    onBack: () => void;
    onSuccess: (message?: string) => void;
}) {
    const [code, setCode] = React.useState('');
    const [trustDevice, setTrustDevice] = React.useState(false);
    const [verifying, setVerifying] = React.useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (verifying) return;
        if (code.trim().length < 6) {
            toast.error('Enter the 6-digit code from your authenticator app.');
            return;
        }
        setVerifying(true);
        const result = await verifyTwoFactor(challengeToken, code.trim(), trustDevice);
        setVerifying(false);
        if (!result.ok) {
            toast.error(result.message);
            setCode('');
            return;
        }
        onSuccess(result.message);
    };

    return (
        <>
            <button
                type="button"
                onClick={onBack}
                className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:underline"
            >
                <FontAwesomeIcon icon={faArrowLeft} className="!size-[11px]" /> Back
            </button>
            <div className="flex flex-col items-center text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <FontAwesomeIcon icon={faShieldHalved} className="!size-[20px] text-primary" />
                </span>
                <h2 className="break-words text-[21px] font-black tracking-tight text-foreground">
                    Enter your verification code
                </h2>
                <p className="mt-1.5 max-w-[320px] break-words text-[12.5px] text-muted-foreground">
                    Open your authenticator app and enter the 6-digit code, or use a backup code.
                </p>
            </div>

            <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
                <OtpInput value={code} onChange={setCode} autoFocus />
                <label className="mx-auto flex max-w-[320px] items-start gap-2.5 text-left">
                    <input
                        type="checkbox"
                        checked={trustDevice}
                        onChange={(event) => setTrustDevice(event.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="text-[12px] text-muted-foreground">
                        <span className="font-semibold text-foreground">Trust this device for 30 days.</span>{' '}
                        This browser will not ask for a code again until then.
                    </span>
                </label>
                <Button type="submit" disabled={verifying || code.trim().length < 6} className="h-11 w-full text-[13.5px] font-bold">
                    {verifying ? <Spinner /> : <FontAwesomeIcon icon={faKey} className="!size-[14px]" />}
                    {verifying ? 'Verifying...' : 'Verify & Continue'}
                </Button>
            </form>
        </>
    );
}

// ── Google sign-in: add a phone number to the account ───────────────────────

function MobileLinkStep({ token, onDone }: { token: string; onDone: () => void }) {
    const [dialCode, setDialCode] = React.useState('+91');
    const [mobile, setMobile] = React.useState('');
    const [otp, setOtp] = React.useState('');
    const [sent, setSent] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    const send = async () => {
        setBusy(true);
        const result = await mobileLinkStep('send-otp', { token, dial_code: dialCode, mobile });
        setBusy(false);
        if (!result.ok) {
            toast.error(result.message);
            return;
        }
        setSent(true);
        if (result.devCode) {
            setOtp(String(result.devCode));
            toast.message(`Development code: ${result.devCode}`);
        } else {
            toast.success('Verification code sent.');
        }
    };

    const verify = async () => {
        setBusy(true);
        const result = await mobileLinkStep('verify', { token, dial_code: dialCode, mobile, otp });
        setBusy(false);
        if (!result.ok) {
            toast.error(result.message);
            return;
        }
        onDone();
    };

    return (
        <>
            <h2 className="break-words text-[19px] font-black tracking-tight text-foreground">
                Verify your mobile number
            </h2>
            <p className="mt-1 break-words text-[12.5px] leading-5 text-muted-foreground">
                You are signed in with Google. Add a mobile number to finish setting up your account.
            </p>
            <div className="mt-5 flex flex-col gap-4">
                <MobileNumberField
                    id="link-mobile"
                    label="Mobile Number"
                    value={mobile}
                    onChange={setMobile}
                    dialCode={dialCode}
                    onDialCodeChange={setDialCode}
                />
                {sent && (
                    <div className="min-w-0">
                        <p className="mb-2 text-[12.5px] font-bold text-foreground">Enter the 6-digit code</p>
                        <OtpInput value={otp} onChange={setOtp} autoFocus />
                    </div>
                )}
                <Button
                    type="button"
                    onClick={sent ? verify : send}
                    disabled={busy || (sent ? otp.length !== 6 : mobile.trim().length < 7)}
                    className="h-11 w-full text-[13.5px] font-bold"
                >
                    {busy ? 'Please wait...' : sent ? 'Verify & Continue' : 'Send OTP'}
                </Button>
                <div className="flex items-center justify-between">
                    {sent ? (
                        <button
                            type="button"
                            onClick={send}
                            disabled={busy}
                            className="text-[12px] font-semibold text-primary hover:underline disabled:opacity-50"
                        >
                            Resend code
                        </button>
                    ) : (
                        <span />
                    )}
                    <button
                        type="button"
                        onClick={onDone}
                        className="text-[12px] font-semibold text-muted-foreground hover:underline"
                    >
                        Skip for now
                    </button>
                </div>
            </div>
        </>
    );
}
