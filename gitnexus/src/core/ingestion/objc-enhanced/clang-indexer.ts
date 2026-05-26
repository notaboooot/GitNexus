/**
 * Clang AST Indexer for Objective-C
 *
 * Uses Clang to parse Objective-C files and extract precise symbol information
 * including types, method signatures, and call relationships.
 *
 * Requirements:
 * - Clang must be available (auto-detected on macOS with Xcode)
 * - No compilation needed, uses -fsyntax-only
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ObjCSymbolInfo,
  ObjCCallInfo,
  ObjCEnhancedResult,
  ObjCEnhancedConfig,
} from './types.js';

/**
 * Detect Clang and Xcode environment.
 */
export function detectClangEnvironment(): {
  available: boolean;
  clangPath: string;
  xcodePath: string;
  sdkPath: string;
  frameworks: string[];
} {
  try {
    // Get Xcode developer directory
    const xcodePath = execSync('xcode-select -p', { encoding: 'utf-8' }).trim();

    // Get SDK path
    const sdkPath = execSync('xcrun --show-sdk-path', { encoding: 'utf-8' }).trim();

    // Get Clang path
    const clangPath = execSync('xcrun -f clang', { encoding: 'utf-8' }).trim();

    // Standard framework paths
    const frameworks = [
      join(sdkPath, 'System/Library/Frameworks'),
      join(
        xcodePath,
        'Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/System/Library/Frameworks',
      ),
    ].filter(existsSync);

    return {
      available: true,
      clangPath,
      xcodePath,
      sdkPath,
      frameworks,
    };
  } catch {
    return {
      available: false,
      clangPath: '',
      xcodePath: '',
      sdkPath: '',
      frameworks: [],
    };
  }
}

/**
 * Clang AST Indexer
 */
export class ClangIndexer {
  private config: ObjCEnhancedConfig;
  private env: ReturnType<typeof detectClangEnvironment>;

  constructor(config: Partial<ObjCEnhancedConfig> = {}) {
    this.config = {
      useClang: true,
      useSourceKit: true,
      timeout: 30000,
      ...config,
    };
    this.env = detectClangEnvironment();
  }

  /**
   * Check if Clang is available.
   */
  isAvailable(): boolean {
    return this.env.available && this.config.useClang;
  }

  /**
   * Parse an Objective-C file and extract symbols.
   */
  async parseFile(filePath: string, content?: string): Promise<ObjCEnhancedResult> {
    const result: ObjCEnhancedResult = {
      symbols: [],
      calls: [],
      typeMap: new Map(),
      usedClang: false,
      usedSourceKit: false,
      errors: [],
    };

    if (!this.isAvailable()) {
      result.errors.push('Clang not available');
      return result;
    }

    try {
      // Run Clang AST dump
      const astOutput = this.runClangAst(filePath, content);

      // Parse AST output
      const symbols = this.parseAstForSymbols(astOutput, filePath);
      result.symbols = symbols;
      result.usedClang = true;

      // Extract type information
      this.extractTypes(astOutput, result.typeMap);

      // Extract call relationships
      const calls = this.parseAstForCalls(astOutput, filePath);
      result.calls = calls;
    } catch (error) {
      result.errors.push(`Clang error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Run Clang and get AST output.
   */
  private runClangAst(filePath: string, content?: string): string {
    const args = [
      '-Xclang',
      '-ast-dump',
      '-fsyntax-only',
      '-fno-color-diagnostics',
      '-Wno-everything', // Suppress all warnings
      '-Wno-objc-root-class',
      '-x',
      'objective-c',
    ];

    // Add SDK and framework paths
    if (this.env.sdkPath) {
      args.push('-isysroot', this.env.sdkPath);
    }

    // Add common frameworks
    for (const fw of this.config.frameworkPaths || this.env.frameworks.slice(0, 1)) {
      args.push('-F', fw);
    }

    // Add include paths
    for (const inc of this.config.includePaths || []) {
      args.push('-I', inc);
    }

    // Add user-provided clang path or use detected one
    const clangPath = this.config.clangPath || this.env.clangPath;

    const fullArgs = [...args, filePath];

    try {
      const output = execSync(`"${clangPath}" ${fullArgs.join(' ')}`, {
        encoding: 'utf-8',
        timeout: this.config.timeout,
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large files
      });
      return output;
    } catch (error: any) {
      // Clang may return non-zero but still produce valid AST
      if (error.stdout) {
        return error.stdout;
      }
      throw error;
    }
  }

  /**
   * Parse Clang AST output for Objective-C symbols.
   */
  private parseAstForSymbols(astOutput: string, filePath: string): ObjCSymbolInfo[] {
    const symbols: ObjCSymbolInfo[] = [];
    const lines = astOutput.split('\n');

    let currentClass = '';
    let currentCategory = '';

    for (const line of lines) {
      // Parse ObjCInterfaceDecl (class declaration)
      const classMatch = line.match(/ObjCInterfaceDecl.*?(\w+)\s+'(\w+)'/);
      if (classMatch) {
        const className = classMatch[2];
        const superClassMatch = line.match(/super ObjCInterface '(\w+)'/);
        const protocols = this.extractProtocols(line);

        symbols.push({
          name: className,
          kind: 'class',
          filePath,
          position: this.extractPosition(line),
          superClass: superClassMatch?.[1],
          protocols: protocols.length > 0 ? protocols : undefined,
        });
        currentClass = className;
        currentCategory = '';
        continue;
      }

      // Parse ObjCCategoryDecl (category declaration)
      const categoryMatch = line.match(/ObjCCategoryDecl.*?(\w+)\s+\((\w+)\)/);
      if (categoryMatch) {
        const className = categoryMatch[1];
        const categoryName = categoryMatch[2];
        currentClass = className;
        currentCategory = categoryName;
        continue;
      }

      // Parse ObjCProtocolDecl (protocol declaration)
      const protocolMatch = line.match(/ObjCProtocolDecl.*?(\w+)/);
      if (protocolMatch) {
        const protocolName = protocolMatch[1];
        if (!this.isSystemSymbol(protocolName)) {
          symbols.push({
            name: protocolName,
            kind: 'protocol',
            filePath,
            position: this.extractPosition(line),
          });
        }
        continue;
      }

      // Parse ObjCMethodDecl (method declaration)
      const methodMatch = line.match(/ObjCMethodDecl.*?([-+])\s+(\S+)\s+'([^']+)'/);
      if (methodMatch) {
        const isClassMethod = methodMatch[1] === '+';
        const selector = methodMatch[2];
        const returnType = methodMatch[3];

        // Skip system methods
        if (!this.isSystemMethod(selector)) {
          symbols.push({
            name: this.selectorToMethodName(selector),
            kind: 'method',
            containingClass: currentClass || undefined,
            category: currentCategory || undefined,
            filePath,
            position: this.extractPosition(line),
            type: returnType,
            selector: selector,
          });
        }
        continue;
      }

      // Parse ObjCPropertyDecl (property declaration)
      const propertyMatch = line.match(/ObjCPropertyDecl.*?(\w+)\s+'([^']+)'/);
      if (propertyMatch) {
        const propName = propertyMatch[1];
        const propType = propertyMatch[2];

        symbols.push({
          name: propName,
          kind: 'property',
          containingClass: currentClass || undefined,
          filePath,
          position: this.extractPosition(line),
          type: propType,
        });
        continue;
      }
    }

    return symbols;
  }

  /**
   * Parse Clang AST for call relationships.
   */
  private parseAstForCalls(astOutput: string, filePath: string): ObjCCallInfo[] {
    const calls: ObjCCallInfo[] = [];
    const lines = astOutput.split('\n');

    // Build type map from declarations
    const typeMap = new Map<string, string>();
    for (const line of lines) {
      // Variable declarations
      const varMatch = line.match(/VarDecl.*?(\w+)\s+'([^']+)'/);
      if (varMatch) {
        typeMap.set(varMatch[1], varMatch[2]);
      }

      // Property access
      const propMatch = line.match(/MemberExpr.*?\.(\w+)/);
      if (propMatch) {
        // Could be property access
      }
    }

    for (const line of lines) {
      // Parse ObjCMessageExpr (message expression / method call)
      const messageMatch = line.match(/ObjCMessageExpr.*?(\w+)/);
      if (messageMatch) {
        const selector = messageMatch[1];

        // Try to find receiver type
        const receiverMatch = line.match(/receiver\s+type\s+'([^']+)'/);
        const receiverType = receiverMatch?.[1] || 'id';

        calls.push({
          filePath,
          position: this.extractPosition(line),
          receiverType,
          selector,
          confidence: receiverType !== 'id' ? 'high' : 'medium',
        });
      }
    }

    return calls;
  }

  /**
   * Extract type information from AST.
   */
  private extractTypes(astOutput: string, typeMap: Map<string, string>): void {
    const lines = astOutput.split('\n');

    for (const line of lines) {
      // Variable declarations
      const varMatch = line.match(/VarDecl.*?(\w+)\s+'([^']+)'/);
      if (varMatch) {
        const varName = varMatch[1];
        const typeName = this.cleanTypeName(varMatch[2]);
        if (varName && typeName && !varName.startsWith('_')) {
          typeMap.set(varName, typeName);
        }
      }

      // Property declarations
      const propMatch = line.match(/ObjCPropertyDecl.*?(\w+)\s+'([^']+)'/);
      if (propMatch) {
        const propName = propMatch[1];
        const typeName = this.cleanTypeName(propMatch[2]);
        if (propName && typeName) {
          typeMap.set(propName, typeName);
        }
      }

      // Parameters
      const paramMatch = line.match(/ParmVarDecl.*?(\w+)\s+'([^']+)'/);
      if (paramMatch) {
        const paramName = paramMatch[1];
        const typeName = this.cleanTypeName(paramMatch[2]);
        if (paramName && typeName) {
          typeMap.set(paramName, typeName);
        }
      }
    }
  }

  /**
   * Extract position from AST line.
   */
  private extractPosition(line: string): { line: number; column: number } {
    const posMatch = line.match(/<line:(\d+):(\d+)/);
    if (posMatch) {
      return {
        line: parseInt(posMatch[1], 10),
        column: parseInt(posMatch[2], 10),
      };
    }
    return { line: 0, column: 0 };
  }

  /**
   * Extract protocols from AST line.
   */
  private extractProtocols(line: string): string[] {
    const protocols: string[] = [];
    const protocolMatches = line.matchAll(/ObjCProtocol\s+'(\w+)'/g);
    for (const match of protocolMatches) {
      protocols.push(match[1]);
    }
    return protocols;
  }

  /**
   * Clean type name (remove pointers, etc.)
   */
  private cleanTypeName(type: string): string {
    return type
      .replace(/\s*\*\s*/g, '*')
      .replace(/\s*const\s*/g, '')
      .replace(/\s*__strong\s*/g, '')
      .replace(/\s*__weak\s*/g, '')
      .trim();
  }

  /**
   * Convert selector to method name.
   */
  private selectorToMethodName(selector: string): string {
    return selector.split(':').filter(Boolean).join('_');
  }

  /**
   * Check if symbol is a system symbol.
   */
  private isSystemSymbol(name: string): boolean {
    const systemPrefixes = ['NS', 'UI', 'CG', 'CF', 'CA', 'MK', 'SK', 'WK', 'CL', 'AV', 'MP'];
    return systemPrefixes.some((prefix) => name.startsWith(prefix));
  }

  /**
   * Check if method is a system method.
   */
  private isSystemMethod(selector: string): boolean {
    const systemMethods = [
      'init',
      'dealloc',
      'alloc',
      'new',
      'copy',
      'mutableCopy',
      'retain',
      'release',
      'autorelease',
      'description',
      'debugDescription',
      'hash',
      'isEqual:',
      'class',
      'superclass',
      'self',
      'performSelector:',
    ];
    return systemMethods.some((m) => selector === m || selector.startsWith(m + ':'));
  }
}

// Export singleton instance
export const clangIndexer = new ClangIndexer();
