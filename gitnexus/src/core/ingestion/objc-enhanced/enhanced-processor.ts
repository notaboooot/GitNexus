/**
 * Objective-C Enhanced Processor
 *
 * Post-processing step that enhances OC symbols with Clang AST
 * and SourceKit-LSP information for precise type inference.
 *
 * Integration with GitNexus Pipeline:
 * 1. tree-sitter parses OC files (fast, basic structure)
 * 2. This processor runs as a post-processing step
 * 3. Clang/SourceKit enhance the basic results
 */

import type { SymbolDefinition } from 'gitnexus-shared';
import type { ObjCEnhancedResult } from './types.js';
import { ClangIndexer } from './clang-indexer.js';
import { logger } from '../../logger.js';

/**
 * Result of OC enhancement processing
 */
export interface ObjCEnhancementOutput {
  /** Enhanced symbols with precise types */
  enhancedSymbols: Map<string, SymbolDefinition>;

  /** Enhanced type bindings */
  enhancedTypeBindings: Map<string, Map<string, string>>;

  /** Call relationships with resolved targets */
  resolvedCalls: Map<string, string[]>;

  /** Whether enhancement was actually used */
  enhancementUsed: boolean;
}

/**
 * OC Enhanced Processor
 *
 * Processes OC files after tree-sitter parsing to add:
 * - Precise type information from Clang
 * - Resolved call targets
 * - Better protocol/category handling
 */
export class ObjCEnhancedProcessor {
  private clangIndexer: ClangIndexer;
  private initialized = false;

  constructor() {
    this.clangIndexer = new ClangIndexer();
  }

  /**
   * Initialize the processor (check if Clang is available)
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    const available = this.clangIndexer.isAvailable();
    if (available) {
      logger.info('[ObjC Enhanced] Clang AST indexer available');
    } else {
      logger.info('[ObjC Enhanced] Clang not available, using tree-sitter only');
    }

    this.initialized = true;
    return available;
  }

  /**
   * Process a single OC file and return enhanced results
   */
  async processFile(
    filePath: string,
    content: string,
    existingSymbols: SymbolDefinition[],
  ): Promise<ObjCEnhancementOutput> {
    const output: ObjCEnhancementOutput = {
      enhancedSymbols: new Map(),
      enhancedTypeBindings: new Map(),
      resolvedCalls: new Map(),
      enhancementUsed: false,
    };

    // Check if this is an OC file
    if (!this.isObjCFile(filePath)) {
      return output;
    }

    // Check if Clang is available
    if (!this.clangIndexer.isAvailable()) {
      return output;
    }

    try {
      // Run Clang AST analysis
      const clangResult = await this.clangIndexer.parseFile(filePath, content);

      if (clangResult.usedClang) {
        output.enhancementUsed = true;

        // Merge enhanced symbols with existing ones
        for (const symbol of existingSymbols) {
          const enhanced = this.findEnhancedSymbol(symbol, clangResult);
          if (enhanced) {
            output.enhancedSymbols.set(symbol.nodeId, {
              ...symbol,
              // Add enhanced type information
              declaredType: enhanced.type || symbol.declaredType,
            });
          }
        }

        // Store type bindings for scope resolution
        const fileTypes = new Map<string, string>();
        for (const [varName, typeName] of clangResult.typeMap) {
          fileTypes.set(varName, typeName);
        }
        output.enhancedTypeBindings.set(filePath, fileTypes);

        // Store resolved calls
        for (const call of clangResult.calls) {
          const key = `${filePath}:${call.position.line}:${call.selector}`;
          if (!output.resolvedCalls.has(key)) {
            output.resolvedCalls.set(key, []);
          }
          if (call.receiverType && call.receiverType !== 'id') {
            output.resolvedCalls.get(key)!.push(`${call.receiverType}.${call.selector}`);
          }
        }
      }
    } catch (error) {
      // Log error but don't fail - fall back to tree-sitter results
      logger.debug(`[ObjC Enhanced] Error processing ${filePath}: ${error}`);
    }

    return output;
  }

  /**
   * Process multiple OC files in parallel
   */
  async processFiles(
    files: Array<{ path: string; content: string; symbols: SymbolDefinition[] }>,
    concurrency = 4,
  ): Promise<ObjCEnhancementOutput> {
    const output: ObjCEnhancementOutput = {
      enhancedSymbols: new Map(),
      enhancedTypeBindings: new Map(),
      resolvedCalls: new Map(),
      enhancementUsed: false,
    };

    // Process files in batches
    const batches = this.chunk(files, concurrency);

    for (const batch of batches) {
      const results = await Promise.all(
        batch.map((f) => this.processFile(f.path, f.content, f.symbols)),
      );

      for (const result of results) {
        if (result.enhancementUsed) {
          output.enhancementUsed = true;
        }
        // Merge results
        for (const [key, value] of result.enhancedSymbols) {
          output.enhancedSymbols.set(key, value);
        }
        for (const [key, value] of result.enhancedTypeBindings) {
          output.enhancedTypeBindings.set(key, value);
        }
        for (const [key, value] of result.resolvedCalls) {
          output.resolvedCalls.set(key, value);
        }
      }
    }

    return output;
  }

  /**
   * Enhance type resolution for a variable
   */
  enhanceTypeResolution(
    filePath: string,
    variableName: string,
    existingType: string | undefined,
    typeBindings: Map<string, Map<string, string>>,
  ): string | undefined {
    const fileTypes = typeBindings.get(filePath);
    if (!fileTypes) return existingType;

    const enhancedType = fileTypes.get(variableName);
    return enhancedType || existingType;
  }

  /**
   * Find enhanced symbol info from Clang result
   */
  private findEnhancedSymbol(
    symbol: SymbolDefinition,
    clangResult: ObjCEnhancedResult,
  ): ObjCEnhancedResult['symbols'][0] | undefined {
    // Match by nodeId and kind
    // Extract name from nodeId (format: "filePath:symbolName:line:col")
    const symbolName = symbol.nodeId.split(':')[1] || '';

    return clangResult.symbols.find((s) => {
      if (s.name !== symbolName) return false;

      // Match kind
      const kindMap: Record<string, string> = {
        class: 'Class',
        method: 'Method',
        property: 'Property',
        protocol: 'Interface',
        category: 'Class',
      };

      return kindMap[s.kind] === symbol.type;
    });
  }

  /**
   * Check if file is an OC file
   */
  private isObjCFile(filePath: string): boolean {
    return /\.(m|h|mm|M)$/.test(filePath);
  }

  /**
   * Chunk array into batches
   */
  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}

// Export singleton
export const objcEnhancedProcessor = new ObjCEnhancedProcessor();
