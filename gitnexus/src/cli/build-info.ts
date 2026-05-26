/**
 * Build information module.
 * Generated at compile time by scripts/build.js.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface BuildInfo {
  version: string;
  buildTime: string;
  nodeVersion: string;
}

/**
 * Get build information.
 * Returns the compiled build-info.json if available, otherwise falls back to package.json.
 */
export function getBuildInfo(): BuildInfo {
  // Try to read build-info.json (generated at compile time)
  const buildInfoPath = path.join(__dirname, '..', 'build-info.json');
  if (fs.existsSync(buildInfoPath)) {
    return JSON.parse(fs.readFileSync(buildInfoPath, 'utf-8'));
  }

  // Fallback to package.json (development mode)
  const pkg = require('../../package.json');
  return {
    version: pkg.version,
    buildTime: 'development',
    nodeVersion: process.version,
  };
}

/**
 * Format build info for display.
 */
export function formatBuildInfo(): string {
  const info = getBuildInfo();
  return [
    `GitNexus v${info.version}`,
    `编译时间: ${info.buildTime}`,
    `编译 Node: ${info.nodeVersion}`,
    `运行 Node: ${process.version}`,
  ].join('\n');
}

/**
 * CLI command to display build information.
 */
export function buildInfoCommand(): void {
  console.log(formatBuildInfo());
}
