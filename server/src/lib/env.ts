function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Manglende application setting: ${name}`);
  return value;
}

export function loadEnv() {
  return {
    siteId: required("SHAREPOINT_SITE_ID"),
    entriesListId: required("ENTRIES_LIST_ID"),
    tripsListId: required("TRIPS_LIST_ID"),
    systemListId: required("SYSTEM_LIST_ID"),
    tokenHashPepper: required("TOKEN_HASH_PEPPER"),
    sessionSigningSecret: required("SESSION_SIGNING_SECRET"),
    rateLimitPepper: required("RATE_LIMIT_PEPPER"),
    publicAppUrl: required("PUBLIC_APP_URL"),
    // Kun til lokal udvikling: Managed Identity findes ikke uden for Azure,
    // så DefaultAzureCredential falder tilbage til Azure CLI/VS Code-login lokalt.
  };
}

export type Env = ReturnType<typeof loadEnv>;
