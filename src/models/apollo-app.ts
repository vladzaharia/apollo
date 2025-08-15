import { z } from 'zod';

/**
 * Preparation command schema
 */
const PrepCmdSchema = z.object({
  do: z.string(),
  undo: z.string(),
  elevated: z.boolean(),
});

export type PrepCmd = z.infer<typeof PrepCmdSchema>;

/**
 * Local Apollo app schema (from apps.json)
 */
const LocalAppSchema = z.object({
  name: z.string(),
  output: z.string().optional(),
  cmd: z.string().optional(),
  detached: z.array(z.string()).optional(),
  'exclude-global-prep-cmd': z.boolean().optional(),
  elevated: z.boolean().optional(),
  'auto-detach': z.boolean().optional(),
  'wait-all': z.boolean().optional(),
  'exit-timeout': z.number().optional(),
  'prep-cmd': z.array(PrepCmdSchema).optional(),
});

export type LocalApp = z.infer<typeof LocalAppSchema>;

/**
 * Server Apollo app schema (from API)
 */
const ServerAppSchema = LocalAppSchema.extend({
  uuid: z.string(),
  'image-path': z.string().optional(),
  'allow-client-commands': z.boolean().optional(),
  'per-client-app-identity': z.boolean().optional(),
  'scale-factor': z.number().optional(),
  'state-cmd': z.array(PrepCmdSchema).optional(),
  'terminate-on-pause': z.boolean().optional(),
  'use-app-identity': z.boolean().optional(),
  'virtual-display': z.boolean().optional(),
  gamepad: z.string().optional(),
  'exclude-global-state-cmd': z.boolean().optional(),
});

export type ServerApp = z.infer<typeof ServerAppSchema>;

/**
 * API payload schema for app updates
 */
export const ApiPayloadSchema = ServerAppSchema.extend({
  index: z.number(),
});

export type ApiPayload = z.infer<typeof ApiPayloadSchema>;

/**
 * Local apps configuration file schema
 */
const LocalConfigSchema = z.object({
  apps: z.array(LocalAppSchema),
});

export type LocalConfig = z.infer<typeof LocalConfigSchema>;

/**
 * Server apps response schema
 */
const ServerAppsResponseSchema = z.object({
  apps: z.array(ServerAppSchema),
});

export type ServerAppsResponse = z.infer<typeof ServerAppsResponseSchema>;

/**
 * Validation functions
 */
export const validateLocalApp = (data: unknown): LocalApp => {
  return LocalAppSchema.parse(data);
};

export const validateServerApp = (data: unknown): ServerApp => {
  return ServerAppSchema.parse(data);
};

export const validateLocalConfig = (data: unknown): LocalConfig => {
  return LocalConfigSchema.parse(data);
};

export const validateServerAppsResponse = (data: unknown): ServerAppsResponse => {
  return ServerAppsResponseSchema.parse(data);
};

/**
 * Type guards
 */
export const isLocalApp = (data: unknown): data is LocalApp => {
  return LocalAppSchema.safeParse(data).success;
};

export const isServerApp = (data: unknown): data is ServerApp => {
  return ServerAppSchema.safeParse(data).success;
};

/**
 * Utility functions
 */
export const extractSteamAppId = (app: LocalApp | ServerApp): string | null => {
  if (app.detached && app.detached.length > 0) {
    const steamUri = app.detached.find(uri => uri.startsWith('steam://rungameid/'));
    if (steamUri) {
      const match = steamUri.match(/steam:\/\/rungameid\/(\d+)/);
      return match ? match[1] ?? null : null;
    }
  }
  return null;
};

export const extractLaunchCommand = (app: LocalApp | ServerApp): string => {
  if (app.detached && app.detached.length > 0) {
    const firstCommand = app.detached[0];
    return firstCommand ?? '';
  } else if (app.cmd) {
    return app.cmd;
  }
  return '';
};

export const normalizeAppName = (name: string): string => {
  return name.toLowerCase().trim().replace(/[:'"-]/g, '').replace(/\s+/g, ' ');
};
