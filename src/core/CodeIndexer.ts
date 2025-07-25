import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import type { Entity, Relationship, AnalysisResult } from '../types/index.js';
import { detectLanguage } from '../utils/languageDetection.js';
import { AnalyzerFactory } from '../analyzers/AnalyzerFactory.js';

export interface IndexResult {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  file_id?: string;
  data: {
    start?: { line: number; column: number };
    end?: { line: number; column: number };
    children?: string[];
  };
}

export interface GraphLink {
  source_id: string;
  target_id: string;
  type: string;
  data: any;
}

export class CodeIndexer {
  private entities: Map<string, Entity> = new Map();
  private relationships: Relationship[] = [];
  private fileNodes: Map<string, GraphNode> = new Map();
  private allFiles: Map<string, string> = new Map(); // relativePath -> fullPath
  private packageToFile: Map<string, string> = new Map(); // packageName -> relativePath

  async indexDirectory(directoryPath: string): Promise<IndexResult> {
    this.entities.clear();
    this.relationships = [];
    this.fileNodes.clear();
    this.allFiles.clear();
    this.packageToFile.clear();

    // First pass: collect all files and build package-to-file mapping
    await this.collectFiles(directoryPath, directoryPath);
    
    // Second pass: analyze files with cross-file context
    await this.processDirectory(directoryPath, directoryPath);
    
    return this.buildGraph();
  }

  private async collectFiles(dirPath: string, rootPath: string): Promise<void> {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!this.shouldSkipDirectory(entry)) {
          await this.collectFiles(fullPath, rootPath);
        }
      } else if (stat.isFile()) {
        const language = detectLanguage(fullPath);
        if (language) {
          const relativePath = relative(rootPath, fullPath);
          this.allFiles.set(relativePath, fullPath);
          
          // Build package-to-file mapping for Perl files
          if (language === 'perl') {
            await this.mapPackageToFile(fullPath, relativePath);
          }
        }
      }
    }
  }

  private async mapPackageToFile(filePath: string, relativePath: string): Promise<void> {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const packageRegex = /^\s*package\s+([A-Za-z_][A-Za-z0-9_:]*)\s*;/;
      
      for (const line of lines) {
        const match = line.match(packageRegex);
        if (match) {
          const packageName = match[1];
          this.packageToFile.set(packageName, relativePath);
          break; // Usually only one package per file
        }
      }
    } catch (error) {
      console.error(`Error reading file for package mapping ${filePath}:`, error);
    }
  }

  private async processDirectory(dirPath: string, rootPath: string): Promise<void> {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip common directories that shouldn't be analyzed
        if (!this.shouldSkipDirectory(entry)) {
          await this.processDirectory(fullPath, rootPath);
        }
      } else if (stat.isFile()) {
        await this.processFile(fullPath, rootPath);
      }
    }
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = [
      'node_modules',
      '.git',
      '.svn',
      '.hg',
      'dist',
      'build',
      'target',
      '.vscode',
      '.idea',
      '__pycache__',
      '.pytest_cache'
    ];
    return skipDirs.includes(dirName) || dirName.startsWith('.');
  }

  private async processFile(filePath: string, rootPath: string): Promise<void> {
    const language = detectLanguage(filePath);
    if (!language) {
      return; // Skip unsupported files
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const relativePath = relative(rootPath, filePath);
      
      // Create file node
      const fileId = `file:${relativePath}`;
      const fileNode: GraphNode = {
        id: fileId,
        name: relativePath,
        type: 'File',
        data: {
          children: []
        }
      };
      this.fileNodes.set(relativePath, fileNode);

      // Analyze the file with cross-file context
      const analyzer = AnalyzerFactory.createAnalyzer(language);
      analyzer.initializeParser();
      
      // Pass cross-file context to Perl analyzer
      const crossFileContext = {
        packageToFile: this.packageToFile,
        allFiles: this.allFiles,
        entities: this.entities
      };
      
      const result: AnalysisResult = analyzer.analyzeFile(relativePath, content, crossFileContext);
      
      // Store entities and relationships
      for (const entity of result.entities) {
        this.entities.set(entity.id, entity);
        fileNode.data.children?.push(entity.id);
      }
      
      this.relationships.push(...result.relationships);

    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  private buildGraph(): IndexResult {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // Add file nodes
    for (const fileNode of this.fileNodes.values()) {
      nodes.push(fileNode);
    }

    // Add entity nodes
    for (const entity of this.entities.values()) {
      const node: GraphNode = {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        file_id: this.getFileIdForEntity(entity),
        data: {
          start: {
            line: entity.startLine,
            column: entity.startColumn
          },
          end: {
            line: entity.endLine,
            column: entity.endColumn
          }
        }
      };
      nodes.push(node);
    }

    // Add relationship links (file-level only)
    for (const relationship of this.relationships) {
      const link: GraphLink = {
        source_id: relationship.sourceFileId,
        target_id: relationship.targetFileId,
        type: relationship.type,
        data: relationship.metadata || {}
      };
      links.push(link);
    }

    return { nodes, links };
  }

  private getFileIdForEntity(entity: Entity): string {
    const fileNode = this.fileNodes.get(entity.filePath);
    return fileNode?.id || `file:${entity.filePath}`;
  }
}
