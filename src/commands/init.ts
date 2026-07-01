import fs from 'fs';
import path from 'path';

const defaultTemplate = `# OpenAgentModel Specification
#
# NOTE: This default template is fully secured and passes all static safety gates.
system: healthcare-triage-platform
version: "0.1"

agents:
  - id: triage-agent
    purpose: "Analyze patient symptom descriptions and recommend scheduling slots."
    framework: crewai
    autonomy: supervised
    memory:
      type: vector
      contains:
        - patient_symptoms
      write_access: true
      poisoning_protection: true # Safe: Vector memory poisoning checks are enabled
    allowed_tools:
      - query-symptom-db
      - read-patient-chart
    approval_required_for:
      - read-patient-chart # Safe Gate: HIPAA database access requires human approval
    allowed_delegates: [] # Safe: Removed delegation escalation pathway
    retry_policy:
      max_retries: 5 # Safe: Limited retries to avoid API cost runaways
      loop_detection: true # Safe: Recursive execution checks enabled
    spend_limit:
      max_cost_usd: 0.20
      time_window: 1h

  - id: clinical-diagnostician
    purpose: "Diagnose conditions and recommend clinical prescriptions."
    framework: langgraph
    autonomy: human-approval-required
    allowed_tools:
      - query-symptom-db
      - prescribe-medication
    approval_required_for:
      - prescribe-medication # Safe Gate: Prescriptions require human signoff
    retry_policy:
      max_retries: 3 # Safe: Defends against loop runaways
      loop_detection: true
    spend_limit:
      max_cost_usd: 0.40 # Safe: Under the custom policy cap limit

tools:
  - id: query-symptom-db
    type: api
    description: "Fetch matching symptoms from medical lookup tables."
    risk: low

  - id: read-patient-chart
    type: database
    description: "Fetch HIPAA sensitive medical histories."
    data_classes: [patient_health_records]
    risk: high

  - id: prescribe-medication
    type: api
    description: "Issue prescription orders to pharmacy networks."
    risk: critical
    requires_human_approval: true

mcp_servers:
  - id: hospital-ehr-mcp
    trust_level: internal
    exposes:
      - read-patient-chart

  - id: external-pharmacy-mcp
    trust_level: external
    exposes:
      - prescribe-medication

data_classes:
  - id: patient_symptoms
    sensitivity: high
    classification: pii

  - id: patient_health_records
    sensitivity: critical
    classification: pii

policies:
  - "max_cost_per_task_usd: 0.50"
  - "max_tool_calls_per_task: 15"
  - "no_external_mcp_can_access_payment_tokens"
`;

export function initCommand(options: { output: string }) {
  const outputPath = path.resolve(options.output);
  
  if (fs.existsSync(outputPath)) {
    console.error(`Error: File already exists at ${outputPath}`);
    process.exit(1);
  }

  try {
    fs.writeFileSync(outputPath, defaultTemplate, 'utf8');
    console.log(`\x1b[32m✔ Successfully initialized OpenAgentModel config at ${outputPath}\x1b[0m`);
  } catch (error: any) {
    console.error(`Error writing initialization template: ${error?.message || error}`);
    process.exit(1);
  }
}
