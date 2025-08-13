import { Flags } from '@oclif/core';
import { BaseCommand } from '../lib/base-command.js';
import { container } from '../lib/container.js';
import { hasExternalApiConfig } from '../utils/config.js';
import type { Result } from '../utils/result.js';
import { Ok, Err } from '../utils/result.js';
import type { GameMetadata } from '../models/game-metadata.js';
import { createGameMetadata } from '../models/game-metadata.js';
import { extractSteamAppId, extractLaunchCommand } from '../models/apollo-app.js';

// Services
import { FileService, type IFileService } from '../services/file/file.service.js';
import { SteamGridDbService, type ISteamGridDbService } from '../services/external/steamgrid.service.js';
import { IgdbService, type IIgdbService } from '../services/external/igdb.service.js';
import { DaijishoService, type IDaijishoService } from '../services/frontend/daijisho.service.js';
import { ESDeService, type IESDeService } from '../services/frontend/es-de.service.js';

export default class Generate extends BaseCommand {
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

  public async run(): Promise<void> {
    const { flags } = await this.parse(Generate);

    try {
      // Register services
      this.registerServices();

      // Load local configuration
      const fileService = container.resolve<IFileService>('fileService');
      const configResult = await fileService.loadLocalConfig(flags.config);
      
      if (!configResult.success) {
        this.handleError(configResult.error, `Loading configuration from ${flags.config}`);
        return;
      }

      const localConfig = configResult.data;
      this.info(`Loaded ${localConfig.apps.length} apps from ${flags.config}`);

      // Check external API availability
      const apiConfig = hasExternalApiConfig(this.config);
      if (!flags['no-artwork']) {
        if (apiConfig.steamGridDb) {
          this.info('✓ SteamGridDB API configured');
        } else {
          this.warn('SteamGridDB API not configured - artwork fetching disabled');
        }

        if (apiConfig.igdb) {
          this.info('✓ IGDB API configured');
        } else {
          this.warn('IGDB API not configured - metadata fetching disabled');
        }
      }

      // Convert apps to game metadata
      const games: GameMetadata[] = [];
      let metadataErrors = 0;

      for (const app of localConfig.apps) {
        try {
          const steamAppId = extractSteamAppId(app);
          const launchCommand = extractLaunchCommand(app);
          
          let gameMetadata = createGameMetadata(app.name, steamAppId ?? undefined, launchCommand);

          // Fetch external metadata if not disabled
          if (!flags['no-artwork']) {
            const metadataResult = await this.fetchGameMetadata(gameMetadata, flags.verbose);
            if (metadataResult.success) {
              gameMetadata = { ...gameMetadata, ...metadataResult.data };
            } else {
              metadataErrors++;
              if (flags.verbose) {
                this.warn(`Failed to fetch metadata for ${app.name}: ${metadataResult.error.message}`);
              }
            }
          }

          games.push(gameMetadata);
        } catch (error) {
          metadataErrors++;
          this.warn(`Error processing ${app.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (metadataErrors > 0) {
        this.warn(`${metadataErrors} games had metadata fetch errors`);
      }

      // Generate frontend configs
      const frontendOptions = {
        outputDir: flags.output,
        dryRun: flags['dry-run'],
        verbose: flags.verbose,
        noArtwork: flags['no-artwork'],
        frontend: flags.frontend as 'daijisho' | 'es-de' | 'both',
      };

      let generationErrors = 0;

      if (flags.frontend === 'daijisho' || flags.frontend === 'both') {
        const daijishoService = container.resolve<IDaijishoService>('daijishoService');
        const daijishoResult = await daijishoService.generateConfig(games, frontendOptions);
        
        if (daijishoResult.success) {
          this.success('✓ Daijisho configuration generated');
        } else {
          generationErrors++;
          this.warn(`✗ Daijisho generation failed: ${daijishoResult.error.message}`);
        }
      }

      if (flags.frontend === 'es-de' || flags.frontend === 'both') {
        const esDeService = container.resolve<IESDeService>('esDeService');
        const esDeResult = await esDeService.generateConfig(games, frontendOptions);
        
        if (esDeResult.success) {
          this.success('✓ ES-DE configuration generated');
        } else {
          generationErrors++;
          this.warn(`✗ ES-DE generation failed: ${esDeResult.error.message}`);
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
      new SteamGridDbService(this.config.steamGridDb.apiKey, this.logger)
    );

    container.registerSingleton('igdbService', () => 
      new IgdbService(
        this.config.igdb.clientId,
        this.config.igdb.accessToken,
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
  }
}
