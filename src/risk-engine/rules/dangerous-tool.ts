import { SystemModel, Tool } from '../../core/model.js';
import { hasHumanApproval } from '../approval.js';
import { Finding, Rule } from './types.js';

export const unapprovedDangerousToolRule: Rule = {
  id: 'R-002',
  name: 'Autonomous Dangerous Tool Execution',
  severity: 'high',
  owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const agents = data.agents || [];
    const tools = data.tools || [];

    const toolMap = new Map<string, Tool>();
    tools.forEach((tool) => toolMap.set(tool.id, tool));

    agents.forEach((agent) => {
      const allowedTools = agent.allowed_tools || [];
      allowedTools.forEach((toolId) => {
        const tool = toolMap.get(toolId);
        if (!tool) return;

        const isDangerous =
          tool.type === 'payment_api' ||
          tool.risk === 'high' ||
          tool.risk === 'critical' ||
          toolId.toLowerCase().includes('delete') ||
          toolId.toLowerCase().includes('refund');

        if (isDangerous && !hasHumanApproval(agent, tool, toolId)) {
          findings.push({
            id: 'R-002-AUT',
            title: 'Autonomous Execution of Dangerous Tool',
            severity: 'high',
            agentId: agent.id,
            description: `Agent '${agent.id}' can execute high-risk/payment tool '${toolId}' without human approval or validation.`,
            recommendation: `Require human approval for tool '${toolId}' by setting 'requires_human_approval: true', setting 'approval.mode: human', or adding it to the agent's 'approval_required_for' list.`,
            owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval',
            context: { toolId }
          });
        }
      });
    });

    return findings;
  }
};
