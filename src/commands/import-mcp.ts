import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { validateYaml } from './validate.js';
import type { Tool } from '../core/model.js';

function fail(msg: string): never {
  throw new Error(msg);
}

const ALLOWED_TRUST_LEVELS = new Set(['internal', 'partner', 'external', 'untrusted']);

export function importMcpCommand(options: { 
  input: string; 
  mcpId: string; 
  toolsFile?: string; 
  trustLevel?: string; 
}): number {
  try {
    const inputPath = path.resolve(options.input);
    const trustLevel = options.trustLevel || 'external';

  // Validate --trust-level before any file I/O
  if (!ALLOWED_TRUST_LEVELS.has(trustLevel)) {
    fail(`Invalid --trust-level '${trustLevel}'. Must be one of: internal, partner, external, untrusted.`);
  }

  if (!fs.existsSync(inputPath)) {
    fail(`agentmodel file not found at ${inputPath}`);
  }

  const validation = validateYaml(inputPath);
  if (!validation.valid) {
    console.error(`Error: agentmodel validation failed before MCP import.`);
    validation.errors?.forEach((err) => console.error(`  - ${err}`));
    return 1;
  }

  const data = validation.data;
  if (!data) {
    fail(`Unable to parse agentmodel data.`);
  }

  if (!options.toolsFile) {
    fail(`Live MCP discovery is not implemented yet. Provide --tools-file with a JSON array from an MCP tools/list response.`);
  }

  const toolsFilePath = path.resolve(options.toolsFile);
  if (!fs.existsSync(toolsFilePath)) {
    fail(`Tools definition file not found at ${toolsFilePath}`);
  }

  let toolsToImport: unknown[];
  try {
    const content = fs.readFileSync(toolsFilePath, 'utf8');
    toolsToImport = JSON.parse(content);
  } catch (error: unknown) {
    fail(`Error reading tools file: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(toolsToImport)) {
    fail(`--tools-file must contain a JSON array of MCP tool definitions.`);
  }

  // Step 2: Validate each imported tool entry BEFORE mutating the model
  for (const t of toolsToImport) {
    if (!t || typeof (t as Record<string, unknown>).name !== 'string' || ((t as Record<string, unknown>).name as string).trim() === '') {
      fail(`Each MCP tool must have a non-empty string "name" field. Got: ${JSON.stringify(t)}`);
    }
  }

  // Step 3: Check for duplicate names within the imported batch
  const importedNames = new Set<string>();
  for (const t of toolsToImport) {
    const toolName = ((t as Record<string, unknown>).name as string).trim();
    if (importedNames.has(toolName)) {
      fail(`Duplicate imported MCP tool name: '${toolName}'. Each tool name must be unique.`);
    }
    importedNames.add(toolName);
  }

  // Step 4: Mutate the in-memory model
  if (!data.mcp_servers) {
    data.mcp_servers = [];
  }
  let mcp = data.mcp_servers.find((m) => m.id === options.mcpId);
  if (!mcp) {
    mcp = {
      id: options.mcpId,
      trust_level: trustLevel as 'internal' | 'partner' | 'external' | 'untrusted',
      exposes: []
    };
    data.mcp_servers.push(mcp);
  } else {
    mcp.trust_level = trustLevel as 'internal' | 'partner' | 'external' | 'untrusted';
    mcp.exposes = mcp.exposes || [];
  }

  data.tools = data.tools || [];
  const existingTools = new Set(data.tools.map((t) => t.id));

  for (const importedTool of toolsToImport as Record<string, unknown>[]) {
    const toolId = (importedTool.name as string).trim();

    // Link the tool to the MCP server
    if (mcp && mcp.exposes && !mcp.exposes.includes(toolId)) {
      mcp.exposes.push(toolId);
    }

    // Add to system tools catalog with full MCP metadata preserved
    if (!existingTools.has(toolId)) {
      const newTool: Record<string, unknown> = {
        id: toolId,
        type: 'api',
        description: importedTool.description ?? 'MCP exposed tool',
        risk: 'medium',
        requires_human_approval: false,
        source: {
          kind: 'mcp',
          mcp_server: options.mcpId,
          original_name: toolId
        }
      };

      // Preserve input_schema if present in the MCP tools/list response
      if (importedTool.inputSchema && typeof importedTool.inputSchema === 'object') {
        newTool.input_schema = importedTool.inputSchema;
      }

      // Preserve annotations if present
      if (importedTool.annotations && typeof importedTool.annotations === 'object') {
        const ann = importedTool.annotations as Record<string, unknown>;
        newTool.annotations = {
          ...(typeof ann.destructiveHint === 'boolean' && { destructive_hint: ann.destructiveHint }),
          ...(typeof ann.readOnlyHint === 'boolean' && { read_only_hint: ann.readOnlyHint }),
          ...(typeof ann.idempotentHint === 'boolean' && { idempotent_hint: ann.idempotentHint })
        };
      }

      data.tools.push(newTool as unknown as Tool);
      existingTools.add(toolId);
    }
  }

  // Step 5: Write to a temp file and re-validate BEFORE overwriting the original
  const tempPath = `${inputPath}.oam-import.tmp`;
  let updatedYaml: string;
  try {
    updatedYaml = yaml.dump(data, { lineWidth: 120 });
    fs.writeFileSync(tempPath, updatedYaml, 'utf8');
  } catch (error: unknown) {
    fail(`Failed to serialise updated model: ${error instanceof Error ? error.message : String(error)}`);
  }

  const postValidation = validateYaml(tempPath);
  if (!postValidation.valid) {
    fs.unlinkSync(tempPath); // Clean up temp file
    console.error(`Error: The imported tools produced an invalid agentmodel configuration.`);
    postValidation.errors?.forEach((err) => console.error(`  - ${err}`));
    return 1;
  }

  // Step 6: Atomically rename temp → original
  try {
    fs.renameSync(tempPath, inputPath);
  } catch (error: unknown) {
    fail(`Failed to write updated configuration: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`\n\x1b[32m✔ Successfully imported MCP server '${options.mcpId}' into ${options.input}:\x1b[0m`);
  console.log(`  - Trust zone boundary set to: \x1b[34m${trustLevel.toUpperCase()}\x1b[0m`);
  console.log(`  - Imported tool count:          \x1b[34m${toolsToImport.length}\x1b[0m`);
  console.log(`  - Updated configuration saved to ${options.input}\n`);
  return 0;
  } catch (error: unknown) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
