import { z } from 'zod';

/**
 * Game metadata schema for frontend generation
 */
const GameMetadataSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  genre: z.string().optional(),
  releaseDate: z.string().optional(),
  developer: z.string().optional(),
  publisher: z.string().optional(),
  steamAppId: z.string().optional(),
  launchCommand: z.string().optional(),
  
  // Artwork URLs
  coverArtUrl: z.string().optional(),
  screenshotUrls: z.array(z.string()).optional(),
  logoUrl: z.string().optional(),
  marqueeUrl: z.string().optional(),
  tileUrl: z.string().optional(),
  backgroundUrl: z.string().optional(),
  
  // Local file paths
  localCoverPath: z.string().optional(),
  localLogoPath: z.string().optional(),
  localMarqueePath: z.string().optional(),
  localTilePath: z.string().optional(),
  localBackgroundPath: z.string().optional(),
  localScreenshotPaths: z.array(z.string()).optional(),
});

export type GameMetadata = z.infer<typeof GameMetadataSchema>;

/**
 * Frontend generation options
 */
const FrontendOptionsSchema = z.object({
  outputDir: z.string(),
  dryRun: z.boolean().default(false),
  verbose: z.boolean().default(false),
  noArtwork: z.boolean().default(false),
  frontend: z.enum(['daijisho', 'es-de', 'both']).default('both'),
});

export type FrontendOptions = z.infer<typeof FrontendOptionsSchema>;

/**
 * Daijisho platform configuration
 */
export const DaijishoPlatformConfigSchema = z.object({
  databaseVersion: z.number(),
  revisionNumber: z.number(),
  platform: z.object({
    name: z.string(),
    uniqueId: z.string(),
    shortname: z.string(),
    acceptedFilenameRegex: z.string(),
    screenAspectRatioId: z.number(),
    boxArtAspectRatioId: z.number(),
    extra: z.string(),
  }),
  playerList: z.array(z.object({
    name: z.string(),
    uniqueId: z.string(),
    description: z.string(),
    acceptedFilenameRegex: z.string(),
    amStartArguments: z.string(),
    killPackageProcesses: z.boolean(),
    killPackageProcessesWarning: z.boolean(),
    extra: z.string(),
  })),
});

export type DaijishoPlatformConfig = z.infer<typeof DaijishoPlatformConfigSchema>;

/**
 * ES-DE game entry
 */
export const ESDeGameEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  desc: z.string().optional(),
  genre: z.string().optional(),
  releasedate: z.string().optional(),
  developer: z.string().optional(),
  publisher: z.string().optional(),
});

export type ESDeGameEntry = z.infer<typeof ESDeGameEntrySchema>;

/**
 * Validation functions
 */
export const validateGameMetadata = (data: unknown): GameMetadata => {
  return GameMetadataSchema.parse(data);
};

export const validateFrontendOptions = (data: unknown): FrontendOptions => {
  return FrontendOptionsSchema.parse(data);
};

/**
 * Utility functions
 */
export const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
};

export const createGameMetadata = (
  name: string,
  steamAppId?: string,
  launchCommand?: string
): GameMetadata => {
  return {
    name,
    steamAppId,
    launchCommand,
  };
};

export const hasArtwork = (metadata: GameMetadata): boolean => {
  return Boolean(
    metadata.coverArtUrl ??
    metadata.logoUrl ??
    metadata.marqueeUrl ??
    metadata.tileUrl ??
    metadata.backgroundUrl ??
    (metadata.screenshotUrls && metadata.screenshotUrls.length > 0)
  );
};

export const hasLocalArtwork = (metadata: GameMetadata): boolean => {
  return Boolean(
    metadata.localCoverPath ??
    metadata.localLogoPath ??
    metadata.localMarqueePath ??
    metadata.localTilePath ??
    metadata.localBackgroundPath ??
    (metadata.localScreenshotPaths && metadata.localScreenshotPaths.length > 0)
  );
};
