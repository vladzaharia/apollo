import axios, { type AxiosInstance } from 'axios';
import * as https from 'https';
import type { Result } from '../../utils/result.js';
import { Ok, Err, fromPromise } from '../../utils/result.js';
import { retryAsyncIf, shouldRetry } from '../../utils/retry.js';
import type { Config } from '../../utils/config.js';
import type { Logger } from '../../utils/logger.js';
import type { ServerApp, ServerAppsResponse, ApiPayload } from '../../models/apollo-app.js';

/**
 * Apollo API errors
 */
export class ApolloApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApolloApiError';
  }
}

export class ApolloAuthError extends ApolloApiError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'ApolloAuthError';
  }
}

export class ApolloConnectionError extends ApolloApiError {
  constructor(message: string, code?: string) {
    super(message, undefined, code);
    this.name = 'ApolloConnectionError';
  }
}

/**
 * Apollo client interface
 */
export interface IApolloClient {
  login(): Promise<Result<void, ApolloApiError>>;
  fetchApps(): Promise<Result<ServerApp[], ApolloApiError>>;
  updateApp(payload: ApiPayload): Promise<Result<void, ApolloApiError>>;
  testConnection(): Promise<Result<void, ApolloApiError>>;
}

/**
 * Apollo client implementation
 */
export class ApolloClient implements IApolloClient {
  private client: AxiosInstance;
  private sessionCookie = '';

  constructor(
    private config: Config,
    private logger: Logger
  ) {
    this.client = axios.create({
      baseURL: this.config.apollo.endpoint,
      timeout: 10000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Handle self-signed certificates
      }),
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
    });
  }

  /**
   * Login to Apollo and get session cookie
   */
  async login(): Promise<Result<void, ApolloApiError>> {
    this.logger.debug('Logging into Apollo...');

    const loginResult = await retryAsyncIf(
      async () => {
        const response = await this.client.post('/api/login', {
          username: this.config.apollo.username,
          password: this.config.apollo.password,
        });

        if (response.status === 200) {
          const setCookieHeader = response.headers['set-cookie'];
          if (setCookieHeader && setCookieHeader.length > 0) {
            this.sessionCookie = setCookieHeader[0]!.split(';')[0]!;
            return;
          } else {
            throw new ApolloAuthError('Login successful but no session cookie received');
          }
        } else if (response.status === 401) {
          throw new ApolloAuthError('Invalid username or password');
        } else {
          throw new ApolloApiError(`Login failed: ${response.status} - ${response.statusText}`, response.status);
        }
      },
      shouldRetry,
      { maxAttempts: 3 },
      this.logger,
      'Apollo login'
    );

    if (loginResult.success) {
      this.logger.debug('Successfully logged into Apollo');
      return Ok(undefined);
    } else {
      return Err(new ApolloApiError(
        loginResult.error.message,
        undefined,
        'LOGIN_FAILED'
      ));
    }
  }

  /**
   * Fetch apps from Apollo server
   */
  async fetchApps(): Promise<Result<ServerApp[], ApolloApiError>> {
    this.logger.debug('Fetching apps from Apollo...');

    if (!this.sessionCookie) {
      const loginResult = await this.login();
      if (!loginResult.success) {
        return Err(loginResult.error);
      }
    }

    const fetchResult = await retryAsyncIf(
      async () => {
        const response = await this.client.get('/api/apps', {
          headers: {
            'Cookie': this.sessionCookie,
          },
        });

        if (response.status === 200) {
          const data = response.data as ServerAppsResponse;
          return data.apps || [];
        } else if (response.status === 401) {
          // Session expired, try to re-login
          this.sessionCookie = '';
          throw new ApolloAuthError('Session expired');
        } else {
          throw new ApolloApiError(
            `Failed to fetch apps: ${response.status} - ${response.statusText}`,
            response.status
          );
        }
      },
      shouldRetry,
      { maxAttempts: 3 },
      this.logger,
      'Apollo fetch apps'
    );

    if (fetchResult.success) {
      this.logger.debug(`Successfully fetched ${fetchResult.data.length} apps from Apollo`);
      return Ok(fetchResult.data);
    } else {
      return Err(new ApolloApiError(
        fetchResult.error.message,
        undefined,
        'FETCH_APPS_FAILED'
      ));
    }
  }

  /**
   * Update an app on Apollo server
   */
  async updateApp(payload: ApiPayload): Promise<Result<void, ApolloApiError>> {
    this.logger.debug(`Updating app: ${payload.name}`);

    if (!this.sessionCookie) {
      const loginResult = await this.login();
      if (!loginResult.success) {
        return Err(loginResult.error);
      }
    }

    const updateResult = await retryAsyncIf(
      async () => {
        const response = await this.client.post('/api/apps', payload, {
          headers: {
            'Cookie': this.sessionCookie,
          },
        });

        if (response.status === 200) {
          return;
        } else if (response.status === 401) {
          this.sessionCookie = '';
          throw new ApolloAuthError('Session expired');
        } else {
          throw new ApolloApiError(
            `Failed to update app: ${response.status} - ${response.statusText}`,
            response.status
          );
        }
      },
      shouldRetry,
      { maxAttempts: 3 },
      this.logger,
      `Apollo update app ${payload.name}`
    );

    if (updateResult.success) {
      this.logger.debug(`Successfully updated app: ${payload.name}`);
      return Ok(undefined);
    } else {
      return Err(new ApolloApiError(
        updateResult.error.message,
        undefined,
        'UPDATE_APP_FAILED'
      ));
    }
  }

  /**
   * Test connection to Apollo server
   */
  async testConnection(): Promise<Result<void, ApolloApiError>> {
    this.logger.debug('Testing Apollo connection...');

    const loginResult = await this.login();
    if (!loginResult.success) {
      return Err(loginResult.error);
    }

    const testResult = await fromPromise(
      this.client.get('/api/apps', {
        headers: {
          'Cookie': this.sessionCookie,
        },
        timeout: 5000,
      })
    );

    if (testResult.success) {
      const response = testResult.data;
      if (response.status === 200) {
        const appCount = (response.data as ServerAppsResponse).apps?.length || 0;
        this.logger.debug(`Connection test successful. Found ${appCount} apps.`);
        return Ok(undefined);
      } else {
        return Err(new ApolloApiError(
          `Connection test failed: ${response.status} - ${response.statusText}`,
          response.status
        ));
      }
    } else {
      const error = testResult.error;
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          return Err(new ApolloConnectionError(
            `Connection refused: Is Apollo running on ${this.config.apollo.endpoint}?`,
            'ECONNREFUSED'
          ));
        } else if (error.code === 'ETIMEDOUT') {
          return Err(new ApolloConnectionError(
            'Connection timed out: Check your network connection',
            'ETIMEDOUT'
          ));
        }
      }
      return Err(new ApolloApiError(`Connection test failed: ${error.message}`));
    }
  }
}
