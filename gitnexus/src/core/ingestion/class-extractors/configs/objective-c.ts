// gitnexus/src/core/ingestion/class-extractors/configs/objective-c.ts

import { SupportedLanguages } from 'gitnexus-shared';
import type { ClassExtractionConfig } from '../../class-types.js';

export const objectiveCClassConfig: ClassExtractionConfig = {
  language: SupportedLanguages.ObjectiveC,
  typeDeclarationNodes: [
    'class_interface',
    'class_implementation',
    'category_interface',
    'category_implementation',
    'protocol_declaration',
  ],
  ancestorScopeNodeTypes: [
    'class_interface',
    'class_implementation',
    'category_interface',
    'category_implementation',
    'protocol_declaration',
  ],
  extractType(node) {
    if (node.type === 'protocol_declaration') return 'Interface';
    if (node.type === 'category_interface' || node.type === 'category_implementation')
      return 'Class';
    return 'Class';
  },
};
