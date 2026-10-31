/**
 * Sign-in calls for the portal's own /login page.
 *
 * Separate from `api-client.ts` on purpose. That client always sends the
 * session cookie (`credentials: 'include'`), but the backend answers some of
 * these endpoints with an open-to-any-site CORS policy, and a browser refuses
 * a credentialed request to one of those. So each call here says explicitly
 * whether it carries cookies:
 *
 *   with cookies     email login, 2FA verify, OTP verify  (they SET the session)
 *   without cookies  OTP request, mobile-link steps       (they set nothing)
 *
 * Mixing these up fails with a generic "could not reach the server".
 */

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1').replace(/\/$/, '');

type Failure = { ok: false; message: string };

async function post(
    path: string,
    body: unknown,
    withCookies: boolean,
    fallback: string,
): Promise<{ ok: true; message: string; data: any } | Failure> {
    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: withCookies ? 'include' : 'omit',
            body: JSON.stringify(body),
        });
        let json: any = null;
        try {
            json = await res.json();
        } catch {
            json = null;
        }
        if (!res.ok || !json?.success) return { ok: false, message: json?.message || fallback };
        return { ok: true, message: json.message || '', data: json.data ?? null };
    } catch {
        return { ok: false, message: 'Could not reach the server. Please try again.' };
    }
}

export interface OtpRequestResult {
    ok: boolean;
    message: string;
    /** Was the code actually sent (WhatsApp / SMS)? */
    delivered?: boolean;
    /** Local/dev only: the code itself, when it could not be delivered. */
    devCode?: string;
}

/** Step 1 of mobile sign-in: send a one-time code to the account's number. */
export async function requestLoginOtp(mobile: string, dialCode: string): Promise<OtpRequestResult> {
    const result = await post(
        '/public/website-clients/login/otp/request',
        { mobile, dial_code: dialCode },
        false,
        'Could not send the code. Please try again.',
    );
    if (!result.ok) return { ok: false, message: result.message };
    return {
        ok: true,
        message: result.message || 'Verification code sent.',
        delivered: result.data?.delivered,
        devCode: result.data?.dev_code,
    };
}

/** Step 2: check the code. Success sets the session cookie. */
export async function verifyLoginOtp(mobile: string, otp: string): Promise<{ ok: boolean; message: string }> {
    const result = await post(
        '/public/website-clients/login/otp/verify',
        { mobile, otp },
        true,
        'That code is not right. Please try again.',
    );
    return { ok: result.ok, message: result.message || 'Login successful' };
}

export interface EmailLoginResult {
    ok: boolean;
    message: string;
    /** The password was right but an authenticator code is still owed. */
    requiresTwoFactor?: boolean;
    challengeToken?: string;
}

/**
 * Email + password. A 2FA account answers `requires_2fa` INSTEAD of a session:
 * that is step one of two, not a login — the caller must show the code step.
 */
export async function loginWithEmail(email: string, password: string): Promise<EmailLoginResult> {
    const result = await post(
        '/public/website-clients/login',
        { email, password },
        true,
        'Invalid email or password.',
    );
    if (!result.ok) return { ok: false, message: result.message };
    if (result.data?.requires_2fa) {
        return {
            ok: true,
            message: result.message || 'Enter your two-factor code to finish signing in',
            requiresTwoFactor: true,
            challengeToken: result.data.challenge_token,
        };
    }
    return { ok: true, message: result.message || 'Login successful' };
}

/** Second half of a 2FA login. Success is what sets the session cookie. */
export async function verifyTwoFactor(
    challengeToken: string,
    code: string,
    trustDevice: boolean,
): Promise<{ ok: boolean; message: string }> {
    const result = await post(
        '/public/website-clients/login/2fa/verify',
        { challenge_token: challengeToken, code, trust_device: trustDevice },
        true,
        'That code is not right. Check your authenticator app and try again.',
    );
    return { ok: result.ok, message: result.message || 'Login successful' };
}

/**
 * After a Google sign-in, an account with no phone number adds one here.
 * `token` is the short-lived link token the backend put in the return URL.
 */
export async function mobileLinkStep(
    step: 'send-otp' | 'verify',
    body: { token: string; dial_code: string; mobile: string; otp?: string },
): Promise<{ ok: boolean; message: string; devCode?: string }> {
    const result = await post(
        `/public/website-clients/mobile/${step}`,
        body,
        false,
        'Something went wrong. Please try again.',
    );
    return {
        ok: result.ok,
        message: result.message,
        devCode: result.ok ? result.data?.dev_code : undefined,
    };
}

/** Starts Google sign-in: a full-page trip to the backend and back to /login. */
export function startGoogleSignIn() {
    const returnTo = `${window.location.origin}/login`;
    window.location.href =
        `${BASE_URL}/public/website-clients/oauth/google/start` +
        `?return_to=${encodeURIComponent(returnTo)}`;
}
