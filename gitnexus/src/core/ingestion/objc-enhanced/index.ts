/**
 * Objective-C Enhanced Indexer
 *
 * Main entry point for OC enhanced indexing capabilities.
 * Provides seamless integration with GitNexus LanguageProvider.
 *
 * Usage:
 *   import { objcEnhancedIndexer } from './objc-enhanced/index.js';
 *
 *   // Automatic: Clang and SourceKit are used when available
 *   const result = await objcEnhancedIndexer.indexFile(file, content);
 */

export { ClangIndexer, clangIndexer, detectClangEnvironment } from './clang-indexer.js';
export {
  SourceKitClient,
  ObjCEnhancedIndexer,
  sourceKitClient,
  objcEnhancedIndexer,
} from './sourcekit-client.js';
export type {
  ObjCEnhancedConfig as EnhancedConfig,
  ObjCSymbolInfo as SymbolInfo,
  ObjCCallInfo as CallInfo,
  ObjCEnhancedResult as EnhancedResult,
} from './types.js';

/**
 * Check if enhanced OC indexing is available.
 */
export async function isEnhancedIndexingAvailable(): Promise<{
  clang: boolean;
  sourceKit: boolean;
}> {
  const { detectClangEnvironment } = await import('./clang-indexer.js');
  const { SourceKitClient } = await import('./sourcekit-client.js');

  const clangEnv = detectClangEnvironment();
  const sourceKitClient = new SourceKitClient();
  const sourceKitAvailable = await sourceKitClient.isAvailable();

  return {
    clang: clangEnv.available,
    sourceKit: sourceKitAvailable,
  };
}

/**
 * Initialize enhanced OC indexing for a project.
 * Call this once before indexing starts.
 */
export async function initializeEnhancedIndexing(projectRoot: string): Promise<boolean> {
  const { objcEnhancedIndexer } = await import('./sourcekit-client.js');
  return objcEnhancedIndexer.initialize(projectRoot);
}
