import { z } from 'zod';
import { Result, Ok, Err } from './result.js';

/**
 * Configuration schema with runtime validation
 */
const ConfigSchema = z.object({
  apollo: z.object({
    endpoint: z.string().url('Apollo endpoint must be a valid URL'),
    username: z.string().min(1, 'Apollo username is required'),
    password: z.string().min(1, 'Apollo password is required'),
    uuid: z.string().optional(),
    hostName: z.string().default('Apollo Server'),
  }),
  steamGridDb: z.object({
    apiKey: z.string().optional(),
  }),
  igdb: z.object({
    clientId: z.string().optional(),
    accessToken: z.string().optional(),
  }),
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    pretty: z.boolean().default(true),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[]
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Load and validate configuration from environment variables
 */
export const loadConfig = (): Result<Config, ConfigValidationError> => {
  try {
    const config = {
      apollo: {
        endpoint: process.env.APOLLO_ENDPOINT,
        username: process.env.APOLLO_USERNAME,
        password: process.env.APOLLO_PASSWORD,
        uuid: process.env.APOLLO_UUID,
        hostName: process.env.APOLLO_HOST_NAME,
      },
      steamGridDb: {
        apiKey: process.env.STEAMGRIDDB_API_KEY,
      },
      igdb: {
        clientId: process.env.IGDB_CLIENT_ID,
        accessToken: process.env.IGDB_ACCESS_TOKEN,
      },
      logging: {
        level: process.env.LOG_LEVEL,
        pretty: process.env.LOG_PRETTY !== 'false',
      },
    };

    const result = ConfigSchema.safeParse(config);
    
    if (!result.success) {
      return Err(new ConfigValidationError(
        'Configuration validation failed',
        result.error.issues
      ));
    }

    return Ok(result.data);
  } catch {
    return Err(new ConfigValidationError(
      'Failed to load configuration',
      []
    ));
  }
};

/**
 * Validate required Apollo configuration
 */
export const validateApolloConfig = (config: Config): Result<void, ConfigValidationError> => {
  const missing: string[] = [];
  
  if (!config.apollo.endpoint) missing.push('APOLLO_ENDPOINT');
  if (!config.apollo.username) missing.push('APOLLO_USERNAME');
  if (!config.apollo.password) missing.push('APOLLO_PASSWORD');
  
  if (missing.length > 0) {
    return Err(new ConfigValidationError(
      `Missing required Apollo configuration: ${missing.join(', ')}`,
      []
    ));
  }
  
  return Ok(undefined);
};

/**
 * Check if external API configurations are available
 */
export const hasExternalApiConfig = (config: Config): {
  steamGridDb: boolean;
  igdb: boolean;
} => ({
  steamGridDb: Boolean(config.steamGridDb.apiKey),
  igdb: Boolean(config.igdb.clientId && config.igdb.accessToken),
});
