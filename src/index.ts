#!/usr/bin/env node

import { writeFileSync, readFileSync } from 'fs';
import { join, normalize, resolve } from 'path';
import os from 'os';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { CodeIndexer } from './core/CodeIndexer.js';

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error("Usage: mcp-server-codegraph <directory>");
  process.exit(1);
}

function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

const directory = normalize(resolve(expandHome(args[0])));

const server = new Server(
  {
    name: "mcp-server-codegraph",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const ListFileEntitiesArgsSchema = z.object({
  path: z.string().describe("relative path of the file"),
});

const ListEntityRelationshipsArgsSchema = z.object({
  path: z.string().describe("relative path of the file entity appears in"),
  name: z.string().describe("name of entity"),
});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "index",
        description: "Indexes the codebase to create a graph of entities and relationships.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      {
        name: "list_file_entities",
        description:
          "Provides a list of all entities within a specified file. Returns a list of entities, including their names, types (e.g., Function, Class, Import), and locations (start and end lines). Use this to explore the contents of a file.",
        inputSchema: zodToJsonSchema(ListFileEntitiesArgsSchema) as ToolInput,
      },
      {
        name: "list_entity_relationships",
        description:
          "Lists the relationships (Calls, Inheritance, Implementations) of a specify entity. Returns details about the related entities (source and target) and the type of relationship. Use this to understand how an entity interacts with other parts of the code.",
        inputSchema: zodToJsonSchema(ListEntityRelationshipsArgsSchema) as ToolInput,
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "index": {
        try {
          const indexer = new CodeIndexer();
          const result = await indexer.indexDirectory(directory);
          
          // Write the result to index.json
          const indexPath = join(directory, "index.json");
          writeFileSync(indexPath, JSON.stringify(result, null, 2));
          
          return {
            content: [{ 
              type: "text", 
              text: `Successfully indexed ${result.nodes.length} nodes and ${result.links.length} relationships. Index saved to ${indexPath}` 
            }],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: `Error during indexing: ${errorMessage}` }],
            isError: true,
          };
        }
      }
      
      case "list_file_entities": {
        const parsedArgs = ListFileEntitiesArgsSchema.safeParse(args);
        if (!parsedArgs.success) {
          throw new Error(`Invalid arguments for list_file_entities: ${parsedArgs.error}`);
        }
        
        const filename = parsedArgs.data.path;
        const indexPath = join(directory, "index.json");
        
        try {
          const graph = JSON.parse(readFileSync(indexPath, "utf-8"));

          // Find the file node
          const fileNode = graph.nodes.find((node: any) => node.type === "File" && node.name === filename);

          if (!fileNode) {
            return {
              content: [{ type: "text", text: `File not found: ${filename}` }],
              isError: true,
            };
          }

          // Get entities recursively
          const getEntitiesRecursively = (nodeId: string, graph: any) => {
            const node = graph.nodes.find((n: any) => n.id === nodeId);

            if (!node) {
              console.warn(`Node with ID ${nodeId} not found in graph.`);
              return null;
            }

            const entity = {
              name: node.name,
              type: node.type,
              start: node.data.start,
              end: node.data.end,
            };

            return entity;
          };

          const entities = fileNode.data.children
            .map((childId: string) => getEntitiesRecursively(childId, graph))
            .filter((entity: any) => entity && entity.name);

          return {
            content: [{ type: "text", text: JSON.stringify(entities, null, 2) }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error reading index file: ${error}` }],
            isError: true,
          };
        }
      }
      
      case "list_entity_relationships": {
        const parsedArgs = ListEntityRelationshipsArgsSchema.safeParse(args);
        if (!parsedArgs.success) {
          throw new Error(`Invalid arguments for list_entity_relationships: ${parsedArgs.error}`);
        }
        
        const filename = parsedArgs.data.path;
        const entity_name = parsedArgs.data.name;
        const indexPath = join(directory, "index.json");
        
        try {
          const graph = JSON.parse(readFileSync(indexPath, "utf-8"));

          // Find the file node
          const fileNode = graph.nodes.find((node: any) => node.type === "File" && node.name === filename);

          if (!fileNode) {
            return {
              content: [{ type: "text", text: `File not found: ${filename}` }],
              isError: true,
            };
          }

          // Find the entity node
          const entityNode = graph.nodes.find((node: any) => {
            return node.name === entity_name && node.file_id === fileNode.id;
          });
          
          if (!entityNode) {
            return {
              content: [
                {
                  type: "text",
                  text: `Entity not found: ${entity_name} in ${filename}`,
                },
              ],
              isError: true,
            };
          }

          // For file-level relationships, find relationships where this file is involved
          const fileRelationships = graph.links
            .filter((link: any) => link.source_id === fileNode.id || link.target_id === fileNode.id)
            .map((link: any) => {
              const sourceFileNode = graph.nodes.find((node: any) => node.id === link.source_id);
              const targetFileNode = graph.nodes.find((node: any) => node.id === link.target_id);
              
              if (!sourceFileNode || !targetFileNode) {
                console.warn(`Source or target file not found for link: ${JSON.stringify(link)}`);
                return null;
              }

              return {
                type: link.type,
                source: {
                  name: sourceFileNode.name,
                  type: sourceFileNode.type,
                  file: sourceFileNode.name,
                },
                target: {
                  name: targetFileNode.name,
                  type: targetFileNode.type,
                  file: targetFileNode.name,
                },
                data: link.data,
              };
            })
            .filter((rel: any) => rel !== null);

          // Since we're looking for entity relationships but now only have file relationships,
          // return file relationships that involve this entity's file
          const relationships = fileRelationships;

          return {
            content: [{ type: "text", text: JSON.stringify(relationships, null, 2) }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error reading index file: ${error}` }],
            isError: true,
          };
        }
      }
      
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server CodeGraph running on stdio");
    console.error("directory:", directory);
  } catch (error) {
    console.error("Error during server setup:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
