import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, type LoggingConfig } from '../../src/utils/logger.js';
import { LOG_LEVELS } from '../../src/utils/log-formatter.js';

describe('Logging Integration', () => {
  let mockStdout: string[];
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    mockStdout = [];
    originalWrite = process.stdout.write;
    
    // Mock stdout to capture output
    process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
      mockStdout.push(String(chunk));
      return true;
    }) as any;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  describe('Logger Configuration', () => {
    it('creates logger with default Apollo transport', () => {
      const config: LoggingConfig = {
        logging: {
          level: 'info',
          pretty: true,
        },
      };

      const logger = createLogger(config);
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('respects custom transport configuration', () => {
      const config: LoggingConfig = {
        logging: {
          level: 'debug',
          pretty: true,
          colorize: false,
          timestamp: 'iso',
          hideObject: false,
          levelFirst: true,
        },
      };

      const logger = createLogger(config);
      expect(logger).toBeDefined();
    });
  });

  describe('Unified Logging Output', () => {
    it('produces clean user-friendly output for INFO level', async () => {
      const config: LoggingConfig = {
        logging: {
          level: 'info',
          pretty: true,
          colorize: false,
        },
      };

      const logger = createLogger(config);
      
      // Wait for transport to be ready
      await new Promise(resolve => setTimeout(resolve, 10));
      
      logger.info('Test info message');
      
      // Wait for async logging
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const output = mockStdout.join('');
      expect(output).toContain('ℹ Test info message');
      expect(output).not.toContain('✓'); // No old success icon
      expect(output).not.toContain('['); // No timestamp for user messages
    });

    it('produces timestamped output for DEBUG level', async () => {
      const config: LoggingConfig = {
        logging: {
          level: 'debug',
          pretty: true,
          colorize: false,
        },
      };

      const logger = createLogger(config);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      logger.debug('Test debug message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const output = mockStdout.join('');
      expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\] DEBUG: Test debug message/);
      expect(output).not.toContain('ℹ'); // No user icon for debug
    });

    it('filters messages based on log level', async () => {
      const config: LoggingConfig = {
        logging: {
          level: 'warn', // Only WARN and above
          pretty: true,
          colorize: false,
        },
      };

      const logger = createLogger(config);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      logger.debug('Should not appear');
      logger.info('Should not appear');
      logger.warn('Should appear');
      logger.error('Should appear');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const output = mockStdout.join('');
      expect(output).not.toContain('Should not appear');
      expect(output).toContain('⚠️  Should appear');
      expect(output).toContain('❌ Should appear');
    });

    it('handles structured logging', async () => {
      const config: LoggingConfig = {
        logging: {
          level: 'info',
          pretty: true,
          colorize: false,
        },
      };

      const logger = createLogger(config);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      logger.info({ operation: 'sync', duration: 1500 }, 'Operation completed');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const output = mockStdout.join('');
      expect(output).toContain('ℹ Operation completed');
      // Structured data should be handled by transport (hidden by default)
    });
  });

  describe('Error Handling', () => {
    it('handles logger errors gracefully', async () => {
      const config: LoggingConfig = {
        logging: {
          level: 'info',
          pretty: true,
        },
      };

      const logger = createLogger(config);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // This should not crash the application
      logger.info('Normal message');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const output = mockStdout.join('');
      expect(output).toContain('ℹ Normal message');
    });
  });

  describe('Performance', () => {
    it('handles rapid logging without blocking', async () => {
      const config: LoggingConfig = {
        logging: {
          level: 'info',
          pretty: true,
          colorize: false,
        },
      };

      const logger = createLogger(config);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const startTime = Date.now();
      const messageCount = 50;
      
      // Log many messages rapidly
      for (let i = 0; i < messageCount; i++) {
        logger.info(`Rapid message ${i}`);
      }
      
      const logTime = Date.now() - startTime;
      
      // Logging calls should return quickly (not wait for I/O)
      expect(logTime).toBeLessThan(100);
      
      // Wait for all messages to be processed
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const output = mockStdout.join('');
      
      // Verify all messages were logged
      for (let i = 0; i < messageCount; i++) {
        expect(output).toContain(`ℹ Rapid message ${i}`);
      }
    });
  });

  describe('Colorization', () => {
    it('applies colors when colorize is enabled', async () => {
      const config: LoggingConfig = {
        logging: {
          level: 'info',
          pretty: true,
          colorize: true,
        },
      };

      const logger = createLogger(config);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      logger.info('Colored info');
      logger.warn('Colored warning');
      logger.error('Colored error');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const output = mockStdout.join('');
      
      // Check for ANSI color codes
      expect(output).toContain('\u001b[34m'); // Blue for info
      expect(output).toContain('\u001b[33m'); // Yellow for warn
      expect(output).toContain('\u001b[31m'); // Red for error
    });

    it('omits colors when colorize is disabled', async () => {
      const config: LoggingConfig = {
        logging: {
          level: 'info',
          pretty: true,
          colorize: false,
        },
      };

      const logger = createLogger(config);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      logger.info('Plain info');
      logger.warn('Plain warning');
      logger.error('Plain error');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const output = mockStdout.join('');
      
      // Should have icons but no color codes
      expect(output).toContain('ℹ Plain info');
      expect(output).toContain('⚠️  Plain warning');
      expect(output).toContain('❌ Plain error');
      expect(output).not.toContain('\u001b['); // No ANSI codes
    });
  });

  describe('Backward Compatibility', () => {
    it('maintains existing logger interface', () => {
      const config: LoggingConfig = {
        logging: {
          level: 'info',
          pretty: true,
        },
      };

      const logger = createLogger(config);
      
      // All standard Pino methods should be available
      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.fatal).toBe('function');
      
      // Pino utility methods
      expect(typeof logger.child).toBe('function');
      expect(typeof logger.level).toBe('string');
    });

    it('supports legacy pretty configuration', async () => {
      const legacyConfig: LoggingConfig = {
        logging: {
          level: 'info',
          pretty: true, // Legacy option should still work
        },
      };

      const logger = createLogger(legacyConfig);
      expect(logger).toBeDefined();
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      logger.info('Legacy config test');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const output = mockStdout.join('');
      expect(output).toContain('ℹ Legacy config test');
    });
  });
});
