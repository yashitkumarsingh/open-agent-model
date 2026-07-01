import { SystemModel } from '../../core/model.js';
import { Finding, Rule } from './types.js';

export const memoryPoisoningRule: Rule = {
  id: 'R-004',
  name: 'Memory Poisoning Vulnerability',
  severity: 'high',
  owaspMapping: 'OWASP-3: Training Data Poisoning / Memory Poisoning',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];

    (data.agents || []).forEach((agent) => {
      if (agent.memory && agent.memory.type !== 'none') {
        const writeAccess = agent.memory.write_access === true;
        const protectionEnabled = agent.memory.poisoning_protection === true;

        if (writeAccess && !protectionEnabled) {
          findings.push({
            id: 'R-004-POI',
            title: 'Memory Write Access Without Poisoning Protection',
            severity: 'high',
            agentId: agent.id,
            description: `Agent '${agent.id}' has write access to its '${agent.memory.type}' memory, but has no poisoning protection or input verification enabled. Malicious payloads could permanently compromise agent memory.`,
            recommendation: `Enable 'poisoning_protection: true' in agent memory settings and implement semantic guards or transactional rollback policies on long-term memory writes.`,
            owaspMapping: 'OWASP-3: Training Data Poisoning / Memory Poisoning'
          });
        }
      }
    });

    return findings;
  }
};
