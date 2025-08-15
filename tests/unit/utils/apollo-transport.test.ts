import { describe, it, expect, vi } from 'vitest';
import { Transform } from 'stream';
import apolloTransport from '../../../src/utils/apollo-transport.js';
import { LOG_LEVELS, createTestLogEntry } from '../../../src/utils/log-formatter.js';

describe('apollo-transport', () => {
  // Helper function to process log through transport
  async function processLog(transport: Transform, input: unknown): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      
      transport.on('data', (chunk: string) => {
        output += chunk;
      });
      
      transport.on('end', () => resolve(output));
      transport.on('error', reject);

      const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
      transport.write(inputStr);
      transport.end();
    });
  }

  describe('user-level formatting', () => {
    it('formats INFO messages with icon (colorized)', async () => {
      const transport = await apolloTransport({ colorize: true });
      const log = createTestLogEntry(LOG_LEVELS.INFO, 'Test info message');
      
      const result = await processLog(transport, log);
      
      expect(result).toContain('ℹ Test info message');
      expect(result).toContain('\u001b[34m'); // Blue color
      expect(result.endsWith('\n')).toBe(true);
    });

    it('formats WARN messages with icon (colorized)', async () => {
      const transport = await apolloTransport({ colorize: true });
      const log = createTestLogEntry(LOG_LEVELS.WARN, 'Warning message');
      
      const result = await processLog(transport, log);
      
      expect(result).toContain('⚠️  Warning message');
      expect(result).toContain('\u001b[33m'); // Yellow color
    });

    it('formats ERROR messages with icon (colorized)', async () => {
      const transport = await apolloTransport({ colorize: true });
      const log = createTestLogEntry(LOG_LEVELS.ERROR, 'Error message');
      
      const result = await processLog(transport, log);
      
      expect(result).toContain('❌ Error message');
      expect(result).toContain('\u001b[31m'); // Red color
    });

    it('formats messages without color when colorize is false', async () => {
      const transport = await apolloTransport({ colorize: false });
      const log = createTestLogEntry(LOG_LEVELS.INFO, 'Test message');
      
      const result = await processLog(transport, log);
      
      expect(result).toBe('ℹ Test message\n');
      expect(result).not.toContain('\u001b['); // No color codes
    });
  });

  describe('developer-level formatting', () => {
    it('formats DEBUG messages with timestamp', async () => {
      const transport = await apolloTransport({ colorize: false });
      const log = createTestLogEntry(LOG_LEVELS.DEBUG, 'Debug message');
      
      const result = await processLog(transport, log);
      
      expect(result).toMatch(/\[\d{2}:\d{2}:\d{2}\] DEBUG: Debug message\n/);
      expect(result).not.toContain('ℹ'); // No user icon
    });

    it('formats TRACE messages with timestamp', async () => {
      const transport = await apolloTransport({ colorize: false });
      const log = createTestLogEntry(LOG_LEVELS.TRACE, 'Trace message');
      
      const result = await processLog(transport, log);
      
      expect(result).toMatch(/\[\d{2}:\d{2}:\d{2}\] TRACE: Trace message\n/);
    });

    it('applies gray coloring to DEBUG messages', async () => {
      const transport = await apolloTransport({ colorize: true });
      const log = createTestLogEntry(LOG_LEVELS.DEBUG, 'Debug message');
      
      const result = await processLog(transport, log);
      
      expect(result).toContain('\u001b[90m'); // Gray color
    });
  });

  describe('input parsing', () => {
    it('handles string JSON input', async () => {
      const transport = await apolloTransport({ colorize: false });
      const log = createTestLogEntry(LOG_LEVELS.INFO, 'String input test');
      
      const result = await processLog(transport, JSON.stringify(log));
      
      expect(result).toBe('ℹ String input test\n');
    });

    it('handles object input', async () => {
      const transport = await apolloTransport({ colorize: false });
      const log = createTestLogEntry(LOG_LEVELS.INFO, 'Object input test');
      
      const result = await processLog(transport, log);
      
      expect(result).toBe('ℹ Object input test\n');
    });

    it('handles malformed JSON gracefully', async () => {
      const transport = await apolloTransport();
      
      const result = await processLog(transport, 'invalid json');
      
      expect(result).toBe('[PARSE ERROR] invalid json\n');
    });

    it('handles invalid log structure', async () => {
      const transport = await apolloTransport();
      const invalidLog = { invalid: 'structure' };
      
      const result = await processLog(transport, invalidLog);
      
      expect(result).toContain('[INVALID LOG]');
    });
  });

  describe('filtering', () => {
    it('filters out unknown log levels', async () => {
      const transport = await apolloTransport();
      const unknownLog = { level: 5, msg: 'Unknown level', time: Date.now() };
      
      const result = await processLog(transport, unknownLog);
      
      expect(result).toBe(''); // Should be filtered out
    });

    it('processes all valid levels', async () => {
      const transport = await apolloTransport({ colorize: false });
      const levels = [
        LOG_LEVELS.TRACE,
        LOG_LEVELS.DEBUG,
        LOG_LEVELS.INFO,
        LOG_LEVELS.WARN,
        LOG_LEVELS.ERROR,
        LOG_LEVELS.FATAL,
      ];

      for (const level of levels) {
        const log = createTestLogEntry(level, `Level ${level} message`);
        const result = await processLog(transport, log);
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });

  describe('configuration options', () => {
    it('uses custom translateTime format', async () => {
      const transport = await apolloTransport({ 
        colorize: false, 
        translateTime: 'iso' 
      });
      const log = createTestLogEntry(LOG_LEVELS.DEBUG, 'Time format test');
      
      const result = await processLog(transport, log);
      
      expect(result).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] DEBUG:/);
    });

    it('respects hideObject option', async () => {
      const transport = await apolloTransport({ hideObject: true });
      const log = { 
        ...createTestLogEntry(LOG_LEVELS.INFO, 'Test message'),
        extra: { data: 'should be hidden' }
      };
      
      const result = await processLog(transport, log);
      
      expect(result).toContain('ℹ Test message');
      expect(result).not.toContain('should be hidden');
    });
  });

  describe('error handling', () => {
    it('logs parsing errors in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      try {
        const transport = await apolloTransport();
        await processLog(transport, 'invalid json');
        
        expect(consoleSpy).toHaveBeenCalledWith(
          'Apollo transport parsing error:',
          expect.any(String)
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        consoleSpy.mockRestore();
      }
    });

    it('does not log parsing errors in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      try {
        const transport = await apolloTransport();
        await processLog(transport, 'invalid json');
        
        expect(consoleSpy).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalEnv;
        consoleSpy.mockRestore();
      }
    });
  });

  describe('performance', () => {
    it('handles high-frequency logging', async () => {
      const transport = await apolloTransport({ colorize: false });
      const messageCount = 100;
      const messages: string[] = [];

      // Generate many log messages
      for (let i = 0; i < messageCount; i++) {
        const log = createTestLogEntry(LOG_LEVELS.INFO, `Message ${i}`);
        messages.push(JSON.stringify(log));
      }

      const startTime = Date.now();
      
      // Process all messages
      const results = await Promise.all(
        messages.map(async (msg) => {
          const transport = await apolloTransport({ colorize: false });
          return processLog(transport, msg);
        })
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(messageCount);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      
      // Verify all messages were processed correctly
      results.forEach((result, index) => {
        expect(result).toBe(`ℹ Message ${index}\n`);
      });
    });
  });
});
