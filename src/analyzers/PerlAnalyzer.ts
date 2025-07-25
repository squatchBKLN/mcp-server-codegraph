import { AbstractAnalyzer } from './AbstractAnalyzer.js';
import type { Entity, Relationship, AnalysisResult } from '../types/index.js';
import { EntityType } from '../types/index.js';

export interface CrossFileContext {
  packageToFile: Map<string, string>;
  allFiles: Map<string, string>;
  entities: Map<string, Entity>;
}

export class PerlAnalyzer extends AbstractAnalyzer {

  public initializeParser(): void {
    // No parser initialization needed for regex-based approach
    this.parser = null;
  }

  analyzeFile(filePath: string, content: string, crossFileContext?: CrossFileContext): AnalysisResult {
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];
    const lines = content.split('\n');

    // Parse different Perl constructs using regex
    this.parsePackageStatements(lines, entities, filePath);
    this.parseUseStatements(lines, entities, relationships, filePath, crossFileContext);
    this.parseSubroutines(lines, entities, relationships, filePath, crossFileContext);
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

  private parseUseStatements(lines: string[], entities: Entity[], relationships: Relationship[], filePath: string, crossFileContext?: CrossFileContext): void {
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

        // Create cross-file relationship if we can resolve the module
        if (crossFileContext) {
          const targetFile = this.resolveModuleToFile(moduleName, crossFileContext);
          if (targetFile) {
            const targetPackageId = this.generateId(targetFile, moduleName);
            const relationship: Relationship = {
              id: this.generateRelationshipId(),
              sourceEntityId: entity.id,
              targetEntityId: targetPackageId,
              type: 'imports',
              filePath,
              line: index + 1,
              metadata: {
                targetFile: targetFile,
                importType: importType
              }
            };
            relationships.push(relationship);
          }
        }
      }
    });
  }

  private parseSubroutines(lines: string[], entities: Entity[], relationships: Relationship[], filePath: string, crossFileContext?: CrossFileContext): void {
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
        
        // Look for function calls, method calls, and class method calls within this subroutine
        this.parseCallsInSubroutine(lines, index, endLine - 1, entityId, relationships, filePath, crossFileContext);
      }
    });
  }

  private parseCallsInSubroutine(lines: string[], startLine: number, endLine: number, sourceEntityId: string, relationships: Relationship[], filePath: string, crossFileContext?: CrossFileContext): void {
    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      const line = lines[i];
      
      // Parse different types of calls
      this.parseObjectMethodCalls(line, i + 1, sourceEntityId, relationships, filePath, crossFileContext);
      this.parseClassMethodCalls(line, i + 1, sourceEntityId, relationships, filePath, crossFileContext);
      this.parseFunctionCalls(line, i + 1, sourceEntityId, relationships, filePath, crossFileContext);
    }
  }

  private parseObjectMethodCalls(line: string, lineNumber: number, sourceEntityId: string, relationships: Relationship[], filePath: string, crossFileContext?: CrossFileContext): void {
    // Match object method calls: $obj->method() or $self->method()
    const objectMethodRegex = /(\$[A-Za-z_][A-Za-z0-9_]*)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    let match;
    
    while ((match = objectMethodRegex.exec(line)) !== null) {
      const objectName = match[1];
      const methodName = match[2];
      
      // Skip common Perl built-ins
      if (this.isPerlBuiltin(methodName)) {
        continue;
      }
      
      const relationship: Relationship = {
        id: this.generateRelationshipId(),
        sourceEntityId: sourceEntityId,
        targetEntityId: this.generateId(filePath, methodName), // Default to same file
        type: 'method_call',
        filePath,
        line: lineNumber,
        metadata: {
          objectName: objectName,
          methodName: methodName
        }
      };
      
      // Try to resolve to cross-file method if we have context
      if (crossFileContext) {
        const resolvedTarget = this.resolveMethodCall(objectName, methodName, crossFileContext);
        if (resolvedTarget) {
          relationship.targetEntityId = resolvedTarget.entityId;
          relationship.metadata!.targetFile = resolvedTarget.filePath;
        }
      }
      
      relationships.push(relationship);
    }
  }

  private parseClassMethodCalls(line: string, lineNumber: number, sourceEntityId: string, relationships: Relationship[], filePath: string, crossFileContext?: CrossFileContext): void {
    // Match class method calls: Class->method() or Package::Name->method()
    const classMethodRegex = /([A-Za-z_][A-Za-z0-9_:]*)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    let match;
    
    while ((match = classMethodRegex.exec(line)) !== null) {
      const className = match[1];
      const methodName = match[2];
      
      // Skip common Perl built-ins and simple variable names (already handled by object method calls)
      if (this.isPerlBuiltin(methodName) || !className.includes('::') && className.toLowerCase() === className) {
        continue;
      }
      
      const relationship: Relationship = {
        id: this.generateRelationshipId(),
        sourceEntityId: sourceEntityId,
        targetEntityId: this.generateId(filePath, methodName), // Default to same file
        type: 'class_method_call',
        filePath,
        line: lineNumber,
        metadata: {
          className: className,
          methodName: methodName
        }
      };
      
      // Try to resolve to cross-file method if we have context
      if (crossFileContext) {
        const resolvedTarget = this.resolveClassMethodCall(className, methodName, crossFileContext);
        if (resolvedTarget) {
          relationship.targetEntityId = resolvedTarget.entityId;
          relationship.metadata!.targetFile = resolvedTarget.filePath;
        }
      }
      
      relationships.push(relationship);
    }
  }

  private parseFunctionCalls(line: string, lineNumber: number, sourceEntityId: string, relationships: Relationship[], filePath: string, crossFileContext?: CrossFileContext): void {
    // Match regular function calls: function_name()
    const callRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    let match;
    
    while ((match = callRegex.exec(line)) !== null) {
      const functionName = match[1];
      
      // Skip common Perl built-ins and keywords
      if (this.isPerlBuiltin(functionName)) {
        continue;
      }
      
      // Skip if this looks like a method call (already handled above)
      const beforeMatch = line.substring(0, match.index!);
      if (beforeMatch.match(/(\$[A-Za-z_][A-Za-z0-9_]*\s*->|[A-Za-z_][A-Za-z0-9_:]*\s*->)\s*$/)) {
        continue;
      }
      
      const relationship: Relationship = {
        id: this.generateRelationshipId(),
        sourceEntityId: sourceEntityId,
        targetEntityId: this.generateId(filePath, functionName),
        type: 'calls',
        filePath,
        line: lineNumber,
        metadata: {}
      };
      
      // Try to resolve to cross-file function if we have context
      if (crossFileContext) {
        const resolvedTarget = this.resolveFunctionCall(functionName, crossFileContext);
        if (resolvedTarget) {
          relationship.targetEntityId = resolvedTarget.entityId;
          relationship.metadata!.targetFile = resolvedTarget.filePath;
        }
      }
      
      relationships.push(relationship);
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

  // Cross-file resolution methods
  private resolveModuleToFile(moduleName: string, context: CrossFileContext): string | null {
    // First try direct package name lookup
    if (context.packageToFile.has(moduleName)) {
      return context.packageToFile.get(moduleName)!;
    }
    
    // Try converting package name to file path (Package::Name -> Package/Name.pm)
    const possiblePath = moduleName.replace(/::/g, '/') + '.pm';
    if (context.allFiles.has(possiblePath)) {
      return possiblePath;
    }
    
    // Try other common patterns
    const altPath = moduleName.replace(/::/g, '/') + '.pl';
    if (context.allFiles.has(altPath)) {
      return altPath;
    }
    
    return null;
  }

  private resolveMethodCall(objectName: string, methodName: string, context: CrossFileContext): { entityId: string; filePath: string } | null {
    // This is a simplified resolution - in a real implementation, you'd need type inference
    // For now, search for the method in all files
    for (const [entityId, entity] of context.entities) {
      if (entity.name === methodName && entity.type === EntityType.FUNCTION) {
        return { entityId, filePath: entity.filePath };
      }
    }
    return null;
  }

  private resolveClassMethodCall(className: string, methodName: string, context: CrossFileContext): { entityId: string; filePath: string } | null {
    // Try to find the class file first
    const classFile = this.resolveModuleToFile(className, context);
    if (classFile) {
      // Look for the method in that specific file
      const targetEntityId = this.generateId(classFile, methodName);
      if (context.entities.has(targetEntityId)) {
        return { entityId: targetEntityId, filePath: classFile };
      }
    }
    
    // Fallback: search for the method in all files
    return this.resolveMethodCall('', methodName, context);
  }

  private resolveFunctionCall(functionName: string, context: CrossFileContext): { entityId: string; filePath: string } | null {
    // Search for the function in all files
    for (const [entityId, entity] of context.entities) {
      if (entity.name === functionName && entity.type === EntityType.FUNCTION) {
        return { entityId, filePath: entity.filePath };
      }
    }
    return null;
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
