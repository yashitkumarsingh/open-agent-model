import { SystemModel } from '../../core/model.js';
import { evaluatePolicies } from '../policy-evaluator.js';
import { Finding, Rule } from './types.js';

export const customPoliciesRule: Rule = {
  id: 'R-014',
  name: 'Custom Declared Policies compliance',
  severity: 'high',
  owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval',
  check(data: SystemModel): Finding[] {
    return evaluatePolicies(data);
  }
};
