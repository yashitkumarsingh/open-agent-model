import { SystemModel } from '../../core/model.js';
import { Finding, Rule } from './types.js';

export const allowDenyConflictRule: Rule = {
  id: 'R-010',
  name: 'Allow Deny Tool Conflict',
  severity: 'high',
  owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];

    (data.agents || []).forEach((agent) => {
      const allowedTools = new Set(agent.allowed_tools || []);
      const deniedTools = new Set(agent.denied_tools || []);

      allowedTools.forEach((toolId) => {
        if (deniedTools.has(toolId)) {
          findings.push({
            id: 'R-010-ALLOW-DENY',
            title: 'Agent Allows and Denies Same Tool',
            severity: 'high',
            agentId: agent.id,
            description: `Agent '${agent.id}' lists tool '${toolId}' in both allowed_tools and denied_tools.`,
            recommendation: `Remove '${toolId}' from one of the lists so policy intent is unambiguous.`,
            owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
            context: { toolId }
          });
        }
      });
    });

    return findings;
  }
};
