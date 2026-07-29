import { Router, type Request } from "express";
import { loadEnv } from "../lib/env.js";
import { getSessionFromRequest, isAdminSession, isAdminSessionStillValid, requireCsrf } from "../lib/auth.js";
import { Problems } from "../lib/problemDetails.js";
import { getSystemRow, updateSystemRow } from "../lib/repository.js";
import { generateToken, hmacHex } from "../lib/crypto.js";
import { send } from "../lib/send.js";

async function requireAdmin(request: Request, env: ReturnType<typeof loadEnv>) {
  const session = getSessionFromRequest(request, env.sessionSigningSecret);
  if (!isAdminSession(session)) return { ok: false as const, response: Problems.unauthorized("Administratorsession kræves") };
  if (!(await isAdminSessionStillValid(env, session))) {
    return { ok: false as const, response: Problems.unauthorized("Administratorsessionen er ikke længere gyldig") };
  }
  return { ok: true as const, session };
}

export const adminSystemRouter = Router();

adminSystemRouter.get("/admin/system", async (req, res) => {
  const env = loadEnv();
  const auth = await requireAdmin(req, env);
  if (!auth.ok) return send(res, auth.response);

  const system = await getSystemRow(env);
  if (!system) return send(res, Problems.internal("System ikke provisioneret"));

  send(res, {
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
  });
});

adminSystemRouter.post("/admin/global-token/rotate", async (req, res) => {
  const env = loadEnv();
  const auth = await requireAdmin(req, env);
  if (!auth.ok) return send(res, auth.response);
  if (!requireCsrf(req)) return send(res, Problems.forbidden("Manglende eller ugyldig CSRF-beskyttelse"));

  const system = await getSystemRow(env);
  if (!system) return send(res, Problems.internal("System ikke provisioneret"));

  const globalAdminToken = generateToken();
  const globalAdminTokenHash = hmacHex(globalAdminToken, env.tokenHashPepper);
  const nextVersion = system.fields.GlobalAdminTokenVersion + 1;

  await updateSystemRow(env, system.itemId, {
    GlobalAdminTokenHash: globalAdminTokenHash,
    GlobalAdminTokenVersion: nextVersion,
  });

  send(res, {
    status: 200,
    jsonBody: {
      globalAdminToken,
      globalAdminTokenVersion: nextVersion,
      adminUrl: `${env.publicAppUrl}/#action=admin&token=${globalAdminToken}`,
    },
  });
});
