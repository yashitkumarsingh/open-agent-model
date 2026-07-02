import { SystemModel } from '../../core/model.js';
import { buildDataClassMap, buildToolMap, collectAgentDataClasses, isPIIClass, resolveMaxSensitivity } from './helpers.js';
import { Finding, Rule } from './types.js';

export const modelRetentionDataRule: Rule = {
  id: 'R-012',
  name: 'Model Retention Data Boundary',
  severity: 'high',
  owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const toolMap = buildToolMap(data);
    const dataClassMap = buildDataClassMap(data);
    const models = data.models || [];

    (data.agents || []).forEach((agent) => {
      const agentDataClasses = collectAgentDataClasses(agent, toolMap, dataClassMap);
      const candidateModels = agent.model
        ? models.filter((model) => model.id === agent.model)
        : models.filter((model) => model.allowed_for?.includes(agent.id));

      candidateModels.forEach((model) => {
        agentDataClasses.forEach((dataClass) => {
          const isPii = isPIIClass(dataClass.id, dataClassMap);
          const maxSensitivity = resolveMaxSensitivity(dataClass.id, dataClassMap);

          if (model.data_retention === 'enabled' && isPii) {
            findings.push({
              id: 'R-012-MODEL-RETENTION',
              title: 'Model Retention Enabled for PII-Handling Agent',
              severity: 'high',
              agentId: agent.id,
              description: `Agent '${agent.id}' handles PII data class '${dataClass.id}' while model '${model.id}' has data_retention enabled.`,
              recommendation: `Disable data retention for model '${model.id}' or route PII handling to a no-retention deployment.`,
              owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
              context: { dataClassId: dataClass.id }
            });
          }

          if ((model.risk === 'high' || model.risk === 'critical') && (maxSensitivity === 'high' || maxSensitivity === 'critical')) {
            findings.push({
              id: 'R-012-MODEL-RISK',
              title: 'High-Risk Model Handles High-Sensitivity Data',
              severity: 'high',
              agentId: agent.id,
              description: `Agent '${agent.id}' can use model '${model.id}' (${model.risk}) while handling '${dataClass.id}' (${maxSensitivity}).`,
              recommendation: `Use a lower-risk model deployment for '${agent.id}' or add a documented policy exception with compensating controls.`,
              owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
              context: { dataClassId: dataClass.id }
            });
          }
        });
      });
    });

    return findings;
  }
};
