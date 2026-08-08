import express from "express";
import cors from "cors";
import viteExpress from "vite-express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { setupHealth } from "./backend/health";
import { setupBlender } from "./backend/blender";

// When bundled by tsup: import.meta.url = .../dist/index.js  →  ../src/web
// When running from source: import.meta.url = .../src/web/server.ts  →  .
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..", "src", "web");

interface StartServerOptions {
  port: number;
  host: string;
  mode: "development" | "production";
}

export async function startServer(
  opts: StartServerOptions,
): Promise<http.Server> {
  const app = express();

  // Body parsing (Express 5 no longer bundles this by default)
  app.use(express.json({ limit: "10GB" }));

  // CORS for REST API access from any origin
  app.use(cors());

  await setupHealth({ app });
  await setupBlender({ app });

  // Resolve web directory: env override or default to bundled location
  const webDir = process.env.LOKLOK_WEB_DIR ?? WEB_DIR;

  // vite-express resolves vite.config.* from process.cwd(), so chdir there
  process.chdir(webDir);

  viteExpress.config({
    mode: opts.mode === "production" ? "production" : "development",
  });

  // Create HTTP server manually so we control host; then bind Vite middleware
  const server = app.listen(opts.port, opts.host);

  viteExpress.bind(app, server);

  return server;
}
