import { SystemModel } from '../../core/model.js';
import { Finding, Rule } from './types.js';

export const infiniteLoopsRule: Rule = {
  id: 'R-005',
  name: 'Execution Loop Vulnerability',
  severity: 'medium',
  owaspMapping: 'OWASP-4: Model Denial of Service / Execution Loops',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];

    (data.agents || []).forEach((agent) => {
      const policy = agent.retry_policy;
      if (!policy) {
        findings.push({
          id: 'R-005-MISS',
          title: 'Missing Retry and Loop Protection Policy',
          severity: 'medium',
          agentId: agent.id,
          description: `Agent '${agent.id}' does not define a retry policy. Defaults could result in execution loops or token spend runaways on API failures.`,
          recommendation: `Define 'retry_policy' with explicit 'max_retries' (e.g. 3-5) and 'loop_detection: true'.`,
          owaspMapping: 'OWASP-4: Model Denial of Service / Execution Loops'
        });
      } else {
        const maxRetries = policy.max_retries;
        const loopDetection = policy.loop_detection === true;

        if (maxRetries === undefined || maxRetries >= 10) {
          findings.push({
            id: 'R-005-MAX',
            title: 'Excessive Retry Limits Configured',
            severity: 'medium',
            agentId: agent.id,
            description: `Agent '${agent.id}' has excessive retry limits configured (${maxRetries === undefined ? 'unlimited' : maxRetries} retries). This can lead to cost runaways.`,
            recommendation: `Limit 'max_retries' to less than 10 (ideally between 3 and 5).`,
            owaspMapping: 'OWASP-4: Model Denial of Service / Execution Loops'
          });
        }

        if (!loopDetection) {
          findings.push({
            id: 'R-005-LOOP',
            title: 'Execution Loop Detection Disabled',
            severity: 'medium',
            agentId: agent.id,
            description: `Agent '${agent.id}' has loop detection disabled in its retry policy. Repetitive tool failures could trigger infinite execution loops.`,
            recommendation: `Enable 'loop_detection: true' in the agent's 'retry_policy'.`,
            owaspMapping: 'OWASP-4: Model Denial of Service / Execution Loops'
          });
        }
      }
    });

    return findings;
  }
};
