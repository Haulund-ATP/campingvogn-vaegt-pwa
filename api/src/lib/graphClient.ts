// Application-only Microsoft Graph-klient via client credentials flow.
// Ingen tokens forlader nogensinde serveren.

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

async function acquireAppToken(config: GraphConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Kunne ikke hente Graph-token: HTTP ${response.status}`);
  }

  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

export class GraphError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSeconds?: number
  ) {
    super(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function graphFetch(
  config: GraphConfig,
  path: string,
  init: RequestInit = {},
  attempt = 0
): Promise<Response> {
  const token = await acquireAppToken(config);
  const url = path.startsWith("https://") ? path : `https://graph.microsoft.com/v1.0${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });

  if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
    if (attempt >= 4) {
      throw new GraphError(response.status, `Graph-kald fejlede efter gentagne forsøg: HTTP ${response.status}`);
    }
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
    const backoffMs = Math.max(retryAfterMs, 2 ** attempt * 300) + Math.random() * 250;
    await sleep(backoffMs);
    return graphFetch(config, path, init, attempt + 1);
  }

  if (!response.ok && response.status !== 404 && response.status !== 409) {
    const text = await response.text().catch(() => "");
    throw new GraphError(response.status, `Graph-kald fejlede: HTTP ${response.status} ${text}`);
  }

  return response;
}
