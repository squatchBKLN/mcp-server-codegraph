import { AbstractAnalyzer } from './AbstractAnalyzer.js';
import type { Entity, Relationship, AnalysisResult } from '../types/index.js';
import { EntityType } from '../types/index.js';

export class PerlAnalyzer extends AbstractAnalyzer {

  public initializeParser(): void {
    // No parser initialization needed for regex-based approach
    this.parser = null;
  }

  analyzeFile(filePath: string, content: string): AnalysisResult {
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];
    const lines = content.split('\n');

    // Parse different Perl constructs using regex
    this.parsePackageStatements(lines, entities, filePath);
    this.parseUseStatements(lines, entities, filePath);
    this.parseSubroutines(lines, entities, relationships, filePath);
    this.parseVariableDeclarations(lines, entities, filePath);

    return { entities, relationships };
  }

  private parsePackageStatements(lines: string[], entities: Entity[], filePath: string): void {
    const packageRegex = /^\s*package\s+([A-Za-z_][A-Za-z0-9_:]*)\s*;/;
    
    lines.forEach((line, index) => {
      const match = line.match(packageRegex);
      if (match) {
        const packageName = match[1];
        const entity: Entity = {
          id: this.generateId(filePath, packageName),
          name: packageName,
          type: EntityType.CLASS,
          filePath,
          startLine: index + 1,
          endLine: index + 1,
          startColumn: match.index! + 1,
          endColumn: match.index! + match[0].length + 1,
          metadata: {
            isNamespace: true
          }
        };
        entities.push(entity);
      }
    });
  }

  private parseUseStatements(lines: string[], entities: Entity[], filePath: string): void {
    const useRegex = /^\s*(use|require)\s+([A-Za-z_][A-Za-z0-9_:]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)/;
    
    lines.forEach((line, index) => {
      const match = line.match(useRegex);
      if (match) {
        const importType = match[1];
        const moduleName = match[2];
        
        // Skip pragmas like 'use strict', 'use warnings'
        if (['strict', 'warnings', 'utf8', 'feature'].includes(moduleName)) {
          return;
        }
        
        const entity: Entity = {
          id: this.generateId(filePath, moduleName),
          name: moduleName,
          type: EntityType.IMPORT,
          filePath,
          startLine: index + 1,
          endLine: index + 1,
          startColumn: match.index! + 1,
          endColumn: match.index! + match[0].length + 1,
          metadata: {
            importType: importType
          }
        };
        entities.push(entity);
      }
    });
  }

  private parseSubroutines(lines: string[], entities: Entity[], relationships: Relationship[], filePath: string): void {
    const subRegex = /^\s*sub\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*\{?/;
    
    lines.forEach((line, index) => {
      const match = line.match(subRegex);
      if (match) {
        const subName = match[1];
        
        // Find the end of the subroutine by looking for the closing brace
        let endLine = index + 1;
        let braceCount = 0;
        let foundOpenBrace = line.includes('{');
        
        if (foundOpenBrace) {
          braceCount = 1;
          for (let i = index + 1; i < lines.length && braceCount > 0; i++) {
            const currentLine = lines[i];
            braceCount += (currentLine.match(/\{/g) || []).length;
            braceCount -= (currentLine.match(/\}/g) || []).length;
            if (braceCount === 0) {
              endLine = i + 1;
              break;
            }
          }
        }
        
        const entityId = this.generateId(filePath, subName);
        const entity: Entity = {
          id: entityId,
          name: subName,
          type: EntityType.FUNCTION,
          filePath,
          startLine: index + 1,
          endLine: endLine,
          startColumn: match.index! + 1,
          endColumn: match.index! + match[0].length + 1,
          metadata: {
            signature: `sub ${subName}`
          }
        };
        entities.push(entity);
        
        // Look for function calls within this subroutine
        this.parseFunctionCalls(lines, index, endLine - 1, entityId, relationships, filePath);
      }
    });
  }

  private parseFunctionCalls(lines: string[], startLine: number, endLine: number, sourceEntityId: string, relationships: Relationship[], filePath: string): void {
    // Regex to match function calls (simplified)
    const callRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    
    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      const line = lines[i];
      let match;
      
      while ((match = callRegex.exec(line)) !== null) {
        const functionName = match[1];
        
        // Skip common Perl built-ins and keywords
        if (this.isPerlBuiltin(functionName)) {
          continue;
        }
        
        const relationship: Relationship = {
          id: this.generateRelationshipId(),
          sourceEntityId: sourceEntityId,
          targetEntityId: this.generateId(filePath, functionName),
          type: 'calls',
          filePath,
          line: i + 1,
          metadata: {}
        };
        relationships.push(relationship);
      }
    }
  }

  private parseVariableDeclarations(lines: string[], entities: Entity[], filePath: string): void {
    const varRegex = /^\s*(my|our|state)\s+([%@$][A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[%@$][A-Za-z_][A-Za-z0-9_]*)*)/;
    
    lines.forEach((line, index) => {
      const match = line.match(varRegex);
      if (match) {
        const declarationType = match[1];
        const variablesStr = match[2];
        
        // Split by comma to handle multiple variable declarations
        const variables = variablesStr.split(',').map(v => v.trim());
        
        variables.forEach(varName => {
          if (varName) {
            const entity: Entity = {
              id: this.generateId(filePath, varName),
              name: varName,
              type: EntityType.VARIABLE,
              filePath,
              startLine: index + 1,
              endLine: index + 1,
              startColumn: match.index! + 1,
              endColumn: match.index! + match[0].length + 1,
              metadata: {
                scope: this.getScope(declarationType),
                declarationType: declarationType,
                dataType: this.inferDataType(varName)
              }
            };
            entities.push(entity);
          }
        });
      }
    });
  }

  private isPerlBuiltin(functionName: string): boolean {
    const builtins = [
      'print', 'printf', 'say', 'warn', 'die', 'exit', 'return',
      'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse',
      'keys', 'values', 'each', 'exists', 'delete', 'defined',
      'length', 'substr', 'index', 'rindex', 'split', 'join',
      'chomp', 'chop', 'lc', 'uc', 'lcfirst', 'ucfirst',
      'open', 'close', 'read', 'write', 'seek', 'tell',
      'if', 'unless', 'while', 'until', 'for', 'foreach',
      'map', 'grep', 'eval', 'do', 'require', 'use',
      'bless', 'ref', 'isa', 'can', 'new'
    ];
    return builtins.includes(functionName);
  }

  private getScope(declarationType: string): string {
    switch (declarationType) {
      case 'my':
        return 'lexical';
      case 'our':
        return 'package';
      case 'state':
        return 'state';
      default:
        return 'unknown';
    }
  }

  private inferDataType(varName: string): string {
    if (varName.startsWith('$')) return 'scalar';
    if (varName.startsWith('@')) return 'array';
    if (varName.startsWith('%')) return 'hash';
    if (varName.startsWith('*')) return 'typeglob';
    return 'unknown';
  }
}
