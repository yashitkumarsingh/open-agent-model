import fs from 'fs';
import path from 'path';

interface BomTool {
  id: string;
  type: string;
  description?: string;
  risk?: string;
  side_effect?: string;
  auth_identity?: string;
  required_scopes?: string[];
  requires_human_approval?: boolean;
  approval?: unknown;
  rate_limit?: unknown;
  data_classes?: string[];
  source?: unknown;
  input_schema?: unknown;
  annotations?: unknown;
}

interface BomAgent {
  id: string;
  purpose?: string;
  model?: string;
  framework?: string;
  autonomy?: string;
  memory?: unknown;
  allowed_tools?: string[];
  denied_tools?: string[];
  approval_required_for?: string[];
  allowed_delegates?: string[];
  retry_policy?: unknown;
  spend_limit?: unknown;
}

interface BomFinding {
  id: string;
  ruleId: string;
  severity: string;
  message: string;
}

interface Bom {
  system?: string;
  version?: string;
  riskSummary?: {
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  models?: unknown[];
  identities?: unknown[];
  data_classes?: unknown[];
  policies?: unknown[];
  agents?: BomAgent[];
  tools?: BomTool[];
  findings?: BomFinding[];
}

function fail(msg: string): never {
  throw new Error(msg);
}

function loadBom(filePath: string): Bom {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Agent-BOM file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  try {
    return JSON.parse(content) as Bom;
  } catch (error: unknown) {
    fail(`Failed to parse Agent-BOM file '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
  }
}

function arrayDiff(base: string[] = [], head: string[] = []): { added: string[]; removed: string[] } {
  const baseSet = new Set(base);
  const headSet = new Set(head);
  return {
    added: head.filter((x) => !baseSet.has(x)),
    removed: base.filter((x) => !headSet.has(x))
  };
}

export function bomDiffCommand(options: { base: string; head: string }): number {
  try {
    const base = loadBom(options.base);
    const head = loadBom(options.head);

    console.log(`Comparing Agent-BOM baseline: \x1b[34m${options.base}\x1b[0m ➔ \x1b[34m${options.head}\x1b[0m\n`);

    // 1. Compare Tools Catalog
    const baseTools = new Map<string, BomTool>((base.tools || []).map((t) => [t.id, t]));
    const headTools = new Map<string, BomTool>((head.tools || []).map((t) => [t.id, t]));

    const addedTools: string[] = [];
    const removedTools: string[] = [];
    const modifiedTools: {
      id: string;
      riskChange?: { before?: string; after?: string };
      approvalChange?: { before?: boolean; after?: boolean };
      scopesChange?: { added: string[]; removed: string[] };
    }[] = [];

    for (const [id, hTool] of headTools.entries()) {
      const bTool = baseTools.get(id);
      if (!bTool) {
        addedTools.push(id);
      } else {
        let isModified = false;
        const change: (typeof modifiedTools)[number] = { id };

        if (bTool.risk !== hTool.risk) {
          change.riskChange = { before: bTool.risk, after: hTool.risk };
          isModified = true;
        }

        if (bTool.requires_human_approval !== hTool.requires_human_approval) {
          change.approvalChange = { before: bTool.requires_human_approval, after: hTool.requires_human_approval };
          isModified = true;
        }

        const scopeDiff = arrayDiff(bTool.required_scopes || [], hTool.required_scopes || []);
        if (scopeDiff.added.length > 0 || scopeDiff.removed.length > 0) {
          change.scopesChange = scopeDiff;
          isModified = true;
        }

        if (isModified) {
          modifiedTools.push(change);
        }
      }
    }

    for (const id of baseTools.keys()) {
      if (!headTools.has(id)) {
        removedTools.push(id);
      }
    }

    // 2. Compare Agents Catalog
    const baseAgents = new Map<string, BomAgent>((base.agents || []).map((a) => [a.id, a]));
    const headAgents = new Map<string, BomAgent>((head.agents || []).map((a) => [a.id, a]));

    const addedAgents: string[] = [];
    const removedAgents: string[] = [];
    const modifiedAgents: {
      id: string;
      modelChange?: { before?: string; after?: string };
      autonomyChange?: { before?: string; after?: string };
      toolsChange?: { added: string[]; removed: string[] };
      delegatesChange?: { added: string[]; removed: string[] };
    }[] = [];

    for (const [id, hAgent] of headAgents.entries()) {
      const bAgent = baseAgents.get(id);
      if (!bAgent) {
        addedAgents.push(id);
      } else {
        let isModified = false;
        const change: (typeof modifiedAgents)[number] = { id };

        if (bAgent.model !== hAgent.model) {
          change.modelChange = { before: bAgent.model, after: hAgent.model };
          isModified = true;
        }

        if (bAgent.autonomy !== hAgent.autonomy) {
          change.autonomyChange = { before: bAgent.autonomy, after: hAgent.autonomy };
          isModified = true;
        }

        const toolDiff = arrayDiff(bAgent.allowed_tools || [], hAgent.allowed_tools || []);
        if (toolDiff.added.length > 0 || toolDiff.removed.length > 0) {
          change.toolsChange = toolDiff;
          isModified = true;
        }

        const delegateDiff = arrayDiff(bAgent.allowed_delegates || [], hAgent.allowed_delegates || []);
        if (delegateDiff.added.length > 0 || delegateDiff.removed.length > 0) {
          change.delegatesChange = delegateDiff;
          isModified = true;
        }

        if (isModified) {
          modifiedAgents.push(change);
        }
      }
    }

    for (const id of baseAgents.keys()) {
      if (!headAgents.has(id)) {
        removedAgents.push(id);
      }
    }

    // 3. Compare Findings
    // Findings are uniquely identified by ruleId + message
    const makeFindingKey = (f: BomFinding) => `${f.ruleId}:${f.message}`;
    const baseFindings = new Map<string, BomFinding>((base.findings || []).map((f) => [makeFindingKey(f), f]));
    const headFindings = new Map<string, BomFinding>((head.findings || []).map((f) => [makeFindingKey(f), f]));

    const newFindings: BomFinding[] = [];
    const resolvedFindings: BomFinding[] = [];

    for (const [key, hFinding] of headFindings.entries()) {
      if (!baseFindings.has(key)) {
        newFindings.push(hFinding);
      }
    }

    for (const [key, bFinding] of baseFindings.entries()) {
      if (!headFindings.has(key)) {
        resolvedFindings.push(bFinding);
      }
    }

    // 4. Output Results
    console.log(`\x1b[1m=== Agent-BOM Delta Analysis ===\x1b[22m`);
    
    // Tools output
    if (addedTools.length > 0 || removedTools.length > 0 || modifiedTools.length > 0) {
      console.log(`\n\x1b[35m🛠 Tools Catalog Changes:\x1b[0m`);
      addedTools.forEach(t => console.log(`  - \x1b[32m[+] Tool Added\x1b[0m:      ${t}`));
      removedTools.forEach(t => console.log(`  - \x1b[31m[-] Tool Removed\x1b[0m:    ${t}`));
      modifiedTools.forEach(change => {
        console.log(`  - \x1b[33m[*] Tool Modified\x1b[0m:   ${change.id}`);
        if (change.riskChange) {
          console.log(`      * Risk rating:           ${change.riskChange.before || 'none'} ➔ \x1b[31m${change.riskChange.after || 'none'}\x1b[0m`);
        }
        if (change.approvalChange) {
          console.log(`      * Human approval:        ${change.approvalChange.before} ➔ ${change.approvalChange.after}`);
        }
        if (change.scopesChange) {
          if (change.scopesChange.added.length > 0) {
            console.log(`      * Scopes granted:        \x1b[32m${change.scopesChange.added.join(', ')}\x1b[0m`);
          }
          if (change.scopesChange.removed.length > 0) {
            console.log(`      * Scopes revoked:        \x1b[31m${change.scopesChange.removed.join(', ')}\x1b[0m`);
          }
        }
      });
    }

    // Agents output
    if (addedAgents.length > 0 || removedAgents.length > 0 || modifiedAgents.length > 0) {
      console.log(`\n\x1b[35m🤖 Agents Catalog Changes:\x1b[0m`);
      addedAgents.forEach(a => console.log(`  - \x1b[32m[+] Agent Added\x1b[0m:     ${a}`));
      removedAgents.forEach(a => console.log(`  - \x1b[31m[-] Agent Removed\x1b[0m:   ${a}`));
      modifiedAgents.forEach(change => {
        console.log(`  - \x1b[33m[*] Agent Modified\x1b[0m:  ${change.id}`);
        if (change.modelChange) {
          console.log(`      * Model binding:         ${change.modelChange.before || 'none'} ➔ ${change.modelChange.after || 'none'}`);
        }
        if (change.autonomyChange) {
          console.log(`      * Autonomy:              ${change.autonomyChange.before || 'none'} ➔ ${change.autonomyChange.after || 'none'}`);
        }
        if (change.toolsChange) {
          if (change.toolsChange.added.length > 0) {
            console.log(`      * Tool access granted:   \x1b[32m${change.toolsChange.added.join(', ')}\x1b[0m`);
          }
          if (change.toolsChange.removed.length > 0) {
            console.log(`      * Tool access revoked:   \x1b[31m${change.toolsChange.removed.join(', ')}\x1b[0m`);
          }
        }
        if (change.delegatesChange) {
          if (change.delegatesChange.added.length > 0) {
            console.log(`      * Delegate added:        \x1b[32m${change.delegatesChange.added.join(', ')}\x1b[0m`);
          }
          if (change.delegatesChange.removed.length > 0) {
            console.log(`      * Delegate removed:      \x1b[31m${change.delegatesChange.removed.join(', ')}\x1b[0m`);
          }
        }
      });
    }

    // Findings output
    if (newFindings.length > 0 || resolvedFindings.length > 0) {
      console.log(`\n\x1b[35m⚠️ Security Findings changes:\x1b[0m`);
      newFindings.forEach(f => {
        console.log(`  - \x1b[31m[+] New Finding [${f.ruleId}]\x1b[0m: (${f.severity.toUpperCase()}) ${f.message}`);
      });
      resolvedFindings.forEach(f => {
        console.log(`  - \x1b[32m[-] Resolved Finding [${f.ruleId}]\x1b[0m: (${f.severity.toUpperCase()}) ${f.message}`);
      });
    }

    const noChanges = addedTools.length === 0 && removedTools.length === 0 && modifiedTools.length === 0
      && addedAgents.length === 0 && removedAgents.length === 0 && modifiedAgents.length === 0
      && newFindings.length === 0 && resolvedFindings.length === 0;

    if (noChanges) {
      console.log(`\n\x1b[32m✔ No changes detected between Agent-BOM baseline and head.\x1b[0m\n`);
    } else {
      console.log();
    }

    return 0;
  } catch (error: unknown) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
