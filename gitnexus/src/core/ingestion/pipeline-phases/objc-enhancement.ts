/**
 * Phase: objc-enhancement
 *
 * Enhances Objective-C symbols with Clang AST and SourceKit-LSP
 * for precise type inference and call resolution.
 *
 * @deps    parse
 * @reads   graph (symbols from parse phase)
 * @writes  enhanced symbols back to graph, CALLS edges for resolved calls
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ParseOutput } from './parse.js';
import { ObjCEnhancedProcessor } from '../objc-enhanced/enhanced-processor.js';
import {
  loadObjCConfig,
  autoDetectObjCConfig,
  type ObjCConfig,
} from '../objc-enhanced/xcode-extractor.js';
import type { ObjCEnhancedConfig } from '../objc-enhanced/types.js';
import { logger } from '../../logger.js';
import { generateId } from '../../../lib/utils.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

/** OC Enhancement phase output */
export interface ObjCEnhancementOutput {
  /** Number of files enhanced */
  filesEnhanced: number;

  /** Number of symbols with improved types */
  symbolsEnhanced: number;

  /** Number of calls with resolved targets */
  callsResolved: number;

  /** Whether enhancement was available */
  enhancementAvailable: boolean;

  /** Total files processed (for progress) */
  totalFiles: number;

  /** Type bindings from Clang: Map<filePath, Map<varName, typeName>> */
  typeBindings: Map<string, Map<string, string>>;
}

/**
 * Check if project has OC files by looking at graph
 */
function hasObjCFilesInGraph(graph: any): boolean {
  let hasObjC = false;
  graph.forEachNode((node: any) => {
    // Check both node.filePath (for File nodes) and node.properties?.filePath (for symbol nodes)
    const filePath = node.filePath || node.properties?.filePath;
    if (filePath && /\.(m|h|mm|M)$/.test(filePath)) {
      hasObjC = true;
    }
  });
  return hasObjC;
}

/**
 * Load ObjC configuration from file path or try auto-detection.
 *
 * Priority:
 * 1. If configPath is provided and file exists -> load from file
 * 2. If configPath is provided but file doesn't exist -> auto-detect and save
 * 3. If no configPath -> auto-detect (no save)
 */
function loadConfig(
  configPath: string | undefined,
  repoPath: string,
  scheme?: string,
): ObjCConfig | null {
  // Case 1: Config file provided and exists
  if (configPath) {
    const absolutePath = resolve(repoPath, configPath);
    if (existsSync(absolutePath)) {
      try {
        logger.info(`[ObjC Enhancement] Loading config from: ${absolutePath}`);
        return loadObjCConfig(absolutePath);
      } catch (error) {
        logger.warn(`[ObjC Enhancement] Failed to load config from ${absolutePath}: ${error}`);
        // Fall through to auto-detection
      }
    }
  }

  // Case 2 & 3: Auto-detect from nearest Xcode project
  logger.info('[ObjC Enhancement] Auto-detecting Xcode project settings...');
  const config = autoDetectObjCConfig(repoPath, scheme ? { scheme } : undefined);

  if (!config) {
    logger.info('[ObjC Enhancement] No Xcode project found, using default Clang settings');
    return null;
  }

  // If configPath was provided but file didn't exist, save the auto-detected config
  if (configPath) {
    const absolutePath = resolve(repoPath, configPath);
    try {
      const { writeFileSync } = require('node:fs');
      writeFileSync(absolutePath, JSON.stringify(config, null, 2));
      logger.info(`[ObjC Enhancement] Saved auto-detected config to: ${absolutePath}`);
    } catch (error) {
      logger.warn(`[ObjC Enhancement] Failed to save config to ${absolutePath}: ${error}`);
    }
  }

  return config;
}

/**
 * Convert ObjCConfig to ClangIndexer config format
 */
function toClangConfig(config: ObjCConfig): Partial<ObjCEnhancedConfig> {
  // Resolve SDK path if sdk type is specified
  let sdkPath: string | undefined;
  if (config.sdk?.type) {
    try {
      sdkPath = execSync(`xcrun --sdk ${config.sdk.type} --show-sdk-path`, {
        encoding: 'utf-8',
      }).trim();
      logger.info(`[ObjC Enhancement] Resolved SDK path: ${sdkPath}`);
    } catch (error) {
      logger.warn(`[ObjC Enhancement] Failed to resolve SDK path: ${error}`);
    }
  }

  return {
    frameworkPaths: config.frameworkSearchPaths,
    includePaths: config.headerSearchPaths,
    defines: config.defines,
    otherFlags: config.otherClangFlags,
    timeout: config.timeout,
    sdkPath,
  };
}

export const objcEnhancementPhase: PipelinePhase<ObjCEnhancementOutput> = {
  name: 'objc-enhancement',
  deps: ['parse'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<ObjCEnhancementOutput> {
    const output: ObjCEnhancementOutput = {
      filesEnhanced: 0,
      symbolsEnhanced: 0,
      callsResolved: 0,
      enhancementAvailable: false,
      totalFiles: 0,
      typeBindings: new Map(),
    };

    // Get parse output for file paths
    const parseOutput = getPhaseOutput<ParseOutput>(deps, 'parse');
    output.totalFiles = parseOutput.totalFiles;

    // Check if we have OC files
    if (!hasObjCFilesInGraph(ctx.graph)) {
      logger.debug('[ObjC Enhancement] No OC files found, skipping');
      return output;
    }

    // Count OC files
    const ocFiles = parseOutput.allPaths.filter((f) => /\.(m|h|mm|M)$/.test(f));
    if (ocFiles.length === 0) {
      return output;
    }

    logger.info(`[ObjC Enhancement] Found ${ocFiles.length} OC files`);

    ctx.onProgress({
      phase: 'enriching', // Use 'enriching' phase for OC enhancement
      percent: 55,
      message: 'Enhancing Objective-C symbols with Clang...',
      stats: { filesProcessed: 0, totalFiles: ocFiles.length, nodesCreated: ctx.graph.nodeCount },
    });

    // Load configuration if provided
    const objcConfigPath = ctx.options?.objcConfigPath;
    const objcScheme = ctx.options?.objcScheme;
    const config = loadConfig(objcConfigPath, ctx.repoPath, objcScheme);

    if (config) {
      logger.info(
        `[ObjC Enhancement] Using config with ${config.frameworkSearchPaths.length} framework paths, ${config.headerSearchPaths.length} header paths`,
      );
    }

    // Initialize the processor with config
    const clangConfig = config ? toClangConfig(config) : undefined;
    const processor = new ObjCEnhancedProcessor(clangConfig);
    output.enhancementAvailable = await processor.initialize();

    if (!output.enhancementAvailable) {
      logger.info('[ObjC Enhancement] Clang not available, using tree-sitter results');
      return output;
    }

    // Read OC files and process them
    const fs = await import('node:fs/promises');
    let processedCount = 0;
    let callsEdgesCreated = 0;

    // Build a lookup map for method nodes by class
    const methodLookup = new Map<string, string>(); // "ClassName.methodName" -> nodeId
    ctx.graph.forEachNode((node: any) => {
      if (node.label === 'Method' && node.properties?.name) {
        // Extract class name from nodeId (format: "Method:filePath:ClassName:methodName#num")
        const parts = node.id.split(':');
        if (parts.length >= 3) {
          const className = parts[2];
          const methodKey = `${className}.${node.properties.name}`;
          if (!methodLookup.has(methodKey)) {
            methodLookup.set(methodKey, node.id);
          }
        }
      }
    });

    for (const filePath of ocFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');

        // Get symbols from graph for this file
        const fileSymbols: any[] = [];
        const fileNodes = new Map<string, any>(); // nodeId -> node
        ctx.graph.forEachNode((node: any) => {
          if (node.properties?.filePath === filePath) {
            fileSymbols.push(node);
            fileNodes.set(node.id, node);
          }
        });

        // Process the file
        const result = await processor.processFile(filePath, content, fileSymbols);

        if (result.enhancementUsed) {
          output.filesEnhanced++;
          output.symbolsEnhanced += result.enhancedSymbols.size;
          output.callsResolved += result.resolvedCalls.size;

          // Store type bindings for downstream phases (scope resolution)
          for (const [fp, types] of result.enhancedTypeBindings) {
            output.typeBindings.set(fp, types);
          }

          // Create CALLS edges from resolved calls
          for (const [callKey, targets] of result.resolvedCalls) {
            // callKey format: "filePath:line:selector"
            const [callFile, callLine, selector] = callKey.split(':');

            // Find the source node (method containing this call)
            let sourceNodeId: string | null = null;
            for (const [nodeId, node] of fileNodes) {
              if (node.label === 'Method') {
                const startLine = node.properties?.startLine;
                const endLine = node.properties?.endLine;
                const line = parseInt(callLine, 10);
                if (startLine && endLine && line >= startLine && line <= endLine) {
                  sourceNodeId = nodeId;
                  break;
                }
              }
            }

            if (!sourceNodeId) continue;

            // Find target methods
            for (const target of targets) {
              // target format: "ClassName.methodName"
              const targetNodeId = methodLookup.get(target);
              if (targetNodeId) {
                // Create CALLS edge
                const edgeId = generateId('CALLS', `${sourceNodeId}:${selector}->${targetNodeId}`);
                try {
                  ctx.graph.addRelationship({
                    id: edgeId,
                    type: 'CALLS',
                    sourceId: sourceNodeId,
                    targetId: targetNodeId,
                    confidence: 0.9, // High confidence from Clang
                    reason: 'clang-ast-resolution',
                  });
                  callsEdgesCreated++;
                } catch {
                  // Edge may already exist
                }
              }
            }
          }
        }

        processedCount++;
      } catch (error) {
        logger.debug(`[ObjC Enhancement] Error processing ${filePath}: ${error}`);
      }
    }

    ctx.onProgress({
      phase: 'enriching', // Use 'enriching' phase for OC enhancement
      percent: 60,
      message: 'Objective-C enhancement complete',
      stats: {
        filesProcessed: processedCount,
        totalFiles: ocFiles.length,
        nodesCreated: ctx.graph.nodeCount,
      },
    });

    logger.info(
      `[ObjC Enhancement] Enhanced ${output.symbolsEnhanced} symbols, created ${callsEdgesCreated} CALLS edges in ${output.filesEnhanced} files`,
    );

    return output;
  },
};
