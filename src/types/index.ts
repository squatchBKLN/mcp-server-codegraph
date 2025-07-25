export enum EntityType {
  FUNCTION = 'function',
  CLASS = 'class',
  VARIABLE = 'variable',
  IMPORT = 'import',
  CONSTANT = 'constant',
  PROPERTY = 'property',
  // Perl-specific types
  PACKAGE = 'package',
  SUBROUTINE = 'subroutine',
  METHOD = 'method',
  HASH = 'hash',
  ARRAY = 'array',
  SCALAR = 'scalar',
  TYPEGLOB = 'typeglob'
}

export type SupportedLanguage = 'python' | 'javascript' | 'rust' | 'perl';

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  metadata?: {
    signature?: string;
    documentation?: string;
    isExported?: boolean;
    parameters?: string[];
    scope?: string;
    declarationType?: string;
    dataType?: string;
    importType?: string;
    version?: string;
    isNamespace?: boolean;
    arguments?: string[];
  };
}

export interface Relationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: 'calls' | 'inherits' | 'implements' | 'imports' | 'uses';
  filePath: string;
  line: number;
  metadata?: {
    arguments?: string[];
    [key: string]: any;
  };
}

export interface AnalysisResult {
  entities: Entity[];
  relationships: Relationship[];
}
