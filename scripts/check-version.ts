#!/usr/bin/env bun
/**
 * Version Check Script
 *
 * Validates that all package.json files in the monorepo have the same version.
 * The shared package.json (packages/shared/package.json) is the single source of truth.
 *
 * Usage: bun run scripts/check-version.ts
 * Exit code: 0 if all versions match, 1 if there's a mismatch
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';

const scriptDir = dirname(new URL(import.meta.url).pathname);
const repoRoot = dirname(scriptDir);

function getPackageVersion(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  const pkg = JSON.parse(content);
  return pkg.version;
}

function main(): void {
  // Read version from shared package.json (single source of truth)
  const sharedPkgPath = join(repoRoot, 'packages/shared/package.json');
  const referenceVersion = getPackageVersion(sharedPkgPath);
  console.log(`Reference version (packages/shared): ${referenceVersion}`);
  console.log('');

  // Find all package.json files
  const packageFiles = [
    join(repoRoot, 'package.json'),
    ...readdirSync(join(repoRoot, 'apps')).map((dir) => join(repoRoot, 'apps', dir, 'package.json')),
    ...readdirSync(join(repoRoot, 'packages')).map((dir) => join(repoRoot, 'packages', dir, 'package.json')),
  ].filter((f) => existsSync(f));

  const mismatches: string[] = [];

  for (const file of packageFiles) {
    const relativePath = file.replace(repoRoot + '/', '');
    const pkgVersion = getPackageVersion(file);

    if (pkgVersion !== referenceVersion) {
      console.log(`  ✗ ${relativePath}: ${pkgVersion} (expected ${referenceVersion})`);
      mismatches.push(relativePath);
    } else {
      console.log(`  ✓ ${relativePath}: ${pkgVersion}`);
    }
  }

  console.log('');

  if (mismatches.length > 0) {
    console.error(`ERROR: ${mismatches.length} package(s) have mismatched versions.`);
    console.error('');
    console.error('All package.json files must have the same version.');
    console.error('Update the mismatched files to match packages/shared/package.json.');
    process.exit(1);
  }

  console.log('✓ All versions match!');
}

main();
