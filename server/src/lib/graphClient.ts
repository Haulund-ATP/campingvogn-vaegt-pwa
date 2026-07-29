// Microsoft Graph-klient der bruger Container Appens system-assigned Managed Identity —
// intet Entra client secret findes nogen steder i denne løsning.
// Lokalt (uden for Azure) falder DefaultAzureCredential tilbage til Azure CLI-login.

import { DefaultAzureCredential } from "@azure/identity";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

const credential = new DefaultAzureCredential();

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

async function acquireAppToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.accessToken;
  }

  const tokenResponse = await credential.getToken(GRAPH_SCOPE);
  if (!tokenResponse) {
    throw new Error("Kunne ikke hente Graph-token via Managed Identity");
  }

  cachedToken = {
    accessToken: tokenResponse.token,
    expiresAt: tokenResponse.expiresOnTimestamp,
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
  path: string,
  init: RequestInit = {},
  attempt = 0,
  authRetried = false
): Promise<Response> {
  const token = await acquireAppToken();
  const url = path.startsWith("https://") ? path : `https://graph.microsoft.com/v1.0${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });

  if (response.status === 401 && !authRetried) {
    // Det cachede token kan være udstedt uden de forventede claims (fx pga. forsinket
    // AAD-replikering lige efter en frisk container-instans' allerførste token-hentning).
    // Kassér cachen og hent et helt nyt token én gang, før vi giver op.
    cachedToken = null;
    await acquireAppToken(true);
    return graphFetch(path, init, attempt, true);
  }

  if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
    if (attempt >= 4) {
      throw new GraphError(response.status, `Graph-kald fejlede efter gentagne forsøg: HTTP ${response.status}`);
    }
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
    const backoffMs = Math.max(retryAfterMs, 2 ** attempt * 300) + Math.random() * 250;
    await sleep(backoffMs);
    return graphFetch(path, init, attempt + 1, authRetried);
  }

  if (!response.ok && response.status !== 404 && response.status !== 409) {
    const text = await response.text().catch(() => "");
    throw new GraphError(response.status, `Graph-kald fejlede: HTTP ${response.status} ${text}`);
  }

  return response;
}
