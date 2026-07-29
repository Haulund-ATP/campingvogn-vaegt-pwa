import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { loadEnv } from "../lib/env.js";
import { getSessionFromRequest, isAdminSession, isAdminSessionStillValid, requireCsrf } from "../lib/auth.js";
import { Problems } from "../lib/problemDetails.js";
import { getSystemRow, updateSystemRow } from "../lib/repository.js";
import { generateToken, hmacHex } from "../lib/crypto.js";

async function requireAdmin(request: HttpRequest, env: ReturnType<typeof loadEnv>) {
  const session = getSessionFromRequest(request, env.sessionSigningSecret);
  if (!isAdminSession(session)) return { ok: false as const, response: Problems.unauthorized("Administratorsession kræves") };
  if (!(await isAdminSessionStillValid(env, session))) {
    return { ok: false as const, response: Problems.unauthorized("Administratorsessionen er ikke længere gyldig") };
  }
  return { ok: true as const, session };
}

app.http("adminSystemGet", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "admin/system",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;

    const system = await getSystemRow(env);
    if (!system) return Problems.internal("System ikke provisioneret");

    return {
      status: 200,
      jsonBody: {
        schemaVersion: system.fields.SchemaVersion,
        installationId: system.fields.InstallationId,
        globalAdminTokenVersion: system.fields.GlobalAdminTokenVersion,
        globalAdminTokenExpires: system.fields.GlobalAdminTokenExpires ?? null,
        publicBaseUrl: system.fields.PublicBaseUrl,
        createdAt: system.fields.CreatedAt,
        updatedAt: system.fields.UpdatedAt,
      },
    };
  },
});

app.http("adminGlobalTokenRotate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "admin/global-token/rotate",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    const env = loadEnv();
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;
    if (!requireCsrf(request)) return Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse");

    const system = await getSystemRow(env);
    if (!system) return Problems.internal("System ikke provisioneret");

    const globalAdminToken = generateToken();
    const globalAdminTokenHash = hmacHex(globalAdminToken, env.tokenHashPepper);
    const nextVersion = system.fields.GlobalAdminTokenVersion + 1;

    await updateSystemRow(env, system.itemId, {
      GlobalAdminTokenHash: globalAdminTokenHash,
      GlobalAdminTokenVersion: nextVersion,
    });

    return {
      status: 200,
      jsonBody: {
        globalAdminToken,
        globalAdminTokenVersion: nextVersion,
        adminUrl: `${env.publicAppUrl}/#action=admin&token=${globalAdminToken}`,
      },
    };
  },
});
