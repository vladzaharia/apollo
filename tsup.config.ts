import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  minify: false,
  splitting: false,
  bundle: true,
  noExternal: ['@oclif/core'],
  // Bundle everything for easier distribution
  external: [],
  banner: {
    js: '#!/usr/bin/env node\n',
  },
});
