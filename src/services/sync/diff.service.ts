import type { LocalApp, ServerApp } from '../../models/apollo-app.js';
import type { Logger } from '../../utils/logger.js';

/**
 * Diff operation types
 */
export enum DiffOperation {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CONFLICT = 'CONFLICT',
  NO_CHANGE = 'NO_CHANGE'
}

/**
 * Conflict resolution strategies
 */
export enum ConflictResolution {
  LOCAL_WINS = 'LOCAL_WINS',
  SERVER_WINS = 'SERVER_WINS',
  MANUAL = 'MANUAL'
}

/**
 * Diff result for a single app
 */
export interface AppDiff {
  appName: string;
  operation: DiffOperation;
  localApp?: LocalApp;
  serverApp?: ServerApp;
  cachedApp?: ServerApp;
  conflicts?: string[];
  description: string;
}

/**
 * Sync plan containing all operations to perform
 */
export interface SyncPlan {
  localOperations: AppDiff[];  // Operations to apply to local apps.json
  serverOperations: AppDiff[]; // Operations to apply to server
  conflicts: AppDiff[];        // Conflicts requiring resolution
  summary: {
    localChanges: number;
    serverChanges: number;
    conflicts: number;
  };
}

/**
 * 3-way diff service interface
 */
export interface IDiffService {
  createSyncPlan(
    localApps: LocalApp[],
    serverApps: ServerApp[],
    cachedApps: ServerApp[] | null,
    conflictResolution: ConflictResolution
  ): SyncPlan;
}

/**
 * 3-way diff service implementation
 */
export class DiffService implements IDiffService {
  constructor(private logger: Logger) {}

  /**
   * Create a sync plan by comparing three versions
   */
  createSyncPlan(
    localApps: LocalApp[],
    serverApps: ServerApp[],
    cachedApps: ServerApp[] | null,
    conflictResolution: ConflictResolution
  ): SyncPlan {
    this.logger.debug('Creating sync plan with 3-way diff');
    this.logger.debug(`Local apps: ${localApps.length}, Server apps: ${serverApps.length}, Cached apps: ${cachedApps?.length ?? 0}`);

    const plan: SyncPlan = {
      localOperations: [],
      serverOperations: [],
      conflicts: [],
      summary: {
        localChanges: 0,
        serverChanges: 0,
        conflicts: 0
      }
    };

    // Create maps for efficient lookup
    const localMap = new Map(localApps.map(app => [app.name, app]));
    const serverMap = new Map(serverApps.map(app => [app.name, app]));
    const cachedMap = new Map(cachedApps?.map(app => [app.name, app]) ?? []);

    // Get all unique app names
    const allAppNames = new Set([
      ...localMap.keys(),
      ...serverMap.keys(),
      ...cachedMap.keys()
    ]);

    for (const appName of allAppNames) {
      const localApp = localMap.get(appName);
      const serverApp = serverMap.get(appName);
      const cachedApp = cachedMap.get(appName);

      const diff = this.analyzeAppChanges(appName, localApp, serverApp, cachedApp);
      
      if (diff.operation === DiffOperation.CONFLICT) {
        if (conflictResolution === ConflictResolution.MANUAL) {
          plan.conflicts.push(diff);
          plan.summary.conflicts++;
        } else {
          // Auto-resolve conflict
          const resolved = this.resolveConflict(diff, conflictResolution);
          this.addResolvedOperations(resolved, plan);
        }
      } else {
        this.addOperationToPlan(diff, plan);
      }
    }

    this.logger.debug(`Sync plan created: ${plan.summary.localChanges} local changes, ${plan.summary.serverChanges} server changes, ${plan.summary.conflicts} conflicts`);
    return plan;
  }

  /**
   * Analyze changes for a single app across three versions
   */
  private analyzeAppChanges(
    appName: string,
    localApp?: LocalApp,
    serverApp?: ServerApp,
    cachedApp?: ServerApp
  ): AppDiff {
    const hasLocal = !!localApp;
    const hasServer = !!serverApp;
    const hasCached = !!cachedApp;

    // Determine what changed since last sync
    const localChanged = this.hasAppChanged(localApp, cachedApp);
    const serverChanged = this.hasAppChanged(serverApp, cachedApp);

    // Decision matrix for 3-way diff
    if (!hasLocal && !hasServer && hasCached) {
      // App was deleted from both sides
      return {
        appName,
        operation: DiffOperation.NO_CHANGE,
        cachedApp,
        description: 'App deleted from both local and server'
      };
    }

    if (!hasLocal && hasServer && !hasCached) {
      // New app on server only
      return {
        appName,
        operation: DiffOperation.CREATE,
        serverApp,
        description: 'New app on server, add to local'
      };
    }

    if (hasLocal && !hasServer && !hasCached) {
      // New app on local only
      return {
        appName,
        operation: DiffOperation.CREATE,
        localApp,
        description: 'New app locally, add to server'
      };
    }

    if (!hasLocal && hasServer && hasCached) {
      // App deleted locally
      return {
        appName,
        operation: DiffOperation.DELETE,
        serverApp,
        cachedApp,
        description: 'App deleted locally, remove from server'
      };
    }

    if (hasLocal && !hasServer && hasCached) {
      // App deleted on server
      return {
        appName,
        operation: DiffOperation.DELETE,
        localApp,
        cachedApp,
        description: 'App deleted on server, remove from local'
      };
    }

    if (hasLocal && hasServer) {
      if (!localChanged && !serverChanged) {
        // No changes
        return {
          appName,
          operation: DiffOperation.NO_CHANGE,
          localApp,
          serverApp,
          cachedApp,
          description: 'No changes detected'
        };
      }

      if (localChanged && !serverChanged) {
        // Only local changed
        return {
          appName,
          operation: DiffOperation.UPDATE,
          localApp,
          serverApp,
          cachedApp,
          description: 'Local changes, update server'
        };
      }

      if (!localChanged && serverChanged) {
        // Only server changed
        return {
          appName,
          operation: DiffOperation.UPDATE,
          localApp,
          serverApp,
          cachedApp,
          description: 'Server changes, update local'
        };
      }

      if (localChanged && serverChanged) {
        // Both changed - conflict
        const conflicts = this.findConflicts(localApp, serverApp, cachedApp);
        return {
          appName,
          operation: DiffOperation.CONFLICT,
          localApp,
          serverApp,
          cachedApp,
          conflicts,
          description: 'Both local and server changed, conflict detected'
        };
      }
    }

    // Fallback
    return {
      appName,
      operation: DiffOperation.NO_CHANGE,
      localApp,
      serverApp,
      cachedApp,
      description: 'Unknown state, no action taken'
    };
  }

  /**
   * Check if an app has changed compared to cached version
   */
  private hasAppChanged(current?: LocalApp | ServerApp, cached?: ServerApp): boolean {
    if (!current && !cached) {return false;}
    if (!current || !cached) {return true;}

    // Compare sync fields only
    const syncFields = ['cmd', 'detached', 'elevated', 'auto-detach', 'wait-all', 'exit-timeout', 'exclude-global-prep-cmd', 'output', 'prep-cmd'];
    
    for (const field of syncFields) {
      const currentValue = (current as Record<string, unknown>)[field];
      const cachedValue = (cached as Record<string, unknown>)[field];
      
      if (!this.deepEqual(currentValue, cachedValue)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find specific conflicts between local and server versions
   */
  private findConflicts(localApp: LocalApp, serverApp: ServerApp, cachedApp?: ServerApp): string[] {
    const conflicts: string[] = [];
    const syncFields = ['cmd', 'detached', 'elevated', 'auto-detach', 'wait-all', 'exit-timeout', 'exclude-global-prep-cmd', 'output', 'prep-cmd'];

    for (const field of syncFields) {
      const localValue = (localApp as Record<string, unknown>)[field];
      const serverValue = (serverApp as Record<string, unknown>)[field];
      const cachedValue = cachedApp ? (cachedApp as Record<string, unknown>)[field] : undefined;

      // Check if both local and server changed this field differently
      const localChanged = !this.deepEqual(localValue, cachedValue);
      const serverChanged = !this.deepEqual(serverValue, cachedValue);
      const valuesDiffer = !this.deepEqual(localValue, serverValue);

      if (localChanged && serverChanged && valuesDiffer) {
        conflicts.push(`${field}: local="${JSON.stringify(localValue)}" vs server="${JSON.stringify(serverValue)}"`);
      }
    }

    return conflicts;
  }

  /**
   * Resolve a conflict based on the resolution strategy
   */
  private resolveConflict(diff: AppDiff, resolution: ConflictResolution): AppDiff[] {
    const resolved: AppDiff[] = [];

    if (resolution === ConflictResolution.LOCAL_WINS && diff.localApp) {
      resolved.push({
        ...diff,
        operation: DiffOperation.UPDATE,
        description: `Conflict resolved: local wins, updating server`
      });
    } else if (resolution === ConflictResolution.SERVER_WINS && diff.serverApp) {
      resolved.push({
        ...diff,
        operation: DiffOperation.UPDATE,
        description: `Conflict resolved: server wins, updating local`
      });
    }

    return resolved;
  }

  /**
   * Add resolved operations to the plan
   */
  private addResolvedOperations(operations: AppDiff[], plan: SyncPlan): void {
    for (const op of operations) {
      this.addOperationToPlan(op, plan);
    }
  }

  /**
   * Add an operation to the appropriate plan section
   */
  private addOperationToPlan(diff: AppDiff, plan: SyncPlan): void {
    if (diff.operation === DiffOperation.NO_CHANGE) {
      return;
    }

    // Determine which direction the operation goes
    if (this.isLocalOperation(diff)) {
      plan.localOperations.push(diff);
      plan.summary.localChanges++;
    }

    if (this.isServerOperation(diff)) {
      plan.serverOperations.push(diff);
      plan.summary.serverChanges++;
    }
  }

  /**
   * Determine if this operation affects local apps.json
   */
  private isLocalOperation(diff: AppDiff): boolean {
    return (diff.operation === DiffOperation.CREATE && !!diff.serverApp && !diff.localApp) ||
           (diff.operation === DiffOperation.UPDATE && !!diff.serverApp && !!diff.localApp && this.hasAppChanged(diff.serverApp, diff.cachedApp)) ||
           (diff.operation === DiffOperation.DELETE && !diff.serverApp && !!diff.localApp);
  }

  /**
   * Determine if this operation affects the server
   */
  private isServerOperation(diff: AppDiff): boolean {
    return (diff.operation === DiffOperation.CREATE && !!diff.localApp && !diff.serverApp) ||
           (diff.operation === DiffOperation.UPDATE && !!diff.localApp && !!diff.serverApp && this.hasAppChanged(diff.localApp, diff.cachedApp)) ||
           (diff.operation === DiffOperation.DELETE && !diff.localApp && !!diff.serverApp);
  }

  /**
   * Deep equality check for values
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) {return true;}
    if (a === null || b === null) {return a === b;}
    if (typeof a !== typeof b) {return false;}
    
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {return false;}
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) {return false;}
      }
      return true;
    }
    
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      const objA = a as Record<string, unknown>;
      const objB = b as Record<string, unknown>;
      const keysA = Object.keys(objA);
      const keysB = Object.keys(objB);
      if (keysA.length !== keysB.length) {return false;}
      for (const key of keysA) {
        if (!keysB.includes(key) || !this.deepEqual(objA[key], objB[key])) {return false;}
      }
      return true;
    }
    
    return false;
  }
}
