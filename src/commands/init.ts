import fs from 'fs';
import path from 'path';

const defaultTemplate = `# OpenAgentModel Specification
#
# NOTE: This default template is fully secured and passes all static safety gates.
system: customer-support-platform
version: "0.2.1"

models:
  - id: gpt-5.5-thinking
    provider: openai
    deployment: prod-agent-router
    allowed_for: [support-triage, refund-executor]
    data_retention: disabled
    region: australia-east
    risk: medium

identities:
  - id: triage-agent-sa
    type: service_account
    owner: platform-team
    expires_at: "2026-12-31T23:59:59Z"
    scopes: [crm.read, refund.write]

agents:
  - id: support-triage
    purpose: "Analyze incoming customer tickets and route payment issues to refund executor."
    model: gpt-5.5-thinking
    framework: crewai
    autonomy: supervised
    memory:
      type: vector
      contains:
        - customer_details
      write_access: true
      poisoning_protection: true # Safe: Vector memory poisoning protection is enabled
    allowed_tools:
      - read-crm-data
    allowed_delegates: [] # Safe: Avoids A2A transitive escalation routes
    retry_policy:
      max_retries: 3
      loop_detection: true
    spend_limit:
      max_cost_usd: 0.20
      time_window: 1h

  - id: refund-executor
    purpose: "Evaluate customer requests and securely execute financial refund transfers."
    model: gpt-5.5-thinking
    framework: langgraph
    autonomy: human-approval-required
    allowed_tools:
      - read-crm-data
      - issue-refund
    approval_required_for:
      - issue-refund # Safe Gate: Financial operations require human authorization
    retry_policy:
      max_retries: 3
      loop_detection: true
    spend_limit:
      max_cost_usd: 0.40 # Safe: Within system budget constraints

tools:
  - id: read-crm-data
    type: api
    description: "Fetch basic customer details from database."
    risk: low
    side_effect: read

  - id: issue-refund
    type: payment_api
    description: "Process credit card and banking refunds."
    risk: critical
    side_effect: payout
    auth_identity: triage-agent-sa
    required_scopes: [refund.write]
    approval:
      mode: human
      approver_role: finance-manager
      expiry_seconds: 300
    rate_limit:
      max_calls_per_task: 1

mcp_servers:
  - id: support-crm-mcp
    trust_level: internal
    exposes:
      - read-crm-data

data_classes:
  - id: customer_details
    sensitivity: high
    classification: pii

policies:
  - "max_cost_per_task_usd: 0.50"
  - "max_tool_calls_per_task: 10"
  - id: approve-critical-write-tools
    severity: critical
    when:
      agent.autonomy: supervised
      tool.risk: critical
    require:
      tool.requires_human_approval: true
`;

export function initCommand(options: { output: string }): number {
  const outputPath = path.resolve(options.output);
  
  if (fs.existsSync(outputPath)) {
    console.error(`Error: File already exists at ${outputPath}`);
    return 1;
  }

  try {
    fs.writeFileSync(outputPath, defaultTemplate, 'utf8');
    console.log(`\x1b[32m✔ Successfully initialized OpenAgentModel config at ${outputPath}\x1b[0m`);
    return 0;
  } catch (error: unknown) {
    console.error(`Error writing initialization template: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
