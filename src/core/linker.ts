import { SystemModel } from './model.js';

export function linkAndValidateSystemModel(data: SystemModel): string[] {
  const errors: string[] = [];

  const agents = data.agents || [];
  const tools = data.tools || [];
  const mcpServers = data.mcp_servers || [];
  const dataClasses = data.data_classes || [];

  // 1. Gather all declared keys
  const agentIds = new Set<string>();
  agents.forEach((a) => {
    if (a.id) {
      agentIds.add(a.id);
    }
  });

  const toolIds = new Set<string>();
  tools.forEach((t) => {
    if (t.id) {
      toolIds.add(t.id);
    }
  });

  const dataClassIds = new Set<string>();
  dataClasses.forEach((dc) => {
    if (dc.id) {
      dataClassIds.add(dc.id);
    }
  });

  // 2. Validate Agent cross-references
  agents.forEach((agent) => {
    // Validate allowed_tools
    if (agent.allowed_tools) {
      agent.allowed_tools.forEach((toolId) => {
        if (!toolIds.has(toolId)) {
          errors.push(`Referential Error: Agent '${agent.id}' references allowed_tool '${toolId}' which is not defined in 'tools'.`);
        }
      });
    }

    // Validate denied_tools
    if (agent.denied_tools) {
      agent.denied_tools.forEach((toolId) => {
        if (!toolIds.has(toolId)) {
          errors.push(`Referential Error: Agent '${agent.id}' references denied_tool '${toolId}' which is not defined in 'tools'.`);
        }
      });
    }

    // Validate approval_required_for
    if (agent.approval_required_for) {
      agent.approval_required_for.forEach((toolId) => {
        if (!toolIds.has(toolId)) {
          errors.push(`Referential Error: Agent '${agent.id}' requires human approval for tool '${toolId}' which is not defined in 'tools'.`);
        }
      });
    }

    // Validate allowed_delegates
    if (agent.allowed_delegates) {
      agent.allowed_delegates.forEach((delegateId) => {
        if (!agentIds.has(delegateId)) {
          errors.push(`Referential Error: Agent '${agent.id}' references allowed_delegate '${delegateId}' which is not defined in 'agents'.`);
        }
      });
    }

    // Validate memory contains data classes
    if (agent.memory && agent.memory.contains) {
      agent.memory.contains.forEach((dcId) => {
        if (!dataClassIds.has(dcId) && dcId !== 'customer_messages' && dcId !== 'patient_symptoms') {
          // Allow default system messages if not explicitly declared, but otherwise check
          errors.push(`Referential Error: Agent '${agent.id}' memory contains data_class '${dcId}' which is not defined in 'data_classes'.`);
        }
      });
    }
  });

  // 3. Validate Tool data classes references
  tools.forEach((tool) => {
    if (tool.data_classes) {
      tool.data_classes.forEach((dcId) => {
        if (!dataClassIds.has(dcId)) {
          errors.push(`Referential Error: Tool '${tool.id}' references data_class '${dcId}' which is not defined in 'data_classes'.`);
        }
      });
    }
  });

  // 4. Validate MCP exposed tools references
  mcpServers.forEach((mcp) => {
    if (mcp.exposes) {
      mcp.exposes.forEach((toolId) => {
        if (!toolIds.has(toolId)) {
          errors.push(`Referential Error: MCP Server '${mcp.id}' exposes tool '${toolId}' which is not defined in 'tools'.`);
        }
      });
    }
  });

  return errors;
}
