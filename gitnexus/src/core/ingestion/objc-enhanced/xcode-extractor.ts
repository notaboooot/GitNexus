/**
 * Xcode Project Configuration Extractor
 *
 * Extracts framework search paths, header search paths, and other build settings
 * from Xcode projects (.xcodeproj) and workspaces (.xcworkspace).
 *
 * Usage:
 *   npx gitnexus objc-config --xcode-project path/to/MyProject.xcodeproj
 *   npx gitnexus objc-config --xcode-workspace path/to/MyProject.xcworkspace --scheme MyScheme
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { logger } from '../../logger.js';

export interface ObjCConfig {
  frameworkSearchPaths: string[];
  headerSearchPaths: string[];
  sdk?: {
    type: 'macosx' | 'iphoneos' | 'iphonesimulator';
    version?: string;
  };
  target?: {
    arch: 'arm64' | 'x86_64' | 'arm64e';
  };
  defines: string[];
  otherClangFlags: string[];
  timeout: number;
  maxFiles: number;
}

const DEFAULT_CONFIG: ObjCConfig = {
  frameworkSearchPaths: [],
  headerSearchPaths: [],
  defines: ['COCOAPODS=1'],
  otherClangFlags: [],
  timeout: 30000,
  maxFiles: 100,
};

/**
 * Extract build settings from an Xcode project using xcodebuild.
 */
export function extractXcodeSettings(
  projectPath: string,
  options?: {
    scheme?: string;
    target?: string;
    configuration?: string;
    sdk?: string;
  },
): Partial<ObjCConfig> {
  const config: Partial<ObjCConfig> = {};

  try {
    // Build the xcodebuild command
    const args = ['-showBuildSettings'];

    if (projectPath.endsWith('.xcworkspace')) {
      args.push('-workspace', projectPath);
      if (options?.scheme) {
        args.push('-scheme', options.scheme);
      }
    } else {
      args.push('-project', projectPath);
      if (options?.target) {
        args.push('-target', options.target);
      }
    }

    if (options?.configuration) {
      args.push('-configuration', options.configuration);
    }

    if (options?.sdk) {
      args.push('-sdk', options.sdk);
    }

    // Run xcodebuild
    const output = execSync(`xcodebuild ${args.join(' ')}`, {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: dirname(projectPath),
    });

    // Parse the output
    const settings = parseBuildSettings(output);

    // Extract framework search paths
    if (settings.FRAMEWORK_SEARCH_PATHS) {
      config.frameworkSearchPaths = parseSearchPaths(
        settings.FRAMEWORK_SEARCH_PATHS,
        dirname(projectPath),
      );
    }

    // Extract header search paths
    if (settings.HEADER_SEARCH_PATHS) {
      config.headerSearchPaths = parseSearchPaths(
        settings.HEADER_SEARCH_PATHS,
        dirname(projectPath),
      );
    }

    // Extract user header search paths
    if (settings.USER_HEADER_SEARCH_PATHS) {
      const userHeaders = parseSearchPaths(settings.USER_HEADER_SEARCH_PATHS, dirname(projectPath));
      config.headerSearchPaths = [...(config.headerSearchPaths || []), ...userHeaders];
    }

    // Extract SDK
    if (settings.SDKROOT) {
      const sdkRoot = settings.SDKROOT;
      if (sdkRoot.includes('iphoneos')) {
        config.sdk = { type: 'iphoneos' };
      } else if (sdkRoot.includes('iphonesimulator')) {
        config.sdk = { type: 'iphonesimulator' };
      } else if (sdkRoot.includes('macosx')) {
        config.sdk = { type: 'macosx' };
      }
    }

    // Extract architecture
    if (settings.ARCHS) {
      const archs = settings.ARCHS.split(' ').filter((a: string) => a);
      if (archs.includes('arm64')) {
        config.target = { arch: 'arm64' };
      } else if (archs.includes('x86_64')) {
        config.target = { arch: 'x86_64' };
      }
    }

    // Extract preprocessor defines
    if (settings.GCC_PREPROCESSOR_DEFINITIONS) {
      const defines = settings.GCC_PREPROCESSOR_DEFINITIONS.split(' ').filter(
        (d: string) => d && !d.startsWith('$('),
      );
      config.defines = defines;
    }

    logger.info(
      `[ObjC Config] Extracted ${config.frameworkSearchPaths?.length || 0} framework paths, ${config.headerSearchPaths?.length || 0} header paths`,
    );
  } catch (error) {
    logger.warn(`[ObjC Config] Failed to extract Xcode settings: ${error}`);
  }

  return config;
}

/**
 * Parse xcodebuild -showBuildSettings output into a key-value map.
 */
function parseBuildSettings(output: string): Record<string, string> {
  const settings: Record<string, string> = {};
  const lines = output.split('\n');

  for (const line of lines) {
    // Match lines like "    FRAMEWORK_SEARCH_PATHS = "path1 path2""
    const match = line.match(/^\s+([A-Z_]+)\s+=\s+(.+)$/);
    if (match) {
      const [, key, value] = match;
      // Remove quotes and trailing spaces
      settings[key] = value.trim().replace(/^"+|"+$/g, '');
    }
  }

  return settings;
}

/**
 * Parse a search path string into an array of absolute paths.
 */
function parseSearchPaths(pathsStr: string, projectDir: string): string[] {
  // Remove $(inherited) and other build variables
  let paths = pathsStr
    .replace(/\$\(inherited\)/g, '')
    .replace(/\$\([^)]+\)/g, '') // Remove other $(VAR) references
    .split('"')
    .filter((p) => p && p !== ' ' && p.trim())
    .map((p) => p.trim());

  // Convert relative paths to absolute
  paths = paths.map((p) => {
    if (p.startsWith('/')) {
      return p;
    }
    // Handle relative paths
    return resolve(projectDir, p);
  });

  // Filter out non-existent paths
  return paths.filter((p) => existsSync(p));
}

/**
 * Detect CocoaPods installation and add Pod paths.
 */
export function detectCocoaPods(projectDir: string): Partial<ObjCConfig> {
  const config: Partial<ObjCConfig> = {
    frameworkSearchPaths: [],
    headerSearchPaths: [],
  };

  const podsDir = join(projectDir, 'Pods');

  if (!existsSync(podsDir)) {
    return config;
  }

  // Add common CocoaPods paths
  const frameworkPaths = [
    join(podsDir, 'Headers', 'Public'),
    join(podsDir, 'Target Support Files'),
  ];

  for (const p of frameworkPaths) {
    if (existsSync(p)) {
      config.frameworkSearchPaths!.push(p);
    }
  }

  // Add header search paths
  const headerPaths = [join(podsDir, 'Headers', 'Public'), join(podsDir, 'Headers', 'Private')];

  for (const p of headerPaths) {
    if (existsSync(p)) {
      config.headerSearchPaths!.push(p);
    }
  }

  logger.info(
    `[ObjC Config] Detected CocoaPods: ${config.frameworkSearchPaths!.length} framework paths, ${config.headerSearchPaths!.length} header paths`,
  );

  return config;
}

/**
 * Detect EasyBox structure (.easybox/xcodeprojs).
 * EasyBox is a custom package manager that stores xcodeprojs and headers in:
 *   .easybox/xcodeprojs/
 *     ├── SomeRepo/
 *     │   ├── SomeRepo.xcodeproj/
 *     │   └── Headers/
 *     │       └── Public/
 *     ├── AnotherRepo/
 *     │   ├── AnotherRepo.xcodeproj/
 *     │   └── Headers/
 *     │       └── Public/
 *     └── ...
 *
 * For framework-style imports like <BBAVideoInterface/Header.h>:
 *   - headerSearchPaths: each FrameworkName/Headers/Public for -I flags
 *   - frameworkSearchPaths: the xcodeprojs directory for -F flag (less useful without .framework bundles)
 */
export function detectEasyBox(projectDir: string): Partial<ObjCConfig> & { xcodeprojs: string[] } {
  const config: Partial<ObjCConfig> & { xcodeprojs: string[] } = {
    frameworkSearchPaths: [],
    headerSearchPaths: [],
    xcodeprojs: [],
  };

  const easyboxDir = join(projectDir, '.easybox');
  const xcodeprojsDir = join(easyboxDir, 'xcodeprojs');

  if (!existsSync(xcodeprojsDir)) {
    return config;
  }

  logger.info(`[ObjC Config] Detected EasyBox structure at ${xcodeprojsDir}`);

  // Find all .xcodeproj in subdirectories (depth 2: xcodeprojs/SubDir/SubDir.xcodeproj)
  try {
    const entries = execSync(
      `find "${xcodeprojsDir}" -maxdepth 2 -name "*.xcodeproj" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 10000 },
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    config.xcodeprojs = entries;

    // For each xcodeproj, find its parent directory's Headers/Public folder
    // This enables framework-style imports like <BBAVideoInterface/Header.h>
    for (const proj of entries) {
      // proj is like: .../xcodeprojs/BBAVideoInterface/BBAVideoInterface.xcodeproj
      // Headers should be at: .../xcodeprojs/BBAVideoInterface/Headers/Public/
      const projDir = dirname(proj); // .../xcodeprojs/BBAVideoInterface
      const frameworkName = basename(projDir); // BBAVideoInterface
      const headersPublicDir = join(projDir, 'Headers', 'Public');
      const headersDir = join(projDir, 'Headers');

      // Add Headers/Public for framework-style imports
      if (existsSync(headersPublicDir)) {
        config.headerSearchPaths!.push(headersPublicDir);
        logger.debug(`[ObjC Config] Found Public Headers: ${headersPublicDir}`);
      } else if (existsSync(headersDir)) {
        config.headerSearchPaths!.push(headersDir);
        logger.debug(`[ObjC Config] Found Headers: ${headersDir}`);
      }

      // Also add the project directory itself for local includes
      config.headerSearchPaths!.push(projDir);
    }

    // Add the xcodeprojs directory itself as a framework search path
    // This helps with <FrameworkName/Header.h> style imports when combined with headerSearchPaths
    config.frameworkSearchPaths!.push(xcodeprojsDir);

    logger.info(
      `[ObjC Config] EasyBox: found ${entries.length} xcodeprojs, ` +
        `${config.headerSearchPaths!.length} header paths`,
    );
  } catch (error) {
    logger.warn(`[ObjC Config] Error scanning EasyBox directory: ${error}`);
  }

  return config;
}

/**
 * Generate an ObjC config file from an Xcode project.
 */
export function generateConfigFromXcode(
  projectPath: string,
  outputPath: string,
  options?: {
    scheme?: string;
    target?: string;
  },
): ObjCConfig {
  const projectDir = dirname(projectPath);

  // Start with defaults
  const config: ObjCConfig = { ...DEFAULT_CONFIG };

  // Merge CocoaPods paths
  const podsConfig = detectCocoaPods(projectDir);
  config.frameworkSearchPaths.push(...(podsConfig.frameworkSearchPaths || []));
  config.headerSearchPaths.push(...(podsConfig.headerSearchPaths || []));

  // Merge Xcode settings
  const xcodeConfig = extractXcodeSettings(projectPath, options);
  if (xcodeConfig.frameworkSearchPaths) {
    config.frameworkSearchPaths.push(...xcodeConfig.frameworkSearchPaths);
  }
  if (xcodeConfig.headerSearchPaths) {
    config.headerSearchPaths.push(...xcodeConfig.headerSearchPaths);
  }
  if (xcodeConfig.sdk) {
    config.sdk = xcodeConfig.sdk;
  }
  if (xcodeConfig.target) {
    config.target = xcodeConfig.target;
  }
  if (xcodeConfig.defines) {
    config.defines.push(...xcodeConfig.defines);
  }

  // Deduplicate paths
  config.frameworkSearchPaths = [...new Set(config.frameworkSearchPaths)];
  config.headerSearchPaths = [...new Set(config.headerSearchPaths)];

  // Write config file
  writeFileSync(outputPath, JSON.stringify(config, null, 2));
  logger.info(`[ObjC Config] Written config to ${outputPath}`);

  return config;
}

/**
 * Load an ObjC config file.
 */
export function loadObjCConfig(configPath: string): ObjCConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(content) as ObjCConfig;

  // Merge with defaults
  return {
    ...DEFAULT_CONFIG,
    ...config,
    frameworkSearchPaths: [...(config.frameworkSearchPaths || [])],
    headerSearchPaths: [...(config.headerSearchPaths || [])],
    defines: [...(config.defines || [])],
    otherClangFlags: [...(config.otherClangFlags || [])],
  };
}

/**
 * Find Xcode projects in a directory.
 */
export function findXcodeProjects(dir: string): string[] {
  const projects: string[] = [];

  // Check for workspace first
  const workspaces = execSync(
    `find "${dir}" -maxdepth 2 -name "*.xcworkspace" -not -path "*/.*" 2>/dev/null`,
    {
      encoding: 'utf-8',
    },
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  if (workspaces.length > 0) {
    projects.push(...workspaces);
  }

  // Then check for projects
  const projFiles = execSync(
    `find "${dir}" -maxdepth 2 -name "*.xcodeproj" -not -path "*/.*" 2>/dev/null`,
    {
      encoding: 'utf-8',
    },
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  // Filter out projects that are inside workspaces (like Pods.xcodeproj inside xcworkspace)
  for (const proj of projFiles) {
    const projDir = dirname(proj);
    const isInsideWorkspace = workspaces.some((ws) => projDir.startsWith(dirname(ws)));
    if (!isInsideWorkspace) {
      projects.push(proj);
    }
  }

  return projects;
}

/**
 * Search upward from a starting directory to find the nearest Xcode project.
 * This is useful for multi-repo projects where sub-repos don't contain .xcodeproj.
 *
 * @param startDir - Starting directory (usually the repo root being analyzed)
 * @param maxDepth - Maximum number of parent directories to search (default: 5)
 * @returns Path to the nearest Xcode project/workspace, or null if not found
 */
export function findNearestXcodeProject(startDir: string, maxDepth = 5): string | null {
  let currentDir = resolve(startDir);
  let depth = 0;

  while (depth < maxDepth) {
    // Check for xcworkspace first (preferred for CocoaPods projects)
    const workspaces = findInDir(currentDir, '*.xcworkspace');
    if (workspaces.length > 0) {
      // Filter out Pods.xcworkspace - prefer the main workspace
      const mainWorkspace = workspaces.find((w) => !w.includes('Pods.xcworkspace'));
      if (mainWorkspace) {
        logger.info(`[ObjC Config] Found workspace: ${mainWorkspace}`);
        return mainWorkspace;
      }
      // Fall back to first workspace if no main workspace found
      logger.info(`[ObjC Config] Found workspace: ${workspaces[0]}`);
      return workspaces[0];
    }

    // Then check for xcodeproj
    const projects = findInDir(currentDir, '*.xcodeproj');
    if (projects.length > 0) {
      // Filter out Pods.xcodeproj - prefer the main project
      const mainProject = projects.find((p) => !p.includes('Pods.xcodeproj'));
      if (mainProject) {
        logger.info(`[ObjC Config] Found project: ${mainProject}`);
        return mainProject;
      }
      // Fall back to first project if no main project found
      logger.info(`[ObjC Config] Found project: ${projects[0]}`);
      return projects[0];
    }

    // Move up one directory
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached root directory
      break;
    }
    currentDir = parentDir;
    depth++;
  }

  logger.warn(
    `[ObjC Config] No Xcode project found within ${maxDepth} parent directories of ${startDir}`,
  );
  return null;
}

/**
 * Find files matching a pattern in a directory (non-recursive).
 */
function findInDir(dir: string, pattern: string): string[] {
  try {
    const result = execSync(
      `find "${dir}" -maxdepth 1 -name "${pattern}" -not -path "*/.*" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 },
    );
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Auto-detect and generate ObjC configuration from the nearest Xcode project.
 * This function searches upward from the repo path to find an Xcode project,
 * extracts build settings, and returns a ready-to-use configuration.
 *
 * Detection priority:
 * 1. EasyBox (.easybox/xcodeprojs) - custom package manager structure
 * 2. CocoaPods (Pods/) - standard CocoaPods structure
 * 3. Xcode project settings (via xcodebuild -showBuildSettings)
 *
 * @param repoPath - The repository path being analyzed
 * @param options - Optional settings for scheme, target, etc.
 * @returns ObjCConfig if Xcode project found and settings extracted, null otherwise
 */
export function autoDetectObjCConfig(
  repoPath: string,
  options?: {
    scheme?: string;
    target?: string;
    configuration?: string;
  },
): ObjCConfig | null {
  // Find the nearest Xcode project (shell project)
  const xcodeProject = findNearestXcodeProject(repoPath);

  // Get the project directory (parent of .xcodeproj/.xcworkspace or repo root)
  const projectDir = xcodeProject ? dirname(xcodeProject) : repoPath;

  logger.info(`[ObjC Config] Auto-detecting config for repo: ${repoPath}`);
  if (xcodeProject) {
    logger.info(`[ObjC Config] Found shell project: ${xcodeProject}`);
  }

  // Start with defaults
  const config: ObjCConfig = { ...DEFAULT_CONFIG };

  // 1. Detect EasyBox (priority over CocoaPods)
  const easyboxConfig = detectEasyBox(projectDir);
  if (easyboxConfig.xcodeprojs.length > 0) {
    logger.info(`[ObjC Config] Using EasyBox: ${easyboxConfig.xcodeprojs.length} xcodeprojs`);
    config.frameworkSearchPaths.push(...(easyboxConfig.frameworkSearchPaths || []));
    config.headerSearchPaths.push(...(easyboxConfig.headerSearchPaths || []));

    // Don't extract from each EasyBox xcodeproj (too slow for 1000+ projects)
    // Just use the header paths collected from directory structure
  }

  // 2. Detect CocoaPods (fallback if no EasyBox)
  if (easyboxConfig.xcodeprojs.length === 0) {
    const podsConfig = detectCocoaPods(projectDir);
    config.frameworkSearchPaths.push(...(podsConfig.frameworkSearchPaths || []));
    config.headerSearchPaths.push(...(podsConfig.headerSearchPaths || []));
  }

  // 3. Extract settings from shell Xcode project (if found)
  // This gives us SDK, target arch, and project-specific defines
  if (xcodeProject) {
    try {
      const xcodeConfig = extractXcodeSettings(xcodeProject, options);
      if (xcodeConfig.frameworkSearchPaths) {
        config.frameworkSearchPaths.push(...xcodeConfig.frameworkSearchPaths);
      }
      if (xcodeConfig.headerSearchPaths) {
        config.headerSearchPaths.push(...xcodeConfig.headerSearchPaths);
      }
      if (xcodeConfig.sdk) {
        config.sdk = xcodeConfig.sdk;
      }
      if (xcodeConfig.target) {
        config.target = xcodeConfig.target;
      }
      if (xcodeConfig.defines) {
        config.defines.push(...xcodeConfig.defines);
      }
    } catch (error) {
      logger.warn(`[ObjC Config] Failed to extract settings from ${xcodeProject}: ${error}`);
    }
  }

  // 4. Add the repo path itself as a header search path (for local headers)
  if (existsSync(repoPath)) {
    config.headerSearchPaths.push(repoPath);
  }

  // 5. Deduplicate paths
  config.frameworkSearchPaths = [...new Set(config.frameworkSearchPaths)];
  config.headerSearchPaths = [...new Set(config.headerSearchPaths)];
  config.defines = [...new Set(config.defines)];

  // 6. Check if we found any useful configuration
  if (config.frameworkSearchPaths.length === 0 && config.headerSearchPaths.length === 0) {
    logger.warn('[ObjC Config] No framework or header search paths found');
    return null;
  }

  logger.info(
    `[ObjC Config] Auto-detected: ${config.frameworkSearchPaths.length} framework paths, ` +
      `${config.headerSearchPaths.length} header paths, ${config.defines.length} defines`,
  );

  return config;
}
