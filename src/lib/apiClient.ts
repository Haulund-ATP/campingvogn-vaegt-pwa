import { CSRF_META_KEY, setMeta } from "./offlineQueue";

const CSRF_COOKIE_NAME = "cv_csrf";
const CSRF_HEADER_NAME = "x-cv-csrf";

// Containeren kører scale-to-zero, så det første kald efter en pause skal have
// tid til at vække den. Efterfølgende kald svarer på under et sekund.
const DEFAULT_TIMEOUT_MS = 25_000;
const RETRY_DELAYS_MS = [800, 2_000, 5_000];

// Statuskoder der kan skyldes en container under opstart eller et kortvarigt glip
// i infrastrukturen. 429 gentages ikke — der skal brugeren vente.
const TRANSIENT_STATUS = new Set([408, 425, 500, 502, 503, 504]);

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
  status: number;
  title: string;
  detail?: string;

  constructor(status: number, title: string, detail?: string) {
    super(detail ?? title);
    this.status = status;
    this.title = title;
    this.detail = detail;
  }

  get isTransient(): boolean {
    return TRANSIENT_STATUS.has(this.status);
  }

  /**
   * Kaldet kan lykkes senere, men skal ikke gentages med det samme.
   * 429 hører her: registreringen skal bevares i køen, ikke kasseres.
   */
  get isRetryableLater(): boolean {
    return this.isTransient || this.status === 429;
  }

  /** Sessionen findes ikke længere — brugeren skal scanne QR-koden igen. */
  get isSessionLost(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Ingen forbindelse, eller serveren svarede ikke inden for tidsgrænsen. */
export class OfflineError extends Error {
  timedOut: boolean;

  constructor(timedOut: boolean) {
    super(timedOut ? "Serveren svarede ikke i tide" : "Ingen forbindelse");
    this.timedOut = timedOut;
  }
}

export interface AttemptFailure {
  attempt: number;
  attemptsLeft: number;
  error: OfflineError | ApiError;
}

export interface RequestOptions {
  /**
   * Gentag ved forbigående fejl. Slå kun til for idempotente kald: GET og
   * POST /entries (samme EntryId ⇒ samme resultat) samt tokenudveksling.
   */
  retry?: boolean;
  timeoutMs?: number;
  onAttemptFailed?: (failure: AttemptFailure) => void;
  signal?: AbortSignal;
}

function isTransient(error: unknown): boolean {
  if (error instanceof OfflineError) return true;
  return error instanceof ApiError && error.isTransient;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new OfflineError(false));
      },
      { once: true }
    );
  });
}

async function attempt<T>(path: string, init: RequestInit, options: RequestOptions): Promise<T> {
  const isMutating = Boolean(init.method) && init.method !== "GET";
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");

  if (isMutating) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      headers.set(CSRF_HEADER_NAME, csrfToken);
      // Service workeren kan ikke læse cookies på alle platforme, men skal kunne
      // sende køen i baggrunden — derfor spejles tokenet til IndexedDB.
      void setMeta(CSRF_META_KEY, csrfToken).catch(() => undefined);
    }
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(new OfflineError(true)), timeoutMs);
  options.signal?.addEventListener("abort", () => controller.abort(options.signal?.reason), { once: true });

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers,
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.reason instanceof OfflineError) throw controller.signal.reason;
    throw new OfflineError(false);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("json") ? await response.json() : undefined;

  if (!response.ok) {
    throw new ApiError(response.status, body?.title ?? "Fejl", body?.detail);
  }

  return body as T;
}

async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const maxAttempts = options.retry ? RETRY_DELAYS_MS.length + 1 : 1;

  for (let i = 1; ; i++) {
    try {
      return await attempt<T>(path, init, options);
    } catch (err) {
      const attemptsLeft = maxAttempts - i;
      if (!isTransient(err) || attemptsLeft <= 0) throw err;

      options.onAttemptFailed?.({ attempt: i, attemptsLeft, error: err as OfflineError | ApiError });
      await delay(RETRY_DELAYS_MS[i - 1], options.signal);
    }
  }
}

function body(data: unknown): string | undefined {
  return data !== undefined ? JSON.stringify(data) : undefined;
}

export const api = {
  get: <T>(path: string, options: RequestOptions = { retry: true }) => request<T>(path, {}, options),
  post: <T>(path: string, data?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { method: "POST", body: body(data) }, options),
  put: <T>(path: string, data?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { method: "PUT", body: body(data) }, options),
};
