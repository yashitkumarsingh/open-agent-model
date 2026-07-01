export function generateRegoPolicy(): string {
  return `package openagentmodel.authz

default allow = false

# Allow if no policy violates
allow {
    count(violation) == 0
}

# Rule: Deny direct payment/write tools for supervised/autonomous agents without approval
violation[msg] {
    some agent_id, tool_id
    agent := input.agents[_]
    agent.id == agent_id
    tool := input.tools[_]
    tool.id == tool_id
    
    # Tool is dangerous
    (tool.type == "payment_api" || tool.risk == "high" || tool.risk == "critical")
    
    # Agent is authorized to use the tool
    agent.allowed_tools[_] == tool_id
    
    # Crucially: no approval is required
    not tool.requires_human_approval == true
    not agent.autonomy == "human-approval-required"
    not contains_element(agent.approval_required_for, tool_id)
    
    msg := sprintf("Policy Violation: Supervised/autonomous Agent '%v' is allowed to execute dangerous tool '%v' without an approval gate.", [agent_id, tool_id])
}

# Rule: Deny access to sensitive PII data classes for external MCP tools
violation[msg] {
    some agent_id, tool_id, mcp_id, dc_id
    agent := input.agents[_]
    agent.id == agent_id
    
    mcp := input.mcp_servers[_]
    mcp.id == mcp_id
    (mcp.trust_level == "external" || mcp.trust_level == "untrusted")
    
    tool := input.tools[_]
    tool.id == tool_id
    mcp.exposes[_] == tool_id
    agent.allowed_tools[_] == tool_id
    
    # Agent also accesses PII
    other_tool_id := agent.allowed_tools[_]
    other_tool := input.tools[_]
    other_tool.id == other_tool_id
    other_tool.data_classes[_] == dc_id
    dc := input.data_classes[_]
    dc.id == dc_id
    dc.classification == "pii"
    
    msg := sprintf("Policy Violation: Agent '%v' has exfiltration risk; connects to external MCP tool '%v' and processes sensitive PII '%v'.", [agent_id, tool_id, dc_id])
}

contains_element(arr, elem) {
    arr[_] == elem
}
`;
}

export function generatePolicyRecommendationsMd(data: any): string {
  const rego = generateRegoPolicy();
  
  return `# OpenAgentModel Policy Recommendations

Generated for system: **${data.system || 'unnamed-system'}** (v${data.version || '0.1'})

This document contains generated runtime policy rules and security recommendations designed to safeguard your agent system from autonomy and escalation risks.

---

## 1. Open Policy Agent (OPA) Rego Policy
The following OPA policies can be used in your gateway or runtime agent middleware to intercept tool-calling decisions and block hazardous execution paths.

\`\`\`rego
${rego}
\`\`\`

---

## 2. Microsoft Agent Governance Toolkit (AGT) Guidance
To enforce identity controls and tool boundaries within the Microsoft AGT framework:

1. **User Identity Propagation**: Ensure all database/CRM-facing tools exposed via \`merchant-crm-mcp\` utilize user-delegated tokens rather than root/application service-principal credentials.
2. **Execution Cost Budgets**: Implement rate-limiting and budget capping at the gateway level. Define maximum tokens per request, max tool calls (limit support-agent to 15), and max spend limit ($0.50 per task).
3. **Audit Trail**: Configure log forwarding for A2A delegation traces. Every time \`support-agent\` delegates a sub-task to \`refund-agent\`, record:
   - Requesting agent ID
   - Delegated agent ID
   - Authorization token / signature
   - Context payload hashes

---

## 3. General Architecture Controls
Based on the current agent modeling definitions, we recommend the following controls:
- **Inject Input Sanitization Layers**: Ensure vector database lookup inputs and memory write paths utilize prompt-injection filters (e.g. LLM-guard, Llama Guard) to prevent training/memory data poisoning.
- **Enforce Human-in-the-Loop Approval**: Ensure any transaction involving \`issue-refund\` requires a physical click/action from an administrator. Do not allow full autonomy for this path.
- **Data Redaction (PII Scrubbing)**: Before forwarding customer request histories to \`external-analytics-mcp\`, pass the data through a regex-based or NLP-based PII scrubber (like Presidio).
`;
}
