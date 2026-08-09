import { Command } from "commander";
import { emit, finalize } from "../lib/output.js";
import { log } from "../lib/logger.js";
import { EXIT_CODES } from "../lib/constants.js";
import { startServer } from "../web/server.js";

export function registerWeb(program: Command): void {
  program
    .command("web")
    .description(
      "Launch the development web server (Express + Vite + React + TailwindCSS)",
    )
    .option("-p, --port <number>", "Port to listen on", parseNumeric, 3000)
    .option("-H, --host <string>", "Host to bind to", "localhost")
    .option("--no-open", "Skip opening the browser")
    .option("--prod", "Run in production mode (serve built assets, no HMR)")
    .action(async (opts) => {
      const startTime = Date.now();
      const { port, host, open: shouldOpen, prod } = opts;

      try {
        const server = await startServer({
          port,
          host,
          mode: prod ? "production" : "development",
        });

        const mode = prod ? "production" : "development";
        const url = `http://${host}:${port}`;

        log("info", `Server running at ${url} (${mode})`);

        if (shouldOpen) {
          const { default: openBrowser } = await import("open");
          await openBrowser(url);
        }

        // Emit structured output (non-exiting — server stays alive for agents to poll /api/health)
        emit({
          ok: true,
          data: { url, port, mode, pid: process.pid },
          command: "loklok web",
          startTime,
          exitCode: EXIT_CODES.SUCCESS,
        });

        // Graceful shutdown
        const shutdown = (signal: string) => {
          log("info", `Received ${signal}, shutting down…`);
          server.close(() => {
            process.exit(0);
          });
          process.exit(0);
        };
        process.on("SIGINT", () => shutdown("SIGINT"));
        process.on("SIGTERM", () => shutdown("SIGTERM"));
      } catch (err: any) {
        finalize({
          ok: false,
          error: {
            code: err.code ?? "SERVER_ERROR",
            message: err.message ?? String(err),
          },
          command: "loklok web",
          startTime,
          exitCode: EXIT_CODES.SYSTEM_ERROR,
        });
      }
    });
}

function parseNumeric(val: string): number {
  const n = parseInt(val, 10);
  if (isNaN(n)) throw new Error(`Expected a number, got: ${val}`);
  return n;
}
