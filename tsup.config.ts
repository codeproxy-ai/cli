import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/server/cli.ts' },
  format: ['esm', 'cjs'],
  onSuccess: 'node scripts/add-shebang.mjs',
  dts: true,
  clean: true,
  target: 'es2020',
  splitting: false,
  sourcemap: true,
  treeshake: true,
});
