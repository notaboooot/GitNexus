/**
 * Objective-C Language Support Tests
 *
 * Tests language detection, provider configuration, and symbol extraction
 * for Objective-C files (.m, .h, .mm).
 */

import { describe, it, expect } from 'vitest';
import { SupportedLanguages, getLanguageFromFilename } from 'gitnexus-shared';
import { providers } from '../../../src/core/ingestion/languages/index.js';

describe('Objective-C Language Detection', () => {
  it('detects .m files as Objective-C', () => {
    expect(getLanguageFromFilename('MyClass.m')).toBe(SupportedLanguages.ObjectiveC);
    expect(getLanguageFromFilename('path/to/MyClass.m')).toBe(SupportedLanguages.ObjectiveC);
  });

  it('detects .mm files as Objective-C', () => {
    expect(getLanguageFromFilename('MyClass.mm')).toBe(SupportedLanguages.ObjectiveC);
  });

  it('detects .h files as Objective-C (OC priority)', () => {
    expect(getLanguageFromFilename('MyClass.h')).toBe(SupportedLanguages.ObjectiveC);
  });

  it('detects .M files as Objective-C', () => {
    expect(getLanguageFromFilename('MyClass.M')).toBe(SupportedLanguages.ObjectiveC);
  });
});

describe('Objective-C Provider Configuration', () => {
  const provider = providers[SupportedLanguages.ObjectiveC];

  it('has correct extensions', () => {
    expect(provider.extensions).toContain('.m');
    expect(provider.extensions).toContain('.h');
    expect(provider.extensions).toContain('.mm');
    expect(provider.extensions).toContain('.M');
  });

  it('has wildcard-transitive import semantics', () => {
    expect(provider.importSemantics).toBe('wildcard-transitive');
  });

  it('has EXTENDS as default heritage edge', () => {
    expect(provider.heritageDefaultEdge).toBe('EXTENDS');
  });

  it('has entry point patterns for process detection', () => {
    expect(provider.entryPointPatterns).toBeDefined();
    expect(provider.entryPointPatterns.length).toBeGreaterThan(0);
  });

  it('has AST framework patterns for UIKit/Foundation detection', () => {
    expect(provider.astFrameworkPatterns).toBeDefined();
    expect(provider.astFrameworkPatterns?.length).toBeGreaterThan(0);
  });

  it('has implicit import wirer for .m/.h visibility', () => {
    expect(provider.implicitImportWirer).toBeDefined();
  });

  it('has built-in names for filtering', () => {
    expect(provider.builtInNames).toBeDefined();
    expect(provider.builtInNames?.size).toBeGreaterThan(0);
  });

  it('includes NSObject in built-in names', () => {
    expect(provider.builtInNames?.has('NSObject')).toBe(true);
  });

  it('includes NSString in built-in names', () => {
    expect(provider.builtInNames?.has('NSString')).toBe(true);
  });

  it('includes UIKit classes in built-in names', () => {
    expect(provider.builtInNames?.has('UIView')).toBe(true);
    expect(provider.builtInNames?.has('UIViewController')).toBe(true);
  });

  it('includes common methods in built-in names', () => {
    expect(provider.builtInNames?.has('viewDidLoad')).toBe(true);
    expect(provider.builtInNames?.has('init')).toBe(true);
  });
});

describe('Objective-C Provider Extractors', () => {
  const provider = providers[SupportedLanguages.ObjectiveC];

  it('has class extractor', () => {
    expect(provider.classExtractor).toBeDefined();
  });

  it('has method extractor', () => {
    expect(provider.methodExtractor).toBeDefined();
  });

  it('has field extractor', () => {
    expect(provider.fieldExtractor).toBeDefined();
  });

  it('has variable extractor', () => {
    expect(provider.variableExtractor).toBeDefined();
  });

  it('has call extractor', () => {
    expect(provider.callExtractor).toBeDefined();
  });

  it('has heritage extractor', () => {
    expect(provider.heritageExtractor).toBeDefined();
  });

  it('has import resolver', () => {
    expect(provider.importResolver).toBeDefined();
  });

  it('has export checker', () => {
    expect(provider.exportChecker).toBeDefined();
  });
});
