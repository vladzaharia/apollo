import * as fs from 'fs/promises';
import * as path from 'path';
import { Result, Ok, Err, fromPromise } from '../../utils/result.js';
import type { Logger } from '../../utils/logger.js';
import type { LocalConfig } from '../../models/apollo-app.js';
import { validateLocalConfig } from '../../models/apollo-app.js';

/**
 * File service errors
 */
export class FileServiceError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly path?: string
  ) {
    super(message);
    this.name = 'FileServiceError';
  }
}

/**
 * File service interface
 */
export interface IFileService {
  loadJsonFile<T>(filepath: string, validator?: (data: unknown) => T): Promise<Result<T, FileServiceError>>;
  saveJsonFile<T>(filepath: string, data: T): Promise<Result<void, FileServiceError>>;
  ensureDirectory(dirPath: string): Promise<Result<void, FileServiceError>>;
  fileExists(filepath: string): Promise<Result<boolean, FileServiceError>>;
  loadLocalConfig(filepath: string): Promise<Result<LocalConfig, FileServiceError>>;
}

/**
 * File service implementation
 */
export class FileService implements IFileService {
  constructor(private logger: Logger) {}

  /**
   * Load and parse a JSON file
   */
  async loadJsonFile<T>(
    filepath: string, 
    validator?: (data: unknown) => T
  ): Promise<Result<T, FileServiceError>> {
    try {
      const fullPath = path.resolve(filepath);
      this.logger.debug(`Loading JSON file: ${fullPath}`);

      const existsResult = await this.fileExists(fullPath);
      if (!existsResult.success) {
        return Err(existsResult.error);
      }

      if (!existsResult.data) {
        return Err(new FileServiceError(
          `File not found: ${fullPath}`,
          'ENOENT',
          fullPath
        ));
      }

      const contentResult = await fromPromise(fs.readFile(fullPath, 'utf8'));
      if (!contentResult.success) {
        return Err(new FileServiceError(
          `Failed to read file: ${contentResult.error.message}`,
          'READ_ERROR',
          fullPath
        ));
      }

      let data: unknown;
      try {
        data = JSON.parse(contentResult.data);
      } catch (parseError) {
        return Err(new FileServiceError(
          `Invalid JSON in file: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          'PARSE_ERROR',
          fullPath
        ));
      }

      if (validator) {
        try {
          const validatedData = validator(data);
          this.logger.debug(`Successfully loaded and validated JSON file: ${fullPath}`);
          return Ok(validatedData);
        } catch (validationError) {
          return Err(new FileServiceError(
            `Validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`,
            'VALIDATION_ERROR',
            fullPath
          ));
        }
      }

      this.logger.debug(`Successfully loaded JSON file: ${fullPath}`);
      return Ok(data as T);
    } catch (error) {
      return Err(new FileServiceError(
        `Unexpected error loading file: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        filepath
      ));
    }
  }

  /**
   * Save data to a JSON file
   */
  async saveJsonFile<T>(filepath: string, data: T): Promise<Result<void, FileServiceError>> {
    try {
      const fullPath = path.resolve(filepath);
      this.logger.debug(`Saving JSON file: ${fullPath}`);

      // Ensure directory exists
      const dirPath = path.dirname(fullPath);
      const ensureDirResult = await this.ensureDirectory(dirPath);
      if (!ensureDirResult.success) {
        return Err(ensureDirResult.error);
      }

      let jsonContent: string;
      try {
        jsonContent = JSON.stringify(data, null, 2);
      } catch (stringifyError) {
        return Err(new FileServiceError(
          `Failed to serialize data: ${stringifyError instanceof Error ? stringifyError.message : String(stringifyError)}`,
          'STRINGIFY_ERROR',
          fullPath
        ));
      }

      const writeResult = await fromPromise(fs.writeFile(fullPath, jsonContent, 'utf8'));
      if (!writeResult.success) {
        return Err(new FileServiceError(
          `Failed to write file: ${writeResult.error.message}`,
          'WRITE_ERROR',
          fullPath
        ));
      }

      this.logger.debug(`Successfully saved JSON file: ${fullPath}`);
      return Ok(undefined);
    } catch (error) {
      return Err(new FileServiceError(
        `Unexpected error saving file: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        filepath
      ));
    }
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  async ensureDirectory(dirPath: string): Promise<Result<void, FileServiceError>> {
    try {
      const fullPath = path.resolve(dirPath);
      this.logger.debug(`Ensuring directory exists: ${fullPath}`);

      const mkdirResult = await fromPromise(
        fs.mkdir(fullPath, { recursive: true })
      );

      if (!mkdirResult.success) {
        return Err(new FileServiceError(
          `Failed to create directory: ${mkdirResult.error.message}`,
          'MKDIR_ERROR',
          fullPath
        ));
      }

      this.logger.debug(`Directory ensured: ${fullPath}`);
      return Ok(undefined);
    } catch (error) {
      return Err(new FileServiceError(
        `Unexpected error ensuring directory: ${error instanceof Error ? error.message : String(error)}`,
        'UNKNOWN_ERROR',
        dirPath
      ));
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(filepath: string): Promise<Result<boolean, FileServiceError>> {
    try {
      const fullPath = path.resolve(filepath);
      
      const accessResult = await fromPromise(
        fs.access(fullPath, fs.constants.F_OK)
      );

      return Ok(accessResult.success);
    } catch (error) {
      return Err(new FileServiceError(
        `Error checking file existence: ${error instanceof Error ? error.message : String(error)}`,
        'ACCESS_ERROR',
        filepath
      ));
    }
  }

  /**
   * Load and validate local Apollo configuration
   */
  async loadLocalConfig(filepath: string): Promise<Result<LocalConfig, FileServiceError>> {
    return this.loadJsonFile(filepath, validateLocalConfig);
  }
}
