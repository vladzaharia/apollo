import pino from 'pino';
import type { Config } from './config.js';

/**
 * Logging configuration interface
 */
export interface LoggingConfig {
  logging: {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    pretty: boolean;
  };
}

/**
 * Create a logger instance based on configuration
 */
export const createLogger = (config: LoggingConfig): pino.Logger => {
  return pino({
    level: config.logging.level,
    transport: config.logging.pretty ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    } : undefined,
  });
};

/**
 * Default logger instance
 */
export const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});

export type Logger = typeof logger;
