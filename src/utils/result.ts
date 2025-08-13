/**
 * Result type for error handling - inspired by Rust's Result type
 * Provides type-safe error handling without throwing exceptions
 */

export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a successful result
 */
export const Ok = <T>(data: T): Result<T, never> => ({ 
  success: true, 
  data 
});

/**
 * Create an error result
 */
export const Err = <E>(error: E): Result<never, E> => ({ 
  success: false, 
  error 
});

/**
 * Check if result is successful
 */
export const isOk = <T, E>(result: Result<T, E>): result is { success: true; data: T } => {
  return result.success;
};

/**
 * Check if result is an error
 */
export const isErr = <T, E>(result: Result<T, E>): result is { success: false; error: E } => {
  return !result.success;
};

/**
 * Map over the success value of a Result
 */
export const map = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> => {
  if (result.success) {
    return Ok(fn(result.data));
  }
  return result;
};

/**
 * Map over the error value of a Result
 */
export const mapErr = <T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> => {
  if (!result.success) {
    return Err(fn(result.error));
  }
  return result;
};

/**
 * Chain operations that return Results
 */
export const flatMap = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> => {
  if (result.success) {
    return fn(result.data);
  }
  return result;
};

/**
 * Unwrap a Result, throwing if it's an error
 * Use sparingly - prefer pattern matching
 */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (result.success) {
    return result.data;
  }
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
};

/**
 * Unwrap a Result with a default value
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T => {
  if (result.success) {
    return result.data;
  }
  return defaultValue;
};

/**
 * Convert a Promise to a Result
 */
export const fromPromise = async <T>(promise: Promise<T>): Promise<Result<T, Error>> => {
  try {
    const data = await promise;
    return Ok(data);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * Combine multiple Results into one
 */
export const combine = <T extends readonly unknown[], E>(
  results: { [K in keyof T]: Result<T[K], E> }
): Result<T, E> => {
  const values = [] as unknown as T;
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result.success) {
      return result;
    }
    (values as any)[i] = result.data;
  }
  
  return Ok(values);
};
