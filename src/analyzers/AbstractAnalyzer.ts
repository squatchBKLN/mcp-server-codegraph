import type { Entity, Relationship, AnalysisResult } from '../types/index.js';

export abstract class AbstractAnalyzer {
  protected parser: any;
  protected currentEntityStack: string[] = [];

  constructor() {
    // Parser will be initialized when needed
  }

  public abstract initializeParser(): void;

  abstract analyzeFile(filePath: string, content: string): AnalysisResult;

  protected generateId(filePath: string, name: string): string {
    return `${filePath}:${name}`;
  }

  protected generateRelationshipId(): string {
    return `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected getCurrentEntityId(): string {
    return this.currentEntityStack[this.currentEntityStack.length - 1] || '';
  }

  protected pushCurrentEntity(entityId: string): void {
    this.currentEntityStack.push(entityId);
  }

  protected popCurrentEntity(): void {
    this.currentEntityStack.pop();
  }

  protected extractDocumentation(node: any): string | undefined {
    // Look for comments or documentation blocks before the node
    // This is a basic implementation that can be overridden
    return undefined;
  }
}
