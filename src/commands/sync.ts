import { Flags } from '@oclif/core';
import { BaseCommand } from '../lib/base-command.js';
import { container } from '../lib/container.js';
import { validateApolloConfig } from '../utils/config.js';
import { isErr } from '../utils/result.js';

// Services
import { ApolloClient, type IApolloClient } from '../services/apollo/apollo-client.js';
import { AppSyncService, type IAppSyncService } from '../services/apollo/app-sync.service.js';
import { FileService, type IFileService } from '../services/file/file.service.js';

export default class Sync extends BaseCommand {
  static override description = 'Sync Apollo/Sunshine apps configuration with local apps.json';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %> --verbose',
    '<%= config.bin %> <%= command.id %> --config ./custom-apps.json',
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
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Sync);

    try {
      // Validate Apollo configuration
      const apolloValidation = validateApolloConfig(this.config);
      if (isErr(apolloValidation)) {
        this.handleError(apolloValidation.error, 'Apollo configuration validation');
      }

      // Register services
      this.registerServices();

      // Load local configuration
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

      // Perform sync
      const syncService = container.resolve<IAppSyncService>('appSyncService');
      const syncResult = await syncService.syncApps(localConfig, {
        dryRun: flags['dry-run'],
        verbose: flags.verbose,
      });

      if (isErr(syncResult)) {
        this.handleError(syncResult.error, 'App synchronization');
      }

      const result = syncResult.data;

      // Display results
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
        result.errors.forEach(error => {
          this.log(`  • ${error}`);
        });
      }

      // Exit with error code if there were errors
      if (result.errors.length > 0) {
        this.exit(1);
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
      new ApolloClient(this.config, this.logger)
    );

    // App sync service
    container.registerSingleton('appSyncService', () => 
      new AppSyncService(
        container.resolve<IApolloClient>('apolloClient'),
        this.logger
      )
    );
  }
}
