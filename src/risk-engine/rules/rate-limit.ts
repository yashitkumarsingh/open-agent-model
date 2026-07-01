import { SystemModel } from '../../core/model.js';
import { isHighImpactTool } from './helpers.js';
import { Finding, Rule } from './types.js';

export const criticalToolRateLimitRule: Rule = {
  id: 'R-007',
  name: 'Critical Tool Rate Limit',
  severity: 'high',
  owaspMapping: 'OWASP-4: Unbounded Consumption / Tool Abuse',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];

    (data.tools || []).forEach((tool) => {
      if (isHighImpactTool(tool) && !tool.rate_limit) {
        findings.push({
          id: 'R-007-RATE',
          title: 'High-Impact Tool Missing Rate Limit',
          severity: 'high',
          agentId: 'system',
          description: `Tool '${tool.id}' is high impact but does not define rate_limit.max_calls_per_task.`,
          recommendation: `Set a conservative rate_limit.max_calls_per_task for '${tool.id}'.`,
          owaspMapping: 'OWASP-4: Unbounded Consumption / Tool Abuse',
          context: { toolId: tool.id }
        });
      }
    });

    return findings;
  }
};
