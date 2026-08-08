import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { finalize, isJsonMode } from "../lib/output.js";
import { log } from "../lib/logger.js";
import { EXIT_CODES } from "../lib/constants.js";

const TEMPLATE_REPO = "https://github.com/wonglok/loklok-3d-world-template";

export function registerCreate3dWorld(program: Command): void {
  program
    .command("create-3d-world")
    .description(
      "Clone the loklok 3D world template into the current or specified directory",
    )
    .option(
      "-d, --dir <path>",
      "Target directory to clone into (defaults to cwd)",
    )
    .action(async (opts) => {
      const startTime = Date.now();
      const targetDir = opts.dir ? path.resolve(opts.dir) : process.cwd();

      if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
        finalize({
          ok: false,
          error: {
            code: "DIR_NOT_EMPTY",
            message: `Target directory is not empty: ${targetDir}`,
          },
          command: "loklok create-3d-world",
          startTime,
          exitCode: EXIT_CODES.USER_ERROR,
        });
      }

      log("info", `Cloning ${TEMPLATE_REPO} into ${targetDir}…`);

      try {
        await runGitClone(targetDir);
        log("info", `Cloned into ${targetDir}`);

        finalize({
          ok: true,
          data: { repo: TEMPLATE_REPO, dir: targetDir },
          command: "loklok create-3d-world",
          startTime,
          exitCode: EXIT_CODES.SUCCESS,
        });
      } catch (err: any) {
        finalize({
          ok: false,
          error: {
            code: "GIT_CLONE_FAILED",
            message: err.message ?? String(err),
          },
          command: "loklok create-3d-world",
          startTime,
          exitCode: EXIT_CODES.SYSTEM_ERROR,
        });
      }
    });
}

function runGitClone(targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["clone", TEMPLATE_REPO, targetDir], {
      stdio: isJsonMode() ? "pipe" : "inherit",
    });

    let stderr = "";
    if (child.stderr) {
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
    }

    child.on("close", (code) => {
      code === 0
        ? resolve()
        : reject(new Error(stderr || `git clone exited with code ${code}`));
    });
    child.on("error", (err) =>
      reject(new Error(`Failed to spawn git: ${err.message}`)),
    );
  });
}
