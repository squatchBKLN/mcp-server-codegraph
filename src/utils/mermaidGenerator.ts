import type { IndexResult } from '../core/CodeIndexer.js';

export class MermaidGenerator {
  
  static generateDependencyDiagram(indexResult: IndexResult): string {
    const { nodes, links } = indexResult;
    
    // Filter to only file nodes for the dependency diagram
    const fileNodes = nodes.filter(node => node.type === 'File');
    
    let mermaidCode = 'graph TD\n';
    
    // Add nodes with clean labels
    for (const node of fileNodes) {
      const nodeId = this.sanitizeNodeId(node.id);
      const nodeLabel = this.getFileLabel(node.name);
      const nodeStyle = this.getNodeStyle(node.name);
      
      mermaidCode += `    ${nodeId}["${nodeLabel}"]${nodeStyle}\n`;
    }
    
    // Add relationships
    for (const link of links) {
      const sourceId = this.sanitizeNodeId(link.source_id);
      const targetId = this.sanitizeNodeId(link.target_id);
      const linkLabel = this.getLinkLabel(link);
      
      mermaidCode += `    ${sourceId} -->${linkLabel} ${targetId}\n`;
    }
    
    // Add styling
    mermaidCode += this.getStyleDefinitions();
    
    return mermaidCode;
  }
  
  static generateEntityDiagram(indexResult: IndexResult): string {
    const { nodes, links } = indexResult;
    
    let mermaidCode = 'graph TD\n';
    
    // Group entities by file
    const fileGroups = new Map<string, any[]>();
    
    for (const node of nodes) {
      if (node.type === 'File') {
        fileGroups.set(node.id, []);
      }
    }
    
    for (const node of nodes) {
      if (node.type !== 'File' && node.file_id) {
        const group = fileGroups.get(node.file_id);
        if (group) {
          group.push(node);
        }
      }
    }
    
    // Create subgraphs for each file
    let subgraphIndex = 0;
    for (const [fileId, entities] of fileGroups) {
      const fileNode = nodes.find(n => n.id === fileId);
      if (!fileNode) continue;
      
      const fileName = this.getFileLabel(fileNode.name);
      mermaidCode += `    subgraph SG${subgraphIndex}["${fileName}"]\n`;
      
      for (const entity of entities) {
        const entityId = this.sanitizeNodeId(entity.id);
        const entityLabel = entity.name;
        const entityStyle = this.getEntityStyle(entity.type);
        
        mermaidCode += `        ${entityId}["${entityLabel}"]${entityStyle}\n`;
      }
      
      mermaidCode += `    end\n`;
      subgraphIndex++;
    }
    
    // Add file-level relationships
    for (const link of links) {
      const sourceId = this.sanitizeNodeId(link.source_id);
      const targetId = this.sanitizeNodeId(link.target_id);
      const linkLabel = this.getLinkLabel(link);
      
      mermaidCode += `    ${sourceId} -.${linkLabel}.- ${targetId}\n`;
    }
    
    // Add styling
    mermaidCode += this.getStyleDefinitions();
    
    return mermaidCode;
  }
  
  private static sanitizeNodeId(id: string): string {
    // Replace special characters with underscores for valid Mermaid node IDs
    return id.replace(/[^a-zA-Z0-9]/g, '_');
  }
  
  private static getFileLabel(fileName: string): string {
    // Extract just the filename from the path for cleaner display
    const parts = fileName.split('/');
    return parts[parts.length - 1];
  }
  
  private static getNodeStyle(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'pl':
        return ':::perlScript';
      case 'pm':
        return ':::perlModule';
      case 'cgi':
        return ':::cgiScript';
      default:
        return ':::defaultFile';
    }
  }
  
  private static getEntityStyle(entityType: string): string {
    switch (entityType.toLowerCase()) {
      case 'class':
        return ':::classEntity';
      case 'import':
        return ':::importEntity';
      case 'function':
        return ':::functionEntity';
      default:
        return ':::defaultEntity';
    }
  }
  
  private static getLinkLabel(link: any): string {
    if (link.type === 'imports' && link.data?.importedModules) {
      const modules = link.data.importedModules.slice(0, 2); // Show max 2 modules
      const label = modules.join(', ');
      return link.data.importedModules.length > 2 ? `|"${label}..."|` : `|"${label}"|`;
    }
    return `|"${link.type}"|`;
  }
  
  private static getStyleDefinitions(): string {
    return `
    classDef perlScript fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef perlModule fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef cgiScript fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef defaultFile fill:#f5f5f5,stroke:#616161,stroke-width:1px
    
    classDef classEntity fill:#e8f5e8,stroke:#2e7d32,stroke-width:1px
    classDef importEntity fill:#fff8e1,stroke:#f57c00,stroke-width:1px
    classDef functionEntity fill:#e3f2fd,stroke:#1565c0,stroke-width:1px
    classDef defaultEntity fill:#fafafa,stroke:#757575,stroke-width:1px
`;
  }
}
