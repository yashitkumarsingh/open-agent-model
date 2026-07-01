import { Agent, DataClass, SystemModel, Tool } from '../../core/model.js';
import { isHighImpactTool, isSideEffectingTool } from './helpers.js';
import { Finding, Rule } from './types.js';

export const a2aPrivilegeEscalationRule: Rule = {
  id: 'R-001',
  name: 'Agent-to-Agent Privilege Escalation',
  severity: 'critical',
  owaspMapping: 'OWASP-10: System and Network Escalation',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const agents = data.agents || [];
    const tools = data.tools || [];
    const dataClasses = data.data_classes || [];

    const toolMap = new Map<string, Tool>();
    tools.forEach((tool) => toolMap.set(tool.id, tool));

    const dataClassMap = new Map<string, DataClass>();
    dataClasses.forEach((dataClass) => dataClassMap.set(dataClass.id, dataClass));

    const agentMap = new Map<string, Agent>();
    agents.forEach((agent) => agentMap.set(agent.id, agent));

    agents.forEach((agent) => {
      const visited = new Set<string>();
      const queue: string[] = [];

      (agent.allowed_delegates || []).forEach((delegateId) => {
        if (!visited.has(delegateId)) {
          visited.add(delegateId);
          queue.push(delegateId);
        }
      });

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentAgent = agentMap.get(currentId);
        if (currentAgent?.allowed_delegates) {
          currentAgent.allowed_delegates.forEach((delegateId) => {
            if (!visited.has(delegateId)) {
              visited.add(delegateId);
              queue.push(delegateId);
            }
          });
        }
      }

      visited.forEach((delegateId) => {
        const delegate = agentMap.get(delegateId);
        if (!delegate) return;

        const agentTools = new Set(agent.allowed_tools || []);
        const delegateTools = delegate.allowed_tools || [];

        delegateTools.forEach((toolId) => {
          if (!agentTools.has(toolId)) {
            const tool = toolMap.get(toolId);
            if (tool && (tool.risk === 'high' || isHighImpactTool(tool) || isSideEffectingTool(tool))) {
              findings.push({
                id: 'R-001-ESC',
                title: 'A2A Privilege Escalation Path Detected',
                severity: 'critical',
                agentId: agent.id,
                description: `Agent '${agent.id}' can transitively delegate to '${delegateId}' (who has access to high-privilege tool '${toolId}' which '${agent.id}' cannot call directly).`,
                recommendation: `Restrict delegation chains, or enforce human approval gates on critical actions.`,
                owaspMapping: 'OWASP-10: System and Network Escalation',
                context: { delegateId, toolId }
              });
            }
          }
        });

        const agentDataClasses = new Set<string>();
        (agent.allowed_tools || []).forEach((toolId) => {
          const tool = toolMap.get(toolId);
          (tool?.data_classes || []).forEach((dataClassId) => agentDataClasses.add(dataClassId));
        });
        (agent.memory?.contains || []).forEach((dataClassId) => agentDataClasses.add(dataClassId));

        const delegateDataClasses = new Set<string>();
        delegateTools.forEach((toolId) => {
          const tool = toolMap.get(toolId);
          (tool?.data_classes || []).forEach((dataClassId) => delegateDataClasses.add(dataClassId));
        });
        (delegate.memory?.contains || []).forEach((dataClassId) => delegateDataClasses.add(dataClassId));

        delegateDataClasses.forEach((dataClassId) => {
          if (!agentDataClasses.has(dataClassId)) {
            const dataClass = dataClassMap.get(dataClassId);
            if (dataClass && (dataClass.sensitivity === 'high' || dataClass.sensitivity === 'critical')) {
              findings.push({
                id: 'R-001-DAT',
                title: 'Indirect Access to Sensitive Data via A2A Delegation',
                severity: 'critical',
                agentId: agent.id,
                description: `Agent '${agent.id}' can transitively delegate to '${delegateId}', granting indirect access to sensitive data class '${dataClassId}' (${dataClass.sensitivity} sensitivity) which '${agent.id}' cannot access directly.`,
                recommendation: `Restrict downstream delegation scopes or enforce data boundary filters.`,
                owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
                context: { delegateId, dataClassId }
              });
            }
          }
        });
      });
    });

    return findings;
  }
};
