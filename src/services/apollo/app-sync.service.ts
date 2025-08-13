import { Result, Ok, Err } from '../../utils/result.js';
import type { Logger } from '../../utils/logger.js';
import type { IApolloClient } from './apollo-client.js';
import type { 
  LocalApp, 
  ServerApp, 
  ApiPayload, 
  LocalConfig 
} from '../../models/apollo-app.js';
import {
  normalizeAppName
} from '../../models/apollo-app.js';

/**
 * App sync options
 */
export interface AppSyncOptions {
  dryRun: boolean;
  verbose: boolean;
}

/**
 * App sync result
 */
export interface AppSyncResult {
  updated: number;
  unchanged: number;
  created: number;
  errors: string[];
}

/**
 * App sync service interface
 */
export interface IAppSyncService {
  syncApps(localConfig: LocalConfig, options: AppSyncOptions): Promise<Result<AppSyncResult, Error>>;
}

/**
 * App sync service implementation
 */
export class AppSyncService implements IAppSyncService {
  constructor(
    private apolloClient: IApolloClient,
    private logger: Logger
  ) {}

  /**
   * Sync local apps with server
   */
  async syncApps(
    localConfig: LocalConfig, 
    options: AppSyncOptions
  ): Promise<Result<AppSyncResult, Error>> {
    this.logger.info('Starting app sync...');

    // Test connection first
    if (!options.dryRun) {
      const connectionResult = await this.apolloClient.testConnection();
      if (!connectionResult.success) {
        return Err(new Error(`Connection test failed: ${connectionResult.error.message}`));
      }
    }

    // Fetch server apps
    const serverAppsResult = await this.apolloClient.fetchApps();
    if (!serverAppsResult.success) {
      return Err(new Error(`Failed to fetch server apps: ${serverAppsResult.error.message}`));
    }

    const serverApps = serverAppsResult.data;
    const result: AppSyncResult = {
      updated: 0,
      unchanged: 0,
      created: 0,
      errors: [],
    };

    this.logger.info(`Processing ${localConfig.apps.length} local apps against ${serverApps.length} server apps`);

    // Process each local app
    for (const localApp of localConfig.apps) {
      try {
        const matchResult = this.findMatchingApp(localApp, serverApps);
        
        if (!matchResult) {
          // New app
          this.logger.info(`Creating new app: ${localApp.name}`);
          if (options.verbose) {
            this.logger.debug(`New app details: ${JSON.stringify(localApp, null, 2)}`);
          }

          if (!options.dryRun) {
            const createResult = await this.createNewApp(localApp);
            if (createResult.success) {
              result.created++;
              this.logger.info(`✓ Created new app: ${localApp.name}`);
            } else {
              result.errors.push(`Failed to create ${localApp.name}: ${createResult.error.message}`);
              this.logger.error(`✗ Failed to create ${localApp.name}: ${createResult.error.message}`);
            }
          } else {
            result.created++;
            this.logger.info(`[DRY RUN] Would create new app: ${localApp.name}`);
          }
        } else {
          // Existing app
          const { app: serverApp, index: serverIndex } = matchResult;
          const differences = this.compareApps(localApp, serverApp);

          if (differences.length === 0) {
            result.unchanged++;
            if (options.verbose) {
              this.logger.debug(`No changes needed for: ${localApp.name}`);
            }
          } else {
            this.logger.info(`Updating app: ${localApp.name}`);
            if (options.verbose) {
              this.logger.debug(`Changes for ${localApp.name}:`);
              differences.forEach(diff => this.logger.debug(`  • ${diff}`));
            }

            if (!options.dryRun) {
              const updateResult = await this.updateExistingApp(localApp, serverApp, serverIndex);
              if (updateResult.success) {
                result.updated++;
                this.logger.info(`✓ Updated app: ${localApp.name}`);
              } else {
                result.errors.push(`Failed to update ${localApp.name}: ${updateResult.error.message}`);
                this.logger.error(`✗ Failed to update ${localApp.name}: ${updateResult.error.message}`);
              }
            } else {
              result.updated++;
              this.logger.info(`[DRY RUN] Would update app: ${localApp.name}`);
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Error processing ${localApp.name}: ${errorMessage}`);
        this.logger.error(`Error processing ${localApp.name}: ${errorMessage}`);
      }
    }

    this.logger.info('App sync completed', {
      updated: result.updated,
      unchanged: result.unchanged,
      created: result.created,
      errors: result.errors.length,
    });

    return Ok(result);
  }

  /**
   * Find matching server app for local app
   */
  private findMatchingApp(
    localApp: LocalApp, 
    serverApps: ServerApp[]
  ): { app: ServerApp; index: number } | null {
    const localName = normalizeAppName(localApp.name);
    
    let bestMatch: ServerApp | null = null;
    let bestScore = 0;
    let bestIndex = -1;

    serverApps.forEach((serverApp, index) => {
      const serverName = normalizeAppName(serverApp.name);
      const score = this.calculateSimilarity(localName, serverName);
      
      if (score > bestScore && score > 0.8) { // 80% similarity threshold
        bestMatch = serverApp;
        bestScore = score;
        bestIndex = index;
      }
    });

    return bestMatch ? { app: bestMatch, index: bestIndex } : null;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = Array.from({ length: str2.length + 1 }, () => Array.from({ length: str1.length + 1 }, () => 0));

    for (let i = 0; i <= str1.length; i++) matrix[0]![i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j]![0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j]![i] = Math.min(
          matrix[j]![i - 1]! + 1,     // deletion
          matrix[j - 1]![i]! + 1,     // insertion
          matrix[j - 1]![i - 1]! + indicator // substitution
        );
      }
    }

    return matrix[str2.length]![str1.length]!;
  }

  /**
   * Compare local and server apps to find differences
   */
  private compareApps(localApp: LocalApp, serverApp: ServerApp): string[] {
    const differences: string[] = [];
    
    // Fields to compare (only the ones we want to sync)
    const syncFields: (keyof LocalApp)[] = [
      'cmd', 'detached', 'elevated', 'auto-detach', 'wait-all',
      'exit-timeout', 'exclude-global-prep-cmd', 'output', 'prep-cmd'
    ];

    for (const field of syncFields) {
      const localValue = localApp[field];
      const serverValue = serverApp[field];

      // Handle empty strings and undefined as equivalent
      if (!localValue && !serverValue) continue;

      if (!this.deepEqual(localValue, serverValue)) {
        differences.push(`${field}: ${JSON.stringify(serverValue)} -> ${JSON.stringify(localValue)}`);
      }
    }

    return differences;
  }

  /**
   * Deep equality check for objects and arrays
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a).sort();
      const keysB = Object.keys(b).sort();

      if (keysA.length !== keysB.length) return false;
      if (!this.deepEqual(keysA, keysB)) return false;

      for (const key of keysA) {
        if (!this.deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
          return false;
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Create a new app on the server
   */
  private async createNewApp(localApp: LocalApp): Promise<Result<void, Error>> {
    const payload: ApiPayload = {
      name: localApp.name,
      output: localApp.output ?? '',
      cmd: localApp.cmd ?? '',
      detached: localApp.detached ?? [],
      'exclude-global-prep-cmd': localApp['exclude-global-prep-cmd'] ?? false,
      elevated: localApp.elevated ?? false,
      'auto-detach': localApp['auto-detach'] ?? false,
      'wait-all': localApp['wait-all'] ?? false,
      'exit-timeout': localApp['exit-timeout'] ?? 5,
      'prep-cmd': localApp['prep-cmd'] ?? [],
      index: -1, // -1 indicates new app
      uuid: '', // Empty UUID for new apps - server will generate
      'image-path': '', // Default empty image path for new apps
    };

    const result = await this.apolloClient.updateApp(payload);
    return result.success ? Ok(undefined) : Err(result.error);
  }

  /**
   * Update an existing app on the server
   */
  private async updateExistingApp(
    localApp: LocalApp, 
    serverApp: ServerApp, 
    index: number
  ): Promise<Result<void, Error>> {
    // Start with server app to preserve all server-specific fields
    const payload: ApiPayload = { ...serverApp, index };

    // Update with local app values for sync fields
    const syncFields: (keyof LocalApp)[] = [
      'name', 'cmd', 'detached', 'elevated', 'auto-detach', 'wait-all',
      'exit-timeout', 'exclude-global-prep-cmd', 'output', 'prep-cmd'
    ];

    for (const field of syncFields) {
      const localValue = localApp[field];

      if (localValue !== undefined) {
        (payload as Record<string, unknown>)[field] = localValue;
      } else {
        // Clear the field on server by setting appropriate empty value
        if (field === 'detached' || field === 'prep-cmd') {
          (payload as Record<string, unknown>)[field] = [];
        } else if (typeof serverApp[field] === 'boolean') {
          (payload as Record<string, unknown>)[field] = false;
        } else if (typeof serverApp[field] === 'number') {
          (payload as Record<string, unknown>)[field] = 0;
        } else {
          (payload as Record<string, unknown>)[field] = '';
        }
      }
    }

    const result = await this.apolloClient.updateApp(payload);
    return result.success ? Ok(undefined) : Err(result.error);
  }
}
