import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { importMcpCommand } from './import-mcp.js';

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    destructiveHint?: boolean;
    readOnlyHint?: boolean;
    idempotentHint?: boolean;
  };
}

interface McpSnapshot {
  mcp_id: string;
  discovered_at: string;
  server?: {
    command: string;
    args: string[];
  };
  tools: McpTool[];
}

function fail(msg: string): never {
  throw new Error(msg);
}

function parseArgsString(args: string): string[] {
  const parsed: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaping = false;

  for (const char of args) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        parsed.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += '\\';
  }

  if (quote) {
    fail(`Unterminated quote in --args.`);
  }

  if (current.length > 0) {
    parsed.push(current);
  }

  return parsed;
}

function validateDiscoveredTools(tools: unknown): McpTool[] {
  if (!Array.isArray(tools)) {
    fail(`MCP discovery response must contain a tools array.`);
  }

  for (const tool of tools) {
    if (!tool || typeof (tool as Record<string, unknown>).name !== 'string' || ((tool as Record<string, unknown>).name as string).trim() === '') {
      fail(`Each discovered MCP tool must have a non-empty string "name" field. Got: ${JSON.stringify(tool)}`);
    }
  }

  return tools as McpTool[];
}

function queryMcpServer(command: string, args: string[], timeoutMs: number = 10000): Promise<McpTool[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let buffer = '';
    let stderr = '';
    let isFinished = false;
    let currentId = 1;
    const pendingRequests = new Map<number, (res: any) => void>();

    const cleanupAndReject = (err: Error) => {
      if (isFinished) return;
      isFinished = true;
      try {
        child.kill();
      } catch {}
      reject(err);
    };

    const timer = setTimeout(() => {
      const stderrContext = stderr.trim() ? ` Stderr: ${stderr.trim()}` : '';
      cleanupAndReject(new Error(`MCP server query timed out after ${timeoutMs}ms.${stderrContext}`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      cleanupAndReject(new Error(`Failed to start MCP server: ${err.message}`));
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code, signal) => {
      if (isFinished) return;
      const status = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
      const stderrContext = stderr.trim() ? ` Stderr: ${stderr.trim()}` : '';
      clearTimeout(timer);
      cleanupAndReject(new Error(`MCP server closed before discovery completed (${status}).${stderrContext}`));
    });

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIdx).trim();
        buffer = buffer.substring(newlineIdx + 1);
        if (line) {
          try {
            const message = JSON.parse(line);
            if (message.id !== undefined && pendingRequests.has(message.id)) {
              const callback = pendingRequests.get(message.id);
              if (callback) {
                pendingRequests.delete(message.id);
                callback(message);
              }
            }
          } catch (e) {
            // Ignore parse errors for intermediate outputs
          }
        }
      }
    });

    const sendRequest = (method: string, params: any): Promise<any> => {
      const id = currentId++;
      const msg = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      }) + '\n';

      return new Promise((resolveReq) => {
        pendingRequests.set(id, resolveReq);
        child.stdin.write(msg);
      });
    };

    const sendNotification = (method: string, params: any) => {
      const msg = JSON.stringify({
        jsonrpc: '2.0',
        method,
        params
      }) + '\n';
      child.stdin.write(msg);
    };

    (async () => {
      try {
        // 1. Initialize
        const initRes = await sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'oam-client', version: '0.3.0' }
        });

        if (initRes.error) {
          throw new Error(`Initialize error: ${JSON.stringify(initRes.error)}`);
        }

        // 2. Initialized Notification
        sendNotification('notifications/initialized', {});

        // 3. List tools
        const toolsRes = await sendRequest('tools/list', {});
        if (toolsRes.error) {
          throw new Error(`Tools list error: ${JSON.stringify(toolsRes.error)}`);
        }

        const toolsList = validateDiscoveredTools(toolsRes.result?.tools || []);

        isFinished = true;
        clearTimeout(timer);
        child.kill();
        resolve(toolsList);
      } catch (err: unknown) {
        clearTimeout(timer);
        cleanupAndReject(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });
}

export async function discoverMcpCommand(options: {
  mcpId: string;
  toolsFile?: string;
  server?: string;
  args?: string;
  arg?: string[];
  out?: string;
  snapshot?: string;
  trustLevel?: string;
  normalizeIds?: boolean;
}): Promise<number> {
  try {
    const mcpId = options.mcpId?.trim();
    if (!mcpId) {
      fail(`--mcp-id must be a non-empty identifier.`);
    }

    let tools: McpTool[] = [];
    let serverCommand = '';
    let serverArgs: string[] = [];

    if (options.server) {
      serverCommand = options.server;
      serverArgs = options.arg && options.arg.length > 0
        ? options.arg
        : options.args
          ? parseArgsString(options.args)
          : [];
      console.log(`Connecting to MCP server via stdio: ${serverCommand} ${serverArgs.join(' ')}...`);
      tools = await queryMcpServer(serverCommand, serverArgs);
    } else if (options.toolsFile) {
      const toolsPath = path.resolve(options.toolsFile);
      if (!fs.existsSync(toolsPath)) {
        fail(`Tools file not found: ${toolsPath}`);
      }
      const content = fs.readFileSync(toolsPath, 'utf8');
      tools = validateDiscoveredTools(JSON.parse(content));
    } else {
      fail(`Either --server or --tools-file must be provided for discovery.`);
    }

    console.log(`Discovered ${tools.length} tool(s) from MCP server '${mcpId}'.`);

    // Generate snapshot file if requested
    if (options.snapshot) {
      const snapshotPath = path.resolve(options.snapshot);
      const snapshot: McpSnapshot = {
        mcp_id: mcpId,
        discovered_at: new Date().toISOString(),
        tools
      };
      if (options.server) {
        snapshot.server = {
          command: serverCommand,
          args: serverArgs
        };
      }
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
      console.log(`Saved MCP snapshot JSON to: ${snapshotPath}`);
    }

    // Merge directly into agentmodel.yaml if requested
    if (options.out) {
      const outputPath = path.resolve(options.out);
      const tempToolsFile = path.join(path.dirname(outputPath), `.discover-temp-${mcpId}.json`);
      fs.writeFileSync(tempToolsFile, JSON.stringify(tools), 'utf8');

      try {
        const importCode = importMcpCommand({
          input: outputPath,
          mcpId: mcpId,
          toolsFile: tempToolsFile,
          trustLevel: options.trustLevel || 'external',
          normalizeIds: options.normalizeIds || false
        });
        if (importCode !== 0) {
          fail(`Failed to import tools into ${options.out}`);
        }
      } finally {
        if (fs.existsSync(tempToolsFile)) {
          fs.unlinkSync(tempToolsFile);
        }
      }
    }

    return 0;
  } catch (error: unknown) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
