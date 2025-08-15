import chalk from 'chalk';

/**
 * Log formatting utilities for Apollo transport
 * Separates formatting logic from transport stream handling
 */

/**
 * Pino log levels as constants
 */
export const LOG_LEVELS = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60,
} as const;

/**
 * Icons for user-facing log levels
 */
export const LOG_ICONS = {
  ERROR: '❌',
  WARN: '⚠️ ',
  INFO: 'ℹ',
  SUCCESS: 'ℹ', // Success messages use INFO icon per requirements
} as const;

/**
 * Log entry structure from Pino
 */
export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  pid?: number;
  hostname?: string;
  [key: string]: unknown;
}

/**
 * Formatting options
 */
export interface FormatOptions {
  colorize?: boolean;
  translateTime?: string;
  stripColors?: boolean;
  levelFirst?: boolean;
  hideObject?: boolean;
}

/**
 * Format a user-facing message with appropriate icon and color
 * Used for INFO, WARN, ERROR levels (≥30)
 */
export function formatUserMessage(level: number, message: string, options: FormatOptions = {}): string {
  const { colorize = true, stripColors = false } = options;

  const icon = getIconForLevel(level);
  const baseMessage = `${icon} ${message}`;

  if (!colorize || stripColors) {
    return baseMessage;
  }

  // Apply colors based on level
  switch (level) {
    case LOG_LEVELS.ERROR:
    case LOG_LEVELS.FATAL:
      return chalk.red.bold(baseMessage);
    case LOG_LEVELS.WARN:
      return chalk.yellow.bold(baseMessage);
    case LOG_LEVELS.INFO:
      return chalk.blue(baseMessage);
    default:
      return baseMessage;
  }
}

/**
 * Format a developer message with timestamp
 * Used for DEBUG, TRACE levels (<30)
 */
export function formatDeveloperMessage(log: LogEntry, options: FormatOptions = {}): string {
  const {
    colorize = true,
    translateTime = 'HH:MM:ss',
    stripColors = false
  } = options;

  const timestamp = formatTimestamp(log.time, translateTime);
  const levelName = getLevelName(log.level);
  const prefix = `[${timestamp}] ${levelName}:`;
  const message = `${prefix} ${log.msg}`;

  if (!colorize || stripColors) {
    return message;
  }

  // Apply subtle coloring for developer messages
  switch (log.level) {
    case LOG_LEVELS.DEBUG:
      return chalk.gray(message);
    case LOG_LEVELS.TRACE:
      return chalk.gray.dim(message);
    default:
      return chalk.gray(message);
  }
}

/**
 * Get appropriate icon for log level
 */
function getIconForLevel(level: number): string {
  switch (level) {
    case LOG_LEVELS.ERROR:
    case LOG_LEVELS.FATAL:
      return LOG_ICONS.ERROR;
    case LOG_LEVELS.WARN:
      return LOG_ICONS.WARN;
    case LOG_LEVELS.INFO:
      return LOG_ICONS.INFO;
    default:
      return LOG_ICONS.INFO;
  }
}

/**
 * Format timestamp according to translateTime option
 */
export function formatTimestamp(time: number, translateTime = 'HH:MM:ss'): string {
  const date = new Date(time);

  switch (translateTime) {
    case 'HH:MM:ss':
      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC', // Use UTC to ensure consistent test results
      });
    case 'iso':
      return date.toISOString();
    case 'epoch':
      return String(time);
    default:
      // Custom format or fallback
      return date.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' });
  }
}

/**
 * Get human-readable level name from numeric level
 */
export function getLevelName(level: number): string {
  switch (level) {
    case LOG_LEVELS.FATAL: return 'FATAL';
    case LOG_LEVELS.ERROR: return 'ERROR';
    case LOG_LEVELS.WARN: return 'WARN';
    case LOG_LEVELS.INFO: return 'INFO';
    case LOG_LEVELS.DEBUG: return 'DEBUG';
    case LOG_LEVELS.TRACE: return 'TRACE';
    default: return 'UNKNOWN';
  }
}

/**
 * Determine if a log level should use user-friendly formatting
 */
export function isUserLevel(level: number): boolean {
  return level >= LOG_LEVELS.INFO;
}

/**
 * Determine if a log level should use developer formatting
 */
export function isDeveloperLevel(level: number): boolean {
  return level >= LOG_LEVELS.TRACE && level < LOG_LEVELS.INFO;
}

/**
 * Validate log entry structure
 */
export function validateLogEntry(log: unknown): log is LogEntry {
  if (!log || typeof log !== 'object') {
    return false;
  }
  
  const entry = log as Record<string, unknown>;
  
  return (
    (typeof entry.level === 'number' || typeof entry.level === 'string') &&
    typeof entry.msg === 'string' &&
    typeof entry.time === 'number'
  );
}

/**
 * Create a formatted log entry for testing purposes
 */
export function createTestLogEntry(level: number, message: string, time = Date.now()): LogEntry {
  return {
    level,
    msg: message,
    time,
    pid: process.pid,
    hostname: 'test',
  };
}
