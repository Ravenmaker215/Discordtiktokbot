import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function findJavaScriptFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return findJavaScriptFiles(entryPath);
      }

      return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
    });
}

const files = [...findJavaScriptFiles('src'), ...findJavaScriptFiles('scripts')];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Checked ${files.length} JavaScript file(s).`);
