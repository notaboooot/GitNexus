/**
 * Objective-C import resolution config.
 * #import "File.h" → resolve to local header
 * #import <Framework/Header.h> → external framework
 */

import { SupportedLanguages } from 'gitnexus-shared';
import type { ImportResolutionConfig, ImportResolverStrategy } from '../types.js';

/**
 * Resolve Objective-C imports.
 * - "Header.h" → local file search
 * - <Framework/Header.h> → external framework (skip)
 */
export const objectiveCImportStrategy: ImportResolverStrategy = (rawImportPath, _filePath, ctx) => {
  // Angle brackets: <Foundation/Foundation.h> → external framework
  if (rawImportPath.startsWith('<') && rawImportPath.endsWith('>')) {
    return null;
  }

  // Quotes: "Header.h" → local header
  if (rawImportPath.startsWith('"') && rawImportPath.endsWith('"')) {
    const headerName = rawImportPath.slice(1, -1);

    // Search for matching header files
    const files: string[] = [];
    for (let i = 0; i < ctx.normalizedFileList.length; i++) {
      const normalized = ctx.normalizedFileList[i];
      if (normalized.endsWith(headerName) || normalized.endsWith('/' + headerName)) {
        files.push(ctx.allFileList[i]);
      }
    }

    if (files.length > 0) return { kind: 'files', files };
  }

  return null;
};

export const objectiveCImportConfig: ImportResolutionConfig = {
  language: SupportedLanguages.ObjectiveC,
  strategies: [objectiveCImportStrategy],
};
