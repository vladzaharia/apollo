import { Command } from '@oclif/core';
import { container } from './container.js';
import { loadConfig, type Config } from '../utils/config.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { isErr } from '../utils/result.js';

/**
 * Base command class with common functionality
 */
export abstract class BaseCommand extends Command {
  protected appConfig!: Config;
  protected logger!: Logger;

  /**
   * Initialize the command with configuration and logging
   */
  override async init(): Promise<void> {
    await super.init();

    // Load configuration
    const configResult = loadConfig();
    if (isErr(configResult)) {
      this.error(`Configuration error: ${configResult.error.message}`);
    }

    this.appConfig = configResult.data;
    this.logger = createLogger(this.appConfig);

    // Register core services in container
    container.registerSingleton('config', () => this.appConfig);
    container.registerSingleton('logger', () => this.logger);
  }

  /**
   * Handle errors consistently
   */
  protected handleError(error: unknown, context = 'Command execution'): never {
    if (error instanceof Error) {
      this.logger.error({ error: error.message, stack: error.stack }, context);
      this.error(error.message);
    } else {
      const message = String(error);
      this.logger.error({ error: message }, context);
      this.error(message);
    }
  }

  /**
   * Log success message (unified logging - transport handles display)
   */
  protected success(message: string): void {
    this.logger.info(message);
  }

  /**
   * Log warning message (unified logging - transport handles display)
   */
  protected warning(message: string): void {
    this.logger.warn(message);
  }

  /**
   * Log info message (unified logging - transport handles display)
   */
  protected info(message: string): void {
    this.logger.info(message);
  }

  /**
   * Log verbose message only if verbose flag is set (unified logging)
   */
  protected verbose(message: string, isVerbose: boolean): void {
    if (isVerbose) {
      this.logger.debug(message);
    }
  }

  /**
   * Log dry run message (unified logging - transport handles display)
   */
  protected dryRun(message: string): void {
    this.logger.info(`[DRY RUN] ${message}`);
  }
}
