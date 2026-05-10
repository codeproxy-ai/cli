import { readFileSync, writeFileSync, chmodSync } from 'node:fs';

const shebang = '#!/usr/bin/env node\n';

['dist/cli.js', 'dist/cli.cjs'].forEach((file) => {
  try {
    const content = readFileSync(file, 'utf-8');
    if (!content.startsWith('#!')) {
      writeFileSync(file, shebang + content);
      chmodSync(file, 0o755);
      console.log(`Added shebang to ${file}`);
    }
  } catch {
    // skip if file doesn't exist
  }
});
