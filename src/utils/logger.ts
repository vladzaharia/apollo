import pino from 'pino';
import type { Config } from './config.js';

/**
 * Create a logger instance based on configuration
 */
export const createLogger = (config: Config): pino.Logger => {
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
