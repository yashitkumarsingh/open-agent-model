import { SystemModel } from '../../core/model.js';
import { buildIdentityMap, isHighImpactTool } from './helpers.js';
import { Finding, Rule } from './types.js';

export const criticalToolAuthIdentityRule: Rule = {
  id: 'R-006',
  name: 'Critical Tool Auth Identity',
  severity: 'high',
  owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const identityMap = buildIdentityMap(data);

    (data.tools || []).forEach((tool) => {
      if (!isHighImpactTool(tool)) return;

      if (!tool.auth_identity) {
        findings.push({
          id: 'R-006-AUTH',
          title: 'High-Impact Tool Missing Auth Identity',
          severity: 'high',
          agentId: 'system',
          description: `Tool '${tool.id}' is high impact but does not declare an auth_identity.`,
          recommendation: `Bind tool '${tool.id}' to a declared identity and validate required scopes for that identity.`,
          owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
          context: { toolId: tool.id }
        });
      }

      if (!tool.required_scopes || tool.required_scopes.length === 0) {
        findings.push({
          id: 'R-006-SCOPES',
          title: 'High-Impact Tool Missing Required Scopes',
          severity: 'high',
          agentId: 'system',
          description: `Tool '${tool.id}' is high impact but does not declare required_scopes.`,
          recommendation: `Set required_scopes for '${tool.id}' so least-privilege identity coverage is explicit and linkable.`,
          owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
          context: { toolId: tool.id }
        });
      }

      if (tool.auth_identity) {
        const identity = identityMap.get(tool.auth_identity);
        if (identity && !identity.owner) {
          findings.push({
            id: 'R-006-OWNER',
            title: 'High-Impact Tool Uses Ownerless Identity',
            severity: 'high',
            agentId: 'system',
            description: `Tool '${tool.id}' uses identity '${tool.auth_identity}', but that identity has no owner.`,
            recommendation: `Set identities[].owner for '${tool.auth_identity}' so escalation and rotation ownership is clear.`,
            owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
            context: { toolId: tool.id }
          });
        }
      }
    });

    return findings;
  }
};
