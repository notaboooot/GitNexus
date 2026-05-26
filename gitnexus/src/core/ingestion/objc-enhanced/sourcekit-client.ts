/**
 * SourceKit-LSP Client for Objective-C
 *
 * Provides LSP-based enhancements for Objective-C:
 * - Precise type inference
 * - Go to definition
 * - Find references
 * - Hover information
 *
 * Uses the sourcekit-lsp binary included with Xcode.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { logger } from '../../logger.js';
import type { ObjCSymbolInfo, ObjCEnhancedResult, ObjCEnhancedConfig } from './types.js';

/**
 * LSP Message types
 */
interface LSPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params: any;
}

interface LSPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

interface LSPNotification {
  jsonrpc: '2.0';
  method: string;
  params: any;
}

/**
 * Position in a document
 */
interface Position {
  line: number;
  character: number;
}

/**
 * Range in a document
 */
interface Range {
  start: Position;
  end: Position;
}

/**
 * Location with URI and range
 */
interface Location {
  uri: string;
  range: Range;
}

/**
 * Symbol information from LSP
 */
interface LSPSymbolInfo {
  name: string;
  kind: number;
  location: Location;
  containerName?: string;
}

/**
 * SourceKit-LSP Client
 */
export class SourceKitClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
    }
  >();
  private buffer = '';
  private initialized = false;
  private config: ObjCEnhancedConfig;
  private sourceKitPath: string = '';

  constructor(config: Partial<ObjCEnhancedConfig> = {}) {
    super();
    this.config = {
      useClang: true,
      useSourceKit: true,
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Check if SourceKit-LSP is available.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config.useSourceKit) return false;

    try {
      // Find sourcekit-lsp
      const { execSync } = await import('node:child_process');
      this.sourceKitPath = execSync('xcrun -f sourcekit-lsp', { encoding: 'utf-8' }).trim();
      return existsSync(this.sourceKitPath);
    } catch {
      return false;
    }
  }

  /**
   * Start the SourceKit-LSP server.
   */
  async start(projectRoot: string): Promise<boolean> {
    if (this.process) return true;

    if (!(await this.isAvailable())) {
      logger.warn('[SourceKit] sourcekit-lsp not available');
      return false;
    }

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.sourceKitPath, [], {
          cwd: projectRoot,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleData(data.toString());
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          logger.debug(`[SourceKit] stderr: ${data.toString()}`);
        });

        this.process.on('error', (error) => {
          logger.error(`[SourceKit] process error: ${error.message}`);
          this.emit('error', error);
        });

        this.process.on('exit', (code) => {
          logger.debug(`[SourceKit] process exited with code ${code}`);
          this.process = null;
          this.initialized = false;
        });

        // Initialize the LSP connection
        this.initialize(projectRoot)
          .then(() => resolve(true))
          .catch((err) => {
            logger.error(`[SourceKit] initialization failed: ${err.message}`);
            resolve(false);
          });
      } catch (error) {
        logger.error(`[SourceKit] failed to start: ${error}`);
        resolve(false);
      }
    });
  }

  /**
   * Stop the SourceKit-LSP server.
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      this.process.on('exit', () => {
        this.process = null;
        this.initialized = false;
        resolve();
      });

      // Send shutdown request
      this.sendRequest('shutdown', {})
        .catch(() => {})
        .then(() => {
          this.sendNotification('exit', {});
        });
    });
  }

  /**
   * Initialize the LSP connection.
   */
  private async initialize(rootPath: string): Promise<void> {
    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: `file://${rootPath}`,
      capabilities: {
        textDocument: {
          definition: { linkSupport: true },
          references: true,
          hover: { contentFormat: ['markdown', 'plaintext'] },
          documentSymbol: true,
        },
      },
    });

    if (result) {
      this.initialized = true;
      await this.sendNotification('initialized', {});
      logger.info('[SourceKit] LSP initialized');
    }
  }

  /**
   * Open a document for analysis.
   */
  async openDocument(filePath: string, content: string): Promise<void> {
    if (!this.initialized) return;

    await this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: `file://${filePath}`,
        languageId: 'objective-c',
        version: 1,
        text: content,
      },
    });
  }

  /**
   * Get hover information at a position.
   */
  async getHover(filePath: string, line: number, character: number): Promise<any> {
    if (!this.initialized) return null;

    return this.sendRequest('textDocument/hover', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
    });
  }

  /**
   * Go to definition at a position.
   */
  async getDefinition(
    filePath: string,
    line: number,
    character: number,
  ): Promise<Location | Location[] | null> {
    if (!this.initialized) return null;

    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
    });

    return result;
  }

  /**
   * Find all references to a symbol.
   */
  async getReferences(filePath: string, line: number, character: number): Promise<Location[]> {
    if (!this.initialized) return [];

    const result = await this.sendRequest('textDocument/references', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
      context: { includeDeclaration: true },
    });

    return result || [];
  }

  /**
   * Get document symbols.
   */
  async getDocumentSymbols(filePath: string): Promise<LSPSymbolInfo[]> {
    if (!this.initialized) return [];

    const result = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: `file://${filePath}` },
    });

    // Convert SymbolInformation[] to our format
    if (Array.isArray(result)) {
      return result.map((s: any) => ({
        name: s.name,
        kind: s.kind,
        location: s.location,
        containerName: s.containerName,
      }));
    }

    return [];
  }

  /**
   * Resolve type at position.
   */
  async resolveType(filePath: string, line: number, character: number): Promise<string | null> {
    const hover = await this.getHover(filePath, line, character);
    if (!hover?.contents) return null;

    // Extract type from hover contents
    if (typeof hover.contents === 'string') {
      return this.extractTypeFromHover(hover.contents);
    }

    if (Array.isArray(hover.contents)) {
      for (const content of hover.contents) {
        const type = this.extractTypeFromHover(
          typeof content === 'string' ? content : content.value || '',
        );
        if (type) return type;
      }
    }

    return null;
  }

  /**
   * Extract type from hover text.
   */
  private extractTypeFromHover(hoverText: string): string | null {
    // Try to match type patterns
    const patterns = [
      /type:\s*(\w+(?:\s*\*)?)/i,
      /(\w+(?:\s*\*)?)\s+\w+\s*$/, // Type at end
      /^(\w+(?:\s*\*)?)\s*$/, // Just type
    ];

    for (const pattern of patterns) {
      const match = hoverText.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Send an LSP request.
   */
  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const message: LSPRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.sendMessage(message);

      // Timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, this.config.timeout || 30000);
    });
  }

  /**
   * Send an LSP notification.
   */
  private sendNotification(method: string, params: any): Promise<void> {
    const message: LSPNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.sendMessage(message);
    return Promise.resolve();
  }

  /**
   * Send an LSP message.
   */
  private sendMessage(message: LSPRequest | LSPNotification): void {
    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;

    this.process?.stdin?.write(header + content);
  }

  /**
   * Handle incoming data from SourceKit-LSP.
   */
  private handleData(data: string): void {
    this.buffer += data;

    while (true) {
      // Find message boundary
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      // Parse Content-Length
      const header = this.buffer.slice(0, headerEnd);
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) break;

      const contentLength = parseInt(lengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) break;

      // Extract and parse message
      const messageContent = this.buffer.slice(messageStart, messageEnd);
      this.buffer = this.buffer.slice(messageEnd);

      try {
        const message = JSON.parse(messageContent);
        this.handleMessage(message);
      } catch (error) {
        logger.error(`[SourceKit] failed to parse message: ${error}`);
      }
    }
  }

  /**
   * Handle an LSP message.
   */
  private handleMessage(message: LSPResponse | LSPNotification): void {
    if ('id' in message) {
      // Response
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if ('method' in message) {
      // Notification
      this.emit(message.method, message.params);
    }
  }
}

/**
 * Enhanced indexer that combines Clang AST and SourceKit-LSP.
 */
export class ObjCEnhancedIndexer {
  private clangIndexer: typeof import('./clang-indexer.js').clangIndexer;
  private sourceKitClient: SourceKitClient;
  private initialized = false;

  constructor(config: Partial<ObjCEnhancedConfig> = {}) {
    this.sourceKitClient = new SourceKitClient(config);
    // Dynamic import to avoid circular dependency
    import('./clang-indexer.js').then((m) => {
      this.clangIndexer = m.clangIndexer;
    });
  }

  /**
   * Initialize the enhanced indexer.
   */
  async initialize(projectRoot: string): Promise<boolean> {
    if (this.initialized) return true;

    // Start SourceKit-LSP
    const sourceKitAvailable = await this.sourceKitClient.start(projectRoot);

    this.initialized = true;
    logger.info(`[ObjC Enhanced] Initialized (SourceKit: ${sourceKitAvailable})`);

    return true;
  }

  /**
   * Index an Objective-C file with enhanced capabilities.
   */
  async indexFile(filePath: string, content: string): Promise<ObjCEnhancedResult> {
    const result: ObjCEnhancedResult = {
      symbols: [],
      calls: [],
      typeMap: new Map(),
      usedClang: false,
      usedSourceKit: false,
      errors: [],
    };

    // Step 1: Use Clang for AST parsing
    if (this.clangIndexer?.isAvailable()) {
      const clangResult = await this.clangIndexer.parseFile(filePath, content);
      result.symbols = clangResult.symbols;
      result.calls = clangResult.calls;
      result.typeMap = clangResult.typeMap;
      result.usedClang = clangResult.usedClang;
      result.errors.push(...clangResult.errors);
    }

    // Step 2: Use SourceKit-LSP for enhanced type info
    if (this.initialized) {
      await this.sourceKitClient.openDocument(filePath, content);

      // Enhance type information for key positions
      for (const symbol of result.symbols) {
        if (symbol.position.line > 0) {
          const type = await this.sourceKitClient.resolveType(
            filePath,
            symbol.position.line - 1,
            symbol.position.column,
          );
          if (type && !symbol.type) {
            symbol.type = type;
          }
        }
      }

      result.usedSourceKit = true;
    }

    return result;
  }

  /**
   * Resolve the target of a method call.
   */
  async resolveCallTarget(
    filePath: string,
    line: number,
    character: number,
  ): Promise<ObjCSymbolInfo | null> {
    if (!this.initialized) return null;

    const definition = await this.sourceKitClient.getDefinition(filePath, line, character);
    if (!definition) return null;

    const loc = Array.isArray(definition) ? definition[0] : definition;
    if (!loc) return null;

    return {
      name: '', // Would need to read the target file
      kind: 'method',
      filePath: loc.uri.replace('file://', ''),
      position: {
        line: loc.range.start.line + 1,
        column: loc.range.start.character,
      },
    };
  }

  /**
   * Shutdown the indexer.
   */
  async shutdown(): Promise<void> {
    await this.sourceKitClient.stop();
    this.initialized = false;
  }
}

// Export singleton
export const sourceKitClient = new SourceKitClient();
export const objcEnhancedIndexer = new ObjCEnhancedIndexer();
