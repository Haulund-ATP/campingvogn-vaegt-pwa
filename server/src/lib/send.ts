import type { Response } from "express";
import type { ApiResult } from "./problemDetails.js";

export function send(res: Response, result: ApiResult): void {
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      // set-cookie tilføjes, så cookies sat af middleware (sessionsfornyelse)
      // ikke overskrives af rutens egne cookies.
      if (key.toLowerCase() === "set-cookie") {
        res.append(key, value);
      } else {
        res.setHeader(key, value);
      }
    }
  }
  if (result.jsonBody === undefined) {
    res.status(result.status).end();
    return;
  }
  res.status(result.status).json(result.jsonBody);
}
