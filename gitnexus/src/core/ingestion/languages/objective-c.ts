/**
 * Objective-C Language Provider
 *
 * Assembles all Objective-C-specific ingestion capabilities into a single
 * LanguageProvider, following the Strategy pattern used by the pipeline.
 *
 * Key Objective-C traits:
 *   - importSemantics: 'wildcard-transitive' (#import includes all symbols, transitive)
 *   - heritageDefaultEdge: 'EXTENDS' (single class inheritance, protocols use IMPLEMENTS)
 *   - implicitImportWirer: files in the same target/module see each other's headers
 */

import { SupportedLanguages } from 'gitnexus-shared';
import type { NodeLabel, SymbolDefinition } from 'gitnexus-shared';
import { createClassExtractor } from '../class-extractors/generic.js';
import { objectiveCClassConfig } from '../class-extractors/configs/objective-c.js';
import { defineLanguage } from '../language-provider.js';
import type { AstFrameworkPatternConfig } from '../language-provider.js';
import { typeConfig as objectiveCConfig } from '../type-extractors/objective-c.js';
import { objectiveCExportChecker } from '../export-detection.js';
import { createImportResolver } from '../import-resolvers/resolver-factory.js';
import { objectiveCImportConfig } from '../import-resolvers/configs/objective-c.js';
import { OBJECTIVE_C_QUERIES } from '../tree-sitter-queries.js';
import type { SyntaxNode } from '../utils/ast-helpers.js';
import { createFieldExtractor } from '../field-extractors/generic.js';
import { objectiveCFieldConfig } from '../field-extractors/configs/objective-c.js';
import { createMethodExtractor } from '../method-extractors/generic.js';
import { objectiveCMethodConfig } from '../method-extractors/configs/objective-c.js';
import { createVariableExtractor } from '../variable-extractors/generic.js';
import { objectiveCVariableConfig } from '../variable-extractors/configs/objective-c.js';
import { createCallExtractor } from '../call-extractors/generic.js';
import { objectiveCCallConfig } from '../call-extractors/configs/objective-c.js';
import { createHeritageExtractor } from '../heritage-extractors/generic.js';

/**
 * Wire implicit inter-file imports for Objective-C.
 * In Xcode projects, files in the same target see each other's headers.
 * Without Xcode config, all .m files can see all .h files in the project.
 */
function wireObjectiveCImplicitImports(
  objcFiles: string[],
  importMap: ReadonlyMap<string, ReadonlySet<string>>,
  addImportEdge: (src: string, target: string) => void,
  _projectConfig: unknown,
): void {
  // Separate headers and implementations
  const headerFiles = objcFiles.filter((f) => f.endsWith('.h'));
  const implFiles = objcFiles.filter((f) => f.endsWith('.m') || f.endsWith('.mm'));

  // Each .m/.mm file can see all .h files in the project
  for (const impl of implFiles) {
    const existing = importMap.get(impl);
    if (!existing || existing.size === 0) {
      // Fast path: no prior imports — emit all headers
      for (const header of headerFiles) {
        addImportEdge(impl, header);
      }
    } else {
      // Dedup path: skip already-connected pairs
      for (const header of headerFiles) {
        if (!existing.has(header)) {
          addImportEdge(impl, header);
        }
      }
    }
  }
}

/**
 * Extract method name and label for Objective-C method declarations.
 * OC init methods are constructors.
 */
const extractObjectiveCMethodName = (
  node: SyntaxNode,
): { funcName: string | null; label: NodeLabel } | null => {
  // Handle init methods as constructors
  if (node.type === 'method_declaration' || node.type === 'method_definition') {
    const selectorNode = node.childForFieldName('selector');
    if (selectorNode) {
      const selectorText = selectorNode.text;
      if (selectorText.startsWith('init')) {
        return { funcName: selectorText, label: 'Constructor' };
      }
    }
  }
  return null; // Fall through to generic
};

/**
 * Order same-name type candidates for Objective-C.
 * Prefer shorter paths (closer to the call site) when multiple classes share a name.
 */
const orderObjectiveCSameNameTypeCandidates = ({
  typeName,
  callSiteFilePath,
  candidates,
}: {
  readonly typeName: string;
  readonly callSiteFilePath: string;
  readonly candidates: readonly SymbolDefinition[];
}): readonly SymbolDefinition[] | null => {
  if (
    !callSiteFilePath.endsWith('.m') &&
    !callSiteFilePath.endsWith('.mm') &&
    !callSiteFilePath.endsWith('.h')
  ) {
    return null;
  }
  if (candidates.length <= 1) return null;
  if (!candidates.every((c) => c.type === candidates[0].type)) return null;
  if (candidates[0].type !== 'Class' && candidates[0].type !== 'Struct') return null;
  if (
    !candidates.every(
      (c) => c.filePath.endsWith('.m') || c.filePath.endsWith('.mm') || c.filePath.endsWith('.h'),
    )
  ) {
    return null;
  }
  // Sort by path length (shorter = closer) then alphabetically
  return [...candidates].sort(
    (a, b) => a.filePath.length - b.filePath.length || a.filePath.localeCompare(b.filePath),
  );
};

/** Built-in names to filter from call graphs */
const BUILT_INS: ReadonlySet<string> = new Set([
  // Foundation
  'NSObject',
  'NSString',
  'NSArray',
  'NSDictionary',
  'NSSet',
  'NSNumber',
  'NSData',
  'NSDate',
  'NSURL',
  'NSError',
  'NSException',
  'NSNotification',
  'NSBundle',
  'NSNotificationCenter',
  'NSNull',
  'NSValue',
  'NSLog',
  'NSAssert',
  'NSCAssert',
  'NSDebugEnabled',

  // Core Foundation
  'CFArrayRef',
  'CFDictionaryRef',
  'CFStringRef',
  'CFURLRef',
  'CFRelease',
  'CFRetain',

  // Memory management
  'alloc',
  'init',
  'dealloc',
  'retain',
  'release',
  'autorelease',
  'retainCount',
  'copy',
  'mutableCopy',

  // NSObject methods
  'description',
  'debugDescription',
  'hash',
  'isEqual',
  'class',
  'superclass',
  'isKindOfClass',
  'isMemberOfClass',
  'respondsToSelector',
  'conformsToProtocol',
  'performSelector',
  'performSelectorInBackground',

  // Collection methods
  'count',
  'objectAtIndex',
  'objectForKey',
  'valueForKey',
  'setValueForKey',
  'addObject',
  'removeObject',
  'removeObjectForKey',
  'removeAllObjects',
  'enumerateObjectsUsingBlock',
  'enumerateObjectsWithOptions',

  // UIKit (iOS)
  'UIView',
  'UIViewController',
  'UIApplication',
  'UIApplicationDelegate',
  'UIWindow',
  'UIButton',
  'UILabel',
  'UIImageView',
  'UITableView',
  'UICollectionView',
  'UINavigationController',
  'UITabBarController',
  'UINavigationController',
  'UIAlertController',

  // UIViewController lifecycle
  'viewDidLoad',
  'viewWillAppear',
  'viewDidAppear',
  'viewWillDisappear',
  'viewDidDisappear',
  'viewDidLayoutSubviews',
  'viewWillLayoutSubviews',
  'didReceiveMemoryWarning',
  'viewWithTag',
  'addSubview',
  'removeFromSuperview',
  'bringSubviewToFront',
  'sendSubviewToBack',

  // AppKit (macOS)
  'NSView',
  'NSViewController',
  'NSWindow',
  'NSApplication',
  'NSApplicationDelegate',

  // Core Data
  'NSManagedObject',
  'NSManagedObjectContext',
  'NSFetchRequest',
  'NSPersistentContainer',
  'NSEntityDescription',
  'NSPredicate',
  'NSSortDescriptor',

  // Keywords and literals
  'self',
  'super',
  'nil',
  'Nil',
  'YES',
  'NO',
  'TRUE',
  'FALSE',
  'NULL',

  // Types
  'NSInteger',
  'NSUInteger',
  'CGFloat',
  'CGSize',
  'CGRect',
  'CGPoint',
  'NSRange',

  // GCD
  'dispatch_async',
  'dispatch_sync',
  'dispatch_after',
  'dispatch_once',
  'dispatch_get_main_queue',
  'dispatch_get_global_queue',
  'dispatch_queue_create',
  'dispatch_group_create',
  'dispatch_group_enter',
  'dispatch_group_leave',
  'dispatch_group_notify',

  // Blocks
  'dispatch_block_t',
  'void',

  // Common patterns
  'main',
  'applicationDidFinishLaunching',
  'applicationDidEnterBackground',
  'applicationWillResignActive',
  'applicationWillEnterForeground',
  'applicationDidBecomeActive',
  'awakeFromNib',
  'initWithCoder',
  'initWithFrame',
  'loadView',
]);

export const objectiveCProvider = defineLanguage({
  id: SupportedLanguages.ObjectiveC,
  extensions: ['.m', '.h', '.mm', '.M'],

  // Entry point patterns for process detection scoring
  entryPointPatterns: [
    /^viewDidLoad$/,
    /^viewWillAppear$/,
    /^viewDidAppear$/,
    /^applicationDidFinishLaunching$/,
    /^applicationDidEnterBackground$/,
    /^applicationWillResignActive$/,
    /^awakeFromNib$/,
    /^initWithCoder$/,
    /^initWithFrame$/,
    /^loadView$/,
    /^main$/,
    /^application$/,
    /^AppDelegate$/,
    /ViewController$/,
    /Controller$/,
  ],

  // AST-based framework detection
  astFrameworkPatterns: [
    {
      framework: 'uikit',
      entryPointMultiplier: 2.5,
      reason: 'uikit-lifecycle',
      patterns: [
        'UIViewController',
        'UIView',
        'viewDidLoad',
        'viewWillAppear',
        '@IBOutlet',
        '@IBAction',
      ],
    },
    {
      framework: 'foundation',
      entryPointMultiplier: 1.5,
      reason: 'foundation-pattern',
      patterns: [
        'NSObject',
        'NSString',
        'NSArray',
        'NSDictionary',
        'NSBundle',
        'NSNotificationCenter',
      ],
    },
    {
      framework: 'coredata',
      entryPointMultiplier: 2.0,
      reason: 'coredata-pattern',
      patterns: [
        'NSManagedObject',
        'NSManagedObjectContext',
        'NSFetchRequest',
        'NSPersistentContainer',
      ],
    },
    {
      framework: 'appkit',
      entryPointMultiplier: 2.5,
      reason: 'appkit-lifecycle',
      patterns: ['NSViewController', 'NSView', 'NSWindow', 'NSDocument'],
    },
  ] satisfies AstFrameworkPatternConfig[],

  treeSitterQueries: OBJECTIVE_C_QUERIES,
  typeConfig: objectiveCConfig,
  exportChecker: objectiveCExportChecker,
  importResolver: createImportResolver(objectiveCImportConfig),

  // #import includes all symbols, transitive visibility
  importSemantics: 'wildcard-transitive',

  // Single inheritance, protocols use IMPLEMENTS
  heritageDefaultEdge: 'EXTENDS',

  callExtractor: createCallExtractor(objectiveCCallConfig),
  fieldExtractor: createFieldExtractor(objectiveCFieldConfig),
  methodExtractor: createMethodExtractor({
    ...objectiveCMethodConfig,
    extractFunctionName: extractObjectiveCMethodName,
  }),
  variableExtractor: createVariableExtractor(objectiveCVariableConfig),
  classExtractor: createClassExtractor(objectiveCClassConfig),
  heritageExtractor: createHeritageExtractor(SupportedLanguages.ObjectiveC),

  // Files in the same target see each other
  implicitImportWirer: wireObjectiveCImplicitImports,

  // Type candidate ordering
  orderSameNameTypeCandidates: orderObjectiveCSameNameTypeCandidates,

  builtInNames: BUILT_INS,
});
