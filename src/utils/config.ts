import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';
import { Ok, Err, type Result } from './result.js';

/**
 * Base configuration schema
 */
const BaseConfigSchema = z.object({
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    pretty: z.boolean().default(true),
  }),
});

/**
 * Apollo server configuration schema
 */
const ApolloConfigSchema = z.object({
  apollo: z.object({
    endpoint: z.string().url('Apollo endpoint must be a valid URL'),
    username: z.string().min(1, 'Apollo username is required'),
    password: z.string().min(1, 'Apollo password is required'),
    uuid: z.string().optional(),
    hostName: z.string().default('Apollo Server'),
  }),
});

/**
 * External API configuration schema
 */
const ExternalApiConfigSchema = z.object({
  steamGridDb: z.object({
    apiKey: z.string().optional(),
  }),
  igdb: z.object({
    clientId: z.string().optional(),
    accessToken: z.string().optional(),
  }),
});

/**
 * Full configuration schema (for commands that need everything)
 */
const ConfigSchema = BaseConfigSchema.merge(ApolloConfigSchema).merge(ExternalApiConfigSchema);

/**
 * Sync command configuration (needs Apollo + base)
 */
const SyncConfigSchema = BaseConfigSchema.merge(ApolloConfigSchema);

/**
 * Generate command configuration (needs external APIs + base, Apollo optional)
 */
const GenerateConfigSchema = BaseConfigSchema.merge(ExternalApiConfigSchema).merge(
  z.object({
    apollo: z.object({
      endpoint: z.string().url('Apollo endpoint must be a valid URL').optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      uuid: z.string().optional(),
      hostName: z.string().default('Apollo Server'),
    }).optional(),
  })
);

export type Config = z.infer<typeof ConfigSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type GenerateConfig = z.infer<typeof GenerateConfigSchema>;

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
 * Load base configuration object from environment
 */
const loadBaseConfig = () => {
  // Load .env file
  loadDotenv();

  return {
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
};

/**
 * Load and validate full configuration from environment variables
 */
export const loadConfig = (): Result<Config, ConfigValidationError> => {
  try {
    const config = loadBaseConfig();
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
 * Load and validate sync command configuration
 */
export const loadSyncConfig = (): Result<SyncConfig, ConfigValidationError> => {
  try {
    const config = loadBaseConfig();
    const result = SyncConfigSchema.safeParse(config);

    if (!result.success) {
      return Err(new ConfigValidationError(
        'Sync configuration validation failed',
        result.error.issues
      ));
    }

    return Ok(result.data);
  } catch {
    return Err(new ConfigValidationError(
      'Failed to load sync configuration',
      []
    ));
  }
};

/**
 * Load and validate generate command configuration
 */
export const loadGenerateConfig = (): Result<GenerateConfig, ConfigValidationError> => {
  try {
    const config = loadBaseConfig();
    const result = GenerateConfigSchema.safeParse(config);

    if (!result.success) {
      return Err(new ConfigValidationError(
        'Generate configuration validation failed',
        result.error.issues
      ));
    }

    return Ok(result.data);
  } catch {
    return Err(new ConfigValidationError(
      'Failed to load generate configuration',
      []
    ));
  }
};

/**
 * Validate required Apollo configuration
 */
export const validateApolloConfig = (config: Config | SyncConfig): Result<void, ConfigValidationError> => {
  const missing: string[] = [];

  if (!config.apollo.endpoint) {missing.push('APOLLO_ENDPOINT');}
  if (!config.apollo.username) {missing.push('APOLLO_USERNAME');}
  if (!config.apollo.password) {missing.push('APOLLO_PASSWORD');}

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
export const hasExternalApiConfig = (config: Config | GenerateConfig): {
  steamGridDb: boolean;
  igdb: boolean;
} => ({
  steamGridDb: Boolean(config.steamGridDb.apiKey),
  igdb: Boolean(config.igdb.clientId && config.igdb.accessToken),
});
