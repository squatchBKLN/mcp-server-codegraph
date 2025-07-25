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
    const importedModules: string[] = [];
    
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
        importedModules.push(moduleName);

        // Create file-level relationship if we can resolve the module
        if (crossFileContext) {
          const targetFile = this.resolveModuleToFile(moduleName, crossFileContext);
          if (targetFile) {
            const sourceFileId = `file:${filePath}`;
            const targetFileId = `file:${targetFile}`;
            
            // Check if relationship already exists to avoid duplicates
            const existingRelationship = relationships.find(rel => 
              rel.sourceFileId === sourceFileId && rel.targetFileId === targetFileId
            );
            
            if (!existingRelationship) {
              const relationship: Relationship = {
                id: this.generateRelationshipId(),
                sourceFileId: sourceFileId,
                targetFileId: targetFileId,
                type: 'imports',
                metadata: {
                  importedModules: [moduleName],
                  importType: importType
                }
              };
              relationships.push(relationship);
            } else {
              // Add to existing relationship's imported modules
              if (!existingRelationship.metadata!.importedModules!.includes(moduleName)) {
                existingRelationship.metadata!.importedModules!.push(moduleName);
              }
            }
          }
        }
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
}
