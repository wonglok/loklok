import { Command } from "commander";
import os from "node:os";
import { finalize } from "../lib/output.js";
import { EXIT_CODES, VERSION } from "../lib/constants.js";

export function registerInfo(program: Command): void {
  program
    .command("info")
    .description("Show environment diagnostics (useful for AI agents)")
    .action(() => {
      const startTime = Date.now();

      finalize({
        ok: true,
        data: {
          tool: "loklok",
          version: VERSION,
          runtime: {
            node: process.version,
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            memory: {
              total: os.totalmem(),
              free: os.freemem(),
            },
          },
          env: {
            cwd: process.cwd(),
            shell: process.env.SHELL ?? null,
            home: os.homedir(),
            tmp: os.tmpdir(),
          },
          process: {
            pid: process.pid,
            ppid: process.ppid,
            uptime: process.uptime(),
          },
        },
        command: "loklok info",
        startTime,
        exitCode: EXIT_CODES.SUCCESS,
      });
    });
}
