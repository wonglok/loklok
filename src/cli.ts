import { Command } from "commander";
import { APP_NAME, VERSION } from "./lib/constants.js";
import { setJsonMode, setForceHuman } from "./lib/output.js";
import { registerHelp } from "./commands/help.js";
import { registerWeb } from "./commands/web.js";
import { registerCreate3dWorld } from "./commands/create-3d-world.js";
import { registerInfo } from "./commands/info.js";

const program = new Command();

program
  .name(APP_NAME)
  .version(VERSION)
  .description(
    "AI‑Agent‑Optimized CLI — structured output, predictable behaviour, zero prompts",
  )
  .option("--json", "Force JSON output (auto-detected when stdout is piped)")
  .option("--no-json", "Force human-readable output even when piped")
  .exitOverride()
  .hook("preAction", (cmd) => {
    const opts = cmd.opts();
    if (opts.json === false) {
      // --no-json was explicitly passed
      setForceHuman(true);
    } else if (opts.json === true) {
      // --json was explicitly passed
      setJsonMode(true);
    }
    // Otherwise, auto-detect via isJsonMode() (TTY check)
  });

registerHelp(program);
registerWeb(program);
registerCreate3dWorld(program);
registerInfo(program);

try {
  program.parse();
} catch (err: any) {
  // Commander's exitOverride() throws CommanderError for --help and --version.
  // These are expected — just exit with the code Commander intended.
  if (
    err?.code === "commander.help" ||
    err?.code === "commander.version" ||
    err?.code === "commander.helpDisplayed"
  ) {
    process.exit(err.exitCode ?? 0);
  }
  // Real errors — let them crash so the agent sees them
  throw err;
}
