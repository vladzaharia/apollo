import { Flags, Command } from '@oclif/core';
import { container } from '../lib/container.js';
import { loadSyncConfig, validateApolloConfig, type SyncConfig } from '../utils/config.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { isErr } from '../utils/result.js';

// Services
import { ApolloClient, type IApolloClient } from '../services/apollo/apollo-client.js';
import { AppSyncService, type IAppSyncService, type AppSyncResult } from '../services/apollo/app-sync.service.js';
import { FileService, type IFileService } from '../services/file/file.service.js';
import { CacheService, type ICacheService } from '../services/cache/cache.service.js';
import { DiffService, type IDiffService, ConflictResolution } from '../services/sync/diff.service.js';
import { TwoWaySyncService, type ITwoWaySyncService, type TwoWaySyncResult } from '../services/sync/two-way-sync.service.js';

export default class Sync extends Command {
  protected appConfig!: SyncConfig;
  protected logger!: Logger;
  static override description = 'Sync Apollo/Sunshine apps configuration with local apps.json (two-way sync with 3-way diff)';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %> --verbose',
    '<%= config.bin %> <%= command.id %> --config ./custom-apps.json',
    '<%= config.bin %> <%= command.id %> --two-way',
    '<%= config.bin %> <%= command.id %> --two-way --conflict-resolution local-wins',
    '<%= config.bin %> <%= command.id %> --clear-cache',
  ];

  static override flags = {
    'dry-run': Flags.boolean({
      char: 'd',
      description: 'Show what changes would be made without applying them',
      default: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed output including unchanged apps',
      default: false,
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to apps.json configuration file',
      default: './apps.json',
    }),
    'two-way': Flags.boolean({
      char: 't',
      description: 'Enable two-way sync with 3-way diff (updates both local and server)',
      default: true,
    }),
    'conflict-resolution': Flags.string({
      description: 'How to resolve conflicts: local-wins, server-wins, manual',
      options: ['local-wins', 'server-wins', 'manual'],
      default: 'manual',
    }),
    'clear-cache': Flags.boolean({
      description: 'Clear the sync cache before syncing',
      default: false,
    }),
  };

  override async init(): Promise<void> {
    await super.init();

    // Load sync-specific configuration
    const configResult = loadSyncConfig();
    if (isErr(configResult)) {
      this.error(`Configuration error: ${configResult.error.message}`);
    }

    this.appConfig = configResult.data;
    this.logger = createLogger(this.appConfig);

    // Register core services in container
    container.registerSingleton('config', () => this.appConfig);
    container.registerSingleton('logger', () => this.logger);
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Sync);

    try {
      // Validate Apollo configuration
      const apolloValidation = validateApolloConfig(this.appConfig);
      if (isErr(apolloValidation)) {
        this.handleError(apolloValidation.error, 'Apollo configuration validation');
      }

      // Register services
      this.registerServices();

      // Clear cache if requested
      if (flags['clear-cache']) {
        const cacheService = container.resolve<ICacheService>('cacheService');
        const clearResult = await cacheService.clearCache();
        if (clearResult.success) {
          this.info('Cache cleared successfully');
        } else {
          this.logger.warn(`Failed to clear cache: ${clearResult.error.message}`);
        }
      }

      // Convert conflict resolution string to enum
      const conflictResolution = this.parseConflictResolution(flags['conflict-resolution']);

      if (flags['two-way']) {
        // Use two-way sync
        const twoWaySyncService = container.resolve<ITwoWaySyncService>('twoWaySyncService');
        const syncResult = await twoWaySyncService.syncApps({
          dryRun: flags['dry-run'],
          verbose: flags.verbose,
          conflictResolution,
          configPath: flags.config,
        });

        if (isErr(syncResult)) {
          this.handleError(syncResult.error, 'Two-way synchronization');
        }

        const result = syncResult.data;
        this.displayTwoWaySyncResults(result, flags);
      } else {
        // Use legacy one-way sync
        const fileService = container.resolve<IFileService>('fileService');
        const configResult = await fileService.loadLocalConfig(flags.config);

        if (isErr(configResult)) {
          this.handleError(configResult.error, `Loading configuration from ${flags.config}`);
        }

        const localConfig = configResult.data;
        this.info(`Loaded ${localConfig.apps.length} apps from ${flags.config}`);

        if (flags.verbose) {
          this.verbose(`Configuration file: ${flags.config}`, true);
          this.verbose(`Apps to sync: ${localConfig.apps.map(app => app.name).join(', ')}`, true);
        }

        const syncService = container.resolve<IAppSyncService>('appSyncService');
        const syncResult = await syncService.syncApps(localConfig, {
          dryRun: flags['dry-run'],
          verbose: flags.verbose,
        });

        if (isErr(syncResult)) {
          this.handleError(syncResult.error, 'App synchronization');
        }

        const result = syncResult.data;
        this.displayLegacySyncResults(result, flags);
      }


    } catch (error) {
      this.handleError(error, 'Sync command execution');
    }
  }

  /**
   * Register services in the DI container
   */
  private registerServices(): void {
    // File service
    container.registerSingleton('fileService', () => 
      new FileService(this.logger)
    );

    // Apollo client
    container.registerSingleton('apolloClient', () =>
      new ApolloClient(this.appConfig, this.logger)
    );

    // App sync service
    container.registerSingleton('appSyncService', () =>
      new AppSyncService(
        container.resolve<IApolloClient>('apolloClient'),
        this.logger
      )
    );

    // Cache service
    container.registerSingleton('cacheService', () =>
      new CacheService(
        container.resolve<IFileService>('fileService'),
        this.logger
      )
    );

    // Diff service
    container.registerSingleton('diffService', () =>
      new DiffService(this.logger)
    );

    // Two-way sync service
    container.registerSingleton('twoWaySyncService', () =>
      new TwoWaySyncService(
        container.resolve<IApolloClient>('apolloClient'),
        container.resolve<IFileService>('fileService'),
        container.resolve<ICacheService>('cacheService'),
        container.resolve<IDiffService>('diffService'),
        this.logger
      )
    );
  }

  /**
   * Parse conflict resolution string to enum
   */
  private parseConflictResolution(resolution: string): ConflictResolution {
    switch (resolution) {
      case 'local-wins':
        return ConflictResolution.LOCAL_WINS;
      case 'server-wins':
        return ConflictResolution.SERVER_WINS;
      case 'manual':
      default:
        return ConflictResolution.MANUAL;
    }
  }

  /**
   * Display two-way sync results
   */
  private displayTwoWaySyncResults(result: TwoWaySyncResult, flags: Record<string, unknown>): void {
    if (flags['dry-run']) {
      this.info('[DRY RUN] Two-way sync completed - no changes were made');
    } else {
      this.success('Two-way sync completed successfully');
    }

    this.log('');
    this.log('📊 Two-Way Sync Summary:');
    this.log(`  📥 Changes applied to local: ${result.localChanges}`);
    this.log(`  📤 Changes applied to server: ${result.serverChanges}`);
    this.log(`  ⚠️  Conflicts requiring resolution: ${result.conflicts}`);

    if (result.errors.length > 0) {
      this.log(`  ❌ Errors: ${result.errors.length}`);
      this.log('');
      this.log('❌ Errors encountered:');
      result.errors.forEach((error: string) => {
        this.log(`  • ${error}`);
      });
    }

    // Exit with error code if there were errors
    if (result.errors.length > 0) {
      this.exit(1);
    }
  }

  /**
   * Display legacy sync results
   */
  private displayLegacySyncResults(result: AppSyncResult, flags: Record<string, unknown>): void {
    if (flags['dry-run']) {
      this.info('[DRY RUN] Sync completed - no changes were made');
    } else {
      this.success('Sync completed successfully');
    }

    this.log('');
    this.log('📊 Sync Summary:');
    this.log(`  ✅ Created: ${result.created}`);
    this.log(`  🔄 Updated: ${result.updated}`);
    this.log(`  ⚪ Unchanged: ${result.unchanged}`);

    if (result.errors.length > 0) {
      this.log(`  ❌ Errors: ${result.errors.length}`);
      this.log('');
      this.log('❌ Errors encountered:');
      result.errors.forEach((error: string) => {
        this.log(`  • ${error}`);
      });
    }

    // Exit with error code if there were errors
    if (result.errors.length > 0) {
      this.exit(1);
    }
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
}
