/**
 * OC Enhanced Indexer - Architecture Design
 *
 * This module provides enhanced Objective-C indexing capabilities by integrating
 * Clang AST and SourceKit-LSP for precise type inference and call resolution.
 *
 * Architecture:
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                    ObjC Enhanced Indexing                           │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │                                                                     │
 * │  ┌─────────────────┐    ┌─────────────────────────────────────┐    │
 * │  │ tree-sitter-objc │    │ Clang AST + SourceKit-LSP          │    │
 * │  │   (Fast, Basic)  │    │   (Precise, Enhanced)              │    │
 * │  │                  │    │                                     │    │
 * │  │ - Structure      │    │ - Exact types                       │    │
 * │  │ - Imports        │    │ - Call targets                      │    │
 * │  │ - Basic calls    │    │ - Protocol conformance              │    │
 * │  └────────┬────────┘    │ - Category extensions               │    │
 * │           │             └──────────────┬──────────────────────┘    │
 * │           │                            │                           │
 * │           └────────────┬───────────────┘                           │
 * │                        ▼                                            │
 * │             ┌──────────────────────┐                               │
 * │             │  ObjCEnhancedIndexer  │                               │
 * │             │  (Unified Interface)  │                               │
 * │             └──────────────────────┘                               │
 * │                        │                                            │
 * │                        ▼                                            │
 * │             ┌──────────────────────┐                               │
 * │             │   GitNexus Graph     │                               │
 * │             └──────────────────────┘                               │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Integration Points:
 *
 * 1. LanguageProvider Enhancement
 *    - Modify objective-c.ts to use ObjCEnhancedIndexer
 *    - Automatic fallback to tree-sitter when Clang unavailable
 *
 * 2. Pipeline Integration
 *    - Hook into parse phase for enhanced AST
 *    - Hook into cross-file phase for precise imports
 *    - Hook into scope resolution for type inference
 *
 * 3. MCP Tool Enhancement
 *    - context() returns precise caller types
 *    - impact() knows exact method targets
 *    - query() finds related code accurately
 *
 * Key Benefits:
 *
 * - Precise type inference for message expressions
 * - Accurate call target resolution
 * - Protocol and category support
 * - Automatic Xcode environment detection
 * - Zero configuration required
 */

// ── Module Structure ───────────────────────────────────────────────────

export interface ObjCEnhancedConfig {
  /** Enable Clang AST analysis (default: true when available) */
  useClang: boolean;

  /** Enable SourceKit-LSP integration (default: true when available) */
  useSourceKit: boolean;

  /** Path to Clang executable (default: auto-detect) */
  clangPath?: string;

  /** Path to SourceKit-LSP (default: auto-detect) */
  sourceKitPath?: string;

  /** Additional framework paths for Clang */
  frameworkPaths?: string[];

  /** Additional include paths for Clang */
  includePaths?: string[];

  /** Timeout for Clang analysis (ms) */
  timeout?: number;
}

export interface ObjCSymbolInfo {
  /** Symbol name */
  name: string;

  /** Symbol kind: class, method, property, protocol, category */
  kind: 'class' | 'method' | 'property' | 'protocol' | 'category' | 'ivar';

  /** Containing class/interface name */
  containingClass?: string;

  /** Containing category name */
  category?: string;

  /** File path */
  filePath: string;

  /** Position in file */
  position: {
    line: number;
    column: number;
  };

  /** Type information */
  type?: string;

  /** Method selector (for methods) */
  selector?: string;

  /** Super class */
  superClass?: string;

  /** Implemented protocols */
  protocols?: string[];
}

export interface ObjCCallInfo {
  /** Call site file */
  filePath: string;

  /** Call site position */
  position: {
    line: number;
    column: number;
  };

  /** Receiver type (resolved) */
  receiverType: string;

  /** Method selector */
  selector: string;

  /** Target method (resolved) */
  targetMethod?: ObjCSymbolInfo;

  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
}

export interface ObjCEnhancedResult {
  /** Extracted symbols */
  symbols: ObjCSymbolInfo[];

  /** Resolved calls */
  calls: ObjCCallInfo[];

  /** Type mapping: variable -> type */
  typeMap: Map<string, string>;

  /** Whether Clang was used */
  usedClang: boolean;

  /** Whether SourceKit was used */
  usedSourceKit: boolean;

  /** Any errors encountered */
  errors: string[];
}

// ── Export types for consumers ─────────────────────────────────────────

export type {
  ObjCEnhancedConfig as EnhancedConfig,
  ObjCSymbolInfo as SymbolInfo,
  ObjCCallInfo as CallInfo,
  ObjCEnhancedResult as EnhancedResult,
};
