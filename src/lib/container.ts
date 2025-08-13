/**
 * Simple dependency injection container
 */

type Factory<T> = () => T;
type AsyncFactory<T> = () => Promise<T>;

export class Container {
  private services = new Map<string, Factory<unknown>>();
  private singletons = new Map<string, unknown>();
  private asyncFactories = new Map<string, AsyncFactory<unknown>>();

  /**
   * Register a service factory
   */
  register<T>(key: string, factory: Factory<T>): void {
    this.services.set(key, factory);
  }

  /**
   * Register a singleton service
   */
  registerSingleton<T>(key: string, factory: Factory<T>): void {
    this.services.set(key, () => {
      if (!this.singletons.has(key)) {
        this.singletons.set(key, factory());
      }
      return this.singletons.get(key) as T;
    });
  }

  /**
   * Register an async service factory
   */
  registerAsync<T>(key: string, factory: AsyncFactory<T>): void {
    this.asyncFactories.set(key, factory);
  }

  /**
   * Resolve a service
   */
  resolve<T>(key: string): T {
    const factory = this.services.get(key);
    if (!factory) {
      throw new Error(`Service '${key}' not found. Available services: ${Array.from(this.services.keys()).join(', ')}`);
    }
    return factory() as T;
  }

  /**
   * Resolve an async service
   */
  async resolveAsync<T>(key: string): Promise<T> {
    const factory = this.asyncFactories.get(key);
    if (!factory) {
      throw new Error(`Async service '${key}' not found. Available async services: ${Array.from(this.asyncFactories.keys()).join(', ')}`);
    }
    return factory() as Promise<T>;
  }

  /**
   * Check if a service is registered
   */
  has(key: string): boolean {
    return this.services.has(key) || this.asyncFactories.has(key);
  }

  /**
   * Get all registered service keys
   */
  getServiceKeys(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get all registered async service keys
   */
  getAsyncServiceKeys(): string[] {
    return Array.from(this.asyncFactories.keys());
  }

  /**
   * Clear all services (useful for testing)
   */
  clear(): void {
    this.services.clear();
    this.singletons.clear();
    this.asyncFactories.clear();
  }
}

/**
 * Global container instance
 */
export const container = new Container();
