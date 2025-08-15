import { Flags, Command } from '@oclif/core';
import { container } from '../lib/container.js';
import { loadGenerateConfig, hasExternalApiConfig, type GenerateConfig } from '../utils/config.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { Ok, Err, type Result } from '../utils/result.js';
import { createGameMetadata, type GameMetadata } from '../models/game-metadata.js';
import { extractSteamAppId, extractLaunchCommand, type LocalApp } from '../models/apollo-app.js';

// Services
import { FileService, type IFileService } from '../services/file/file.service.js';
import { ApolloClient, type IApolloClient } from '../services/apollo/apollo-client.js';
import { SteamGridDbService, type ISteamGridDbService } from '../services/external/steamgrid.service.js';
import { IgdbService, type IIgdbService } from '../services/external/igdb.service.js';
import { DaijishoService, type IDaijishoService } from '../services/frontend/daijisho.service.js';
import { ESDeService, type IESDeService } from '../services/frontend/es-de.service.js';


export default class Generate extends Command {
  protected appConfig!: GenerateConfig;
  protected logger!: Logger;
  static override description = 'Generate frontend configuration files (Daijisho/ES-DE) from Apollo apps';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %> --frontend daijisho',
    '<%= config.bin %> <%= command.id %> --output ./frontend-configs',
    '<%= config.bin %> <%= command.id %> --no-artwork',
  ];

  static override flags = {
    'dry-run': Flags.boolean({
      char: 'd',
      description: 'Show what files would be generated without creating them',
      default: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed output including metadata fetching',
      default: false,
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to apps.json configuration file',
      default: './apps.json',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output directory for generated files',
      default: './frontend-configs',
    }),
    frontend: Flags.string({
      char: 'f',
      description: 'Frontend to generate configs for',
      options: ['daijisho', 'es-de', 'both'],
      default: 'both',
    }),
    'no-artwork': Flags.boolean({
      description: 'Skip artwork fetching from external APIs',
      default: false,
    }),
  };

  override async init(): Promise<void> {
    await super.init();

    // Load generate-specific configuration
    const configResult = loadGenerateConfig();
    if (configResult.success) {
      this.appConfig = configResult.data;
      this.logger = createLogger(this.appConfig);

      // Register core services in container
      container.registerSingleton('config', () => this.appConfig);
      container.registerSingleton('logger', () => this.logger);
    } else {
      // For generate command, we can work with minimal config if external APIs aren't needed
      this.appConfig = {
        logging: { level: 'info', pretty: true },
        steamGridDb: { apiKey: undefined },
        igdb: { clientId: undefined, clientSecret: undefined },
        apollo: undefined
      };
      this.logger = createLogger(this.appConfig);

      container.registerSingleton('config', () => this.appConfig);
      container.registerSingleton('logger', () => this.logger);
    }
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Generate);

    try {
      // Register services
      this.registerServices();

      // Try to load apps from server first, fallback to local file
      const appsConfig = await this.loadAppsConfig(flags.config);
      this.info(`Loaded ${appsConfig.apps.length} apps from ${appsConfig.source}`);

      // Check external API availability
      const apiConfig = hasExternalApiConfig(this.appConfig);
      if (!flags['no-artwork']) {
        if (apiConfig.steamGridDb) {
          this.info('✓ SteamGridDB API configured');
        } else {
          this.warning('SteamGridDB API not configured - artwork fetching disabled');
        }

        if (apiConfig.igdb) {
          this.info('✓ IGDB API configured');
        } else {
          this.warning('IGDB API not configured - metadata fetching disabled');
        }
      }

      // Convert apps to game metadata
      const games: GameMetadata[] = [];
      let metadataErrors = 0;

      for (const app of appsConfig.apps) {
        try {
          const steamAppId = extractSteamAppId(app);
          const launchCommand = extractLaunchCommand(app);
          const apolloAppUuid = 'uuid' in app ? (app.uuid as string) : undefined;

          let gameMetadata = createGameMetadata(app.name, steamAppId ?? undefined, launchCommand, apolloAppUuid);

          // Fetch external metadata if not disabled
          if (!flags['no-artwork']) {
            const metadataResult = await this.fetchGameMetadata(gameMetadata, flags.verbose);
            if (metadataResult.success) {
              gameMetadata = { ...gameMetadata, ...metadataResult.data };
            } else {
              metadataErrors++;
              if (flags.verbose) {
                this.warning(`Failed to fetch metadata for ${app.name}: ${metadataResult.error.message}`);
              }
            }
          }

          games.push(gameMetadata);
        } catch (error) {
          metadataErrors++;
          this.warning(`Error processing ${app.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (metadataErrors > 0) {
        this.warning(`${metadataErrors} games had metadata fetch errors`);
      }

      // Media downloading will be handled per frontend to create self-contained folders

      // Generate frontend configs
      const frontendOptions = {
        outputDir: flags.output,
        dryRun: flags['dry-run'],
        verbose: flags.verbose,
        noArtwork: flags['no-artwork'],
        frontend: flags.frontend as 'daijisho' | 'es-de' | 'both',
      };

      // Get Apollo host info for art:// URL generation
      let hostInfo = null;
      if (this.appConfig.apollo?.endpoint) {
        const apolloClient = container.resolve<IApolloClient>('apolloClient');
        hostInfo = apolloClient.getHostInfo();

        if (!hostInfo) {
          this.warning('Apollo host UUID and name not configured - art:// URLs will not be generated');
          this.warning('Set APOLLO_UUID and APOLLO_HOST_NAME environment variables for proper Artemis integration');
        }
      }

      let generationErrors = 0;

      if (flags.frontend === 'daijisho' || flags.frontend === 'both') {
        const daijishoService = container.resolve<IDaijishoService>('daijishoService');
        const daijishoResult = await daijishoService.generateConfig(games, frontendOptions, hostInfo);

        if (daijishoResult.success) {
          this.success('✓ Daijisho configuration generated');
        } else {
          generationErrors++;
          this.warning(`✗ Daijisho generation failed: ${daijishoResult.error.message}`);
        }
      }

      if (flags.frontend === 'es-de' || flags.frontend === 'both') {
        const esDeService = container.resolve<IESDeService>('esDeService');
        const esDeResult = await esDeService.generateConfig(games, frontendOptions, hostInfo);

        if (esDeResult.success) {
          this.success('✓ ES-DE configuration generated');
        } else {
          generationErrors++;
          this.warning(`✗ ES-DE generation failed: ${esDeResult.error.message}`);
        }
      }

      // Display summary
      this.log('');
      this.log('📊 Generation Summary:');
      this.log(`  🎮 Games processed: ${games.length}`);
      this.log(`  📁 Output directory: ${flags.output}`);
      this.log(`  🎨 Artwork fetching: ${flags['no-artwork'] ? 'disabled' : 'enabled'}`);
      
      if (metadataErrors > 0) {
        this.log(`  ⚠️  Metadata errors: ${metadataErrors}`);
      }
      
      if (generationErrors > 0) {
        this.log(`  ❌ Generation errors: ${generationErrors}`);
        this.exit(1);
      } else {
        if (flags['dry-run']) {
          this.info('[DRY RUN] Generation completed - no files were created');
        } else {
          this.success('Frontend configuration generation completed successfully');
        }
      }
    } catch (error) {
      this.handleError(error, 'Generate command execution');
    }
  }

  /**
   * Fetch game metadata from external APIs
   */
  private async fetchGameMetadata(
    gameMetadata: GameMetadata,
    verbose: boolean
  ): Promise<Result<Partial<GameMetadata>, Error>> {
    const enrichedMetadata: Partial<GameMetadata> = {};

    try {
      // Try IGDB first for metadata
      const igdbService = container.resolve<IIgdbService>('igdbService');
      if (igdbService.isConfigured()) {
        const igdbResult = await igdbService.searchGameMetadata(gameMetadata.name);
        if (igdbResult.success) {
          const igdbData = igdbResult.data;
          enrichedMetadata.description = igdbData.description;
          enrichedMetadata.genre = igdbData.genre;
          enrichedMetadata.releaseDate = igdbData.releaseDate;
          enrichedMetadata.developer = igdbData.developer;
          enrichedMetadata.publisher = igdbData.publisher;
          
          if (verbose) {
            this.verbose(`IGDB metadata found for: ${gameMetadata.name}`, true);
          }
        }
      }

      // Try SteamGridDB for artwork
      const steamGridService = container.resolve<ISteamGridDbService>('steamGridService');
      if (steamGridService.isConfigured()) {
        const artworkResult = await steamGridService.searchGameArtwork(
          gameMetadata.name,
          gameMetadata.steamAppId
        );
        
        if (artworkResult.success) {
          const artwork = artworkResult.data;
          enrichedMetadata.coverArtUrl = artwork.coverUrl;
          enrichedMetadata.logoUrl = artwork.logoUrl;
          enrichedMetadata.marqueeUrl = artwork.marqueeUrl;
          enrichedMetadata.tileUrl = artwork.tileUrl;
          enrichedMetadata.backgroundUrl = artwork.backgroundUrl;
          enrichedMetadata.screenshotUrls = artwork.screenshotUrls;
          
          if (verbose) {
            this.verbose(`SteamGridDB artwork found for: ${gameMetadata.name}`, true);
          }
        }
      }

      return Ok(enrichedMetadata);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
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

    // External API services
    container.registerSingleton('steamGridService', () =>
      new SteamGridDbService(this.appConfig.steamGridDb.apiKey, this.logger)
    );

    container.registerSingleton('igdbService', () =>
      new IgdbService(
        this.appConfig.igdb.clientId,
        this.appConfig.igdb.clientSecret,
        this.logger
      )
    );

    // Frontend services
    container.registerSingleton('daijishoService', () => 
      new DaijishoService(
        container.resolve<IFileService>('fileService'),
        this.logger
      )
    );

    container.registerSingleton('esDeService', () =>
      new ESDeService(
        container.resolve<IFileService>('fileService'),
        this.logger
      )
    );



    // Apollo client (only if Apollo config is available)
    if (this.appConfig.apollo?.endpoint) {
      container.registerSingleton('apolloClient', () =>
        new ApolloClient(this.appConfig, this.logger)
      );
    }
  }

  /**
   * Load apps configuration from server first, fallback to local file
   */
  private async loadAppsConfig(localConfigPath: string): Promise<{ apps: LocalApp[], source: string }> {
    // Try to load from Apollo server first if configured
    if (this.appConfig.apollo?.endpoint && this.appConfig.apollo?.username && this.appConfig.apollo?.password) {
      try {
        const apolloClient = container.resolve<IApolloClient>('apolloClient');
        const serverAppsResult = await apolloClient.fetchApps();

        if (serverAppsResult.success) {
          this.logger.info('Successfully loaded apps from Apollo server');
          return {
            apps: serverAppsResult.data,
            source: 'Apollo server'
          };
        } else {
          this.warning(`Failed to load apps from server: ${serverAppsResult.error.message}`);
        }
      } catch (error) {
        this.warning(`Error connecting to Apollo server: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Fallback to local file
    const fileService = container.resolve<IFileService>('fileService');
    const configResult = await fileService.loadLocalConfig(localConfigPath);

    if (!configResult.success) {
      this.handleError(configResult.error, `Loading configuration from ${localConfigPath}`);
    }

    return {
      apps: configResult.data.apps,
      source: localConfigPath
    };
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
