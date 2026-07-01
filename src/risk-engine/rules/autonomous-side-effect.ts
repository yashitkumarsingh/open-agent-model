import { SystemModel } from '../../core/model.js';
import { buildToolMap, isSideEffectingTool } from './helpers.js';
import { Finding, Rule } from './types.js';

export const autonomousSideEffectToolRule: Rule = {
  id: 'R-011',
  name: 'Autonomous Side Effect Tool',
  severity: 'critical',
  owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const toolMap = buildToolMap(data);

    (data.agents || []).forEach((agent) => {
      if (agent.autonomy !== 'autonomous') return;

      (agent.allowed_tools || []).forEach((toolId) => {
        const tool = toolMap.get(toolId);
        if (tool && isSideEffectingTool(tool)) {
          findings.push({
            id: 'R-011-AUTONOMOUS-WRITE',
            title: 'Autonomous Agent Can Invoke Write or Command Tool',
            severity: 'critical',
            agentId: agent.id,
            description: `Autonomous agent '${agent.id}' can invoke side-effecting tool '${toolId}'.`,
            recommendation: `Move '${agent.id}' to supervised/human-approval-required autonomy or remove '${toolId}' from allowed_tools.`,
            owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval',
            context: { toolId }
          });
        }
      });
    });

    return findings;
  }
};
