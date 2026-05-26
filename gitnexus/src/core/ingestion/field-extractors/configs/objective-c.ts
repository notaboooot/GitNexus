// gitnexus/src/core/ingestion/field-extractors/configs/objective-c.ts

import { SupportedLanguages } from 'gitnexus-shared';
import type { FieldExtractionConfig } from '../generic.js';
import type { FieldVisibility } from '../../field-types.js';

/**
 * Objective-C field extraction config.
 *
 * Handles @property declarations inside class interfaces.
 */
export const objectiveCFieldConfig: FieldExtractionConfig = {
  language: SupportedLanguages.ObjectiveC,
  typeDeclarationNodes: ['class_interface', 'class_implementation', 'protocol_declaration'],
  fieldNodeTypes: ['property_declaration', 'ivar_declaration'],
  bodyNodeTypes: ['class_interface', 'class_implementation', 'protocol_declaration'],
  defaultVisibility: 'public',

  extractName(node) {
    // property_declaration has identifier child
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child?.type === 'identifier') return child.text;
    }
    const name = node.childForFieldName('name');
    return name?.text;
  },

  extractType(node) {
    // Look for type_identifier
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child?.type === 'type_identifier') return child.text;
    }
    return undefined;
  },

  extractVisibility(_node): FieldVisibility {
    return 'public'; // OC properties are public by default
  },

  isStatic(_node) {
    return false;
  },

  isReadonly(node) {
    // Check for readonly attribute
    const text = node.text || '';
    return text.includes('readonly');
  },
};
