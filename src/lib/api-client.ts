/**
 * The single point where this panel talks to the Event Management backend.
 *
 * Every hook goes through `api.get/post/put/patch/del` — nothing calls `fetch`
 * directly. That way the base URL, the auth mode and the error shape are
 * decided in one file instead of being re-invented per module.
 *
 * AUTH — this panel has no login screen of its own. The visitor signs in
 * elsewhere and arrives here with the backend's session cookie already set, so
 * every request sends `credentials: 'include'` and carries that cookie. Two
 * consequences worth knowing:
 *
 *   1. The backend's CORS whitelist (FRONTEND_URL in the backend .env) must
 *      contain this panel's exact origin, or the browser drops the response
 *      before your code ever sees it. localhost:3005 is already listed.
 *   2. A missing/expired cookie surfaces as a 401. `ApiError.isAuthError` lets
 *      a caller show "your session has expired" rather than a generic failure.
 */

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1').replace(/\/$/, '');

/** The envelope every endpoint in this backend returns. */
export interface ApiEnvelope<T> {
    success: boolean;
    message?: string;
    data: T;
}

/**
 * List endpoints put `pagination` as a SIBLING of `data`, not inside it:
 *
 *   { success, message, data: [ ...rows ], pagination: {...}, timestamp }
 *
 * so `api.get()` (which unwraps `.data`) hands back the plain array. Use
 * `api.getList()` when the pagination block is needed too.
 */
export interface Pagination {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

export interface ListResult<T> {
    data: T[];
    pagination: Pagination | null;
}

export class ApiError extends Error {
    readonly status: number;
    readonly payload: unknown;

    constructor(status: number, message: string, payload?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.payload = payload;
    }

    /** 401/403 — not signed in, or signed in without the right permission. */
    get isAuthError() {
        return this.status === 401 || this.status === 403;
    }
}

type Query = Record<string, string | number | boolean | null | undefined>;

/** Drops empty values so `?search=` never reaches the backend as a real filter. */
function buildUrl(path: string, query?: Query) {
    const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    if (!query) return url;

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        params.append(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query, raw = false): Promise<T> {
    let res: Response;
    try {
        res = await fetch(buildUrl(path, query), {
            method,
            // Sends the backend session cookie cross-origin. Without this the
            // request is anonymous and every protected route answers 401.
            credentials: 'include',
            /*
              FormData goes through UNTOUCHED, and deliberately without a
              Content-Type.

              Stringifying it would send "[object FormData]"; setting
              'multipart/form-data' by hand is worse, because the header must
              carry a generated boundary and one written by hand has none — the
              server then cannot split the parts and reports an empty upload
              with nothing explaining why. Letting the browser set it is the
              only correct option.
            */
            headers:
                body === undefined || body instanceof FormData
                    ? undefined
                    : { 'Content-Type': 'application/json' },
            body:
                body === undefined
                    ? undefined
                    : body instanceof FormData
                        ? body
                        : JSON.stringify(body),
        });
    } catch {
        // fetch only rejects on network/CORS failure — never on a 4xx/5xx.
        throw new ApiError(0, 'Cannot reach the server. Check that the backend is running.');
    }

    // 204 and other empty bodies would make res.json() throw.
    const text = await res.text();
    const payload = text ? safeParse(text) : null;

    if (!res.ok) {
        const message =
            (payload as { message?: string } | null)?.message ||
            `Request failed (${res.status})`;
        throw new ApiError(res.status, message, payload);
    }

    // `raw` keeps the whole envelope, because pagination lives beside `data`
    // rather than inside it and would be thrown away by the unwrap.
    if (raw) return payload as T;

    // Unwrap the { success, message, data } envelope so callers deal in data.
    const env = payload as ApiEnvelope<T> | null;
    return (env && 'data' in env ? env.data : (payload as T));
}

function safeParse(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        // An HTML error page (a proxy 502, or a wrong BASE_URL hitting a web
        // server) would otherwise throw an unreadable SyntaxError.
        return { message: text.slice(0, 200) };
    }
}

/**
 * A multipart upload that reports how much has been SENT (0–100). `fetch` has no
 * upload progress, so this one call uses XMLHttpRequest — same base URL, cookie,
 * envelope unwrap and ApiError as `request` (Upload Media %, 2026-11-06).
 */
function upload<T>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', buildUrl(path));
        xhr.withCredentials = true;
        if (onProgress) {
            xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100))); };
        }
        xhr.onerror = () => reject(new ApiError(0, 'Cannot reach the server. Check that the backend is running.'));
        xhr.onload = () => {
            const payload = xhr.responseText ? safeParse(xhr.responseText) : null;
            if (xhr.status < 200 || xhr.status >= 300) {
                const message = (payload as { message?: string } | null)?.message || `Request failed (${xhr.status})`;
                reject(new ApiError(xhr.status, message, payload));
                return;
            }
            const env = payload as ApiEnvelope<T> | null;
            resolve(env && typeof env === 'object' && 'data' in env ? env.data : (payload as T));
        };
        xhr.send(form);
    });
}

export const api = {
    upload,
    get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),

    /**
     * A list endpoint, returning rows AND pagination.
     *
     * `data` is normalised to an array even when the endpoint answers with
     * something unexpected, so a caller can always `.map()` without guarding —
     * an undefined here is what produced the "cannot read 'find' of undefined"
     * crash when this was typed as a nested object.
     */
    getList: async <T>(path: string, query?: Query): Promise<ListResult<T>> => {
        const env = await request<{ data?: T[]; pagination?: Pagination }>(
            'GET', path, undefined, query, true
        );
        return {
            data: Array.isArray(env?.data) ? env.data : [],
            pagination: env?.pagination ?? null,
        };
    },
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    /**
     * DELETE carries an optional body — the account-closure route re-confirms
     * identity (a password, or the account's own email for a social-only
     * client), and that confirmation cannot travel in the URL where it would
     * land in server and proxy access logs.
     */
    del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};
