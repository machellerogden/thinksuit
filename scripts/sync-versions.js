#!/usr/bin/env node
/**
 * Syncs version strings across the monorepo
 * Updates hardcoded version strings in code and documentation
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Read version from root package.json
const rootPackage = JSON.parse(
    readFileSync(resolve(rootDir, 'package.json'), 'utf8')
);
const version = rootPackage.version;

console.log(`Syncing version to ${version}...`);

// Files that need version updates
const versionFiles = [
    {
        path: 'packages/thinksuit-mcp-tools/index.js',
        pattern: /version:\s*['"][\d.]+['"]/,
        replacement: `version: '${version}'`
    },
    {
        path: 'packages/thinksuit-mcp-server/lib/index.js',
        pattern: /version:\s*['"][\d.]+['"]/,
        replacement: `version: '${version}'`
    },
    {
        path: 'packages/thinksuit-modules/mu/index.js',
        pattern: /version:\s*['"][\d.]+['"]/,
        replacement: `version: '${version}'`
    },
    {
        path: 'packages/thinksuit-modules/README.md',
        pattern: /version:\s*['"][\d.]+['"]/,
        replacement: `version: '${version}'`
    }
];

let updateCount = 0;

for (const file of versionFiles) {
    const filePath = resolve(rootDir, file.path);

    try {
        const content = readFileSync(filePath, 'utf8');
        const updated = content.replace(file.pattern, file.replacement);

        if (content !== updated) {
            writeFileSync(filePath, updated, 'utf8');
            console.log(`  ✓ Updated ${file.path}`);
            updateCount++;
        } else {
            console.log(`  - No change needed in ${file.path}`);
        }
    } catch (error) {
        console.error(`  ✗ Failed to update ${file.path}: ${error.message}`);
        process.exit(1);
    }
}

console.log(`\nSync complete: ${updateCount} file(s) updated to version ${version}`);
