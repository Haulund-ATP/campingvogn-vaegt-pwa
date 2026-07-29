import "express-async-errors";
import express, { type ErrorRequestHandler } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessionsRouter } from "./routes/sessions.js";
import { statusRouter } from "./routes/status.js";
import { entriesRouter } from "./routes/entries.js";
import { adminTripsRouter } from "./routes/adminTrips.js";
import { adminSystemRouter } from "./routes/adminSystem.js";
import { Problems } from "./lib/problemDetails.js";
import { send } from "./lib/send.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/dist/app.js -> ../../dist er den byggede frontend (repo-roden/dist)
const staticDir = path.resolve(__dirname, "../../dist");

export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'"
    );
    next();
  });

  const api = express.Router();
  api.use(sessionsRouter);
  api.use(statusRouter);
  api.use(entriesRouter);
  api.use(adminTripsRouter);
  api.use(adminSystemRouter);
  app.use("/api", api);

  // Statiske assets (aldrig /api/*) med langtidscache; index.html cached ikke.
  app.use(
    express.static(staticDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (!filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );

  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    console.error(`Uhåndteret fejl på ${req.method} ${req.path}:`, err);
    send(res, Problems.internal("Der opstod en uventet serverfejl", req.path));
  };
  app.use(errorHandler);

  return app;
}
