import { isJsonMode } from './output.js'

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

/**
 * Log a message to stderr (never stdout).
 * In --json mode, logs are structured JSON lines.
 * In human mode, logs are plain text with optional level prefix.
 */
export function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (isJsonMode()) {
    process.stderr.write(
      JSON.stringify({ level, message, ...extra, ts: new Date().toISOString() }) + '\n',
    )
  } else {
    const prefix = level === 'info' ? '•' : level === 'warn' ? '⚠' : level === 'error' ? '✗' : '›'
    process.stderr.write(`${prefix} ${message}\n`)
  }
}
