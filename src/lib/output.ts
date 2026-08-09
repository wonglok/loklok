import { EXIT_CODES, SCHEMA_VERSION, type ExitCode } from "./constants.js";

// ── JSON mode detection ──────────────────────────────────────────
// Agents pipe stdout → !isTTY triggers JSON mode automatically.
// LOKLOK_JSON env var or --json flag also force it.
// --no-json forces human mode even when piped.

let _jsonMode: boolean | null = null;
let _forceHuman = false;

export function setJsonMode(on: boolean): void {
  _jsonMode = on;
}

export function setForceHuman(on: boolean): void {
  _forceHuman = on;
}

export function isJsonMode(): boolean {
  if (_forceHuman) return false;
  if (_jsonMode !== null) return _jsonMode;
  // Default heuristic: piped stdout → agent → JSON
  return !process.stdout.isTTY || process.env.LOKLOK_JSON === "1";
}

// ── Envelope ─────────────────────────────────────────────────────

export interface JsonEnvelope<T = unknown> {
  schema: string;
  ok: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  meta: {
    tool: string;
    command: string;
    durationMs: number;
    timestamp: string;
  };
}

export interface OutputOpts<T = unknown> {
  ok: boolean;
  data?: T | null;
  error?: { code: string; message: string } | null;
  command: string;
  startTime: number;
  exitCode: ExitCode;
}

function buildEnvelope<T>(opts: OutputOpts<T>): JsonEnvelope<T> {
  return {
    schema: SCHEMA_VERSION,
    ok: opts.ok,
    data: opts.data ?? null,
    error: opts.error ?? null,
    meta: {
      tool: "loklok",
      command: opts.command,
      durationMs: Date.now() - opts.startTime,
      timestamp: new Date().toISOString(),
    },
  };
}

function writeEnvelope<T>(envelope: JsonEnvelope<T>): void {
  if (isJsonMode()) {
    process.stdout.write(JSON.stringify(envelope) + "\n");
  } else {
    if (envelope.ok && envelope.data !== null) {
      if (typeof envelope.data === "string") {
        process.stdout.write(envelope.data + "\n");
      } else {
        process.stdout.write(JSON.stringify(envelope.data, null, 2) + "\n");
      }
    }
    if (!envelope.ok && envelope.error) {
      process.stderr.write(
        `${envelope.error.code}: ${envelope.error.message}\n`,
      );
    }
  }
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Write envelope to stdout and exit with the given code.
 * Use for terminal commands (help, create-3d-world, info).
 */
export function finalize<T>(opts: OutputOpts<T>): never {
  writeEnvelope(buildEnvelope(opts));
  process.exit(opts.exitCode);
}

/**
 * Write envelope to stdout and return it.
 * Use for long-running commands (web) that need to report
 * success then stay alive.
 */
export function emit<T>(opts: OutputOpts<T>): JsonEnvelope<T> {
  const envelope = buildEnvelope(opts);
  writeEnvelope(envelope);
  return envelope;
}
