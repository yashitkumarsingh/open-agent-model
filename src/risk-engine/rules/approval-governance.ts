import { SystemModel } from '../../core/model.js';
import { Finding, Rule } from './types.js';

export const approvalGovernanceRule: Rule = {
  id: 'R-008',
  name: 'Approval Governance',
  severity: 'high',
  owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];

    (data.tools || []).forEach((tool) => {
      const approvalMode = tool.approval?.mode;
      const hasHumanMode = approvalMode === 'human' || approvalMode === 'multi-party';
      const approvalExpirySeconds = tool.approval?.expiry_seconds;

      if (hasHumanMode && !tool.approval?.approver_role) {
        findings.push({
          id: 'R-008-APPROVER',
          title: 'Human Approval Missing Approver Role',
          severity: 'high',
          agentId: 'system',
          description: `Tool '${tool.id}' declares approval.mode '${approvalMode}' but does not specify approver_role.`,
          recommendation: `Set approval.approver_role for '${tool.id}' to make the approval authority auditable.`,
          owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
          context: { toolId: tool.id }
        });
      }

      if (hasHumanMode && approvalExpirySeconds === undefined) {
        findings.push({
          id: 'R-008-APPROVAL-EXPIRY',
          title: 'Human Approval Missing Expiry',
          severity: 'medium',
          agentId: 'system',
          description: `Tool '${tool.id}' declares human approval but does not set approval.expiry_seconds.`,
          recommendation: `Set approval.expiry_seconds for '${tool.id}' to bound approval replay windows.`,
          owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
          context: { toolId: tool.id }
        });
      } else if (hasHumanMode && typeof approvalExpirySeconds === 'number' && approvalExpirySeconds > 3600) {
        findings.push({
          id: 'R-008-APPROVAL-EXPIRY',
          title: 'Human Approval Expiry Too Long',
          severity: 'medium',
          agentId: 'system',
          description: `Tool '${tool.id}' approval expiry is ${approvalExpirySeconds}s, which exceeds the 3600s recommended maximum.`,
          recommendation: `Lower approval.expiry_seconds for '${tool.id}' to 3600 seconds or less.`,
          owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
          context: { toolId: tool.id }
        });
      }
    });

    return findings;
  }
};
