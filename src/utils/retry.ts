import { Result, Ok, Err } from './result.js';
import type { Logger } from './logger.js';

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean;
}

export const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  jitter: true,
};

/**
 * Retry error containing information about all attempts
 */
export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Sleep for a given number of milliseconds
 */
const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate delay with exponential backoff and optional jitter
 */
const calculateDelay = (
  attempt: number, 
  options: RetryOptions
): number => {
  const exponentialDelay = Math.min(
    options.baseDelay * Math.pow(options.backoffFactor, attempt - 1),
    options.maxDelay
  );

  if (options.jitter) {
    // Add random jitter up to 25% of the delay
    const jitterAmount = exponentialDelay * 0.25;
    return exponentialDelay + (Math.random() * jitterAmount);
  }

  return exponentialDelay;
};

/**
 * Retry an async operation with exponential backoff
 */
export const retryAsync = async <T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  logger?: Logger,
  operationName = 'operation'
): Promise<Result<T, RetryError>> => {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1 && logger) {
        logger.info(`${operationName} succeeded on attempt ${attempt}`);
      }
      return Ok(result);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === opts.maxAttempts) {
        break;
      }

      const delay = calculateDelay(attempt, opts);
      
      if (logger) {
        logger.warn(
          `${operationName} failed on attempt ${attempt}/${opts.maxAttempts}: ${lastError.message}. Retrying in ${Math.round(delay)}ms...`
        );
      }

      await sleep(delay);
    }
  }

  return Err(new RetryError(
    `${operationName} failed after ${opts.maxAttempts} attempts`,
    opts.maxAttempts,
    lastError
  ));
};

/**
 * Determine if an error should trigger a retry
 */
export const shouldRetry = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    // Retry on network errors, rate limits, and server errors
    return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(code);
  }

  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response: { status: number } }).response;
    // Retry on 5xx server errors and 429 rate limit
    return response.status >= 500 || response.status === 429;
  }

  return false;
};

/**
 * Retry with conditional logic
 */
export const retryAsyncIf = async <T>(
  operation: () => Promise<T>,
  shouldRetryFn: (error: unknown) => boolean,
  options: Partial<RetryOptions> = {},
  logger?: Logger,
  operationName = 'operation'
): Promise<Result<T, RetryError>> => {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1 && logger) {
        logger.info(`${operationName} succeeded on attempt ${attempt}`);
      }
      return Ok(result);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === opts.maxAttempts || !shouldRetryFn(error)) {
        break;
      }

      const delay = calculateDelay(attempt, opts);
      
      if (logger) {
        logger.warn(
          `${operationName} failed on attempt ${attempt}/${opts.maxAttempts}: ${lastError.message}. Retrying in ${Math.round(delay)}ms...`
        );
      }

      await sleep(delay);
    }
  }

  return Err(new RetryError(
    `${operationName} failed after ${opts.maxAttempts} attempts`,
    opts.maxAttempts,
    lastError
  ));
};
