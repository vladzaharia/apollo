import SGDB from 'steamgriddb';
import { Ok, Err, fromPromise, type Result } from '../../utils/result.js';
import { retryAsyncIf, shouldRetry } from '../../utils/retry.js';
import type { Logger } from '../../utils/logger.js';

/**
 * SteamGridDB service errors
 */
export class SteamGridDbError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'SteamGridDbError';
  }
}

/**
 * SteamGridDB artwork types
 */
export interface SteamGridDbArtwork {
  coverUrl?: string;
  logoUrl?: string;
  marqueeUrl?: string;
  tileUrl?: string;
  backgroundUrl?: string;
  screenshotUrls?: string[];
}

/**
 * SteamGridDB service interface
 */
export interface ISteamGridDbService {
  searchGameArtwork(gameName: string, steamAppId?: string): Promise<Result<SteamGridDbArtwork, SteamGridDbError>>;
  isConfigured(): boolean;
}

/**
 * SteamGridDB service implementation
 */
export class SteamGridDbService implements ISteamGridDbService {
  private client: SGDB | null = null;

  constructor(
    private apiKey: string | undefined,
    private logger: Logger
  ) {
    if (this.apiKey) {
      this.client = new SGDB(this.apiKey);
      this.logger.debug('SteamGridDB client initialized');
    } else {
      this.logger.debug('SteamGridDB API key not provided - service disabled');
    }
  }

  /**
   * Check if the service is configured
   */
  isConfigured(): boolean {
    return Boolean(this.client);
  }

  /**
   * Search for game artwork
   */
  async searchGameArtwork(
    gameName: string, 
    steamAppId?: string
  ): Promise<Result<SteamGridDbArtwork, SteamGridDbError>> {
    if (!this.client) {
      return Err(new SteamGridDbError(
        'SteamGridDB service not configured - API key required',
        'NOT_CONFIGURED'
      ));
    }

    this.logger.debug(`Searching SteamGridDB for: ${gameName}${steamAppId ? ` (Steam ID: ${steamAppId})` : ''}`);

    try {
      // First, try to find the game
      let gameId: number | null = null;

      if (steamAppId) {
        // Try to find by Steam App ID first
        const steamGameResult = await this.searchBySteamAppId(steamAppId);
        if (steamGameResult.success) {
          gameId = steamGameResult.data;
        }
      }

      if (!gameId) {
        // Search by name
        const nameSearchResult = await this.searchByName(gameName);
        if (nameSearchResult.success) {
          gameId = nameSearchResult.data;
        }
      }

      if (!gameId) {
        return Err(new SteamGridDbError(
          `Game not found in SteamGridDB: ${gameName}`,
          'GAME_NOT_FOUND'
        ));
      }

      // Fetch artwork for the game
      const artworkResult = await this.fetchArtwork(gameId);
      if (!artworkResult.success) {
        return Err(artworkResult.error);
      }

      this.logger.debug(`Successfully found artwork for: ${gameName}`);
      return Ok(artworkResult.data);
    } catch (error) {
      return Err(new SteamGridDbError(
        `SteamGridDB search failed: ${error instanceof Error ? error.message : String(error)}`,
        'SEARCH_FAILED'
      ));
    }
  }

  /**
   * Search for game by Steam App ID
   */
  private async searchBySteamAppId(steamAppId: string): Promise<Result<number, SteamGridDbError>> {
    if (!this.client) {
      return Err(new SteamGridDbError('Client not initialized', 'NOT_CONFIGURED'));
    }

    const searchResult = await retryAsyncIf(
      async () => {
        // We already checked that client exists above
        const client = this.client as NonNullable<typeof this.client>;
        const games = await client.getGameBySteamAppId(parseInt(steamAppId, 10));
        return games;
      },
      shouldRetry,
      { maxAttempts: 3 },
      this.logger,
      `SteamGridDB search by Steam ID ${steamAppId}`
    );

    if (!searchResult.success) {
      return Err(new SteamGridDbError(
        `Failed to search by Steam App ID: ${searchResult.error.message}`,
        'STEAM_SEARCH_FAILED'
      ));
    }

    const games = searchResult.data;
    if (!games?.id) {
      return Err(new SteamGridDbError(
        `No game found for Steam App ID: ${steamAppId}`,
        'STEAM_GAME_NOT_FOUND'
      ));
    }

    return Ok(games.id);
  }

  /**
   * Search for game by name
   */
  private async searchByName(gameName: string): Promise<Result<number, SteamGridDbError>> {
    if (!this.client) {
      return Err(new SteamGridDbError('Client not initialized', 'NOT_CONFIGURED'));
    }

    const searchResult = await retryAsyncIf(
      async () => {
        // We already checked that client exists above
        const client = this.client as NonNullable<typeof this.client>;
        const games = await client.searchGame(gameName);
        return games;
      },
      shouldRetry,
      { maxAttempts: 3 },
      this.logger,
      `SteamGridDB search by name ${gameName}`
    );

    if (!searchResult.success) {
      return Err(new SteamGridDbError(
        `Failed to search by name: ${searchResult.error.message}`,
        'NAME_SEARCH_FAILED'
      ));
    }

    const games = searchResult.data;
    if (!games || games.length === 0) {
      return Err(new SteamGridDbError(
        `No games found for: ${gameName}`,
        'NAME_GAME_NOT_FOUND'
      ));
    }

    // Return the first match
    return Ok(games[0].id);
  }

  /**
   * Fetch artwork for a game ID
   */
  private async fetchArtwork(gameId: number): Promise<Result<SteamGridDbArtwork, SteamGridDbError>> {
    if (!this.client) {
      return Err(new SteamGridDbError('Client not initialized', 'NOT_CONFIGURED'));
    }

    const artwork: SteamGridDbArtwork = {};

    try {
      // Fetch different types of artwork in parallel
      const [gridsResult, logosResult, iconsResult, heroesResult] = await Promise.allSettled([
        this.fetchGrids(gameId),
        this.fetchLogos(gameId),
        this.fetchIcons(gameId),
        this.fetchHeroes(gameId),
      ]);

      // Process grids (covers)
      if (gridsResult.status === 'fulfilled' && gridsResult.value.success) {
        artwork.coverUrl = gridsResult.value.data;
      }

      // Process logos
      if (logosResult.status === 'fulfilled' && logosResult.value.success) {
        artwork.logoUrl = logosResult.value.data;
      }

      // Process icons (tiles)
      if (iconsResult.status === 'fulfilled' && iconsResult.value.success) {
        artwork.tileUrl = iconsResult.value.data;
      }

      // Process heroes (backgrounds)
      if (heroesResult.status === 'fulfilled' && heroesResult.value.success) {
        artwork.backgroundUrl = heroesResult.value.data;
      }

      return Ok(artwork);
    } catch (error) {
      return Err(new SteamGridDbError(
        `Failed to fetch artwork: ${error instanceof Error ? error.message : String(error)}`,
        'ARTWORK_FETCH_FAILED'
      ));
    }
  }

  /**
   * Fetch grid artwork (covers)
   */
  private async fetchGrids(gameId: number): Promise<Result<string | undefined, SteamGridDbError>> {
    // Client is validated in fetchArtwork before calling this method
    const client = this.client as NonNullable<typeof this.client>;
    const result = await fromPromise(client.getGrids({ id: gameId, type: 'game' }));
    if (!result.success) {
      return Err(new SteamGridDbError('Failed to fetch grids', 'GRIDS_FETCH_FAILED'));
    }

    const grids = result.data;
    if (grids && grids.length > 0) {
      const firstGrid = grids[0];
      return Ok(firstGrid?.url.toString());
    }

    return Ok(undefined);
  }

  /**
   * Fetch logo artwork
   */
  private async fetchLogos(gameId: number): Promise<Result<string | undefined, SteamGridDbError>> {
    // Client is validated in fetchArtwork before calling this method
    const client = this.client as NonNullable<typeof this.client>;
    const result = await fromPromise(client.getLogos({ id: gameId, type: 'game' }));
    if (!result.success) {
      return Err(new SteamGridDbError('Failed to fetch logos', 'LOGOS_FETCH_FAILED'));
    }

    const logos = result.data;
    if (logos && logos.length > 0) {
      const firstLogo = logos[0];
      return Ok(firstLogo?.url.toString());
    }

    return Ok(undefined);
  }

  /**
   * Fetch icon artwork (tiles)
   */
  private async fetchIcons(gameId: number): Promise<Result<string | undefined, SteamGridDbError>> {
    // Client is validated in fetchArtwork before calling this method
    const client = this.client as NonNullable<typeof this.client>;
    const result = await fromPromise(client.getIcons({ id: gameId, type: 'game' }));
    if (!result.success) {
      return Err(new SteamGridDbError('Failed to fetch icons', 'ICONS_FETCH_FAILED'));
    }

    const icons = result.data;
    if (icons && icons.length > 0) {
      const firstIcon = icons[0];
      return Ok(firstIcon?.url.toString());
    }

    return Ok(undefined);
  }

  /**
   * Fetch hero artwork (backgrounds)
   */
  private async fetchHeroes(gameId: number): Promise<Result<string | undefined, SteamGridDbError>> {
    // Client is validated in fetchArtwork before calling this method
    const client = this.client as NonNullable<typeof this.client>;
    const result = await fromPromise(client.getHeroes({ id: gameId, type: 'game' }));
    if (!result.success) {
      return Err(new SteamGridDbError('Failed to fetch heroes', 'HEROES_FETCH_FAILED'));
    }

    const heroes = result.data;
    if (heroes && heroes.length > 0) {
      const firstHero = heroes[0];
      return Ok(firstHero?.url.toString());
    }

    return Ok(undefined);
  }
}
