import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import {
  formatUserMessage,
  formatDeveloperMessage,
  formatTimestamp,
  getLevelName,
  isUserLevel,
  isDeveloperLevel,
  validateLogEntry,
  createTestLogEntry,
  LOG_LEVELS,
  LOG_ICONS,
  type LogEntry,
} from '../../../src/utils/log-formatter.js';

// Force chalk to use colors in tests
beforeAll(() => {
  chalk.level = 1; // Force basic color support
});

describe('log-formatter', () => {
  describe('formatUserMessage', () => {
    it('formats INFO messages with icon and blue color', () => {
      const result = formatUserMessage(LOG_LEVELS.INFO, 'Test message', { colorize: true });
      expect(result).toContain('ℹ Test message');
      expect(result).toContain('\u001b[34m'); // Blue color code
    });

    it('formats WARN messages with icon and yellow color', () => {
      const result = formatUserMessage(LOG_LEVELS.WARN, 'Warning message', { colorize: true });
      expect(result).toContain('⚠️  Warning message');
      expect(result).toContain('\u001b[33m'); // Yellow color code
    });

    it('formats ERROR messages with icon and red color', () => {
      const result = formatUserMessage(LOG_LEVELS.ERROR, 'Error message', { colorize: true });
      expect(result).toContain('❌ Error message');
      expect(result).toContain('\u001b[31m'); // Red color code
    });

    it('formats messages without color when colorize is false', () => {
      const result = formatUserMessage(LOG_LEVELS.INFO, 'Test message', { colorize: false });
      expect(result).toBe('ℹ Test message');
      expect(result).not.toContain('\u001b['); // No color codes
    });

    it('strips colors when stripColors is true', () => {
      const result = formatUserMessage(LOG_LEVELS.INFO, 'Test message', { colorize: true, stripColors: true });
      expect(result).toBe('ℹ Test message');
      expect(result).not.toContain('\u001b['); // No color codes
    });
  });

  describe('formatDeveloperMessage', () => {
    const testLog: LogEntry = {
      level: LOG_LEVELS.DEBUG,
      time: new Date('2023-01-01T12:00:00Z').getTime(),
      msg: 'Debug message',
      pid: 1234,
      hostname: 'test',
    };

    it('formats DEBUG messages with timestamp and gray color', () => {
      const result = formatDeveloperMessage(testLog, { colorize: true });
      expect(result).toMatch(/\[12:00:00\] DEBUG: Debug message/);
      expect(result).toContain('\u001b[90m'); // Gray color code
    });

    it('formats TRACE messages with dim gray color', () => {
      const traceLog = { ...testLog, level: LOG_LEVELS.TRACE };
      const result = formatDeveloperMessage(traceLog, { colorize: true });
      expect(result).toMatch(/\[12:00:00\] TRACE: Debug message/);
      expect(result).toContain('\u001b[2m'); // Dim modifier
    });

    it('formats messages without color when colorize is false', () => {
      const result = formatDeveloperMessage(testLog, { colorize: false });
      expect(result).toMatch(/\[\d{2}:\d{2}:\d{2}\] DEBUG: Debug message/);
      expect(result).not.toContain('\u001b['); // No color codes
    });

    it('uses custom timestamp format', () => {
      const result = formatDeveloperMessage(testLog, { translateTime: 'iso' });
      expect(result).toContain('2023-01-01T12:00:00.000Z');
    });
  });

  describe('formatTimestamp', () => {
    const testTime = new Date('2023-01-01T12:34:56Z').getTime();

    it('formats HH:MM:ss by default', () => {
      const result = formatTimestamp(testTime);
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
      expect(result).toBe('12:34:56'); // UTC time
    });

    it('formats ISO timestamp', () => {
      const result = formatTimestamp(testTime, 'iso');
      expect(result).toBe('2023-01-01T12:34:56.000Z');
    });

    it('formats epoch timestamp', () => {
      const result = formatTimestamp(testTime, 'epoch');
      expect(result).toBe(String(testTime));
    });
  });

  describe('getLevelName', () => {
    it('returns correct level names', () => {
      expect(getLevelName(LOG_LEVELS.TRACE)).toBe('TRACE');
      expect(getLevelName(LOG_LEVELS.DEBUG)).toBe('DEBUG');
      expect(getLevelName(LOG_LEVELS.INFO)).toBe('INFO');
      expect(getLevelName(LOG_LEVELS.WARN)).toBe('WARN');
      expect(getLevelName(LOG_LEVELS.ERROR)).toBe('ERROR');
      expect(getLevelName(LOG_LEVELS.FATAL)).toBe('FATAL');
    });

    it('returns UNKNOWN for invalid levels', () => {
      expect(getLevelName(999)).toBe('UNKNOWN');
    });
  });

  describe('level classification', () => {
    it('correctly identifies user levels', () => {
      expect(isUserLevel(LOG_LEVELS.INFO)).toBe(true);
      expect(isUserLevel(LOG_LEVELS.WARN)).toBe(true);
      expect(isUserLevel(LOG_LEVELS.ERROR)).toBe(true);
      expect(isUserLevel(LOG_LEVELS.DEBUG)).toBe(false);
      expect(isUserLevel(LOG_LEVELS.TRACE)).toBe(false);
    });

    it('correctly identifies developer levels', () => {
      expect(isDeveloperLevel(LOG_LEVELS.DEBUG)).toBe(true);
      expect(isDeveloperLevel(LOG_LEVELS.TRACE)).toBe(true);
      expect(isDeveloperLevel(LOG_LEVELS.INFO)).toBe(false);
      expect(isDeveloperLevel(LOG_LEVELS.WARN)).toBe(false);
    });
  });

  describe('validateLogEntry', () => {
    it('validates correct log entries', () => {
      const validLog = createTestLogEntry(LOG_LEVELS.INFO, 'Test message');
      expect(validateLogEntry(validLog)).toBe(true);
    });

    it('rejects invalid log entries', () => {
      expect(validateLogEntry(null)).toBe(false);
      expect(validateLogEntry({})).toBe(false);
      expect(validateLogEntry({ level: 'invalid' })).toBe(false);
      expect(validateLogEntry({ level: 30, msg: 123 })).toBe(false);
      expect(validateLogEntry({ level: 30, msg: 'test' })).toBe(false); // missing time
    });
  });

  describe('createTestLogEntry', () => {
    it('creates valid log entries', () => {
      const entry = createTestLogEntry(LOG_LEVELS.INFO, 'Test message');
      expect(validateLogEntry(entry)).toBe(true);
      expect(entry.level).toBe(LOG_LEVELS.INFO);
      expect(entry.msg).toBe('Test message');
      expect(typeof entry.time).toBe('number');
    });

    it('uses custom timestamp', () => {
      const customTime = 1234567890;
      const entry = createTestLogEntry(LOG_LEVELS.INFO, 'Test', customTime);
      expect(entry.time).toBe(customTime);
    });
  });

  describe('constants', () => {
    it('has correct log levels', () => {
      expect(LOG_LEVELS.TRACE).toBe(10);
      expect(LOG_LEVELS.DEBUG).toBe(20);
      expect(LOG_LEVELS.INFO).toBe(30);
      expect(LOG_LEVELS.WARN).toBe(40);
      expect(LOG_LEVELS.ERROR).toBe(50);
      expect(LOG_LEVELS.FATAL).toBe(60);
    });

    it('has correct icons', () => {
      expect(LOG_ICONS.ERROR).toBe('❌');
      expect(LOG_ICONS.WARN).toBe('⚠️ ');
      expect(LOG_ICONS.INFO).toBe('ℹ');
      expect(LOG_ICONS.SUCCESS).toBe('ℹ'); // Success uses INFO icon
    });
  });
});
