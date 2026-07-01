import { SystemModel } from '../../core/model.js';
import { a2aPrivilegeEscalationRule } from './a2a-privilege.js';
import { allowDenyConflictRule } from './allow-deny-conflict.js';
import { approvalGovernanceRule } from './approval-governance.js';
import { autonomousSideEffectToolRule } from './autonomous-side-effect.js';
import { criticalToolAuthIdentityRule } from './critical-tool-auth.js';
import { criticalToolRateLimitRule } from './rate-limit.js';
import { customPoliciesRule } from './custom-policies.js';
import { delegationCycleRule } from './delegation-cycle.js';
import { externalMcpSideEffectRule } from './external-mcp-side-effect.js';
import { infiniteLoopsRule } from './retry-loop.js';
import { memoryPoisoningRule } from './memory-poisoning.js';
import { modelRetentionDataRule } from './model-retention-data.js';
import { piiExternalMcpRule } from './pii-external-mcp.js';
import { dangerousInputSchemaRule } from './dangerous-input-schema.js';
import { unapprovedDangerousToolRule } from './dangerous-tool.js';
import { Finding, Rule } from './types.js';

export type { Finding, Rule } from './types.js';

export const RULES_REGISTRY: Rule[] = [
  a2aPrivilegeEscalationRule,
  unapprovedDangerousToolRule,
  piiExternalMcpRule,
  memoryPoisoningRule,
  infiniteLoopsRule,
  criticalToolAuthIdentityRule,
  criticalToolRateLimitRule,
  approvalGovernanceRule,
  externalMcpSideEffectRule,
  allowDenyConflictRule,
  autonomousSideEffectToolRule,
  modelRetentionDataRule,
  delegationCycleRule,
  customPoliciesRule,
  dangerousInputSchemaRule
];

export function runRiskChecks(data: SystemModel): Finding[] {
  const allFindings: Finding[] = [];

  RULES_REGISTRY.forEach((rule) => {
    try {
      const findings = rule.check(data);
      findings.forEach((finding) => {
        if (!finding.id.startsWith('R-')) {
          finding.id = `${rule.id}-${finding.id}`;
        }
      });
      allFindings.push(...findings);
    } catch (error: any) {
      console.error(`Error running rule '${rule.name}': ${error?.message || error}`);
    }
  });

  return allFindings;
}
