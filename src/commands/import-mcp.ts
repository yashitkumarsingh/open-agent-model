import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { validateYaml } from './validate.js';

export function importMcpCommand(options: { 
  input: string; 
  mcpId: string; 
  toolsFile?: string; 
  trustLevel?: string; 
}) {
  const inputPath = path.resolve(options.input);
  const trustLevel = options.trustLevel || 'external';

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: agentmodel file not found at ${inputPath}`);
    process.exit(1);
  }

  // Load and parse YAML
  const validation = validateYaml(inputPath);
  const data = validation.data;
  if (!data) {
    console.error(`Error: Unable to parse agentmodel data.`);
    process.exit(1);
  }

  // Load mock or queried tools list
  let toolsToImport: any[] = [];
  if (options.toolsFile) {
    const toolsFilePath = path.resolve(options.toolsFile);
    if (!fs.existsSync(toolsFilePath)) {
      console.error(`Error: Tools definition file not found at ${toolsFilePath}`);
      process.exit(1);
    }
    try {
      const content = fs.readFileSync(toolsFilePath, 'utf8');
      toolsToImport = JSON.parse(content); // Expects array of tools matching MCP tools/list output
    } catch (error: any) {
      console.error(`Error reading tools file: ${error?.message || error}`);
      process.exit(1);
    }
  } else {
    // Standard mock tools from MCP list tool request
    toolsToImport = [
      {
        name: `${options.mcpId}-status-check`,
        description: `Exposed status checks for ${options.mcpId} integration.`,
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: `${options.mcpId}-sync-notes`,
        description: `Sync notes for customers via ${options.mcpId}.`,
        inputSchema: { type: "object", properties: { customer_id: { type: "string" } } }
      }
    ];
  }

  // 1. Update or create MCP Server declaration
  if (!data.mcp_servers) {
    data.mcp_servers = [];
  }
  let mcp = data.mcp_servers.find((m) => m.id === options.mcpId);
  if (!mcp) {
    mcp = {
      id: options.mcpId,
      trust_level: trustLevel as any,
      exposes: []
    };
    data.mcp_servers.push(mcp);
  } else {
    mcp.trust_level = trustLevel as any;
    mcp.exposes = mcp.exposes || [];
  }

  // 2. Add tools to system tools list and link them to MCP
  data.tools = data.tools || [];
  const existingTools = new Set(data.tools.map((t) => t.id));

  toolsToImport.forEach((importedTool: any) => {
    const toolId = importedTool.name;
    
    // Add to tool exposures on MCP server
    if (mcp && mcp.exposes && !mcp.exposes.includes(toolId)) {
      mcp.exposes.push(toolId);
    }

    // Add to system tools catalog if not already present
    if (!existingTools.has(toolId)) {
      data.tools?.push({
        id: toolId,
        type: 'api',
        description: importedTool.description || 'MCP exposed tool',
        risk: 'medium',
        requires_human_approval: false
      });
    }
  });

  // 3. Write back modified YAML model
  try {
    const updatedYaml = yaml.dump(data, { lineWidth: 120 });
    fs.writeFileSync(inputPath, updatedYaml, 'utf8');
    console.log(`\n\x1b[32m✔ Successfully imported MCP server '${options.mcpId}' into ${options.input}:\x1b[0m`);
    console.log(`  - Trust zone boundary set to: \x1b[34m${trustLevel.toUpperCase()}\x1b[0m`);
    console.log(`  - Imported tool count:          \x1b[34m${toolsToImport.length}\x1b[0m`);
    console.log(`  - Updated configuration saved to ${options.input}\n`);
  } catch (error: any) {
    console.error(`Error saving updated YAML configuration: ${error?.message || error}`);
    process.exit(1);
  }
}
