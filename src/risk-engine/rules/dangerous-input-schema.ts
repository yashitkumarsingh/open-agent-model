import { SystemModel, Tool } from '../../core/model.js';
import { Finding, Rule } from './types.js';

/**
 * R-015: Dangerous Tool Input Shape
 *
 * Inspects the `input_schema` field preserved from MCP tools/list responses.
 * Parameters with names matching known-dangerous patterns (command, shell, sql,
 * file_path, amount, account_id, etc.) signal that the tool may be more dangerous
 * than its declared `risk` or `type` field suggests.
 *
 * This rule is advisory. It does not block execution, but flags the mismatch
 * so security reviewers can decide whether to raise the risk level, add
 * approval requirements, or restrict the tool to specific agents.
 */

const DANGEROUS_PARAM_PATTERNS: RegExp[] = [
  /^command$/i,
  /^shell$/i,
  /^script$/i,
  /^sql$/i,
  /^query$/i,
  /^file_?path$/i,
  /^path$/i,
  /^url$/i,
  /^amount$/i,
  /^value$/i,
  /^account_?id$/i,
  /^recipient$/i,
  /^destination$/i,
  /^delete$/i,
  /^overwrite$/i,
  /^webhook/i,
  /^callback/i,
];

function extractParamNames(inputSchema: Record<string, unknown>): string[] {
  const properties = inputSchema.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    return Object.keys(properties as Record<string, unknown>);
  }
  return [];
}

function matchesDangerousPattern(paramName: string): boolean {
  return DANGEROUS_PARAM_PATTERNS.some((pattern) => pattern.test(paramName));
}

function checkTool(tool: Tool): Finding[] {
  const findings: Finding[] = [];
  if (!tool.input_schema) return findings;

  const paramNames = extractParamNames(tool.input_schema as Record<string, unknown>);
  const dangerousParams = paramNames.filter(matchesDangerousPattern);

  if (dangerousParams.length === 0) return findings;

  // Only flag if risk is not already declared as high/critical
  if (tool.risk === 'high' || tool.risk === 'critical') return findings;

  findings.push({
    id: 'R-015-INP',
    title: 'Potentially Dangerous Tool Input Parameters',
    severity: 'medium',
    agentId: tool.id,
    description: `Tool '${tool.id}' has input_schema parameters matching known high-risk patterns: [${dangerousParams.join(', ')}]. The current risk level is '${tool.risk ?? 'unset'}', which may underestimate the tool's actual danger.`,
    recommendation: `Review parameters [${dangerousParams.join(', ')}] in tool '${tool.id}'. If any accept user-controlled values that reach shell execution, SQL, file I/O, or financial disbursement, raise risk to 'high' or 'critical', add 'requires_human_approval: true', and consider restricting 'allowed_tools' to specific agents only.`,
    owaspMapping: 'OWASP-10: Unbounded Consumption / Prompt Injection via Tool Parameters',
  });

  return findings;
}

export const dangerousInputSchemaRule: Rule = {
  id: 'R-015',
  name: 'Dangerous Tool Input Shape',
  severity: 'medium',
  owaspMapping: 'OWASP-10: Unbounded Consumption / Prompt Injection via Tool Parameters',
  check(data: SystemModel): Finding[] {
    return (data.tools || []).flatMap(checkTool);
  },
};
