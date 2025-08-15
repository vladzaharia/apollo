import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import axios from 'axios';
import { Ok, Err, type Result } from '../../utils/result.js';
import { fromPromise } from '../../utils/result.js';
import type { Logger } from '../../utils/logger.js';
import type { GameMetadata } from '../../models/game-metadata.js';

/**
 * Media download error
 */
export class MediaDownloadError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly url?: string
  ) {
    super(message);
    this.name = 'MediaDownloadError';
  }
}

/**
 * Downloaded media info
 */
export interface DownloadedMedia {
  originalUrl: string;
  localPath: string;
  relativePath: string;
  filename: string;
}

/**
 * Media download service interface
 */
export interface IMediaDownloadService {
  downloadGameMedia(
    game: GameMetadata,
    frontendDir: string,
    options?: MediaDownloadOptions
  ): Promise<Result<GameMetadata, MediaDownloadError>>;

  downloadImage(
    url: string,
    outputPath: string
  ): Promise<Result<DownloadedMedia, MediaDownloadError>>;
}

/**
 * Media download options
 */
export interface MediaDownloadOptions {
  skipExisting?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Media download service implementation
 */
export class MediaDownloadService implements IMediaDownloadService {
  constructor(private logger: Logger) {}

  /**
   * Download all media for a game and update metadata with local paths
   */
  async downloadGameMedia(
    game: GameMetadata,
    frontendDir: string,
    options: MediaDownloadOptions = {}
  ): Promise<Result<GameMetadata, MediaDownloadError>> {
    const { skipExisting = false, verbose = false, dryRun = false } = options;

    if (verbose) {
      this.logger.debug(`Downloading media for game: ${game.name}`);
    }

    // Create game-specific media directory within the frontend directory
    const gameDir = this.sanitizeFilename(game.name);
    const mediaDir = path.join(frontendDir, 'media', gameDir);
    
    if (!dryRun) {
      const ensureDirResult = await this.ensureDirectory(mediaDir);
      if (!ensureDirResult.success) {
        return Err(new MediaDownloadError(
          `Failed to create media directory: ${ensureDirResult.error.message}`,
          'DIRECTORY_ERROR'
        ));
      }
    }

    const updatedGame: GameMetadata = { ...game };
    const downloadPromises: Promise<void>[] = [];

    // Download cover art
    if (game.coverArtUrl) {
      downloadPromises.push(
        this.downloadAndUpdatePath(
          game.coverArtUrl,
          mediaDir,
          frontendDir,
          'cover',
          (localPath, relativePath) => {
            updatedGame.localCoverPath = relativePath;
          },
          { skipExisting, verbose, dryRun }
        )
      );
    }

    // Download logo
    if (game.logoUrl) {
      downloadPromises.push(
        this.downloadAndUpdatePath(
          game.logoUrl,
          mediaDir,
          frontendDir,
          'logo',
          (localPath, relativePath) => {
            updatedGame.localLogoPath = relativePath;
          },
          { skipExisting, verbose, dryRun }
        )
      );
    }

    // Download marquee
    if (game.marqueeUrl) {
      downloadPromises.push(
        this.downloadAndUpdatePath(
          game.marqueeUrl,
          mediaDir,
          frontendDir,
          'marquee',
          (localPath, relativePath) => {
            updatedGame.localMarqueePath = relativePath;
          },
          { skipExisting, verbose, dryRun }
        )
      );
    }

    // Download tile
    if (game.tileUrl) {
      downloadPromises.push(
        this.downloadAndUpdatePath(
          game.tileUrl,
          mediaDir,
          frontendDir,
          'tile',
          (localPath, relativePath) => {
            updatedGame.localTilePath = relativePath;
          },
          { skipExisting, verbose, dryRun }
        )
      );
    }

    // Download background
    if (game.backgroundUrl) {
      downloadPromises.push(
        this.downloadAndUpdatePath(
          game.backgroundUrl,
          mediaDir,
          frontendDir,
          'background',
          (localPath, relativePath) => {
            updatedGame.localBackgroundPath = relativePath;
          },
          { skipExisting, verbose, dryRun }
        )
      );
    }

    // Download screenshots
    if (game.screenshotUrls && game.screenshotUrls.length > 0) {
      const screenshotPaths: string[] = [];

      for (let i = 0; i < game.screenshotUrls.length; i++) {
        const url = game.screenshotUrls[i];
        if (url) {
          downloadPromises.push(
            this.downloadAndUpdatePath(
              url,
              mediaDir,
              frontendDir,
              `screenshot_${i + 1}`,
              (localPath, relativePath) => {
                screenshotPaths.push(relativePath);
              },
              { skipExisting, verbose, dryRun }
            )
          );
        }
      }
      
      if (screenshotPaths.length > 0) {
        updatedGame.localScreenshotPaths = screenshotPaths;
      }
    }

    // Wait for all downloads to complete
    try {
      await Promise.all(downloadPromises);
    } catch (error) {
      return Err(new MediaDownloadError(
        `Failed to download media for ${game.name}: ${error instanceof Error ? error.message : String(error)}`,
        'DOWNLOAD_ERROR'
      ));
    }

    if (verbose && !dryRun) {
      this.logger.debug(`Successfully downloaded media for: ${game.name}`);
    }

    return Ok(updatedGame);
  }

  /**
   * Download a single image from URL
   */
  async downloadImage(
    url: string,
    outputPath: string
  ): Promise<Result<DownloadedMedia, MediaDownloadError>> {
    try {
      this.logger.debug(`Downloading image: ${url}`);

      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'Apollo-Generate/1.0.0',
        },
      });

      if (response.status !== 200) {
        return Err(new MediaDownloadError(
          `Failed to download image: HTTP ${response.status}`,
          'HTTP_ERROR',
          url
        ));
      }

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      const ensureDirResult = await this.ensureDirectory(outputDir);
      if (!ensureDirResult.success) {
        return Err(new MediaDownloadError(
          `Failed to create output directory: ${ensureDirResult.error.message}`,
          'DIRECTORY_ERROR',
          url
        ));
      }

      // Download the file
      const writeStream = createWriteStream(outputPath);
      await pipeline(response.data, writeStream);

      const filename = path.basename(outputPath);
      const relativePath = path.relative(process.cwd(), outputPath);

      return Ok({
        originalUrl: url,
        localPath: outputPath,
        relativePath,
        filename,
      });
    } catch (error) {
      return Err(new MediaDownloadError(
        `Download failed: ${error instanceof Error ? error.message : String(error)}`,
        'DOWNLOAD_ERROR',
        url
      ));
    }
  }

  /**
   * Download image and update game metadata path
   */
  private async downloadAndUpdatePath(
    url: string,
    mediaDir: string,
    frontendDir: string,
    prefix: string,
    updateCallback: (localPath: string, relativePath: string) => void,
    options: MediaDownloadOptions
  ): Promise<void> {
    const { skipExisting = false, verbose = false, dryRun = false } = options;
    
    // Extract file extension from URL
    const urlPath = new URL(url).pathname;
    const extension = path.extname(urlPath) || '.jpg';
    const filename = `${prefix}${extension}`;
    const outputPath = path.join(mediaDir, filename);
    
    // Generate relative path from frontend directory (e.g., "./media/GameName/cover.png")
    const relativePath = path.relative(frontendDir, outputPath);

    // Check if file already exists
    if (skipExisting && !dryRun) {
      try {
        await fs.access(outputPath);
        // File exists, use existing path
        updateCallback(outputPath, relativePath);
        if (verbose) {
          this.logger.debug(`Skipping existing file: ${filename}`);
        }
        return;
      } catch {
        // File doesn't exist, continue with download
      }
    }

    if (dryRun) {
      updateCallback(outputPath, relativePath);
      if (verbose) {
        this.logger.debug(`[DRY RUN] Would download: ${url} -> ${filename}`);
      }
      return;
    }

    const downloadResult = await this.downloadImage(url, outputPath);
    if (downloadResult.success) {
      updateCallback(downloadResult.data.localPath, relativePath);
      if (verbose) {
        this.logger.debug(`Downloaded: ${filename}`);
      }
    } else {
      this.logger.warn(`Failed to download ${url}: ${downloadResult.error.message}`);
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectory(dirPath: string): Promise<Result<void, Error>> {
    const result = await fromPromise(fs.mkdir(dirPath, { recursive: true }));
    if (result.success) {
      return Ok(undefined);
    } else {
      return Err(result.error);
    }
  }

  /**
   * Sanitize filename for filesystem
   */
  private sanitizeFilename(filename: string): string {
    return filename.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
  }
}
