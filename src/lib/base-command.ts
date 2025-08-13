import { Command } from '@oclif/core';
import { container } from './container.js';
import { loadConfig, type Config } from '../utils/config.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { isErr } from '../utils/result.js';

/**
 * Base command class with common functionality
 */
export abstract class BaseCommand extends Command {
  protected config!: Config;
  protected logger!: Logger;

  /**
   * Initialize the command with configuration and logging
   */
  async init(): Promise<void> {
    await super.init();
    
    // Load configuration
    const configResult = loadConfig();
    if (isErr(configResult)) {
      this.error(`Configuration error: ${configResult.error.message}`);
    }
    
    this.config = configResult.data;
    this.logger = createLogger(this.config);
    
    // Register core services in container
    container.registerSingleton('config', () => this.config);
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
   * Log and display success message
   */
  protected success(message: string): void {
    this.logger.info(message);
    this.log(`✓ ${message}`);
  }

  /**
   * Log and display warning message
   */
  protected warn(message: string): void {
    this.logger.warn(message);
    this.log(`⚠ ${message}`);
  }

  /**
   * Log and display info message
   */
  protected info(message: string): void {
    this.logger.info(message);
    this.log(`ℹ ${message}`);
  }

  /**
   * Display verbose message only if verbose flag is set
   */
  protected verbose(message: string, isVerbose: boolean): void {
    if (isVerbose) {
      this.logger.debug(message);
      this.log(`  ${message}`);
    }
  }

  /**
   * Display dry run message
   */
  protected dryRun(message: string): void {
    this.logger.info(`[DRY RUN] ${message}`);
    this.log(`🔍 [DRY RUN] ${message}`);
  }
}
