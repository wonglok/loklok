import { Command } from "commander";
import { finalize, isJsonMode } from "../lib/output.js";
import { EXIT_CODES } from "../lib/constants.js";

interface CommandOption {
  flag: string;
  description: string;
  default?: unknown;
}

interface CommandSchema {
  name: string;
  description: string;
  usage: string;
  options: CommandOption[];
}

export function registerHelp(program: Command): void {
  program
    .command("help")
    .description("Show all available commands and their usage")
    .argument("[command]", "Name of a subcommand to get detailed help for")
    .action((cmdName: string | undefined) => {
      const startTime = Date.now();

      if (cmdName) {
        const target = program.commands.find((c) => c.name() === cmdName);
        if (!target) {
          finalize({
            ok: false,
            error: {
              code: "UNKNOWN_COMMAND",
              message: `Unknown command: ${cmdName}. Run 'loklok help' to see all commands.`,
            },
            command: `loklok help ${cmdName}`,
            startTime,
            exitCode: EXIT_CODES.USER_ERROR,
          });
        }

        // In JSON mode, return structured schema for this subcommand
        if (isJsonMode()) {
          finalize({
            ok: true,
            data: buildCommandSchema(target),
            command: `loklok help ${cmdName}`,
            startTime,
            exitCode: EXIT_CODES.SUCCESS,
          });
        }

        // Human mode: delegate to Commander's built-in help
        target.outputHelp();
        process.exit(0);
      }

      // List all commands
      const commands: CommandSchema[] = program.commands
        .filter((c) => !c.name().startsWith("_"))
        .map(buildCommandSchema);

      finalize({
        ok: true,
        data: { commands },
        command: "loklok help",
        startTime,
        exitCode: EXIT_CODES.SUCCESS,
      });
    });
}

function buildCommandSchema(cmd: Command): CommandSchema {
  return {
    name: cmd.name(),
    description: cmd.description(),
    usage: cmd.usage(),
    options: cmd.options
      .filter((o) => !o.hidden && !o.attributeName().startsWith("_"))
      .map((o) => ({
        flag: o.flags,
        description: o.description,
        default: o.defaultValue,
      })),
  };
}
