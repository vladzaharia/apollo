import * as path from 'path';
import { Ok, Err, type Result } from '../../utils/result.js';
import type { Logger } from '../../utils/logger.js';
import type { IFileService } from '../file/file.service.js';
import { sanitizeFilename, type GameMetadata, type FrontendOptions, type DaijishoPlatformConfig } from '../../models/game-metadata.js';

/**
 * Daijisho service errors
 */
export class DaijishoError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'DaijishoError';
  }
}

/**
 * Daijisho service interface
 */
export interface IDaijishoService {
  generateConfig(games: GameMetadata[], options: FrontendOptions): Promise<Result<void, DaijishoError>>;
}

/**
 * Daijisho service implementation
 */
export class DaijishoService implements IDaijishoService {
  constructor(
    private fileService: IFileService,
    private logger: Logger
  ) {}

  /**
   * Generate Daijisho configuration files
   */
  async generateConfig(
    games: GameMetadata[], 
    options: FrontendOptions
  ): Promise<Result<void, DaijishoError>> {
    this.logger.info(`Generating Daijisho config for ${games.length} games`);

    try {
      const daijishoDir = path.join(options.outputDir, 'daijisho');
      
      if (!options.dryRun) {
        const ensureDirResult = await this.fileService.ensureDirectory(daijishoDir);
        if (!ensureDirResult.success) {
          return Err(new DaijishoError(
            `Failed to create Daijisho directory: ${ensureDirResult.error.message}`,
            'DIRECTORY_ERROR'
          ));
        }
      }

      // Generate platform configuration
      const platformConfig = this.createPlatformConfig();
      const platformConfigPath = path.join(daijishoDir, 'platform.json');

      if (options.verbose) {
        this.logger.debug(`Platform config path: ${platformConfigPath}`);
      }

      if (!options.dryRun) {
        const savePlatformResult = await this.fileService.saveJsonFile(platformConfigPath, platformConfig);
        if (!savePlatformResult.success) {
          return Err(new DaijishoError(
            `Failed to save platform config: ${savePlatformResult.error.message}`,
            'SAVE_ERROR'
          ));
        }
      }

      // Generate .art files for each game
      let successCount = 0;
      let errorCount = 0;

      for (const game of games) {
        const artResult = await this.generateArtFile(game, daijishoDir, options);
        if (artResult.success) {
          successCount++;
          if (options.verbose) {
            this.logger.debug(`Generated .art file for: ${game.name}`);
          }
        } else {
          errorCount++;
          this.logger.warn(`Failed to generate .art file for ${game.name}: ${artResult.error.message}`);
        }
      }

      this.logger.info(`Daijisho generation completed: ${successCount} successful, ${errorCount} errors`);

      if (errorCount > 0 && successCount === 0) {
        return Err(new DaijishoError(
          `Failed to generate any Daijisho files`,
          'GENERATION_FAILED'
        ));
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new DaijishoError(
        `Daijisho generation failed: ${error instanceof Error ? error.message : String(error)}`,
        'GENERATION_ERROR'
      ));
    }
  }

  /**
   * Create platform configuration for Apollo
   */
  private createPlatformConfig(): DaijishoPlatformConfig {
    return {
      databaseVersion: 1,
      revisionNumber: 1,
      platform: {
        name: 'Apollo',
        uniqueId: 'apollo-sunshine',
        shortname: 'apollo',
        acceptedFilenameRegex: '.*\\.art',
        screenAspectRatioId: 0,
        boxArtAspectRatioId: 0,
        extra: '',
      },
      playerList: [
        {
          name: 'Apollo Launcher',
          uniqueId: 'apollo-launcher',
          description: 'Launch games through Apollo/Sunshine',
          acceptedFilenameRegex: '.*\\.art',
          amStartArguments: '',
          killPackageProcesses: false,
          killPackageProcessesWarning: false,
          extra: '',
        },
      ],
    };
  }

  /**
   * Generate .art file for a single game
   */
  private async generateArtFile(
    game: GameMetadata,
    outputDir: string,
    options: FrontendOptions
  ): Promise<Result<void, DaijishoError>> {
    const filename = sanitizeFilename(game.name);
    const artFilePath = path.join(outputDir, `${filename}.art`);

    const artData = {
      title: game.name,
      description: game.description ?? '',
      genre: game.genre ?? '',
      releaseDate: game.releaseDate ?? '',
      developer: game.developer ?? '',
      publisher: game.publisher ?? '',
      launchCommand: game.launchCommand ?? '',

      // Artwork paths (local files take precedence)
      coverArt: game.localCoverPath ?? game.coverArtUrl ?? '',
      logo: game.localLogoPath ?? game.logoUrl ?? '',
      marquee: game.localMarqueePath ?? game.marqueeUrl ?? '',
      tile: game.localTilePath ?? game.tileUrl ?? '',
      background: game.localBackgroundPath ?? game.backgroundUrl ?? '',
      screenshots: game.localScreenshotPaths ?? game.screenshotUrls ?? [],
    };

    if (options.verbose) {
      this.logger.debug(artData, `Art file data for ${game.name}:`);
    }

    if (!options.dryRun) {
      const saveResult = await this.fileService.saveJsonFile(artFilePath, artData);
      if (!saveResult.success) {
        return Err(new DaijishoError(
          `Failed to save .art file: ${saveResult.error.message}`,
          'SAVE_ART_ERROR'
        ));
      }
    }

    return Ok(undefined);
  }
}
