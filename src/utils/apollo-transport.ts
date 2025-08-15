import { Transform } from 'stream';
import { 
  formatUserMessage, 
  formatDeveloperMessage, 
  isUserLevel, 
  isDeveloperLevel,
  validateLogEntry,
  type LogEntry,
  type FormatOptions,
} from './log-formatter.js';

/**
 * Transport options for Apollo Pino transport
 */
export interface ApolloTransportOptions {
  colorize?: boolean;
  translateTime?: string;
  levelFirst?: boolean;
  hideObject?: boolean;
}

/**
 * Custom Pino transport for Apollo that provides:
 * - Clean user-friendly display for INFO/WARN/ERROR (with icons)
 * - Timestamped developer format for DEBUG/TRACE
 * - Eliminates duplicate logging by handling all formatting in one place
 */
export default async function apolloTransport(opts: ApolloTransportOptions = {}): Promise<Transform> {
  const {
    colorize = true,
    translateTime = 'HH:MM:ss',
    levelFirst = false,
    hideObject = true,
  } = opts;

  return new Transform({
    objectMode: true,
    highWaterMark: 16, // Limit buffer size for memory management
    transform(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null, data?: string) => void) {
      try {
        const log = parseLogEntry(chunk);
        const formatted = formatLogEntry(log, {
          colorize,
          translateTime,
          levelFirst,
          hideObject,
        });
        
        if (formatted) {
          callback(null, `${formatted}\n`);
        } else {
          callback(); // Skip filtered messages
        }
      } catch (error) {
        // Fallback for malformed JSON - don't crash the transport
        handleParsingError(error, chunk, callback);
      }
    },
  });
}

/**
 * Parse log entry from various input formats
 */
function parseLogEntry(chunk: unknown): LogEntry {
  if (typeof chunk === 'string') {
    const parsed = JSON.parse(chunk) as unknown;
    if (!validateLogEntry(parsed)) {
      throw new Error('Invalid log entry structure');
    }
    return parsed;
  }
  
  if (validateLogEntry(chunk)) {
    return chunk;
  }
  
  throw new Error('Invalid log entry format');
}

/**
 * Format log entry based on level and configuration
 */
function formatLogEntry(log: LogEntry, opts: FormatOptions): string | null {
  // Validate log entry structure
  if (!validateLogEntry(log)) {
    return `[INVALID LOG] ${JSON.stringify(log)}`;
  }

  const levelNum = typeof log.level === 'number' ? log.level : parseInt(String(log.level), 10);

  // User-friendly levels (INFO=30, WARN=40, ERROR=50)
  if (isUserLevel(levelNum)) {
    return formatUserMessage(levelNum, log.msg, opts);
  }

  // Developer levels (DEBUG=20, TRACE=10)
  if (isDeveloperLevel(levelNum)) {
    return formatDeveloperMessage(log, opts);
  }

  // Unknown or filtered levels
  return null;
}

/**
 * Handle parsing errors gracefully without crashing transport
 */
function handleParsingError(
  error: unknown,
  chunk: unknown,
  callback: (error?: Error | null, data?: string) => void
): void {
  const fallbackMessage = `[PARSE ERROR] ${String(chunk)}`;
  callback(null, `${fallbackMessage}\n`);

  // Log parsing errors in development for debugging
  if (process.env.NODE_ENV === 'development') {
    console.error('Apollo transport parsing error:', error instanceof Error ? error.message : String(error));
  }
}
