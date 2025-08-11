#!/usr/bin/env node

/**
 * Apollo/Sunshine App Sync Tool
 * 
 * This script compares the local apps.json configuration with the server configuration
 * retrieved via the Sunshine API and syncs any differences.
 */

import { Command } from 'commander';
import axios, { AxiosResponse } from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface PrepCmd {
  do: string;
  undo: string;
  elevated: boolean;
}

interface LocalApp {
  name: string;
  output?: string;
  cmd?: string;
  detached?: string[];
  'exclude-global-prep-cmd'?: boolean;
  elevated?: boolean;
  'auto-detach'?: boolean;
  'wait-all'?: boolean;
  'exit-timeout'?: number;
  'prep-cmd'?: PrepCmd[];
}

interface ServerApp extends LocalApp {
  uuid: string;
  'image-path'?: string;
  'allow-client-commands'?: boolean;
  'per-client-app-identity'?: boolean;
  'scale-factor'?: number;
  'state-cmd'?: PrepCmd[];
  'terminate-on-pause'?: boolean;
  'use-app-identity'?: boolean;
  'virtual-display'?: boolean;
  gamepad?: string;
  'exclude-global-state-cmd'?: boolean;
}

interface ApiPayload extends ServerApp {
  index: number;
}

interface Config {
  endpoint: string;
  username: string;
  password: string;
}

class AppSyncTool {
  private config: Config;
  private localApps: LocalApp[] = [];
  private serverApps: ServerApp[] = [];
  private httpsAgent: https.Agent;
  private sessionCookie: string = '';

  constructor() {
    this.config = this.loadConfig();
    // Create HTTPS agent that ignores self-signed certificate errors
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
  }

  private loadConfig(): Config {
    const endpoint = process.env.APOLLO_ENDPOINT;
    const username = process.env.APOLLO_USERNAME;
    const password = process.env.APOLLO_PASSWORD;

    if (!endpoint || !username || !password) {
      console.error(chalk.red('Error: Missing required environment variables in .env file'));
      console.error(chalk.red('Required: APOLLO_ENDPOINT, APOLLO_USERNAME, APOLLO_PASSWORD'));
      process.exit(1);
    }

    return {
      endpoint: endpoint.replace(/\/$/, ''), // Remove trailing slash
      username,
      password
    };
  }

  private loadJsonFile<T>(filepath: string): T {
    try {
      const fullPath = path.resolve(filepath);
      const content = fs.readFileSync(fullPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error loading ${filepath}: ${error.message}`));
      }
      process.exit(1);
    }
  }

  private normalizeAppName(name: string): string {
    return name.toLowerCase().trim().replace(/[:'"-]/g, '').replace(/\s+/g, ' ');
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private findMatchingApp(localApp: LocalApp): { app: ServerApp; index: number } | null {
    const localName = this.normalizeAppName(localApp.name);
    
    let bestMatch: ServerApp | null = null;
    let bestScore = 0;
    let bestIndex = -1;

    this.serverApps.forEach((serverApp, index) => {
      const serverName = this.normalizeAppName(serverApp.name);
      const score = this.calculateSimilarity(localName, serverName);
      
      if (score > bestScore && score > 0.8) { // 80% similarity threshold
        bestMatch = serverApp;
        bestScore = score;
        bestIndex = index;
      }
    });

    return bestMatch ? { app: bestMatch, index: bestIndex } : null;
  }

  private deepEqual(a: any, b: any): boolean {
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
        if (!this.deepEqual(a[key], b[key])) return false;
      }
      return true;
    }

    return false;
  }

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

  private createApiPayload(localApp: LocalApp, serverApp: ServerApp, index: number): ApiPayload {
    // Start with server app to preserve all server-specific fields
    const payload: ApiPayload = { ...serverApp, index };

    // Update with local app values for sync fields
    const syncFields: (keyof LocalApp)[] = [
      'name', 'cmd', 'detached', 'elevated', 'auto-detach', 'wait-all',
      'exit-timeout', 'exclude-global-prep-cmd', 'output', 'prep-cmd'
    ];

    for (const field of syncFields) {
      // Always sync the field value, including undefined/empty to clear server values
      const localValue = localApp[field];

      if (localValue !== undefined) {
        (payload as any)[field] = localValue;
      } else {
        // Clear the field on server by setting appropriate empty value
        if (field === 'detached' || field === 'prep-cmd') {
          (payload as any)[field] = [];
        } else if (typeof serverApp[field] === 'boolean') {
          (payload as any)[field] = false;
        } else if (typeof serverApp[field] === 'number') {
          (payload as any)[field] = 0;
        } else {
          (payload as any)[field] = '';
        }
      }
    }

    return payload;
  }

  private createNewAppPayload(localApp: LocalApp): ApiPayload {
    // Create a new app payload with index -1 and default server fields
    const payload: ApiPayload = {
      name: localApp.name,
      output: localApp.output || '',
      cmd: localApp.cmd || '',
      detached: localApp.detached || [],
      'exclude-global-prep-cmd': localApp['exclude-global-prep-cmd'] || false,
      elevated: localApp.elevated || false,
      'auto-detach': localApp['auto-detach'] || false,
      'wait-all': localApp['wait-all'] || false,
      'exit-timeout': localApp['exit-timeout'] || 5,
      'prep-cmd': localApp['prep-cmd'] || [],
      index: -1, // -1 indicates new app
      uuid: '', // Empty UUID for new apps - server will generate
      'image-path': '' // Default empty image path for new apps
    };

    return payload;
  }

  private async login(): Promise<boolean> {
    try {
      console.log(chalk.blue('Logging into Apollo...'));

      const response = await axios.post(
        `${this.config.endpoint}/api/login`,
        {
          username: this.config.username,
          password: this.config.password
        },
        {
          httpsAgent: this.httpsAgent,
          timeout: 10000,
          validateStatus: (status) => status < 500
        }
      );

      if (response.status === 200) {
        // Extract session cookie from Set-Cookie header
        const setCookieHeader = response.headers['set-cookie'];
        if (setCookieHeader && setCookieHeader.length > 0) {
          // Parse the auth cookie (usually the first one)
          const authCookie = setCookieHeader[0].split(';')[0];
          this.sessionCookie = authCookie;
          console.log(chalk.green('✓ Successfully logged into Apollo'));
          return true;
        } else {
          console.log(chalk.red('✗ Login successful but no session cookie received'));
          return false;
        }
      } else if (response.status === 401) {
        console.log(chalk.red('✗ Login failed: Invalid username or password'));
        return false;
      } else {
        console.log(chalk.red(`✗ Login failed: ${response.status} - ${response.statusText}`));
        return false;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          console.log(chalk.red(`✗ Connection refused: Is Apollo running on ${this.config.endpoint}?`));
        } else if (error.code === 'ETIMEDOUT') {
          console.log(chalk.red(`✗ Connection timed out: Check your network connection`));
        } else if (error.response?.status === 401) {
          console.log(chalk.red(`✗ Login failed: Invalid credentials`));
        } else if (error.response) {
          console.log(chalk.red(`✗ Login error: ${error.response.status} - ${error.response.statusText}`));
        } else {
          console.log(chalk.red(`✗ Login failed: ${error.message}`));
        }
      } else {
        console.log(chalk.red(`✗ Unexpected login error: ${error}`));
      }
      return false;
    }
  }

  private async fetchServerApps(): Promise<ServerApp[]> {
    try {
      console.log(chalk.blue('Fetching current server apps via API...'));

      const response = await axios.get(
        `${this.config.endpoint}/api/apps`,
        {
          headers: {
            'Cookie': this.sessionCookie
          },
          httpsAgent: this.httpsAgent,
          timeout: 10000, // 10 second timeout for fetching apps
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        }
      );

      if (response.status === 200) {
        const apps = response.data.apps || [];
        console.log(chalk.green(`✓ Successfully fetched ${apps.length} apps from server`));
        return apps;
      } else if (response.status === 401) {
        console.log(chalk.red(`✗ Authentication failed while fetching apps`));
        throw new Error('Authentication failed');
      } else {
        console.log(chalk.red(`✗ Failed to fetch apps: ${response.status} - ${response.statusText}`));
        throw new Error(`API error: ${response.status}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          console.log(chalk.red(`✗ Connection refused while fetching apps`));
        } else if (error.code === 'ETIMEDOUT') {
          console.log(chalk.red(`✗ Request timed out while fetching apps`));
        } else if (error.response?.status === 401) {
          console.log(chalk.red(`✗ Authentication failed while fetching apps`));
        } else if (error.response) {
          console.log(chalk.red(`✗ API error while fetching apps: ${error.response.status} - ${error.response.statusText}`));
        } else {
          console.log(chalk.red(`✗ Failed to fetch apps: ${error.message}`));
        }
      } else {
        console.log(chalk.red(`✗ Unexpected error while fetching apps: ${error}`));
      }
      throw error;
    }
  }

  private async testConnection(): Promise<boolean> {
    // First, login to get session cookie
    const loginSuccess = await this.login();
    if (!loginSuccess) {
      return false;
    }

    try {
      console.log(chalk.blue('Testing Apollo API connection...'));

      const response = await axios.get(
        `${this.config.endpoint}/api/apps`,
        {
          headers: {
            'Cookie': this.sessionCookie
          },
          httpsAgent: this.httpsAgent,
          timeout: 5000, // 5 second timeout for connection test
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        }
      );

      if (response.status === 200) {
        console.log(chalk.green('✓ Successfully connected to Apollo API'));
        console.log(chalk.green(`Found ${response.data.apps?.length || 0} apps`));
        return true;
      } else if (response.status === 401) {
        console.log(chalk.red(`✗ Authentication failed (401 Unauthorized)`));
        console.log(chalk.yellow('Session cookie may have expired. Try again.'));
        return false;
      } else {
        console.log(chalk.red(`✗ API connection failed: ${response.status} - ${response.statusText}`));
        if (response.data) {
          console.log(chalk.red(`Response: ${JSON.stringify(response.data)}`));
        }
        return false;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          console.log(chalk.red(`✗ Connection refused: Is Apollo running on ${this.config.endpoint}?`));
        } else if (error.code === 'ETIMEDOUT') {
          console.log(chalk.red(`✗ Connection timed out: Check your network connection and endpoint URL`));
        } else if (error.response?.status === 401) {
          console.log(chalk.red(`✗ Authentication failed: Session cookie invalid or expired`));
        } else if (error.response) {
          console.log(chalk.red(`✗ API error: ${error.response.status} - ${error.response.statusText}`));
          if (error.response.data) {
            console.log(chalk.red(`Response: ${JSON.stringify(error.response.data)}`));
          }
        } else {
          console.log(chalk.red(`✗ Connection failed: ${error.message}`));
        }
      } else {
        console.log(chalk.red(`✗ Unexpected error: ${error}`));
      }
      return false;
    }
  }

  private async syncApp(payload: ApiPayload, dryRun: boolean): Promise<boolean> {
    if (dryRun) {
      console.log(chalk.yellow('  [DRY RUN] Would update app via API'));
      return true;
    }

    try {
      const response: AxiosResponse = await axios.post(
        `${this.config.endpoint}/api/apps`,
        payload,
        {
          headers: {
            'Cookie': this.sessionCookie
          },
          httpsAgent: this.httpsAgent,
          timeout: 10000 // 10 second timeout
        }
      );

      if (response.status === 200) {
        console.log(chalk.green('  ✓ Successfully updated app'));
        return true;
      } else {
        console.log(chalk.red(`  ✗ API error: ${response.status} - ${response.statusText}`));
        return false;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          console.log(chalk.red(`  ✗ Connection refused: Is Apollo running on ${this.config.endpoint}?`));
        } else if (error.code === 'ETIMEDOUT') {
          console.log(chalk.red(`  ✗ Request timed out: Check your network connection`));
        } else if (error.response?.status === 401) {
          console.log(chalk.red(`  ✗ Authentication failed: Session cookie expired`));
        } else if (error.response) {
          console.log(chalk.red(`  ✗ API error: ${error.response.status} - ${error.response.statusText}`));
        } else {
          console.log(chalk.red(`  ✗ Request failed: ${error.message}`));
        }
      } else {
        console.log(chalk.red(`  ✗ Unexpected error: ${error}`));
      }
      return false;
    }
  }

  async run(options: { dryRun: boolean; verbose: boolean }): Promise<void> {
    console.log(chalk.bold.cyan('Apollo/Sunshine App Sync Tool'));
    console.log(chalk.cyan('='.repeat(40)));

    // Test API connection first (this includes login)
    if (!options.dryRun) {
      const connectionOk = await this.testConnection();
      if (!connectionOk) {
        console.log(chalk.red('\nConnection test failed. Please check your configuration and try again.'));
        process.exit(1);
      }
      console.log();
    } else {
      // For dry run, we still need to login to test the connection
      const loginOk = await this.login();
      if (!loginOk) {
        console.log(chalk.red('\nLogin failed. Please check your credentials and try again.'));
        process.exit(1);
      }
      console.log();
    }

    // Load local configuration and fetch server apps via API
    console.log(chalk.blue('Loading local configuration...'));

    const localConfig = this.loadJsonFile<{ apps: LocalApp[] }>('apps.json');
    this.localApps = localConfig.apps || [];

    // Fetch current server apps via API
    try {
      this.serverApps = await this.fetchServerApps();
    } catch (error) {
      console.log(chalk.red('Failed to fetch server apps. Exiting.'));
      process.exit(1);
    }

    console.log(chalk.blue(`Local apps: ${this.localApps.length}, Server apps: ${this.serverApps.length}`));
    console.log();

    // Track changes
    let updatedCount = 0;
    let unchangedCount = 0;
    let newCount = 0;

    // Process each local app
    for (const localApp of this.localApps) {
      console.log(chalk.bold(`Processing: ${localApp.name}`));

      // Find matching server app
      const matchResult = this.findMatchingApp(localApp);

      if (!matchResult) {
        console.log(chalk.magenta('  → New app (not found on server)'));
        newCount++;

        // Create new app on server
        const newAppPayload = this.createNewAppPayload(localApp);
        const success = await this.syncApp(newAppPayload, options.dryRun);

        if (success) {
          console.log(chalk.green('  ✓ New app created successfully'));
        } else {
          console.log(chalk.red('  ✗ Failed to create new app'));
        }
        continue;
      }

      const { app: serverApp, index: serverIndex } = matchResult;

      // Compare configurations
      const differences = this.compareApps(localApp, serverApp);

      if (differences.length === 0) {
        unchangedCount++;
        if (options.verbose) {
          console.log(chalk.green('  → No changes needed'));
        }
      } else {
        updatedCount++;
        console.log(chalk.yellow('  → Changes detected:'));
        for (const diff of differences) {
          console.log(chalk.yellow(`    • ${diff}`));
        }

        // Create API payload and sync
        const payload = this.createApiPayload(localApp, serverApp, serverIndex);
        await this.syncApp(payload, options.dryRun);
      }

      console.log();
    }

    // Summary
    console.log(chalk.bold.cyan('Summary'));
    console.log(chalk.cyan('='.repeat(20)));
    console.log(chalk[updatedCount > 0 ? 'yellow' : 'green'](`Updated: ${updatedCount}`));
    console.log(chalk.green(`Unchanged: ${unchangedCount}`));
    console.log(chalk[newCount > 0 ? 'magenta' : 'green'](`New: ${newCount}`));

    if (options.dryRun && (updatedCount > 0 || newCount > 0)) {
      console.log();
      console.log(chalk.bold.blue('Run without --dry-run to apply changes'));
    }
  }
}

// CLI setup
const program = new Command();

program
  .name('sync-apollo-apps')
  .description('Sync Apollo/Sunshine apps configuration')
  .option('-d, --dry-run', 'Show changes without applying them')
  .option('-v, --verbose', 'Show detailed output including unchanged apps')
  .action(async (options) => {
    const tool = new AppSyncTool();
    await tool.run(options);
  });

program.parse();
