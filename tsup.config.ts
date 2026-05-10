import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/server/cli.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2020',
  splitting: false,
  sourcemap: true,
  treeshake: true,
});
