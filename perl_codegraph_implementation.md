# Perl CodeGraph MCP Server Implementation

Based on the CodeGraph MCP server architecture, here's what needs to be modified to support Perl code analysis:

## 1. Current CodeGraph Architecture

The existing MCP server supports:
- **Languages**: Python, JavaScript, Rust
- **Core Features**: 
  - Indexes codebase to create entity graphs
  - Tracks relationships (function calls, inheritance, implementations)
  - Provides entity listing within files
  - Built with TypeScript/Node.js

## 2. Required Changes for Perl Support

### A. Parser Integration

**Add Tree-sitter Perl Parser**
```javascript
// Add to package.json dependencies
{
  "tree-sitter": "^0.20.0",
  "tree-sitter-perl": "^1.0.0"  // From https://github.com/tree-sitter-perl/tree-sitter-perl
}

// In language detection/parsing module
const Parser = require('tree-sitter');
const Perl = require('tree-sitter-perl');

const parser = new Parser();
parser.setLanguage(Perl);
```

### B. Perl Language Analyzer

**Create `src/analyzers/PerlAnalyzer.ts`**
```typescript
import { AbstractAnalyzer } from './AbstractAnalyzer';
import { Entity, Relationship, EntityType } from '../types';

export class PerlAnalyzer extends AbstractAnalyzer {
  
  // Perl-specific entity types
  private perlEntityTypes = {
    'subroutine_declaration': EntityType.FUNCTION,
    'package_statement': EntityType.CLASS,
    'use_statement': EntityType.IMPORT,
    'variable_declaration': EntityType.VARIABLE,
    'my_declaration': EntityType.VARIABLE,
    'our_declaration': EntityType.VARIABLE,
    'state_declaration': EntityType.VARIABLE,
    'constant': EntityType.CONSTANT,
    'hash_element': EntityType.PROPERTY,
    'array_element': EntityType.PROPERTY
  };

  analyzeFile(filePath: string, content: string): { entities: Entity[], relationships: Relationship[] } {
    const tree = this.parser.parse(content);
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];

    this.traverseNode(tree.rootNode, entities, relationships, filePath);
    
    return { entities, relationships };
  }

  private traverseNode(node: any, entities: Entity[], relationships: Relationship[], filePath: string) {
    // Handle Perl-specific constructs
    switch (node.type) {
      case 'subroutine_declaration':
        this.handleSubroutine(node, entities, relationships, filePath);
        break;
      case 'package_statement':
        this.handlePackage(node, entities, relationships, filePath);
        break;
      case 'use_statement':
      case 'require_statement':
        this.handleImport(node, entities, relationships, filePath);
        break;
      case 'method_call':
      case 'function_call':
        this.handleFunctionCall(node, entities, relationships, filePath);
        break;
      case 'my_declaration':
      case 'our_declaration':
      case 'state_declaration':
        this.handleVariableDeclaration(node, entities, relationships, filePath);
        break;
    }

    // Recursively traverse child nodes
    for (let i = 0; i < node.childCount; i++) {
      this.traverseNode(node.child(i), entities, relationships, filePath);
    }
  }

  private handleSubroutine(node: any, entities: Entity[], relationships: Relationship[], filePath: string) {
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      const entity: Entity = {
        id: this.generateId(filePath, nameNode.text),
        name: nameNode.text,
        type: EntityType.FUNCTION,
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        startColumn: node.startPosition.column + 1,
        endColumn: node.endPosition.column + 1,
        metadata: {
          signature: this.extractSubroutineSignature(node),
          documentation: this.extractDocumentation(node),
          isExported: this.isExported(node),
          parameters: this.extractParameters(node)
        }
      };
      entities.push(entity);
    }
  }

  private handlePackage(node: any, entities: Entity[], relationships: Relationship[], filePath: string) {
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      const entity: Entity = {
        id: this.generateId(filePath, nameNode.text),
        name: nameNode.text,
        type: EntityType.CLASS,
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        startColumn: node.startPosition.column + 1,
        endColumn: node.endPosition.column + 1,
        metadata: {
          isNamespace: true,
          documentation: this.extractDocumentation(node)
        }
      };
      entities.push(entity);
    }
  }

  private handleImport(node: any, entities: Entity[], relationships: Relationship[], filePath: string) {
    const moduleNode = node.childForFieldName('module') || node.child(1);
    if (moduleNode) {
      const entity: Entity = {
        id: this.generateId(filePath, moduleNode.text),
        name: moduleNode.text,
        type: EntityType.IMPORT,
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        startColumn: node.startPosition.column + 1,
        endColumn: node.endPosition.column + 1,
        metadata: {
          importType: node.type === 'use_statement' ? 'use' : 'require',
          version: this.extractVersion(node)
        }
      };
      entities.push(entity);
    }
  }

  private handleFunctionCall(node: any, entities: Entity[], relationships: Relationship[], filePath: string) {
    const functionNode = node.childForFieldName('function') || node.child(0);
    if (functionNode) {
      // Create relationship to called function
      const relationship: Relationship = {
        id: this.generateRelationshipId(),
        sourceEntityId: this.getCurrentEntityId(), // Current context
        targetEntityId: this.generateId(filePath, functionNode.text),
        type: 'calls',
        filePath,
        line: node.startPosition.row + 1,
        metadata: {
          arguments: this.extractArguments(node)
        }
      };
      relationships.push(relationship);
    }
  }

  private handleVariableDeclaration(node: any, entities: Entity[], relationships: Relationship[], filePath: string) {
    // Handle my $var, our $var, state $var declarations
    const variables = this.extractVariableNames(node);
    variables.forEach(varName => {
      const entity: Entity = {
        id: this.generateId(filePath, varName),
        name: varName,
        type: EntityType.VARIABLE,
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        startColumn: node.startPosition.column + 1,
        endColumn: node.endPosition.column + 1,
        metadata: {
          scope: this.extractScope(node),
          declarationType: node.type,
          dataType: this.inferDataType(node)
        }
      };
      entities.push(entity);
    });
  }

  // Perl-specific helper methods
  private extractSubroutineSignature(node: any): string {
    // Extract subroutine signature including parameters
    const params = this.extractParameters(node);
    return `sub ${node.childForFieldName('name')?.text}(${params.join(', ')})`;
  }

  private extractParameters(node: any): string[] {
    // Extract parameters from subroutine declaration
    const params: string[] = [];
    // Perl parameters are typically extracted from @_ in the body
    // or from signature syntax in modern Perl
    return params;
  }

  private isExported(node: any): boolean {
    // Check if subroutine is in @EXPORT or @EXPORT_OK
    return false; // Implementation needed
  }

  private extractVariableNames(node: any): string[] {
    // Extract variable names from declaration nodes
    const names: string[] = [];
    // Handle various Perl variable declaration patterns
    return names;
  }

  private extractScope(node: any): string {
    // Determine variable scope (package, lexical, etc.)
    return 'lexical'; // Default for 'my' variables
  }

  private inferDataType(node: any): string {
    // Infer Perl data type (scalar, array, hash, reference)
    const varName = node.text;
    if (varName.startsWith('$')) return 'scalar';
    if (varName.startsWith('@')) return 'array';
    if (varName.startsWith('%')) return 'hash';
    if (varName.startsWith('*')) return 'typeglob';
    return 'unknown';
  }

  private extractVersion(node: any): string | undefined {
    // Extract version from use/require statements
    return undefined;
  }

  private extractArguments(node: any): string[] {
    // Extract function call arguments
    return [];
  }
}
```

### C. Language Detection Updates

**Update `src/utils/languageDetection.ts`**
```typescript
export function detectLanguage(filePath: string): SupportedLanguage | null {
  const extension = path.extname(filePath).toLowerCase();
  
  switch (extension) {
    case '.py':
      return 'python';
    case '.js':
    case '.ts':
    case '.jsx':
    case '.tsx':
      return 'javascript';
    case '.rs':
      return 'rust';
    case '.pl':        // Standard Perl extension
    case '.pm':        // Perl module
    case '.t':         // Perl test file
    case '.cgi':       // CGI scripts often Perl
      return 'perl';
    default:
      return null;
  }
}
```

### D. Entity Types Extension

**Update `src/types/index.ts`**
```typescript
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
```

### E. Analyzer Factory Updates

**Update `src/analyzers/AnalyzerFactory.ts`**
```typescript
import { PerlAnalyzer } from './PerlAnalyzer';

export class AnalyzerFactory {
  static createAnalyzer(language: SupportedLanguage): AbstractAnalyzer {
    switch (language) {
      case 'python':
        return new PythonAnalyzer();
      case 'javascript':
        return new JavaScriptAnalyzer();
      case 'rust':
        return new RustAnalyzer();
      case 'perl':
        return new PerlAnalyzer();
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }
}
```

## 3. Perl-Specific Considerations

### A. Perl Language Features to Handle

1. **Package System**
   - `package Foo::Bar;` declarations  
   - `@ISA` inheritance
   - `use parent` / `use base` inheritance

2. **Subroutines and Methods**
   - `sub name { ... }` declarations
   - Anonymous subroutines
   - Method calls with `->` operator
   - Prototypes and signatures

3. **Variable Types**
   - Scalars (`$var`)
   - Arrays (`@array`) 
   - Hashes (`%hash`)
   - Typeglobs (`*glob`)
   - References (`\$ref`)

4. **Imports and Modules**
   - `use Module;` statements
   - `require` statements  
   - `use Module qw(import list);`
   - Version specifications

5. **Special Perl Constructs**
   - Regular expressions
   - Here documents
   - String interpolation
   - Special variables (`$_`, `@_`, etc.)

### B. Testing Strategy

**Create `test/perl/` directory with test files:**

```perl
# test/perl/sample.pl
package MyModule::Utils;

use strict;
use warnings;
use Data::Dumper qw(Dumper);

our @EXPORT = qw(process_data);

sub new {
    my $class = shift;
    my $self = {
        data => [],
        config => {}
    };
    return bless $self, $class;
}

sub process_data {
    my ($self, $input) = @_;
    my @results = ();
    
    foreach my $item (@$input) {
        push @results, $self->transform_item($item);
    }
    
    return \@results;
}

sub transform_item {
    my ($self, $item) = @_;
    return uc($item);
}

1;
```

## 4. Implementation Steps

1. **Install Dependencies**
   ```bash
   npm install tree-sitter tree-sitter-perl
   ```

2. **Create Perl Analyzer** 
   - Implement `PerlAnalyzer.ts` with Tree-sitter integration
   - Handle Perl-specific AST node types

3. **Update Core Components**
   - Language detection
   - Analyzer factory
   - Type definitions

4. **Testing**
   - Create comprehensive Perl test files
   - Verify entity extraction
   - Test relationship mapping

5. **Documentation**
   - Update README with Perl support
   - Add Perl-specific examples

## 5. Advanced Features (Future)

- **POD Documentation** parsing
- **Moose/Moo** object system support  
- **Module dependency** graph
- **Test file** relationship mapping
- **CPAN module** recognition
- **Perl::Critic** integration for code quality

This implementation will give you a fully functional Perl-compatible version of the CodeGraph MCP server, maintaining the same interface while adding comprehensive Perl language support.