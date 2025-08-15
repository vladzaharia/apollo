import { Ok, Err, type Result } from '../../utils/result.js';
import type { Logger } from '../../utils/logger.js';
import type { LocalApp, ServerApp, LocalConfig, ApiPayload } from '../../models/apollo-app.js';
import type { IApolloClient } from '../apollo/apollo-client.js';
import type { IFileService } from '../file/file.service.js';
import type { ICacheService } from '../cache/cache.service.js';
import { DiffOperation, type IDiffService, type SyncPlan, type ConflictResolution, type AppDiff } from './diff.service.js';

/**
 * Two-way sync options
 */
export interface TwoWaySyncOptions {
  dryRun: boolean;
  verbose: boolean;
  conflictResolution: ConflictResolution;
  configPath: string;
}

/**
 * Two-way sync result
 */
export interface TwoWaySyncResult {
  localChanges: number;
  serverChanges: number;
  conflicts: number;
  errors: string[];
  plan: SyncPlan;
}

/**
 * Two-way sync service interface
 */
export interface ITwoWaySyncService {
  syncApps(options: TwoWaySyncOptions): Promise<Result<TwoWaySyncResult, Error>>;
}

/**
 * Two-way sync service implementation
 */
export class TwoWaySyncService implements ITwoWaySyncService {
  constructor(
    private apolloClient: IApolloClient,
    private fileService: IFileService,
    private cacheService: ICacheService,
    private diffService: IDiffService,
    private logger: Logger
  ) {}

  /**
   * Perform two-way synchronization
   */
  async syncApps(options: TwoWaySyncOptions): Promise<Result<TwoWaySyncResult, Error>> {
    this.logger.info('Starting two-way sync...');

    try {
      // 1. Load local apps.json
      const localConfigResult = await this.fileService.loadLocalConfig(options.configPath);
      if (!localConfigResult.success) {
        return Err(new Error(`Failed to load local config: ${localConfigResult.error.message}`));
      }
      const localConfig = localConfigResult.data;
      this.logger.info(`Loaded ${localConfig.apps.length} apps from ${options.configPath}`);

      // 2. Test connection and fetch server apps
      if (!options.dryRun) {
        const connectionResult = await this.apolloClient.testConnection();
        if (!connectionResult.success) {
          return Err(new Error(`Connection test failed: ${connectionResult.error.message}`));
        }
      }

      const serverAppsResult = await this.apolloClient.fetchApps();
      if (!serverAppsResult.success) {
        return Err(new Error(`Failed to fetch server apps: ${serverAppsResult.error.message}`));
      }
      const serverApps = serverAppsResult.data;
      this.logger.info(`Fetched ${serverApps.length} apps from server`);

      // 3. Load cached server state
      const cachedStateResult = await this.cacheService.getCachedServerState();
      if (!cachedStateResult.success) {
        this.logger.warn(`Failed to load cache: ${cachedStateResult.error.message}`);
      }
      const cachedApps = cachedStateResult.success ? cachedStateResult.data?.apps ?? null : null;
      this.logger.info(`Loaded ${cachedApps?.length ?? 0} cached apps`);

      // 4. Create sync plan using 3-way diff
      const plan = this.diffService.createSyncPlan(
        localConfig.apps,
        serverApps,
        cachedApps,
        options.conflictResolution
      );

      if (options.verbose) {
        this.logSyncPlan(plan);
      }

      const result: TwoWaySyncResult = {
        localChanges: 0,
        serverChanges: 0,
        conflicts: plan.conflicts.length,
        errors: [],
        plan
      };

      // 5. Handle conflicts if any
      if (plan.conflicts.length > 0) {
        this.logger.warn(`Found ${plan.conflicts.length} conflicts that require manual resolution`);
        for (const conflict of plan.conflicts) {
          this.logger.warn(`Conflict in ${conflict.appName}: ${conflict.description}`);
          if (conflict.conflicts) {
            for (const detail of conflict.conflicts) {
              this.logger.warn(`  - ${detail}`);
            }
          }
        }
        result.conflicts = plan.conflicts.length;
      }

      // 6. Apply server operations (update server with local changes)
      if (plan.serverOperations.length > 0) {
        const serverResult = await this.applyServerOperations(plan.serverOperations, serverApps, options);
        if (!serverResult.success) {
          result.errors.push(`Server operations failed: ${serverResult.error.message}`);
        } else {
          result.serverChanges = serverResult.data;
        }
      }

      // 7. Apply local operations (update local apps.json with server changes)
      if (plan.localOperations.length > 0) {
        const localResult = await this.applyLocalOperations(plan.localOperations, localConfig, options);
        if (!localResult.success) {
          result.errors.push(`Local operations failed: ${localResult.error.message}`);
        } else {
          result.localChanges = localResult.data;
        }
      }

      // 8. Update cache with new server state (only if no errors and not dry run)
      if (result.errors.length === 0 && !options.dryRun) {
        const cacheResult = await this.cacheService.setCachedServerState(serverApps);
        if (!cacheResult.success) {
          this.logger.warn(`Failed to update cache: ${cacheResult.error.message}`);
        }
      }

      this.logger.info(`Two-way sync completed: ${result.localChanges} local changes, ${result.serverChanges} server changes, ${result.conflicts} conflicts`);
      return Ok(result);

    } catch (error) {
      return Err(new Error(`Unexpected error during sync: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Apply operations to the server
   */
  private async applyServerOperations(
    operations: AppDiff[],
    serverApps: ServerApp[],
    options: TwoWaySyncOptions
  ): Promise<Result<number, Error>> {
    let changesApplied = 0;

    for (const op of operations) {
      try {
        if (op.operation === DiffOperation.CREATE && op.localApp) {
          this.logger.info(`Creating new app on server: ${op.localApp.name}`);
          if (options.verbose) {
            this.logger.debug(`New app details: ${JSON.stringify(op.localApp, null, 2)}`);
          }

          if (!options.dryRun) {
            const createResult = await this.createAppOnServer(op.localApp);
            if (createResult.success) {
              changesApplied++;
              this.logger.info(`✓ Created app on server: ${op.localApp.name}`);
            } else {
              this.logger.error(`✗ Failed to create app on server: ${createResult.error.message}`);
            }
          } else {
            changesApplied++;
            this.logger.info(`[DRY RUN] Would create app on server: ${op.localApp.name}`);
          }
        } else if (op.operation === DiffOperation.UPDATE && op.localApp && op.serverApp) {
          this.logger.info(`Updating app on server: ${op.localApp.name}`);
          if (options.verbose) {
            this.logger.debug(`Update details: ${op.description}`);
          }

          if (!options.dryRun) {
            const updateResult = await this.updateAppOnServer(op.localApp, op.serverApp, serverApps);
            if (updateResult.success) {
              changesApplied++;
              this.logger.info(`✓ Updated app on server: ${op.localApp.name}`);
            } else {
              this.logger.error(`✗ Failed to update app on server: ${updateResult.error.message}`);
            }
          } else {
            changesApplied++;
            this.logger.info(`[DRY RUN] Would update app on server: ${op.localApp.name}`);
          }
        } else if (op.operation === DiffOperation.DELETE && op.serverApp) {
          this.logger.info(`Deleting app from server: ${op.serverApp.name}`);
          
          if (!options.dryRun) {
            // Note: Apollo API might not support deletion, this would need to be implemented
            this.logger.warn(`App deletion not implemented for server: ${op.serverApp.name}`);
          } else {
            this.logger.info(`[DRY RUN] Would delete app from server: ${op.serverApp.name}`);
          }
        }
      } catch (error) {
        this.logger.error(`Error applying server operation for ${op.appName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return Ok(changesApplied);
  }

  /**
   * Apply operations to local apps.json
   */
  private async applyLocalOperations(
    operations: AppDiff[],
    localConfig: LocalConfig,
    options: TwoWaySyncOptions
  ): Promise<Result<number, Error>> {
    let changesApplied = 0;
    const updatedApps = [...localConfig.apps];

    for (const op of operations) {
      try {
        if (op.operation === DiffOperation.CREATE && op.serverApp) {
          this.logger.info(`Adding new app to local: ${op.serverApp.name}`);
          
          // Convert ServerApp to LocalApp (remove server-specific fields)
          const localApp = this.serverAppToLocalApp(op.serverApp);
          updatedApps.push(localApp);
          changesApplied++;
          
          if (options.verbose) {
            this.logger.debug(`Added app: ${JSON.stringify(localApp, null, 2)}`);
          }
        } else if (op.operation === DiffOperation.UPDATE && op.serverApp && op.localApp) {
          this.logger.info(`Updating local app: ${op.serverApp.name}`);

          const { localApp } = op; // TypeScript assertion
          const index = updatedApps.findIndex(app => app.name === localApp.name);
          if (index >= 0) {
            // Update with server changes
            const updatedApp = this.mergeServerChangesToLocal(localApp, op.serverApp);
            updatedApps[index] = updatedApp;
            changesApplied++;
            
            if (options.verbose) {
              this.logger.debug(`Updated app: ${op.description}`);
            }
          }
        } else if (op.operation === DiffOperation.DELETE && op.localApp) {
          this.logger.info(`Removing app from local: ${op.localApp.name}`);

          const { localApp } = op; // TypeScript assertion
          const index = updatedApps.findIndex(app => app.name === localApp.name);
          if (index >= 0) {
            updatedApps.splice(index, 1);
            changesApplied++;
          }
        }
      } catch (error) {
        this.logger.error(`Error applying local operation for ${op.appName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Save updated local config if changes were made
    if (changesApplied > 0 && !options.dryRun) {
      const updatedConfig: LocalConfig = { apps: updatedApps };
      const saveResult = await this.fileService.saveJsonFile(options.configPath, updatedConfig);
      if (!saveResult.success) {
        return Err(new Error(`Failed to save updated local config: ${saveResult.error.message}`));
      }
      this.logger.info(`✓ Saved updated local config with ${changesApplied} changes`);
    } else if (changesApplied > 0) {
      this.logger.info(`[DRY RUN] Would save ${changesApplied} changes to local config`);
    }

    return Ok(changesApplied);
  }

  /**
   * Convert ServerApp to LocalApp by removing server-specific fields
   */
  private serverAppToLocalApp(serverApp: ServerApp): LocalApp {
    // Remove server-specific fields and keep only local app fields
    const localFields = { ...serverApp } as Record<string, unknown>;

    // Delete server-specific properties
    delete localFields.uuid;
    delete localFields['image-path'];
    delete localFields['allow-client-commands'];
    delete localFields['per-client-app-identity'];
    delete localFields['scale-factor'];
    delete localFields['state-cmd'];
    delete localFields['terminate-on-pause'];
    delete localFields['use-app-identity'];
    delete localFields['virtual-display'];
    delete localFields.gamepad;
    delete localFields['exclude-global-state-cmd'];

    return localFields as LocalApp;
  }

  /**
   * Merge server changes into local app
   */
  private mergeServerChangesToLocal(localApp: LocalApp, serverApp: ServerApp): LocalApp {
    // Start with local app and update with server changes for sync fields
    const syncFields = ['cmd', 'detached', 'elevated', 'auto-detach', 'wait-all', 'exit-timeout', 'exclude-global-prep-cmd', 'output', 'prep-cmd'];
    const merged = { ...localApp };

    for (const field of syncFields) {
      if (field in serverApp) {
        (merged as Record<string, unknown>)[field] = (serverApp as Record<string, unknown>)[field];
      }
    }

    return merged;
  }

  /**
   * Create a new app on the server
   */
  private async createAppOnServer(localApp: LocalApp): Promise<Result<void, Error>> {
    // Create a new app payload with a temporary UUID and index
    const payload: ApiPayload = {
      ...localApp,
      uuid: '', // Server will assign UUID
      index: -1, // Server will assign index
    };

    const result = await this.apolloClient.updateApp(payload);
    return result.success ? Ok(undefined) : Err(result.error);
  }

  /**
   * Update an existing app on the server
   */
  private async updateAppOnServer(localApp: LocalApp, serverApp: ServerApp, serverApps: ServerApp[]): Promise<Result<void, Error>> {
    // Find the server app index
    const index = serverApps.findIndex(app => app.name === serverApp.name);
    if (index === -1) {
      return Err(new Error(`Server app not found: ${serverApp.name}`));
    }

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

  /**
   * Log the sync plan for verbose output
   */
  private logSyncPlan(plan: SyncPlan): void {
    this.logger.info('=== Sync Plan ===');
    
    if (plan.localOperations.length > 0) {
      this.logger.info('Local operations:');
      for (const op of plan.localOperations) {
        this.logger.info(`  ${op.operation}: ${op.appName} - ${op.description}`);
      }
    }

    if (plan.serverOperations.length > 0) {
      this.logger.info('Server operations:');
      for (const op of plan.serverOperations) {
        this.logger.info(`  ${op.operation}: ${op.appName} - ${op.description}`);
      }
    }

    if (plan.conflicts.length > 0) {
      this.logger.info('Conflicts:');
      for (const conflict of plan.conflicts) {
        this.logger.info(`  CONFLICT: ${conflict.appName} - ${conflict.description}`);
      }
    }

    this.logger.info(`Summary: ${plan.summary.localChanges} local, ${plan.summary.serverChanges} server, ${plan.summary.conflicts} conflicts`);
    this.logger.info('================');
  }
}
