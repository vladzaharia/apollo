import { beforeEach } from 'vitest';
import { container } from '../src/lib/container.js';

// Clear the DI container before each test
beforeEach(() => {
  container.clear();
});
