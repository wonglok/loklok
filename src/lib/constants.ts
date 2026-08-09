export const APP_NAME = "loklok";
export const VERSION = "0.1.0";
export const SCHEMA_VERSION = "loklok/1";

export const EXIT_CODES = {
  SUCCESS: 0,
  USER_ERROR: 1,
  SYSTEM_ERROR: 2,
  AUTH_ERROR: 3,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];
