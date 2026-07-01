import { SystemModel } from '../../core/model.js';
import { buildToolMap, isSideEffectingTool } from './helpers.js';
import { Finding, Rule } from './types.js';

export const externalMcpSideEffectRule: Rule = {
  id: 'R-009',
  name: 'External MCP Side Effect Boundary',
  severity: 'critical',
  owaspMapping: 'OWASP-6: Sensitive Information Disclosure / Excessive Agency',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const toolMap = buildToolMap(data);

    (data.mcp_servers || []).forEach((mcp) => {
      const externalBoundary = mcp.trust_level === 'external' || mcp.trust_level === 'untrusted';
      if (!externalBoundary) return;

      (mcp.exposes || []).forEach((toolId) => {
        const tool = toolMap.get(toolId);
        if (tool && isSideEffectingTool(tool)) {
          findings.push({
            id: 'R-009-MCP-SIDE-EFFECT',
            title: 'External MCP Exposes Write or Payout Tool',
            severity: 'critical',
            agentId: 'system',
            description: `External/untrusted MCP server '${mcp.id}' exposes side-effecting tool '${toolId}'.`,
            recommendation: `Move '${toolId}' behind an internal MCP boundary or replace it with a read-only façade.`,
            owaspMapping: 'OWASP-6: Sensitive Information Disclosure / Excessive Agency',
            context: { toolId, mcpId: mcp.id }
          });
        }
      });
    });

    return findings;
  }
};
