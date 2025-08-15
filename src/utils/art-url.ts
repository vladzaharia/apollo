import type { ServerApp } from '../models/apollo-app.js';

/**
 * Apollo host information for generating art:// URLs
 */
export interface ApolloHostInfo {
  uuid: string;
  name: string;
}

/**
 * Generate art:// launch URL for Apollo/Artemis
 * 
 * Format: art://launch?host_uuid=UUID&host_name=NAME&app_uuid=UUID&app_name=NAME
 * 
 * @param hostInfo Apollo server host information
 * @param app Apollo server app
 * @returns Formatted art:// URL
 */
export function generateArtLaunchUrl(
  hostInfo: ApolloHostInfo,
  app: ServerApp
): string {
  const params = new URLSearchParams({
    host_uuid: hostInfo.uuid,
    host_name: hostInfo.name,
    app_uuid: app.uuid,
    app_name: app.name,
  });

  return `art://launch?${params.toString()}`;
}

/**
 * Validate Apollo host information
 */
export function validateHostInfo(hostInfo: Partial<ApolloHostInfo>): hostInfo is ApolloHostInfo {
  return Boolean(hostInfo.uuid && hostInfo.name);
}

/**
 * Extract host info from configuration
 */
export function extractHostInfoFromConfig(config: {
  apollo?: {
    uuid?: string;
    hostName?: string;
  };
}): ApolloHostInfo | null {
  if (!config.apollo?.uuid || !config.apollo?.hostName) {
    return null;
  }

  return {
    uuid: config.apollo.uuid,
    name: config.apollo.hostName,
  };
}

/**
 * Check if an app has the required UUID for art:// URL generation
 */
export function canGenerateArtUrl(app: ServerApp): boolean {
  return Boolean(app.uuid);
}
