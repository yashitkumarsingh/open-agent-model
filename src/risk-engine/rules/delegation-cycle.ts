import { Agent, SystemModel } from '../../core/model.js';
import { Finding, Rule } from './types.js';

export const delegationCycleRule: Rule = {
  id: 'R-013',
  name: 'Delegation Cycle',
  severity: 'high',
  owaspMapping: 'OWASP-4: Execution Loops / Agent Delegation Cycle',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const agentMap = new Map<string, Agent>();
    (data.agents || []).forEach((agent) => agentMap.set(agent.id, agent));

    (data.agents || []).forEach((agent) => {
      const visited = new Set<string>();
      const stack = [...(agent.allowed_delegates || [])];

      while (stack.length > 0) {
        const delegateId = stack.pop()!;
        if (delegateId === agent.id) {
          findings.push({
            id: 'R-013-DELEGATION-CYCLE',
            title: 'Delegation Cycle Detected',
            severity: 'high',
            agentId: agent.id,
            description: `Agent '${agent.id}' is part of a delegation cycle.`,
            recommendation: `Break the allowed_delegates cycle so delegated tasks have a bounded authority path.`,
            owaspMapping: 'OWASP-4: Execution Loops / Agent Delegation Cycle',
            context: { delegateId }
          });
          break;
        }

        if (visited.has(delegateId)) continue;
        visited.add(delegateId);

        const delegate = agentMap.get(delegateId);
        (delegate?.allowed_delegates || []).forEach((nextDelegateId) => stack.push(nextDelegateId));
      }
    });

    return findings;
  }
};
