const CSRF_COOKIE_NAME = "cv_csrf";
const CSRF_HEADER_NAME = "x-cv-csrf";

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
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isMutating = init.method && init.method !== "GET";
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (isMutating) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("json") ? await response.json() : undefined;

  if (!response.ok) {
    throw new ApiError(response.status, body?.title ?? "Fejl", body?.detail);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: data !== undefined ? JSON.stringify(data) : undefined }),
};
