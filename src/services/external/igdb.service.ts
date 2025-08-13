import * as igdb from 'igdb-api-node';
import type { Result } from '../../utils/result.js';
import { Ok, Err } from '../../utils/result.js';
import { retryAsyncIf, shouldRetry } from '../../utils/retry.js';
import type { Logger } from '../../utils/logger.js';
import type { IgdbGame, IgdbApiResponse } from './igdb-types.js';

/**
 * IGDB service errors
 */
export class IgdbError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'IgdbError';
  }
}

/**
 * IGDB game data
 */
export interface IgdbGameData {
  name: string;
  description?: string;
  genre?: string;
  releaseDate?: string;
  developer?: string;
  publisher?: string;
  coverUrl?: string;
  screenshotUrls?: string[];
}

/**
 * IGDB service interface
 */
export interface IIgdbService {
  searchGameMetadata(gameName: string): Promise<Result<IgdbGameData, IgdbError>>;
  isConfigured(): boolean;
}

/**
 * IGDB service implementation
 */
export class IgdbService implements IIgdbService {
  private client: any | null = null;

  constructor(
    private clientId: string | undefined,
    private accessToken: string | undefined,
    private logger: Logger
  ) {
    if (this.clientId && this.accessToken) {
      this.client = (igdb as any).default ? (igdb as any).default(this.clientId, this.accessToken) : (igdb as any)(this.clientId, this.accessToken);
      this.logger.debug('IGDB client initialized');
    } else {
      this.logger.debug('IGDB credentials not provided - service disabled');
    }
  }

  /**
   * Check if the service is configured
   */
  isConfigured(): boolean {
    return Boolean(this.client);
  }

  /**
   * Search for game metadata
   */
  async searchGameMetadata(gameName: string): Promise<Result<IgdbGameData, IgdbError>> {
    if (!this.client) {
      return Err(new IgdbError(
        'IGDB service not configured - client ID and access token required',
        'NOT_CONFIGURED'
      ));
    }

    this.logger.debug(`Searching IGDB for: ${gameName}`);

    try {
      const searchResult = await retryAsyncIf(
        async () => {
          const response = await this.client!
            .fields([
              'name',
              'summary',
              'genres.name',
              'first_release_date',
              'involved_companies.company.name',
              'involved_companies.developer',
              'involved_companies.publisher',
              'cover.url',
              'screenshots.url'
            ])
            .search(gameName)
            .request('/games') as IgdbApiResponse<IgdbGame[]>;

          return response.data;
        },
        shouldRetry,
        { maxAttempts: 3 },
        this.logger,
        `IGDB search for ${gameName}`
      );

      if (!searchResult.success) {
        return Err(new IgdbError(
          `IGDB search failed: ${searchResult.error.message}`,
          'SEARCH_FAILED'
        ));
      }

      const games = searchResult.data;
      if (!games || games.length === 0) {
        return Err(new IgdbError(
          `No games found in IGDB for: ${gameName}`,
          'GAME_NOT_FOUND'
        ));
      }

      // Use the first match
      const game = games[0];
      const gameData = this.parseGameData(game);

      this.logger.debug(`Successfully found IGDB data for: ${gameName}`);
      return Ok(gameData);
    } catch (error) {
      return Err(new IgdbError(
        `IGDB search failed: ${error instanceof Error ? error.message : String(error)}`,
        'SEARCH_FAILED'
      ));
    }
  }

  /**
   * Parse IGDB game data into our format
   */
  private parseGameData(game: IgdbGame): IgdbGameData {
    const gameData: IgdbGameData = {
      name: game.name ?? '',
    };

    // Description
    if (game.summary) {
      gameData.description = game.summary;
    }

    // Genre
    if (game.genres && game.genres.length > 0) {
      gameData.genre = game.genres[0]?.name;
    }

    // Release date
    if (game.first_release_date) {
      const date = new Date(game.first_release_date * 1000);
      gameData.releaseDate = date.getFullYear().toString();
    }

    // Developer and Publisher
    if (game.involved_companies && game.involved_companies.length > 0) {
      const developer = game.involved_companies.find((company) => company.developer);
      const publisher = game.involved_companies.find((company) => company.publisher);

      if (developer?.company) {
        gameData.developer = developer.company.name;
      }

      if (publisher?.company) {
        gameData.publisher = publisher.company.name;
      }
    }

    // Cover art
    if (game.cover?.url) {
      // Convert to high-res image
      gameData.coverUrl = this.convertImageUrl(game.cover.url, 'cover_big');
    }

    // Screenshots
    if (game.screenshots && game.screenshots.length > 0) {
      gameData.screenshotUrls = game.screenshots
        .slice(0, 5) // Limit to 5 screenshots
        .map((screenshot) => this.convertImageUrl(screenshot.url, 'screenshot_big'));
    }

    return gameData;
  }

  /**
   * Convert IGDB image URL to desired size
   */
  private convertImageUrl(url: string, size: string): string {
    if (!url) return '';
    
    // IGDB URLs are in format: //images.igdb.com/igdb/image/upload/t_thumb/imageid.jpg
    // We need to replace t_thumb with the desired size
    return url.replace('t_thumb', `t_${size}`).replace('//', 'https://');
  }
}
