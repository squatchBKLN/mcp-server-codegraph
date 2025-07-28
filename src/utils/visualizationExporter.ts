import type { IndexResult } from '../core/CodeIndexer.js';

export class VisualizationExporter {
  
  static generateDotFormat(indexResult: IndexResult): string {
    const { nodes, links } = indexResult;
    
    // Filter to only file nodes for cleaner visualization
    const fileNodes = nodes.filter(node => node.type === 'File');
    
    let dotCode = 'digraph CodeGraph {\n';
    dotCode += '  // Graph settings\n';
    dotCode += '  rankdir=TB;\n';
    dotCode += '  node [shape=box, style=filled, fontname="Arial", fontsize=10];\n';
    dotCode += '  edge [fontname="Arial", fontsize=8];\n\n';
    
    // Add nodes with styling based on file type
    dotCode += '  // File nodes\n';
    for (const node of fileNodes) {
      const nodeId = this.sanitizeNodeId(node.id);
      const nodeLabel = this.getFileLabel(node.name);
      const nodeStyle = this.getDotNodeStyle(node.name);
      
      dotCode += `  ${nodeId} [label="${nodeLabel}"${nodeStyle}];\n`;
    }
    
    dotCode += '\n  // Dependencies\n';
    
    // Add relationships
    for (const link of links) {
      const sourceId = this.sanitizeNodeId(link.source_id);
      const targetId = this.sanitizeNodeId(link.target_id);
      const linkLabel = this.getDotLinkLabel(link);
      const linkStyle = this.getDotLinkStyle(link.type);
      
      dotCode += `  ${sourceId} -> ${targetId} [label="${linkLabel}"${linkStyle}];\n`;
    }
    
    // Add legend
    dotCode += '\n  // Legend\n';
    dotCode += '  subgraph cluster_legend {\n';
    dotCode += '    label="File Types";\n';
    dotCode += '    style=filled;\n';
    dotCode += '    fillcolor=lightgray;\n';
    dotCode += '    legend_pl [label=".pl (Script)", fillcolor="#e1f5fe", color="#01579b"];\n';
    dotCode += '    legend_pm [label=".pm (Module)", fillcolor="#f3e5f5", color="#4a148c"];\n';
    dotCode += '    legend_cgi [label=".cgi (CGI)", fillcolor="#fff3e0", color="#e65100"];\n';
    dotCode += '  }\n';
    
    dotCode += '}\n';
    
    return dotCode;
  }
  
  static generateD3JsonFormat(indexResult: IndexResult): string {
    const { nodes, links } = indexResult;
    
    // Convert nodes to D3.js format
    const d3Nodes = nodes.map(node => ({
      id: node.id,
      name: node.name,
      type: node.type,
      group: this.getD3NodeGroup(node),
      size: this.getD3NodeSize(node),
      color: this.getD3NodeColor(node),
      metadata: node.data
    }));
    
    // Convert links to D3.js format
    const d3Links = links.map(link => ({
      source: link.source_id,
      target: link.target_id,
      type: link.type,
      value: this.getD3LinkValue(link),
      label: this.getD3LinkLabel(link),
      metadata: link.data
    }));
    
    const d3Graph = {
      nodes: d3Nodes,
      links: d3Links,
      metadata: {
        generated: new Date().toISOString(),
        nodeCount: d3Nodes.length,
        linkCount: d3Links.length,
        fileCount: nodes.filter(n => n.type === 'File').length,
        description: "Perl codebase dependency graph in D3.js format"
      }
    };
    
    return JSON.stringify(d3Graph, null, 2);
  }
  
  static generateCytoscapeJsonFormat(indexResult: IndexResult): string {
    const { nodes, links } = indexResult;
    
    // Convert nodes to Cytoscape format
    const cyNodes = nodes.map(node => ({
      data: {
        id: node.id,
        name: node.name,
        type: node.type,
        group: this.getCytoscapeNodeGroup(node),
        metadata: node.data
      },
      classes: this.getCytoscapeNodeClasses(node)
    }));
    
    // Convert links to Cytoscape format
    const cyEdges = links.map((link, index) => ({
      data: {
        id: `edge_${index}`,
        source: link.source_id,
        target: link.target_id,
        type: link.type,
        label: this.getCytoscapeLinkLabel(link),
        metadata: link.data
      },
      classes: this.getCytoscapeLinkClasses(link)
    }));
    
    const cytoscapeGraph = {
      elements: {
        nodes: cyNodes,
        edges: cyEdges
      },
      style: this.getCytoscapeStylesheet(),
      layout: {
        name: 'cose',
        idealEdgeLength: 100,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 30,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
      },
      metadata: {
        generated: new Date().toISOString(),
        description: "Perl codebase dependency graph in Cytoscape.js format"
      }
    };
    
    return JSON.stringify(cytoscapeGraph, null, 2);
  }
  
  // Helper methods for DOT format
  private static sanitizeNodeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9]/g, '_');
  }
  
  private static getFileLabel(fileName: string): string {
    const parts = fileName.split('/');
    return parts[parts.length - 1];
  }
  
  private static getDotNodeStyle(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'pl':
        return ', fillcolor="#e1f5fe", color="#01579b"';
      case 'pm':
        return ', fillcolor="#f3e5f5", color="#4a148c"';
      case 'cgi':
        return ', fillcolor="#fff3e0", color="#e65100"';
      default:
        return ', fillcolor="#f5f5f5", color="#616161"';
    }
  }
  
  private static getDotLinkLabel(link: any): string {
    if (link.data?.importedModules) {
      return link.data.importedModules.slice(0, 2).join(', ');
    }
    return link.type;
  }
  
  private static getDotLinkStyle(linkType: string): string {
    switch (linkType) {
      case 'imports':
        return ', color="#2196f3", style=solid';
      case 'depends_on':
        return ', color="#ff9800", style=dashed';
      default:
        return ', color="#757575"';
    }
  }
  
  // Helper methods for D3.js format
  private static getD3NodeGroup(node: any): number {
    if (node.type === 'File') {
      const extension = node.name.split('.').pop()?.toLowerCase();
      switch (extension) {
        case 'pl': return 1;
        case 'pm': return 2;
        case 'cgi': return 3;
        default: return 0;
      }
    }
    return 4; // Entities
  }
  
  private static getD3NodeSize(node: any): number {
    if (node.type === 'File') return 20;
    return 10;
  }
  
  private static getD3NodeColor(node: any): string {
    if (node.type === 'File') {
      const extension = node.name.split('.').pop()?.toLowerCase();
      switch (extension) {
        case 'pl': return '#01579b';
        case 'pm': return '#4a148c';
        case 'cgi': return '#e65100';
        default: return '#616161';
      }
    }
    return '#757575';
  }
  
  private static getD3LinkValue(link: any): number {
    return link.data?.importedModules?.length || 1;
  }
  
  private static getD3LinkLabel(link: any): string {
    if (link.data?.importedModules) {
      return link.data.importedModules.join(', ');
    }
    return link.type;
  }
  
  // Helper methods for Cytoscape format
  private static getCytoscapeNodeGroup(node: any): string {
    if (node.type === 'File') {
      const extension = node.name.split('.').pop()?.toLowerCase();
      return `file_${extension}`;
    }
    return node.type.toLowerCase();
  }
  
  private static getCytoscapeNodeClasses(node: any): string {
    if (node.type === 'File') {
      const extension = node.name.split('.').pop()?.toLowerCase();
      return `file file-${extension}`;
    }
    return `entity entity-${node.type.toLowerCase()}`;
  }
  
  private static getCytoscapeLinkLabel(link: any): string {
    if (link.data?.importedModules) {
      return link.data.importedModules.join(', ');
    }
    return link.type;
  }
  
  private static getCytoscapeLinkClasses(link: any): string {
    return `edge edge-${link.type}`;
  }
  
  private static getCytoscapeStylesheet(): any[] {
    return [
      {
        selector: 'node',
        style: {
          'background-color': '#666',
          'label': 'data(name)',
          'font-size': '10px',
          'text-valign': 'center',
          'text-halign': 'center',
          'width': '30px',
          'height': '30px'
        }
      },
      {
        selector: 'node.file-pl',
        style: {
          'background-color': '#01579b',
          'shape': 'rectangle'
        }
      },
      {
        selector: 'node.file-pm',
        style: {
          'background-color': '#4a148c',
          'shape': 'rectangle'
        }
      },
      {
        selector: 'node.file-cgi',
        style: {
          'background-color': '#e65100',
          'shape': 'rectangle'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#ccc',
          'target-arrow-color': '#ccc',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'label': 'data(label)',
          'font-size': '8px'
        }
      },
      {
        selector: 'edge.edge-imports',
        style: {
          'line-color': '#2196f3',
          'target-arrow-color': '#2196f3'
        }
      }
    ];
  }
}
