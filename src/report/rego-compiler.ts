import { SystemModel, DeclarativePolicy } from '../core/model.js';

/**
 * Compiles the OpenAgentModel (Agent-BOM) specification boundaries
 * and custom declarative policies into a standard OPA/Rego policy file.
 */
export function generateRegoPolicy(data: SystemModel): string {
  let rego = `# OpenAgentModel Compiled Rego Policy Gate
# Generated for System: ${data.system} (v${data.version})
# Compatible with Open Policy Agent (OPA)

package openagentmodel.governance

# Default allow flag: system is secure only if no rules trigger a 'deny' warning
default allow = false

allow {
    count(deny) == 0
}

# --- Built-In Guardrail Rules (Compiled from OAM Ruleset) ---

# R-002: Autonomous Dangerous Tool Execution
# Flags autonomous agents executing critical risk tools without explicit human approval
deny[msg] {
    some agent in input.agents
    agent.autonomy == "autonomous"
    some tool_id in agent.allowed_tools
    some tool in input.tools
    tool.id == tool_id
    tool.risk == "critical"
    not tool.requires_human_approval == true
    msg := sprintf("R-002 Violation: Autonomous Agent '%s' has access to critical tool '%s' without human approval.", [agent.id, tool.id])
}

# R-003: PII Exfiltration via External MCP Boundary
# Flags PII-handling agents exposing tools connected to external/untrusted MCP servers
deny[msg] {
    some agent in input.agents
    some tool_id in agent.allowed_tools
    some tool in input.tools
    tool.id == tool_id
    some dc_id in tool.data_classes
    some dc in input.data_classes
    dc.id == dc_id
    dc.classification == "pii"

    some other_tool_id in agent.allowed_tools
    some other_tool in input.tools
    other_tool.id == other_tool_id
    other_tool.source.kind == "mcp"
    some mcp in input.mcp_servers
    mcp.id == other_tool.source.mcp_server
    mcp.trust_level == "external"

    msg := sprintf("R-003 Violation: PII-handling Agent '%s' exposes tool '%s' connected to external MCP server '%s'.", [agent.id, other_tool.id, mcp.id])
}

# R-010: Allow Deny Tool Conflict
# Detects conflicting policy mappings (listing same tool in allowed and denied lists)
deny[msg] {
    some agent in input.agents
    some tool_id in agent.allowed_tools
    some denied_id in agent.denied_tools
    tool_id == denied_id
    msg := sprintf("R-010 Violation: Agent '%s' has conflicting policies; tool '%s' is both allowed and denied.", [agent.id, tool_id])
}

# R-011: Autonomous Side Effect Tool
# Flags autonomous agents possessing access to side-effecting tools (excluding read operations)
deny[msg] {
    some agent in input.agents
    agent.autonomy == "autonomous"
    some tool_id in agent.allowed_tools
    some tool in input.tools
    tool.id == tool_id
    tool.side_effect != "read"
    tool.side_effect != "none"
    msg := sprintf("R-011 Violation: Autonomous Agent '%s' can execute side-effecting tool '%s' (side_effect: %s).", [agent.id, tool.id, tool.side_effect])
}

# R-013: Delegation Cycle
# Detects cyclical delegation chains using reachability traversal
deny[msg] {
    some agent in input.agents
    reachable(agent.id, agent.id)
    msg := sprintf("R-013 Violation: Delegation cycle detected starting/ending at Agent '%s'.", [agent.id])
}

# Helper graph logic to build transitively reachable delegate relationships
reachable(x, y) {
    some agent in input.agents
    agent.id == x
    some y in agent.allowed_delegates
}

reachable(x, y) {
    some agent in input.agents
    agent.id == x
    some z in agent.allowed_delegates
    reachable(z, y)
}

# --- Custom Declarative Policies Compilation ---
`;

  // Translate custom declarative policies into Rego syntax
  const policies = data.policies || [];
  policies.forEach((policy) => {
    if (policy && typeof policy === 'object') {
      const p = policy as DeclarativePolicy;
      const whenAutonomy = p.when?.['agent.autonomy'];
      const whenToolRisk = p.when?.['tool.risk'];
      const reqApproval = p.require?.['tool.requires_human_approval'];
      const reqCost = p.require?.['agent.spend_limit.max_cost_usd'];

      let regoBlock = `\n# Custom Policy [${p.id}] (Severity: ${p.severity})\ndeny[msg] {\n    some agent in input.agents\n`;

      if (whenAutonomy) {
        regoBlock += `    agent.autonomy == "${whenAutonomy}"\n`;
      }

      if (whenToolRisk) {
        regoBlock += `    some tool_id in agent.allowed_tools\n    some tool in input.tools\n    tool.id == tool_id\n    tool.risk == "${whenToolRisk}"\n`;
      }

      if (reqApproval !== undefined) {
        regoBlock += `    not tool.requires_human_approval == ${reqApproval}\n`;
      }

      if (reqCost !== undefined) {
        regoBlock += `    agent.spend_limit.max_cost_usd > ${reqCost}\n`;
      }

      regoBlock += `    msg := sprintf("Custom Policy Violation [${p.id}]: Agent '%s' violates the declarative limits.", [agent.id])\n}\n`;
      rego += regoBlock;
    }
  });

  return rego;
}
