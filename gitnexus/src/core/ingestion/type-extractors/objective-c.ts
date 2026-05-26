/**
 * Objective-C type extractor — handles OC type annotations and inference.
 *
 * OC uses explicit type annotations: NSString *name, NSInteger age
 * Properties: @property (nonatomic, copy) NSString *name;
 * Instance variables: @interface Foo { NSString *_name; }
 */

import type { SyntaxNode } from '../utils/ast-helpers.js';
import type { LanguageTypeConfig, ParameterExtractor, TypeBindingExtractor } from './types.js';
import { extractSimpleTypeName } from './shared.js';
import { findChild } from '../utils/ast-helpers.js';

const DECLARATION_NODE_TYPES: ReadonlySet<string> = new Set([
  'property_declaration',
  'ivar_declaration',
  'variable_declaration',
]);

const FOR_LOOP_NODE_TYPES: ReadonlySet<string> = new Set(['for_statement', 'for_in_statement']);

/** Objective-C: NSString *name, @property (nonatomic) NSString *name */
const extractDeclaration: TypeBindingExtractor = (
  node: SyntaxNode,
  env: Map<string, string>,
): void => {
  // Property declaration: @property (attrs) NSString *name;
  if (node.type === 'property_declaration') {
    const nameNode = findChild(node, 'identifier');
    // Type is usually before the name, look for type_identifier
    const typeNode =
      findChild(node, 'type_identifier') ?? findChild(node, 'generic_type_identifier');
    if (nameNode && typeNode) {
      const varName = nameNode.text;
      const typeName = extractSimpleTypeName(typeNode);
      if (varName && typeName) env.set(varName, typeName);
    }
    return;
  }

  // Ivar declaration: { NSString *_name; }
  if (node.type === 'ivar_declaration') {
    const declarator = findChild(node, 'identifier');
    const typeNode = findChild(node, 'type_identifier');
    if (declarator && typeNode) {
      const varName = declarator.text;
      const typeName = extractSimpleTypeName(typeNode);
      if (varName && typeName) env.set(varName, typeName);
    }
    return;
  }
};

/** Objective-C method parameters: - (void)foo:(NSString *)name bar:(NSInteger)value */
const extractParameter: ParameterExtractor = (node: SyntaxNode, env: Map<string, string>): void => {
  if (node.type === 'parameter') {
    const nameNode = findChild(node, 'identifier');
    const typeNode = findChild(node, 'type_identifier');
    if (nameNode && typeNode) {
      const varName = nameNode.text;
      const typeName = extractSimpleTypeName(typeNode);
      if (varName && typeName) env.set(varName, typeName);
    }
  }
};

export const typeConfig: LanguageTypeConfig = {
  declarationNodeTypes: DECLARATION_NODE_TYPES,
  forLoopNodeTypes: FOR_LOOP_NODE_TYPES,
  extractDeclaration,
  extractParameter,
};
