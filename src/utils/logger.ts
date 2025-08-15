import pino from 'pino';

/**
 * Logging configuration interface
 */
export interface LoggingConfig {
  logging: {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    pretty: boolean;
    colorize?: boolean;
    timestamp?: boolean | string;
    hideObject?: boolean;
    levelFirst?: boolean;
  };
}

/**
 * Create a logger instance based on configuration with Apollo unified logging
 */
export const createLogger = (config: LoggingConfig): pino.Logger => {
  // For now, use a simple approach that works with the existing dual logging
  // until we can properly implement the custom transport
  return pino({
    level: config.logging.level,
    transport: config.logging.pretty ? {
      target: 'pino-pretty',
      options: {
        colorize: config.logging.colorize ?? true,
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
