// gitnexus/src/core/ingestion/variable-extractors/configs/objective-c.ts

import { SupportedLanguages } from 'gitnexus-shared';
import type { VariableExtractionConfig, VariableVisibility } from '../../variable-types.js';
import type { SyntaxNode } from '../../utils/ast-helpers.js';

/**
 * Objective-C variable extraction config.
 *
 * OC has global/static variables declared outside methods.
 */

function extractObjCVarName(node: SyntaxNode): string | undefined {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === 'identifier') return child.text;
  }
  return undefined;
}

function extractObjCVarType(node: SyntaxNode): string | undefined {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === 'type_identifier') return child.text;
  }
  return undefined;
}

export const objectiveCVariableConfig: VariableExtractionConfig = {
  language: SupportedLanguages.ObjectiveC,
  constNodeTypes: [],
  staticNodeTypes: [],
  variableNodeTypes: ['variable_declaration'],

  extractName: extractObjCVarName,
  extractType: extractObjCVarType,

  extractVisibility(_node): VariableVisibility {
    return 'public';
  },

  isConst(_node): boolean {
    return false;
  },

  isStatic(node): boolean {
    const text = node.text || '';
    return text.includes('static');
  },

  isMutable(_node): boolean {
    return true;
  },
};
