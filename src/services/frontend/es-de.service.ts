import * as path from 'path';
import * as xml2js from 'xml2js';
import { Result, Ok, Err } from '../../utils/result.js';
import type { Logger } from '../../utils/logger.js';
import type { IFileService } from '../file/file.service.js';
import type { GameMetadata, FrontendOptions, ESDeGameEntry } from '../../models/game-metadata.js';
import { sanitizeFilename } from '../../models/game-metadata.js';

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
  generateConfig(games: GameMetadata[], options: FrontendOptions): Promise<Result<void, ESDeError>>;
}

/**
 * ES-DE service implementation
 */
export class ESDeService implements IESDeService {
  private xmlBuilder: xml2js.Builder;

  constructor(
    private fileService: IFileService,
    private logger: Logger
  ) {
    this.xmlBuilder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      rootName: 'gameList',
      renderOpts: { pretty: true, indent: '  ' },
    });
  }

  /**
   * Generate ES-DE configuration files
   */
  async generateConfig(
    games: GameMetadata[], 
    options: FrontendOptions
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

      this.logger.info('ES-DE generation completed successfully');
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
        command: 'apollo-sync generate --game "%ROM%"',
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
}
