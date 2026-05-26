# GitNexus Objective-C 语言支持集成方案

> 版本: 1.0 | 更新日期: 2026-05-21

## 概述

本文档详细说明如何为 GitNexus 添加 Objective-C (OC) 和 Objective-C++ 语言支持。集成遵循 GitNexus 现有的 **Strategy 模式**，每种语言提供一个 `LanguageProvider` 对象。

---

## 目录

1. [架构概述](#1-架构概述)
2. [集成清单](#2-集成清单)
3. [详细实现步骤](#3-详细实现步骤)
4. [tree-sitter-objc 配置](#4-tree-sitter-objc-配置)
5. [Objective-C 特性映射](#5-objective-c-特性映射)
6. [测试验证](#6-测试验证)
7. [已知限制与注意事项](#7-已知限制与注意事项)

---

## 1. 架构概述

### 1.1 语言集成模式

GitNexus 采用 **Strategy 模式** 进行语言集成：

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LanguageProvider                             │
├─────────────────────────────────────────────────────────────────────┤
│  id: SupportedLanguages                                             │
│  extensions: string[]                                                │
│  treeSitterQueries: string                                          │
│  typeConfig: TypeExtractionConfig                                   │
│  importResolver: ImportResolver                                     │
│  exportChecker: ExportChecker                                       │
│  callExtractor: CallExtractor                                       │
│  methodExtractor: MethodExtractor                                   │
│  fieldExtractor: FieldExtractor                                     │
│  variableExtractor: VariableExtractor                               │
│  classExtractor: ClassExtractor                                     │
│  heritageExtractor: HeritageExtractor                               │
│  importSemantics: 'named' | 'wildcard-transitive' | ...            │
│  heritageDefaultEdge: 'EXTENDS' | 'IMPLEMENTS'                     │
│  implicitImportWirer?: (files, imports, addEdge, config) => void   │
│  builtInNames?: Set<string>                                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 关键文件位置

| 文件 | 作用 |
|------|------|
| `gitnexus-shared/src/languages.ts` | 语言枚举定义 |
| `gitnexus-shared/src/language-detection.ts` | 扩展名映射 |
| `gitnexus/package.json` | tree-sitter 依赖 |
| `gitnexus/src/core/tree-sitter/parser-loader.ts` | 语法加载器 |
| `gitnexus/src/core/ingestion/languages/index.ts` | Provider 注册表 |
| `gitnexus/src/core/ingestion/languages/swift.ts` | Swift provider 参考 |
| `gitnexus/src/core/ingestion/tree-sitter-queries.ts` | Tree-sitter 查询 |

---

## 2. 集成清单

### 2.1 必需修改文件

| 序号 | 文件路径 | 修改内容 |
|------|----------|----------|
| 1 | `gitnexus-shared/src/languages.ts` | 添加 `ObjectiveC` 枚举 |
| 2 | `gitnexus-shared/src/language-detection.ts` | 添加扩展名和语法映射 |
| 3 | `gitnexus/package.json` | 添加 tree-sitter-objc 依赖 |
| 4 | `gitnexus/src/core/tree-sitter/parser-loader.ts` | 添加语法加载配置 |
| 5 | `gitnexus/src/core/ingestion/tree-sitter-queries.ts` | 添加 OC 查询 |
| 6 | `gitnexus/src/core/ingestion/languages/objective-c.ts` | **新建** - Provider 主文件 |
| 7 | `gitnexus/src/core/ingestion/languages/index.ts` | 注册 Provider |

### 2.2 可选配置文件（如果默认提取器不足）

| 文件 | 作用 |
|------|------|
| `class-extractors/configs/objective-c.ts` | 类提取配置 |
| `call-extractors/configs/objective-c.ts` | 调用提取配置 |
| `method-extractors/configs/objective-c.ts` | 方法提取配置 |
| `field-extractors/configs/objective-c.ts` | 字段提取配置 |
| `variable-extractors/configs/objective-c.ts` | 变量提取配置 |
| `type-extractors/objective-c.ts` | 类型提取配置 |
| `import-resolvers/configs/objective-c.ts` | 导入解析配置 |

---

## 3. 详细实现步骤

### 3.1 步骤一：添加语言枚举

**文件:** `gitnexus-shared/src/languages.ts`

```typescript
export enum SupportedLanguages {
  JavaScript = 'javascript',
  TypeScript = 'typescript',
  Python = 'python',
  Java = 'java',
  C = 'c',
  CPlusPlus = 'cpp',
  CSharp = 'csharp',
  Go = 'go',
  Ruby = 'ruby',
  Rust = 'rust',
  PHP = 'php',
  Kotlin = 'kotlin',
  Swift = 'swift',
  Dart = 'dart',
  Vue = 'vue',
  Cobol = 'cobol',
  // 添加 Objective-C
  ObjectiveC = 'objective-c',
}
```

### 3.2 步骤二：添加扩展名映射

**文件:** `gitnexus-shared/src/language-detection.ts`

```typescript
const EXTENSION_MAP: Record<SupportedLanguages, readonly string[]> = {
  // ... 现有语言
  [SupportedLanguages.Swift]: ['.swift'],
  [SupportedLanguages.Dart]: ['.dart'],
  [SupportedLanguages.Vue]: ['.vue'],
  [SupportedLanguages.Cobol]: ['.cbl', '.cob', '.cpy', '.cobol'],
  // 添加 Objective-C
  [SupportedLanguages.ObjectiveC]: ['.m', '.h', '.mm', '.M'],
} satisfies Record<SupportedLanguages, readonly string[]>;

const SYNTAX_MAP: Record<SupportedLanguages, string> = {
  // ... 现有语言
  [SupportedLanguages.Cobol]: 'cobol',
  // 添加 Objective-C
  [SupportedLanguages.ObjectiveC]: 'objectivec',
} satisfies Record<SupportedLanguages, string>;
```

**注意事项:**
- `.h` 文件同时被 C、C++ 和 OC 使用，需要优先级处理
- `.mm` 是 Objective-C++ 文件
- `.M` (大写) 是旧式 Objective-C 实现文件

### 3.3 步骤三：添加 tree-sitter 依赖

**文件:** `gitnexus/package.json`

有两种集成方式：

#### 方式 A：作为可选依赖（推荐）

```json
{
  "optionalDependencies": {
    "tree-sitter-swift": "file:./vendor/tree-sitter-swift",
    "tree-sitter-dart": "file:./vendor/tree-sitter-dart",
    "tree-sitter-proto": "file:./vendor/tree-sitter-proto",
    "tree-sitter-kotlin": "^0.3.8",
    "tree-sitter-objc": "^0.3.0"
  }
}
```

#### 方式 B：Vendored（完全控制，参考 Swift/Dart）

1. 将 `tree-sitter-objc` 复制到 `gitnexus/vendor/tree-sitter-objc`
2. 在 `package.json` 中：

```json
{
  "optionalDependencies": {
    "tree-sitter-objc": "file:./vendor/tree-sitter-objc"
  }
}
```

3. 创建构建脚本 `scripts/build-tree-sitter-objc.cjs`：

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

if (process.env.GITNEXUS_SKIP_OPTIONAL_GRAMMARS === '1') {
  console.warn('[tree-sitter-objc] Skipping build (GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1).');
  process.exit(0);
}

const objcDir = path.join(__dirname, '..', 'node_modules', 'tree-sitter-objc');
const bindingGyp = path.join(objcDir, 'binding.gyp');
const bindingNode = path.join(objcDir, 'build', 'Release', 'tree_sitter_objc_binding.node');

try {
  if (!fs.existsSync(bindingGyp) || fs.existsSync(bindingNode)) {
    process.exit(0);
  }

  try {
    require.resolve('node-addon-api');
    require.resolve('node-gyp-build');
  } catch (resolveErr) {
    console.warn('[tree-sitter-objc] Skipping build: hoisted build deps not resolvable.');
    process.exit(0);
  }

  console.log('[tree-sitter-objc] Building native binding...');
  execSync('npx node-gyp rebuild', {
    cwd: objcDir,
    stdio: 'pipe',
    timeout: 180000,
  });
  console.log('[tree-sitter-objc] Native binding built successfully');
} catch (err) {
  console.warn('[tree-sitter-objc] Could not build native binding:', err.message);
  process.exit(0);
}
```

4. 更新 `package.json` 的 `postinstall` 脚本：

```json
{
  "scripts": {
    "postinstall": "node scripts/build-tree-sitter-dart.cjs && node scripts/build-tree-sitter-proto.cjs && node scripts/build-tree-sitter-objc.cjs"
  }
}
```

### 3.4 步骤四：添加语法加载配置

**文件:** `gitnexus/src/core/tree-sitter/parser-loader.ts`

在 `SOURCES` 对象中添加：

```typescript
const SOURCES: Record<string, GrammarSource> = {
  // ... 现有语言

  // Objective-C (可选依赖)
  [SupportedLanguages.ObjectiveC]: {
    load: () => _require('tree-sitter-objc'),
    optional: true,
    unavailableNote:
      'Objective-C parsing disabled: `tree-sitter-objc` is an optionalDependency ' +
      'and is not installed (or its native binding failed to build). ' +
      'Likely cause: no prebuilt `.node` for this platform/architecture, ' +
      'or missing python3/make/g++. ' +
      'See https://github.com/abhigyanpatwari/GitNexus/issues/XXXX.',
  },
};
```

### 3.5 步骤五：添加 Tree-sitter 查询

**文件:** `gitnexus/src/core/ingestion/tree-sitter-queries.ts`

添加 Objective-C 查询（基于 tree-sitter-objc 节点类型）：

```typescript
// Objective-C queries - works with tree-sitter-objc
export const OBJECTIVE_C_QUERIES = `
; ── Classes ────────────────────────────────────────────────────────────────
(class_declaration
  name: (identifier) @name) @definition.class

; ── Categories (扩展) ──────────────────────────────────────────────────────
(category_declaration
  name: (identifier) @name
  category: (identifier) @category.name) @definition.category

; ── Protocols (协议) ───────────────────────────────────────────────────────
(protocol_declaration
  name: (identifier) @name) @definition.interface

; ── Implementations ────────────────────────────────────────────────────────
(class_implementation
  name: (identifier) @name) @definition.class

; ── Category Implementations ────────────────────────────────────────────────
(category_implementation
  name: (identifier) @name) @definition.class

; ── Methods ────────────────────────────────────────────────────────────────
(method_declaration
  selector: (method_selector) @name) @definition.method

; ── Instance Variables (实例变量) ──────────────────────────────────────────
(ivars_declaration
  (ivar_declaration
    name: (identifier) @name)) @definition.property

; ── Properties (属性) ───────────────────────────────────────────────────────
(property_declaration
  name: (identifier) @name) @definition.property

; ── Functions (C 函数，OC 文件中常见) ─────────────────────────────────────
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @name)) @definition.function

; ── Imports ────────────────────────────────────────────────────────────────
(import_declaration
  path: (string_literal) @import.source) @import

; ── Preprocessor Includes ───────────────────────────────────────────────────
(preproc_include
  path: (_) @import.source) @import

; ── Method Calls (消息发送) ─────────────────────────────────────────────────
(message_expression
  receiver: (_) @call.receiver
  selector: (identifier) @call.name) @call

; ── Direct Function Calls ───────────────────────────────────────────────────
(call_expression
  function: (identifier) @call.name) @call

; ── Heritage: extends ───────────────────────────────────────────────────────
(class_declaration
  name: (identifier) @heritage.class
  superclass: (identifier) @heritage.extends) @heritage

; ── Heritage: implements protocol ───────────────────────────────────────────
(class_declaration
  name: (identifier) @heritage.class
  protocols: (protocol_list
    (identifier) @heritage.implements)) @heritage.impl

; ── Write access: obj.field = value ─────────────────────────────────────────
(assignment_expression
  left: (member_expression
    object: (_) @assignment.receiver
    property: (field_identifier) @assignment.property)
  right: (_)) @assignment

; ── Enum declarations ───────────────────────────────────────────────────────
(enum_declaration
  name: (identifier) @name) @definition.enum

; ── Typedef declarations ────────────────────────────────────────────────────
(type_definition
  declarator: (type_identifier) @name) @definition.typedef
`;

// 更新 LANGUAGE_QUERIES 映射
export const LANGUAGE_QUERIES: Record<SupportedLanguages, string> = {
  // ... 现有语言
  [SupportedLanguages.Swift]: SWIFT_QUERIES,
  [SupportedLanguages.Dart]: DART_QUERIES,
  [SupportedLanguages.ObjectiveC]: OBJECTIVE_C_QUERIES,
  [SupportedLanguages.Vue]: TYPESCRIPT_QUERIES,
  [SupportedLanguages.Cobol]: '',
};
```

**重要:** 实际查询需要根据 `tree-sitter-objc` 的具体节点类型调整。建议使用 `tree-sitter-cli` 测试查询：

```bash
# 安装 tree-sitter CLI
npm install -g tree-sitter-cli

# 测试查询
tree-sitter parse example.m
```

### 3.6 步骤六：创建 Objective-C Provider

**文件:** `gitnexus/src/core/ingestion/languages/objective-c.ts` (新建)

```typescript
/**
 * Objective-C Language Provider
 *
 * Key Objective-C traits:
 *   - importSemantics: 'wildcard-transitive' (#import includes all symbols)
 *   - heritageDefaultEdge: 'EXTENDS' (single inheritance, protocols use IMPLEMENTS)
 *   - Header files (.h) are shared with C/C++ — detection via #import vs #include
 *   - Categories and Extensions are unique OC features
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
import type { XcodeProjectConfig } from '../language-config.js';
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
 * This is similar to Swift's SPM target visibility.
 */
function wireObjectiveCImplicitImports(
  objcFiles: string[],
  importMap: ReadonlyMap<string, ReadonlySet<string>>,
  addImportEdge: (src: string, target: string) => void,
  projectConfig: unknown,
): void {
  const configs = projectConfig as { xcodeProjectConfig?: XcodeProjectConfig | null } | null;
  
  // 如果没有 Xcode 配置，将所有 .m 文件与对应的 .h 文件关联
  // In the same target, all .m files can see all .h files
  if (!configs?.xcodeProjectConfig) {
    const headerFiles = objcFiles.filter(f => f.endsWith('.h'));
    const implFiles = objcFiles.filter(f => f.endsWith('.m') || f.endsWith('.mm'));
    
    for (const impl of implFiles) {
      const existing = importMap.get(impl);
      if (!existing || existing.size === 0) {
        for (const header of headerFiles) {
          addImportEdge(impl, header);
        }
      } else {
        for (const header of headerFiles) {
          if (!existing.has(header)) {
            addImportEdge(impl, header);
          }
        }
      }
    }
    return;
  }
  
  // 有 Xcode 配置时，按 target 分组
  // TODO: 实现 Xcode target 分组逻辑
}

/**
 * Extract method name from Objective-C method declarations.
 * OC methods have selector syntax: - (void)doSomething:withArg:
 */
const extractObjectiveCMethodName = (
  node: SyntaxNode,
): { funcName: string | null; label: NodeLabel } | null => {
  // 处理 init 方法（构造函数）
  if (node.type === 'method_declaration') {
    const selectorNode = node.childForFieldName('selector');
    if (selectorNode) {
      const selectorText = selectorNode.text;
      if (selectorText.startsWith('init')) {
        return { funcName: selectorText, label: 'Constructor' };
      }
    }
  }
  return null; // 使用默认提取
};

/** Built-in names to filter out from call graphs */
const BUILT_INS: ReadonlySet<string> = new Set([
  // Foundation
  'NSObject', 'NSString', 'NSArray', 'NSDictionary', 'NSSet', 'NSNumber',
  'NSData', 'NSDate', 'NSURL', 'NSError', 'NSException', 'NSNotification',
  'NSLog', 'NSAssert', 'NSCAssert',
  'alloc', 'init', 'dealloc', 'retain', 'release', 'autorelease',
  'description', 'hash', 'isEqual', 'copy', 'mutableCopy',
  'count', 'objectAtIndex', 'objectForKey', 'valueForKey',
  'addObject', 'removeObject', 'removeObjectForKey',
  'enumerateObjectsUsingBlock', 'enumerateObjectsWithOptions',
  
  // UIKit
  'UIView', 'UIViewController', 'UIApplication', 'UIApplicationDelegate',
  'UIButton', 'UILabel', 'UIImageView', 'UITableView', 'UICollectionView',
  'UINavigationController', 'UITabBarController',
  'viewDidLoad', 'viewWillAppear', 'viewDidAppear',
  'viewWillDisappear', 'viewDidDisappear', 'viewDidLayoutSubviews',
  'viewWillLayoutSubviews', 'didReceiveMemoryWarning',
  'viewWithTag', 'addSubview', 'removeFromSuperview',
  'bringSubviewToFront', 'sendSubviewToBack',
  
  // Core Data
  'NSManagedObject', 'NSManagedObjectContext', 'NSFetchRequest',
  'NSPersistentContainer', 'NSFetchRequestResult',
  
  // Common patterns
  'self', 'super', 'nil', 'Nil', 'YES', 'NO', 'TRUE', 'FALSE',
  'NSInteger', 'NSUInteger', 'CGFloat', 'CGSize', 'CGRect', 'CGPoint',
  'dispatch_async', 'dispatch_sync', 'dispatch_after', 'dispatch_once',
  'dispatch_get_main_queue', 'dispatch_get_global_queue',
  '@autoreleasepool', '@synthesize', '@dynamic', '@selector', '@protocol',
]);

export const objectiveCProvider = defineLanguage({
  id: SupportedLanguages.ObjectiveC,
  extensions: ['.m', '.h', '.mm', '.M'],
  
  // 入口点模式（用于进程检测评分）
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
  ],
  
  // 框架检测模式
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
        'IBOutlet',
        'IBAction',
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
  ] satisfies AstFrameworkPatternConfig[],
  
  treeSitterQueries: OBJECTIVE_C_QUERIES,
  typeConfig: objectiveCConfig,
  exportChecker: objectiveCExportChecker,
  importResolver: createImportResolver(objectiveCImportConfig),
  
  // #import 包含所有符号，传递可见
  importSemantics: 'wildcard-transitive',
  
  // 类继承是主要关系，协议使用 IMPLEMENTS
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
  
  // Xcode target 内文件隐式互见
  implicitImportWirer: wireObjectiveCImplicitImports,
  
  builtInNames: BUILT_INS,
});
```

### 3.7 步骤七：注册 Provider

**文件:** `gitnexus/src/core/ingestion/languages/index.ts`

```typescript
import { objectiveCProvider } from './objective-c.js';

export const providers = {
  // ... 现有语言
  [SupportedLanguages.Swift]: swiftProvider,
  [SupportedLanguages.Dart]: dartProvider,
  [SupportedLanguages.ObjectiveC]: objectiveCProvider,  // 添加
} satisfies Record<SupportedLanguages, LanguageProvider>;
```

### 3.8 步骤八：创建配置文件（按需）

#### class-extractors/configs/objective-c.ts

```typescript
import { SupportedLanguages } from 'gitnexus-shared';
import type { ClassExtractionConfig } from '../../class-types.js';

export const objectiveCClassConfig: ClassExtractionConfig = {
  language: SupportedLanguages.ObjectiveC,
  // OC 类名通常是 identifier 节点
  // 无需特殊配置，使用默认 generic 提取器
};
```

#### import-resolvers/configs/objective-c.ts

```typescript
import { SupportedLanguages } from 'gitnexus-shared';
import type { ImportResolutionConfig, ImportResolverStrategy } from '../types.js';

/**
 * Objective-C import resolution strategy.
 * #import "File.h" → resolve to local header
 * #import <Framework/Header.h> → external framework
 */
export const objectiveCImportStrategy: ImportResolverStrategy = (
  rawImportPath,
  _filePath,
  ctx,
) => {
  // 角括号导入 <Framework/Header.h> 是系统框架
  if (rawImportPath.startsWith('<') && rawImportPath.endsWith('>')) {
    return null; // 外部框架
  }
  
  // 引号导入 "Header.h" 是本地头文件
  if (rawImportPath.startsWith('"') && rawImportPath.endsWith('"')) {
    const headerName = rawImportPath.slice(1, -1);
    
    // 搜索匹配的头文件
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
```

---

## 4. tree-sitter-objc 配置

### 4.1 可用的 tree-sitter-objc 包

| 包名 | 维护者 | 备注 |
|------|--------|------|
| `tree-sitter-objc` | `@mattbdean` | NPM 可用，活跃维护 |
| `tree-sitter-obj` | `@unassigned` | 另一个实现 |

### 4.2 安装验证

```bash
# 安装
npm install --save-optional tree-sitter-objc

# 验证安装
node -e "const Parser = require('tree-sitter'); const OC = require('tree-sitter-objc'); const p = new Parser(); p.setLanguage(OC); console.log('OK');"
```

### 4.3 测试 AST 节点类型

```bash
# 使用 tree-sitter CLI 检查节点类型
tree-sitter parse example.m --debug

# 示例 OC 文件
cat > test.m << 'EOF'
#import <Foundation/Foundation.h>

@interface Person : NSObject <NSCopying>
@property (nonatomic, copy) NSString *name;
@property (nonatomic, assign) NSInteger age;
- (instancetype)initWithName:(NSString *)name age:(NSInteger)age;
- (void)introduce;
@end

@implementation Person
- (instancetype)initWithName:(NSString *)name age:(NSInteger)age {
    self = [super init];
    if (self) {
        _name = [name copy];
        _age = age;
    }
    return self;
}
- (void)introduce {
    NSLog(@"Hello, I'm %@", self.name);
}
@end
EOF

tree-sitter parse test.m
```

---

## 5. Objective-C 特性映射

### 5.1 语言特性对照表

| OC 特性 | GitNexus 映射 | 说明 |
|---------|---------------|------|
| `@interface` | `Class` | 类声明 |
| `@implementation` | `Class` | 类实现 |
| `@protocol` | `Interface` | 协议 |
| Category | `Class` (with category.name) | 分类 |
| Extension | `Class` | 匿名分类 |
| `-method` | `Method` | 实例方法 |
| `+method` | `Method` (static) | 类方法 |
| `@property` | `Property` | 属性 |
| Ivar | `Property` | 实例变量 |
| `#import` | `Import` | 导入 |
| `@selector()` | `Call` | 选择器引用 |
| `[obj method]` | `Call` | 消息发送 |
| Inheritance | `EXTENDS` | 单继承 |
| Protocol conformance | `IMPLEMENTS` | 协议实现 |

### 5.2 配置决策

| 配置项 | 值 | 原因 |
|--------|-----|------|
| `importSemantics` | `'wildcard-transitive'` | `#import` 包含所有符号，传递可见 |
| `heritageDefaultEdge` | `'EXTENDS'` | 类继承是主要关系 |
| `mroStrategy` | `'first-wins'` | 单继承，无复杂 MRO |
| `extensions` | `['.m', '.h', '.mm', '.M']` | `.mm` 为 OC++ |

### 5.3 头文件歧义处理

`.h` 文件可能属于 C、C++ 或 OC。建议的处理策略：

1. **优先级检测**：检查文件内容是否包含 OC 特有语法
   - `#import` → OC
   - `@interface`, `@implementation`, `@protocol` → OC
   - `@property` → OC

2. **文件路径启发式**：
   - 路径包含 `iOS`/`macOS`/`UIKit` → 可能是 OC
   - 与 `.m` 文件同名的 `.h` → OC 头文件

3. **回退策略**：
   - 如果检测失败，根据上下文决定（如同一目录有 `.m` 文件）

**实现建议（在 language-detection.ts 中）：**

```typescript
/**
 * 检测 .h 文件的实际语言
 * 优先级：Objective-C > C++ > C
 */
export const detectHeaderLanguage = (
  filePath: string,
  content: string,
): SupportedLanguages => {
  // OC 特征
  if (/@interface|@implementation|@protocol|@property|#import\s*[<"]/.test(content)) {
    return SupportedLanguages.ObjectiveC;
  }
  
  // C++ 特征
  if (/class\s+\w+|template\s*</.test(content)) {
    return SupportedLanguages.CPlusPlus;
  }
  
  // 默认 C
  return SupportedLanguages.C;
};
```

---

## 6. 测试验证

### 6.1 单元测试

创建 `gitnexus/test/unit/languages/objective-c.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { SupportedLanguages } from 'gitnexus-shared';
import { getLanguageFromFilename } from 'gitnexus-shared/language-detection';

describe('Objective-C Language Detection', () => {
  it('detects .m files as Objective-C', () => {
    expect(getLanguageFromFilename('MyClass.m')).toBe(SupportedLanguages.ObjectiveC);
  });
  
  it('detects .mm files as Objective-C', () => {
    expect(getLanguageFromFilename('MyClass.mm')).toBe(SupportedLanguages.ObjectiveC);
  });
  
  it('detects .h files as Objective-C', () => {
    expect(getLanguageFromFilename('MyClass.h')).toBe(SupportedLanguages.ObjectiveC);
  });
});

describe('Objective-C Provider', () => {
  it('has correct extensions', () => {
    const provider = providers[SupportedLanguages.ObjectiveC];
    expect(provider.extensions).toContain('.m');
    expect(provider.extensions).toContain('.h');
    expect(provider.extensions).toContain('.mm');
  });
  
  it('has wildcard-transitive import semantics', () => {
    const provider = providers[SupportedLanguages.ObjectiveC];
    expect(provider.importSemantics).toBe('wildcard-transitive');
  });
});
```

### 6.2 集成测试

创建测试项目：

```bash
mkdir -p test/fixtures/objc-project
cat > test/fixtures/objc-project/Person.h << 'EOF'
#import <Foundation/Foundation.h>

@interface Person : NSObject
@property (nonatomic, copy) NSString *name;
- (void)introduce;
@end
EOF

cat > test/fixtures/objc-project/Person.m << 'EOF'
#import "Person.h"

@implementation Person
- (void)introduce {
    NSLog(@"Hello, I'm %@", self.name);
}
@end
EOF

# 运行索引
cd test/fixtures/objc-project
gitnexus analyze --verbose

# 验证输出
gitnexus context Person
gitnexus query "introduce"
```

### 6.3 验证清单

- [ ] `.m` 文件被正确识别为 OC
- [ ] `.h` 文件被正确处理
- [ ] `.mm` 文件（OC++）被正确处理
- [ ] `@interface` 类声明被提取
- [ ] `@implementation` 类实现被提取
- [ ] `@protocol` 协议被提取为 Interface
- [ ] 方法声明和实现被提取
- [ ] `@property` 属性被提取
- [ ] `#import` 导入关系被建立
- [ ] 继承关系（`:`语法）被捕获
- [ ] 协议实现（`<Protocol>`语法）被捕获
- [ ] 消息发送 `[obj method]` 被识别为调用
- [ ] 内置名称（NSObject、NSString 等）被过滤

---

## 7. 已知限制与注意事项

### 7.1 已知限制

| 限制 | 原因 | 解决方案 |
|------|------|----------|
| 头文件歧义 | `.h` 被 C/C++/OC 共用 | 内容检测 + 启发式 |
| OC++ 支持 | `.mm` 文件混合 C++ | 可能需要 C++ 查询回退 |
| Xcode 项目 | 需要 `.pbxproj` 解析 | 可选：添加 Xcode 配置解析 |
| ARC 属性修饰符 | `strong`/`weak`/`unsafe_unretained` | 作为元数据提取 |
| Block 语法 | `^{ }` 匿名函数 | 可能需要特殊处理 |

### 7.2 性能考虑

- **大项目索引**：OC 项目通常有很多头文件，考虑增量索引
- **系统框架过滤**：Foundation/UIKit 等框架导入应被跳过
- **Category 处理**：Category 可能产生同名符号，需要去重

### 7.3 后续优化

1. **Xcode 项目集成**
   - 解析 `.pbxproj` 获取 target 结构
   - 支持 `project.pbxproj` 中的文件分组
   - 检测 CocoaPods/Carthage/SPM 依赖

2. **Swift-OC 互操作**
   - 检测 Swift 和 OC 之间的调用
   - 解析 `-Swift.h` 和 `<ModuleName>-Bridging-Header.h`

3. **LLDB 兼容性**
   - 生成 LLDB 可用的符号信息
   - 支持调试时的符号查找

---

## 附录 A：tree-sitter-objc 节点类型参考

```bash
# 常见节点类型（需要根据实际包验证）
class_declaration          # @interface
class_implementation       # @implementation
protocol_declaration       # @protocol
category_declaration       # @interface Foo (Category)
method_declaration         # - (void)method;
property_declaration       # @property
import_declaration         # #import
message_expression         # [obj method]
selector_expression        # @selector(...)
protocol_expression        # @protocol(...)
class_method_declaration   # + (void)method;
instance_method_declaration # - (void)method;
```

## 附录 B：参考资源

- [tree-sitter-objc (GitHub)](https://github.com/mattbdean/tree-sitter-objc)
- [Objective-C Language Guide](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/ProgrammingWithObjectiveC/)
- [Swift Provider 实现](./gitnexus/src/core/ingestion/languages/swift.ts)
- [GitNexus 贡献指南](./CONTRIBUTING.md)
