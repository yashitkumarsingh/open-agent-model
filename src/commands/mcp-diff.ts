import fs from 'fs';
import path from 'path';

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

function fail(msg: string): never {
  throw new Error(msg);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(objA[key], objB[key])) return false;
    }
    return true;
  }
  return false;
}

function safeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '?');
}

function loadToolsFromSnapshot(filePath: string): McpTool[] {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Snapshot file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (error: unknown) {
    fail(`Failed to parse JSON file '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
  }

  if (Array.isArray(data)) {
    return data as McpTool[];
  }

  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).tools)) {
    return (data as Record<string, unknown>).tools as McpTool[];
  }

  fail(`File '${filePath}' does not contain a valid MCP tools array or snapshot.`);
}

export function mcpDiffCommand(options: { before: string; after: string; failOn?: string }): number {
  try {
    const beforeTools = loadToolsFromSnapshot(options.before);
    const afterTools = loadToolsFromSnapshot(options.after);

    const beforeMap = new Map<string, McpTool>(beforeTools.map((t) => [t.name.trim(), t]));
    const afterMap = new Map<string, McpTool>(afterTools.map((t) => [t.name.trim(), t]));

    const added: string[] = [];
    const removed: string[] = [];
    const modified: {
      name: string;
      descChange?: { before?: string; after?: string };
      annotationChange?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
      schemaChange?: boolean;
    }[] = [];

    // Check for additions and modifications
    for (const [name, afterTool] of afterMap.entries()) {
      const beforeTool = beforeMap.get(name);
      if (!beforeTool) {
        added.push(name);
      } else {
        let isModified = false;
        const change: (typeof modified)[number] = { name };

        // 1. Check description change
        if (beforeTool.description !== afterTool.description) {
          change.descChange = { before: beforeTool.description, after: afterTool.description };
          isModified = true;
        }

        // 2. Check annotations change
        const beforeAnn = beforeTool.annotations || {};
        const afterAnn = afterTool.annotations || {};
        if (!deepEqual(beforeAnn, afterAnn)) {
          change.annotationChange = { before: beforeAnn, after: afterAnn };
          isModified = true;
        }

        // 3. Check schema change
        if (!deepEqual(beforeTool.inputSchema, afterTool.inputSchema)) {
          change.schemaChange = true;
          isModified = true;
        }

        if (isModified) {
          modified.push(change);
        }
      }
    }

    // Check for removals
    for (const name of beforeMap.keys()) {
      if (!afterMap.has(name)) {
        removed.push(name);
      }
    }

    console.log(`Comparing MCP snapshot: \x1b[34m${options.before}\x1b[0m ➔ \x1b[34m${options.after}\x1b[0m`);
    console.log(`Changes detected:`);
    console.log(`  - Added tools:    \x1b[32m${added.length}\x1b[0m`);
    console.log(`  - Removed tools:  \x1b[31m${removed.length}\x1b[0m`);
    console.log(`  - Modified tools: \x1b[33m${modified.length}\x1b[0m\n`);

    if (added.length > 0) {
      console.log(`\x1b[32m✚ Added Tools:\x1b[0m`);
      added.forEach((t) => {
        const tool = afterMap.get(t);
        console.log(`  - \x1b[32m${safeText(t)}\x1b[0m: ${safeText(tool?.description || '(No description)')}`);
      });
      console.log();
    }

    if (removed.length > 0) {
      console.log(`\x1b[31m➖ Removed Tools:\x1b[0m`);
      removed.forEach((t) => {
        const tool = beforeMap.get(t);
        console.log(`  - \x1b[31m${safeText(t)}\x1b[0m: ${safeText(tool?.description || '(No description)')}`);
      });
      console.log();
    }

    if (modified.length > 0) {
      console.log(`\x1b[33m⚡ Modified Tools:\x1b[0m`);
      modified.forEach((change) => {
        console.log(`  - \x1b[33m${safeText(change.name)}\x1b[0m:`);
        if (change.descChange) {
          console.log(`    * Description modified:`);
          console.log(`      Before: "${safeText(change.descChange.before || '')}"`);
          console.log(`      After:  "${safeText(change.descChange.after || '')}"`);
        }
        if (change.annotationChange) {
          console.log(`    * Annotations modified:`);
          console.log(`      Before: ${safeText(JSON.stringify(change.annotationChange.before))}`);
          console.log(`      After:  ${safeText(JSON.stringify(change.annotationChange.after))}`);
        }
        if (change.schemaChange) {
          console.log(`    * inputSchema signature altered`);
        }
      });
      console.log();
    }

    if (added.length === 0 && removed.length === 0 && modified.length === 0) {
      console.log(`\x1b[32m✔ No changes detected between MCP tool snapshots.\x1b[0m\n`);
    }

    // failOn logic
    let shouldFail = false;
    if (options.failOn) {
      const failFlags = options.failOn.split(',').map((f) => f.trim().toLowerCase());
      for (const flag of failFlags) {
        if (flag === 'added' && added.length > 0) {
          shouldFail = true;
        }
        if (flag === 'removed' && removed.length > 0) {
          shouldFail = true;
        }
        if (flag === 'schema-change' && modified.some(m => m.schemaChange)) {
          shouldFail = true;
        }
        if (flag === 'destructive-change') {
          const hasDestructiveModified = modified.some(m => {
            const afterAnn = m.annotationChange?.after;
            return afterAnn && (afterAnn.destructive_hint === true || afterAnn.destructiveHint === true);
          });
          const hasDestructiveAdded = added.some(name => {
            const tool = afterMap.get(name);
            return tool?.annotations && (tool.annotations.destructiveHint === true || (tool.annotations as any).destructive_hint === true);
          });
          if (hasDestructiveModified || hasDestructiveAdded) {
            shouldFail = true;
          }
        }
      }
    }

    if (shouldFail) {
      console.error(`\x1b[31m✖ MCP snapshot comparison failed quality gates specified by --fail-on.\x1b[0m\n`);
      return 1;
    }

    return 0;
  } catch (error: unknown) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
