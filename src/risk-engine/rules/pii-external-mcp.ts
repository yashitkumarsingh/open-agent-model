import { DataClass, McpServer, SystemModel, Tool } from '../../core/model.js';
import { Finding, Rule } from './types.js';
import { isPIIClass } from './helpers.js';

export const piiExternalMcpRule: Rule = {
  id: 'R-003',
  name: 'PII Exfiltration via External MCP Boundary',
  severity: 'high',
  owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const agents = data.agents || [];
    const tools = data.tools || [];
    const mcpServers = data.mcp_servers || [];
    const dataClasses = data.data_classes || [];

    const toolMap = new Map<string, Tool>();
    tools.forEach((tool) => toolMap.set(tool.id, tool));

    const dataClassMap = new Map<string, DataClass>();
    dataClasses.forEach((dataClass) => dataClassMap.set(dataClass.id, dataClass));

    const toolMcpMap = new Map<string, McpServer>();
    mcpServers.forEach((mcp) => {
      (mcp.exposes || []).forEach((toolId) => toolMcpMap.set(toolId, mcp));
    });

    agents.forEach((agent) => {
      let accessesPii = false;
      let connectsToExternalMcp = false;
      let offendingTool = '';
      let offendingMcp = '';

      (agent.allowed_tools || []).forEach((toolId) => {
        const tool = toolMap.get(toolId);
        (tool?.data_classes || []).forEach((dataClassId) => {
          if (isPIIClass(dataClassId, dataClassMap)) {
            accessesPii = true;
            offendingTool = toolId;
          }
        });

        const mcp = toolMcpMap.get(toolId);
        if (mcp && (mcp.trust_level === 'external' || mcp.trust_level === 'untrusted')) {
          connectsToExternalMcp = true;
          offendingMcp = mcp.id;
        }
      });

      (agent.memory?.contains || []).forEach((dataClassId) => {
        if (isPIIClass(dataClassId, dataClassMap)) {
          accessesPii = true;
          offendingTool = 'vector-memory';
        }
      });

      if (accessesPii && connectsToExternalMcp) {
        findings.push({
          id: 'R-003-EXF',
          title: 'Sensitive PII Exposed to External Integration Boundary',
          severity: 'high',
          agentId: agent.id,
          description: `Agent '${agent.id}' accesses PII (via '${offendingTool}') and connects to external/untrusted MCP server '${offendingMcp}'. This creates an exfiltration risk.`,
          recommendation: `Isolate external tool calls from sensitive agent memory, or implement an outbound data protection proxy (PII scrubbing) before hitting external MCP APIs.`,
          owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
          context: { toolId: offendingTool, mcpId: offendingMcp }
        });
      }
    });

    return findings;
  }
};
