import * as path from 'path';
import * as xml2js from 'xml2js';
import { Ok, Err, type Result } from '../../utils/result.js';
import type { Logger } from '../../utils/logger.js';
import type { IFileService } from '../file/file.service.js';
import { sanitizeFilename, type GameMetadata, type FrontendOptions, type ESDeGameEntry } from '../../models/game-metadata.js';
import { generateArtLaunchUrl, type ApolloHostInfo } from '../../utils/art-url.js';
import type { ServerApp } from '../../models/apollo-app.js';
import { MediaDownloadService, type IMediaDownloadService } from '../media/media-download.service.js';

/**
 * ES-DE service errors
 */
export class ESDeError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ESDeError';
  }
}

/**
 * ES-DE service interface
 */
export interface IESDeService {
  generateConfig(
    games: GameMetadata[],
    options: FrontendOptions,
    hostInfo?: ApolloHostInfo | null
  ): Promise<Result<void, ESDeError>>;
}

/**
 * ES-DE service implementation
 */
export class ESDeService implements IESDeService {
  private xmlBuilder: xml2js.Builder;
  private mediaDownloadService: IMediaDownloadService;

  constructor(
    private fileService: IFileService,
    private logger: Logger
  ) {
    this.xmlBuilder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      rootName: 'gameList',
      renderOpts: { pretty: true, indent: '  ' },
    });
    this.mediaDownloadService = new MediaDownloadService(logger);
  }

  /**
   * Generate ES-DE configuration files
   */
  async generateConfig(
    games: GameMetadata[],
    options: FrontendOptions,
    hostInfo?: ApolloHostInfo | null
  ): Promise<Result<void, ESDeError>> {
    this.logger.info(`Generating ES-DE config for ${games.length} games`);

    try {
      const esDeDir = path.join(options.outputDir, 'es-de');
      
      if (!options.dryRun) {
        const ensureDirResult = await this.fileService.ensureDirectory(esDeDir);
        if (!ensureDirResult.success) {
          return Err(new ESDeError(
            `Failed to create ES-DE directory: ${ensureDirResult.error.message}`,
            'DIRECTORY_ERROR'
          ));
        }
      }

      // Generate gamelist.xml
      const gamelistResult = await this.generateGamelist(games, esDeDir, options);
      if (!gamelistResult.success) {
        return Err(gamelistResult.error);
      }

      // Generate system configuration
      const systemConfigResult = await this.generateSystemConfig(esDeDir, options);
      if (!systemConfigResult.success) {
        return Err(systemConfigResult.error);
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
            esDeDir,
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

        const artResult = await this.generateArtFile(gameWithMedia, esDeDir, options, hostInfo);
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
      const readmeResult = await this.generateReadme(esDeDir, options);
      if (!readmeResult.success) {
        this.logger.warn(`Failed to generate README: ${readmeResult.error.message}`);
      }

      if (mediaErrors > 0) {
        this.logger.warn(`${mediaErrors} games had media download errors`);
      }

      this.logger.info(`ES-DE generation completed: ${successCount} art files, ${errorCount} errors`);
      return Ok(undefined);
    } catch (error) {
      return Err(new ESDeError(
        `ES-DE generation failed: ${error instanceof Error ? error.message : String(error)}`,
        'GENERATION_ERROR'
      ));
    }
  }

  /**
   * Generate gamelist.xml file
   */
  private async generateGamelist(
    games: GameMetadata[],
    outputDir: string,
    options: FrontendOptions
  ): Promise<Result<void, ESDeError>> {
    const gamelistPath = path.join(outputDir, 'gamelist.xml');

    if (options.verbose) {
      this.logger.debug(`Generating gamelist.xml: ${gamelistPath}`);
    }

    const gameEntries: ESDeGameEntry[] = games.map(game => this.createGameEntry(game));

    const gamelistData = {
      game: gameEntries,
    };

    try {
      const xmlContent = this.xmlBuilder.buildObject(gamelistData);

      if (!options.dryRun) {
        // Save as plain text since it's already XML
        const saveResult = await this.fileService.saveJsonFile(gamelistPath, xmlContent);
        if (!saveResult.success) {
          return Err(new ESDeError(
            `Failed to save gamelist.xml: ${saveResult.error.message}`,
            'SAVE_GAMELIST_ERROR'
          ));
        }
      }

      if (options.verbose) {
        this.logger.debug(`Generated gamelist.xml with ${gameEntries.length} games`);
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new ESDeError(
        `Failed to generate gamelist.xml: ${error instanceof Error ? error.message : String(error)}`,
        'XML_GENERATION_ERROR'
      ));
    }
  }

  /**
   * Generate system configuration
   */
  private async generateSystemConfig(
    outputDir: string,
    options: FrontendOptions
  ): Promise<Result<void, ESDeError>> {
    const systemConfigPath = path.join(outputDir, 'es_systems.xml');

    if (options.verbose) {
      this.logger.debug(`Generating es_systems.xml: ${systemConfigPath}`);
    }

    const systemConfig = {
      system: {
        name: 'apollo',
        fullname: 'Apollo/Sunshine',
        path: './apollo',
        extension: '.art',
        command: 'apollo generate --game "%ROM%"',
        platform: 'apollo',
        theme: 'apollo',
      },
    };

    try {
      const xmlContent = this.xmlBuilder.buildObject({ systemList: systemConfig });

      if (!options.dryRun) {
        // Save as plain text since it's already XML
        const saveResult = await this.fileService.saveJsonFile(systemConfigPath, xmlContent);
        if (!saveResult.success) {
          return Err(new ESDeError(
            `Failed to save es_systems.xml: ${saveResult.error.message}`,
            'SAVE_SYSTEM_ERROR'
          ));
        }
      }

      if (options.verbose) {
        this.logger.debug('Generated es_systems.xml');
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new ESDeError(
        `Failed to generate es_systems.xml: ${error instanceof Error ? error.message : String(error)}`,
        'SYSTEM_XML_GENERATION_ERROR'
      ));
    }
  }

  /**
   * Create ES-DE game entry from game metadata
   */
  private createGameEntry(game: GameMetadata): ESDeGameEntry {
    const filename = sanitizeFilename(game.name);
    
    const entry: ESDeGameEntry = {
      path: `./${filename}.art`,
      name: game.name,
    };

    if (game.description) {
      entry.desc = game.description;
    }

    if (game.genre) {
      entry.genre = game.genre;
    }

    if (game.releaseDate) {
      // ES-DE expects date in YYYYMMDD format
      const year = game.releaseDate;
      entry.releasedate = `${year}0101T000000`;
    }

    if (game.developer) {
      entry.developer = game.developer;
    }

    if (game.publisher) {
      entry.publisher = game.publisher;
    }

    return entry;
  }

  /**
   * Generate .art file for a single game (similar to Daijisho)
   */
  private async generateArtFile(
    game: GameMetadata,
    outputDir: string,
    options: FrontendOptions,
    hostInfo?: ApolloHostInfo | null
  ): Promise<Result<void, ESDeError>> {
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
        return Err(new ESDeError(
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
  ): Promise<Result<void, ESDeError>> {
    const readmePath = path.join(outputDir, 'README.md');

    const readmeContent = `# Apollo/Artemis System for ES-DE

This folder contains a complete Apollo/Artemis system configuration for ES-DE (EmulationStation Desktop Edition).

## Contents

- \`es_systems.xml\` - System configuration file
- \`gamelist.xml\` - Game list with metadata
- \`*.art\` files - Individual game launcher files
- \`media/\` - Game artwork and media files (covers, logos, backgrounds, etc.)

## Installation Instructions

### 1. Copy Files to ES-DE
Copy this entire folder to your ES-DE ROMs directory, for example:
\`\`\`
~/.emulationstation/ROMs/apollo/
\`\`\`

### 2. Configure ES-DE System
1. Copy \`es_systems.xml\` to your ES-DE configuration directory:
   - Linux: \`~/.emulationstation/custom_systems/es_systems.xml\`
   - Windows: \`%HOMEPATH%\\.emulationstation\\custom_systems\\es_systems.xml\`
   - macOS: \`~/.emulationstation/custom_systems/es_systems.xml\`

2. Restart ES-DE to load the new system configuration

### 3. Verify Game Detection
1. Launch ES-DE
2. Navigate to the "Apollo/Sunshine" system
3. Your games should appear with artwork and metadata

### 4. Install Artemis Client (if using on Android/mobile)
If you plan to use this with an Android device running ES-DE:
- Install Artemis client: \`com.limelight.noir\`
- Available from GitHub releases or F-Droid

## System Configuration

The Apollo system is configured with:
- **Name**: apollo
- **Full Name**: Apollo/Sunshine
- **Extensions**: .art
- **Command**: Custom launcher for Apollo games

## File Structure

\`\`\`
apollo/
├── README.md              # This file
├── es_systems.xml          # System configuration
├── gamelist.xml           # Game metadata
├── *.art                  # Game launcher files
└── media/                 # Game artwork
    ├── GameName1/
    │   ├── cover.png
    │   ├── logo.png
    │   └── background.png
    └── GameName2/
        ├── cover.png
        └── logo.png
\`\`\`

## Usage

Once configured, you can:
- Browse games in the Apollo/Sunshine system
- View game artwork and metadata
- Launch games directly through Artemis
- Use ES-DE's built-in features (favorites, collections, etc.)

## Troubleshooting

- **System not appearing**: Check that \`es_systems.xml\` is in the correct custom_systems directory
- **Games not launching**: Ensure Artemis is installed and configured
- **Missing artwork**: Verify the \`media/\` folder structure is intact
- **Metadata not showing**: Check that \`gamelist.xml\` is in the same directory as the .art files

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
        return Err(new ESDeError(
          `Failed to save README: ${error instanceof Error ? error.message : String(error)}`,
          'SAVE_README_ERROR'
        ));
      }
    }

    return Ok(undefined);
  }
}
