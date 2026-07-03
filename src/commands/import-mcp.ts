import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { validateYaml } from './validate.js';
import type { Tool } from '../core/model.js';

export function normalizeToolId(mcpId: string, originalName: string): string {
  const cleanName = originalName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, '-');

  // Merge multiple hyphens and trim
  const dedupedName = cleanName.replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!dedupedName) {
    fail(`MCP tool name '${originalName}' cannot be normalized into a valid OpenAgentModel ID.`);
  }

  return `${mcpId}.${dedupedName}`;
}

function fail(msg: string): never {
  throw new Error(msg);
}

const ALLOWED_TRUST_LEVELS = new Set(['internal', 'partner', 'external', 'untrusted']);

export function importMcpCommand(options: { 
  input: string; 
  mcpId: string; 
  toolsFile?: string; 
  trustLevel?: string; 
  normalizeIds?: boolean;
}): number {
  try {
    const inputPath = path.resolve(options.input);
    const trustLevel = options.trustLevel || 'external';

    const mcpId = options.mcpId?.trim();
    if (!mcpId) {
      fail(`--mcp-id must be a non-empty identifier.`);
    }

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
  let mcp = data.mcp_servers.find((m) => m.id === mcpId);
  if (!mcp) {
    mcp = {
      id: mcpId,
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
  const importedToolIds = new Set<string>();

  for (const importedTool of toolsToImport as Record<string, unknown>[]) {
    const originalName = (importedTool.name as string).trim();
    let toolId = originalName;

    if (options.normalizeIds) {
      toolId = normalizeToolId(mcpId, originalName);
      const baseId = toolId;
      let counter = 1;

      while (existingTools.has(toolId) || importedToolIds.has(toolId)) {
        // If same MCP server and same original name, it's the exact same tool re-import
        const existingToolObj = data.tools.find(t => t.id === toolId);
        if (existingToolObj && (existingToolObj as any).source?.kind === 'mcp' && (existingToolObj as any).source?.mcp_server === mcpId && (existingToolObj as any).source?.original_name === originalName) {
          break;
        }
        toolId = `${baseId}-${counter}`;
        counter++;
      }
    }

    importedToolIds.add(toolId);

    // Link the tool to the MCP server
    if (mcp && mcp.exposes && !mcp.exposes.includes(toolId)) {
      mcp.exposes.push(toolId);
    }

    const existingToolObj = data.tools.find((t) => t.id === toolId) as unknown as Record<string, unknown> | undefined;
    const isSameImportedTool = existingToolObj
      && (existingToolObj.source as Record<string, unknown> | undefined)?.kind === 'mcp'
      && (existingToolObj.source as Record<string, unknown> | undefined)?.mcp_server === mcpId
      && (existingToolObj.source as Record<string, unknown> | undefined)?.original_name === originalName;

    if (existingToolObj && !isSameImportedTool) {
      fail(`MCP tool '${originalName}' maps to existing non-matching tool ID '${toolId}'. Use --normalize-ids or rename the existing tool.`);
    }

    const targetTool: Record<string, unknown> = existingToolObj || {
      id: toolId,
      type: 'api',
      risk: 'medium',
      requires_human_approval: false
    };

    targetTool.description = importedTool.description ?? 'MCP exposed tool';
    targetTool.source = {
      kind: 'mcp',
      mcp_server: mcpId,
      original_name: originalName
    };

    // Preserve input_schema if present in the MCP tools/list response; remove stale schemas on re-import.
    if (importedTool.inputSchema && typeof importedTool.inputSchema === 'object') {
      targetTool.input_schema = importedTool.inputSchema;
    } else {
      delete targetTool.input_schema;
    }

    // Preserve annotations if present; remove stale annotations on re-import when the server no longer exposes them.
    if (importedTool.annotations && typeof importedTool.annotations === 'object') {
      const ann = importedTool.annotations as Record<string, unknown>;
      const annotations = {
        ...(typeof ann.destructiveHint === 'boolean' && { destructive_hint: ann.destructiveHint }),
        ...(typeof ann.readOnlyHint === 'boolean' && { read_only_hint: ann.readOnlyHint }),
        ...(typeof ann.idempotentHint === 'boolean' && { idempotent_hint: ann.idempotentHint })
      };
      if (Object.keys(annotations).length > 0) {
        targetTool.annotations = annotations;
      } else {
        delete targetTool.annotations;
      }
    } else {
      delete targetTool.annotations;
    }

    // Add to system tools catalog with full MCP metadata preserved
    if (!existingToolObj) {
      data.tools.push(targetTool as unknown as Tool);
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
