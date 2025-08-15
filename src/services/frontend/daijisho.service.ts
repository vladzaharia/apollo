import * as path from 'path';
import { Ok, Err, type Result } from '../../utils/result.js';
import type { Logger } from '../../utils/logger.js';
import type { IFileService } from '../file/file.service.js';
import { sanitizeFilename, type GameMetadata, type FrontendOptions, type DaijishoPlatformConfig } from '../../models/game-metadata.js';
import { generateArtLaunchUrl, type ApolloHostInfo } from '../../utils/art-url.js';
import type { ServerApp } from '../../models/apollo-app.js';
import { MediaDownloadService, type IMediaDownloadService } from '../media/media-download.service.js';

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
  generateConfig(
    games: GameMetadata[],
    options: FrontendOptions,
    hostInfo?: ApolloHostInfo | null
  ): Promise<Result<void, DaijishoError>>;
}

/**
 * Daijisho service implementation
 */
export class DaijishoService implements IDaijishoService {
  private mediaDownloadService: IMediaDownloadService;

  constructor(
    private fileService: IFileService,
    private logger: Logger
  ) {
    this.mediaDownloadService = new MediaDownloadService(logger);
  }

  /**
   * Generate Daijisho configuration files
   */
  async generateConfig(
    games: GameMetadata[],
    options: FrontendOptions,
    hostInfo?: ApolloHostInfo | null
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

      // Download media and generate .art files for each game
      let successCount = 0;
      let errorCount = 0;
      let mediaErrors = 0;

      for (const game of games) {
        let gameWithMedia = game;

        // Download media if artwork is enabled
        if (!options.noArtwork) {
          const mediaResult = await this.mediaDownloadService.downloadGameMedia(
            game,
            daijishoDir,
            {
              skipExisting: false,
              verbose: options.verbose,
              dryRun: options.dryRun,
            }
          );

          if (mediaResult.success) {
            gameWithMedia = mediaResult.data;
          } else {
            mediaErrors++;
            if (options.verbose) {
              this.logger.warn(`Failed to download media for ${game.name}: ${mediaResult.error.message}`);
            }
          }
        }

        const artResult = await this.generateArtFile(gameWithMedia, daijishoDir, options, hostInfo);
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

      // Generate README with import instructions
      const readmeResult = await this.generateReadme(daijishoDir, options);
      if (!readmeResult.success) {
        this.logger.warn(`Failed to generate README: ${readmeResult.error.message}`);
      }

      if (mediaErrors > 0) {
        this.logger.warn(`${mediaErrors} games had media download errors`);
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
    options: FrontendOptions,
    hostInfo?: ApolloHostInfo | null
  ): Promise<Result<void, DaijishoError>> {
    const filename = sanitizeFilename(game.name);
    const artFilePath = path.join(outputDir, `${filename}.art`);

    // Generate launch command - prefer art:// URL if host info and app UUID are available
    let launchCommand = game.launchCommand ?? '';
    if (hostInfo && game.apolloAppUuid) {
      // Create a mock ServerApp for URL generation
      const mockApp: ServerApp = {
        name: game.name,
        uuid: game.apolloAppUuid,
      } as ServerApp;

      launchCommand = generateArtLaunchUrl(hostInfo, mockApp);
    }

    const artData = {
      title: game.name,
      description: game.description ?? '',
      genre: game.genre ?? '',
      releaseDate: game.releaseDate ?? '',
      developer: game.developer ?? '',
      publisher: game.publisher ?? '',
      launchCommand,

      // Artwork paths (local files take precedence over URLs)
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

  /**
   * Generate README with import instructions
   */
  private async generateReadme(
    outputDir: string,
    options: FrontendOptions
  ): Promise<Result<void, DaijishoError>> {
    const readmePath = path.join(outputDir, 'README.md');

    const readmeContent = `# Apollo/Artemis Platform for Daijisho

This folder contains a complete Apollo/Artemis platform configuration for Daijisho.

## Contents

- \`platform.json\` - Platform configuration file
- \`*.art\` files - Individual game launcher files
- \`media/\` - Game artwork and media files (covers, logos, backgrounds, etc.)

## Installation Instructions

### 1. Copy Files to Device
Copy this entire folder to your Android device, for example:
\`\`\`
/sdcard/Roms/Apollo/
\`\`\`

### 2. Import Platform in Daijisho
1. Open Daijisho
2. Go to **Settings** > **Library** > **Import platform**
3. Navigate to the folder where you copied the files
4. Select the \`platform.json\` file
5. Daijisho will import the platform configuration

### 3. Sync Games
1. After importing, go to **Settings** > **Library** > **Sync paths**
2. Find the "Apollo" or "Artemis" platform in the list
3. Set the path to the folder containing the \`.art\` files
4. Tap **Sync** to scan for games

### 4. Install Artemis Client
Make sure you have the Artemis client installed on your Android device:
- Package name: \`com.limelight.noir\`
- Available from GitHub releases or F-Droid

## Usage

Once configured, you can launch games directly from Daijisho. The platform will:
- Use Artemis to connect to your Apollo server
- Launch games with proper host and app identification
- Display artwork and metadata for each game

## Troubleshooting

- **Games not launching**: Ensure Artemis is installed and can connect to your Apollo server
- **Missing artwork**: Check that the \`media/\` folder was copied correctly
- **Platform not appearing**: Verify the \`platform.json\` file was imported successfully

For more information, visit: https://github.com/LizardByte/Sunshine
`;

    if (options.verbose) {
      this.logger.debug(`Generating README: ${readmePath}`);
    }

    if (!options.dryRun) {
      try {
        const fs = await import('fs/promises');
        await fs.writeFile(readmePath, readmeContent, 'utf8');
      } catch (error) {
        return Err(new DaijishoError(
          `Failed to save README: ${error instanceof Error ? error.message : String(error)}`,
          'SAVE_README_ERROR'
        ));
      }
    }

    return Ok(undefined);
  }
}
