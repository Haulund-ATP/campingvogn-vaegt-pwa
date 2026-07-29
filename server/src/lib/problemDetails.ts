import { randomUUID } from "node:crypto";
import type { ProblemDetails } from "../shared/types.js";

const PROBLEM_CONTENT_TYPE = "application/problem+json";

export interface ApiResult {
  status: number;
  jsonBody: unknown;
  headers?: Record<string, string | string[]>;
}

export function problem(status: number, title: string, detail?: string, instance?: string): ApiResult {
  const body: ProblemDetails = {
    type: `https://c.h-aa.dk/problems/${status}`,
    title,
    status,
    detail,
    instance,
    correlationId: randomUUID(),
  };
  return {
    status,
    jsonBody: body,
    headers: { "content-type": PROBLEM_CONTENT_TYPE },
  };
}

export const Problems = {
  badRequest: (detail?: string, instance?: string) => problem(400, "Ugyldig forespørgsel", detail, instance),
  unauthorized: (detail?: string, instance?: string) => problem(401, "Ikke godkendt", detail, instance),
  forbidden: (detail?: string, instance?: string) => problem(403, "Adgang nægtet", detail, instance),
  notFound: (detail?: string, instance?: string) => problem(404, "Ikke fundet", detail, instance),
  conflict: (detail?: string, instance?: string) => problem(409, "Konflikt", detail, instance),
  tooManyRequests: (detail?: string, instance?: string) => problem(429, "For mange forsøg", detail, instance),
  internal: (detail?: string, instance?: string) => problem(500, "Intern serverfejl", detail, instance),
};
