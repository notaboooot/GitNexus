// gitnexus/src/core/ingestion/method-extractors/configs/objective-c.ts

import { SupportedLanguages } from 'gitnexus-shared';
import type {
  MethodExtractionConfig,
  ParameterInfo,
  MethodVisibility,
} from '../../method-types.js';
import type { SyntaxNode } from '../../utils/ast-helpers.js';

/**
 * Objective-C method extraction config.
 *
 * Handles method_declaration and method_definition inside class interfaces/implementations.
 */
function extractObjCName(node: SyntaxNode): string | undefined {
  // selector field contains the method name
  const selector = node.childForFieldName('selector');
  if (selector) return selector.text;
  // Fallback: look for identifier
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === 'identifier' || child?.type === 'selector') return child.text;
  }
  return undefined;
}

function extractObjCReturnType(node: SyntaxNode): string | undefined {
  // Return type appears before the method name
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === 'type_identifier') return child.text;
  }
  return undefined;
}

function extractObjCParameters(node: SyntaxNode): ParameterInfo[] {
  const params: ParameterInfo[] = [];
  // OC parameters are in the selector with types
  // This is a simplified extraction
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === 'parameter') {
      const nameNode = child.namedChildren.find((c) => c.type === 'identifier');
      const typeNode = child.namedChildren.find((c) => c.type === 'type_identifier');
      if (nameNode) {
        params.push({
          name: nameNode.text,
          type: typeNode?.text ?? null,
          isOptional: false,
          isVariadic: false,
        });
      }
    }
  }
  return params;
}

export const objectiveCMethodConfig: MethodExtractionConfig = {
  language: SupportedLanguages.ObjectiveC,
  typeDeclarationNodes: ['class_interface', 'class_implementation', 'protocol_declaration'],
  methodNodeTypes: ['method_declaration', 'method_definition'],
  bodyNodeTypes: ['class_interface', 'class_implementation', 'protocol_declaration'],

  extractName: extractObjCName,
  extractReturnType: extractObjCReturnType,
  extractParameters: extractObjCParameters,

  extractVisibility(_node): MethodVisibility {
    return 'public';
  },

  isStatic(node): boolean {
    // Class methods start with '+'
    const text = node.text || '';
    return text.trimStart().startsWith('+');
  },

  isAbstract(_node): boolean {
    return false;
  },

  isFinal(_node): boolean {
    return false;
  },

  isAsync(_node): boolean {
    return false;
  },

  isOverride(_node): boolean {
    return false;
  },

  extractAnnotations(_node): string[] {
    return [];
  },
};
