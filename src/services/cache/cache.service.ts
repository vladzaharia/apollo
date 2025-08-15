import path from 'path';
import os from 'os';
import { Ok, Err, type Result } from '../../utils/result.js';
import type { Logger } from '../../utils/logger.js';
import type { IFileService } from '../file/file.service.js';
import type { ServerApp } from '../../models/apollo-app.js';

/**
 * Cache service errors
 */
export class CacheServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly path?: string
  ) {
    super(message);
    this.name = 'CacheServiceError';
  }
}

/**
 * Cached server state structure
 */
export interface CachedServerState {
  apps: ServerApp[];
  timestamp: number;
  checksum: string;
}

/**
 * Cache service interface
 */
export interface ICacheService {
  getCachedServerState(): Promise<Result<CachedServerState | null, CacheServiceError>>;
  setCachedServerState(apps: ServerApp[]): Promise<Result<void, CacheServiceError>>;
  clearCache(): Promise<Result<void, CacheServiceError>>;
  getCacheFilePath(): string;
}

/**
 * Cache service implementation
 */
export class CacheService implements ICacheService {
  private readonly cacheDir: string;
  private readonly cacheFile: string;

  constructor(
    private fileService: IFileService,
    private logger: Logger
  ) {
    // Store cache in user's home directory under .apollo-sync
    this.cacheDir = path.join(os.homedir(), '.apollo-sync');
    this.cacheFile = path.join(this.cacheDir, 'server-state.json');
  }

  /**
   * Get the cache file path
   */
  getCacheFilePath(): string {
    return this.cacheFile;
  }

  /**
   * Get cached server state
   */
  async getCachedServerState(): Promise<Result<CachedServerState | null, CacheServiceError>> {
    try {
      this.logger.debug(`Loading cached server state from: ${this.cacheFile}`);

      const existsResult = await this.fileService.fileExists(this.cacheFile);
      if (!existsResult.success) {
        return Err(new CacheServiceError(
          `Failed to check cache file existence: ${existsResult.error.message}`,
          'CACHE_CHECK_FAILED',
          this.cacheFile
        ));
      }

      if (!existsResult.data) {
        this.logger.debug('No cached server state found');
        return Ok(null);
      }

      const loadResult = await this.fileService.loadJsonFile<CachedServerState>(
        this.cacheFile,
        (data: unknown): CachedServerState => this.validateCachedState(data)
      );

      if (!loadResult.success) {
        this.logger.warn(`Failed to load cached state: ${loadResult.error.message}`);
        // If cache is corrupted, return null instead of error
        return Ok(null);
      }

      this.logger.debug(`Loaded cached server state with ${loadResult.data.apps.length} apps`);
      return Ok(loadResult.data);
    } catch (error) {
      return Err(new CacheServiceError(
        `Unexpected error loading cache: ${error instanceof Error ? error.message : String(error)}`,
        'CACHE_LOAD_ERROR',
        this.cacheFile
      ));
    }
  }

  /**
   * Set cached server state
   */
  async setCachedServerState(apps: ServerApp[]): Promise<Result<void, CacheServiceError>> {
    try {
      this.logger.debug(`Caching server state with ${apps.length} apps to: ${this.cacheFile}`);

      // Ensure cache directory exists
      const ensureDirResult = await this.fileService.ensureDirectory(this.cacheDir);
      if (!ensureDirResult.success) {
        return Err(new CacheServiceError(
          `Failed to create cache directory: ${ensureDirResult.error.message}`,
          'CACHE_DIR_CREATE_FAILED',
          this.cacheDir
        ));
      }

      const cachedState: CachedServerState = {
        apps,
        timestamp: Date.now(),
        checksum: this.calculateChecksum(apps),
      };

      const saveResult = await this.fileService.saveJsonFile(this.cacheFile, cachedState);
      if (!saveResult.success) {
        return Err(new CacheServiceError(
          `Failed to save cached state: ${saveResult.error.message}`,
          'CACHE_SAVE_FAILED',
          this.cacheFile
        ));
      }

      this.logger.debug('Successfully cached server state');
      return Ok(undefined);
    } catch (error) {
      return Err(new CacheServiceError(
        `Unexpected error saving cache: ${error instanceof Error ? error.message : String(error)}`,
        'CACHE_SAVE_ERROR',
        this.cacheFile
      ));
    }
  }

  /**
   * Clear the cache
   */
  async clearCache(): Promise<Result<void, CacheServiceError>> {
    try {
      this.logger.debug(`Clearing cache: ${this.cacheFile}`);

      const existsResult = await this.fileService.fileExists(this.cacheFile);
      if (!existsResult.success) {
        return Err(new CacheServiceError(
          `Failed to check cache file existence: ${existsResult.error.message}`,
          'CACHE_CHECK_FAILED',
          this.cacheFile
        ));
      }

      if (!existsResult.data) {
        this.logger.debug('Cache file does not exist, nothing to clear');
        return Ok(undefined);
      }

      // Use Node.js fs to remove the file since FileService doesn't have a delete method
      const fs = await import('fs/promises');
      await fs.unlink(this.cacheFile);

      this.logger.debug('Successfully cleared cache');
      return Ok(undefined);
    } catch (error) {
      return Err(new CacheServiceError(
        `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`,
        'CACHE_CLEAR_FAILED',
        this.cacheFile
      ));
    }
  }

  /**
   * Validate cached state structure
   */
  private validateCachedState(data: unknown): CachedServerState {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid cached state: not an object');
    }

    const state = data as Record<string, unknown>;

    if (!Array.isArray(state.apps)) {
      throw new Error('Invalid cached state: apps is not an array');
    }

    if (typeof state.timestamp !== 'number') {
      throw new Error('Invalid cached state: timestamp is not a number');
    }

    if (typeof state.checksum !== 'string') {
      throw new Error('Invalid cached state: checksum is not a string');
    }

    // Basic validation that apps array contains objects with name property
    for (const app of state.apps) {
      if (!app || typeof app !== 'object' || typeof (app as Record<string, unknown>).name !== 'string') {
        throw new Error('Invalid cached state: apps array contains invalid app objects');
      }
    }

    return {
      apps: state.apps as ServerApp[],
      timestamp: state.timestamp,
      checksum: state.checksum
    };
  }

  /**
   * Calculate a simple checksum for the apps array
   */
  private calculateChecksum(apps: ServerApp[]): string {
    const content = JSON.stringify(apps, Object.keys(apps).sort());
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}
